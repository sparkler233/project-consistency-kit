# 一致性机制 version: 2026-08-19
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$KitDir,

    [string]$HookTestScript = (Join-Path $PSScriptRoot "test-stop-hook.mjs")
)

$ErrorActionPreference = "Stop"
$kit = (Resolve-Path -LiteralPath $KitDir).Path
$hookTest = (Resolve-Path -LiteralPath $HookTestScript).Path

$codexHooks = Get-Content -LiteralPath (Join-Path $kit ".codex\hooks.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$handler = $codexHooks.hooks.Stop[0].hooks[0]
if (-not $handler.commandWindows -or $handler.commandWindows -notmatch '\.mjs') {
    throw "Codex commandWindows adapter is missing"
}

$fetchAdapter = Join-Path $kit "skills\project-consistency-installer\scripts\fetch-kit.ps1"
$verifiedPath = @(& $fetchAdapter -VerifyDir $kit) | Select-Object -Last 1
if ($LASTEXITCODE -ne 0) {
    throw "PowerShell fetch adapter verification failed"
}
if ((Resolve-Path -LiteralPath $verifiedPath).Path -ne $kit) {
    throw "PowerShell fetch adapter returned a different distribution path: $verifiedPath"
}

$hookCandidates = @(Get-ChildItem -LiteralPath $kit -Recurse -File -Filter "*.mjs")
if ($hookCandidates.Count -ne 1) {
    throw "Expected exactly one distributed .mjs hook, found $($hookCandidates.Count)"
}
$hook = $hookCandidates[0].FullName
& node $hookTest $hook
if ($LASTEXITCODE -ne 0) {
    throw "Windows Stop hook state-machine test failed"
}

Write-Output "test-windows-adapters: all scenarios passed"
