#!/usr/bin/env bash
# 一致性机制 version: 2026-08-18
set -euo pipefail

canonical_repository="https://github.com/sparkler233/project-consistency-kit.git"
release_base="https://github.com/sparkler233/project-consistency-kit/releases"
release="${PROJECT_CONSISTENCY_KIT_RELEASE:-latest}"
cache_root="${XDG_CACHE_HOME:-${HOME:?HOME is required}/.cache}/project-consistency-kit"
offline=0
verify_dir=""
tmp_dir=""
validation_tmp=""
validated_commit=""
validated_ref=""

usage() {
  cat <<'EOF'
Usage: fetch-kit.sh [--release TAG|latest] [--cache-dir ABSOLUTE_PATH] [--offline]
       fetch-kit.sh --verify-dir ABSOLUTE_PATH

Downloads and verifies the clean Project Consistency Kit GitHub Release into a
machine cache. Prints the verified distribution path to stdout. Progress and
source provenance go to stderr.

--ref is retained as a deprecated alias for --release.
EOF
}

fail() {
  printf 'fetch-kit: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [ -n "$validation_tmp" ] && [ -d "$validation_tmp" ]; then
    rm -rf "$validation_tmp"
  fi
  if [ -n "$tmp_dir" ] && [ -d "$tmp_dir" ]; then
    rm -rf "$tmp_dir"
  fi
}
trap cleanup EXIT INT TERM

checksum_value() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{ print $1 }'
  else
    fail "sha256sum or shasum is required"
  fi
}

checksum_verify() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c "$1"
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c "$1"
  else
    fail "sha256sum or shasum is required"
  fi
}

metadata_value() {
  local key="$1"
  local file="$2"
  local count
  local value
  count=$(awk -F= -v key="$key" '$1 == key { count++ } END { print count + 0 }' "$file")
  [ "$count" -eq 1 ] || fail "metadata key must appear exactly once: $key"
  value=$(awk -F= -v key="$key" '$1 == key { print substr($0, length(key) + 2) }' "$file")
  [ -n "$value" ] || fail "metadata value is empty: $key"
  printf '%s\n' "$value"
}

