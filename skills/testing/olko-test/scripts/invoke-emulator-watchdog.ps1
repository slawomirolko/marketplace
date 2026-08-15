[CmdletBinding()]
param(
    [string]$AvdName,
    [int]$BootTimeoutSeconds = 120,
    [string]$StateFile = (Join-Path $env:TEMP "olko-test-emulator.json"),
    [int]$TailLines = 40
)

$ErrorActionPreference = "Stop"

if (-not $env:ANDROID_HOME) { throw "ANDROID_HOME environment variable is not set." }
$emuPath = "$env:ANDROID_HOME\emulator\emulator.exe"
$adbPath = "$env:ANDROID_HOME\platform-tools\adb.exe"
if (-not (Test-Path -LiteralPath $emuPath)) { throw "Emulator executable not found at $emuPath." }
if (-not (Test-Path -LiteralPath $adbPath)) { throw "adb executable not found at $adbPath." }

# Auto-discover AVD when not supplied so the agent can call this script in one shot
# without a separate list-AVDs pre-flight call (which is a state-loss trap between calls).
if (-not $AvdName) {
    $avds = & $emuPath -list-avds 2>$null | Where-Object { $_ -match '\S' }
    if (-not $avds) {
        Write-Output "NO_AVD: no Android emulator AVD found. Create one in Android Studio AVD Manager."
        exit 2
    }
    $AvdName = $avds | Select-Object -First 1
    Write-Output "AVD_DISCOVERED: $AvdName"
}

function Invoke-Adb {
    $local:ea = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $adbPath @args 2>&1
    $ErrorActionPreference = $local:ea
}

$alreadyRunning = ((Invoke-Adb devices) | Select-String "emulator.*device$").Count -gt 0
if ($alreadyRunning) {
    Write-Output "ALREADY_RUNNING"
    exit 0
}

$emuLog = [IO.Path]::GetTempFileName()
$process = Start-Process -FilePath $emuPath `
    -ArgumentList "-avd","$AvdName","-no-window","-no-audio","-gpu","swiftshader_indirect" `
    -RedirectStandardOutput $emuLog -RedirectStandardError "$emuLog.err" `
    -PassThru -WindowStyle Hidden

$pid_ = $process.Id
@{ started = $true; pid = $pid_ } | ConvertTo-Json -Compress | Set-Content -LiteralPath $StateFile -NoNewline

try {
    $deadline = [DateTime]::UtcNow.AddSeconds($BootTimeoutSeconds)
    $waited = $false
    while (-not $waited -and [DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Seconds 2
        $status = (Invoke-Adb shell getprop sys.boot_completed) | Where-Object { $_ -match "^1$" } | Select-Object -First 1
        if ($status -eq "1") { $waited = $true }
    }
    if (-not $waited) {
        Write-Output "TIMEOUT: emulator did not boot within ${BootTimeoutSeconds}s"
        Write-Output "Last emulator output:"
        Get-Content -LiteralPath $emuLog -Tail $TailLines -ErrorAction SilentlyContinue
        exit 1
    }
    Write-Output "BOOTED pid=$pid_"
    exit 0
}
finally {
    Remove-Item -LiteralPath $emuLog,"$emuLog.err" -Force -ErrorAction SilentlyContinue
}