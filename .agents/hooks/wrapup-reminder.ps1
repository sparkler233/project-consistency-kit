# 一致性机制 version: 2026-10-01
# Thin Windows adapter for the cross-platform Node Stop hook.

$ErrorActionPreference = 'Stop'

try {
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [Console]::InputEncoding = $utf8
    [Console]::OutputEncoding = $utf8
    $OutputEncoding = $utf8
    $hookInput = [Console]::In.ReadToEnd()
    # Read git's exit code at once and without a pipeline: stopping a pipeline early (Select-Object -First 1) can
    # leave $LASTEXITCODE unset, and under 'Stop' Windows PowerShell 5.1 turns any stderr from git into an error.
    $ErrorActionPreference = 'Continue'
    $repoRoot = @(& git rev-parse --show-toplevel 2>$null)
    $gitExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($gitExit -ne 0 -or $repoRoot.Count -eq 0 -or [string]::IsNullOrWhiteSpace($repoRoot[0])) {
        exit 0
    }

    $hook = Join-Path $repoRoot[0].Trim() '.agents\hooks\wrapup-reminder.mjs'
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
