#!/usr/bin/env bash
# 一致性机制 version: 2026-08-20
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source_root=$(cd "$script_dir/.." && pwd)
whitelist="$source_root/distribution/manifest.txt"
version_file="$source_root/一致性机制/VERSION"
installer_skill="$source_root/skills/project-consistency-installer/SKILL.md"
design_doc="$source_root/一致性机制/机制设计说明.md"
output_dir=""
source_ref=""
allow_dirty=0

usage() {
  cat <<'EOF'
Usage: build-distribution.sh --output-dir ABSOLUTE_PATH [--source-ref REF] [--allow-dirty]

Builds a clean project-consistency-kit directory, tar.gz archive, and SHA-256 file.
EOF
}

fail() {
  printf 'build-distribution: %s\n' "$*" >&2
  exit 1
}

checksum_value() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{ print $1 }'
  else
    fail "sha256sum or shasum is required"
  fi
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --output-dir)
      [ "$#" -ge 2 ] || fail "--output-dir requires a value"
      output_dir="$2"
      shift 2
      ;;
    --source-ref)
      [ "$#" -ge 2 ] || fail "--source-ref requires a value"
      source_ref="$2"
      shift 2
      ;;
    --allow-dirty)
      allow_dirty=1
      shift
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

[ -n "$output_dir" ] || fail "--output-dir is required"
case "$output_dir" in /*) ;; *) fail "output directory must be absolute" ;; esac
[ "$output_dir" != "/" ] || fail "output directory must not be filesystem root"
[ -f "$whitelist" ] || fail "distribution whitelist is missing: $whitelist"
[ -f "$version_file" ] || fail "kit version file is missing: $version_file"
[ -f "$installer_skill" ] || fail "installer skill is missing: $installer_skill"
[ -f "$design_doc" ] || fail "mechanism design document is missing: $design_doc"
duplicate_entry=$(awk 'NF && $1 !~ /^#/ { print }' "$whitelist" | LC_ALL=C sort | uniq -d)
[ -z "$duplicate_entry" ] || fail "duplicate whitelist entry: $duplicate_entry"
git -C "$source_root" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || fail "source root is not a Git repository"

kit_version=$(tr -d '\r\n' < "$version_file")
[[ "$kit_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]] \
  || fail "kit version is not valid SemVer: $kit_version"
installer_version=$(sed -n 's/^  version: "\([^"]*\)"$/\1/p' "$installer_skill")
[ -n "$installer_version" ] || fail "installer skill metadata.version is missing"
[ "$installer_version" = "$kit_version" ] \
  || fail "installer version $installer_version does not match kit version $kit_version"
mechanism_revision=$(sed -n 's/^<!-- 一致性机制 version: \([0-9][0-9-]*\) -->$/\1/p' "$design_doc")
[[ "$mechanism_revision" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] \
  || fail "mechanism revision is missing or invalid"
revision_values=$(
  {
    git -C "$source_root" grep -hE '^(<!-- |# )一致性机制 version: [0-9]{4}-[0-9]{2}-[0-9]{2}'
    grep -hE '^<!-- 一致性机制:同步纪律 begin \(version: [0-9]{4}-[0-9]{2}-[0-9]{2}\) -->$' \
      "$source_root/AGENTS.md" "$source_root/templates/AGENTS.md"
  } | sed -E 's/.*version: ([0-9]{4}-[0-9]{2}-[0-9]{2}).*/\1/' | LC_ALL=C sort -u
)
[ "$revision_values" = "$mechanism_revision" ] \
  || fail "mechanism revision markers are inconsistent: $revision_values"
grep -Fqx "## v$kit_version — $mechanism_revision" "$source_root/CHANGELOG.md" \
  || fail "CHANGELOG is missing current version heading: v$kit_version — $mechanism_revision"

source_commit=$(git -C "$source_root" rev-parse HEAD)
if [ -z "$source_ref" ]; then
  source_ref=$(git -C "$source_root" describe --tags --exact-match 2>/dev/null || printf '%s' "$source_commit")
