[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$ProjectRoot,
    [int]$BootTimeoutSeconds = 120,
    [ValidateRange(1, 2147483647)] [int]$TestTimeoutSeconds = 600,
    [int]$TailLines = 120,
    [string[]]$GradleProperties = @()
)

$ErrorActionPreference = "Stop"

# ---------------------------------------------------------------------------
# 0. Verify prerequisites
# ---------------------------------------------------------------------------
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path (Get-Location) $ProjectRoot))

if (-not $env:ANDROID_HOME) { throw "ANDROID_HOME environment variable is not set." }
$adbPath = "$env:ANDROID_HOME\platform-tools\adb.exe"
foreach ($p in @($adbPath)) {
    if (-not (Test-Path -LiteralPath $p)) { throw "Required file not found: $p" }
}

$emuContainer = "pricepredictor.android-emulator"

# Run a docker command, returning its output (one string per line). Never
# throws on stderr under $ErrorActionPreference="Stop" (PS 5.1 treats native
# stderr as a terminating error). Check $LASTEXITCODE after calling.
function Invoke-Docker {
    $localEa = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & docker @args 2>&1
    $ErrorActionPreference = $localEa
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

function Invoke-Adb {
    $local:ea = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $adbPath @args 2>&1
    $ErrorActionPreference = $local:ea
}

function New-InstrumentationShellCommand {
    param([Guid]$InvocationId, [string[]]$GradleProperties = @())

    $runDir = "/opt/workspace/olko-instrumentation-$($InvocationId.ToString('N'))"
    # Optional caller-supplied gradle properties (array or comma-separated). Each
    # entry must be -P<key>=<shell-safe value>; anything else fails loudly rather
    # than being silently dropped or breaking the container quoting below.
    $gradleArguments = @()
    foreach ($entry in @($GradleProperties)) {
        foreach ($property in @("$entry" -split ',')) {
            if ($property -notmatch '^-P[A-Za-z0-9_.-]+=[A-Za-z0-9_:./@+-]+$') {
                throw "Invalid GradleProperties entry (expected -P<key>=<value>): $property"
            }
            $gradleArguments += $property
        }
    }
    # No pipe/tee: capture the actual Gradle shell status immediately, then publish atomically.
    # Container-local redirection and ignored HUP keep client disconnects out of Gradle's IO.
    $extraArguments = if ($gradleArguments.Count -gt 0) { ' ' + ($gradleArguments -join ' ') } else { '' }
    return ('trap '''' HUP; ./gradlew :app:connectedDebugAndroidTest --console=plain --no-configuration-cache --max-workers=1 -Pandroid.builder.sdkDownload=false -Dorg.gradle.java.installations.auto-download=false{2} > {0}/gradle.stdout 2> {0}/gradle.stderr; code=$?; printf ''{1}:%s\n'' $code > {0}/completion.tmp && mv {0}/completion.tmp {0}/completion; exit $code' -f $runDir, $InvocationId.ToString('N'), $extraArguments)
}

function Invoke-InstrumentationDocker {
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

function Wait-InstrumentationCompletion {
    param($DockerProcess, [string]$Container, [Guid]$InvocationId, [string]$ReportDirectory, [DateTime]$Deadline)

    $id = $InvocationId.ToString('N')
    $runDir = "/opt/workspace/olko-instrumentation-$id"
    $transportReported = $false
    $lastOutput = $null
    while ((Get-Date).ToUniversalTime() -lt $Deadline) {
        if ($DockerProcess.HasExited -and -not $transportReported) {
            Write-Host "DOCKER_TRANSPORT_EXIT: exit=$($DockerProcess.ExitCode); awaiting container completion (not a Gradle result)."
            $transportReported = $true
        }
        $probe = Invoke-InstrumentationDocker -Arguments @('exec', $Container, 'sh', '-c',
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
    Write-Host "GRADLE_COMPLETION_MISSING: deadline reached; completion unconfirmed. Container workload may still be running; no Gradle/container stop attempted. Artifacts: ${Container}:$runDir"
    return $null
}

function Test-InstrumentationResults {
    param([string]$ResultsDirectory, [DateTime]$StartedUtc)

    $xmlFiles = @(Get-ChildItem -LiteralPath $ResultsDirectory -Filter "TEST-*.xml" -Recurse)
    $exitFile = Join-Path $ResultsDirectory "test-result-exit-code.txt"
    if ($xmlFiles.Count -eq 0 -or -not (Test-Path -LiteralPath $exitFile)) {
        throw "Instrumentation results are missing; refusing to report a pass."
    }

    foreach ($file in @($xmlFiles) + @(Get-Item -LiteralPath $exitFile)) {
        if ($file.LastWriteTimeUtc -lt $StartedUtc) {
            throw "Stale instrumentation result: $($file.Name)"
        }
    }
    $passed = "$(Get-Content -LiteralPath $exitFile -Raw)".Trim() -eq "0"
    foreach ($xml in $xmlFiles) {
        [xml]$doc = Get-Content -LiteralPath $xml.FullName -Raw
        if ($doc.DocumentElement.Name -notin @("testsuite", "testsuites") -or
            [int]$doc.DocumentElement.GetAttribute("tests") -le 0) {
            throw "Invalid or empty instrumentation result: $($xml.Name)"
        }
        if ($doc.SelectNodes("//testcase[failure or error or skipped]").Count -gt 0) { $passed = $false }
        foreach ($suite in $doc.SelectNodes("//testsuite | //testsuites")) {
            if ([int]$suite.GetAttribute("failures") -gt 0 -or
                [int]$suite.GetAttribute("errors") -gt 0 -or
                [int]$suite.GetAttribute("skipped") -gt 0) {
                $passed = $false
            }
        }
    }
    return $passed
}

$script:resultCode = 1
$invocationId = [Guid]::NewGuid()
$reportDir = Join-Path ([IO.Path]::GetTempPath()) "olko-instrumentation-$($invocationId.ToString('N'))"
New-Item -ItemType Directory -Path $reportDir | Out-Null
$testStdout = Join-Path $reportDir 'docker.stdout'
$testStderr = Join-Path $reportDir 'docker.stderr'
$workloadState = 'not-started'

# ---------------------------------------------------------------------------
# GUARDRAIL (user directive 2026-09-14): container creation is prohibited
# outside the `pricepredictor` Docker Compose stack. The ONLY container for
# Android tests is the `pricepredictor.android-emulator` compose service.
# No build container may be created — Gradle instrumentation runs inside the
# emulator container itself (it ships an Android SDK + gradle-capable JDK).
# ---------------------------------------------------------------------------
$composeContainerPrefix = "pricepredictor."

function Assert-ComposeContainer {
    param([string]$Name)
    $inCompose = @(Invoke-Docker compose ps -a --format "{{.Name}}" 2>$null) |
        Where-Object { $_ -match "^${composeContainerPrefix}" }
    if (-not ($inCompose -contains $Name)) {
        throw "GUARDRAIL VIOLATION: container '$Name' is not part of the pricepredictor Docker Compose stack. Creating containers outside compose is prohibited (user directive 2026-09-14). Start it via the compose stack or report a blocker."
    }
}

try {
    # -----------------------------------------------------------------------
    # 1. Require an already-running Android emulator container
    # -----------------------------------------------------------------------
    Write-Output "=== PHASE 1: Android emulator (docker) ==="

    $containerRunning = @(Invoke-Docker ps --filter "name=$emuContainer" --filter "status=running" --format "{{.Names}}") | Where-Object { $_ -eq $emuContainer }

    if ($containerRunning) {
        Write-Output "ALREADY_RUNNING - reusing existing emulator container"
    } else {
        throw "GUARDRAIL BLOCKER: emulator container '$emuContainer' must already be running; lifecycle changes are prohibited."
    }

    # A running container may have a failed emulator process. Check the
    # same container-local device that Gradle will use, on every run.
    $deadline = [DateTime]::UtcNow.AddSeconds($BootTimeoutSeconds)
    $booted = $false
    while (-not $booted -and [DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Seconds 2
        $status = (Invoke-Docker exec $emuContainer adb -s emulator-5554 shell getprop sys.boot_completed) |
            Where-Object { $_ -match "^1$" } | Select-Object -First 1
        if ($status -eq "1") { $booted = $true }
    }

    if (-not $booted) {
        Write-Output "EMULATOR_TIMEOUT: container emulator did not boot within ${BootTimeoutSeconds}s"
        Write-Output "Last emulator container logs:"
        Invoke-Docker logs --tail $TailLines $emuContainer
        $script:resultCode = 1
        exit 1
    }
    Write-Output "BOOTED container=$emuContainer"

    # Check the same Java selection as gradlew, without installing or switching JDKs.
    $containerJavaHome = @(Invoke-Docker exec $emuContainer printenv JAVA_HOME)
    if ($LASTEXITCODE -notin @(0, 1)) { throw 'BLOCKER: cannot read container JAVA_HOME' }
    $javaHome = ($containerJavaHome -join '').Trim()
    $javaExecutable = if ($javaHome) { "$javaHome/bin/java" } else { 'java' }
    $javaVersion = @(Invoke-Docker exec $emuContainer $javaExecutable -version)
    if ($LASTEXITCODE -ne 0 -or ($javaVersion -join "`n") -notmatch '(?:openjdk|java) version "25(?:[.+-]|")') {
        throw "BLOCKER: existing JDK 25 is required; no toolchain installation attempted. $($javaVersion -join ' ')"
    }

    # -----------------------------------------------------------------------
    # 2. NO build container. GUARDRAIL: the ONLY container for Android tests
    # is the `pricepredictor.android-emulator` compose service. Gradle
    # instrumentation runs INSIDE the emulator container (it ships an Android
    # SDK). The project root is docker-cp'd into the emulator container to
    # dodge 9p stale-cache on the bind mount.
    # -----------------------------------------------------------------------
    Write-Output "=== PHASE 2: workspace copy into emulator container ==="
    # A later invocation must not delete the workspace of a surviving timed-out run.
    $workspaceDir = "/opt/workspace/olko-instrumentation-$($invocationId.ToString('N'))"
    $projectDirName = Split-Path -Leaf $ProjectRoot
    $tarPath = Join-Path $reportDir "$projectDirName.tar"
    if (Test-Path -LiteralPath $tarPath) { Remove-Item -LiteralPath $tarPath -Force }
    & tar -cf $tarPath -C (Split-Path -Parent $ProjectRoot) $projectDirName
    if ($LASTEXITCODE -ne 0) { throw "Failed to tar project: $ProjectRoot" }
    # /opt/workspace may not exist on a freshly recreated container, and the
    # runtime user (uid 1300, no passwd entry) cannot create it under root-owned
    # /opt. Bootstrap it once via uid 0; ownership goes to the runtime user.
    # Existing directory is left untouched.
    Invoke-DockerRoot $emuContainer sh -c "mkdir -p /opt/workspace; chown 1300:1301 /opt/workspace" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to ensure /opt/workspace exists in $emuContainer" }
    Invoke-Docker exec $emuContainer mkdir -p $workspaceDir | Out-Null
    Invoke-Docker cp $tarPath "${emuContainer}:${workspaceDir}/" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to docker cp project tar into $emuContainer" }
    Remove-Item -LiteralPath $tarPath -Force -ErrorAction SilentlyContinue
    Invoke-Docker exec $emuContainer tar -xf "$workspaceDir/$projectDirName.tar" -C $workspaceDir | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to extract project tar in $emuContainer" }
    Invoke-Docker exec $emuContainer rm "$workspaceDir/$projectDirName.tar" | Out-Null
    Invoke-Docker exec $emuContainer chmod +x "$workspaceDir/$projectDirName/gradlew" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to make Gradle wrapper executable' }
    # The tar may contain old host results; remove them in the actual run workspace too.
    Invoke-Docker exec $emuContainer rm -rf "$workspaceDir/$projectDirName/app/build/outputs/androidTest-results/connected" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Failed to remove copied instrumentation results' }
    Write-Output "Project copied to ${emuContainer}:${workspaceDir}/${projectDirName}"

    # -----------------------------------------------------------------------
    # 3. Clean stale androidTest output (prevents file-lock failures)
    # -----------------------------------------------------------------------
    Write-Output "=== PHASE 3: Cleanup stale output ==="
    $staleDir = Join-Path $ProjectRoot "app\build\outputs\androidTest-results\connected"
    if (Test-Path -LiteralPath $staleDir) {
        Start-Sleep -Seconds 1
        Remove-Item -LiteralPath $staleDir -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path -LiteralPath $staleDir) {
            cmd /c "rmdir /s /q `"$staleDir`" 2>nul"
        }
        Write-Output "Cleaned: $staleDir"
    }

    # -----------------------------------------------------------------------
    # 3b. The emulator is a local AVD in THIS container: its adb server already
    #     lists it as emulator-5554. Do NOT `adb connect 127.0.0.1:5555` — that
    #     would register the same physical emulator TWICE (emulator-5554 +
    #     127.0.0.1:5555), making Gradle run the whole suite twice
    #     concurrently against one emulator → install/uninstall conflicts →
    #     "Process crashed" / DELETE_FAILED_INTERNAL_ERROR.
    # -----------------------------------------------------------------------
    Write-Output "=== PHASE 3b: adb devices in emulator container ==="
    Invoke-Docker exec $emuContainer bash -lc "adb devices"
    if ($LASTEXITCODE -ne 0) { throw "Failed to list adb devices in $emuContainer" }

    # -----------------------------------------------------------------------
    # 4. Run instrumentation tests INSIDE the emulator container
    # -----------------------------------------------------------------------
    Write-Output "=== PHASE 4: connectedDebugAndroidTest (in $emuContainer) ==="
    $shellCommand = New-InstrumentationShellCommand -InvocationId $invocationId -GradleProperties $GradleProperties
    # Start-Process joins arguments on Windows; quote the workdir and the whole sh program.
    # The program contains no double quotes, and only a generated GUID is interpolated.
    $dockerArgs = @('exec', '-e', 'ANDROID_SERIAL=emulator-5554', '-w', "`"$workspaceDir/$projectDirName`"",
        $emuContainer, 'sh', '-c', "`"$shellCommand`"")

    $testStartedUtc = [DateTime]::UtcNow
    $workloadState = 'completion-unconfirmed-may-still-be-running'
    $dockerProc = Start-Process -FilePath "docker" `
        -ArgumentList $dockerArgs `
        -RedirectStandardOutput $testStdout -RedirectStandardError $testStderr `
        -PassThru -WindowStyle Hidden

    # Retain the process handle so PowerShell 5.1 preserves ExitCode after polling.
    $null = $dockerProc.Handle

    $deadline = $testStartedUtc.AddSeconds($TestTimeoutSeconds)
    $gradleExitCode = Wait-InstrumentationCompletion -DockerProcess $dockerProc -Container $emuContainer `
        -InvocationId $invocationId -ReportDirectory $reportDir -Deadline $deadline
    $testFailed = $null -eq $gradleExitCode -or $gradleExitCode -ne 0
    if ($null -ne $gradleExitCode) {
        $workloadState = 'completed'
        if ($gradleExitCode -ne 0) { Write-Output "GRADLE_FAILED: actual container Gradle exit=$gradleExitCode" }
    }

    # Diagnostics have their own bounded budget; no unbounded WaitForExit or daemon stop.
    $diagnosticDeadline = [DateTime]::UtcNow.AddSeconds(30)
    foreach ($artifact in @('gradle.stdout', 'gradle.stderr', 'completion')) {
        $copy = Invoke-InstrumentationDocker -Arguments @('cp', "${emuContainer}:$workspaceDir/$artifact", "`"$reportDir`"") `
            -OutputPrefix (Join-Path $reportDir "copy-$artifact") -Deadline $diagnosticDeadline
        if ($copy.ExitCode -ne 0) { Write-Output "DIAGNOSTIC_COPY_FAILED: $artifact $($copy.Error)" }
    }
    Write-Output "--- Gradle stdout (container log; may be partial without completion) ---"
    Get-Content -LiteralPath (Join-Path $reportDir 'gradle.stdout') -ErrorAction SilentlyContinue
    Write-Output "--- Gradle stderr / Docker transport stderr ---"
    Get-Content -LiteralPath (Join-Path $reportDir 'gradle.stderr'),$testStderr -ErrorAction SilentlyContinue

    # -----------------------------------------------------------------------
    # 5. Validate fresh results from the actual container workspace.
    # -----------------------------------------------------------------------
    $containerResultsDir = "$workspaceDir/$projectDirName/app/build/outputs/androidTest-results/connected/debug"
    if ($null -ne $gradleExitCode) {
        $copy = Invoke-InstrumentationDocker -Arguments @('cp', "`"${emuContainer}:${containerResultsDir}/.`"", "`"$reportDir`"") `
            -OutputPrefix (Join-Path $reportDir 'copy-results') -Deadline $diagnosticDeadline
        if ($copy.ExitCode -ne 0) {
            Write-Output "INSTRUMENTATION_RESULTS_UNAVAILABLE: retrieval failed: $($copy.Error)"
            $testFailed = $true
        } else {
            try {
                if (-not (Test-InstrumentationResults -ResultsDirectory $reportDir -StartedUtc $testStartedUtc)) {
                    Write-Output 'INSTRUMENTATION_RESULTS_FAILED: XML or AGP exit marker reports failure.'
                    $testFailed = $true
                }
            } catch {
                Write-Output "INSTRUMENTATION_RESULTS_INVALID: $($_.Exception.Message)"
                $testFailed = $true
            }
        }
    } else {
        Write-Output 'INSTRUMENTATION_RESULTS_NOT_FINAL: not snapshotting/validating XML while completion is unconfirmed.'
    }

    if ($testFailed) {
        Write-Output ""
        Write-Output "=== PHASE 5: Error diagnostics ==="

        $xmlFiles = @(Get-ChildItem -LiteralPath $reportDir -Filter "TEST-*.xml" -Recurse)
        $anyFailures = $false
        foreach ($xml in $xmlFiles) {
            [xml]$doc = Get-Content -LiteralPath $xml.FullName -Raw -ErrorAction SilentlyContinue
            if (-not $doc) { continue }
            $suites = @($doc.SelectNodes("//testsuite"))
            foreach ($suite in $suites) {
                $failCount = [int]$suite.GetAttribute("failures")
                $errCount = [int]$suite.GetAttribute("errors")
                if ($failCount -gt 0 -or $errCount -gt 0) {
                    $anyFailures = $true
                    $testCases = @($suite.SelectNodes("testcase"))
                    foreach ($tc in $testCases) {
                        $failureNodes = @($tc.SelectNodes("failure"))
                        $errorNodes = @($tc.SelectNodes("error"))
                        if ($failureNodes.Count -gt 0 -or $errorNodes.Count -gt 0) {
                            $cn = $tc.GetAttribute("classname")
                            $mn = $tc.GetAttribute("name")
                            Write-Output "FAILED: ${cn}.${mn}"
                            foreach ($f in $failureNodes) {
                                $msg = $f.InnerText
                                if ($msg.Length -gt 2000) { $msg = $msg.Substring(0,2000) + "..." }
                                Write-Output $msg
                            }
                            foreach ($e in $errorNodes) {
                                $msg = $e.InnerText
                                if ($msg.Length -gt 2000) { $msg = $msg.Substring(0,2000) + "..." }
                                Write-Output $msg
                            }
                            Write-Output ""
                        }
                    }
                }
            }
        }

        if (-not $anyFailures -and $xmlFiles.Count -eq 0) {
            Write-Output "No final XML test results available; this does not establish a test or build failure."
            Write-Output "Check Gradle output above for details."
        } elseif (-not $anyFailures) {
            Write-Output "No individual test failures found in XML - build or infrastructure error."
        }
    }

    Write-Output ""
    if ($testFailed) {
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
        if ($workspaceDir) { Write-Output "Container artifacts preserved: ${emuContainer}:$workspaceDir" }
    }

    $resultText = if ($script:resultCode -eq 0) { "passed" } else { "failed" }
    Write-Output ""
    if ($workloadState -eq 'completion-unconfirmed-may-still-be-running') {
        Write-Output "[OLKO-TEST-INCOMPLETE] result=$resultText exit=$script:resultCode workload=$workloadState"
    } else {
        Write-Output "[OLKO-TEST-DONE] result=$resultText exit=$script:resultCode workload=$workloadState"
    }
}
