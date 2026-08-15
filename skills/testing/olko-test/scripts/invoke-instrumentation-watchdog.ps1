[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$ProjectRoot,
    [int]$BootTimeoutSeconds = 120,
    [int]$TestTimeoutSeconds = 600,
    [int]$TailLines = 120
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

$dockerfile = Join-Path $ProjectRoot "docker\android-build.Dockerfile"
if (-not (Test-Path -LiteralPath $dockerfile)) { throw "Build Dockerfile not found: $dockerfile" }

$imageName = "pricepredictor.mobile-build:latest"
$buildContainer = "pricepredictor.mobile-build"
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

function Invoke-Adb {
    $local:ea = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $adbPath @args 2>&1
    $ErrorActionPreference = $local:ea
}

$weStartedEmuContainer = $false
$weStartedBuildContainer = $false
$script:resultCode = 0
$testStdout = [IO.Path]::GetTempFileName()
$testStderr = [IO.Path]::GetTempFileName()
$emuLog = [IO.Path]::GetTempFileName()
$emuErrLog = $emuLog + ".err"

try {
    # -----------------------------------------------------------------------
    # 1. Start Android emulator container (or detect already-running)
    # -----------------------------------------------------------------------
    Write-Output "=== PHASE 1: Android emulator (docker) ==="

    $container = @(Invoke-Docker ps -a --filter "name=$emuContainer" --format "{{.Names}}") | Where-Object { $_ -eq $emuContainer }
    $containerRunning = @(Invoke-Docker ps --filter "name=$emuContainer" --filter "status=running" --format "{{.Names}}") | Where-Object { $_ -eq $emuContainer }

    if ($containerRunning) {
        Write-Output "ALREADY_RUNNING - reusing existing emulator container"
    } else {
        if ($container) {
            Write-Output "Starting existing emulator container (was stopped)..."
            Invoke-Docker start $emuContainer | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Failed to start emulator container: $emuContainer" }
            $weStartedEmuContainer = $true
        } else {
            Write-Output "Starting emulator container via compose..."
            Invoke-Docker compose up -d android-emulator | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Failed to start emulator container: $emuContainer" }
            $weStartedEmuContainer = $true
        }

        $deadline = [DateTime]::UtcNow.AddSeconds($BootTimeoutSeconds)
        $booted = $false
        while (-not $booted -and [DateTime]::UtcNow -lt $deadline) {
            Start-Sleep -Seconds 2
            $status = (Invoke-Adb shell getprop sys.boot_completed) |
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
    }

    # Connect the host adb server to the containerized emulator (a container
    # cannot register itself with the host adb server the way a local emulator does).
    Invoke-Adb connect 127.0.0.1:5555 | Out-Null

    # -----------------------------------------------------------------------
    # 2. Ensure build container (network_mode: host -> reaches emulator on 127.0.0.1:5555)
    # -----------------------------------------------------------------------
    Write-Output "=== PHASE 2: Android build container ==="
    Invoke-Docker image inspect $imageName --format "{{.Id}}" | Out-Null
    $imageExists = ($LASTEXITCODE -eq 0)
    if (-not $imageExists) {
        Write-Output "Building image $imageName (JDK17 + Android SDK 35)..."
        Invoke-Docker build -t $imageName -f $dockerfile $ProjectRoot | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Docker image build failed: $imageName" }
    }

    $buildExists = @(Invoke-Docker ps -a --filter "name=$buildContainer" --format "{{.Names}}") | Where-Object { $_ -eq $buildContainer }
    $buildRunning = @(Invoke-Docker ps --filter "name=$buildContainer" --filter "status=running" --format "{{.Names}}") | Where-Object { $_ -eq $buildContainer }

    if ($buildRunning) {
        Write-Output "ALREADY_RUNNING - reusing existing build container"
    } else {
        Write-Output "Starting build container..."
        if ($buildExists) { Invoke-Docker rm -f $buildContainer | Out-Null }
        Invoke-Docker run -d --name $buildContainer --network host -v "${ProjectRoot}:/workspace:rw" $imageName sleep infinity | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Failed to start build container: $buildContainer" }
        $weStartedBuildContainer = $true
    }

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
    # 3b. Connect the build container's adb to the emulator (host network,
    #     but each container runs its own adb server)
    # -----------------------------------------------------------------------
    Write-Output "=== PHASE 3b: adb connect in build container ==="
    Invoke-Docker exec $buildContainer bash -lc "adb connect 127.0.0.1:5555" | Out-Null
    Invoke-Docker exec $buildContainer bash -lc "adb devices"
    if ($LASTEXITCODE -ne 0) { throw "Failed to connect adb in build container" }

    # -----------------------------------------------------------------------
    # 4. Run instrumentation tests in the build container (host network reaches emulator)
    # -----------------------------------------------------------------------
    Write-Output "=== PHASE 4: connectedDebugAndroidTest (in $buildContainer) ==="
    $gradleArgs = ':app:connectedDebugAndroidTest --console=plain --no-configuration-cache --max-workers=1'
    $dockerArgs = @("exec","-w","/workspace",$buildContainer,"./gradlew") + @($gradleArgs)

    $dockerProc = Start-Process -FilePath "docker" `
        -ArgumentList $dockerArgs `
        -RedirectStandardOutput $testStdout -RedirectStandardError $testStderr `
        -PassThru -WindowStyle Hidden

    $deadline = [DateTime]::UtcNow.AddSeconds($TestTimeoutSeconds)
    $lastLine = $null
    while (-not $dockerProc.HasExited -and [DateTime]::UtcNow -lt $deadline) {
        $line = Get-Content -LiteralPath $testStdout -Tail 1 -ErrorAction SilentlyContinue
        if ($line -and $line -ne $lastLine) { Write-Output $line; $lastLine = $line }
        Start-Sleep -Seconds 2
    }

    $testFailed = $false

    if (-not $dockerProc.HasExited) {
        Write-Output "GRADLE_TIMEOUT: connectedDebugAndroidTest did not finish within ${TestTimeoutSeconds}s"
        taskkill.exe /PID $dockerProc.Id /T /F | Out-Null
        Invoke-Docker exec $buildContainer ./gradlew --stop | Out-Null
        $testFailed = $true
    }

    $dockerProc.WaitForExit()
    $fullStdout = Get-Content -LiteralPath $testStdout -Raw -ErrorAction SilentlyContinue
    $fullStderr = Get-Content -LiteralPath $testStderr -Raw -ErrorAction SilentlyContinue

    Write-Output "--- Gradle stdout ---"
    Get-Content -LiteralPath $testStdout -ErrorAction SilentlyContinue
    if ($fullStderr -match '\S') {
        Write-Output "--- Gradle stderr ---"
        Get-Content -LiteralPath $testStderr -ErrorAction SilentlyContinue
    }

    if ($fullStdout -match "BUILD FAILED|FAILURE: Build failed" `
        -or $fullStderr -match "BUILD FAILED|FAILURE: Build failed" `
        -or $dockerProc.ExitCode -ne 0 -or $testFailed) {
        $testFailed = $true
    }

    # -----------------------------------------------------------------------
    # 5. Dump test failure details (XML results, bind-mounted on the host)
    # -----------------------------------------------------------------------
    if ($testFailed) {
        Write-Output ""
        Write-Output "=== PHASE 5: Error diagnostics ==="

        $resultsDir = Join-Path $ProjectRoot "app\build\outputs\androidTest-results\connected"
        $xmlFiles = @()
        if (Test-Path -LiteralPath $resultsDir) {
            $xmlFiles = Get-ChildItem -Path $resultsDir -Filter "*.xml" -Recurse -ErrorAction SilentlyContinue
        }

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
            Write-Output "No XML test results found - likely a build/install error, not a test failure."
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
    $script:resultCode = 1
    exit 1
}
finally {
    # -----------------------------------------------------------------------
    # 6. Stop containers we started (always - even on failure)
    # -----------------------------------------------------------------------
    if ($weStartedBuildContainer) {
        Write-Output "=== PHASE 6: Stopping build container (we started it) ==="
        try { Invoke-Docker rm -f $buildContainer | Out-Null } catch {}
    } else {
        Write-Output "=== PHASE 6: Build container was already running - leaving it alive ==="
    }

    if ($weStartedEmuContainer) {
        Write-Output "=== PHASE 6: Stopping emulator container (we started it) ==="
        try { Invoke-Docker stop $emuContainer | Out-Null } catch {}
        try { Invoke-Docker rm $emuContainer | Out-Null } catch {}
    } else {
        Write-Output "=== PHASE 6: Emulator container was already running - leaving it alive ==="
    }

    Remove-Item -LiteralPath $testStdout,$testStderr,$emuLog,$emuErrLog -Force -ErrorAction SilentlyContinue

    $resultText = if ($script:resultCode -eq 0) { "passed" } else { "failed" }
    Write-Output ""
    Write-Output "[OLKO-TEST-DONE] result=$resultText exit=$script:resultCode"
}
