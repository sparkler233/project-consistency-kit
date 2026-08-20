# Project Consistency Kit

> 让 Agent 在新会话里接得上进度，并在收尾时把项目状态、决策和相关文档一起更新。

[![Latest release](https://img.shields.io/github/v/release/sparkler233/project-consistency-kit)](https://github.com/sparkler233/project-consistency-kit/releases/latest)
[![Distribution](https://github.com/sparkler233/project-consistency-kit/actions/workflows/distribution.yml/badge.svg?branch=main)](https://github.com/sparkler233/project-consistency-kit/actions/workflows/distribution.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f6f4e.svg)](LICENSE)

## 它解决什么

本项目旨在解决人与 Agent 在长程工作协作下切换 Session 和 Harness 并压缩上下文的过程中带来的项目内部文档与信息的漂移问题。我们借助 Git 来实现了项目的状态保存与内部文件联动。

情景：当你和 Agent 推进一个项目几天后，仓库里通常会同时出现两种状态：代码或内容已经变了，项目进度、决策记录和素材清单仍停在旧版本。如果切换 Harness 和 Session，Agent 需要重新判断项目进度、哪些决定已经确认、哪些文档需要补写。

Project Consistency Kit 把这些信息留在仓库里。Git 记录当前项目发生过什么，`PROJECT.md` 保存项目现在处于什么状态，`AGENTS.md` 告诉 Agent 应该遵守哪些规则。新会话用 catchup Skill 恢复现场，工作结束时用 wrapup Skill 检查还有哪些状态或文档需要一起更新。

## 怎么工作

```text
catchup  ->  正常工作  ->  wrapup
恢复现场                    检查联动并提交
```

1. 在一个新 Session 或压缩上下文之后开始工作时运行 catchup。它读取 `PROJECT.md`、Git 历史和当前工作区，汇报已经完成、正在进行、遇到的卡点和建议的下一步。这个过程只读，不修改文件。
2. 中间照常和 Agent 协作。代码、内容、决策和项目状态将会在对话中不断积累。
3. 此轮 Session 或上下文接近上限准备收尾时运行 wrapup。它比较自上次 `synced` 以来的全部改动，按项目自己的联动规则检查遗漏。用户确认更新计划、提交范围和提交说明后，它才写入文件、创建本地提交并推进 `synced` 标签。

| 运行环境 | 会话初始化引入 | 会话收尾 |
| --- | --- | --- |
| Codex | `$catchup` | `$wrapup` |
| Claude Code | `/catchup` | `/wrapup` |
| 其他 Harness | 调用 catchup Skill | 调用 wrapup Skill |

同样也可以直接告诉 Agent“帮我恢复项目状态”或“检查联动并收尾”。显式命令只是入口，实际流程由仓库里的 Skill 定义。

## 安装

需要 Git 和 Node.js。macOS、Linux 用户还需要 `curl`、`tar` 以及 `sha256sum` 或 `shasum`；Windows 用户需要 Git for Windows。

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
| `PROJECT.md` | 保存项目背景、当前阶段、文件地图和近期决策 |
| `AGENTS.md` | 保存所有 Agent 共用的项目规则 |
| `CLAUDE.md` | 用 `@AGENTS.md` 让 Claude Code 读取同一份规则 |
| `.agents/skills/catchup/` | 定义如何恢复项目状态 |
| `.agents/skills/wrapup/` | 定义如何检查联动、确认提交并推进 `synced` |
| `一致性机制/文件联动目录.md` | 记录哪些文件变化时需要一起检查其他内容 |
| `.agents/hooks/` 和宿主配置 | 检测到未同步改动时提醒运行 wrapup |
| `一致性机制/VERSION` | 记录项目当前安装的套件版本 |

`synced` 是一个本地 Git 标签，表示上一次已经完成联动检查的位置。它和 `HEAD` 分开，因此中途手工提交过的改动不会被 wrapup 跳过。

## 支持范围

- Codex 可以直接发现仓库级 catchup 和 wrapup Skill；项目 Stop hook 通过 `.codex/hooks.json` 接入，首次使用或配置变化后需要用户审查并信任。
- Claude Code 通过 `/catchup`、`/wrapup` 和 `CLAUDE.md` 适配同一套规则，Stop hook 配置位于 `.claude/settings.json`。
- 其他能读取 `AGENTS.md` 或 Agent Skills 的运行环境可以复用项目规则和工作流；如果没有等价的生命周期 hook，就不会获得自动收尾提醒。
- 核心脚本支持 macOS、Linux 和原生 Windows。我们测试的 Codex 0.148.0 在 Windows 上存在宿主 hook 可能显示运行却没有执行命令的问题，此时主动运行 `$wrapup` 仍然有效。

## 它不会做什么

- wrapup 不会自动推送远端，也不会在用户确认前修改文件或创建提交。
- catchup 只能从仓库恢复已经落盘的信息，无法找回早已丢失的旧会话内容。
- 文件联动规则需要结合项目实际情况维护，安装器无法替项目决定所有领域关系。
- `synced` 默认是本地标签。多台机器共同使用时，需要自行同步标签并处理不同设备的基准差异。

## 仍未解决的问题

### 多个 Session 并行工作

当前机制默认一个项目在同一时间只有一条主要工作线。多个 Session 直接在同一工作区运行时会共享未提交文件，却各自持有不同的上下文。一个 Session 可能在另一个 Session 尚未收尾时提交文件或推进 `synced`，这会让改动归属、联动范围和决策顺序变得难以判断。

Git 分支或 worktree 可以隔离文件改动，但各个 Session 仍然围绕同一个项目级 `synced` 标签和同一套状态文档工作。如何为每个 Session 建立独立的同步边界，再安全地汇总项目状态和决策，目前还没有完成设计。

### 决策落盘仍然依赖模型

Git 和脚本能够检查文件是否发生变化，却无法仅凭确定性程序判断一段对话里是否产生了应该保存的决策。当前机制依靠 Agent 识别决策并写入 `PROJECT.md` 或对应文档，wrapup 只能在当前会话中再检查一次是否有遗漏。

模型可能漏掉决策、错误理解某项决策，也可能以为某项决定已经保存，而实际并未落盘。这是一种无法由现有机制彻底排除的决策保存幻觉。Hook、固定流程和用户确认可以降低风险，但无法把自然语言中的决策识别完全交给确定性程序。在找到更可靠的记录和验证方式之前，重要决策仍需要用户检查最终落盘的内容。

## 发布与升级

源码仓库的 `main` 包含维护套件自身所需的项目状态和决策历史，不适合作为模板整包复制。正式 Release 只包含分发白名单批准的通用文件，并附带外层 SHA-256、内部逐文件校验和来源元数据。

安装器默认使用[最新稳定版本](https://github.com/sparkler233/project-consistency-kit/releases/latest)，也可以固定到指定的 `v*` 标签。校验失败时不会静默回退到源码 `main`。

## 进一步阅读

- [完整使用示例](docs/example-session.md)
- [全新项目初始化](初始化新项目.md)
- [机制文件索引](一致性机制/README.md)
- [机制设计与决策理由](一致性机制/机制设计说明.md)
- [版本变化](CHANGELOG.md)
- [GitHub Releases](https://github.com/sparkler233/project-consistency-kit/releases)

## 许可证

[MIT](LICENSE)
