# Project Consistency Kit — 项目运行说明

> 本文件是套件仓库自身的项目事实正本:背景、流程、地图、当前阶段与近期决策。
> GitHub 对外说明见 [README.md](README.md);Agent 工作规则见 [AGENTS.md](AGENTS.md);机制取舍见 [`一致性机制/机制设计说明.md`](一致性机制/机制设计说明.md)。

## 一、项目背景

| 项目 | 内容 |
|------|------|
| 主题 | 面向长期 AI Agent 协作的项目一致性机制 |
| 目标 / 交付物 | 一套可分发、可升级的 Git 驱动工具包,让项目能跨会话恢复状态、检查文件联动并安全收尾 |
| 相关方 | 项目维护者、使用套件的项目负责人及其 AI 协作者 |
| 体量 / 规格 | 以 Markdown、Skill、Node、Shell/PowerShell、Git 和宿主适配器为主;默认单机工作流;AGENTS 与仓库级 Skill 适配 Codex 及兼容 Harness,Claude Code 与 Codex 本地客户端各有跨平台 hook 适配层 |
| 创作模式 | AI 负责实现、验证与维护建议;项目负责人决定架构、发布与对外动作 |

## 二、工作流程与里程碑

问题或实战反馈 → 设计讨论与拍板 → 修改机制件及联动文档 → 判断 SemVer 并统一修订日期 → 构建验证干净分发包与版本身份 → 更新 CHANGELOG → wrapup 检查 → 本地提交并推进 `synced` → 按需推送远端 / 推送匹配 VERSION 的标签发布 Release。

1. **机制成型**:Git 事件源、catchup、wrapup、联动目录与二进制策略。
2. **可靠性加固**:独立 `synced` horizon、Stop hook、决策轮转和版本治理。
3. **可分发化**:skills.sh 全局安装器、GitHub bootstrap、增量安装、绿地初始化与公开文档。
4. **发布面隔离**:源码仓库保留自举状态,GitHub Release 只发布白名单生成的干净产物。
5. **当前阶段**:公开发布后的跨宿主、跨发布面安装链路加固。

## 三、项目地图

| 位置 | 内容 |
|------|------|
| `PROJECT.md` | 套件自身的背景、流程、地图、阶段与近期决策(本文件) |
| `AGENTS.md` | Agent 工作规则与同步纪律的唯一实体正本 |
| `CLAUDE.md` | 只含 `@AGENTS.md` 的 Claude Code 跨平台导入适配器 |
| `README.md` | GitHub 对外主页,不承担运行时项目地图职责 |
| `.agents/skills/` | catchup / wrapup 的跨 Harness 行为正本与 Codex 仓库级入口 |
| `.agents/hooks/` | 全 ASCII 固定路径的跨平台 Stop hook 逻辑正本 |
| `skills/project-consistency-installer/` | skills.sh 可发现的机器级安装器行为正本与 GitHub 获取脚本 |
| `.claude/` | Claude Code 的命令薄适配器与 Stop hook 接线 |
| `.codex/hooks.json` | Codex 本地客户端的 Stop hook 接线 |
| `.github/workflows/distribution.yml` | 在 Linux / Windows 验证每次源码变更,在 `v*` 标签上发布干净 GitHub Release |
| `distribution/manifest.txt` | 干净分发包逐文件白名单 |
| `scripts/` | 构建、验证分发包并阻断套件自举状态泄漏 |
| `一致性机制/VERSION` | 套件唯一正式 SemVer 正本;Release tag 与分发元数据必须和它一致 |
| `一致性机制/` | 套件自身使用的机制索引、设计说明、真实联动规则、决策档案与 hook |
| `templates/` | 分发给新项目的 `PROJECT.md`、`AGENTS.md`、联动规则与空白决策档案骨架 |
| `初始化新项目.md` | 绿地项目接入指南 |
| `docs/` | 对外使用示例 |
| `CHANGELOG.md` | 套件版本记录 |

## 四、当前阶段

公开版本已具备入向、出向、安装、升级、文档与干净发布体系。当前 v1.2.0 工作集正在补齐原生 Windows:CLAUDE 改用官方 `@AGENTS.md` 导入,Stop 判断迁到跨平台 Node 正本,Codex 增加 `commandWindows`,安装器增加 PowerShell 入口,CI 增加 Windows 回归并升级 checkout v6。真实 Windows 已通过安装、状态机与 `commandWindows` 命令直测;Codex 0.148.0 的宿主触发仍受上游 Windows hook 缺陷影响,Claude Code 宿主测试受测试机账户状态阻断。GitHub CI 尚待提交后运行,所以本阶段仍标为验证中。源码仓库自身的 PROJECT / AGENTS / 决策历史不进入发布包。

## 五、关键决策记录

> 本节只留最近 ~10 条;超限时 wrapup 把最老条目轮转到 `一致性机制/决策档案.md`。更早的架构取舍及完整理由见 `一致性机制/机制设计说明.md`。

- 2026-08-18:套件真实联动规则与新项目分发骨架分离(决策 16)
- 2026-08-18:出向命令统一命名为 `/wrapup`,与 `/catchup` 形成入向 / 出向配对(决策 17)
- 2026-08-18:catchup / wrapup 行为正本迁入仓库级 Skill,Claude Code 斜杠命令降为适配器(决策 18)
- 2026-08-18:安装器重构为 skills.sh 可分发的 `project-consistency-installer`,可从 GitHub 获取套件后增量引入项目(决策 19)
- 2026-08-18:安装器以自然语言意图作为跨 Harness 统一入口,显式 Skill 或斜杠语法归宿主适配层(决策 20)
- 2026-08-18:决策档案拆分为套件实况与空白模板;安装不得复制套件历史,旧泄漏只按精确行确认清理(决策 21)
- 2026-08-18:源码仓库保留自举状态,分发改由白名单生成并校验的干净 GitHub Release 承担(决策 22)
- 2026-08-19:收尾提醒采用共享脚本 + 宿主接线;Claude Code 与 Codex 本地客户端分别通过 Stop hook 接入,只提醒不自动 wrapup(决策 23)
- 2026-08-19:套件以 `一致性机制/VERSION` 的 SemVer 为唯一正式版本,日期版本行降为文件修订标识,Git tag 与向后兼容扩展的 schema 1 分发元数据受一致性门禁约束(决策 24)
- 2026-08-19:Windows 采用 `@AGENTS.md` 通用适配、跨平台 Node hook、PowerShell 安装入口与真实 Windows / CI 双重验证(决策 25)
