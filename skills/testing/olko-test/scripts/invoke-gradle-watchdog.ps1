[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$ProjectRoot,
    [Parameter(Mandatory = $true)] [string]$GradleArguments,
    [int]$TimeoutSeconds = 600,
    [int]$TailLines = 80
)

$ErrorActionPreference = "Stop"

$ProjectRoot = [IO.Path]::GetFullPath((Join-Path (Get-Location) $ProjectRoot))

$containerName = "pricepredictor.android-emulator"

# Run a docker command, returning its output (one string per line). Never
# throws on stderr under $ErrorActionPreference="Stop" (PS 5.1 treats native
# stderr as a terminating error). Check $LASTEXITCODE after calling.
function Invoke-Docker {
    $localEa = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & docker @args 2>&1
    $ErrorActionPreference = $localEa
}

# ---------------------------------------------------------------------------
# GUARDRAIL (user directive 2026-09-14): container creation is prohibited
# outside the `pricepredictor` Docker Compose stack. The ONLY container for
# Android tests is the `pricepredictor.android-emulator` compose service. No
# build container exists anymore; Gradle
# JVM tests run INSIDE the emulator container itself, which ships JDK 25 +
# Android SDK 35 + a pre-cached Gradle 9.7.1 distribution. This script never
# creates, builds, or starts containers -- the container must already be
# running; otherwise a blocker is thrown.
# ---------------------------------------------------------------------------

function Assert-ComposeContainer {
    param([string]$Name)
    $inCompose = @(Invoke-Docker compose ps -a --format "{{.Name}}" 2>$null) |
        Where-Object { $_ -match "^pricepredictor\." }
    if (-not ($inCompose -contains $Name)) {
        throw "GUARDRAIL VIOLATION: container '$Name' is not part of the pricepredictor Docker Compose stack. Creating containers outside compose is prohibited (user directive 2026-09-14). Start it via the compose stack or report a blocker."
    }
}

# Run a docker command as uid 0 inside the container (the runtime user has no
# passwd entry, so '-u root' fails with 'unable to find user root'; '-u 0'
# works). Used only to bootstrap the shared /opt/workspace directory.
function Invoke-DockerRoot {
    $localEa = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & docker exec -u 0 @args 2>&1
    $ErrorActionPreference = $localEa
}

function Invoke-InContainerDocker {
    param([string[]]$Arguments, [string]$OutputPrefix, [DateTime]$Deadline)

    $remainingMs = [Math]::Min(10000, [Math]::Max(0, ($Deadline - [DateTime]::UtcNow).TotalMilliseconds))
    if ($remainingMs -le 0) { return [pscustomobject]@{ ExitCode = $null; Output = ''; Error = 'Docker read deadline expired' } }
    $process = Start-Process -FilePath docker -ArgumentList $Arguments -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput "$OutputPrefix.stdout" -RedirectStandardError "$OutputPrefix.stderr"
    $null = $process.Handle
    try {
        if (-not $process.WaitForExit([int]$remainingMs)) {
            # Only this read-only Windows client is terminated, never the container workload.
            $process.Kill()
            return [pscustomobject]@{ ExitCode = $null; Output = ''; Error = 'Docker read timed out' }
        }
        return [pscustomobject]@{
            ExitCode = $process.ExitCode
            # PS 5.1 empty reads yield AutomationNull; interpolation, unlike a cast, guarantees a string.
            Output = "$(Get-Content -LiteralPath "$OutputPrefix.stdout" -Raw -ErrorAction SilentlyContinue)"
            Error = "$(Get-Content -LiteralPath "$OutputPrefix.stderr" -Raw -ErrorAction SilentlyContinue)"
        }
    } finally { $process.Dispose() }
}

