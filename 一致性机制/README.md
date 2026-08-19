# 一致性机制 —— catchup / wrapup 自我维护系统

<!-- 一致性机制 version: 2026-08-19 -->

> 本目录把「项目的自我维护机制」(会话切换、上下文加载、改动落盘)和「项目本身的内容」分开收纳。
> **想了解或修改这套机制,从这里看起。**

## 这是什么

一套让 AI 协作能跨会话连续工作、并自动维护文件一致性的系统:

- **入向**:新会话用 catchup Skill 把项目状态加载回来;
- **出向**:收尾用 wrapup Skill 按联动规则把改动落盘、提交、推进 `synced` 标记;
- **兜底**:跨平台 Stop hook(`../.agents/hooks/wrapup-reminder.mjs`)在有未同步改动时提醒收尾,Claude Code 与 Codex 本地客户端分别显示自己的 wrapup 入口;
- **底座**:git 是唯一事件源,二进制走选择性处理(可选 LFS)。

完整设计动机见 [`机制设计说明.md`](机制设计说明.md)。

## 本目录里有什么

| 文件 | 作用 |
|------|------|
| `README.md`(本文件) | 机制索引 + 登记钉在别处的文件 |
| [`VERSION`](VERSION) | Project Consistency Kit 唯一正式 SemVer;目标项目安装身份也落在这里 |
| [`机制设计说明.md`](机制设计说明.md) | 整套设计的「为什么」:每个决策的动机与取舍。给人 / 接手 AI 看 |
| [`文件联动目录.md`](文件联动目录.md) | 当前项目的真实联动规则(中枢文档 + 例外)。分发骨架在套件 `templates/` |
| [`.agents/hooks/wrapup-reminder.mjs`](../.agents/hooks/wrapup-reminder.mjs) | 出向兜底 hook 跨平台逻辑正本:AI 回答结束时若有未同步改动,提醒用户执行当前宿主的 wrapup 入口 |
| [`hooks/收尾提醒.sh`](hooks/收尾提醒.sh) | v1.1 Unix 旧接线兼容包装,只转发到 Node 逻辑正本 |
| [`决策档案.md`](决策档案.md) | PROJECT 决策记录的历史档案:超限条目由 `/wrapup` 轮转进来(规则 6);不进 Part A,按需查 |
| `LICENSE.project-consistency-kit`(安装后) | 套件 MIT 许可副本,放机制子目录以免被误解为目标项目整体许可证 |

## ⚠️ 这些文件也属于本机制,但被工具钉死在别处(不能移进来)

