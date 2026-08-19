#!/bin/bash
# 一致性机制 version: 2026-08-19
# ─────────────────────────────────────────────────────────────
# 收尾提醒.sh · 一致性机制跨宿主 Stop hook
#   Claude Code 与 Codex 本地客户端共用本脚本。AI 每轮回答结束时运行:
#   项目装了机制 + 工作区有未同步改动 + 本脏周期还没提醒过
#   → 给用户显示一行 systemMessage,建议执行当前宿主的 wrapup 入口。
# 三条红线(见 一致性机制/机制设计说明.md 决策 10/23):
#   1. 只提醒不行动:永远 exit 0,不自动续跑、不自动 wrapup/commit/push。
#   2. 每个脏周期最多一次:状态文件防唠叨,wrapup 清零后自动重新武装。
#   3. 逻辑与接线分离:本脚本是共享正本,.claude/settings.json 与
#      .codex/hooks.json 只负责各自宿主的 Stop 事件接线。
# ─────────────────────────────────────────────────────────────

# 1) 读 stdin JSON,提取 session_id(防唠叨状态按 会话×项目 隔离)
input=$(cat)
session_id=$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
[ -n "$session_id" ] || session_id="nosession"
safe_session=$(printf '%s' "$session_id" | tr -c 'A-Za-z0-9._-' '_')

# 2) 定位项目 + 自门控。Claude 提供项目根变量;Codex 从会话 cwd 启动,
#    两者最终都用 git 根归一,避免 Agent 从仓库子目录启动时漏检。
if [ -n "${CLAUDE_PROJECT_DIR:-}" ]; then
  start_dir="$CLAUDE_PROJECT_DIR"
  wrapup_entry="/wrapup"
else
  start_dir="."
  wrapup_entry='$wrapup'
fi
cd "$start_dir" 2>/dev/null || exit 0
repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$repo_root" 2>/dev/null || exit 0
[ -f "一致性机制/文件联动目录.md" ] || exit 0

# 3) 统计未同步改动:已跟踪(自 synced 起,含已 commit 未同步)+ 未跟踪
status=$(git status --porcelain 2>/dev/null)
if git rev-parse -q --verify refs/tags/synced >/dev/null 2>&1; then
  tracked=$(git diff --name-only synced 2>/dev/null | wc -l | tr -d ' ')
else
  tracked=$(printf '%s' "$status" | grep -cv '^??')
fi
untracked=$(printf '%s' "$status" | grep -c '^??')
N=$(( ${tracked:-0} + ${untracked:-0} ))

# 4) 防唠叨状态机:干净 → 删状态(重新武装);脏且已提醒过 → 静默
proj_hash=$(printf '%s' "$repo_root" | cksum 2>/dev/null | cut -d ' ' -f1)
[ -n "$proj_hash" ] || proj_hash="noproj"
state="${TMPDIR:-/tmp}/project-consistency-reminder-${safe_session}-${proj_hash}"
if [ "$N" -eq 0 ]; then rm -f "$state"; exit 0; fi
[ -f "$state" ] && exit 0
touch "$state" 2>/dev/null

# 5) 只显示 systemMessage。Codex Stop 不得返回 decision:block,否则会续跑。
printf '{"systemMessage":"⚠️ 一致性机制:%s 个文件自上次同步后有改动,收尾前建议执行 %s"}' "$N" "$wrapup_entry"
exit 0
