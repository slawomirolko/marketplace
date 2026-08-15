[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)] [string]$ProjectRoot,
    [Parameter(Mandatory = $true)] [string]$GradleArguments,
    [int]$TimeoutSeconds = 600,
    [int]$TailLines = 80
)

$ErrorActionPreference = "Stop"

$ProjectRoot = [IO.Path]::GetFullPath((Join-Path (Get-Location) $ProjectRoot))

$imageName = "pricepredictor.mobile-build:latest"
$containerName = "pricepredictor.mobile-build"

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
# 0. Verify prerequisites
# ---------------------------------------------------------------------------
$dockerfile = Join-Path $ProjectRoot "docker\android-build.Dockerfile"
if (-not (Test-Path -LiteralPath $dockerfile)) { throw "Build Dockerfile not found: $dockerfile" }

$stdout = [IO.Path]::GetTempFileName()
$stderr = [IO.Path]::GetTempFileName()
$weStartedContainer = $false

try {
    # -----------------------------------------------------------------------
    # 1. Ensure build image + container exist
    # -----------------------------------------------------------------------
    Write-Output "=== PHASE 1: Android build container ==="
    Invoke-Docker image inspect $imageName --format "{{.Id}}" | Out-Null
    $imageExists = ($LASTEXITCODE -eq 0)
    if (-not $imageExists) {
        Write-Output "Building image $imageName (JDK17 + Android SDK 35)..."
        Invoke-Docker build -t $imageName -f $dockerfile $ProjectRoot | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Docker image build failed: $imageName" }
    }

    $container = @(Invoke-Docker ps -a --filter "name=$containerName" --format "{{.Names}}") | Where-Object { $_ -eq $containerName }
    $containerRunning = @(Invoke-Docker ps --filter "name=$containerName" --filter "status=running" --format "{{.Names}}") | Where-Object { $_ -eq $containerName }

    if ($containerRunning) {
        Write-Output "ALREADY_RUNNING - reusing existing build container"
    } else {
        Write-Output "Starting build container (network_mode: host for emulator adb access)..."
        if ($container) { Invoke-Docker rm -f $containerName | Out-Null }
        Invoke-Docker run -d --name $containerName --network host -v "${ProjectRoot}:/workspace:rw" $imageName sleep infinity | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Failed to start build container: $containerName" }
        $weStartedContainer = $true
    }

    # -----------------------------------------------------------------------
    # 2. Run Gradle inside the container with watchdog
    # -----------------------------------------------------------------------
    Write-Output "=== PHASE 2: gradle $GradleArguments ==="
    $commandLine = "docker exec -w /workspace $containerName ./gradlew $GradleArguments"
    $dockerArgs = @("exec","-w","/workspace",$containerName,"./gradlew") + @($GradleArguments)

    $dockerProc = Start-Process -FilePath "docker" `
        -ArgumentList $dockerArgs `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr `
        -PassThru -WindowStyle Hidden

    $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
    $lastLine = $null
    while (-not $dockerProc.HasExited -and [DateTime]::UtcNow -lt $deadline) {
        $line = Get-Content -LiteralPath $stdout -Tail 1 -ErrorAction SilentlyContinue
        if ($line -and $line -ne $lastLine) { Write-Output $line; $lastLine = $line }
        Start-Sleep -Seconds 1
    }

    $timedOut = $false
    if (-not $dockerProc.HasExited) {
        Write-Output "Gradle watchdog timeout after ${TimeoutSeconds}s: $commandLine"
        taskkill.exe /PID $dockerProc.Id /T /F | Out-Null
        $timedOut = $true
    }

    $dockerProc.WaitForExit()
    Get-Content -LiteralPath $stdout -ErrorAction SilentlyContinue
    if ((Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue) -match '\S') {
        Write-Output "--- stderr ---"
        Get-Content -LiteralPath $stderr -ErrorAction SilentlyContinue
    }

    if ($timedOut) { exit 124 }
    $result = Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue
    $resultErr = Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue
    if ($dockerProc.ExitCode -ne 0 -or $result -match "BUILD FAILED|FAILURE: Build failed" -or $resultErr -match "BUILD FAILED|FAILURE: Build failed") { exit 1 }
    exit 0
}
catch {
    Write-Output "=== RESULT: FAILED (exception) ==="
    Write-Output $_.Exception.Message
    exit 1
}
finally {
    if ($weStartedContainer) {
        Write-Output "=== PHASE 3: Stopping build container (we started it) ==="
        try { Invoke-Docker rm -f $containerName | Out-Null } catch {}
    }
    Remove-Item -LiteralPath $stdout,$stderr -Force -ErrorAction SilentlyContinue
}