| 文件 | 实际位置 | 为什么不能进 `一致性机制/` |
|------|----------|----------------------|
| catchup 行为正本 | `.agents/skills/catchup/` | Codex 与兼容 Harness 从仓库级 Skill 发现;Claude Code 命令也转发到这里 |
| wrapup 行为正本 | `.agents/skills/wrapup/` | 同上 |
| 安装器行为正本 | `skills/project-consistency-installer/` | skills.sh 从 GitHub 发现并分发;含 GitHub 获取脚本,机器级使用,不进入目标项目 |
| 干净分发白名单 | `distribution/manifest.txt` | 发布边界必须独立于套件源码目录,新增产品文件需显式评审 |
| 分发构建与验证 | `scripts/build-distribution.sh`、`scripts/verify-distribution.sh` | 源码工具,负责生成 Release 资产并阻断自举状态泄漏 |
| GitHub Release 工作流 | `.github/workflows/distribution.yml` | 普通变更只验证;`v*` 标签才用最小写权限创建 Release |
| `/catchup` 适配器 | `.claude/commands/catchup.md` | Claude Code 斜杠入口;只读取对应 Skill,不复制流程 |
| `/wrapup` 适配器 | `.claude/commands/wrapup.md` | 同上 |
| `/引入一致性机制` 适配器 | `.claude/commands/引入一致性机制.md` | Claude Code 兼容入口;只定位并读取安装器 Skill,不复制流程 |
| 二进制排除规则 | `.gitignore`(仓库根) | git 要它在根才全局生效 |
| 选择性 LFS 规则 | `.gitattributes`(仓库根) | git/LFS 要它在根才全局生效 |
| 项目事实 | `PROJECT.md`(仓库根) | catchup 固定读取;与 GitHub 对外 README 解耦 |
| Agent 指令正本 | `AGENTS.md`(仓库根) | Codex 等 harness 按固定文件名自动加载 |
| Claude 适配入口 | `CLAUDE.md`(仓库根,内容仅 `@AGENTS.md`) | Claude Code 按固定文件名加载并导入 AGENTS;跨平台复用同一正本 |
| 同步纪律 | `AGENTS.md` 的“同步纪律”节 | 必须随 harness 自动注入;catchup 不再重复读取 |
| sync horizon | git tag `synced` | git 对象,不是文件 |
| hook 接线(Stop → 收尾提醒) | `.claude/settings.json`(仓库根) | Claude Code 只从 settings.json 读 hooks 配置;脚本本体住本目录,接线必须钉在那里 |
| Codex hook 接线(Stop → 收尾提醒) | `.codex/hooks.json`(仓库根) | Codex 本地客户端从项目 `.codex` 层发现;首次或变更后需要用户审查并信任 |
| `/引入一致性机制` 全局命令 | `~/.claude/commands/引入一致性机制.md`(可选符号链接 → 套件适配器) | **机器级兼容入口**:只用于本地开发接线;skills.sh 用户直接使用安装器 Skill,不需要此链接 |
| `project-consistency-installer` Skill | 由 skills.sh 安装到 Harness 的用户级 Skill 目录;本地开发可链接 `~/.agents/skills/project-consistency-installer` | **机器级引导器**:从 GitHub 或可信本地 checkout 获取套件,再把 catchup / wrapup 等产物增量引入当前项目 |

> 换句话说:**本机制在文件层面天生和项目缠在一起,是工具决定的,不是没设计好。** 本目录已尽可能把「能搬的文档」聚拢;上表是「搬不动的那几个」的登记册。改机制行为时,记得这几处也要一起看。

## 在新项目里启用本机制

- **版本、源码与发布面**:`VERSION` 是正式 SemVer 正本,日期版本行只是文件修订标识;GitHub `main` 是套件源码仓库,保留套件自身 PROJECT、AGENTS、联动规则和决策历史;与 VERSION 一致的 `v*` 标签自动生成的 GitHub Release 才是无自举状态的干净分发源。
- **项目模板**:套件根 `PROJECT.md` / `AGENTS.md` 是套件自身正本,不进入目标项目;新项目使用 `templates/PROJECT.md` / `templates/AGENTS.md`,再创建只含 `@AGENTS.md` 的 CLAUDE 适配器。README 由目标项目自行决定,套件不创建。
- **项目机制模板**:套件根 `一致性机制/文件联动目录.md` 与 `决策档案.md` 分别保存套件自身规则和历史;新项目必须从 `templates/一致性机制/` 下的联动规则与空白决策档案生成,不得复制套件实况。
- **绿地(全新项目)**:整包套用,仓库级 catchup / wrapup Skill、Claude Code 适配器与 Codex 本地 hook 接线一并复制;完整步骤见模板仓库根的 `初始化新项目.md`(随模板分发,开张后通常已删)。
- **已有项目(已有文件 / git 历史)**:别整包拷。安装机器级引导器后,进入目标项目并告诉 Agent“给这个项目引入一致性机制”;也可以通过当前 Harness 显式选择 `project-consistency-installer`。安装器默认取得带双层 SHA-256、正式版本与来源元数据的最新干净 Release,报告来源 / 目标版本后再增量合并并扫描项目中枢。

## 改了机制怎么办

机制自己的文件变动也走同一套流程:改完执行 wrapup(Codex: `$wrapup`;Claude Code: `/wrapup`),它会按 [`文件联动目录.md`](文件联动目录.md) 检查 PROJECT、AGENTS、公开 README、模板与发布记录等联动,再 commit、推进 `synced`。
