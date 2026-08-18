---
name: project-consistency-installer
description: Fetch Project Consistency Kit from a trusted local checkout or its canonical GitHub repository, then safely integrate or upgrade PROJECT.md, AGENTS.md, the CLAUDE.md adapter, catchup and wrapup repository Skills, linkage rules, and hooks without silently overwriting project content. Use when the user asks to install, introduce, bootstrap, migrate, or update the consistency mechanism in the current repository.
---

<!-- 一致性机制 version: 2026-08-18 -->

# Project Consistency Installer

把 Project Consistency Kit 增量引入当前项目。安装器既能使用用户已有的本地套件仓库,也能先从 GitHub 获取只读套件源,再继续项目迁移。

核心原则:

1. **先定位源,再分析目标。** 套件源只读;当前工作目录才是目标项目。
2. **先计划、后确认、再写入。** 不静默覆盖已有内容,不擅自初始化 Git、commit 或 push。
3. **职责分离。** PROJECT 保存项目事实,AGENTS 保存 Agent 规则,README 保持用户自有,CLAUDE 只做链接适配。
4. **行为只有一个正本。** 本 Skill 是安装工作流正本;宿主命令只允许做薄适配。

## 步骤 0 · 确定目标项目与套件源

1. 把 Skill 被调用时的当前工作目录记为 `TARGET_DIR`;后续切换目录后仍不得丢失这个目标。
2. 按以下顺序寻找套件源:
   - 用户本次明确提供的本地路径;
   - 环境变量 `PROJECT_CONSISTENCY_KIT_DIR` 指向的路径;
   - 当前目录本身就是套件仓库(仅用于识别,若 `TARGET_DIR` 等于套件根则停止,不得把套件安装进自身);
   - 运行本 Skill 随附的 `scripts/fetch-kit.sh`,从规范 GitHub 仓库获取到机器缓存。
3. 运行下载脚本前,说明将访问网络并写入机器缓存,按当前 Harness 权限机制取得批准。脚本路径必须相对于**当前已加载的本 Skill 文件**解析,不得相对于目标项目猜测:
   ```bash
   bash "<本 Skill 所在目录>/scripts/fetch-kit.sh"
   ```
   可选参数:
   ```bash
   bash "<本 Skill 所在目录>/scripts/fetch-kit.sh" --ref <tag-or-commit>
   bash "<本 Skill 所在目录>/scripts/fetch-kit.sh" --offline
   ```
4. 脚本 stdout 的最后一行是套件仓库绝对路径。完整读取该路径下的 `skills/project-consistency-installer/SKILL.md`;若它不是当前已加载文件,把获取到的版本视为后续行为正本,从步骤 1 继续,不要再次运行步骤 0。
5. 验证套件源至少包含:
   - `skills/project-consistency-installer/SKILL.md`
   - `.agents/skills/catchup/SKILL.md`
   - `.agents/skills/wrapup/SKILL.md`
   - `.claude/commands/catchup.md`
   - `.claude/commands/wrapup.md`
   - `templates/PROJECT.md`
   - `templates/AGENTS.md`
   - `templates/一致性机制/文件联动目录.md`
   - `templates/一致性机制/决策档案.md`
6. 记录套件源 `git rev-parse HEAD` 和当前 ref,最终报告中回显。定位或验证失败就停止,不得拿半成品源继续安装。

## 步骤 1 · 探测目标现状

在 `TARGET_DIR` 中执行只读检查:

```bash
git rev-parse --is-inside-work-tree 2>/dev/null
git rev-parse -q --verify HEAD
git rev-parse -q --verify refs/tags/synced
git status --short 2>/dev/null
grep -hE '^(<!-- |# )一致性机制 version:' \
  .agents/skills/*/SKILL.md \
  .agents/skills/*/agents/openai.yaml \
  .claude/commands/*.md \
  一致性机制/*.md \
  一致性机制/hooks/*.sh 2>/dev/null | sort -u
ls -l README.md PROJECT.md AGENTS.md CLAUDE.md 2>/dev/null
test -L AGENTS.md && readlink AGENTS.md
test -L CLAUDE.md && readlink CLAUDE.md
```

另检查旧版 `.claude/commands/同步.md` 和仍含完整流程的 `catchup.md` / `wrapup.md`。

完整读取现有 PROJECT、实体 AGENTS、实体 CLAUDE 与 README 的相关结构,建立内容归属表:

- 背景、流程、地图、阶段、近期决策 → PROJECT;
- 工作约定、质量规则、权限边界、同步纪律 → AGENTS;
- 面向用户的介绍、安装、API、使用说明 → README 原位保留;
- 无法可靠分类 → 列给用户决定,不擅自移动。

## 步骤 2 · 判定入口迁移路径