validate_distribution() {
  local distribution_dir="$1"
  local manifest
  local metadata
  local actual_files
  local listed_files
  local relative_path

  [ -d "$distribution_dir" ] || fail "distribution directory is missing: $distribution_dir"
  [ ! -L "$distribution_dir" ] || fail "refusing symlinked distribution: $distribution_dir"
  manifest="$distribution_dir/DISTRIBUTION-MANIFEST.sha256"
  metadata="$distribution_dir/DISTRIBUTION-METADATA.txt"
  [ -f "$manifest" ] || fail "distribution checksum manifest is missing"
  [ -f "$metadata" ] || fail "distribution metadata is missing"

  if find "$distribution_dir" -type l -print -quit | grep -q .; then
    fail "distribution contains a symlink"
  fi
  if find "$distribution_dir" -name '.DS_Store' -print -quit | grep -q .; then
    fail "distribution contains .DS_Store"
  fi

  validation_tmp=$(mktemp -d "${TMPDIR:-/tmp}/project-consistency-fetch-verify.XXXXXX")
  actual_files="$validation_tmp/actual-files.txt"
  listed_files="$validation_tmp/listed-files.txt"
  (
    cd "$distribution_dir"
    find . -type f ! -name 'DISTRIBUTION-MANIFEST.sha256' -print \
      | sed 's#^\./##' \
      | LC_ALL=C sort
  ) > "$actual_files"
  sed -E 's/^[0-9a-f]{64}  //' "$manifest" | LC_ALL=C sort > "$listed_files"
  if ! diff -u "$listed_files" "$actual_files"; then
    fail "cached distribution contains unverified or missing files"
  fi
  (
    cd "$distribution_dir"
    checksum_verify DISTRIBUTION-MANIFEST.sha256
  ) >/dev/null

  [ "$(metadata_value schema "$metadata")" = "1" ] || fail "unsupported metadata schema"
  [ "$(metadata_value source_repository "$metadata")" = "$canonical_repository" ] \
    || fail "distribution source repository mismatch"
  validated_commit=$(metadata_value source_commit "$metadata")
  validated_ref=$(metadata_value source_ref "$metadata")
  [ "$(metadata_value dirty "$metadata")" = "false" ] || fail "dirty distribution is not publishable"
  [[ "$validated_commit" =~ ^[0-9a-f]{40}$ ]] || fail "invalid source commit in metadata"
  [[ "$validated_ref" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "invalid source ref in metadata"

  required_paths='skills/project-consistency-installer/SKILL.md
skills/project-consistency-installer/scripts/fetch-kit.sh
.agents/skills/catchup/SKILL.md
.agents/skills/wrapup/SKILL.md
.claude/commands/catchup.md
.claude/commands/wrapup.md
templates/PROJECT.md
templates/AGENTS.md
templates/一致性机制/文件联动目录.md
templates/一致性机制/决策档案.md
一致性机制/README.md
一致性机制/机制设计说明.md
一致性机制/hooks/收尾提醒.sh
LICENSE'
  while IFS= read -r relative_path; do
    [ -f "$distribution_dir/$relative_path" ] \
      || fail "distribution is incomplete: missing $relative_path"
  done <<EOF
$required_paths
EOF

  for relative_path in \
    PROJECT.md \
    AGENTS.md \
    CLAUDE.md \
    一致性机制/文件联动目录.md \
    一致性机制/决策档案.md; do
    [ ! -e "$distribution_dir/$relative_path" ] \
      || fail "source-only file leaked into distribution: $relative_path"
  done
  if grep -Eq '^- 20[0-9]{2}-' "$distribution_dir/templates/一致性机制/决策档案.md"; then
    fail "decision archive template contains project history"
  fi

  rm -rf "$validation_tmp"
  validation_tmp=""
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --release|--ref)
      [ "$#" -ge 2 ] || fail "$1 requires a value"
      release="$2"
      shift 2
      ;;
    --repo)
      [ "$#" -ge 2 ] || fail "--repo requires a value"
      [ "$2" = "$canonical_repository" ] \
        || fail "custom remote repositories are not fetched; provide a trusted local kit path instead"
      shift 2
      ;;
    --cache-dir)
      [ "$#" -ge 2 ] || fail "--cache-dir requires a value"
      cache_root="$2"
      shift 2
      ;;
    --offline)
      offline=1
      shift
      ;;
    --verify-dir)
      [ "$#" -ge 2 ] || fail "--verify-dir requires a value"
      verify_dir="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

