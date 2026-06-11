#!/bin/bash
# 一致性机制 version: 2026-06-12
# ─────────────────────────────────────────────────────────────
# 收尾提醒.sh · 一致性机制出向兜底 hook(挂 Claude Code 的 Stop 事件)
#   AI 每轮回答结束时运行:项目装了机制 + 工作区有未同步改动 + 本脏周期
#   还没提醒过 → 给用户弹一行 systemMessage,建议收尾跑 /同步。
# 三条红线(见 一致性机制/机制设计说明.md 决策 10):
#   1. 只提醒不行动:永远 exit 0,不打断 AI、不自动同步/commit/push。
#   2. 每个脏周期最多一次:状态文件防唠叨,/同步 清零后自动重新武装。
#   3. 零工具依赖:bash+git+sed;接线(settings.json)才是 Claude Code 专属,
#      换别的 agent 只需用它的 hook 机制重新接线、脚本原样复用。
# 接线(项目 .claude/settings.json):
#   {"hooks":{"Stop":[{"hooks":[{"type":"command",
#     "command":"bash \"$CLAUDE_PROJECT_DIR/一致性机制/hooks/收尾提醒.sh\"",
#     "timeout":10}]}]}}
# ─────────────────────────────────────────────────────────────

# 1) 读 stdin JSON,提取 session_id(防唠叨状态按 会话×项目 隔离)
input=$(cat)
session_id=$(printf '%s' "$input" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
[ -n "$session_id" ] || session_id="nosession"

# 2) 定位项目 + 自门控:没装机制 / 不是 git repo → 静默退出
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
[ -f "一致性机制/文件联动目录.md" ] || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# 3) 统计未同步改动:已跟踪(自 synced 起,含已 commit 未同步)+ 未跟踪
if git rev-parse -q --verify refs/tags/synced >/dev/null 2>&1; then
  tracked=$(git diff --name-only synced 2>/dev/null | wc -l | tr -d ' ')
else
  tracked=$(git status --porcelain 2>/dev/null | grep -cv '^??')
fi
untracked=$(git status --porcelain 2>/dev/null | grep -c '^??')
N=$(( ${tracked:-0} + ${untracked:-0} ))

# 4) 防唠叨状态机:干净 → 删状态(重新武装);脏且已提醒过 → 静默
proj_hash=$(pwd | md5 2>/dev/null | cut -c1-8); [ -n "$proj_hash" ] || proj_hash="noproj"
state="/tmp/一致性机制-提醒-${session_id}-${proj_hash}"
if [ "$N" -eq 0 ]; then rm -f "$state"; exit 0; fi
[ -f "$state" ] && exit 0
touch "$state" 2>/dev/null

# 5) 提醒(给用户看的 systemMessage,不进 AI 上下文、不阻塞任何动作)
printf '{"systemMessage":"⚠️ 一致性机制:%s 个文件自上次同步后有改动,收尾前建议跑 /同步"}' "$N"
exit 0
