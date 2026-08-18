# 〔项目名〕 — Agent 工作规则

> 初始化提示:把〔占位内容〕改成项目真实规则,完成后删除本行。
> 本文件是 Agent 指令的唯一实体正本。`CLAUDE.md` 必须是指向本文件的相对符号链接。项目事实与状态见 `PROJECT.md`。

## 工作约定

- 〔项目的格式、目录、命名、测试或质量约定〕
- **三层分离**:`README.md` 面向外部读者(可选),`PROJECT.md` 保存项目事实,`AGENTS.md` 保存 Agent 规则;三者不得互相代替。
- **适配链接**:`CLAUDE.md` 只能是相对链接 `AGENTS.md`;不得维护第二份实体内容。
- **工作流正本**:catchup / wrapup 行为只维护在 `.agents/skills/`;`.claude/commands/` 只做 Claude Code 入口适配,不得复制流程。
- **重大决策**:必须在 `PROJECT.md`“关键决策记录”追加一行,操作性内容同步改写到对应正文。

<!-- 一致性机制:同步纪律 begin (version: 2026-08-18) -->
## 同步纪律(git 驱动)

事件源是 git,不手维护日志。配套 3 条纪律:

1. **B 类事件落地**:决策、对外对接、口头约定发生在对话里、git 看不见 → AI 必须立即写入目标文件(决策→`PROJECT.md`“关键决策记录”)。结束会话前建议执行一次 wrapup,避免未落盘的 B 类事件随会话丢失。
2. **二进制按类处理**:需要版本史的栅格图走 Git LFS 进 git(规则见 `.gitattributes`);设计源 / PDF / Office / 字体 / 媒体由 `.gitignore` 排除。含二进制的素材 / 大文件目录放 `_manifest.md`,只记用途 / 来源 / 授权或版权;纯文档目录不要 manifest。破例纳入被忽略二进制时,先 `git lfs track "<路径>"`,再 `git add -f`。〔纯代码 / 纯文字项目可简化本条〕
3. **草稿双轨(仅二进制)**:试稿放 `_drafts/`(已 gitignore),定稿挪上级目录 + 更新 manifest / 让 LFS 接管。

> 入向加载用 catchup(Codex: `$catchup`;Claude Code: `/catchup`):读取 `PROJECT.md`、Git 状态与当前焦点,不重复读取 harness 已注入的本文件。出向收尾用 wrapup(Codex: `$wrapup`;Claude Code: `/wrapup`):git diff → 查联动目录 → 用户确认 → 落盘 → commit + 推进 `synced` tag。
<!-- 一致性机制:同步纪律 end -->
