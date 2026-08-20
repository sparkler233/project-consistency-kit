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
| `.agents/hooks/` | 跨平台 Stop hook 的 Node 逻辑正本与 Windows Codex 薄适配器 |
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

公开版本已具备入向、出向、安装、升级、文档与干净发布体系。v1.2.0 已补齐原生 Windows 适配,但正式标签的 Windows CI 暴露 `core.autocrlf=true` 让分发白名单路径携带 `\r` 的源码构建缺陷,因此保留为未生成 Release 的失败构建记录。v1.2.1 已在构建 / 校验读取边界兼容 CRLF,安装器 metadata、VERSION 与正式标签锁步;Linux、Windows 与 Release 工作流全部通过,公开产物也已由安装器反向下载并完成内外层校验,本阶段发布完成。真实 Windows 已通过安装、状态机与 `commandWindows` 命令直测;Claude Code 2.1.220 已完成真实 `Stop` 宿主端到端验证并返回正确的 `/wrapup` 提醒。Codex 0.148.0 已完成真实交互宿主验证:项目 hook 能被发现、信任并触发 `Stop`,但正式配置把内联 PowerShell 再交给会话 PowerShell 解析,双引号脚本中的 `$root` 会在内层进程启动前被外层展开为空,导致 Node 脚本路径失效;不同调用包装可表现为状态 1,也可能因 PowerShell 非终止错误而空输出退出 0。同一环境的工作目录、`git`、`node` 与脚本可见性均正常,改用临时 `.ps1` 适配器后端到端通过并正确返回 `$wrapup` 提醒。该修复已正式落入 v1.2.2 候选:新增仓库内 PowerShell 薄适配器,并把 Windows CI 提升为外层会话 Shell 到 Node 的整链路验证;本地状态机、干净分发构建、安装器反向校验与 v1.2.1 向后兼容已通过;Windows PowerShell 5.1 真机又通过分发校验、状态机、外层 Shell 整链路与测试仓库 `commandWindows` 直测,并据此补上 ASCII-safe JSON 传输以规避多层 PowerShell 代码页损坏。Codex 0.148.0 桌面端重新信任变更后的项目 Hook 后,真实 Stop 已通过项目 Hook 通知浮层正确显示“5 个文件”与 `$wrapup`,v1.2.2 的 Windows Codex 端到端闭环完成;正式 `v1.2.2` 标签与 GitHub Release 已发布,Linux、Windows 和 Release 三个工作流作业全部通过,macOS 与 Windows 又分别经安装器从正式 Release 反向下载并验证到 source commit `f7eb949`。Windows 桌面端测试仓库已补齐完整测试上下文和仓库级 `catchup` / `wrapup` Skills;重启后 Codex 桌面端成功发现并显式执行 `$catchup`,正确读取 PROJECT、Git、`synced` 与未跟踪焦点文件,最初报告的中枢文档缺失来自测试夹具漏放正式安装应包含的机制设计说明,现已补齐。源码仓库自身的 PROJECT / AGENTS / 决策历史不进入发布包。后续改进聚焦两项仍未解决的边界:同一仓库多个 Session 并行时缺少 Session 级改动归属和独立同步边界;对话决策的识别与落盘仍依赖模型的语义判断,确定性程序只能提醒、检查文件并要求用户确认,不能完全替代模型判断和人工复核。

## 五、关键决策记录

> 本节只留最近 ~10 条;超限时 wrapup 把最老条目轮转到 `一致性机制/决策档案.md`。更早的架构取舍及完整理由见 `一致性机制/机制设计说明.md`。

- 2026-08-18:出向命令统一命名为 `/wrapup`,与 `/catchup` 形成入向 / 出向配对(决策 17)
- 2026-08-18:catchup / wrapup 行为正本迁入仓库级 Skill,Claude Code 斜杠命令降为适配器(决策 18)
- 2026-08-18:安装器重构为 skills.sh 可分发的 `project-consistency-installer`,可从 GitHub 获取套件后增量引入项目(决策 19)
- 2026-08-18:安装器以自然语言意图作为跨 Harness 统一入口,显式 Skill 或斜杠语法归宿主适配层(决策 20)
- 2026-08-18:决策档案拆分为套件实况与空白模板;安装不得复制套件历史,旧泄漏只按精确行确认清理(决策 21)
- 2026-08-18:源码仓库保留自举状态,分发改由白名单生成并校验的干净 GitHub Release 承担(决策 22)
- 2026-08-19:收尾提醒采用共享脚本 + 宿主接线;Claude Code 与 Codex 本地客户端分别通过 Stop hook 接入,只提醒不自动 wrapup(决策 23)
- 2026-08-19:套件以 `一致性机制/VERSION` 的 SemVer 为唯一正式版本,日期版本行降为文件修订标识,Git tag 与向后兼容扩展的 schema 1 分发元数据受一致性门禁约束(决策 24)
- 2026-08-19:Windows 采用 `@AGENTS.md` 通用适配、跨平台 Node hook、PowerShell 安装入口与真实 Windows / CI 双重验证(决策 25)
- 2026-08-20:Windows Codex 的 Stop 接线改用仓库内 PowerShell 薄适配器,避免内联变量在外层会话 Shell 中被提前展开(决策 26)
