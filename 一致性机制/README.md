# 一致性机制 —— 套件仓库的机制索引

<!-- 一致性机制 version: 2026-10-02 -->

> 本文件是套件仓库的内部索引,给维护者看,2.0 起不再装进用户项目(决策 77)。用户项目里机制怎么运行见 [`运行规则.md`](运行规则.md);设计动机见 [`机制设计说明.md`](机制设计说明.md)。

## 这是什么

一套让 AI 协作能跨会话连续工作、并维护文件一致性的机制:

- **入向**:新会话用 catchup 理解项目整体与工作现场,最低限度检查必要文件与当前宿主接线,简明反馈;具体任务调查留到后续工作;
- **出向**:收尾用 wrapup 按 guard 给出的基线检查联动、迁出「待提交」决策,一次确认后提交;只有 canonical branch 能推进 `synced`;
- **兜底**:模型结合对话积累与任务进度自然建议保存,用户掌握节奏(运行规则第三节);上下文压缩后由 SessionStart hook 提醒重读规则,Codex 另给用户简短状态提示,恢复结果由 Agent 重读后说明;
- **并行**(实验性):各会话在自己的 branch + worktree 上工作,`task.mjs` 负责开工、同步、并进主线与收工,每轮提示在主线变化与本分支相关时报出事实;
- **底座**:git 是事件源,决策全文与过程历史写在提交正文;PROJECT 只写现状与入口。

## 本目录里有什么

| 文件 | 作用 | 分发给用户项目 |
|------|------|------|
| [`运行规则.md`](运行规则.md) | 机制怎么运行;本仓库与用户项目用同一份(决策 73) | 是(机制文件) |
| [`VERSION`](VERSION) | 套件唯一正式 SemVer;用户项目的安装身份也落在这里 | 是 |
| `LICENSE.project-consistency-kit`(安装后) | 套件 MIT 许可副本,放在机制子目录以免被误解为项目整体许可证 | 安装时生成 |
| [`文件联动目录.md`](文件联动目录.md) | 本仓库的真实联动规则;用户项目从 `templates/一致性机制/文件联动目录.md` 生成自己的 | 否(模板分发) |
| [`机制设计说明.md`](机制设计说明.md) | 整套设计的「为什么」 | 否(决策 77) |
| `README.md`(本文件) | 机制索引 + 钉在别处的文件登记册 | 否(决策 77) |

## ⚠️ 这些文件也属于本机制,但被工具钉死在别处

| 文件 | 实际位置 | 为什么不能进 `一致性机制/` |
|------|----------|----------------------|
| catchup / wrapup 行为正本 | `.agents/skills/catchup/`、`.agents/skills/wrapup/` | Codex 与兼容 Harness 从仓库级 Skill 发现;Claude Code 命令也转发到这里 |
| wrapup 脚本 | `.agents/skills/wrapup/scripts/`(`scope.mjs`、启动静态检查 `startup-check.mjs` 及其联动匹配 `linkage.mjs`、`decisions.mjs`、`synced-guard.mjs`、并行的 `task.mjs`,检查点找法 `checkpoints.mjs`) | Skill 随附的机械步骤;guard 独占 `synced` 的状态迁移,并进主线时由 `task.mjs land --finish` 在主线前进后推进 |
| hook 逻辑 | `.agents/hooks/`(`parallel-notice.mjs` 每轮提示、`compact-reminder.mjs` 压缩后提醒;`run-hook.ps1` 为 Windows Codex 薄适配器;`selfcheck.mjs` 为 hook 自检;失败留痕在 wrapup 的 `scripts/hook-trace.mjs`) | 宿主接线指向固定 ASCII 路径的跨平台 Node 脚本 |
| 整理细则 | `.agents/skills/wrapup/references/document-maintenance.md` | 只在明确要求整理时由 wrapup 读取 |
| 安装器行为正本 | `skills/project-consistency-installer/`(含获取脚本) | skills.sh 分发,机器级使用,不进入用户项目 |
| 干净分发白名单 | `distribution/manifest.txt` | 发布边界独立于源码目录,新增产品文件需显式评审 |
| GitHub 公开范围 | `distribution/public-paths.txt`、`scripts/publish-public.sh` | 本仓库是内部工作仓库;公开版历史按白名单由脚本生成,内部文档与实验不公开;生成后按只放在本机的私人信息词表检查新增提交的说明与改动 |
| 分发构建、验证与测试 | `scripts/` | 源码工具:生成 Release 资产、阻断自举状态泄漏与套件决策编号进入分发文件、回归测试 |
| GitHub Release 工作流 | `.github/workflows/distribution.yml` | 普通变更只验证;`v*` 标签才创建 Release,带 `-` 的为预发布 |
| Claude Code 适配器 | `.claude/commands/catchup.md`、`wrapup.md`、`引入一致性机制.md` | 斜杠入口,只转发到对应 Skill,不复制流程 |
| 二进制排除与 LFS 规则 | `.gitignore`、`.gitattributes`(仓库根) | git 要它们在根才全局生效 |
| 项目入口 | `PROJECT.md`(仓库根) | catchup 固定读取 |
| Agent 指令与接入块 | `AGENTS.md`(仓库根,`一致性机制:接入` begin/end 块引用运行规则) | 宿主按固定文件名自动加载 |
| Claude 适配入口 | `CLAUDE.md`(仓库根,内容仅 `@AGENTS.md`) | Claude Code 按固定文件名加载 |
| canonical branch | 本地 Git config `projectConsistency.canonicalBranch` | 当前 clone 的运行状态,由用户确认 |
| sync horizon | Git 引用 `refs/pck/synced` | canonical 项目级 ref;guard 原子创建或推进,feature 只用 merge-base 检查自身变化 |
| hook 接线(UserPromptSubmit、SessionStart) | `.claude/settings.json`、`.codex/hooks.json` | 宿主只从这里读 hooks;Codex 首次或变更后需用户信任 |
| 机器级引导器 | skills.sh 安装的 `project-consistency-installer`(本地开发可链接到本仓库) | 从 GitHub Release 或可信本地 checkout 获取套件,再增量引入或升级项目 |

## 版本、源码与发布面

- `VERSION` 是正式 SemVer 正本,文件里的日期版本行只是修订标识。
- GitHub `main` 是套件源码仓库,保留本仓库自己的 PROJECT、AGENTS、联动规则与决策历史;与 VERSION 一致的 `v*` 标签生成的 Release 才是干净分发源。带 `-` 的版本(如 `2.0.0-preview.1`)发为预发布,须 `--release` 明确指定(决策 76);不带 `-` 的正式版成为 latest,默认获取。
- 用户项目的 PROJECT / AGENTS / 联动目录从 `templates/` 生成,不得复制本仓库实况。

## 改了机制怎么办

改完执行 wrapup,它会按本仓库的 [`文件联动目录.md`](文件联动目录.md) 检查 PROJECT、AGENTS、公开 README、模板、安装器与发布记录等联动,再提交、推进 `synced`。发版按 `AGENTS.md`「机制发版纪律」。