| 当前状态 | 计划 |
|---|---|
| AGENTS / CLAUDE 都不存在 | 从模板创建 AGENTS,再创建 `CLAUDE.md -> AGENTS.md` |
| 只有实体 AGENTS | 保留内容并补同步纪律;创建 CLAUDE 链接 |
| 只有实体 CLAUDE | 事实迁入 PROJECT、规则迁入 AGENTS;核对后以链接替换 CLAUDE |
| 两者都是实体 | diff + 语义合并;AGENTS 留规则,事实进 PROJECT;核对后替换 CLAUDE |
| `AGENTS.md -> CLAUDE.md` | 读取 CLAUDE 实体并拆分;最终翻转链接方向 |
| `CLAUDE.md -> AGENTS.md` | 验证相对目标和内容职责;缺什么补什么 |
| 其他链接 / 循环 / 断链 | 标失败并等待用户确认修复 |

替换实体 CLAUDE 前必须同时满足:

- PROJECT 与 AGENTS 已准备好;
- 展示原 CLAUDE 每个一级 / 二级章节的新落点,无未归属章节;
- Git 已跟踪时确认 diff 可恢复;没有可恢复 commit 时先备份到 `一致性机制/迁移备份/CLAUDE.md`;
- 用户再次确认后才删除实体并创建相对链接。

## 步骤 3 · 拟订总计划并确认

逐项给出新建 / 合并 / 迁移 / 更新 / 跳过 / 询问状态:

```text
引入 / 迁移计划
┌──────────────────────────────────┬────────────────────────────────────────┬────────┐
│ 目标                             │ 动作                                   │ 状态   │
├──────────────────────────────────┼────────────────────────────────────────┼────────┤
│ PROJECT.md                       │ 新建或合并项目事实                      │ …      │
│ AGENTS.md                        │ 新建或合并工作规则 + 同步纪律           │ …      │
│ CLAUDE.md                        │ 核对后替换为 → AGENTS.md                │ …      │
│ README.md                        │ 默认不动;仅判断是否加入 Part A          │ 跳过   │
│ .agents/skills/(catchup/wrapup)  │ 新建或按版本更新行为正本                │ …      │
│ .claude/commands/(catchup/wrapup)│ 新建或迁移为 Claude Code 薄适配器       │ …      │
│ 旧版中文出向命令                 │ 对账定制后迁移并移除旧入口              │ …      │
│ 一致性机制/(文档 + hooks)        │ 从套件新建或按版本更新                  │ …      │
│ 文件联动目录.md                  │ 从分发模板新建或逐条合并通用规则        │ …      │
│ .claude/settings.json            │ 增量接线 Stop hook                     │ …      │
│ 项目自定中枢 / 领域规则          │ 扫描候选后询问                          │ …      │
│ .gitignore / .gitattributes      │ 按项目二进制类型询问                    │ …      │
│ synced tag                       │ 不存在时打在当前 HEAD                   │ …      │
└──────────────────────────────────┴────────────────────────────────────────┴────────┘
```

计划展示后必须询问用户是否执行。另确认:

- 无法分类的旧内容放哪里;
- README 是否承载需同步维护的公开契约;
- 项目是否含图片、设计稿、字体或媒体;
- 不是 Git 仓库时是否允许 `git init`。

## 步骤 4 · 建立 PROJECT、AGENTS 与 CLAUDE 适配

**PROJECT.md**

- 已存在 → 保留结构,只补缺失事实类别;
- 不存在但旧 CLAUDE / README 有事实 → 基于现有内容新建并标明来源,README 原文不动;
- 无可迁移事实 → 从套件 `templates/PROJECT.md` 新建,按实际仓库预填可确认内容;
- 决策规范落点固定为 PROJECT“关键决策记录”。

**AGENTS.md**

- 不存在 → 从 `templates/AGENTS.md` 新建,再合并旧规则;
- 已存在实体 → 原结构不动;按模板 begin/end marker 增量补或更新同步纪律;
- 已是链接 → 先解析实际内容,不得叠加链接;
- catchup 必须明确不重复读取 harness 已注入的 AGENTS / CLAUDE。

**CLAUDE.md**

- 正确状态只有相对链接 `CLAUDE.md -> AGENTS.md`;
- 已有实体或错误链接 → 仅在步骤 2 安全条件满足并二次确认后替换;
- 完成后验证:
  ```bash
  test -f AGENTS.md
  test -L CLAUDE.md
  test "$(readlink CLAUDE.md)" = "AGENTS.md"
  cmp AGENTS.md CLAUDE.md
  ```

当前只自动实施符号链接路径;Windows 回退方案仍需单独验证。

## 步骤 5 · 安装或更新机制件

从已验证的套件源读取。不存在才新建;已存在时比较统一版本行、实际内容和项目定制,用户确认后更新。版本行相同不等于内容相同:同日热修仍须做 diff;只有规范内容确实一致才能跳过,差异中含项目定制时先拆分归属,不得整文件覆盖:

- `.agents/skills/catchup/`、`.agents/skills/wrapup/`(完整目录,含 `SKILL.md` 与 `agents/openai.yaml`);
- `.claude/commands/catchup.md`、`.claude/commands/wrapup.md`;
- `一致性机制/机制设计说明.md`、`一致性机制/README.md`;
- `一致性机制/hooks/收尾提醒.sh`(随后 `chmod +x`);
- `一致性机制/决策档案.md`(目标不存在时从 `templates/一致性机制/决策档案.md` 新建;已有归档绝不覆盖;不得复制套件根的实况档案);
- `一致性机制/LICENSE.project-consistency-kit`(从套件根 LICENSE 新建,已有不覆盖)。

旧版完整命令迁移规则:

- 旧命令只是套件历史版本 → 安装 Skill 后替换为薄适配器;
- 旧命令含项目定制 → 展示差异,逐项迁入对应 Skill,确认无遗漏前不替换;
- 已有同名 Skill → 比较版本与定制,不整目录静默覆盖;
- 旧中文出向命令与 wrapup 等价 → 确认后移除旧入口;
- 无法判断来源 → 标人工合并。

完成后验证完整流程只存在于 `.agents/skills/`,Claude 命令不复制步骤正文。

`一致性机制/文件联动目录.md` 必须来自套件的 `templates/一致性机制/文件联动目录.md`,不是套件自身真实规则。目标已存在时只逐条补缺,保留项目自定内容。

`一致性机制/决策档案.md` 必须从套件的 `templates/一致性机制/决策档案.md` 新建,不得复制套件自身已经轮转的历史。目标已存在时整文件跳过,不合并、不覆盖。

兼容决策 21 之前的泄漏版本时,只检查下面两条**完整且逐字相同**的已知套件记录,不得按日期、决策编号或模糊文本扩大匹配:

```text
- 2026-06-11:启用套件级统一版本行与 CHANGELOG 治理(决策 9)
- 2026-06-12:加入 Stop 收尾提醒与决策记录轮转归档(决策 10/11)
```

命中时先展示记录及上下文并标为“疑似套件历史泄漏”;只有用户确认后才删除命中的精确整行。档案中的其他文字和项目记录原位保留,不得用空白模板重写整个文件;未命中则完全跳过。

`.claude/settings.json` 已存在时只向 `hooks.Stop` 追加收尾提醒 entry;已有同类 entry 就跳过,不覆盖其他 hooks。

## 步骤 6 · 发现中枢、领域规则与二进制策略

1. 扫描已跟踪文件、顶层与常见文档目录。
2. PROJECT 与 AGENTS 固定进入 Part A。
3. README 只有承载公开安装 / API / 使用契约且用户确认时才进入 Part A。
4. 列出 ADR、spec、schema、contract、大纲、风格定义等候选,由用户选择。
5. 询问稳定的“改 A 必查 B”规则,确认后写入项目自定规则区。
6. 含图片 / 设计稿 / 字体 / 媒体 → 只增补缺失的 ignore / LFS 规则;纯代码 / 纯文字项目跳过 LFS。

## 步骤 7 · 建立 synced horizon

- 不是 Git repo → 只有用户同意才初始化 Git;
- 有 commit 且无 `synced` → 把 tag 打在当前 HEAD,既往历史不追溯联动;
- 无 commit → 先展示提交范围和 message,用户确认后才首 commit + tag;
- 已有 `synced` → 不动。

## 步骤 8 · 报告与验证

报告套件源 URL、ref、commit,以及新建、合并、迁移、跳过、失败和待填项。至少验证:

- PROJECT 可独立说明背景、地图、阶段与近期决策;
- AGENTS 是实体,CLAUDE 是正确相对链接且内容一致;
- catchup / wrapup 两个仓库级 Skill 存在且通过 Skill 校验;
- catchup 不重复读取 Agent 指令;
- Claude 的 catchup / wrapup 文件只是薄适配器;
- README 不存在或完全改写时工作流仍可运行;
- Part A 已登记项目真实中枢;
- 用当前 Harness 的入口执行一次 catchup。

## 守则

- 下载脚本只获取和验证套件源,不得修改目标项目。
- 套件缓存有本地改动、remote 不符或验证不完整时停止,不得强制清理。
- 不从不受信任的 fork 静默获取;非规范仓库 URL 必须由用户明确提供。
- 不丢旧内容,不因模板更标准而重排用户文档。
- README 默认不写、不创建、不作为项目地图。
- AGENTS 是唯一指令实体;CLAUDE 只做相对链接适配。
- PROJECT 是项目事实与近期决策正本。
- catchup / wrapup 以目标仓库 `.agents/skills/` 为行为正本。
- 不擅自 `git init`、commit 或 push。
