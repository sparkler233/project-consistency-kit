# 一致性机制 version: 2026-08-20
[CmdletBinding(PositionalBinding = $false)]
param(
    [Alias("ref")]
    [string]$Release,

    [Alias("cache-dir")]
    [string]$CacheDir,

    [switch]$Offline,

    [Alias("verify-dir")]
    [string]$VerifyDir,

    [Alias("h")]
    [switch]$Help
)

# Windows adapter only. The security-sensitive download and verification logic
# remains canonical in fetch-kit.sh and runs through Git for Windows' Bash.

function Fail([string]$Message) {
    [Console]::Error.WriteLine("fetch-kit.ps1: $Message")
    exit 1
}

function Convert-ToGitBashPath([string]$InputPath) {
    $full = [System.IO.Path]::GetFullPath($InputPath)
    if ($full -match '^([A-Za-z]):\\(.*)$') {
        $drive = $Matches[1].ToLowerInvariant()
        $tail = $Matches[2].Replace('\', '/')
        return "/$drive/$tail"
    }
    Fail "UNC and non-drive paths are not supported: $InputPath"
}

$gitCommand = Get-Command git.exe -ErrorAction SilentlyContinue
if (-not $gitCommand) {
    $gitCommand = Get-Command git -ErrorAction SilentlyContinue
}
if (-not $gitCommand) {
    Fail "Git for Windows is required"
}

$gitRoot = Split-Path (Split-Path $gitCommand.Source -Parent) -Parent
$candidates = @(
    (Join-Path $gitRoot "bin\bash.exe"),
    (Join-Path $gitRoot "usr\bin\bash.exe")
)
$bash = $candidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
if (-not $bash) {
    Fail "Git Bash was not found next to $($gitCommand.Source)"
}

$shellScript = Join-Path $PSScriptRoot "fetch-kit.sh"
if (-not (Test-Path -LiteralPath $shellScript -PathType Leaf)) {
    Fail "fetch-kit.sh is missing next to this adapter"
}
$shellScriptBash = Convert-ToGitBashPath $shellScript

if ($Help) {
    & $bash $shellScriptBash --help
    exit $LASTEXITCODE
}

$arguments = @()
if ($Release) {
    $arguments += @("--release", $Release)
}
if ($CacheDir) {
    $arguments += @("--cache-dir", (Convert-ToGitBashPath $CacheDir))
}
if ($Offline) {
    $arguments += "--offline"
}
if ($VerifyDir) {
    $arguments += @("--verify-dir", (Convert-ToGitBashPath $VerifyDir))
}

$stdout = @(& $bash $shellScriptBash @arguments)
$exitCode = $LASTEXITCODE
if ($exitCode -ne 0) {
    $stdout | ForEach-Object { Write-Output $_ }
    exit $exitCode
}
if ($stdout.Count -eq 0) {
    Fail "fetch-kit.sh returned no verified distribution path"
}

for ($index = 0; $index -lt $stdout.Count - 1; $index++) {
    Write-Output $stdout[$index]
}
$verifiedBashPath = [string]$stdout[-1]
$verifiedWindowsPath = @(& $bash -lc 'cygpath -w -- "$1"' -- $verifiedBashPath) | Select-Object -Last 1
if ($LASTEXITCODE -ne 0 -or -not $verifiedWindowsPath) {
    Fail "could not convert the verified distribution path for Windows"
}
Write-Output $verifiedWindowsPath
