#!/usr/bin/env bash
# 一致性机制 version: 2026-09-27
# 从本仓库(内部工作仓库)的历史生成 GitHub 公开版历史:只保留 distribution/public-paths.txt 列出的路径,
# 接在公开仓库现有 main 之后,作者与提交者统一为公开身份,只改内部文件的提交自动略去。
# 同样输入得到同样的提交号,之后每次重跑都能普通快进推送。脚本不推送,只打印推送命令。
#
# 用法:scripts/publish-public.sh [--ref <提交>] [--out <新目录>] [--base-repo <仓库>] [--base-ref <引用>]
#   --ref        要公开到的内部提交,默认 HEAD(须已提交;工作区改动不会带上)
#   --out        生成公开历史的裸仓库目录(不得已存在),默认新建临时目录
#   --base-repo  取公开 main 的仓库,默认 PUBLIC_URL;离线试跑可指向本机一份公开仓库的 clone
#   --base-ref   该仓库中公开 main 的引用,默认 main
set -euo pipefail

PUBLIC_URL="https://github.com/sparkler233/project-consistency-kit.git"
PUBLIC_NAME="sparkler"
PUBLIC_EMAIL="sparkler233@users.noreply.github.com"

die() { printf '错误:%s\n' "$*" >&2; exit 1; }

ref=HEAD; out=""; base_repo=""; base_ref=main
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) ref="${2:?}"; shift 2 ;;
    --out) out="${2:?}"; shift 2 ;;
    --base-repo) base_repo="${2:?}"; shift 2 ;;
    --base-ref) base_ref="${2:?}"; shift 2 ;;
    *) die "未知参数 $1" ;;
  esac
done

root="$(git rev-parse --show-toplevel)"
list="$root/distribution/public-paths.txt"
[ -f "$list" ] || die "缺少 $list"
src="$(git -C "$root" rev-parse --verify "$ref^{commit}")"

# 白名单转成 git rm 的排除 pathspec:删除除白名单以外的一切
keep=()
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in ''|'#'*) continue ;; esac
  keep+=(":(top,exclude)$line")
done < "$list"
[ ${#keep[@]} -gt 0 ] || die "白名单为空"
index_filter="git rm -r -q --cached --ignore-unmatch -- ."
for p in "${keep[@]}"; do index_filter+=" $(printf '%q' "$p")"; done

if [ -z "$out" ]; then out="$(mktemp -d)/public"; fi
[ -e "$out" ] && die "输出目录已存在:$out"

git clone -q --bare --no-local "$root" "$out"
cd "$out"
for t in $(git for-each-ref --format='%(refname)' refs/tags); do git update-ref -d "$t"; done
git remote remove origin 2>/dev/null || true
git branch -q -f public "$src"
git symbolic-ref HEAD refs/heads/public

git fetch -q "${base_repo:-$PUBLIC_URL}" "$base_ref" || die "取不到公开 main:${base_repo:-$PUBLIC_URL} $base_ref"
base="$(git rev-parse FETCH_HEAD)"
first="$(git rev-list --max-parents=0 public)"
[ "$(printf '%s\n' "$first" | wc -l | tr -d ' ')" = 1 ] || die "内部历史有多个起点,需先确认接法"

export FILTER_BRANCH_SQUELCH_WARNING=1
git filter-branch -f --prune-empty \
  --index-filter "$index_filter" \
  --env-filter "export GIT_AUTHOR_NAME='$PUBLIC_NAME' GIT_AUTHOR_EMAIL='$PUBLIC_EMAIL' GIT_COMMITTER_NAME='$PUBLIC_NAME' GIT_COMMITTER_EMAIL='$PUBLIC_EMAIL'" \
  --parent-filter "if [ \"\$GIT_COMMIT\" = $first ]; then echo '-p $base'; else cat; fi" \
  -- public >/dev/null
git update-ref -d refs/original/refs/heads/public

git merge-base --is-ancestor "$base" public || die "公开历史没有接在 $base 之后"
tip="$(git rev-parse public)"
count="$(git rev-list --count "$base..public")"
files="$(git ls-tree -r --name-only public | wc -l | tr -d ' ')"

printf '内部提交:%s\n公开 main:%s\n公开版:%s(新增 %s 个提交,%s 个文件)\n输出目录:%s\n\n' "$src" "$base" "$tip" "$count" "$files" "$out"
git -c core.quotepath=false diff --stat=160 "$base" public | tail -n 1
printf '\n核对后推送(须维护者同意):\n  git -C %q push %s public:main\n' "$out" "$PUBLIC_URL"
printf '打发布标签:\n  git -C %q push %s public:refs/tags/v<VERSION>\n' "$out" "$PUBLIC_URL"
