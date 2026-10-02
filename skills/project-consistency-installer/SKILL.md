---
name: project-consistency-installer
description: Fetch Project Consistency Kit from a trusted local source or its verified clean GitHub Release, then safely integrate or upgrade PROJECT.md, AGENTS.md, the CLAUDE.md adapter, catchup and wrapup repository Skills, linkage rules, and hooks without silently overwriting project content. Use when the user asks to install, introduce, bootstrap, migrate, or update the consistency mechanism in the current repository.
metadata:
  version: "2.0.0"
---

<!-- 一致性机制 version: 2026-10-02 -->

# Project Consistency Installer

把 Project Consistency Kit 增量引入当前项目。安装器既能使用用户已有的本地源码 checkout 或干净分发目录,也能先从 GitHub Release 获取经过双层校验的只读套件源,再继续项目迁移。

核心原则:

1. **先定位源,再分析目标。** 套件源只读;当前工作目录才是目标项目。
2. **先计划、后确认、再写入。** 不静默覆盖已有内容,不擅自初始化 Git、commit 或 push。
3. **职责分离。** PROJECT 是项目入口(目标与边界、总体状态、阅读入口、关键决策),AGENTS 保存项目自己的 Agent 规则,机制怎么运行只写在 `一致性机制/运行规则.md`(机制文件),README 保持用户自有,CLAUDE 只用 `@AGENTS.md` 导入唯一规则正本。
4. **行为只有一个正本。** 本 Skill 是安装工作流正本;宿主命令只允许做薄适配。
5. **正式版本只有一个。** `一致性机制/VERSION` 是 Kit SemVer 正本;本 Skill 的 `metadata.version` 必须与它一致,日期版本行只表示机制文件修订日期。

## 步骤 0 · 确定目标项目与套件源

1. 把 Skill 被调用时的当前工作目录记为 `TARGET_DIR`,把当前加载文件的 `metadata.version` 记为 `BOOTSTRAP_VERSION`;后续切换目录后仍不得丢失目标或引导器身份。
2. 按以下顺序寻找套件源:
   - 用户本次明确提供的本地路径;
   - 环境变量 `PROJECT_CONSISTENCY_KIT_DIR` 指向的路径;
   - 当前目录本身就是套件源码仓库或干净分发目录(仅用于识别,若 `TARGET_DIR` 等于套件根则停止,不得把套件安装进自身);
   - 运行本 Skill 随附的获取脚本,从规范 GitHub Release 获取干净分发包到机器缓存:macOS / Linux 使用 `scripts/fetch-kit.sh`;原生 Windows PowerShell 使用 `scripts/fetch-kit.ps1`,后者定位 Git for Windows 自带的 Bash 并复用同一校验正本。