fi
[[ "$source_ref" =~ ^[A-Za-z0-9._/-]+$ ]] || fail "source ref contains unsupported characters"
if [[ "$source_ref" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$ ]]; then
  [ "$source_ref" = "v$kit_version" ] \
    || fail "release tag $source_ref does not match kit version v$kit_version"
fi

dirty_state=$(git -C "$source_root" status --porcelain --untracked-files=all)
if [ -n "$dirty_state" ] && [ "$allow_dirty" -ne 1 ]; then
  fail "source worktree is dirty; commit first or use --allow-dirty for local validation only"
fi
if [ -n "$dirty_state" ]; then dirty=true; else dirty=false; fi

kit_dir="$output_dir/project-consistency-kit"
archive="$output_dir/project-consistency-kit.tar.gz"
archive_checksum="$archive.sha256"
for output_path in "$kit_dir" "$archive" "$archive_checksum"; do
  [ ! -e "$output_path" ] || fail "output already exists: $output_path"
done
mkdir -p "$output_dir"

tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/project-consistency-build.XXXXXX")
stage="$tmp_dir/project-consistency-kit"
mkdir -p "$stage"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT INT TERM

while IFS= read -r relative_path; do
  # Git for Windows may check the whitelist out with CRLF. Normalize the
  # record boundary before treating it as a repository-relative path.
  relative_path=${relative_path%$'\r'}
  case "$relative_path" in
    ''|'#'*) continue ;;
    /*|../*|*/../*|*/..|.|-*) fail "unsafe whitelist entry: $relative_path" ;;
  esac
  case "$relative_path" in *'//'*) fail "invalid whitelist entry: $relative_path" ;; esac
  [ -f "$source_root/$relative_path" ] || fail "whitelisted file is missing: $relative_path"
  if [ "$allow_dirty" -ne 1 ]; then
    git -C "$source_root" ls-files --error-unmatch -- "$relative_path" >/dev/null 2>&1 \
      || fail "whitelisted file is not tracked: $relative_path"
  fi
  mkdir -p "$stage/$(dirname "$relative_path")"
  cp -p "$source_root/$relative_path" "$stage/$relative_path"
done < "$whitelist"

printf '%s\n' \
  'schema=1' \
  "kit_version=$kit_version" \
  "mechanism_revision=$mechanism_revision" \
  'source_repository=https://github.com/sparkler233/project-consistency-kit.git' \
  "source_commit=$source_commit" \
  "source_ref=$source_ref" \
  "dirty=$dirty" \
  > "$stage/DISTRIBUTION-METADATA.txt"

(
  cd "$stage"
  find . -type f ! -name 'DISTRIBUTION-MANIFEST.sha256' -print \
    | sed 's#^\./##' \
    | LC_ALL=C sort \
    | while IFS= read -r relative_path; do
        printf '%s  %s\n' "$(checksum_value "$relative_path")" "$relative_path"
      done
) > "$stage/DISTRIBUTION-MANIFEST.sha256"

verify_args=()
if [ "$allow_dirty" -eq 1 ]; then verify_args+=(--allow-dirty); fi
"$script_dir/verify-distribution.sh" "${verify_args[@]}" "$stage"

mv "$stage" "$kit_dir"
# macOS bsdtar otherwise serializes extended attributes as AppleDouble `._*`
# entries. They become real unverified files when the archive is extracted on
# Windows, so disable copyfile metadata for a portable release artifact.
COPYFILE_DISABLE=1 tar -C "$output_dir" -czf "$archive" project-consistency-kit
archive_hash=$(checksum_value "$archive")
printf '%s  %s\n' "$archive_hash" "$(basename "$archive")" > "$archive_checksum"

printf 'build-distribution: kit_version=%s mechanism_revision=%s\n' "$kit_version" "$mechanism_revision"
printf 'build-distribution: directory=%s\n' "$kit_dir"
printf 'build-distribution: archive=%s\n' "$archive"
printf 'build-distribution: checksum=%s\n' "$archive_checksum"
