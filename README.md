English | [简体中文](README.zh-CN.md)

# Recensio

*ri-SEN-see-oh* · Latin for the first step in editing an old text: gather every surviving copy and, from their history, establish the text as it stands.

Project memory in Git: every new AI session starts from the same, up-to-date picture of the project.

[![Latest release](https://img.shields.io/github/v/release/sparkler233/recensio)](https://github.com/sparkler233/recensio/releases/latest)
[![Distribution](https://github.com/sparkler233/recensio/actions/workflows/distribution.yml/badge.svg?branch=main)](https://github.com/sparkler233/recensio/actions/workflows/distribution.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f6f4e.svg)](LICENSE)

Recensio keeps a project's memory in the repository itself. A short `PROJECT.md` says what is true now and where things are; the reasoning behind each decision, and how the project got here, go into Git commit messages. A new session runs **catchup** to read them. When a piece of work is done, **wrapup** updates the records, checks the documents that depend on what changed, and commits. Small scripts handle the mechanical parts.

- **Just Git.** No server, database, account or API key; Git and Node.js are enough. The project's content is plain Markdown and Git history. It is not limited to software: long-running projects in writing, design or office work fit just as well.
- **One memory across sessions and agents.** Claude Code, Codex and other tools that read `AGENTS.md` share the same files. After switching sessions or tools, run catchup once and the agent understands the project and carries on.
- **A history you can look up.** Decisions made during the work are saved together with their reasons and the options that were dropped. Any later session can find them, so the project keeps its own history and memory.
- **Consistency inside the project.** At the end of a piece of work, linkage rules ("if A changes, check B") find what the change affects, so status, decisions and related documents are updated together and the project is less likely to drift.
- **Steady after context compaction.** What has been done is already recorded locally, not only in the conversation, so the agent can pick up its earlier line of thought. After compaction, a hook has the agent reread the project and the rules before continuing.
- **Light on the model.** A new session reads a few short files and understands the project without going through the whole repository. Mechanical steps are handled by scripts, so the agent does not have to think about the mechanism itself and keeps its context and effort for the real work.
- **Parallel sessions (experimental).** Several sessions can move one project forward at once, each on its own branch, with conflicts and related changes checked before merging. Useful when work splits cleanly between a few agents.

> The files Recensio adds to a project (rules, templates, folder names) are currently in Chinese. English versions are planned.

## How it works

```text
catchup  ->  work  ->  wrapup
```

- **catchup**, at the start of a session: the agent reads `PROJECT.md`, the runtime rules and a summary of recent Git activity, then tells you briefly where things stand. It changes nothing.
- **While you work**: when you settle a decision, the agent writes it into `PROJECT.md` straight away instead of waiting for the end.
- **wrapup**, when you want to save: the agent checks which related documents need updating, shows you the plan and the full commit message, and commits once you confirm. Decisions move from `PROJECT.md` into the commit message. Nothing is pushed.

| | Start a session | Save |
| --- | --- | --- |
| Claude Code | `/catchup` | `/wrapup` |
| Codex | `$catchup` | `$wrapup` |
| Other tools | run the catchup skill | run the wrapup skill |

Plain requests work too, such as "catch up on this project" or "wrap up".

## Quick start

You need Git and Node.js (on Windows, Git for Windows).

1. Install the installer skill, once per machine:

   ```bash
   npx skills add sparkler233/recensio --skill project-consistency-installer --global
   ```

2. In your project, ask the agent: "Use project-consistency-installer to set up this project."

The installer downloads the latest release and checks its checksums and source before using it. It then shows you a plan and changes nothing until you agree. Your README is left alone, and existing `PROJECT.md` and `AGENTS.md` content is merged rather than overwritten. Step-by-step setup is in [初始化新项目.md](初始化新项目.md) (Chinese).

**Coming from v1.3.0 or a 2.0 preview?** Rerun the install command first: older installers reject 2.0.0. The installer does not upgrade projects from those versions; the [changelog](CHANGELOG.md) (Chinese) lists what to change by hand.

## What it adds to your project

| File | Purpose |
| --- | --- |
| `PROJECT.md` | Entry point: goals, current status, where things are, pending and recent decisions |
| `AGENTS.md` | Your project's own rules for agents, plus a short block that points to the runtime rules |
| `CLAUDE.md` | A single line, `@AGENTS.md`, so Claude Code reads the same rules |
| `一致性机制/运行规则.md` | Runtime rules, managed by the installer |
| `一致性机制/文件联动目录.md` | Linkage rules ("if A changes, check B"); wrapup lists the rules your changes touch |
| `.agents/skills/` | The catchup and wrapup skills and their scripts |
| `.agents/hooks/` and host settings | Two hooks: a note at the start of a turn when the main branch changed in a way that affects your branch, and a reminder to reread the rules after the context is compacted |

The point of the last wrapup is kept in a local Git ref, so commits made by hand in between are still checked next time.

## Parallel sessions (experimental)

Several sessions can work on one project at once, each on its own branch and worktree. When you tell a session to merge into the main line (in Chinese, 并进主线), it syncs, checks and merges its own work. If the main branch changes in a way that touches a branch, that session gets a note at the start of its next turn. This needs Git 2.38 or later, and its commands and formats may still change within 2.x.

## Limits

- wrapup commits locally and never pushes. On the main branch it asks before changing files or committing; on a task branch it saves a checkpoint without asking.
- catchup can only recover what was saved in the repository.
- Whether a decision gets written down still depends on the model noticing it. Check the record for the decisions that matter.
- Two sessions working in the same worktree at the same time is not supported.
- Hooks only run after you approve them in Claude Code or Codex. If the Codex desktop app does not show the prompt, open Codex in a terminal in the project and approve them once with `/hooks`.

## Compatibility

Within 2.x, the files, commands and formats you rely on stay compatible or come with a migration. Parallel work is experimental and may change. Script options and internal formats are not promised. Details: [COMPATIBILITY.md](COMPATIBILITY.md).

## More

- [Example session](docs/example-session.md) (Chinese)
- [Changelog](CHANGELOG.md) (Chinese)
- [Releases](https://github.com/sparkler233/recensio/releases)

## License

[MIT](LICENSE)
