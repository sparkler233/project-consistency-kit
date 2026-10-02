# 一致性机制 version: 2026-10-02
# Thin Windows adapter for the kit's cross-platform Node hooks: locates .agents/hooks/<Hook>.mjs and forwards stdin.
# Used by Codex commandWindows for the per-turn notice and the post-compaction reminder.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('parallel-notice', 'compact-reminder')]
    [string]$Hook,

    [switch]$Codex
)

$ErrorActionPreference = 'Stop'

# Fail open, but once the repository is found and the hook still cannot run, append one line to
# pck-hook-failures.log in the Git common directory (same format as hook-trace.mjs).
$script:repoTop = $null
function Write-HookFailure([string]$Reason) {
    try {
        if (-not $script:repoTop) { return }
        $ErrorActionPreference = 'Continue'
        $common = @(& git -C $script:repoTop rev-parse --git-common-dir 2>$null)
        if ($LASTEXITCODE -ne 0 -or $common.Count -eq 0) { return }
        $dir = $common[0].Trim()
        if (-not [System.IO.Path]::IsPathRooted($dir)) { $dir = Join-Path $script:repoTop $dir }
        $time = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
        $line = "$time`t$Hook`tcodex`tadapter: " + ($Reason -replace '\s+', ' ') + "`n"
        [System.IO.File]::AppendAllText((Join-Path $dir 'pck-hook-failures.log'), $line, (New-Object System.Text.UTF8Encoding($false)))
    } catch {
    }
}

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
    $script:repoTop = $repoRoot[0].Trim()

    $target = Join-Path $script:repoTop ".agents\hooks\$Hook.mjs"
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) {
        Write-HookFailure "hook script missing: .agents/hooks/$Hook.mjs"
        exit 0
    }

    $nodeArgs = @()
    if ($Codex) { $nodeArgs += '--host=codex' }
    if ([string]::IsNullOrEmpty($hookInput)) {
        & node $target @nodeArgs
    } else {
        $hookInput | & node $target @nodeArgs
    }
    if ($LASTEXITCODE -ne 0) {
        Write-HookFailure "node exited $LASTEXITCODE"
    }
} catch {
    # Hooks are advisory. Adapter failures must never block the host.
    Write-HookFailure $_.Exception.Message
}

exit 0
