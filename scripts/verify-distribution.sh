#!/usr/bin/env bash
# 一致性机制 version: 2026-08-19
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source_root=$(cd "$script_dir/.." && pwd)
whitelist="$source_root/distribution/manifest.txt"
source_version_file="$source_root/一致性机制/VERSION"
allow_dirty=0
kit_dir=""

usage() {
  printf 'Usage: verify-distribution.sh [--allow-dirty] KIT_DIR\n'
}

fail() {
  printf 'verify-distribution: %s\n' "$*" >&2
  exit 1
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

while [ "$#" -gt 0 ]; do
  case "$1" in
    --allow-dirty)
      allow_dirty=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      fail "unknown argument: $1"
      ;;
    *)
      [ -z "$kit_dir" ] || fail "only one KIT_DIR may be provided"
      kit_dir="$1"
      shift
      ;;
  esac
done

[ -n "$kit_dir" ] || fail "KIT_DIR is required"
[ -f "$whitelist" ] || fail "distribution whitelist is missing: $whitelist"
duplicate_entry=$(awk 'NF && $1 !~ /^#/ { print }' "$whitelist" | LC_ALL=C sort | uniq -d)
[ -z "$duplicate_entry" ] || fail "duplicate whitelist entry: $duplicate_entry"
[ -d "$kit_dir" ] || fail "KIT_DIR is not a directory: $kit_dir"
[ ! -L "$kit_dir" ] || fail "KIT_DIR must not be a symlink"
kit_dir=$(cd "$kit_dir" && pwd)

[ -f "$kit_dir/DISTRIBUTION-METADATA.txt" ] || fail "missing DISTRIBUTION-METADATA.txt"
[ -f "$kit_dir/DISTRIBUTION-MANIFEST.sha256" ] || fail "missing DISTRIBUTION-MANIFEST.sha256"

if find "$kit_dir" -type l -print -quit | grep -q .; then
  fail "distribution must not contain symlinks"
fi
if find "$kit_dir" -name '.DS_Store' -print -quit | grep -q .; then
  fail "distribution contains .DS_Store"
fi

tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/project-consistency-verify.XXXXXX")
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT INT TERM

expected_files="$tmp_dir/expected-files.txt"
actual_files="$tmp_dir/actual-files.txt"
listed_checksums="$tmp_dir/listed-checksums.txt"

while IFS= read -r relative_path; do
  case "$relative_path" in
    ''|'#'*) continue ;;
    /*|../*|*/../*|*/..|.|-*) fail "unsafe whitelist entry: $relative_path" ;;
  esac
  case "$relative_path" in *'//'*) fail "invalid whitelist entry: $relative_path" ;; esac
  [ -f "$source_root/$relative_path" ] || fail "whitelisted source file is missing: $relative_path"
  printf '%s\n' "$relative_path"
done < "$whitelist" > "$expected_files"

printf '%s\n' 'DISTRIBUTION-METADATA.txt' 'DISTRIBUTION-MANIFEST.sha256' >> "$expected_files"
LC_ALL=C sort -u "$expected_files" -o "$expected_files"

(
  cd "$kit_dir"
  find . -type f -print | sed 's#^\./##' | LC_ALL=C sort
) > "$actual_files"

if ! diff -u "$expected_files" "$actual_files"; then
  fail "distribution file set differs from whitelist"
fi

sed -E 's/^[0-9a-f]{64}  //' "$kit_dir/DISTRIBUTION-MANIFEST.sha256" \
  | LC_ALL=C sort > "$listed_checksums"
grep -v '^DISTRIBUTION-MANIFEST\.sha256$' "$expected_files" > "$tmp_dir/expected-checksums.txt"
if ! diff -u "$tmp_dir/expected-checksums.txt" "$listed_checksums"; then
  fail "checksum manifest file set differs from whitelist"
fi

(
  cd "$kit_dir"
  checksum_verify DISTRIBUTION-MANIFEST.sha256
) >/dev/null

metadata="$kit_dir/DISTRIBUTION-METADATA.txt"
[ "$(metadata_value schema "$metadata")" = "1" ] || fail "unsupported metadata schema"
[ "$(metadata_value source_repository "$metadata")" = "https://github.com/sparkler233/project-consistency-kit.git" ] \
  || fail "unexpected source repository"
kit_version=$(metadata_value kit_version "$metadata")
mechanism_revision=$(metadata_value mechanism_revision "$metadata")
source_commit=$(metadata_value source_commit "$metadata")
source_ref=$(metadata_value source_ref "$metadata")
dirty=$(metadata_value dirty "$metadata")
[[ "$kit_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] || fail "invalid kit version"
[[ "$mechanism_revision" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || fail "invalid mechanism revision"
[[ "$source_commit" =~ ^[0-9a-f]{40}$ ]] || fail "invalid source commit"
[[ "$source_ref" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "invalid source ref"
source_version=$(tr -d '\r\n' < "$source_version_file")
packaged_version=$(tr -d '\r\n' < "$kit_dir/一致性机制/VERSION")
[ "$kit_version" = "$source_version" ] || fail "metadata kit version differs from source VERSION"
[ "$kit_version" = "$packaged_version" ] || fail "metadata kit version differs from packaged VERSION"
installer_version=$(sed -n 's/^  version: "\([^"]*\)"$/\1/p' "$kit_dir/skills/project-consistency-installer/SKILL.md")
[ "$installer_version" = "$kit_version" ] || fail "installer version differs from kit version"
packaged_revision=$(sed -n 's/^<!-- 一致性机制 version: \([0-9][0-9-]*\) -->$/\1/p' "$kit_dir/一致性机制/机制设计说明.md")
[ "$mechanism_revision" = "$packaged_revision" ] || fail "metadata mechanism revision differs from packaged files"
if [[ "$source_ref" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  [ "$source_ref" = "v$kit_version" ] || fail "release tag does not match kit version"
fi
case "$dirty" in
  false) ;;
  true) [ "$allow_dirty" -eq 1 ] || fail "dirty development build is not publishable" ;;
  *) fail "dirty metadata must be true or false" ;;
esac

for forbidden in \
  PROJECT.md \
  AGENTS.md \
  CLAUDE.md \
  一致性机制/文件联动目录.md \
  一致性机制/决策档案.md; do
  [ ! -e "$kit_dir/$forbidden" ] || fail "source-only file leaked into distribution: $forbidden"
done

archive_template="$kit_dir/templates/一致性机制/决策档案.md"
if grep -Eq '^- 20[0-9]{2}-' "$archive_template"; then
  fail "decision archive template contains project history"
fi

printf 'verify-distribution: kit_version=%s revision=%s source_ref=%s source_commit=%s files=%s\n' \
  "$kit_version" "$mechanism_revision" "$source_ref" "$source_commit" \
  "$(wc -l < "$actual_files" | tr -d ' ')"
