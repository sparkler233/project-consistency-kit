# 项目一致性机制 · CHANGELOG

> 正式套件版本以 `一致性机制/VERSION` 的 SemVer 为唯一正本;各机制文件头部的 `一致性机制 version: YYYY-MM-DD` 是统一修订日期(设计说明决策 9/24)。
> 任何机制文件发生真实变化:判断 SemVer 影响、全部修订日期一起 bump 到当天,并在此记入对应版本。
> 本文件**套件专属,不随模板进项目**(绿地 rsync 已排除;安装器也不拷它)。

## 未发布

- **改名 Recensio**:对外名称由 Project Consistency Kit 改为 Recensio,GitHub 仓库改名为 `recensio`(旧地址自动跳转)。装进项目的目录、标记、收尾指针与安装器 Skill 名不变。
- **公开文档**:`README.md` 改为英文,中文版为 `README.zh-CN.md`,按「只要 Git、项目现状加历史」重写开头,精简内部机制细节;兼容承诺与实验性范围从 README 挪到 `COMPATIBILITY.md` 与 `COMPATIBILITY.zh-CN.md`,内容不变。只改文档,不影响已发布的 2.0.0。

## v2.0.0 — 2026-10-02

**正式版(major)。** 2.0 线的第一个正式版,GitHub 的 latest 指向它,不带 `--release` 即可获取。相对 v1.3.0 的主要变化分在 [CHANGELOG](https://github.com/sparkler233/project-consistency-kit/blob/main/CHANGELOG.md) 里三个已发布的预览版中:决策历史进 Git、PROJECT 改为入口式、运行规则独立、wrapup 一次确认与脚本化(preview.1),分支检查点与联动命中(preview.2),实验性的 Core 并行(preview.3)。本节只写相对 preview.3 的变化;`2.0.0-preview.4` 从未发布,内容全部归入本版。

**怎么获取与升级**:

- 先更新机器级安装器(重新运行 README「安装」一节的 `npx skills add` 命令)。v1.3.0 与各预览版的安装器按旧版文件集合校验,会拒收 2.0.0 的包。
- 新项目:告诉 Agent「给这个项目引入一致性机制」。
- v1.3.0 及更早、2.0 各预览版的项目:安装器不处理,停止并说明;需自行迁移(例如让模型对照新版模板手工完成)。迁移要点:收尾指针从 `refs/tags/synced` 搬到 `refs/pck/synced`(旧标签不再读取;在主线上运行 `git update-ref refs/pck/synced "$(git rev-parse 'refs/tags/synced^{commit}')" && git tag -d synced`,只搬位置、不推进检查边界,各独立 clone 分别处理),删除机制自己的 Stop hook 接线与脚本(保留用户其他 hook),套件旧版的 `.claude/commands/` 命令换成新的薄适配器;v1.3.0 的项目另需把 PROJECT、AGENTS 与联动目录改成 2.0 的结构。
- 不支持降级;迁移是单独一次提交,需要时 `git revert`。

**兼容承诺**:2.x 内分稳定、实验性、不承诺三档,清单见 [COMPATIBILITY.zh-CN.md](COMPATIBILITY.zh-CN.md)(英文版 [COMPATIBILITY.md](COMPATIBILITY.md))。稳定的部分改动须兼容读取或提供迁移;实验性的可以调整,须说明迁移与旧任务接续;套件内部脚本的选项与 JSON 字段不对外承诺。

以下为 preview.3 发布后的全部改动:

- **决策颗粒度**:运行规则明确一条决策对应一个话题上定下的方向或取舍,澄清与补充改写原条,不相干的话题不并成一条;「限定」只写会改变后续做法的约束。wrapup 迁出前合并或拆开「待提交」的条目;攒下几个不相干话题时,Agent 可以自然建议保存。
- **去掉旧版本兼容**:安装器只负责全新引入和 2.0 以后的升级,v1.3.0 及更早版本、2.0 各预览版的项目需自行迁移;v1.3.0 升级细则与 Stop hook 退役步骤不再分发。运行时不再读取旧 `refs/tags/synced` 标签,`synced-guard.mjs migrate` 删除。获取脚本只接受 2.0 及以后的包,按当前文件集合校验,删除已弃用的 `--ref` 别名。分发文件减为 41 个。
- **收尾指针**:`synced` 改存 `refs/pck/synced`,普通收尾与并行合并通过共享模块原子更新,比较指针与主线位置以避免覆盖并发更新。同仓库 worktree 共享指针,独立 clone 不自动同步;普通推送全部标签不再带上它。
- **实验性范围**:明确并行及过程感知、上下文用量提醒、跨 Session 通信与自动协调、完整手工保存接手的实验性定位,区分已提供、内部试用和未实现。实验性流程与接口可在 2.x 不兼容调整,须说明迁移与接续并保留数据和授权保护;不因此新增或启用能力。启动检查、压缩后反馈和文件联动不整体归入实验性。
- **启动与引导**:catchup 聚焦项目整体与工作现场,取消任务深入调查和固定逐项报告;保留必要背景、Git 历史入口和重要异常。按需以易懂的产品概念引导并行工作,获准后由 Agent 准备 Git 隔离,catchup 本身保持只读。
- **保存节奏**:取消每项工作完成必提醒,由用户掌握节奏,Agent 可结合对话积累和任务进度自然建议。分支停下时保存检查点、提交授权与 Git 保护不变。
- **移除 Stop hook**:删除逻辑、旧 Unix/Windows 包装及机制接线。保留每轮提示、压缩后提醒和通用 Windows 适配器。升级需先刷新机器级安装器,再定向清理机制旧 Stop 项与标准脚本,保留用户自定义 hook;不是只替换文件即可完成的兼容补丁。
- **异常恢复**:wrapup 区分运行失败、执行中断与检查发现风险,先恢复或解决问题;中断后先核对已发生的变化再决定重试。暂时修不好时允许在授权内记录信息,明确未完成步骤;不开放手工迁出决策、提交、合并或推进基线。
- **Codex 压缩反馈**:压缩后先向用户显示“将重新读取项目说明与运行规则”,Agent 完成重读后简短说明恢复情况和下一步,发现缺口则如实说明。接线显式指定 Codex,其他宿主输出不变;不承诺信息完整保留。
- **最低限度启动检查**:`scope.mjs --overview` 增加可选 `--host codex|claude|unknown`,由 `startup-check.mjs` 只读检查必要文件及当前宿主项目级 JSON 接线。正常安静,异常由 Agent 解释;未知宿主、自定义路径与 TOML 内联配置注明未检查。不执行 hook、不修复、不写通过标记,原概览接口保留。
- **hook 可观测性**:`selfcheck.mjs` 按实际接线在临时仓库运行两项现有 hook,检查退出码和输出;只运行当前平台配置,另一平台注明未测。`hook-trace.mjs` 在 Git 公共目录保留最近 100 条失败记录,自检通过追加标记,概览报告之后的失败。自检不证明宿主信任或真实会话已执行;模块无法加载或适配器尚未找到仓库时可能无法留痕。
- **并行收工修复**:`task.mjs land --finish` 不再漏报刚开工或只有未提交改动的任务分支;已并进主线但尚未收工的仍不算进行中。
- **分发与验证**:新增自检、失败留痕、启动检查模块,移除三个 Stop 文件,另加入共享指针模块,移除 v1.3.0 升级细则,当前共 41 个分发文件。获取器只接受 2.0 及以后的包,按当前文件集合校验。CI 覆盖启动检查、失败留痕和自检。
- **版本**:VERSION 与安装器 metadata 为 `2.0.0`;GitHub Release 不再标为预发布,说明取自本节。
- **发布前验证**:macOS 上全部回归测试、hook 自检、干净构建与获取脚本校验通过,篡改文件或元数据不一致的包都被拒绝;用分发包在空仓库按安装器步骤首次引入,并跑一轮带冲突与决策撞号的并行。Windows(PowerShell 5.1、GBK、Node 24、`autocrlf=true`)上同样跑了回归测试、经 `run-hook.ps1` 的 hook 自检、构建、适配器测试与同一冒烟,结果一致;只有一项测试里模拟旧版 Git 的一段依赖 `/bin/sh`,在 Windows 上跳过。Codex 0.159.0 真实会话中手动压缩后,用户提示在下一轮出现,重读指令送达模型。未验证:模型在 Windows 上照安装器真实引入、Windows 上 Codex 真实会话的 hook、模型在只有 PowerShell 5.1 的机器上跑 wrapup、压缩后模型在实际工作中是否先重读;旧版本项目的手工迁移尚未在真实项目上做过。

## v2.0.0-preview.3 — 2026-10-01

**预发布(决策 115)。** 加入 Core 并行(实验性):一个人同时驾驶多个会话,各在自己的分支与 worktree 上工作,谁合并谁负责。与 preview.1 / preview.2 兼容:PROJECT、AGENTS 与联动目录的结构不变,升级替换机制文件、补上两个新 hook 的接线;从 v1.3.0 仍按升级细则。GitHub 上仍标为 prerelease,须 `--release v2.0.0-preview.3` 明确获取。

- **Core 并行(实验性,决策 105–115)**:
  - 运行规则第四节写入并行只守的三条:主线只通过检查过的合并前进、不改写主线历史;停下时把现状(目标、进度、还剩)写进分支上的检查点;只写自己的分支和 worktree。同步主线用脚本、不手抄;分支上不改 PROJECT 的总体状态与阅读入口。第三节写明用户说「收尾」就是运行 wrapup。
  - 新脚本 `task.mjs`:`start` 开工(分支、worktree 与可选的开工检查点,宿主已建好 worktree 时用 `--here`);`sync` 把主线合进本分支,「最近决策」一段的冲突由脚本解决;`land` 并进主线——未提交改动先存为检查点、同步主线、引导合并版 wrapup,`land --finish` 做合并提交、快进主线并推进 synced,主线被抢先时拒绝且不改动任何东西,重新同步后不相关就直接完成;`close` 收工,改动未进主线时拒绝并列出会丢掉的提交与决策。检查点找法集中在新文件 `checkpoints.mjs`。
  - 新 hook `parallel-notice.mjs`(每轮开始时,`UserPromptSubmit`):在任务分支上,主线的变化与本分支相关(改了同样的文件、命中联动规则或试合并冲突)时,把主线新增的提交、交集、命中的规则与试合并结果同时告诉模型和用户,末尾附同步命令;只报事实,不要求同步,同一主线位置只提示一次。
  - 新 hook `compact-reminder.mjs`(`SessionStart`,只在上下文压缩后):提醒重读 PROJECT 与运行规则;在任务分支上另附三条与同步、合并用的命令。Claude Code 与 Codex(0.158 起)接口相同。Windows Codex 经新的通用薄适配器 `run-hook.ps1` 调用这两个 hook。
  - `scope.mjs --overview`:每个分支另报是否已全部进主线、未提交改动、还没进主线的决策、找不到检查点(`handoff_missing`)与和别的分支共有未进主线的提交(`shares_unmerged_with`);分支上另报主线一侧命中的联动规则(`rules_hit_by_canonical`);新增本 worktree「待提交」里的决策(`pending_decisions`)。
  - `decisions.mjs`:分支上的检查点不必先跑 `plan`,三行由 `--goal` / `--progress` / `--remaining` 传入,没给的行沿用上一个检查点;`--land` 合并模式在分支上迁出决策并记下 `Land-Checked`;`--commit` 由脚本暂存 PROJECT、提交并核对;`plan` 的 `next` 列出要处理的事(新决策提到旧决策、撞号、认不出的内容),新增 `--mention` 表示只是提到;「最近决策」改为按 git 历史整段生成,被手改坏或合并冲突后下一次提交自动恢复;新增 `regen`。
  - wrapup:分支上的提交(含并进主线)不先确认,事后报告,主线上照旧确认一次(决策 111);描述写明用户说「收尾」「并进主线」时使用;分支段与决策问题的处理说明移进脚本输出,Skill 文字减少。catchup 报告各分支是否已进主线、未提交改动、还没进主线的决策与不变式提醒。
  - 已知限制:需要 Git 2.38 及以上;Windows 上未经真实会话验证(由 CI 跑回归测试);Codex 与 Claude Code 实测每种设置只跑过一次;联动内容是否真正核对仍靠模型;压缩后的提醒已在 Codex 上见到送达,之后模型是否照规则做未验证;两个会话先后合并时 PROJECT 总体状态一段常有冲突;用户拍板的事可能没被记成决策;hook 只在项目受信任时运行,Codex 桌面端可能不弹出 hook 审查窗口,要在终端里打开 Codex 批准一次;Codex 沙箱下并进主线须把主线目录列为可写;Claude Code 桌面版的 worktree 在仓库内 `.claude/worktrees/`,须加进 `.gitignore`(安装器会列入计划)。
- **安装器**:新增文件与三项 hook 接线(Stop、UserPromptSubmit、SessionStart);从 preview.1 / preview.2 升级时补上新接线;`.gitignore` 缺 `.claude/worktrees/` 时列入计划。`fetch-kit.sh` 对 preview.3 起的包要求新增的 5 个文件。
- **分发**:清单新增 `task.mjs`、`checkpoints.mjs`、`parallel-notice.mjs`、`compact-reminder.mjs`、`run-hook.ps1`(41 个文件);全部机制文件修订日期统一为 2026-10-01。并行的回归测试并入 CI(Linux 与 Windows)。
- **发布前审查的修正(2026-09-30,决策 116)**:
  - `decisions.mjs apply --commit` 没有 `--title` 时拒绝执行、不做任何改动。此前会照样提交:提交说明的第一段被 Git 当成标题;新分支上说明只有一行 `Task:` 时它不再是 trailer,这个检查点之后找不到(`handoff_missing`)。迁出决策时标题末尾的〔决策 N〕由脚本补上,写错的会被换掉。
  - `scope.mjs --overview` 的最近提交沿 first-parent,一次并进主线只占一行。此前合并提交与它的第二父提交标题相同,再加同步提交与合并前检查点,一次合并占两三行。
  - 分发文件里删去套件仓库自己的决策编号(wrapup Skill、`task.mjs` 的输出与说明、`scope.mjs` 的说明、两个 hook 的注释,共 7 处):用户项目的决策也从 1 编号,模型会把它当成自己项目的决策。分发校验脚本新增这项检查。
  - Claude Code 的 `/wrapup` 命令描述写明用户说「收尾」「并进主线」时使用(此前只有 Codex 读的 Skill 描述写了)。
  - `task.mjs` 开头检查 Git 版本,低于 2.38 时拦下并说明(`git_older_than_2.38`)。此前低于 2.35 时同步会以看不懂的错误失败。
  - 收尾提醒的文字改为「N 个文件自上次收尾后有改动,结束前建议执行 wrapup」。原为「自上次同步后」,而「同步」现在指同步主线。
  - 安装器:计划末尾与最终报告把 Codex 的 hook 审查单独列为需要用户做的一步(桌面端可能不弹出审查窗口,在终端里打开 Codex 批准一次;没批准时三项 hook 都不运行,也不报错);Git 低于 2.38 时注明并行用不了。初始化指南同样写明。
  - 说法更正:运行规则里机制的 hook 接线写全三项;`synced-guard.mjs` 与安装器不再称 guard 是 synced 的唯一入口(并行时 `task.mjs land --finish` 也推进它);公开 README 写明只有主线上才先确认、分支上的收尾不等确认,决策档案可以保留为只读,并行需要 Git 2.38。
  - CI:Linux 任务也对构建出的包跑 `fetch-kit.sh --verify-dir`(此前只有 Windows 任务跑)。
- **Windows 实机检查的修正(2026-10-01)**:推送公开 main 后 Windows CI 失败,在一台 Windows PowerShell 5.1(GBK)机器上排查:
  - 每轮提示与压缩后提醒的输出改为只用 ASCII 的 JSON(中文转成 `\uXXXX`),与收尾提醒相同。此前直接输出中文,在 Windows PowerShell 5.1 里经管道转发、存进变量时按系统代码页解码,中文被解乱、JSON 解析失败。
  - Windows 适配测试(不在分发包里)的注释改为 ASCII:PowerShell 5.1 按 ANSI 代码页读没有 BOM 的脚本,GBK 下一行中文注释吞掉了换行,把下一行代码也变成了注释,脚本无法解析。
  - 三个 hook 从输入的第一个 `{` 读起,跳过开头的 BOM 或按错的编码解出的 BOM 字符。PowerShell 的 `$OutputEncoding` 为 UTF-8(带 BOM)时,传给 Node 的 JSON 开头多一个 BOM,`JSON.parse` 失败,hook 当成没有输入:压缩后提醒不出声(要靠 `source=compact`),每轮提示读不到会话与目录,收尾提醒读不到会话 id、同一会话只提醒一次的去重失效。适配器自己读 stdin 时也不去 BOM,会原样转给 Node。新增三项回归测试(带 BOM、带按错编码解出的 BOM 的输入)。
  - 两个 PowerShell 适配器(`wrapup-reminder.ps1`、`run-hook.ps1`)取仓库根目录时不再经过 `Select-Object -First 1` 的管道,并在读到 git 的退出码之前不把 git 的 stderr 当成错误:此前提前结束管道可能让 `$LASTEXITCODE` 没有被设置,适配器随即静默退出,hook 没有输出。CI 上 Windows 检查时有时无地失败(直接运行 hook 正常、经适配器无输出,Stop 提醒与压缩后提醒都出现过),怀疑即此原因;在 Windows 实机上未能复现。
  - Windows 适配测试:两条 hook 链路各连跑 10 次,都要有输出;没有输出时用真实适配器的带说明副本连跑 10 次,统计提前退出、被吞掉的异常与 node 的退出码。

以下为 preview.2 之后、与并行无关的修复:

- **发布脚本**(套件仓库内部工具,不在分发包里):`scripts/publish-public.sh` 默认把内部历史接在最初的公开 main 之后,不再接在公开仓库当前的 main 之后(那样会把已公开的提交整段再重放一遍);生成后检查公开 main 原样包含在新历史里、新提交不重复已公开的提交,否则报错;没有新提交时说明无需推送。`--base-ref` 改为 `--base` 与 `--public-ref`。另按只放在本机的私人信息词表(内部仓库的 `.git/info/pck-private-words`,或 `--words` 指定)检查新增提交的说明与改动:触及公开文件的提交,它的说明会原样公开;出现词表中的词、或没有词表时报错,不打印推送命令(决策 116)。
- **决策脚本**(`decisions.mjs`,边界情况修复):
  - 「待提交」「最近决策」里有认不出的内容(如编号列表、段落)时列入 problems 且 apply 不执行。此前 plan 不报错、apply 会把它当空区清掉,内容既不在 PROJECT 也不进提交正文。
  - HEAD 不在任何分支上(detached)时不迁出决策。此前按主线处理,决策会迁进一个不在任何分支上的提交。
  - PROJECT 用 Windows 换行(CRLF,Git for Windows 默认 `autocrlf=true` 检出即如此)时,标题与索引行不再夹带 `\r`,写回时沿用原换行。
  - 只改写两个小节,不再把整个文件里连续的空行压成一行;内容不变时不写文件。
  - `--supersede` / `--partial` 的旧决策已不在「最近决策」、但 git 中有全文时照常执行(正文加 trailer);`--partial` 正文加 `Adjusts: 旧 by 新`。两处都没有才报错。
  - `--limit`、`新:旧` 的值不合法时报错且不执行;全角冒号可用。PROJECT.md 不存在时输出 `project_missing`,不再抛出异常。
- **范围脚本**(`scope.mjs`,边界情况修复):
  - 路径一律按 `-z` 读取:文件名含引号、制表符,或改名的文件名含空格时,不再带 C 风格引号(此前联动匹配与行数统计会漏掉它们);改名给出新路径 `path` 与原路径 `from`,不再拼成「旧 -> 新」。
  - 未跟踪的符号链接(含指向目录的)、读不了的文件、特殊文件不再让脚本崩溃,分别标 `symlink`、`unreadable`、`special`;未跟踪目录里的嵌套仓库不再把 `.git` 内部文件算进来(标 `nested_repo`),目录汇总最多走 20000 个文件。
- **联动命中**(`linkage.mjs`):触发可以跨行;路径可用 `*`、`?`、`**` 通配;反斜杠路径按 `/` 处理;Windows 换行可读。有路径、但路径之外还有另一个文字条件(如「或新增顶层目录」)而按路径没命中的规则,列入 `rules_not_checked` 由模型判断。此前它既不在命中里也不在待判断里,会被悄悄跳过。对路径的限定语(如「`a.md` 中的资格变化」)不算文字条件。
- **分支检查点**:reflog 里找到的检查点须仍在分支历史中。分支被 reset 离开旧任务后,catchup 不再把废弃的任务报成当前任务,检查点不再沿用旧任务名,Stop 提醒不再以它为基线误报。
- **wrapup**:每次提交的说明都由 `decisions.mjs apply` 写成文件再 `git commit -F`,不再只限于有决策迁出或在分支上;没有决策时 `apply` 不改 PROJECT。此前没有决策时没写怎么提交,用 `git commit -m` 在 Windows PowerShell 5.1 上会弄坏中文。
- **安装器**:步骤 6 与验证清单改用 2.0 模板的说法(「关键资料的受影响条件」表、「项目联动关系」的「小标题 + 触发 + 动作」),不再提 v1.3 的 Part A / 项目自定规则区;guard 验证改为 `inspect` 可运行,不再写「通过行为测试」(测试不随分发)。

## v2.0.0-preview.2 — 2026-09-27

**预发布(决策 103)。** 与 preview.1 兼容:PROJECT、AGENTS 与联动目录的结构不变,从 preview.1 升级只替换机制文件并更新接入块版本。Core 并行(分支之间的检查与集成)仍未完成,留到之后的预览版;本版只含与它无关的改动。GitHub 上仍标为 prerelease,须 `--release v2.0.0-preview.2` 明确获取。

- **运行规则**:写明「待提交」条目的格式——首行 `- 日期 · 决策 N:标题`,其下每项缩进一行。此前只列字段,模型可能写成 wrapup 决策脚本认不出的格式。
- **分支感知**(决策 85、88、93、94):分支上的 wrapup 提交成为任务检查点——说明段可写「目标:」「进度:」「还剩:」三行供之后接手(由模型按需填写,脚本不检查),`decisions.mjs` 自动加 trailer `Task: <任务名>`,新增 `--task` 换任务名;说明段中字面的 `\n` 按换行处理。`scope.mjs --overview` 新增 `current_branch_state`(分支上:最近检查点的说明与之后的提交、与主线的领先 / 落后、两边改动及交集、试合并结果)与 `other_branches`(其他分支的任务、「还剩」、领先 / 落后、能否干净合并),取代 `anomalies` 中的 `other_worktrees`、`unmerged_branches`(改为只报不在分支上的 `detached_worktrees`)。catchup 与 wrapup Skill 相应更新。
- **Stop 提醒**:在非 canonical 分支上以最近的任务检查点为基线,没有检查点时用与主线的分叉点,检查点已进主线且分支已接回主线时用分叉点;不再因主线前进或刚做完检查点而误报。
- **catchup**:删除「顶层目录在 PROJECT 与 AGENTS 中都未提及时提醒」,目录清单保留。文字精简:重复规则合并、原第 3、4 节合为「按需补读」、报告要求改为清单;删去文件形态检查禁令等与 catchup 无关的句子,行为规则不变。Git 概况的字段说明只留行为约束(不读未提交文件内容、提交只看标题、目录只看名称、分支上依据检查点接着做),字段含义与第 4 节重复的报告要求删去。
- **wrapup**:文字精简:「不扩大到整理」合为一处,推进 synced 的条件收为一张清单,四类结果的定义移到报告格式旁;删去「不审查或重排 AGENTS / CLAUDE 的文件形态」(是否检查由项目联动规则决定)及依据已撤回或过时的几句(如「轻量」「horizon」)。有实测依据的规则不变。加一段「机械步骤由随附脚本负责,结果只由脚本产生」的原则,原来针对单个现象的几句禁令(不抄哈希、不自行数行、只经 guard、不自己写 git tag)并入其中。报告的 synced 行不再要求写全部原因:「必要但未完成」不为空本身就阻止推进,不必在该行重复。
- **联动命中**:新增 `linkage.mjs`;`scope.mjs` 默认模式输出 `linkage`——按联动目录中每条规则「触发」行里的反引号路径,列出本次范围(基线后已提交与工作区改动)命中的规则 `rules_hit`,以及没有路径可比、需模型自行判断的 `rules_not_checked`;联动目录缺失或认不出规则结构时 `recognized: false`。只按路径,不判断规则是否成立、不改文件。wrapup 第 2 节据此逐条读命中的规则。分发模板的「项目联动关系」改为「小标题 + 触发 + 动作」,附格式示例;升级细则要求保留的项目规则保持或改成这种写法。
- **脚本**:`decisions.mjs`、`scope.mjs`、`synced-guard.mjs` 支持只打印用法的 `--help`;不认识的命令或参数报错且不执行(此前 `decisions.mjs apply --help` 会被当成一次 apply 真的执行)。
- **安装器**:新增从 2.0.0-preview.1 升级:只替换机制文件、按模板更新接入块、联动目录只更新版本行,不改造 PROJECT、AGENTS 正文与联动目录内容;项目自己的联动规则可改成新写法,列入计划由用户决定。仍支持从 v1.3.0 按升级细则升级。`fetch-kit.sh` 对 2.0.0-preview.2 起的包要求 `linkage.mjs`;preview.1 的引导器也能取得本版(本版包含它要求的全部文件)。
- **分发**:清单新增 `linkage.mjs`(36 个文件);全部机制文件修订日期统一为 2026-09-27。

## v2.0.0-preview.1 — 2026-09-25

**不兼容的大版本预发布(major,决策 76)。** 旧项目只换新文件会出错(新 wrapup 要求 PROJECT 有「待提交」「最近决策」小节),必须经安装器升级。多 Agent 并行、联动机制优化与更多脚本化尚未完成,故以预发布发布:GitHub 上标为 prerelease,默认 latest 仍为 v1.3.0,须 `--release v2.0.0-preview.1` 明确获取。

- **决策历史进 Git**(决策 45–48):PROJECT 改为入口式(目标与边界 / 总体状态 / 阅读入口 / 关键决策);拍板时决策全文写入「待提交」,wrapup 迁入提交正文并加 `Decision:` / `Supersedes:` trailer;「最近决策」最多 10 行,超出直接删最老行,没有全文的旧行逐字写入提交正文并加 `Decision-Archive:`。弃用决策档案及其模板。
- **运行规则独立**(决策 49、58、73、74):新增机制文件 `一致性机制/运行规则.md`(拍板即落盘、不重复记录、提交写明状态变化、二进制、何时用 catchup / wrapup);AGENTS 只留 `一致性机制:接入` 块(原“同步纪律”块,决策 75),不依赖 `@` 导入;不规定人与 AI 的分工。
- **catchup 两层读取**(决策 53、56、57、61):第一层读 PROJECT、运行规则与脚本给出的 Git 概况(最近 15 条提交标题、目录一层、并行与推送异常),固定报告“自上次收尾以来”;第二层按任务读细节。本仓库实测读取量约 6.5 万 → 约 1 万 token。压缩后不重跑,按 AGENTS 指令重读 PROJECT 与运行规则。
- **wrapup 一次确认与固定报告**(决策 60、61、66、70):维护计划、拟提交文件(用文字标明状态)、提交说明全文与 synced 条件一次确认;报告固定分项,单列“必要但未完成”。
- **机械步骤脚本化**(决策 62–64):新增 `scope.mjs`(Git 范围与未跟踪文件摘要)与 `decisions.mjs`(决策迁出、「最近决策」维护、提交说明文件与事后核对);提交统一用 `git commit -F`,避免 Windows PowerShell 管道弄坏中文。分支上不迁出决策并检查撞号(决策 72)。
- **整理模式**(决策 68):新增 wrapup 整理细则,只定目的、范围、底线与交付;日常 wrapup 报告末尾提醒可以整理的地方。阅读入口兼做主题索引(决策 67);拍板即落盘扩大到发现与待办(决策 69)。
- **安装器**(决策 75、77):全新引入按新模板;只支持从 v1.3.0 升级,由模型按升级细则完整改造 PROJECT、AGENTS 与联动目录,决策档案逐字写入升级提交后删除,删除均须确认。机制设计说明与机制 README 只留在套件仓库,不再装进用户项目。
- **分发与校验**:分发清单增加运行规则、两个脚本、整理细则与升级细则,删除档案模板、机制设计说明与机制 README(35 个文件);包修订日期改取运行规则;`fetch-kit.sh` 对 ≥2.0 的包要求新文件,对更早的包保持原要求;v1.3.0 引导器会拒绝新包,须先更新引导器(决策 76);发布工作流对带 `-` 的 tag 发预发布;GitHub 仓库只保留产品文件与公开文档,不再包含套件自身的 `PROJECT.md` 与决策档案;新增 `scripts/test-wrapup-scripts.mjs`(Linux 与 Windows CI)。
- **兼容与回退**:不支持降级;升级是单独一次提交,可 `git revert`。预览版之间可能不兼容,每个预览版只保证从上一站升级。
- **验证**:Codex(gpt-5.6-luna / gpt-5.6-sol)候选 catchup / wrapup 多轮测试、安装器全新引入与 v1.3.0 升级测试、Windows 上 Codex 跑 wrapup 冒烟测试、一个真实 v1.3.0 项目的试升级(副本上完成改造、提交、catchup 与 wrapup);测试记录含维护者本机与项目私有信息,不公开。均为单次运行;`fetch-kit.ps1` 与 Stop hook 适配器已在 Windows PowerShell 5.1 实测,安装器未在 Windows 实测。

## v1.3.0 — 2026-08-22

- **确定性 synced guard**(决策 27):新增 wrapup 内部 Node helper,由用户确认的本地 Git config 保存 canonical branch。guard 检查 branch、祖先关系、冲突、工作区和旧 ref,再用带 reflog 的 `git update-ref` 比较并交换创建或推进 `synced`;installer、首次 wrapup 与日常 wrapup 不再各自维护 `git tag` 逻辑。
- **并行 branch 正确基线**:canonical 使用项目级 `synced`;非 canonical 使用 `HEAD` 与 canonical 的唯一最佳 merge-base,可以完成本分支 B 类事件、联动检查与 checkpoint commit,但永远不得推进全局 horizon。无共同祖先、多个最佳 merge-base、detached 或同步历史分叉时 fail closed。
- **提交边界加固**:wrapup 在 `git add -A` 前新增明确的完整范围确认;已有 commit 未同步且没有 staged changes 时不制造空 commit。已有 `synced` 的推进必须工作区完全干净;首次 baseline 允许工作区已有变化,这些变化仍留在 horizon 之后。
- **跨入口统一**:catchup 消费 guard 的 `scope_base`,避免 feature 上 `git diff synced` 失真;安装器负责询问 canonical branch,实际初始 tag 操作委托 guard。新增 Linux / Windows guard 行为测试、分发白名单与 v1.3.0 包完整性检查;统一修订日期扫描补识别 Node 文件的 `//` 标记,避免新 helper 逃逸混合版本检测。
- **克制边界**:没有新增 Session registry、per-branch tag、checkpoint 命令或共享模块;Stop hook 第一版保持 fail-open 全局提醒,并记录 feature worktree 可能产生低风险 false positive。同一 worktree 多 Session 并发仍不支持。
- 这是新增兼容安全能力和用户可见的并行 branch 行为,正式版本升为 v1.3.0;全部机制修订标识推进到 2026-08-22。

## v1.2.2 — 2026-08-20

- **Windows Codex Stop 修复**(决策 26):`commandWindows` 不再嵌入含 `$root` 的二层 PowerShell 字符串;新增 `.agents/hooks/wrapup-reminder.ps1` 薄适配器,只从 git 根定位 Node 正本、转发 Stop JSON 并失败开放,不复制状态机逻辑。Node 输出的中文与 emoji 在 JSON 传输层改用标准 `\uXXXX` 转义,避免 Windows PowerShell 5.1 多层管道按本地代码页损坏 UTF-8;宿主解析后的用户文案不变。
- **根因纠正**:桌面端实测证明 Codex 已经调度 Hook;旧配置失效是因为会话 PowerShell 先将内层双引号中的 `$root` 展开为空,不是先前误判的宿主未执行。
- **回归门禁**:Windows 测试新增“外层会话 PowerShell → `commandWindows` → `.ps1` → Node”整链路,覆盖子目录启动、stdin 转发与 `$wrapup` `systemMessage`;安装器和分发校验从 v1.2.2 起必须携带该适配器,同时保留对旧版 Release 的反向校验兼容。Windows 10 + PowerShell 5.1 自动化、测试仓库命令直测与 Codex 0.148.0 桌面端真实 Stop 均已通过;桌面端以项目 Hook 通知浮层显示“5 个文件”与 `$wrapup`。
- **版本定位**:这是对既有 Windows Codex 能力的向后兼容修复,因此正式版本升为 v1.2.2;全部机制修订标识推进到 2026-08-20。

## v1.2.1 — 2026-08-19

- **Windows CI 构建修复**:构建与校验脚本在读取 `distribution/manifest.txt` 时显式剥离 CRLF 的 `\r`,兼容 Git for Windows `core.autocrlf=true` 的源码 checkout;不改变白名单内容、分发格式或目标项目换行策略。
- **发布纠偏**:`v1.2.0` 的 Linux 验证通过,但 Windows 源码构建因上述行尾问题失败,因此没有生成 GitHub Release;不移动已公开标签,以补丁版本 v1.2.1 重新发布。安装器 metadata 与 VERSION 同步推进到 1.2.1。
- 全部机制修订标识保持在 2026-08-19;同日补丁由 SemVer、实际 diff 与 source commit 区分。

## v1.2.0 — 2026-08-19

- **Windows 指令适配**(决策 25):`CLAUDE.md` 从相对 symlink 统一迁为只含 `@AGENTS.md` 的普通文件;它使用 Claude Code 官方项目内导入,继续让 AGENTS 保持唯一规则正本,并消除 Windows Developer Mode / 管理员权限与 Git symlink checkout 差异。
- **跨平台 Stop hook**:提醒判断迁入全 ASCII 固定路径 `.agents/hooks/wrapup-reminder.mjs`;Claude Code 改用无 shell 的 `command + args`,Codex 增加 `commandWindows` PowerShell 接线;原 `.sh` 只保留为 v1.1 旧接线兼容包装。ASCII 路径同时规避 Windows PowerShell 5.1 / shell 代码页导致的静默路径失真。
- **Windows 安装入口**:新增 `fetch-kit.ps1`,自动从 Git 安装位置发现 Git for Windows 自带的 Bash、转换 Windows / Git Bash 路径并复用 `fetch-kit.sh` 的下载与校验正本,不复制安全逻辑。
- **跨系统压缩包可移植性**:构建脚本禁止 macOS `tar` 写入 AppleDouble `._*` 扩展属性条目,避免候选包在 Windows 解压后出现未纳入校验清单的伪文件;PowerShell 包装器在失败时保留底层校验 diff。
- **双层 Windows 验证**:新增跨平台 Stop 状态机测试和 `windows-latest` CI job,覆盖 CLAUDE 导入形态、Codex `commandWindows`、Windows 构建与 PowerShell 本地分发验证;真实 Windows 10 + PowerShell 5.1 + Git for Windows 已通过安装、状态机和命令适配器直测。Codex 0.148.0 宿主仍受上游 Windows hook 触发缺陷影响;Claude Code 宿主端到端测试受测试账户状态阻断,不把两者误报为套件已端到端通过。
- **Node 20 弃用提醒清理**:GitHub Actions 的 `actions/checkout` 从 v4 升至 v6,使用当前 Node 24 action runtime;Release job 同时依赖 Linux 与 Windows 验证通过。
- **版本与分发联动**:正式版本推进到 v1.2.0;新增 Node hook、PowerShell 获取入口和跨平台测试,更新白名单、安装器、catchup / wrapup、模板、初始化指南、公开说明与机制设计。
- 全部机制修订标识保持在 2026-08-19;同日版本变化由 SemVer、实际 diff 与 source commit 区分。

## v1.1.0 — 2026-08-19

- **统一正式版本标识**(决策 24):新增 `一致性机制/VERSION` 作为套件唯一 SemVer 正本;安装器 Skill metadata、Git `v*` tag 与 versioned schema 1 分发元数据必须一致。原日期版本行保留为文件修订标识,不再承担对外产品版本职责。
- **版本可见与双向兼容**:安装器会报告自身版本、待安装 Kit 版本、目标项目现有版本、修订日期与来源提交;分发继续使用可扩展的 schema 1 并增加可选版本字段,让 v1.0.0 旧安装器仍能接受 v1.1.0 latest,新版安装器也能识别 v1.0.0 legacy 包。
- **Codex 本地 Stop hook**(决策 23):新增 `.codex/hooks.json`,与 Claude Code 的 `.claude/settings.json` 共同接入 `一致性机制/hooks/收尾提醒.sh`;共享脚本从 git 根定位项目并按宿主提示 `$wrapup` 或 `/wrapup`,仍只提醒、不自动续跑或修改项目。
- **安装器增量接线**:安装器会探测 `.codex/hooks.json` 与 `.codex/config.toml` inline hooks,复用现有表示并保留其他配置;两种表示并存时交给用户收敛,新增或变化的 Codex 项目 hook 明确报告待信任状态。
- **分发与文档对齐**:`.codex/hooks.json` 进入干净 Release 白名单和完整性检查;PROJECT、README、机制索引、设计说明、联动规则与绿地初始化补齐 Codex 本地 hook 边界,Windows `commandWindows` 与 Codex Cloud 仍不在本次范围。
- **决策轮转**:新增决策 23 后,把最旧的决策 13 从 PROJECT 轮转到套件决策档案,PROJECT 继续保留最近 10 条。
- 按决策 9 将全部机制版本行及根 / 模板 AGENTS 同步纪律版本推进至 2026-08-19。

## v1.0.0 — 2026-08-18

- **源码与发布面隔离**(决策 22):新增逐文件分发白名单、干净包构建/污染验证脚本和 `v*` 标签 GitHub Release 工作流;发布包携带来源元数据、内部逐文件 SHA-256 与外层压缩包校验,安装器默认获取干净 Release 而不是源码仓库。
- **决策档案模板隔离**(决策 21):新增空白 `templates/一致性机制/决策档案.md`;安装器与绿地初始化不再复制套件历史。升级时已有档案默认整文件保留;只对已知泄漏的精确记录行提示确认清理,且同一修订日期仍比较实际内容以接收同日热修。
- **跨 Harness 调用口径**(决策 20):安装器以“给这个项目引入一致性机制”作为统一的用户入口;`project-consistency-installer` 保留为稳定 Skill 标识,显式选择语法由 Harness 决定。
- **skills.sh 安装器分发**(决策 19):新增 `skills/project-consistency-installer/` 作为机器级安装行为唯一正本,使用标准英文 Skill 标识与 `agents/openai.yaml`,可由 `npx skills add sparkler233/project-consistency-kit --skill project-consistency-installer --global` 安装。
- **GitHub bootstrap**:安装器新增 `scripts/fetch-kit.sh`,在无本地套件时把规范 GitHub 仓库获取到机器缓存;验证 remote、干净工作区、ref、commit 与必要文件后才交给增量安装流程。
- **安装器宿主适配收敛**:`.claude/commands/引入一致性机制.md` 降为薄适配器;移除旧的中文名纯指针 Skill 和本机固定 `~/Developer/项目一致性机制` 依赖。
- **分发边界对齐**:公开 README 与绿地初始化改以 skills.sh 为默认首次落机入口;机器级 `skills/` 明确不随绿地项目复制,catchup / wrapup 仍由安装器写入目标仓库。
- **仓库级工作流 Skill**(决策 18):新增 `.agents/skills/catchup/` 与 `wrapup/` 作为跨 Harness 行为唯一正本,含标准 `SKILL.md` 和 `agents/openai.yaml`;Codex 可用 `$catchup` / `$wrapup` 或语义触发。
- **Claude Code 命令降为适配器**:`.claude/commands/catchup.md` 与 `wrapup.md` 不再复制完整流程,只读取对应仓库级 Skill;安装器新增旧完整命令定制迁移与单一正本验证。
- **跨 Harness 分发对齐**:绿地初始化自动复制 `.agents/skills/`;PROJECT、AGENTS、模板、机制索引、联动规则、公开 README 和示例统一说明 Codex / Claude Code 入口差异。
- **出向命令统一命名**(决策 17):原中文命令入口统一为 `/wrapup`,与 `/catchup` 形成会话开始 / 结束配对;命令文件改名为 `.claude/commands/wrapup.md`,随后由决策 18 降为 Skill 适配器。
- **旧项目安全迁移**:增量安装器识别旧版中文命令文件;内容未定制时经确认迁移到 `wrapup.md`,存在项目定制时要求人工合并,避免升级后保留两个出向入口。
- **三层文件模型**(决策 15):`README.md` 退出运行协议、只承载对外说明;新增 `PROJECT.md` 保存背景 / 流程 / 地图 / 阶段 / 近期决策;新增 `AGENTS.md` 作为 Agent 指令唯一实体正本,根 `CLAUDE.md` 改为相对链接 `AGENTS.md`。
- **catchup 去重复**:`/catchup` 不再完整读取 harness 已注入的 AGENTS / CLAUDE,只验证链接形态,再读取 PROJECT、Git、中枢与当前焦点;PROJECT 缺失时仅提供 README 旧版兼容提示。
- **决策落点迁移**:`/wrapup`、联动规则和决策档案将近期决策 canonical 落点从 CLAUDE 迁到 PROJECT,轮转上限仍为最近 10 条。
- **联动规则双份职责拆分**(决策 16):套件根 `一致性机制/文件联动目录.md` 改为套件自身真实规则;新项目骨架迁到 `templates/一致性机制/文件联动目录.md`,初始化器和安装器只复制模板。
- **分发模板重构**:移除 `templates/README.md` / `templates/CLAUDE.md`,新增 `templates/PROJECT.md` / `templates/AGENTS.md`;绿地初始化不再创建 README,显式创建 `CLAUDE.md -> AGENTS.md`。
- **增量迁移器重构**:`/引入一致性机制` 新增旧 CLAUDE / AGENTS 组合探测、事实与规则语义拆分、替换链接前章节对账和无 Git 历史备份要求;README 默认不写。
- **分发边界修正**:绿地 rsync 排除 `.DS_Store`、套件根 LICENSE 与套件真实联动目录;MIT 许可改复制到 `一致性机制/LICENSE.project-consistency-kit`,避免被误解为目标项目整体许可证。
- **决策 14 被扩展取代**:“根 CLAUDE 与 CLAUDE 模板分离”的中间设计未提交即被三层模型取代,保留在设计说明中作为演进线索。
- 按决策 9 将全部机制版本行及根 / 模板 AGENTS 同步纪律版本推进至 2026-08-18。

## 2026-08-17

- **公开主页与项目模板分离**（决策 13）：重写套件根 `README.md`，移除项目地图占位，补充工作流程、能力边界、便携安装命令和使用示例；新增 `templates/README.md` 作为新项目专用地图骨架。
- **绿地初始化修正**：`初始化新项目.md` 改为排除套件主页、示例和模板目录，再将 `templates/README.md` 复制为目标项目的 `README.md`，避免把套件介绍带进新项目。
- **已有项目安装修正**：`/引入一致性机制` 在目标项目缺少 README 时改用 `templates/README.md`，并优先从全局命令符号链接定位套件根，不再依赖作者本机目录名。
- **公开示例补全**：新增 `docs/example-session.md`，展示 `/catchup` 与 `/wrapup` 的简化输入输出和确认边界。
- 按决策 9 将全部机制版本行推进至 2026-08-17。

## 2026-07-23

- **安装器新增 skill 形态**(决策 12):新增 `一致性机制/skills/引入一致性机制/SKILL.md`——纯指针封装(正本仍是安装器命令文件,零双份漂移),经符号链接驻留 `~/.agents/skills/`,语义自动触发(「给这个项目装一致性机制」等),与全局命令 `/引入一致性机制` 等价;套件专属、机器级,不进项目(绿地 rsync 已排除;安装器本就不拷它)
- **联动目录规则 1 触发范围扩到 `一致性机制/skills/`**,动作覆盖「skill 封装变化」
- **全局命令符号链接重建**:本机 `~/.claude/commands/` 不存在(登记册所述落机从未执行或已失效)→ 按《初始化新项目》落机节重建;落机节同步补 skill 链接命令
- 按决策 9 bump 全部版本行到当天(含 CLAUDE.md 同步纪律 begin marker;新 SKILL.md 自带头一版)

## 2026-07-22

- **套件公开发布至 GitHub**(`sparkler233/project-consistency-kit`,private → public):新增 MIT `LICENSE`;README 顶部加门面介绍段(这是什么 / 快速上手 / 许可证),原「项目地图」骨架保留、降为二节;git 全部历史邮箱改写为 GitHub noreply、提交信息统一改为短主题行(细节留正文)后强推;仓库本地 `user.email` 同步改为 noreply 防回漏。本次无机制文件(版本行文件)变化,**版本不 bump**,仍为 2026-06-18。
- **删库重建清除悬空旧对象**:邮箱重写后被强推顶掉的旧 commit 在 GitHub 上仍可按 hash 匿名访问(实测 200,含旧邮箱)→ 删除仓库同名重建、重推全量历史(commit hash 不变),旧对象随旧库销毁(实测旧 hash 404);README 顶层目录表补登 `LICENSE` / `CHANGELOG.md` / `初始化新项目.md`。
- **提交信息风格约定**:短主题行(说清「做了什么」)+ 细节进正文——GitHub 文件列表只显示主题行;`/wrapup` 提交沿用此风格。

## 2026-06-18

- **catchup synced 检查去歧义**:第二层「未同步范围」原命令是 `git rev-parse … && git diff --stat synced || echo "(无 synced tag…)"`,踩了 `A && B || C` 陷阱——`synced` 已在 HEAD(零 diff)时 `git diff` 无输出、`echo` 又不触发,**健康稳态完全静默**,极易被读者(尤其 LLM)误读为「无 synced tag」;且 `git diff` 万一失败也会被误标成「无 tag」。改为显式三态输出(`synced` / `pending` / `no_tag`),稳态打印「(已同步:synced 已在 HEAD,无新改动)」。按决策 9 bump 全部版本行到当天(含 CLAUDE.md 同步纪律 begin marker)。
  - 注:单副本套件**不引入** `bin/sync-status.sh` 脚本与测试架——抽脚本只在「双宿主重复 + 有测试架」的项目里划算(如 校园杂志排版框架),属各项目本地增强,不回灌套件。

## 2026-06-12

- **出向兜底 hook 实装**(决策 10;推翻 06-11「暂不实装」的权衡——用户拍板要做):新增 `一致性机制/hooks/收尾提醒.sh`(挂 Stop 事件;有未同步改动时提醒收尾,每脏周期最多一次,只提醒不行动)+ `.claude/settings.json` 项目级接线;安装器步骤 2 纳入分发(hooks 拷贝 + settings JSON 增量合并);联动目录规则 1 触发范围扩到 hooks / 接线;决策 3「局限」改指向决策 10;8 场景脚本实测通过
- **决策记录轮转归档**(决策 11):CLAUDE.md「关键决策记录」只留最近 10 条——超限由 `/wrapup` 按新增**通用规则 6** 提议轮转(剪切)到 `一致性机制/决策档案.md`(新骨架文件,时间升序;不进 Part A、catchup 不默认读);wrapup.md 步骤 3 加条件触发检查;CLAUDE.md 骨架决策节加轮转说明;安装器步骤 2/3 纳入分发
- **全套一致性自查修正**(大项目启用前体检):两处结构树补 `决策档案.md`;初始化树「通用 5 条」→6;安装器计划表「3 文档」→4;设计说明 §二标题补「一个制度件」、§五钉死清单补 `settings.json`、决策 9 与 §七 的版本行枚举补 hooks 脚本;同步守则补规则 6 条件触发注
- **安装器 4 处实战回灌**(节点项目实跑 /引入一致性机制 06-12 版暴露):① 步骤 0 版本探测 glob 补 `一致性机制/hooks/*.sh`(原漏 hooks 脚本的版本行);② 该 grep 改 `-E` 锚定行首 `^(<!-- |# )`,避开机制设计说明正文里引用版本行格式的句子造成的误匹配;③ 步骤 2 settings.json 改「Write/Edit 写入、别用 shell cp」——cp 权限机制文件会被 Claude Code 权限分类器拦截;④ 决策记录锚点写明「有意无 marker、用标题 grep、永不整块替换」,杜绝与纪律块混淆

## 2026-06-11

- **版本治理启用**:6 个机制文件(catchup / 同步 / 安装器 / 三份机制文档)头部加统一版本行;新增本 CHANGELOG;`/引入一致性机制` 改为按版本行机械判定项目副本新旧(步骤 0 探测、步骤 2 询问更新、步骤 3 纪律块整块替换),计划表状态新增 🔼 可更新
- **`git add -f` 破例通道加 LFS 护栏**:必须先 `git lfs track "<路径>"` 再 add -f(机制设计说明决策 4、.gitignore、CLAUDE.md 纪律节三处同步);设计说明新增决策 9,第七节加「发版即 bump」维护规矩
- **模板 CLAUDE.md 的同步纪律节改用带版本的 marker 包裹**:绿地项目的纪律块从此也可被安装器版本检测、整块升级
- **`/wrapup` 步骤 5**:`git add -A` 前先回显 `git status --short`,用户过目入库范围(守则同步加条)
- **绿地 rsync 排除套件专属文件**(初始化新项目.md / CHANGELOG.md / 全局安装器)——新项目不再携带会过期的安装器副本
- **全局安装器符号链接文档化**:《初始化新项目》新增「套件首次落机」一节(建链命令 + 迁移注意);登记进 `一致性机制/README.md` 钉死文件登记册
- **修正 AGENTS.md 的 Windows 回退方向**:内容留 CLAUDE.md、AGENTS.md 做一行指针;原 `@AGENTS.md` 导入方案会把 CLAUDE.md 掏成空壳,致 /catchup 与 Part A 读空
- 机制设计说明决策 3「局限」补一句:B 类事件丢失可用 Stop hook 加固,经权衡暂不实装

## 追溯(版本治理启用前,自 git log)

- 2026-06-05:安装器内置 CLAUDE.md/AGENTS.md 双文件策略,从节点项目实跑回灌
- 2026-06-04:新增 `/引入一致性机制` 跨项目安装器;打磨机制文档——push 由用户负责、CLAUDE.md 改可见横幅、catchup 抑制 rev-parse 噪声
- 2026-06-03:初始版本——从〔中华体育精神读本〕harness 抽取并去书籍化
