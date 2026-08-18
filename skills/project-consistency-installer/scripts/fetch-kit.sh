#!/usr/bin/env bash
# 一致性机制 version: 2026-08-18
set -euo pipefail

repo_url="https://github.com/sparkler233/project-consistency-kit.git"
ref="${PROJECT_CONSISTENCY_KIT_REF:-main}"
cache_root="${XDG_CACHE_HOME:-${HOME:?HOME is required}/.cache}/project-consistency-kit"
offline=0

usage() {
  cat <<'EOF'
Usage: fetch-kit.sh [--repo URL] [--ref REF] [--cache-dir ABSOLUTE_PATH] [--offline]

Fetches a clean, read-only Project Consistency Kit checkout into a machine cache.
Prints the verified checkout path to stdout. Progress and commit details go to stderr.
EOF
}

fail() {
  printf 'fetch-kit: %s\n' "$*" >&2
  exit 1
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --repo)
      [ "$#" -ge 2 ] || fail "--repo requires a value"
      repo_url="$2"
      shift 2
      ;;
    --ref)
      [ "$#" -ge 2 ] || fail "--ref requires a value"
      ref="$2"
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
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "unknown argument: $1"
      ;;
  esac
done

[ -n "$repo_url" ] || fail "repository URL is empty"
[ -n "$ref" ] || fail "ref is empty"
case "$repo_url" in -*) fail "repository URL must not start with '-'" ;; esac
case "$ref" in -*) fail "ref must not start with '-'" ;; esac
case "$cache_root" in
  /*) ;;
  *) fail "cache directory must be an absolute path" ;;
esac
[ "$cache_root" != "/" ] || fail "cache directory must not be filesystem root"

repo_dir="$cache_root/repository"
[ ! -L "$repo_dir" ] || fail "refusing symlinked cache checkout: $repo_dir"
mkdir -p "$cache_root"

tmp_dir=""
cleanup() {
  if [ -n "$tmp_dir" ] && [ -d "$tmp_dir" ]; then
    rm -rf "$tmp_dir"
  fi
}
trap cleanup EXIT INT TERM

if [ ! -e "$repo_dir" ]; then
  [ "$offline" -eq 0 ] || fail "offline mode requested but cache is missing: $repo_dir"
  tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/project-consistency-kit.XXXXXX")
  git init --quiet "$tmp_dir/repository"
  git -C "$tmp_dir/repository" remote add origin "$repo_url"
  git -C "$tmp_dir/repository" fetch --quiet --depth 1 origin "$ref"
  git -C "$tmp_dir/repository" checkout --quiet --detach FETCH_HEAD
  [ ! -e "$repo_dir" ] || fail "cache appeared concurrently: $repo_dir"
  mv "$tmp_dir/repository" "$repo_dir"
elif ! git -C "$repo_dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  fail "cache path exists but is not a Git checkout: $repo_dir"
fi

actual_origin=$(git -C "$repo_dir" remote get-url origin 2>/dev/null || true)
[ "$actual_origin" = "$repo_url" ] || fail "cache origin mismatch: expected $repo_url, found ${actual_origin:-none}"

dirty=$(git -C "$repo_dir" status --porcelain --untracked-files=all)
[ -z "$dirty" ] || fail "cache checkout has local changes; refusing to overwrite: $repo_dir"

if [ "$offline" -eq 0 ]; then
  git -C "$repo_dir" fetch --quiet --depth 1 origin "$ref"
  git -C "$repo_dir" checkout --quiet --detach FETCH_HEAD
  git -C "$repo_dir" config projectConsistency.ref "$ref"
else
  cached_ref=$(git -C "$repo_dir" config --get projectConsistency.ref 2>/dev/null || true)
  [ "$cached_ref" = "$ref" ] || fail "offline cache ref mismatch: requested $ref, cached ${cached_ref:-unknown}"
fi

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
  [ -f "$repo_dir/$relative_path" ] || fail "downloaded source is incomplete: missing $relative_path"
done <<EOF
$required_paths
EOF

commit=$(git -C "$repo_dir" rev-parse HEAD)
printf 'fetch-kit: source=%s ref=%s commit=%s\n' "$repo_url" "$ref" "$commit" >&2
printf '%s\n' "$repo_dir"
