# Project Consistency Kit

> 让 Agent 在新会话里接得上进度，并在收尾时把项目状态、决策和相关文档一起更新。

[![Latest release](https://img.shields.io/github/v/release/sparkler233/project-consistency-kit)](https://github.com/sparkler233/project-consistency-kit/releases/latest)
[![Distribution](https://github.com/sparkler233/project-consistency-kit/actions/workflows/distribution.yml/badge.svg?branch=main)](https://github.com/sparkler233/project-consistency-kit/actions/workflows/distribution.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f6f4e.svg)](LICENSE)

> **2.0 预览版**:已发布的 `v2.0.0-preview.3` 采用 2.0 的新流程(决策历史进 Git、PROJECT 改为入口式、运行规则独立、wrapup 一次确认),并加入实验性的多会话并行。当前源码继续开发尚未发布的 `2.0.0-preview.4`,本页包含其变化;默认安装仍取稳定版 v1.3.0;获取与升级方式见下文「发布与升级」。

## 它解决什么

本项目旨在解决人与 Agent 在长程工作协作下切换 Session 和 Harness 并压缩上下文的过程中带来的项目内部文档与信息的漂移问题。我们借助 Git 来实现了项目的状态保存与内部文件联动。

情景：当你和 Agent 推进一个项目几天后，仓库里通常会同时出现两种状态：代码或内容已经变了，项目进度、决策记录和素材清单仍停在旧版本。如果切换 Harness 和 Session，Agent 需要重新判断项目进度、哪些决定已经确认、哪些文档需要补写。

Project Consistency Kit 把这些信息留在仓库里。Git 记录当前项目发生过什么,决策全文和过程历史写在提交说明里;`PROJECT.md` 是项目入口,只写现在成立的事和各类资料在哪里;`一致性机制/运行规则.md` 说明机制怎么运行,`AGENTS.md` 保存项目自己的规则。新会话用 catchup Skill 恢复现场,工作结束时用 wrapup Skill 检查还有哪些状态或文档需要一起更新。

## 怎么工作

```text
catchup  ->  正常工作  ->  wrapup
恢复现场                    检查联动并提交
```

1. 新 Session 开始时运行 catchup。它读取项目入口、运行规则和 Git 概况，理解项目的目的、当前阶段与工作现场，用简明反馈让你判断它是否已经接上项目。未保存工作、分支交接信息和影响接手的异常会得到关注，不逐项展开设计或罗列完整状态清单。具体任务的资料调查在后续工作中进行。启动还会只读检查必要文件、当前宿主的项目级 JSON hook 接线及已有失败记录，有问题时由 Agent 说明影响；不执行 hook 或自动修复。自定义命令与 TOML 内联接线等未检查范围如实保留，未发现问题不等于宿主已实际运行 hook。恢复过程只读，不修改文件；上下文被压缩后不用重跑，Agent 按 AGENTS 中的指令重读 PROJECT 与运行规则即可。
2. 中间照常和 Agent 协作。拍板的决策会立即写进 `PROJECT.md` 的「待提交」区,不等收尾。
3. 一段工作结束时运行 wrapup。canonical branch 比较自上次 `synced` 以来的全部改动;并行 feature branch 改用它与 canonical 的 merge-base。在 canonical branch 上,它把维护计划、拟提交文件、完整提交说明和 `synced` 条件一次展示给你,一次确认后才写入文件、把决策全文迁入提交说明并创建本地提交;只有 canonical branch 能通过确定性 guard 推进 `synced`。在 feature branch 上收尾时,这次提交就是任务检查点,不等确认、提交后报告;任务还没做完或之后可能换 Session 接手时,提交说明里写上目标、进度、还剩三行,供接手时读取。数行数、生成提交说明这类机械步骤由随附脚本完成。保存节奏由你掌握，不以每项工作完成为必需的提醒节点；Agent 可以结合对话积累与任务进度自然建议保存。任务分支停下时仍保存检查点，无需额外确认、事后报告。

| 运行环境 | 会话初始化引入 | 会话收尾 |
| --- | --- | --- |
| Codex | `$catchup` | `$wrapup` |
| Claude Code | `/catchup` | `/wrapup` |
| 其他 Harness | 调用 catchup Skill | 调用 wrapup Skill |

同样也可以直接告诉 Agent“帮我恢复项目状态”或“检查联动并收尾”。显式命令只是入口，实际流程由仓库里的 Skill 定义。

需要多个会话同时推进时，可以直接说“我想用并行模式分别做这两件事”。Agent 会结合任务说明收益与边界；获准启用后，由 Agent 准备独立工作区，再告诉你如何在宿主中打开对应的新会话。普通启动不要求选择模式，也不承诺自动创建或切换所有宿主的会话。

## 安装

需要 Git 和 Node.js；实验性的多会话并行需要 Git 2.38 及以上。macOS、Linux 用户还需要 `curl`、`tar` 以及 `sha256sum` 或 `shasum`；Windows 用户需要 Git for Windows。

先把安装器装到用户级 Skill 目录：

```bash
npx skills add sparkler233/project-consistency-kit \
  --skill project-consistency-installer \
  --global
```

CLI 会检测本机可用的 Agent 环境。需要时可以加 `--agent codex` 或 `--agent claude-code`。安装完成后，进入目标项目并告诉 Agent：

> 给这个项目引入一致性机制。

安装器会扫描项目现有的 `README.md`、`PROJECT.md`、`AGENTS.md` 和 `CLAUDE.md`，再展示迁移计划。它不会在确认前覆盖原有内容，也不会因为模板更标准就重排用户文档。

本机没有套件源码时，安装器会下载最新的 GitHub Release，并校验压缩包、内部文件清单、版本、来源仓库和精确提交。校验全部通过后，它才会继续安装。Windows 的 PowerShell 入口会自动找到 Git for Windows 自带的 Bash，不要求手工修改 PATH。

全新项目也可以从干净 Release 开始，完整步骤见[《在新项目里启用 Project Consistency Kit》](初始化新项目.md)。

## 主要会给项目加什么

| 内容 | 用途 |
| --- | --- |
| `PROJECT.md` | 项目入口:目标与边界、总体状态、阅读入口,以及「待提交」「最近决策」 |
| `AGENTS.md` | 项目自己的 Agent 规则;机制只在其中放一个接入块,引用运行规则 |
| `一致性机制/运行规则.md` | 机制怎么运行(由安装器管理,升级时整体更新) |
| `CLAUDE.md` | 用 `@AGENTS.md` 让 Claude Code 读取同一份规则 |
| `.agents/skills/catchup/` | 定义如何恢复项目状态 |
| `.agents/skills/wrapup/` | 定义如何检查联动、迁出决策、确认提交并推进 `synced`;随附范围(含联动规则的路径匹配)、决策与 guard 脚本和文档整理细则 |
| `一致性机制/文件联动目录.md` | 记录哪些文件变化时需要一起检查其他内容;规则的触发写出文件或目录路径时,wrapup 会列出本次改动命中的规则 |
| `.agents/hooks/` 和宿主配置 | 两项提示:并行时主线的变化与本分支相关就提示;上下文被压缩后提醒 Agent 重读规则，Codex 同时显示简短恢复提示，Agent 完成重读后说明恢复情况，不承诺对话信息完整保留。Windows Codex 通过薄 PowerShell 适配器转到同一 Node 逻辑。hook 出错时不挡宿主,只在 Git 目录留一行记录,catchup 会提到;`node .agents/hooks/selfcheck.mjs` 按项目实际接线把每个 hook 跑一遍,报告哪些能出声 |
| `一致性机制/VERSION` | 记录项目当前安装的套件版本 |

`synced` 是一个存放在 `refs/pck/synced` 的本地 Git 指针，表示 canonical branch 上一次已经完成项目级联动检查的位置。它和 `HEAD` 分开，因此中途手工提交过的改动不会被 wrapup 跳过。canonical branch 由用户确认后保存在当前 clone 的 Git config;guard 会检查 branch、祖先关系、冲突和工作区状态,再用原子 ref 更新推进指针。非 canonical branch 可以保存 branch checkpoint,但不会移动项目级 horizon。

## 支持范围

- Codex 可以直接发现仓库级 catchup 和 wrapup Skill；项目 hook(并行时的每轮提示、上下文压缩后的提醒)通过 `.codex/hooks.json` 接入，首次使用或配置变化后需要用户审查并信任；没批准时 hook 不运行，也不报错。Codex 桌面端可能不弹出审查窗口，这时在项目目录的终端里打开 Codex，用 `/hooks` 批准一次即可。
- Claude Code 通过 `/catchup`、`/wrapup` 和 `CLAUDE.md` 适配同一套规则，hook 配置位于 `.claude/settings.json`。
- 其他能读取 `AGENTS.md` 或 Agent Skills 的运行环境可以复用项目规则和工作流；如果没有等价的生命周期 hook，就不会获得对应的生命周期提示。
- 核心脚本支持 macOS、Linux 和原生 Windows。Windows Codex 使用仓库内 `.ps1` 薄适配器，避免会话 PowerShell 预先展开内联命令中的变量；Hook 还需用户完成项目与命令信任。

## 它不会做什么

- wrapup 不会自动推送远端；在 canonical branch 上不会在用户确认前修改文件或创建提交(并行的任务分支上，收尾提交是任务检查点，不等确认、提交后报告)。
- catchup 只能从仓库恢复已经落盘的信息，无法找回早已丢失的旧会话内容。
- 文件联动规则需要结合项目实际情况维护，安装器无法替项目决定所有领域关系。
- `synced` 是本地维护指针,同一仓库的 worktree 共享,独立 clone 不自动获得。多机使用需明确各自检查边界;普通推送标签不会带走它,显式推送该引用或镜像推送仍会。

## 实验性范围

实验性能力的流程与接口在 2.x 内可能不兼容地调整。调整时须说明迁移与旧任务接续方式,仍保护已有成果、历史和其他工作区,不越过用户授权。

| 范围 | 当前状态 |
| --- | --- |
| 并行协作的开工、同步、合并、退出,任务检查点与相关变化提示 | 已提供实验性实现;对其他任务分支进行中改动的普遍感知仍是后续探索 |
| 按上下文用量提醒保存 | 仅内部试用,不随套件分发 |
| 跨 Session 通信与自动协调 | 研究方向,有实验材料,尚非产品能力 |
| 脚本无法恢复时由 Agent 手工完成保存流程 | 尚未实现,列为后续实验方向;当前不开放手工接管 Git 操作 |

启动检查、压缩后反馈和文件联动不整体列为实验性;验证覆盖与已知限制另行说明。列入实验方向不表示能力已经提供,也不开放当前规则禁止的操作。

## 仍未解决的问题

### 多个 Session 并行工作的边界

2.0.0-preview.3 起提供实验性的并行:你同时驾驶几个会话,每个会话在自己的 branch + worktree 上工作,主线上不放会话;对哪个会话说「并进主线」,就由它自己同步主线、检查、合并并推进 `synced`。机制只守三条:主线只通过检查过的合并前进;停下时把目标、进度、还剩写进分支上的检查点;不动别的分支和别人未提交的改动。开工、同步、合并、收工由 `task.mjs` 完成;主线变化与某个分支相关时,那个会话在下一轮开始时收到提示(你也看得到);要不要同步由你决定。

这部分还是实验性的:只在 macOS 上经过少量真实会话验证,每种设置只跑过一次;两个会话先后合并时,`PROJECT.md` 总体状态一段常要解冲突;上下文压缩后的提醒已在 Codex 上见到送达,但压缩后模型是否仍照规则做还没验证;需要 Git 2.38 及以上;Codex 沙箱下并进主线需要把主线目录设为可写;Claude Code 桌面版把 worktree 建在仓库内的 `.claude/worktrees/`,需要加进 `.gitignore`。

两个 Session 直接操作同一个 worktree 仍不受支持:它们会共享未提交文件和索引,机制无法可靠判断改动归属。

### 决策落盘仍然依赖模型

Git 和脚本能够检查文件是否发生变化，却无法仅凭确定性程序判断一段对话里是否产生了应该保存的决策。当前机制依靠 Agent 识别决策并写入 `PROJECT.md` 或对应文档，wrapup 只能在当前会话中再检查一次是否有遗漏。

模型可能漏掉决策、错误理解某项决策，也可能以为某项决定已经保存，而实际并未落盘。这是一种无法由现有机制彻底排除的决策保存幻觉。Hook、固定流程和用户确认可以降低风险，但无法把自然语言中的决策识别完全交给确定性程序。在找到更可靠的记录和验证方式之前，重要决策仍需要用户检查最终落盘的内容。

## 发布与升级

源码仓库的 `main` 包含维护套件自身所需的项目状态和决策历史，不适合作为模板整包复制。正式 Release 只包含分发白名单批准的通用文件，并附带外层 SHA-256、内部逐文件校验和来源元数据。

安装器默认使用[最新稳定版本](https://github.com/sparkler233/project-consistency-kit/releases/latest)，也可以固定到指定的 `v*` 标签。校验失败时不会静默回退到源码 `main`。

**获取 2.0 预览版**:

1. 先更新机器上的安装器(重新运行上面的 `npx skills add` 命令)。v1.3.0 的安装器会因为新包里没有决策档案模板而拒绝它。
2. 在项目里告诉 Agent:“给这个项目引入一致性机制,使用 v2.0.0-preview.3”。预览版在 GitHub 上标为预发布,不会被当作“最新版”自动取用。

**旧版本项目**:安装器只负责全新引入和 2.0 以后的版本升级。v1.3.0 及更早版本、2.0 各预览版的项目不支持直接升级,需要自行迁移(例如让模型对照新版模板手工完成);旧版 `refs/tags/synced` 标签不再读取。2.0 不提供降级;升级是单独的一次提交,需要时用 `git revert` 撤销它。

脚本异常时先恢复运行或处理发现的问题;执行中断先核对已发生的变化。暂时无法恢复时,仍可在授权范围内把有价值的信息写入文件,但须说明保存流程尚未完成。提交、合并和基线推进继续由机制脚本完成。

## 进一步阅读

- [完整使用示例](docs/example-session.md)
- [全新项目初始化](初始化新项目.md)
- [机制运行规则](一致性机制/运行规则.md)
- [机制文件索引](一致性机制/README.md)(套件仓库内部文档)
- [机制设计与决策理由](一致性机制/机制设计说明.md)(套件仓库内部文档)
- [版本变化](CHANGELOG.md)
- [GitHub Releases](https://github.com/sparkler233/project-consistency-kit/releases)

## 许可证

[MIT](LICENSE)
