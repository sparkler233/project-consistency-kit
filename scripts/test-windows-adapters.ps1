# 一致性机制 version: 2026-09-29
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

# 每轮提示与压缩后提醒:commandWindows 经通用薄适配器 run-hook.ps1 按名字转发
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
        $duplicate = $inputJson | & powershell.exe -NoProfile -NonInteractive -Command $handler.commandWindows
        if ($LASTEXITCODE -ne 0) {
            throw "Codex commandWindows duplicate-cycle check failed: exit $LASTEXITCODE"
        }
        $compactInput = @{ session_id = "windows-adapter"; hook_event_name = "SessionStart"; source = "compact" } | ConvertTo-Json -Compress
        $compactOutput = $compactInput | & powershell.exe -NoProfile -NonInteractive -Command $compactHandler.commandWindows
        if ($LASTEXITCODE -ne 0) {
            throw "Codex SessionStart commandWindows failed through an outer PowerShell: exit $LASTEXITCODE"
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
