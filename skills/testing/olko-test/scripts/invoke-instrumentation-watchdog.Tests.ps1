BeforeAll {
    $watchdog = Join-Path $PSScriptRoot 'invoke-instrumentation-watchdog.ps1'
    $tokens = $null
    $parseErrors = $null
    $ast = [System.Management.Automation.Language.Parser]::ParseFile($watchdog, [ref]$tokens, [ref]$parseErrors)
    if ($parseErrors.Count -gt 0) { throw $parseErrors[0] }
    # Extract declarations only. Never dot-source the watchdog's executable body.
    $functions = $ast.FindAll({ param($node)
        $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
            $node.Name -in @('Test-InstrumentationResults', 'New-InstrumentationShellCommand',
                'Invoke-InstrumentationDocker', 'Wait-InstrumentationCompletion')
    }, $true)
    foreach ($function in $functions) { . ([scriptblock]::Create($function.Extent.Text)) }
}

Describe 'Instrumentation result validation' {

    BeforeEach {
        Mock Start-Process { throw 'Unexpected process launch in watchdog unit tests' }
        $reportDir = Join-Path $TestDrive ([Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $reportDir | Out-Null
        $startedUtc = [DateTime]::UtcNow.AddMinutes(-1)
        $xmlFile = Join-Path $reportDir 'TEST-device.xml'
        $exitFile = Join-Path $reportDir 'test-result-exit-code.txt'
        Set-Content -LiteralPath $xmlFile -Value '<testsuites tests="1" failures="0" errors="0" skipped="0"><testsuite tests="1"><testcase name="ok"/></testsuite></testsuites>'
        Set-Content -LiteralPath $exitFile -Value '0'
    }

    It 'accepts fresh successful reports' {
        Test-InstrumentationResults $reportDir $startedUtc | Should -Be $true
    }

    It 'rejects <Name> despite a successful process exit' -TestCases @(
        @{ Name = 'aggregate failure'; Xml = '<testsuites tests="57" failures="11" errors="0" skipped="0"/>' }
        @{ Name = 'suite error'; Xml = '<testsuites tests="1"><testsuite tests="1" errors="1"/></testsuites>' }
        @{ Name = 'skipped test'; Xml = '<testsuite tests="1" skipped="1"/>' }
        @{ Name = 'failure with incorrect counters'; Xml = '<testsuite tests="1"><testcase><failure/></testcase></testsuite>' }
        @{ Name = 'error with incorrect counters'; Xml = '<testsuite tests="1"><testcase><error/></testcase></testsuite>' }
        @{ Name = 'skip with incorrect counters'; Xml = '<testsuite tests="1"><testcase><skipped/></testcase></testsuite>' }
    ) {
        param($Name, $Xml)
        Set-Content -LiteralPath $xmlFile -Value $Xml
        Test-InstrumentationResults $reportDir $startedUtc | Should -Be $false
    }

    It 'rejects failed or invalid exit artifacts: <ExitValue>' -TestCases @(
        @{ ExitValue = '1' }
        @{ ExitValue = '' }
        @{ ExitValue = 'invalid' }
    ) {
        param($ExitValue)
        Set-Content -LiteralPath $exitFile -Value $ExitValue
        Test-InstrumentationResults $reportDir $startedUtc | Should -Be $false
    }

    It 'rejects a zero-byte exit artifact without a null-method exception' {
        Set-Content -LiteralPath $exitFile -Value '' -NoNewline

        Test-InstrumentationResults $reportDir $startedUtc | Should -Be $false
    }

    It 'rejects <Name> artifacts' -TestCases @(
        @{ Name = 'missing XML'; Change = 'Remove-Item -LiteralPath $xmlFile' }
        @{ Name = 'missing exit'; Change = 'Remove-Item -LiteralPath $exitFile' }
        @{ Name = 'stale XML'; Change = '(Get-Item -LiteralPath $xmlFile).LastWriteTimeUtc = $startedUtc.AddMinutes(-1)' }
        @{ Name = 'stale exit'; Change = '(Get-Item -LiteralPath $exitFile).LastWriteTimeUtc = $startedUtc.AddMinutes(-1)' }
        @{ Name = 'empty suite'; Change = 'Set-Content -LiteralPath $xmlFile -Value ''<testsuite tests="0"/>''' }
        @{ Name = 'invalid XML'; Change = 'Set-Content -LiteralPath $xmlFile -Value ''<testsuite''' }
        @{ Name = 'unexpected root'; Change = 'Set-Content -LiteralPath $xmlFile -Value ''<other tests="1"/>''' }
    ) {
        param($Name, $Change)
        & ([scriptblock]::Create($Change))
        { Test-InstrumentationResults $reportDir $startedUtc } | Should -Throw
    }
}

Describe 'Container-owned instrumentation completion' {
    BeforeEach {
        # Fail closed if a test accidentally reaches the real process-launch boundary.
        Mock Start-Process { throw 'Unexpected process launch in watchdog unit tests' }
        Mock Write-Host {}
        Mock Start-Sleep {}
        $id = [Guid]::NewGuid()
        $dockerProcess = [pscustomobject]@{ HasExited = $true; ExitCode = 0 }
        $script:probeCount = 0
        $script:expectedId = $id.ToString('N')
        $script:deadline = [DateTime]::UtcNow.AddSeconds(10)
    }

    It 'continues polling after premature Docker exit <TransportExit>, then uses actual Gradle exit <GradleExit>' -TestCases @(
        @{ TransportExit = 0; GradleExit = 0 }
        @{ TransportExit = 1; GradleExit = 0 }
        @{ TransportExit = 0; GradleExit = 1 }
        @{ TransportExit = 125; GradleExit = 15 }
    ) {
        param($TransportExit, $GradleExit)
        $dockerProcess.ExitCode = $TransportExit
        $script:gradleExit = $GradleExit
        Mock Invoke-InstrumentationDocker {
            $script:probeCount++
            $output = if ($script:probeCount -lt 3) { '22/156 tests completed' } else { "${script:expectedId}:$script:gradleExit" }
            [pscustomobject]@{ ExitCode = 0; Output = $output; Error = '' }
        }

        $result = Wait-InstrumentationCompletion $dockerProcess emulator $id $TestDrive $script:deadline

        $result | Should -Be $GradleExit
        $script:probeCount | Should -Be 3
        Should -Invoke Write-Host -Times 1 -Exactly -ParameterFilter { $Object -like 'DOCKER_TRANSPORT_EXIT:*' }
        Should -Invoke Start-Process -Times 0 -Exactly
    }

    It 'accepts completion without waiting for the Docker client to exit' {
        $dockerProcess.HasExited = $false
        Mock Invoke-InstrumentationDocker { [pscustomobject]@{ ExitCode = 0; Output = "${script:expectedId}:0"; Error = '' } }

        Wait-InstrumentationCompletion $dockerProcess emulator $id $TestDrive $script:deadline | Should -Be 0

        Should -Invoke Write-Host -Times 0 -Exactly -ParameterFilter { $Object -like 'DOCKER_TRANSPORT_EXIT:*' }
    }

    It 'continues polling after <Name> stdout' -TestCases @(
        @{ Name = 'explicit null'; EmptyPipeline = $false }
        @{ Name = 'empty pipeline'; EmptyPipeline = $true }
    ) {
        param($Name, $EmptyPipeline)
        $script:emptyProbe = if ($EmptyPipeline) {
            [pscustomobject]@{ ExitCode = 0; Output = & {}; Error = '' }
        } else {
            [pscustomobject]@{ ExitCode = 0; Output = $null; Error = '' }
        }
        Mock Invoke-InstrumentationDocker {
            $script:probeCount++
            if ($script:probeCount -eq 1) { return $script:emptyProbe }
            [pscustomobject]@{ ExitCode = 0; Output = "${script:expectedId}:0"; Error = '' }
        }

        Wait-InstrumentationCompletion $dockerProcess emulator $id $TestDrive $script:deadline | Should -Be 0
        $script:probeCount | Should -Be 2
    }

    It 'does not accept <Name> as completion' -TestCases @(
        @{ Name = 'stale invocation'; Output = '00000000000000000000000000000000:0'; ProbeExit = 0 }
        @{ Name = 'missing completion'; Output = ''; ProbeExit = 0 }
        @{ Name = 'malformed code'; Output = '{id}:success'; ProbeExit = 0 }
        @{ Name = 'out-of-range code'; Output = '{id}:256'; ProbeExit = 0 }
        @{ Name = 'failed transport with stale stdout'; Output = '{id}:0'; ProbeExit = 1 }
        @{ Name = 'hung transport'; Output = ''; ProbeExit = $null }
    ) {
        param($Name, $Output, $ProbeExit)
        $script:probeOutput = $Output.Replace('{id}', $script:expectedId)
        $script:probeExit = $ProbeExit
        Mock Invoke-InstrumentationDocker {
            $script:probeCount++
            if ($script:probeCount -eq 1) {
                return [pscustomobject]@{ ExitCode = $script:probeExit; Output = $script:probeOutput; Error = 'unavailable' }
            }
            [pscustomobject]@{ ExitCode = 0; Output = "${script:expectedId}:1"; Error = '' }
        }

        Wait-InstrumentationCompletion $dockerProcess emulator $id $TestDrive $script:deadline | Should -Be 1
        $script:probeCount | Should -Be 2
    }

    It 'bounds missing completion despite <Name>, without claiming the workload finished' -TestCases @(
        @{ Name = 'exited client'; HasExited = $true }
        @{ Name = 'running client'; HasExited = $false }
    ) {
        param($Name, $HasExited)
        $dockerProcess.HasExited = $HasExited
        Mock Invoke-InstrumentationDocker {
            $script:probeCount++
            [pscustomobject]@{ ExitCode = 0; Output = ''; Error = '' }
        }
        # Deterministic time progression, without sleeping or launching any processes.
        Mock Get-Date {
            if ($script:probeCount -ge 2) { return $script:deadline.AddSeconds(1) }
            return $script:deadline.AddSeconds(-1)
        }

        Wait-InstrumentationCompletion $dockerProcess emulator $id $TestDrive $script:deadline | Should -BeNullOrEmpty

        $script:probeCount | Should -Be 2
        Should -Invoke Write-Host -Times 1 -Exactly -ParameterFilter {
            $Object -like 'GRADLE_COMPLETION_MISSING:*may still be running*no Gradle/container stop attempted*'
        }
        Should -Invoke Write-Host -Times 0 -Exactly -ParameterFilter { $Object -like 'GRADLE_COMPLETED:*' }
        Should -Invoke Start-Process -Times 0 -Exactly
    }

    It 'publishes the immediate shell exit status atomically, never an injected success' {
        $command = New-InstrumentationShellCommand $id

        $command | Should -Match 'gradle.stderr; code=\$\?; printf'
        $command | Should -Match "printf '$($id.ToString('N')):%s\\n' \`$code > .*/completion.tmp && mv .*/completion.tmp .*/completion; exit \`$code$"
        $command | Should -Match "^trap '' HUP; ./gradlew :app:connectedDebugAndroidTest "
        $command | Should -Match '-Pandroid.builder.sdkDownload=false'
        $command | Should -Match '-Dorg.gradle.java.installations.auto-download=false'
        $command | Should -Not -Match '"|--tests|android.testInstrumentationRunnerArguments|\| tee|&$|code=0'
        $command | Should -Not -Be (New-InstrumentationShellCommand ([Guid]::NewGuid()))
    }

    It 'pins the container serial and removes lifecycle/daemon-stop operations' {
        $ast.Extent.Text | Should -Match "'ANDROID_SERIAL=emulator-5554'"
        $ast.Extent.Text | Should -Match 'existing JDK 25 is required; no toolchain installation attempted'
        $ast.Extent.Text | Should -Not -Match 'Invoke-Docker (start|stop|restart)|gradlew --stop|taskkill'
        $ast.Extent.Text | Should -Match '\[OLKO-TEST-INCOMPLETE\]'
    }
}

Describe 'Bounded read-only Docker transport' {
    BeforeEach {
        Mock Start-Process { throw 'Unexpected process launch in watchdog unit tests' }
    }

    It 'does not launch a read after the deadline' {
        $result = Invoke-InstrumentationDocker @('exec', 'emulator', 'cat', '/completion') `
            (Join-Path $TestDrive 'probe') ([DateTime]::UtcNow.AddSeconds(-1))

        $result.ExitCode | Should -BeNullOrEmpty
        $result.Error | Should -Be 'Docker read deadline expired'
        Should -Invoke Start-Process -Times 0 -Exactly
    }

    It 'bounds a hung read and kills only its mocked Windows client' {
        $process = [pscustomobject]@{ Handle = 1; Killed = $false; Disposed = $false; WaitMilliseconds = 0 }
        $process | Add-Member ScriptMethod WaitForExit { param($milliseconds) $this.WaitMilliseconds = $milliseconds; return $false }
        $process | Add-Member ScriptMethod Kill { $this.Killed = $true }
        $process | Add-Member ScriptMethod Dispose { $this.Disposed = $true }
        Mock Start-Process { $process }

        $result = Invoke-InstrumentationDocker @('exec', 'emulator', 'cat', '/completion') `
            (Join-Path $TestDrive 'probe') ([DateTime]::UtcNow.AddSeconds(3))

        $result.ExitCode | Should -BeNullOrEmpty
        $result.Error | Should -Be 'Docker read timed out'
        $process.Killed | Should -BeTrue
        $process.Disposed | Should -BeTrue
        $process.WaitMilliseconds | Should -BeGreaterThan 0
        $process.WaitMilliseconds | Should -BeLessOrEqual 3000
        Should -Invoke Start-Process -Times 1 -Exactly -ParameterFilter { $FilePath -eq 'docker' -and $ArgumentList[0] -eq 'exec' }
    }

    It 'returns strings and transport exit <Code> for <Name> output files' -TestCases @(
        @{ Code = 0; Name = 'populated'; Stdout = 'completion-data'; Stderr = 'transport-detail' }
        @{ Code = 1; Name = 'populated'; Stdout = 'completion-data'; Stderr = 'transport-detail' }
        @{ Code = 0; Name = 'zero-byte'; Stdout = ''; Stderr = '' }
        @{ Code = 1; Name = 'zero-byte'; Stdout = ''; Stderr = '' }
        @{ Code = 1; Name = 'missing'; Stdout = $null; Stderr = $null }
    ) {
        param($Code, $Name, $Stdout, $Stderr)
        $process = [pscustomobject]@{ Handle = 1; ExitCode = $Code; Disposed = $false }
        $process | Add-Member ScriptMethod WaitForExit { param($milliseconds) return $true }
        $process | Add-Member ScriptMethod Dispose { $this.Disposed = $true }
        Mock Start-Process {
            if ($null -ne $Stdout) { Set-Content -LiteralPath $RedirectStandardOutput -Value $Stdout -NoNewline }
            if ($null -ne $Stderr) { Set-Content -LiteralPath $RedirectStandardError -Value $Stderr -NoNewline }
            return $process
        }

        $result = Invoke-InstrumentationDocker @('exec', 'emulator', 'cat', '/completion') `
            (Join-Path $TestDrive 'probe') ([DateTime]::UtcNow.AddSeconds(10))

        $result.ExitCode | Should -Be $Code
        $result.Output | Should -BeOfType ([string])
        $result.Error | Should -BeOfType ([string])
        $result.Output.Trim() | Should -Be "$Stdout"
        $result.Error.Trim() | Should -Be "$Stderr"
        $process.Disposed | Should -BeTrue
    }

    It 'polls through real zero-byte probe files to authoritative completion <Code>' -TestCases @(
        @{ Code = 0 }
        @{ Code = 1 }
    ) {
        param($Code)
        Mock Write-Host {}
        Mock Start-Sleep {}
        $id = [Guid]::NewGuid()
        $script:probeCount = 0
        $script:completion = "$($id.ToString('N')):$Code"
        $script:deadline = [DateTime]::UtcNow.AddSeconds(10)
        Mock Get-Date {
            if ($script:probeCount -ge 2) { return $script:deadline.AddSeconds(1) }
            return $script:deadline.AddSeconds(-1)
        }
        Mock Start-Process {
            $script:probeCount++
            $stdout = if ($script:probeCount -eq 1) { '' } else { $script:completion }
            Set-Content -LiteralPath $RedirectStandardOutput -Value $stdout -NoNewline
            Set-Content -LiteralPath $RedirectStandardError -Value '' -NoNewline
            $process = [pscustomobject]@{ Handle = 1; ExitCode = 0 }
            $process | Add-Member ScriptMethod WaitForExit { param($milliseconds) return $true }
            $process | Add-Member ScriptMethod Dispose {}
            return $process
        }
        $dockerProcess = [pscustomobject]@{ HasExited = $true; ExitCode = 0 }

        # Both production helpers run; only the process boundary is mocked.
        Wait-InstrumentationCompletion $dockerProcess emulator $id $TestDrive $script:deadline | Should -Be $Code

        $script:probeCount | Should -Be 2
        Should -Invoke Start-Process -Times 2 -Exactly
        Should -Invoke Write-Host -Times 1 -Exactly -ParameterFilter { $Object -like 'GRADLE_COMPLETED:*' }
    }
}

Describe 'Watchdog exception diagnostics' {
    It 'prints the original error source and script stack without executing the watchdog body' {
        Mock Start-Process { throw 'Unexpected process launch in watchdog unit tests' }
        $watchdogTry = $ast.EndBlock.Statements | Where-Object { $_ -is [System.Management.Automation.Language.TryStatementAst] }
        # Extract output statements only: never execute exit, finally, or the runtime body.
        $outputStatements = $watchdogTry.CatchClauses[0].Body.Statements | Where-Object {
            $_ -is [System.Management.Automation.Language.PipelineAst] -and
                $_.PipelineElements[0].GetCommandName() -eq 'Write-Output'
        }
        $diagnosticOutput = [scriptblock]::Create(($outputStatements.Extent.Text -join "`n"))
        $failure = $null
        $messages = try { throw 'probe-read-failed' } catch { $failure = $_; & $diagnosticOutput }
        $text = $messages -join "`n"

        $text | Should -Match 'probe-read-failed'
        $text | Should -Match ('ERROR_SOURCE: ' + [regex]::Escape($failure.InvocationInfo.PositionMessage))
        $text | Should -Match ('ERROR_STACK: ' + [regex]::Escape($failure.ScriptStackTrace))
        Should -Invoke Start-Process -Times 0 -Exactly
    }
}
