[English](COMPATIBILITY.md) | 简体中文

# 兼容承诺

适用于 Recensio 2.x(2.0.0 起)。

2.x 内分三档。**稳定**的部分保持兼容,改动须能读取旧格式或提供迁移;**实验性**的部分可以调整,见下文「实验性范围」;**不承诺**的是套件内部接口,随同一版本一起改。“稳定”是发布政策,不表示模型行为已有可靠性保证。

| 稳定对象 | 内容 |
| --- | --- |
| 文件与职责 | `PROJECT.md`、`AGENTS.md`、只含 `@AGENTS.md` 的 `CLAUDE.md`、`一致性机制/运行规则.md`、项目所有的 `一致性机制/文件联动目录.md`、`一致性机制/VERSION` |
| PROJECT 中脚本读取的部分 | `### 待提交`、`### 最近决策` 两个小节;待提交条目首行 `- 日期 · 决策 N:标题` 加缩进子项;最近决策每行一条、由脚本生成。其余章节、标题与排版不冻结 |
| 决策历史 | 提交正文的 `决策 N · 日期 · 标题` 行与 `Decision:`、`Decision-Archive:`、`Supersedes:`、`Adjusts: 旧 by 新`;已写入的历史继续可检索 |
| 联动目录 | 规则为小标题加「触发」「动作」;触发里反引号路径(含目录与 `*`)由脚本判断,其余交模型 |
| 用户入口 | catchup / wrapup(Claude Code `/catchup` `/wrapup`,Codex `$catchup` `$wrapup`),说「收尾」即 wrapup;安装入口 `/引入一致性机制` 与安装器 Skill |
| 关键行为 | catchup 只读;wrapup 在主线上确认后本地提交、不推送;`synced` 只在主线上、检查通过后推进;没有可靠基线时不猜 |
| Git 本地状态 | 收尾指针 `refs/pck/synced`;主线配置 `projectConsistency.canonicalBranch` |
| hook 接线 | 每轮提示(UserPromptSubmit)与压缩后提醒(SessionStart)两项;Claude Code 接 `.claude/settings.json`,Codex 接 `.codex/hooks.json`,Windows 经 `run-hook.ps1`;升级保留用户其他 hook |
| 面向用户的命令 | 获取脚本 `fetch-kit.sh` / `.ps1` 的 `--release TAG\|latest`、`--cache-dir`、`--offline`、`--verify-dir`;hook 自检 `node .agents/hooks/selfcheck.mjs` |
| 版本身份 | `VERSION` 写 SemVer,修订日期标记与之分开;获取脚本依赖的 Release 资产名与校验方式不静默改变 |

**不承诺**:`scope`、`decisions`、`synced-guard`、`startup-check`、`linkage` 等脚本的命令行选项与 JSON 字段可以直接调用,但不对外承诺稳定;`base`、`can_advance` 等字段的事实与安全含义不会被偷换。运行规则与 Skill 的措辞、步骤和报告格式,hook 文案,分发包内部布局与其他 metadata 字段也不冻结。不支持混装不同版本的机制文件。

## 实验性范围

实验性能力的流程与接口在 2.x 内可能不兼容地调整。调整时须说明迁移与旧任务接续方式,仍保护已有成果、历史和其他工作区,不越过用户授权。

| 范围 | 当前状态 |
| --- | --- |
| 并行协作的开工、同步、合并、退出,任务检查点与相关变化提示 | 已提供实验性实现;对其他任务分支进行中改动的普遍感知仍是后续探索 |
| 按上下文用量提醒保存 | 仅内部试用,不随套件分发 |
| 跨 Session 通信与自动协调 | 研究方向,有实验材料,尚非产品能力 |
| 脚本无法恢复时由 Agent 手工完成保存流程 | 尚未实现,列为后续实验方向;当前不开放手工接管 Git 操作 |

并行一项具体包括:`task.mjs` 的 `start / sync / land / close` 及其选项、并进主线流程、任务检查点的写法与查找约定(`Task:`、`Land-Checked:`,目标 / 进度 / 还剩三行)、概览里的分支信息、每轮提示的策略,以及单线程与并行之间的切换方式(仍是后续方向,尚未实现)。它们分布在多个文件里,不按整个文件划界;同一脚本里的稳定能力仍按上文的稳定清单承诺。旧检查点会通过兼容读取或明确迁移保持可恢复。不保证同一 worktree 多会话协作,不承诺跨会话自动编排或压缩后无损恢复。

启动检查、压缩后反馈和文件联动不整体列为实验性;验证覆盖与已知限制另行说明。列入实验方向不表示能力已经提供,也不开放当前规则禁止的操作。

