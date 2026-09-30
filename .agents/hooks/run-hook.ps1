# 一致性机制 version: 2026-09-30
# Thin Windows adapter for the kit's cross-platform Node hooks: locates .agents/hooks/<Hook>.mjs and forwards stdin.
# Used by Codex commandWindows for the per-turn notice and the post-compaction reminder; wrapup-reminder.ps1 stays for existing Stop wiring.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('parallel-notice', 'compact-reminder', 'wrapup-reminder')]
    [string]$Hook
)

$ErrorActionPreference = 'Stop'

try {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [Console]::InputEncoding = $utf8
    [Console]::OutputEncoding = $utf8
    $OutputEncoding = $utf8
    $hookInput = [Console]::In.ReadToEnd()
    $repoRoot = (& git rev-parse --show-toplevel 2>$null | Select-Object -First 1)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repoRoot)) {
        exit 0
    }

    $target = Join-Path $repoRoot.Trim() ".agents\hooks\$Hook.mjs"
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
        exit 0
    }

    if ([string]::IsNullOrEmpty($hookInput)) {
        & node $target
    } else {
        $hookInput | & node $target
    }
} catch {
    # Hooks are advisory. Adapter failures must never block the host.
}

exit 0
