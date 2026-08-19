#!/bin/bash
# 一致性机制 version: 2026-08-19
# ─────────────────────────────────────────────────────────────
# 收尾提醒.sh · 旧接线兼容包装
#   跨平台判断逻辑已经迁入 .agents/hooks/wrapup-reminder.mjs。本文件保留给升级过程中
#   尚未切换的旧 Claude Code / Codex 接线,不再维护第二份业务逻辑。
# ─────────────────────────────────────────────────────────────

repo_root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
exec node "$repo_root/.agents/hooks/wrapup-reminder.mjs"
