# 一致性机制 version: 2026-10-01
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$KitDir,

    [string]$HookTestScript = (Join-Path $PSScriptRoot "test-stop-hook.mjs"),

    [string]$GuardTestScript = (Join-Path $PSScriptRoot "test-synced-guard.mjs")
)

$ErrorActionPreference = "Stop"
$kit = (Resolve-Path -LiteralPath $KitDir).Path
$hookTest = (Resolve-Path -LiteralPath $HookTestScript).Path
$guardTest = (Resolve-Path -LiteralPath $GuardTestScript).Path

$codexHooks = Get-Content -LiteralPath (Join-Path $kit ".codex\hooks.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$handler = $codexHooks.hooks.Stop[0].hooks[0]
if (-not $handler.commandWindows -or $handler.commandWindows -notmatch 'wrapup-reminder\.ps1') {
    throw "Codex commandWindows adapter is missing"
}
if ($handler.commandWindows -match '\$root' -or $handler.commandWindows -match '\.mjs') {
    throw "Codex commandWindows still embeds PowerShell variables or Node hook logic"
}
if ($handler.commandWindows -notmatch '(?i)-File') {
    throw "Codex commandWindows must invoke the PowerShell adapter with -File"
}

# Per-turn notice and post-compaction reminder: commandWindows forwards by name through run-hook.ps1.
# Keep comments in .ps1 files ASCII: PowerShell 5.1 reads BOM-less scripts in the ANSI code page, and under GBK a
# UTF-8 comment can swallow its line break and comment out the next line.
foreach ($event in @('UserPromptSubmit', 'SessionStart')) {
    $h = $codexHooks.hooks.$event[0].hooks[0]
    if (-not $h.commandWindows -or $h.commandWindows -notmatch 'run-hook\.ps1' -or $h.commandWindows -notmatch '(?i)-File') {
        throw "Codex $event commandWindows must invoke run-hook.ps1 with -File"
    }
    if ($h.commandWindows -match '\$root' -or $h.commandWindows -match '\.mjs') {
        throw "Codex $event commandWindows still embeds PowerShell variables or Node hook logic"
    }
}
$compactHandler = $codexHooks.hooks.SessionStart[0].hooks[0]
$runHook = Join-Path $kit ".agents\hooks\run-hook.ps1"
if (-not (Test-Path -LiteralPath $runHook -PathType Leaf)) {
    throw "PowerShell generic hook adapter is missing"
}

$hookAdapter = Join-Path $kit ".agents\hooks\wrapup-reminder.ps1"
if (-not (Test-Path -LiteralPath $hookAdapter -PathType Leaf)) {
    throw "PowerShell Stop hook adapter is missing"
}

$fetchAdapter = Join-Path $kit "skills\project-consistency-installer\scripts\fetch-kit.ps1"
$verifiedPath = @(& $fetchAdapter -VerifyDir $kit) | Select-Object -Last 1
if ($LASTEXITCODE -ne 0) {
    throw "PowerShell fetch adapter verification failed"
}
if ((Resolve-Path -LiteralPath $verifiedPath).Path -ne $kit) {
    throw "PowerShell fetch adapter returned a different distribution path: $verifiedPath"
}

$hook = Join-Path $kit ".agents\hooks\wrapup-reminder.mjs"
if (-not (Test-Path -LiteralPath $hook -PathType Leaf)) {
    throw "cross-platform Stop hook is missing from the distribution"
}
& node $hookTest $hook
if ($LASTEXITCODE -ne 0) {
    throw "Windows Stop hook state-machine test failed"
}

$guard = Join-Path $kit ".agents\skills\wrapup\scripts\synced-guard.mjs"
if (-not (Test-Path -LiteralPath $guard -PathType Leaf)) {
    throw "synced guard is missing from the distribution"
}
& node $guardTest $guard
if ($LASTEXITCODE -ne 0) {
    throw "Windows synced guard test failed"
}

$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ("project-consistency-windows-hook-{0}" -f [guid]::NewGuid().ToString("N"))
$mechanismName = -join (@(0x4e00, 0x81f4, 0x6027, 0x673a, 0x5236) | ForEach-Object { [char]$_ })
$linkageName = -join (@(0x6587, 0x4ef6, 0x8054, 0x52a8, 0x76ee, 0x5f55, 0x2e, 0x6d, 0x64) | ForEach-Object { [char]$_ })
$oneFile = -join (@(0x31, 0x20, 0x4e2a, 0x6587, 0x4ef6) | ForEach-Object { [char]$_ })
try {
    New-Item -ItemType Directory -Path (Join-Path $fixture ".agents\hooks") -Force | Out-Null
    $mechanismDir = New-Item -ItemType Directory -Path (Join-Path $fixture $mechanismName) -Force
    New-Item -ItemType Directory -Path (Join-Path $fixture "nested") -Force | Out-Null
    Copy-Item -LiteralPath $hook -Destination (Join-Path $fixture ".agents\hooks\wrapup-reminder.mjs")
    Copy-Item -LiteralPath $hookAdapter -Destination (Join-Path $fixture ".agents\hooks\wrapup-reminder.ps1")
    Copy-Item -LiteralPath $runHook -Destination (Join-Path $fixture ".agents\hooks\run-hook.ps1")
    Copy-Item -LiteralPath (Join-Path $kit ".agents\hooks\compact-reminder.mjs") -Destination (Join-Path $fixture ".agents\hooks\compact-reminder.mjs")
    New-Item -ItemType Directory -Path (Join-Path $fixture ".agents\skills\wrapup\scripts") -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $kit ".agents\skills\wrapup\scripts\checkpoints.mjs") -Destination (Join-Path $fixture ".agents\skills\wrapup\scripts\checkpoints.mjs")
    Set-Content -LiteralPath (Join-Path $mechanismDir.FullName $linkageName) -Value "# fixture" -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $fixture "tracked.txt") -Value "clean" -Encoding UTF8

    & git -C $fixture init -q
    & git -C $fixture config user.name "Project Consistency Test"
    & git -C $fixture config user.email "test@example.invalid"
    & git -C $fixture add -A
    & git -C $fixture commit -qm "fixture"
    & git -C $fixture tag synced
    if ($LASTEXITCODE -ne 0) {
        throw "Windows adapter fixture setup failed"
    }

    Set-Content -LiteralPath (Join-Path $fixture "dirty.txt") -Value "dirty" -Encoding UTF8
    Push-Location (Join-Path $fixture "nested")
    try {
        $inputJson = @{ session_id = "windows-adapter"; hook_event_name = "Stop" } | ConvertTo-Json -Compress
        $output = $inputJson | & powershell.exe -NoProfile -NonInteractive -Command $handler.commandWindows
        if ($LASTEXITCODE -ne 0) {
            throw "Codex commandWindows failed through an outer PowerShell: exit $LASTEXITCODE"
        }
        if (-not $output) {
            # Empty Stop output: collect what each layer sees, with fresh session ids so duplicate suppression does not hide output.
            $diagnostics = & {
                $ErrorActionPreference = 'Continue'
                "cwd: $((Get-Location).Path)"
                "tmp: $([System.IO.Path]::GetTempPath())"
                "toplevel: $(& git rev-parse --show-toplevel 2>&1)"
                "status: $(& git status --porcelain 2>&1 | Out-String)"
                $direct = @{ session_id = "windows-adapter-diag-node"; hook_event_name = "Stop" } | ConvertTo-Json -Compress
                "node direct: $($direct | & node (Join-Path $fixture '.agents\hooks\wrapup-reminder.mjs') 2>&1 | Out-String) exit=$LASTEXITCODE"
                $adapter = @{ session_id = "windows-adapter-diag-ps1"; hook_event_name = "Stop" } | ConvertTo-Json -Compress
                "adapter only: $($adapter | & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $fixture '.agents\hooks\wrapup-reminder.ps1') 2>&1 | Out-String) exit=$LASTEXITCODE"
            } | Out-String
            throw "Codex commandWindows returned no Stop output. Diagnostics:`n$diagnostics"
        }
        $duplicate = $inputJson | & powershell.exe -NoProfile -NonInteractive -Command $handler.commandWindows
        if ($LASTEXITCODE -ne 0) {
            throw "Codex commandWindows duplicate-cycle check failed: exit $LASTEXITCODE"
        }
        $compactInput = @{ session_id = "windows-adapter"; hook_event_name = "SessionStart"; source = "compact" } | ConvertTo-Json -Compress
        $compactOutput = $compactInput | & powershell.exe -NoProfile -NonInteractive -Command $compactHandler.commandWindows
        if ($LASTEXITCODE -ne 0) {
            throw "Codex SessionStart commandWindows failed through an outer PowerShell: exit $LASTEXITCODE"
        }
        if (-not $compactOutput) {
            # The compaction reminder needs stdin (source=compact); check where the input or output is lost.
            $probe = Join-Path $fixture "stdin-probe.ps1"
            Set-Content -LiteralPath $probe -Encoding ASCII -Value '$t = [Console]::In.ReadToEnd(); "stdin chars: " + $t.Length + " text: " + $t'
            # Probes that follow run-hook.ps1 step by step: what the adapter reads, with and without its param block,
            # and which bytes Node receives when the adapter forwards the input.
            $nodeProbe = Join-Path $fixture "stdin-probe.mjs"
            Set-Content -LiteralPath $nodeProbe -Encoding ASCII -Value 'import fs from "node:fs"; let r; try { const b = fs.readFileSync(0); r = "bytes=" + b.length + " head=" + [...b.subarray(0, 6)].join(","); } catch (e) { r = "error " + e.code; } console.log(process.version + " " + r);'
            $readBody = @'
$ErrorActionPreference = 'Stop'
try {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [Console]::InputEncoding = $utf8
    [Console]::OutputEncoding = $utf8
    $OutputEncoding = $utf8
    $t = [Console]::In.ReadToEnd()
    "read chars=" + $t.Length + " head=" + (($t.ToCharArray() | Select-Object -First 4 | ForEach-Object { [int]$_ }) -join ",")
    FORWARD
} catch { "adapter error: " + $_.Exception.Message }
'@
            $paramHead = "[CmdletBinding()]`nparam([Parameter(Mandatory = `$true, Position = 0)][string]`$Hook)`n"
            $probeA = Join-Path $fixture "probe-a.ps1"; $probeB = Join-Path $fixture "probe-b.ps1"; $probeC = Join-Path $fixture "probe-c.ps1"
            Set-Content -LiteralPath $probeA -Encoding ASCII -Value ($paramHead + $readBody.Replace('FORWARD', ''))
            Set-Content -LiteralPath $probeB -Encoding ASCII -Value $readBody.Replace('FORWARD', '')
            Set-Content -LiteralPath $probeC -Encoding ASCII -Value ($paramHead + $readBody.Replace('FORWARD', ('$t | & node ''' + $nodeProbe + '''')))
            $diagnostics = & {
                $ErrorActionPreference = 'Continue'
                "node direct: $($compactInput | & node (Join-Path $fixture '.agents\hooks\compact-reminder.mjs') 2>&1 | Out-String) exit=$LASTEXITCODE"
                "adapter only: $($compactInput | & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path $fixture '.agents\hooks\run-hook.ps1') compact-reminder 2>&1 | Out-String) exit=$LASTEXITCODE"
                "probe, one layer: $($compactInput | & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $probe 2>&1 | Out-String)"
                "probe, two layers: $($compactInput | & powershell.exe -NoProfile -NonInteractive -Command "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File '$probe'" 2>&1 | Out-String)"
                "two layers again: $($compactInput | & powershell.exe -NoProfile -NonInteractive -Command $compactHandler.commandWindows 2>&1 | Out-String)"
                "node probe direct: $($compactInput | & node $nodeProbe 2>&1 | Out-String)"
                "probe A (param block): $($compactInput | & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $probeA compact-reminder 2>&1 | Out-String)"
                "probe B (no param block): $($compactInput | & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $probeB 2>&1 | Out-String)"
                "probe C (forward to node): $($compactInput | & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $probeC compact-reminder 2>&1 | Out-String)"
                "test process OutputEncoding: $($OutputEncoding.WebName) preamble=$($OutputEncoding.GetPreamble().Length); console in=$([Console]::InputEncoding.WebName) out=$([Console]::OutputEncoding.WebName)"
            } | Out-String
            throw "Codex SessionStart commandWindows returned no output. Diagnostics:`n$diagnostics"
        }
        $startupInput = @{ session_id = "windows-adapter"; hook_event_name = "SessionStart"; source = "startup" } | ConvertTo-Json -Compress
        $startupOutput = $startupInput | & powershell.exe -NoProfile -NonInteractive -Command $compactHandler.commandWindows
    } finally {
        Pop-Location
    }

    $result = $output | ConvertFrom-Json
    if ($result.systemMessage -notlike "*$oneFile*" -or $result.systemMessage -notmatch '\$wrapup$') {
        throw "Codex commandWindows did not return the expected Stop systemMessage: $output"
    }
    if ($duplicate) {
        throw "Codex commandWindows did not forward the session id for duplicate suppression: $duplicate"
    }
    $compactResult = $compactOutput | ConvertFrom-Json
    if ($compactResult.hookSpecificOutput.hookEventName -ne 'SessionStart' -or -not $compactResult.hookSpecificOutput.additionalContext) {
        throw "Codex SessionStart commandWindows did not return the post-compaction reminder: $compactOutput"
    }
    if ($startupOutput) {
        throw "Post-compaction reminder must stay silent on startup: $startupOutput"
    }
} finally {
    Remove-Item -LiteralPath $fixture -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output "test-windows-adapters: all scenarios passed"