function New-GradleShellCommand {
    param([Guid]$InvocationId, [string]$Arguments)

    $runDir = "/opt/workspace/olko-gradle-$($InvocationId.ToString('N'))"
    # No pipe/tee: capture the actual Gradle shell status immediately, then publish atomically.
    # Container-local redirection and ignored HUP keep client disconnects out of Gradle's IO.
    # Implicit SDK/JDK downloads are disabled: the container must already ship SDK 35 + JDK 25.
    return ('trap '''' HUP; ./gradlew {0} -Pandroid.builder.sdkDownload=false -Dorg.gradle.java.installations.auto-download=false > {1}/gradle.stdout 2> {1}/gradle.stderr; code=$?; printf ''{2}:%s\n'' $code > {1}/completion.tmp && mv {1}/completion.tmp {1}/completion; exit $code' -f $Arguments, $runDir, $InvocationId.ToString('N'))
}

function Wait-GradleCompletion {
    param($DockerProcess, [string]$Container, [Guid]$InvocationId, [string]$ReportDirectory, [DateTime]$Deadline)

    $id = $InvocationId.ToString('N')
    $runDir = "/opt/workspace/olko-gradle-$id"
    $transportReported = $false
    $lastOutput = $null
    while ((Get-Date).ToUniversalTime() -lt $Deadline) {
        if ($DockerProcess.HasExited -and -not $transportReported) {
            Write-Host "DOCKER_TRANSPORT_EXIT: exit=$($DockerProcess.ExitCode); awaiting container completion (not a Gradle result)."
            $transportReported = $true
        }
        $probe = Invoke-InContainerDocker -Arguments @('exec', $Container, 'sh', '-c',
            "`"if [ -f $runDir/completion ]; then cat $runDir/completion; else tail -n 1 $runDir/gradle.stdout; fi`"") `
            -OutputPrefix (Join-Path $ReportDirectory 'probe') -Deadline $Deadline
        $output = "$($probe.Output)".Trim()
        if ($probe.ExitCode -eq 0 -and $output -match "\A${id}:([0-9]{1,3})\z" -and [int]$Matches[1] -le 255) {
            $code = [int]$Matches[1]
            Write-Host "GRADLE_COMPLETED: invocation=$id exit=$code"
            return $code
        }
        if ($probe.ExitCode -ne 0) { $output = "DOCKER_TRANSPORT_READ_FAILED: $($probe.Error)" }
        if ($output -and $output -ne $lastOutput) { Write-Host $output; $lastOutput = $output }
        $sleepMs = [Math]::Min(2000, [Math]::Max(0, ($Deadline - (Get-Date).ToUniversalTime()).TotalMilliseconds))
        if ($sleepMs -gt 0) { Start-Sleep -Milliseconds ([int]$sleepMs) }
    }
    Write-Host "GRADLE_COMPLETION_MISSING: deadline reached; completion unconfirmed. Container workload may still be running; no container stop attempted. Artifacts: ${Container}:$runDir"
    return $null
}

$script:resultCode = 1
$invocationId = [Guid]::NewGuid()
$reportDir = Join-Path ([IO.Path]::GetTempPath()) "olko-gradle-$($invocationId.ToString('N'))"
New-Item -ItemType Directory -Path $reportDir | Out-Null
$dockerStdout = Join-Path $reportDir 'docker.stdout'
$dockerStderr = Join-Path $reportDir 'docker.stderr'
$workloadState = 'not-started'
$workspaceDir = $null

try {
    # -----------------------------------------------------------------------
    # 1. Require an already-running emulator container (lifecycle stays
    #    outside this script -- start it via the compose stack / emulator script)
    # -----------------------------------------------------------------------
    Write-Output "=== PHASE 1: Android emulator container ==="

    $containerRunning = @(Invoke-Docker ps --filter "name=$containerName" --filter "status=running" --format "{{.Names}}") | Where-Object { $_ -eq $containerName }

    if ($containerRunning) {
        Write-Output "ALREADY_RUNNING - reusing existing emulator container"
    } else {
        Assert-ComposeContainer $containerName
        throw "GUARDRAIL BLOCKER: emulator container '$containerName' exists in the compose stack but is NOT running. Start it via the compose stack (scripts/tests/android-emulator.ps1 start) -- container lifecycle changes from this script are prohibited (user directive 2026-09-14)."
    }

    # -----------------------------------------------------------------------
    # 2. Verify in-container prerequisites (no installation, ever)
    # -----------------------------------------------------------------------
    Write-Output "=== PHASE 2: prerequisites inside $containerName ==="

    $javaVersion = @(Invoke-Docker exec $containerName java -version)
    if ($LASTEXITCODE -ne 0 -or ($javaVersion -join "`n") -notmatch '(?:openjdk|java) version "25(?:[.+-]|")') {
        throw "BLOCKER: container '$containerName' must already ship JDK 25 (java -version must report version 25). No toolchain installation is attempted. Found: $($javaVersion -join ' ')"
    }
    Write-Output "JDK 25 OK"

    $platforms = @(Invoke-Docker exec $containerName ls /opt/android/platforms)
    if ($LASTEXITCODE -ne 0 -or -not ($platforms -contains "android-35")) {
        throw "BLOCKER: container '$containerName' must already ship Android SDK platform android-35 under /opt/android/platforms. No SDK installation is attempted. Found: $($platforms -join ' ')"
    }
    Write-Output "SDK android-35 OK"

    $distros = @(Invoke-Docker exec $containerName ls /opt/gradle-home/wrapper/dists)
    if ($LASTEXITCODE -ne 0 -or -not (@($distros) | Where-Object { $_ -match "^gradle-9\.7\.1-bin" })) {
        throw "BLOCKER: container '$containerName' must already have the Gradle wrapper distribution gradle-9.7.1-bin cached under /opt/gradle-home/wrapper/dists. No Gradle download is attempted. Found: $($distros -join ' ')"
    }
    Write-Output "Gradle 9.7.1 dist cache OK"

    # -----------------------------------------------------------------------
    # 3. Workspace copy into the emulator container (dodges 9p stale-cache
    #    on the bind mount; mirrors invoke-instrumentation-watchdog.ps1)
    # -----------------------------------------------------------------------
    Write-Output "=== PHASE 3: workspace copy into emulator container ==="
    # A later invocation must not delete the workspace of a surviving timed-out run.
    $workspaceDir = "/opt/workspace/olko-gradle-$($invocationId.ToString('N'))"
    $projectDirName = Split-Path -Leaf $ProjectRoot
    $tarPath = Join-Path $reportDir "$projectDirName.tar"

    # /opt/workspace may not exist on a freshly recreated container, and the
    # runtime user (uid 1300, no passwd entry) cannot create it. Bootstrap it
    # once via uid 0; ownership goes to the runtime user. Existing directory
    # is left untouched.
    Invoke-DockerRoot $containerName sh -c "mkdir -p /opt/workspace; chown 1300:1301 /opt/workspace" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to ensure /opt/workspace exists in $containerName" }

    # Windows bsdtar quirk: exclude patterns AFTER the member name are treated
    # as extra operands ("Couldn't visit directory"); put them BEFORE it.
    $tarArgs = @('-cf', $tarPath, '-C', (Split-Path -Parent $ProjectRoot),
        "--exclude=$projectDirName/app/build",
        "--exclude=$projectDirName/build",
        "--exclude=$projectDirName/.gradle",
        "--exclude=$projectDirName/local.properties",
        $projectDirName)
    & tar @tarArgs
    if ($LASTEXITCODE -ne 0) { throw "Failed to tar project: $ProjectRoot" }
    Invoke-Docker exec $containerName mkdir -p $workspaceDir | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to create workspace dir in $containerName" }
    Invoke-Docker cp $tarPath "${containerName}:${workspaceDir}/" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to docker cp project tar into $containerName" }
    Remove-Item -LiteralPath $tarPath -Force -ErrorAction SilentlyContinue
    Invoke-Docker exec $containerName tar -xf "$workspaceDir/$projectDirName.tar" -C $workspaceDir | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to extract project tar in $containerName" }
    Invoke-Docker exec $containerName rm "$workspaceDir/$projectDirName.tar" | Out-Null
    Invoke-Docker exec $containerName chmod +x "$workspaceDir/$projectDirName/gradlew" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to make Gradle wrapper executable' }
    Write-Output "Project copied to ${containerName}:${workspaceDir}/${projectDirName}"

    # -----------------------------------------------------------------------
    # 4. Run Gradle INSIDE the emulator container with watchdog
    # -----------------------------------------------------------------------
    Write-Output "=== PHASE 4: gradle $GradleArguments (in $containerName) ==="
    $shellCommand = New-GradleShellCommand -InvocationId $invocationId -Arguments $GradleArguments
    # Start-Process joins arguments on Windows; quote the workdir and the whole sh program.
    # The program contains no double quotes, and only a generated GUID is interpolated.
    $dockerArgs = @('exec', '-e', 'ANDROID_SERIAL=emulator-5554', '-w', "`"$workspaceDir/$projectDirName`"",
        $containerName, 'sh', '-c', "`"$shellCommand`"")

    $testStartedUtc = [DateTime]::UtcNow
    $workloadState = 'completion-unconfirmed-may-still-be-running'
    $dockerProc = Start-Process -FilePath "docker" `
        -ArgumentList $dockerArgs `
        -RedirectStandardOutput $dockerStdout -RedirectStandardError $dockerStderr `
        -PassThru -WindowStyle Hidden

    # Retain the process handle so PowerShell 5.1 preserves ExitCode after polling.
    $null = $dockerProc.Handle

    $deadline = $testStartedUtc.AddSeconds($TimeoutSeconds)
    $gradleExitCode = Wait-GradleCompletion -DockerProcess $dockerProc -Container $containerName `
        -InvocationId $invocationId -ReportDirectory $reportDir -Deadline $deadline
    $gradleFailed = $null -eq $gradleExitCode -or $gradleExitCode -ne 0
    if ($null -ne $gradleExitCode) {
        $workloadState = 'completed'
        if ($gradleExitCode -ne 0) { Write-Output "GRADLE_FAILED: actual container Gradle exit=$gradleExitCode" }
    }

    # Diagnostics have their own bounded budget; no unbounded WaitForExit or daemon stop.
    $diagnosticDeadline = [DateTime]::UtcNow.AddSeconds(30)
    foreach ($artifact in @('gradle.stdout', 'gradle.stderr', 'completion')) {
        $copy = Invoke-InContainerDocker -Arguments @('cp', "${containerName}:$workspaceDir/$artifact", "`"$reportDir`"") `
            -OutputPrefix (Join-Path $reportDir "copy-$artifact") -Deadline $diagnosticDeadline
        if ($copy.ExitCode -ne 0) { Write-Output "DIAGNOSTIC_COPY_FAILED: $artifact $($copy.Error)" }
    }
    Write-Output "--- Gradle stdout (container log; may be partial without completion) ---"
    Get-Content -LiteralPath (Join-Path $reportDir 'gradle.stdout') -ErrorAction SilentlyContinue
    Write-Output "--- Gradle stderr / Docker transport stderr ---"
    Get-Content -LiteralPath (Join-Path $reportDir 'gradle.stderr'),$dockerStderr -ErrorAction SilentlyContinue

    # -----------------------------------------------------------------------
    # 5. Guard against stale results: a fresh run must have produced output.
    # -----------------------------------------------------------------------
    $stdoutFile = Join-Path $reportDir 'gradle.stdout'
    $stdoutItem = Get-Item -LiteralPath $stdoutFile -ErrorAction SilentlyContinue
    if ($null -eq $gradleExitCode) {
        Write-Output 'GRADLE_RESULTS_NOT_FINAL: not declaring pass while completion is unconfirmed.'
    } elseif ($null -eq $stdoutItem -or $stdoutItem.LastWriteTimeUtc -lt $testStartedUtc -or $stdoutItem.Length -le 0) {
        Write-Output 'GRADLE_OUTPUT_MISSING: no fresh container stdout; refusing to report a pass.'
        $gradleFailed = $true
    }

    Write-Output ""
    if ($gradleFailed) {
        Write-Output "=== RESULT: FAILED ==="
        $script:resultCode = 1
    } else {
        Write-Output "=== RESULT: PASSED ==="
        $script:resultCode = 0
    }

    exit $script:resultCode
}
catch {
    # Any unexpected error (e.g. docker stderr mis-handling) must mark the run FAILED,
    # never a silent pass.
    Write-Output "=== RESULT: FAILED (exception) ==="
    Write-Output $_.Exception.Message
    Write-Output "ERROR_SOURCE: $($_.InvocationInfo.PositionMessage)"
    Write-Output "ERROR_STACK: $($_.ScriptStackTrace)"
    $script:resultCode = 1
    exit 1
}
finally {
    if ($dockerProc) { $dockerProc.Dispose() }
    Write-Output "Container left unchanged. Workload state: $workloadState"
    if ($script:resultCode -eq 0) {
        Remove-Item -LiteralPath $reportDir -Recurse -Force -ErrorAction SilentlyContinue
    } else {
        Write-Output "Diagnostics preserved: $reportDir"
        if ($workspaceDir) { Write-Output "Container artifacts preserved: ${containerName}:$workspaceDir" }
    }

    $resultText = if ($script:resultCode -eq 0) { "passed" } else { "failed" }
    Write-Output ""
    if ($workloadState -eq 'completion-unconfirmed-may-still-be-running') {
        Write-Output "[OLKO-TEST-INCOMPLETE] result=$resultText exit=$script:resultCode workload=$workloadState"
    } else {
        Write-Output "[OLKO-TEST-DONE] result=$resultText exit=$script:resultCode workload=$workloadState"
    }
}