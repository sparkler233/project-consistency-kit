# 一致性机制 version: 2026-08-22
# Thin Windows adapter for the cross-platform Node Stop hook.

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

    $hook = Join-Path $repoRoot.Trim() '.agents\hooks\wrapup-reminder.mjs'
    if (-not (Test-Path -LiteralPath $hook -PathType Leaf)) {
        exit 0
    }

    if ([string]::IsNullOrEmpty($hookInput)) {
        & node $hook
    } else {
        $hookInput | & node $hook
    }
} catch {
    # Stop reminders are advisory. Adapter failures must never block the host.
}

exit 0
