# Project Consistency Kit — 本仓库 Agent 规则

本项目使用项目一致性机制,运行规则见 `一致性机制/运行规则.md`,全程有效(Claude Code 经下一行自动导入;其他宿主开始工作前先读):

@一致性机制/运行规则.md

上下文被压缩后,若要继续工作:先重读 `PROJECT.md`;运行规则若未随本文件自动载入,也重读 `一致性机制/运行规则.md`(决策 53)。

## 本仓库(套件源仓库)的开发规则

- **单一正本**:项目事实以 `PROJECT.md` 为准;公开说明以 `README.md` 为准;本仓库自身规则以本文件为准;机制运行规则以 `一致性机制/运行规则.md` 为准;正式套件版本以 `一致性机制/VERSION` 为准;catchup / wrapup 行为以 `.agents/skills/` 为准;安装行为以 `skills/project-consistency-installer/` 为准;收尾提醒逻辑以 `.agents/hooks/wrapup-reminder.mjs` 为准,`.agents/hooks/wrapup-reminder.ps1` 只做 Windows Codex 薄适配;分发白名单与构建行为以 `distribution/manifest.txt`、`scripts/` 和 `.github/workflows/distribution.yml` 为准;`.claude/commands/` 只做 Claude Code 入口适配,`.claude/settings.json` 与 `.codex/hooks.json` 只做宿主 Stop 接线;机制原理与决策理由以 `一致性机制/机制设计说明.md` 为准;版本变化以 `CHANGELOG.md` 为准;决策 45 起的决策全文与过程历史以 git 提交正文为准。
- **机制发版纪律**:任何机制文件发生真实变化,先判断 SemVer 的 major / minor / patch 影响,同步 `一致性机制/VERSION` 与安装器 metadata,统一推进全部修订日期到当天,更新 `CHANGELOG.md`,并检查初始化、安装器、公开文档、模板和设计说明是否联动。涉及分发的改动先在本仓库以不进入分发清单的方式试用(决策 51)。
- **架构修改**:先讨论设计取舍,再改实现;被推翻的决策在设计说明中保留演进线索。
- **外部实战反馈**:其他项目在安装、升级、跨会话使用中的反馈,用于回灌通用机制。
