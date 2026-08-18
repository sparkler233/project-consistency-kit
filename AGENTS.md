# Project Consistency Kit — Agent 工作规则

> 本文件是 Agent 指令的唯一实体正本。Codex 直接加载本文件;`CLAUDE.md` 必须是指向本文件的相对符号链接,供 Claude Code 加载。
> 项目事实与当前状态见 `PROJECT.md`;不要在 catchup 工作流中重复读取本文件或 `CLAUDE.md`。

## 协作分工

- **项目负责人**:拍板架构与产品边界,确认同步计划、提交信息和对外发布。
- **AI**:分析问题、实现修改、回归检查、维护文档联动并暴露风险。
- **外部项目实战**:提供安装、升级、跨会话使用中的反馈,用于回灌通用机制。

## 工作约定

- **单一正本**:项目事实以 `PROJECT.md` 为准;公开说明以 `README.md` 为准;Agent 规则以本文件为准;catchup / wrapup 行为以 `.agents/skills/` 为准;安装行为以 `skills/project-consistency-installer/` 为准;`.claude/commands/` 只做 Claude Code 入口适配;机制原理与决策理由以 `一致性机制/机制设计说明.md` 为准;版本变化以 `CHANGELOG.md` 为准。
- **三层分离**:`README.md` 面向 GitHub 用户,`PROJECT.md` 服务项目运行,`AGENTS.md` 服务 Agent harness;三者可以互相引用,不得互相代替。
- **适配链接**:`CLAUDE.md` 只能是相对链接 `AGENTS.md`;不得维护第二份实体内容,不得建立循环链接或仓库外链接。
- **机制发版纪律**:任何机制文件发生真实变化,统一推进全部版本行到当天,更新 `CHANGELOG.md`,并检查初始化、安装器、公开文档、模板和设计说明是否联动。
- **架构修改**:先讨论设计取舍,再改实现;被推翻的决策在设计说明中保留演进线索。
- **提交信息**:主题行简短说明“做了什么”,细节留正文;wrapup 只负责本地 commit 与 `synced` tag,不自动 push。
- **重大决策**:必须在 `PROJECT.md`“关键决策记录”追加一行,操作性内容同步改写到对应正文或机制设计说明。

<!-- 一致性机制:同步纪律 begin (version: 2026-08-18) -->
## 同步纪律(git 驱动)

事件源是 git,不手维护日志。配套 3 条纪律:

1. **B 类事件落地**:决策、对外对接、口头约定发生在对话里、git 看不见 → AI 必须立即写入目标文件(决策→`PROJECT.md`“关键决策记录”)。结束会话前建议执行一次 wrapup,避免未落盘的 B 类事件随会话丢失。
2. **二进制按类处理**:需要版本史的栅格图走 Git LFS 进 git(规则见 `.gitattributes`);设计源 / PDF / Office / 字体 / 媒体由 `.gitignore` 排除。含二进制的素材 / 大文件目录放 `_manifest.md`,只记用途 / 来源 / 授权或版权;纯文档目录不要 manifest。破例纳入被忽略二进制时,先 `git lfs track "<路径>"`,再 `git add -f`。〔纯代码 / 纯文字项目可简化本条〕
3. **草稿双轨(仅二进制)**:试稿放 `_drafts/`(已 gitignore),定稿挪上级目录 + 更新 manifest / 让 LFS 接管。

> 入向加载用 catchup(Codex: `$catchup`;Claude Code: `/catchup`):读取 `PROJECT.md`、Git 状态与当前焦点,不重复读取 harness 已注入的本文件。出向收尾用 wrapup(Codex: `$wrapup`;Claude Code: `/wrapup`):git diff → 查联动目录 → 用户确认 → 落盘 → commit + 推进 `synced` tag。
<!-- 一致性机制:同步纪律 end -->
