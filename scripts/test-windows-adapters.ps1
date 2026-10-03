# 一致性机制 version: 2026-10-03
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$KitDir,

    [string]$GuardTestScript = (Join-Path $PSScriptRoot "test-synced-guard.mjs")
)

$ErrorActionPreference = "Stop"
$kit = (Resolve-Path -LiteralPath $KitDir).Path
$guardTest = (Resolve-Path -LiteralPath $GuardTestScript).Path

$codexHooks = Get-Content -LiteralPath (Join-Path $kit ".codex\hooks.json") -Raw -Encoding UTF8 | ConvertFrom-Json
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

$fetchAdapter = Join-Path $kit "skills\project-consistency-installer\scripts\fetch-kit.ps1"
$verifiedPath = @(& $fetchAdapter -VerifyDir $kit) | Select-Object -Last 1
if ($LASTEXITCODE -ne 0) {
    throw "PowerShell fetch adapter verification failed"
}
if ((Resolve-Path -LiteralPath $verifiedPath).Path -ne $kit) {
    throw "PowerShell fetch adapter returned a different distribution path: $verifiedPath"
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
try {
    New-Item -ItemType Directory -Path (Join-Path $fixture ".agents\hooks") -Force | Out-Null
    $mechanismDir = New-Item -ItemType Directory -Path (Join-Path $fixture $mechanismName) -Force
    New-Item -ItemType Directory -Path (Join-Path $fixture "nested") -Force | Out-Null
    Copy-Item -LiteralPath $runHook -Destination (Join-Path $fixture ".agents\hooks\run-hook.ps1")
    Copy-Item -LiteralPath (Join-Path $kit ".agents\hooks\compact-reminder.mjs") -Destination (Join-Path $fixture ".agents\hooks\compact-reminder.mjs")
    New-Item -ItemType Directory -Path (Join-Path $fixture ".agents\skills\wrapup\scripts") -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $kit ".agents\skills\wrapup\scripts\checkpoints.mjs") -Destination (Join-Path $fixture ".agents\skills\wrapup\scripts\checkpoints.mjs")
    Copy-Item -LiteralPath (Join-Path $kit ".agents\skills\wrapup\scripts\hook-trace.mjs") -Destination (Join-Path $fixture ".agents\skills\wrapup\scripts\hook-trace.mjs")
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

    # Diagnostics for an empty hook output: an instrumented copy of the real adapter prints its early exits, the
    # exception it would swallow and node's exit code; it runs 10 times and the outcomes are tallied.
    function Get-AdapterDiagnostics([string]$Adapter, [string]$HookArg, [string]$EventName) {
        $ErrorActionPreference = 'Continue'
        $source = Get-Content -LiteralPath (Join-Path $fixture ".agents\hooks\$Adapter") -Raw
        $debug = $source -replace '(?m)^([ \t]+)exit 0[ \t]*\r?$', '$1"early exit: git=$$gitExit root=[$$repoRoot] lastexit=$$LASTEXITCODE"; exit 0'
        $debug = $debug -replace '(?m)^([ \t]+)#[^\r\n]*advisory[^\r\n]*$', '$1"adapter error: " + $$_.Exception.GetType().FullName + ": " + $$_.Exception.Message + " (line " + $$_.InvocationInfo.ScriptLineNumber + ")"'
        $debug = $debug -replace '(& node \$\w+)', '$1; "node exit=$$LASTEXITCODE"'
        $copy = Join-Path $fixture ".agents\hooks\debug-$Adapter"
        Set-Content -LiteralPath $copy -Value $debug -Encoding ASCII
        $tally = @{}
        for ($n = 1; $n -le 10; $n++) {
            $json = @{ session_id = "windows-adapter-debug-$n"; hook_event_name = $EventName; source = "compact" } | ConvertTo-Json -Compress
            $psArgs = @('-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', $copy)
            if ($HookArg) { $psArgs += $HookArg }
            $psArgs += '-Codex'
            $lines = @($json | & powershell.exe @psArgs 2>&1 | ForEach-Object { "$_" })
            $key = (@($lines | ForEach-Object { if ($_ -match 'systemMessage|hookSpecificOutput') { '<hook output>' } else { $_ } }) -join ' | ')
            if (-not $key) { $key = '<nothing>' }
            if ($tally.ContainsKey($key)) { $tally[$key]++ } else { $tally[$key] = 1 }
        }
        $nodeScript = "$HookArg.mjs"
        $direct = @{ session_id = "windows-adapter-debug-node"; hook_event_name = $EventName; source = "compact" } | ConvertTo-Json -Compress
        $nodeOut = ($direct | & node (Join-Path $fixture ".agents\hooks\$nodeScript") --host=codex 2>&1 | Out-String).Trim()
        $report = @("node direct: $nodeOut", "instrumented $Adapter, 10 runs:")
        $report += @($tally.GetEnumerator() | ForEach-Object { "  $($_.Value) x $($_.Key)" })
        $report += "test process OutputEncoding: $($OutputEncoding.WebName) preamble=$($OutputEncoding.GetPreamble().Length); console in=$([Console]::InputEncoding.WebName) out=$([Console]::OutputEncoding.WebName)"
        $report -join "`n"
    }

    Push-Location (Join-Path $fixture "nested")
    try {
        # Each chain runs several times, so an intermittent empty output cannot slip through on a lucky run.
        $repeat = 10
        $compactInput = @{ session_id = "windows-adapter"; hook_event_name = "SessionStart"; source = "compact" } | ConvertTo-Json -Compress
        for ($i = 1; $i -le $repeat; $i++) {
            $compactOutput = $compactInput | & powershell.exe -NoProfile -NonInteractive -Command $compactHandler.commandWindows
            if ($LASTEXITCODE -ne 0) {
                throw "Codex SessionStart commandWindows failed through an outer PowerShell: exit $LASTEXITCODE"
            }
            if (-not $compactOutput) {
                throw "Codex SessionStart commandWindows returned no output on run $i of $repeat.`n$(Get-AdapterDiagnostics 'run-hook.ps1' 'compact-reminder' 'SessionStart')"
            }
        }
        $startupInput = @{ session_id = "windows-adapter"; hook_event_name = "SessionStart"; source = "startup" } | ConvertTo-Json -Compress
        $startupOutput = $startupInput | & powershell.exe -NoProfile -NonInteractive -Command $compactHandler.commandWindows
    } finally {
        Pop-Location
    }

    $compactResult = $compactOutput | ConvertFrom-Json
    if ($compactResult.hookSpecificOutput.hookEventName -ne 'SessionStart' -or -not $compactResult.hookSpecificOutput.additionalContext) {
        throw "Codex SessionStart commandWindows did not return the post-compaction reminder: $compactOutput"
    }
    if (-not $compactResult.systemMessage) {
        throw "Codex compact reminder must include a user-facing notice"
    }
    if ($startupOutput) {
        throw "Post-compaction reminder must stay silent on startup: $startupOutput"
    }
} finally {
    Remove-Item -LiteralPath $fixture -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output "test-windows-adapters: all scenarios passed"
