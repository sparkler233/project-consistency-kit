#!/usr/bin/env bash
# 一致性机制 version: 2026-10-01
# 从本仓库(内部工作仓库)的历史生成 GitHub 公开版历史:只保留 distribution/public-paths.txt 列出的路径,
# 接在公开仓库最初的 main(PUBLIC_BASE,内部仓库建立前的旧线)之后,作者与提交者统一为公开身份,
# 只改内部文件的提交自动略去。每次都从同一个基整段重新生成,同样输入得到同样的提交号,
# 所以上次公开的提交会原样重现,新提交接在后面,可以普通快进推送。
# 生成后检查:公开仓库当前的 main 必须原样包含在新历史里,新提交里不得重复已公开的提交;
# 新增提交的说明与改动里不得出现私人信息词表中的词(触及公开文件的提交,它的说明会原样公开)。
# 不满足就报错、不打印推送命令。脚本不推送,只打印推送命令。
# 私人信息词表只放在本机、不进仓库:默认是内部仓库的 .git/info/pck-private-words,每行一个不得公开的词
# (私人项目名、本机用户名、邮箱等,按原样比较),# 开头的行是注释;没有词表或词表为空时报错。
#
# 用法:scripts/publish-public.sh [--ref <提交>] [--out <新目录>] [--base-repo <仓库>] [--base <提交>] [--public-ref <引用>] [--words <词表>]
#   --ref         要公开到的内部提交,默认 HEAD(须已提交;工作区改动不会带上)
#   --words       私人信息词表的路径,默认见上
#   --out         生成公开历史的裸仓库目录(不得已存在),默认新建临时目录
#   --base-repo   公开仓库,默认 PUBLIC_URL;离线试跑可指向本机一份公开仓库的 clone
#   --base        内部历史接在哪个公开提交之后,默认 PUBLIC_BASE;一般不要改
#   --public-ref  公开仓库当前 main 的引用,用于检查新历史能否快进,默认 main
set -euo pipefail

PUBLIC_URL="https://github.com/sparkler233/project-consistency-kit.git"
PUBLIC_NAME="sparkler"
PUBLIC_EMAIL="sparkler233@users.noreply.github.com"
# 内部仓库建立前公开 main 的最后一个提交;内部历史永远接在它后面(换了它,已公开的提交就无法原样重现)
PUBLIC_BASE="84d54661270458f263cdccfc250242e388e543e4"

die() { printf '错误:%s\n' "$*" >&2; exit 1; }

ref=HEAD; out=""; base_repo=""; base="$PUBLIC_BASE"; public_ref=main; words=""
while [ $# -gt 0 ]; do
  case "$1" in
    --ref) ref="${2:?}"; shift 2 ;;
    --out) out="${2:?}"; shift 2 ;;
    --base-repo) base_repo="${2:?}"; shift 2 ;;
    --base) base="${2:?}"; shift 2 ;;
    --public-ref) public_ref="${2:?}"; shift 2 ;;
    --words) words="${2:?}"; shift 2 ;;
    *) die "未知参数 $1" ;;
  esac
done

root="$(git rev-parse --show-toplevel)"
list="$root/distribution/public-paths.txt"
[ -f "$list" ] || die "缺少 $list"
src="$(git -C "$root" rev-parse --verify "$ref^{commit}")"

# 私人信息词表:先确认它在,免得生成完才发现没法检查
if [ -z "$words" ]; then
  words="$(git -C "$root" rev-parse --git-path info/pck-private-words)"
  case "$words" in /*) ;; *) words="$root/$words" ;; esac
else
  case "$words" in /*) ;; *) words="$PWD/$words" ;; esac
fi
[ -f "$words" ] || die "缺少私人信息词表:$words
每行写一个不得公开的词(私人项目名、本机用户名、邮箱等),# 开头的行是注释;它只放在本机,不进仓库"
word_list="$(mktemp)"
trap 'rm -f "$word_list"' EXIT
grep -vE '^[[:space:]]*(#|$)' "$words" > "$word_list" || true
[ -s "$word_list" ] || die "私人信息词表是空的:$words"

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

repo="${base_repo:-$PUBLIC_URL}"
git fetch -q "$repo" "$public_ref" || die "取不到公开 main:$repo $public_ref"
current="$(git rev-parse FETCH_HEAD)"
git fetch -q "$repo" "$base" || die "取不到公开基:$repo $base"
base="$(git rev-parse --verify "$base^{commit}")"
git merge-base --is-ancestor "$base" "$current" || die "基 $base 不在公开 main 的历史里"
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
files="$(git ls-tree -r --name-only public | wc -l | tr -d ' ')"
printf '内部提交:%s\n公开基:%s\n公开 main:%s\n' "$src" "$base" "$current"

# 已公开的提交必须原样重现:公开 main 在新历史里,推送才是快进
git merge-base --is-ancestor "$current" public \
  || die "新历史不包含公开 main $current(已公开的提交没有原样重现),推送会分叉;检查 --base 与内部历史是否被改写"
# 新提交不得重复已公开的提交(同一作者时间与标题):基选错时内部历史会被整段重放一遍
dup="$(comm -12 <(git log --format='%ad %s' --date=raw "$current" | LC_ALL=C sort -u) \
                <(git log --format='%ad %s' --date=raw "$current..public" | LC_ALL=C sort -u) | head -n 3)"
[ -z "$dup" ] || die "新提交重复了已公开的提交(基选错会整段重放内部历史),例如:
$dup"
if [ "$tip" = "$current" ]; then
  printf '公开版:%s,与公开 main 相同,没有新提交,无需推送\n输出目录:%s\n' "$tip" "$out"
  exit 0
fi
# 私人信息检查:逐个看新增提交的说明、改动里新增的行与涉及的路径,出现词表中的词就报错
hits=""
for c in $(git rev-list --reverse "$current..public"); do
  found="$( { git log -1 --format=%B "$c"
              git -c core.quotepath=false show --no-color --format= "$c" | grep -E '^(\+|diff --git )' || true
            } | grep -F -f "$word_list" | head -n 3 || true)"
  [ -z "$found" ] || hits+="$(git log -1 --format='%h %<(50,trunc)%s' "$c"):
$found
"
done
[ -z "$hits" ] || die "新增的公开提交里出现了私人信息词表中的词,未打印推送命令。命中的提交与行:
$hits
处理办法:改写对应的内部提交说明或文件后重新生成;词表见 $words"

count="$(git rev-list --count "$current..public")"
printf '私人信息检查:新增提交的说明与改动里没有词表中的词\n'
printf '公开版:%s(在公开 main 后新增 %s 个提交,%s 个文件)\n输出目录:%s\n\n' "$tip" "$count" "$files" "$out"
git -c core.quotepath=false diff --stat=160 "$current" public | tail -n 1
printf '\n核对后推送(须维护者同意):\n  git -C %q push %s public:main\n' "$out" "$PUBLIC_URL"
printf '打发布标签:\n  git -C %q push %s public:refs/tags/v<VERSION>\n' "$out" "$PUBLIC_URL"
