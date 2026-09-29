# Project Consistency Kit — 本仓库 Agent 规则

<!-- 一致性机制:接入 begin (version: 2026-09-27) -->
本项目使用项目一致性机制,运行规则见 `一致性机制/运行规则.md`,全程有效;开始工作前先读(catchup 会读取它)。

上下文被压缩后,若要继续工作:先重读 `PROJECT.md` 与 `一致性机制/运行规则.md`。
<!-- 一致性机制:接入 end -->

## 本仓库(套件源仓库)的开发规则

- **单一正本**:项目事实以 `PROJECT.md` 为准;公开说明以 `README.md` 为准;本仓库自身规则以本文件为准;机制运行规则以 `一致性机制/运行规则.md` 为准;正式套件版本以 `一致性机制/VERSION` 为准;catchup / wrapup 行为以 `.agents/skills/` 为准;安装行为以 `skills/project-consistency-installer/` 为准;收尾提醒逻辑以 `.agents/hooks/wrapup-reminder.mjs` 为准,`.agents/hooks/wrapup-reminder.ps1` 只做 Windows Codex 薄适配;分发白名单与构建行为以 `distribution/manifest.txt`、`scripts/` 和 `.github/workflows/distribution.yml` 为准;GitHub 公开范围以 `distribution/public-paths.txt` 为准,公开版历史只由 `scripts/publish-public.sh` 生成,本仓库本身不推送(决策 78);`.claude/commands/` 只做 Claude Code 入口适配,`.claude/settings.json` 与 `.codex/hooks.json` 只做宿主 Stop 接线;机制原理与决策理由以 `一致性机制/机制设计说明.md` 为准;版本变化以 `CHANGELOG.md` 为准;决策 45 起的决策全文与过程历史以 git 提交正文为准。
- **本仓库可改机制文件**:运行规则中“机制文件由安装器管理、请勿手改”适用于安装了套件的项目;本仓库是套件源仓库,运行规则与分发版是同一份文件(决策 73),修改机制文件按下一条「机制发版纪律」。
- **机制发版纪律**:任何机制文件发生真实变化,先判断 SemVer 的 major / minor / patch 影响,同步 `一致性机制/VERSION` 与安装器 metadata,统一推进全部修订日期到当天,更新 `CHANGELOG.md`,并检查初始化、安装器、公开文档、模板和设计说明是否联动。涉及分发的改动先在本仓库以不进入分发清单的方式试用(决策 51)。
- **架构修改**:先讨论设计取舍,再改实现;被推翻的决策在设计说明中保留演进线索。
- **外部实战反馈**:其他项目在安装、升级、跨会话使用中的反馈,用于回灌通用机制。
- **Core 并行试用中(决策 86,转正后删除本条)**:在非 canonical 分支上运行 catchup / wrapup 时,改读 `docs/parallel-candidate/.agents/skills/` 下的同名 SKILL,其中 `.agents/skills/wrapup/scripts/` 一律换成 `docs/parallel-candidate/.agents/skills/wrapup/scripts/`;运行规则改读 `docs/parallel-candidate/一致性机制/运行规则.md`(并行的三条与同步方法已提前写入);主线上照旧用正式版本,需要查看各并行分支时可运行候选目录下的 `parallel.mjs`。
