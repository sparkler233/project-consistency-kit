[English](README.md) | 简体中文

# Recensio

*读作 ri-SEN-see-oh* · 拉丁语，古籍校勘的第一步：收集所有流传下来的抄本，从它们的传承关系里确定这部书现在的样子。

用 Git 记住项目的历史与现状：每个新会话都从同一份最新的项目状态出发。

[![Latest release](https://img.shields.io/github/v/release/sparkler233/recensio)](https://github.com/sparkler233/recensio/releases/latest)
[![Distribution](https://github.com/sparkler233/recensio/actions/workflows/distribution.yml/badge.svg?branch=main)](https://github.com/sparkler233/recensio/actions/workflows/distribution.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f6f4e.svg)](LICENSE)

Recensio 把项目的记忆放在仓库自己里面。一份简短的 `PROJECT.md` 写现在成立的事、各类资料在哪；每个决策的理由和项目一路怎么走过来，写进 Git 提交说明。新会话用 **catchup** 读这些内容来接上进度；一段工作做完，用 **wrapup** 更新记录、检查受改动影响的文档，然后提交。机械性的步骤由几个小脚本完成。

- **只靠 Git。** 不需要服务器、数据库、账号或 API key，有 Git 和 Node.js 就能运行。项目内容都是普通的 Markdown 和 Git 历史；机制不限于编码领域，写作、设计、办公等领域的长期项目都可以使用。
- **跨会话、跨 Agent 共用一份记忆。** Claude Code、Codex 以及其他能读 `AGENTS.md` 的工具读写同一套文件，换会话、换工具后，运行一次 catchup，Agent 就能理解项目、接着工作。
- **项目历史有据可查。** 工作过程中的决策会被保存下来，连同理由和以前放弃过的方案；之后的任何会话都能查到，让项目拥有自己的历史与记忆。
- **保持项目内部的一致性。** 在一次工作收尾时按照联动规则（「改了 A 要查 B」）找出受当前工作改动影响的内容，让状态、决策和相关文档一起更新，减少项目内部产生漂移的概率。
- **上下文压缩后工作不走样。** 前面做过的事已经记录在本地，不只存在于对话里，Agent 能接着原来的思路做下去；上下文被压缩后，hook 会让 Agent 先重读项目说明和规则，再继续工作。
- **轻量，不给模型添负担。** 新会话只读几份简短的文件，不用翻遍整个仓库即可快速理解项目；机械步骤交给脚本，Agent 不用费心琢磨机制本身，上下文和精力留给真正的工作。
- **支持多会话并行（实验性）。** 多个会话可以同时推进同一个项目，各在自己的分支上工作，合并前检查冲突和相关改动；适合把能拆开的工作交给几个 Agent 同时做。

## 怎么用

```text
catchup  ->  正常工作  ->  wrapup
```

- **catchup**，开始一个会话时：Agent 读 `PROJECT.md`、运行规则和最近的 Git 概况，简短告诉你项目现在到哪了。不改任何文件。
- **工作中**：一旦拍板了什么，Agent 立刻写进 `PROJECT.md`，不等到最后。
- **wrapup**，想保存时：Agent 检查有哪些相关文档要跟着改，把计划和完整的提交说明给你看，你确认后再提交。决策从 `PROJECT.md` 迁进提交说明。不会推送。

| | 开始会话 | 保存 |
| --- | --- | --- |
| Claude Code | `/catchup` | `/wrapup` |
| Codex | `$catchup` | `$wrapup` |
| 其他工具 | 调用 catchup Skill | 调用 wrapup Skill |

直接说「恢复一下项目状态」「收尾」也可以。

## 快速开始

需要 Git 和 Node.js（Windows 上用 Git for Windows）。

1. 每台机器装一次安装器：

   ```bash
   npx skills add sparkler233/recensio --skill project-consistency-installer --global
   ```

2. 在项目里告诉 Agent：「给这个项目引入一致性机制」。

安装器会下载最新版本，先核对校验值和来源再使用。然后它给你看安装计划，你同意之前什么都不改：README 不动，已有的 `PROJECT.md` 和 `AGENTS.md` 内容会合并进去，不会被覆盖。详细步骤见[《在新项目里启用》](初始化新项目.md)。

**从 v1.3.0 或 2.0 预览版过来？** 先重新运行上面的安装命令，旧安装器会拒收 2.0.0。安装器不负责升级这些旧版本的项目，要手工迁移，要点见 [CHANGELOG](CHANGELOG.md) 的 2.0.0 一节。

## 会给项目加什么

| 文件 | 用途 |
| --- | --- |
| `PROJECT.md` | 项目入口：目标、当前状态、资料在哪、待提交和最近的决策 |
| `AGENTS.md` | 项目自己的 Agent 规则，外加一小段指向运行规则 |
| `CLAUDE.md` | 只有一行 `@AGENTS.md`，让 Claude Code 读同一份规则 |
| `一致性机制/运行规则.md` | 运行规则，由安装器管理 |
| `一致性机制/文件联动目录.md` | 联动规则（「改了 A 要查 B」）；wrapup 会列出这次改动碰到的规则 |
| `.agents/skills/` | catchup、wrapup 两个 Skill 和它们的脚本 |
| `.agents/hooks/` 和宿主配置 | 两个 hook：主线的变化影响到你的分支时，在下一轮开头提示；上下文被压缩后，提醒重读规则 |

上一次 wrapup 的位置记在一个本地 Git 引用里，所以中间手工做的提交，下次照样会被检查到。

## 并行会话（实验性）

多个会话可以同时做一个项目，各自在自己的分支和 worktree 上。对哪个会话说「并进主线」，它就自己同步、检查、合并。主线的变化碰到某个分支时，那个会话下一轮开头会收到提示。需要 Git 2.38 及以上；这部分的命令和格式在 2.x 里还可能调整。

## 局限

- wrapup 只在本地提交，从不推送。在主线上，改文件和提交前都会先问你；在任务分支上，它直接存检查点，事后告诉你。
- catchup 只能找回存进仓库的东西。
- 决策有没有被记下来，仍然要靠模型察觉。重要的决策，请看一眼记录。
- 不支持两个会话同时在同一个 worktree 里工作。
- hook 要你在 Claude Code 或 Codex 里批准后才会运行。Codex 桌面端如果没弹出批准窗口，就在项目目录的终端里打开 Codex，用 `/hooks` 批准一次。

## 兼容承诺

2.x 内，你依赖的文件、命令和格式保持兼容，或者提供迁移；并行属于实验性，可能调整；脚本选项和内部格式不做承诺。详见 [COMPATIBILITY.zh-CN.md](COMPATIBILITY.zh-CN.md)。

## 更多

- [使用示例](docs/example-session.md)
- [CHANGELOG](CHANGELOG.md)
- [Releases](https://github.com/sparkler233/recensio/releases)

## 许可证

[MIT](LICENSE)