if [ -n "$verify_dir" ]; then
  [ "$offline" -eq 0 ] || fail "--verify-dir cannot be combined with --offline"
  case "$verify_dir" in /*) ;; *) fail "verification directory must be absolute" ;; esac
  validate_distribution "$verify_dir"
  printf 'fetch-kit: source=%s release=%s commit=%s mode=local-verify\n' \
    "$canonical_repository" "$validated_ref" "$validated_commit" >&2
  printf '%s\n' "$(cd "$verify_dir" && pwd)"
  exit 0
fi

case "$release" in
  latest) ;;
  *) [[ "$release" =~ ^[A-Za-z0-9._-]+$ ]] || fail "release tag contains unsupported characters" ;;
esac
case "$cache_root" in /*) ;; *) fail "cache directory must be absolute" ;; esac
[ "$cache_root" != "/" ] || fail "cache directory must not be filesystem root"
[ ! -L "$cache_root" ] || fail "cache root must not be a symlink"
mkdir -p "$cache_root"

distribution_dir="$cache_root/distribution"
[ ! -L "$distribution_dir" ] || fail "refusing symlinked cache distribution"
if [ -e "$distribution_dir" ]; then
  validate_distribution "$distribution_dir"
fi

if [ "$offline" -eq 1 ]; then
  [ -d "$distribution_dir" ] || fail "offline mode requested but release cache is missing"
  if [ "$release" != "latest" ] && [ "$validated_ref" != "$release" ]; then
    fail "offline release mismatch: requested $release, cached $validated_ref"
  fi
  printf 'fetch-kit: source=%s release=%s commit=%s mode=offline\n' \
    "$canonical_repository" "$validated_ref" "$validated_commit" >&2
  printf '%s\n' "$distribution_dir"
  exit 0
fi

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v tar >/dev/null 2>&1 || fail "tar is required"
tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/project-consistency-release.XXXXXX")
archive="$tmp_dir/project-consistency-kit.tar.gz"
archive_checksum="$archive.sha256"
if [ "$release" = "latest" ]; then
  download_base="$release_base/latest/download"
else
  download_base="$release_base/download/$release"
fi

curl -fsSL --proto '=https' --tlsv1.2 \
  "$download_base/project-consistency-kit.tar.gz" -o "$archive"
curl -fsSL --proto '=https' --tlsv1.2 \
  "$download_base/project-consistency-kit.tar.gz.sha256" -o "$archive_checksum"

checksum_count=$(awk '$2 == "project-consistency-kit.tar.gz" { count++ } END { print count + 0 }' "$archive_checksum")
[ "$checksum_count" -eq 1 ] || fail "release checksum file is invalid"
expected_hash=$(awk '$2 == "project-consistency-kit.tar.gz" { print $1 }' "$archive_checksum")
[[ "$expected_hash" =~ ^[0-9a-f]{64}$ ]] || fail "release checksum is invalid"
actual_hash=$(checksum_value "$archive")
[ "$actual_hash" = "$expected_hash" ] || fail "release archive checksum mismatch"

mkdir -p "$tmp_dir/extracted"
tar -tzf "$archive" > "$tmp_dir/archive-entries.txt"
if awk '
  $0 !~ /^project-consistency-kit(\/|$)/ { bad = 1 }
  $0 ~ /(^|\/)\.\.(\/|$)/ { bad = 1 }
  END { exit bad ? 0 : 1 }
' "$tmp_dir/archive-entries.txt"; then
  fail "release archive contains an unsafe path"
fi
if tar -tvzf "$archive" | awk '
  substr($1, 1, 1) == "l" || substr($1, 1, 1) == "h" { bad = 1 }
  END { exit bad ? 0 : 1 }
'; then
  fail "release archive contains a link entry"
fi
tar -xzf "$archive" -C "$tmp_dir/extracted"
new_distribution="$tmp_dir/extracted/project-consistency-kit"
[ "$(find "$tmp_dir/extracted" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')" -eq 1 ] \
  || fail "release archive must contain exactly one top-level directory"
validate_distribution "$new_distribution"
if [ "$release" != "latest" ] && [ "$validated_ref" != "$release" ]; then
  fail "release metadata mismatch: requested $release, downloaded $validated_ref"
fi
new_commit="$validated_commit"
new_ref="$validated_ref"

if [ -d "$distribution_dir" ] \
  && [ "$new_commit" = "$(metadata_value source_commit "$distribution_dir/DISTRIBUTION-METADATA.txt")" ] \
  && [ "$new_ref" = "$(metadata_value source_ref "$distribution_dir/DISTRIBUTION-METADATA.txt")" ]; then
  printf 'fetch-kit: cached release already current\n' >&2
else
  if [ -d "$distribution_dir" ]; then
    rm -rf "$distribution_dir"
  fi
  mv "$new_distribution" "$distribution_dir"
fi

validate_distribution "$distribution_dir"
if [ "$release" != "latest" ] && [ "$validated_ref" != "$release" ]; then
  fail "cached release mismatch after update: requested $release, cached $validated_ref"
fi
printf 'fetch-kit: source=%s release=%s commit=%s mode=release\n' \
  "$canonical_repository" "$validated_ref" "$validated_commit" >&2
printf '%s\n' "$distribution_dir"