3. 运行下载脚本前,说明将访问网络并写入机器缓存,按当前 Harness 权限机制取得批准。脚本路径必须相对于**当前已加载的本 Skill 文件**解析,不得相对于目标项目猜测:
   ```bash
   bash "<本 Skill 所在目录>/scripts/fetch-kit.sh"
   ```
   可选参数:
   ```bash
   bash "<本 Skill 所在目录>/scripts/fetch-kit.sh" --release <v-tag>
   bash "<本 Skill 所在目录>/scripts/fetch-kit.sh" --offline
   ```
   原生 Windows PowerShell 等价调用:
   ```powershell
   & "<本 Skill 所在目录>\scripts\fetch-kit.ps1"
   & "<本 Skill 所在目录>\scripts\fetch-kit.ps1" -Release <v-tag>
   & "<本 Skill 所在目录>\scripts\fetch-kit.ps1" -Offline
   ```
   用户提供的本地路径若含 `DISTRIBUTION-METADATA.txt`,先用该目录内部同版本脚本做只读校验,再把 stdout 路径作为套件源:
   ```bash
   bash "<本地分发目录>/skills/project-consistency-installer/scripts/fetch-kit.sh" \
     --verify-dir "<本地分发目录绝对路径>"
   ```
   原生 Windows 使用:
   ```powershell
   & "<本地分发目录>\skills\project-consistency-installer\scripts\fetch-kit.ps1" `
     -VerifyDir "<本地分发目录绝对路径>"
   ```
4. 脚本 stdout 的最后一行是干净分发目录绝对路径,记为套件源;先完成下面的来源验证与版本记录,再切换行为正本。
5. 所有套件源至少包含:
   - `skills/project-consistency-installer/SKILL.md`
   - `.agents/skills/catchup/SKILL.md`
   - `.agents/skills/wrapup/SKILL.md`
   - `.claude/commands/catchup.md`
   - `.claude/commands/wrapup.md`
   - `.claude/settings.json`
   - `templates/PROJECT.md`
   - `templates/AGENTS.md`
   - `templates/一致性机制/文件联动目录.md`
   以及 `.codex/hooks.json` 与 `一致性机制/VERSION`。只接受 2.0 及以后的版本;完整文件集合由获取脚本按当前版本校验,早于 2.0 的包会被拒绝。
6. 记录版本与来源并在计划和最终报告回显:
   - 干净分发目录必须有 `DISTRIBUTION-METADATA.txt` 与 `DISTRIBUTION-MANIFEST.sha256`;记录其中的 `kit_version`、`mechanism_revision`、规范仓库、release ref 与 source commit;
   - 本地源码 checkout 必须是 Git 仓库;读取 `一致性机制/VERSION` 为 `SOURCE_VERSION`,读取源内安装器 `metadata.version`,两者必须一致;另记录统一修订日期、`git rev-parse HEAD` 与当前 ref,有未提交改动时明确标出;
   - 当前加载的 `BOOTSTRAP_VERSION` 与取得的 `SOURCE_VERSION` 不同时同时报告;
   - 两种来源都不满足时停止。不得拿无来源、校验失败或半成品目录继续安装。
7. 来源通过验证后,完整读取套件源的 `skills/project-consistency-installer/SKILL.md`;若它不是当前已加载文件,把取得版本视为后续行为正本,保留已经验证的来源与版本记录,从步骤 1 继续,不要再次运行步骤 0。

## 步骤 1 · 探测目标现状

在 `TARGET_DIR` 中执行只读检查:

```bash
git --version
git rev-parse --is-inside-work-tree 2>/dev/null
git rev-parse -q --verify HEAD
git rev-parse -q --verify refs/pck/synced
git status --short 2>/dev/null
cat 一致性机制/VERSION 2>/dev/null
grep -hE '^(<!-- |# |// )一致性机制 version:' \
  .agents/skills/*/SKILL.md \
  .agents/skills/*/agents/openai.yaml \
  .agents/skills/*/scripts/*.mjs \
  .agents/skills/*/references/*.md \
  .agents/hooks/*.mjs \
  .agents/hooks/*.ps1 \
  .claude/commands/*.md \
  一致性机制/*.md \
  一致性机制/hooks/*.sh \
  一致性机制/hooks/*.mjs \
  skills/project-consistency-installer/scripts/*.ps1 2>/dev/null | sort -u
ls -l README.md PROJECT.md AGENTS.md CLAUDE.md 2>/dev/null
ls -l .claude/settings.json .codex/hooks.json .codex/config.toml 2>/dev/null
test -L AGENTS.md && readlink AGENTS.md
test -L CLAUDE.md && readlink CLAUDE.md
```

Git 低于 2.38 时在计划与最终报告中注明:并行(`task.mjs` 与每轮提示的试合并)用不了,其余照常。

把目标 `一致性机制/VERSION` 记为 `TARGET_VERSION`:不存在时标为“未标记”,不得从日期行反推 SemVer。`SOURCE_VERSION > TARGET_VERSION` 是升级,相等时仍检查实际 diff,`SOURCE_VERSION < TARGET_VERSION` 是降级请求,必须单独提示并再次确认。

升级只支持从 2.0.0 及以后的版本开始:PROJECT、AGENTS 正文与联动目录的结构不变,替换机制文件、按模板更新接入块,联动目录只更新版本行;模板的「项目联动关系」规则写法有变化时,在计划中列出项目自己的哪些规则可以改成新写法,由用户决定改不改,改也只改写法、不改含义。`TARGET_VERSION` 早于 2.0.0(含 v1.x 与 2.0 各预览版),或未标记版本但已有机制痕迹时,停止:说明安装器不处理旧版本升级,这类项目由用户自行迁移,不做部分升级。

完整读取现有 PROJECT、实体 AGENTS、实体 CLAUDE 与 README 的相关结构,建立内容归属表:

- 目标与边界、总体状态、各类资料在哪里、决策 → PROJECT(入口式;主题细节归主题文档);
- 项目自己的工作约定、质量规则、权限边界 → AGENTS;
- 机制怎么运行 → `一致性机制/运行规则.md`(机制文件,不写进 AGENTS);
- 面向用户的介绍、安装、API、使用说明 → README 原位保留;
- 无法可靠分类 → 列给用户决定,不擅自移动。

## 步骤 2 · 判定入口迁移路径

| 当前状态 | 计划 |
|---|---|
| AGENTS / CLAUDE 都不存在 | 从模板创建 AGENTS,再创建只含 `@AGENTS.md` 的 CLAUDE 适配器 |
| 只有实体 AGENTS | 保留内容并补接入块(引用运行规则);创建 CLAUDE 导入适配器 |
| CLAUDE 只含 `@AGENTS.md` | 验证 AGENTS 是实体正本;缺什么补什么 |
| 只有其他实体 CLAUDE | 事实迁入 PROJECT、规则迁入 AGENTS;核对后以导入适配器替换 CLAUDE |
| 两者都是实体 | diff + 语义合并;AGENTS 留规则,事实进 PROJECT;核对后替换 CLAUDE |
| `AGENTS.md -> CLAUDE.md` | 读取 CLAUDE 实体并拆分;最终让 AGENTS 恢复为实体、CLAUDE 改为导入适配器 |
| `CLAUDE.md -> AGENTS.md` | 视为 v1.1 兼容状态;验证内容后迁移为跨平台导入适配器 |
| 其他链接 / 循环 / 断链 | 标失败并等待用户确认修复 |

替换实体 CLAUDE 前必须同时满足:

- PROJECT 与 AGENTS 已准备好;
- 展示原 CLAUDE 每个一级 / 二级章节的新落点,无未归属章节;
- Git 已跟踪时确认 diff 可恢复;没有可恢复 commit 时先备份到 `一致性机制/迁移备份/CLAUDE.md`;
- 用户再次确认后才删除旧实体或链接并创建一行导入适配器。

## 步骤 3 · 拟订总计划并确认

逐项给出新建 / 合并 / 迁移 / 更新 / 跳过 / 询问状态:

```text
引入 / 迁移计划
┌──────────────────────────────────┬────────────────────────────────────────┬────────┐
│ 目标                             │ 动作                                   │ 状态   │
├──────────────────────────────────┼────────────────────────────────────────┼────────┤
│ PROJECT.md                       │ 新建;首次引入补入口结构              │ …      │
│ AGENTS.md                        │ 新建或合并工作规则 + 接入块             │ …      │
│ CLAUDE.md                        │ 核对后替换为一行 @AGENTS.md             │ …      │
│ README.md                        │ 默认不动;仅判断是否登记为关键资料       │ 跳过   │
│ .agents/skills/(catchup/wrapup)  │ 新建或按版本更新行为正本                │ …      │
│ .claude/commands/(catchup/wrapup)│ 新建或迁移为 Claude Code 薄适配器       │ …      │
│ 一致性机制/(运行规则、hooks)     │ 从套件新建或按版本更新                  │ …      │
│ 一致性机制/VERSION               │ 全部机制件验证成功后最后写入             │ …      │
│ 文件联动目录.md                  │ 从分发模板新建或补齐结构,保留项目规则  │ …      │
│ .claude/settings.json            │ 增量接线每轮提示、压缩后提醒 │ …      │
│ .codex hooks                     │ 同上两项接线 + 提示信任                 │ …      │
│ 项目自定中枢 / 领域规则          │ 扫描候选后询问                          │ …      │
│ .gitignore / .gitattributes      │ 按项目二进制类型询问                    │ …      │
│ canonical / synced              │ 确认本地配置;由 guard 建立初始 horizon   │ …      │
└──────────────────────────────────┴────────────────────────────────────────┴────────┘
```

计划展示后必须询问用户是否执行。另确认:

- 无法分类的旧内容放哪里;
- README 是否承载需同步维护的公开契约;
- 项目是否含图片、设计稿、字体或媒体;
- 不是 Git 仓库时是否允许 `git init`。

新增或变化了 hook 接线时,计划末尾单独列出「装完后需要你做的一步」,不要只留到最后的报告:Codex 的项目 hook 要用户审查批准后才运行,没批准时每轮提示、压缩后提醒都不会运行,也不报错。Codex 桌面端可能不弹出审查窗口,这时在项目目录的终端里打开 Codex(CLI),用 `/hooks` 审查并批准,只需一次。Claude Code 按它自己的提示确认 hook。

## 步骤 4 · 建立 PROJECT、AGENTS 与 CLAUDE 适配

**PROJECT.md**

- 不存在但旧 CLAUDE / README 有事实 → 按套件 `templates/PROJECT.md` 的结构新建,基于现有内容填写并标明来源,README 原文不动;
- 无可迁移事实 → 从 `templates/PROJECT.md` 新建,按实际仓库预填可确认内容;
- 已存在(首次引入)→ 保留已有内容,按模板补齐入口结构,至少补出「关键决策」下的「待提交」「最近决策」两个小节(wrapup 的决策脚本按这两个小节读取);超出补齐的结构调整,按套件 `.agents/skills/wrapup/references/document-maintenance.md` 提出,经用户确认;
- 决策落点:「关键决策」下的「待提交」(拍板时写全文)与「最近决策」(每条一行索引)。

**AGENTS.md**

- 不存在 → 从 `templates/AGENTS.md` 新建,再合并旧规则;
- 已存在实体 → 原结构不动;按模板 begin/end marker(`一致性机制:接入`)补上或整块替换接入块(块内只引用运行规则并给出压缩后指令);块内有项目自加内容时先展示,移到块外保留;
- 已是链接 → 先解析实际内容,不得叠加链接;
- catchup 必须明确不重复读取 harness 已注入的 AGENTS / CLAUDE。

**CLAUDE.md**

- 正确状态是普通文件且内容精确为一行 `@AGENTS.md`;这是 Claude Code 官方支持的项目内导入,不会复制 AGENTS 内容,并避免 Windows symlink 权限与 checkout 差异;
- 已有其他实体或任意链接 → 仅在步骤 2 安全条件满足并二次确认后替换;
- 完成后验证:
  ```bash
  test -f AGENTS.md
  test ! -L CLAUDE.md
  test "$(tr -d '\r\n' < CLAUDE.md)" = "@AGENTS.md"
  ```
  原生 Windows PowerShell:
  ```powershell
  if (-not (Test-Path -LiteralPath .\AGENTS.md -PathType Leaf)) { throw "AGENTS.md missing" }
  if ((Get-Content -LiteralPath .\CLAUDE.md -Raw).Trim() -ne '@AGENTS.md') { throw "invalid CLAUDE adapter" }
  ```

## 步骤 5 · 安装或更新机制件

从已验证的套件源读取。不存在才新建;已存在时比较统一版本行、实际内容和项目定制,用户确认后更新。版本行相同不等于内容相同:同日热修仍须做 diff;只有规范内容确实一致才能跳过,差异中含项目定制时先拆分归属,不得整文件覆盖:

- `.agents/skills/catchup/`、`.agents/skills/wrapup/`(完整目录,含 `SKILL.md`、`agents/openai.yaml`、`scripts/` 与 `references/`);
- `.claude/commands/catchup.md`、`.claude/commands/wrapup.md`;
- `一致性机制/运行规则.md`(机制文件,整体替换,项目不手改);机制设计说明与机制 README 只留在套件仓库,不装进项目;
- `.agents/hooks/parallel-notice.mjs`(每轮提示:在任务分支上,主线变化与本分支相关时报出事实)、`.agents/hooks/compact-reminder.mjs`(压缩后提醒:上下文被压缩后提醒重读规则)与 `.agents/hooks/run-hook.ps1`(Windows Codex 通用薄适配器,按名字转发到这两个 Node hook);
- `.agents/hooks/selfcheck.mjs`(hook 自检:按项目实际接线在临时仓库里把每个 hook 跑一遍;hook 的失败留痕在 wrapup 的 `scripts/hook-trace.mjs`,随 wrapup 目录安装);
- `一致性机制/LICENSE.project-consistency-kit`(从套件根 LICENSE 新建,已有不覆盖)。

`一致性机制/VERSION` 不参与内容合并,但只能在本轮用户批准的机制件全部写入并通过步骤 8 验证后,最后原样写入 `SOURCE_VERSION`。用户跳过任一必需升级、出现未解决冲突或验证失败时不得推进 VERSION;报告目标处于 mixed / pending 状态,避免把部分安装伪装成完整版本。

`一致性机制/文件联动目录.md` 必须来自套件的 `templates/一致性机制/文件联动目录.md`,不是套件自身真实规则。首次引入且目标已存在时只逐条补缺,保留项目自定内容;升级时只更新版本行。

决策全文在 git 提交正文,「最近决策」由 wrapup 的决策脚本按 git 历史生成,不另建决策档案;已有项目索引里 git 中没有全文的旧行,被挤出时逐字写入提交正文。

宿主接线共两项,各指向一份跨平台 Node 脚本:`UserPromptSubmit` → 每轮提示 `parallel-notice.mjs`;`SessionStart` → 压缩后提醒 `compact-reminder.mjs`(它只在压缩后输出,新会话、恢复时静默)。`.claude/settings.json` 已存在时只向这两个事件分别追加对应 entry;已有同类 entry(命令含同名脚本)就跳过,不覆盖其他 hooks。

Claude Code 的 entry 应使用 `command: "node"` + `args: ["${CLAUDE_PROJECT_DIR}/.agents/hooks/<脚本名>.mjs"]`,避免依赖宿主 shell与非 ASCII 命令路径。

Codex 本地客户端使用同样两份 Node 脚本,但接线必须先识别目标项目已有的 hook 表示:

- `.codex/hooks.json` 与 `.codex/config.toml` 都不存在或后者没有 inline hooks → 从套件新建 `.codex/hooks.json`;
- 已有 `.codex/hooks.json` → 识别命令中包含 `parallel-notice.mjs`、`compact-reminder.mjs` 或 `run-hook.ps1` 的旧 / 新 entry;旧 entry 经确认原位升级,不存在才增量加入,保留其他事件、matcher 与命令;
- `.codex/config.toml` 已含 `[hooks]` 或 `[[hooks.` → 不再创建 `hooks.json`,避免同层两种表示并存警告;经用户确认后向现有 TOML 增量加入等价接线:
  ```toml
  [[hooks.SessionStart]]

  [[hooks.SessionStart.hooks]]
  type = "command"
  command = 'node "$(git rev-parse --show-toplevel)/.agents/hooks/compact-reminder.mjs" --host=codex'
  command_windows = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path (git rev-parse --show-toplevel) '.agents/hooks/run-hook.ps1') compact-reminder -Codex"
  timeout = 10
  ```
  Codex 的 SessionStart 接线用 `--host=codex`,Windows 用 `-Codex` 转发该参数,启用用户状态提示与 Agent 恢复后反馈;Claude 接线不加这个参数。已有同名脚本接线也要比较参数,不能仅凭名字相同跳过升级。
  `UserPromptSubmit` 不带这两个参数,其余写法相同,`command` 换成 `parallel-notice.mjs`,`command_windows` 调用 `run-hook.ps1` 并在末尾写 hook 名(`… '.agents/hooks/run-hook.ps1') parallel-notice`),与套件 `.codex/hooks.json` 一致;
- 两种 Codex hook 表示已经并存 → 标为待整理,展示现状并由用户选择保留哪一种;不得继续制造重复 entry;
- Codex 项目 hook 只覆盖本地客户端。写入后提醒用户在 Codex CLI 用 `/hooks` 审查并信任新配置;未信任或项目 `.codex/` 层未受信任时,hook 会被跳过,没有任何报错。Codex 桌面端可能不弹出审查窗口:请用户在项目目录的终端里打开 Codex 完成审查,一次即可。原生 Windows 必须同时写入 `commandWindows`,并让它调用包内 `.ps1` 薄适配器,不得内联带 PowerShell 变量的第二层命令字符串;配置存在不等于当前 Codex 版本已经成功运行,最终报告应区分“已接线 / 已信任 / 已实测”。

## 步骤 6 · 发现中枢、领域规则与二进制策略

1. 扫描已跟踪文件、顶层与常见文档目录。
2. PROJECT 固定登记在联动目录的「关键资料的受影响条件」表中。
3. README 只有承载公开安装 / API / 使用契约且用户确认时才登记进该表。
4. 列出 ADR、spec、schema、contract、大纲、风格定义等候选,由用户选择后登记进该表。
5. 询问稳定的“改 A 必查 B”规则,确认后按模板的「小标题 + 触发 + 动作」写进「项目联动关系」,触发中的文件或目录用反引号写出路径。
6. 含图片 / 设计稿 / 字体 / 媒体 → 只增补缺失的 ignore / LFS 规则;纯代码 / 纯文字项目跳过 LFS。
7. `.gitignore` 缺少 `.claude/worktrees/` 时列入计划增补:Claude Code 桌面版把并行会话的 worktree 建在仓库内这个目录,不忽略的话主线会把它当成未跟踪目录,报告工作区不干净、synced 无法推进。

## 步骤 7 · 配置 canonical branch 并建立 synced horizon

- 不是 Git repo → 只有用户同意才初始化 Git;
- 读取 `git config --local --get projectConsistency.canonicalBranch`;缺失时显示当前 branch,询问用户是否把它设为项目 canonical branch,只有确认后才写入本地 Git config,不静默猜 `main` 或 `origin/HEAD`;
- 所有自动创建或推进 `synced` 的入口统一委托目标项目 `.agents/skills/wrapup/scripts/synced-guard.mjs`,安装器不得另写 `git tag` 逻辑;
- 有 commit 且无 `synced` → 用户确认初始 horizon 后调用 guard `advance`,把当前 canonical HEAD 建为 baseline。首次创建允许工作区已有 staged / unstaged / untracked 变化,它们仍完整留在 baseline 之后等待 wrapup;
- 无 commit → 先展示提交范围和 message,用户确认后才首 commit,再调用 guard 建立 `synced`;
- 已有 `synced`(`refs/pck/synced`)→ 不推进检查边界;调用 guard `inspect` 报告 current / canonical branch、正确 `scope_base` 与安全状态。同一 clone 的 worktree 共享这个引用;普通 `push --tags` 不带它,显式 refspec 或镜像推送仍可带走;
- 当前不在已确认的 canonical branch、detached、冲突或历史无可靠共同祖先 → 不切 branch、不创建指针,报告 canonical setup / horizon pending,交给用户整理。

## 步骤 8 · 报告与验证

报告 `BOOTSTRAP_VERSION`、`SOURCE_VERSION`、安装前 `TARGET_VERSION`、安装后版本状态、统一修订日期、套件源 URL、release/ref、source commit、来源类型,以及新建、合并、迁移、跳过、失败和待填项。至少验证:

- PROJECT 为入口式:目标与边界、总体状态、阅读入口(写出各位置的具体主题)、关键决策(「待提交」「最近决策」);`node .agents/skills/wrapup/scripts/decisions.mjs plan` 不报 `section_not_found`;
- `一致性机制/运行规则.md` 存在,AGENTS 接入块引用它;`node .agents/skills/wrapup/scripts/scope.mjs --overview` 可运行;
- AGENTS 是实体正本,CLAUDE 是只含 `@AGENTS.md` 的普通文件适配器;
- catchup / wrapup 两个仓库级 Skill 存在且通过 Skill 校验;
- synced guard 存在,`node .agents/skills/wrapup/scripts/synced-guard.mjs inspect` 可运行并给出 branch 与 `scope_base`;catchup 与 wrapup 都消费它给出的 branch / `scope_base`,安装器不另写 tag 操作(并行时 `task.mjs land --finish` 在主线前进后推进 synced,属于机制脚本自身);
- catchup 不重复读取 Agent 指令;
- Claude 的 catchup / wrapup 文件只是薄适配器;
- Claude Code 与 Codex 本地客户端的 UserPromptSubmit、SessionStart 配置分别指向包内的每轮提示、压缩后提醒 Node 脚本;Codex 含不内联变量脚本的 `commandWindows`(两项都调 `run-hook.ps1`),并安装这个 `.ps1` 薄适配器,且没有重复的 JSON / TOML hook 表示;`node .agents/skills/wrapup/scripts/task.mjs --help` 可运行;
- 接线写入后运行 `node .agents/hooks/selfcheck.mjs`:它按项目实际接线在临时仓库里把每个 hook 跑一遍,逐项报告有无输出;失败的项照实列出,不说成已装好。它只证明接线能出声,不代表宿主已信任、已经运行;
- Codex 新增或变化的项目 hook 已明确报告“待用户信任”或“已由用户信任”,不把配置存在误报为已经运行;报告把「需要你做的一步」单独列在最前面,不混在验证清单里:在项目目录的终端里打开 Codex,用 `/hooks` 审查并批准(桌面端可能不弹出审查窗口),没批准时两项 hook 都不会运行;
- 完整安装时目标 `一致性机制/VERSION` 等于来源版本;部分安装或失败时 VERSION 未被错误推进;
- README 不存在或完全改写时工作流仍可运行;
- 联动目录的「关键资料的受影响条件」表已登记项目真实的关键资料;
- 用当前 Harness 的入口执行一次 catchup。

## 守则

- 下载脚本只获取和验证干净 Release,不得修改目标项目。
- 发布包外层 SHA-256、内部逐文件清单、来源元数据或缓存完整性任一失败时停止,不得静默回退到源码仓库。
- 用户明确提供的本地源码 checkout 可以作为开发来源;非规范远端不得由下载脚本静默获取。
- 不从不受信任的 fork 静默获取;非规范来源必须由用户以本地路径明确提供。
- 不丢旧内容。首次引入不因模板更标准而重排用户文档;删除须经用户确认。
- README 默认不写、不创建、不作为项目地图。
- AGENTS 是项目自己的指令正本,机制规则只在 `一致性机制/运行规则.md`;CLAUDE 只用 `@AGENTS.md` 做导入适配。
- PROJECT 是项目入口;决策全文先在「待提交」,wrapup 后在 git 提交正文。
- catchup / wrapup 以目标仓库 `.agents/skills/` 为行为正本。
- 每轮提示、压缩后提醒各以 `.agents/hooks/` 下的同名 `.mjs` 为跨平台逻辑正本;`run-hook.ps1` 只做 Windows Codex 路径定位与 stdin 转发,宿主配置只做接线;`selfcheck.mjs` 只做自检,失败留痕只在 `hook-trace.mjs`。
- `一致性机制/VERSION` 是正式套件版本正本;日期版本行只用于修订与混合版本检测。
- 不擅自 `git init`、commit 或 push;提交只在用户看过提交说明全文并确认后进行。
