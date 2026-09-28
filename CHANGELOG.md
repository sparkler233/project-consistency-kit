# 项目一致性机制 · CHANGELOG

> 正式套件版本以 `一致性机制/VERSION` 的 SemVer 为唯一正本;各机制文件头部的 `一致性机制 version: YYYY-MM-DD` 是统一修订日期(设计说明决策 9/24)。
> 任何机制文件发生真实变化:判断 SemVer 影响、全部修订日期一起 bump 到当天,并在此记入对应版本。
> 本文件**套件专属,不随模板进项目**(绿地 rsync 已排除;安装器也不拷它)。

## 未发布

版本号与修订日期在下次发版时统一推进。

- **发布脚本**(套件仓库内部工具,不在分发包里):`scripts/publish-public.sh` 默认把内部历史接在最初的公开 main 之后,不再接在公开仓库当前的 main 之后(那样会把已公开的提交整段再重放一遍);生成后检查公开 main 原样包含在新历史里、新提交不重复已公开的提交,否则报错;没有新提交时说明无需推送。`--base-ref` 改为 `--base` 与 `--public-ref`。

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
