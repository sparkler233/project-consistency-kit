---
name: wrapup
description: Close a Project Consistency Kit work cycle by recovering current-session decisions, comparing changes from the branch-safe Git baseline, checking linkage rules, updating approved files, and preparing a user-confirmed local commit; only the canonical branch may advance the project synced horizon. Use when the user asks to wrap up, synchronize project records, reconcile linked documentation, checkpoint completed work, or finish a repository session.
---

<!-- 一致性机制 version: 2026-08-22 -->

把「上次同步以来发生的一切」系统性收尾:捕获改动 → 补 B 类事件 → 查联动 → 用户确认 → 落盘 → 提交。

> 机制动机见 `一致性机制/机制设计说明.md`,联动规则见 `一致性机制/文件联动目录.md`。
> `wrapup` 是**兜底工具,不是流程门禁**——用户可随时手工改 / commit;本工作流只把漏的联动补上、把改动收尾。

## 步骤 0 · 前置检查

- 不是 git repo(`git rev-parse --is-inside-work-tree` 失败)→ 提示「项目未纳入 git,一致性机制无法运行」并退出。
- `一致性机制/文件联动目录.md` 不存在 → 提示「联动目录未建立」并退出。
- `PROJECT.md` 不存在 → 提示「项目仍是旧版文件模型,请先告诉 Agent“给这个项目引入一致性机制”;也可使用当前 Harness 的显式安装器入口」并退出;不要把决策重新写回 README 或 Agent 指令文件。
- 检查 `AGENTS.md` 是实体文件、`CLAUDE.md` 是只含 `@AGENTS.md` 的普通文件导入适配器;异常计入步骤 4 联动计划,不通过重复维护两份内容来补救。
- 运行本 Skill 随附的确定性 helper,后续 Git 范围与 `synced` 状态迁移以它的输出为准,Skill 不重复猜 branch / merge-base:
  ```bash
  node .agents/skills/wrapup/scripts/synced-guard.mjs inspect
  ```
- `canonical_unconfigured` → 显示当前 branch,询问用户是否将它设为项目 canonical branch;只有确认后才执行 `git config --local projectConsistency.canonicalBranch <branch>` 并重新 inspect,不静默猜 `main` 或 `origin/HEAD`。
- 当前不是 canonical → 只要 `scope_base` 存在,允许完成本分支联动检查与 commit,但本轮只报告为 branch checkpoint,**不得推进项目级 `synced`**。`scope_base` 不存在(无共同祖先、多个最佳 merge-base、detached 或 Git 状态异常)→ 停止并请用户先整理历史。

## 步骤 1 · B 类事件 safety net

git 只看得见文件改动。**决策、对外对接、口头约定**这类事发生在对话里,不直接产生文件 → 先补这一层。

1. 回看**本次对话历史**,找「已发生 B 类事件、但还没写进任何文件」的。
2. 列清单问用户:「这些要补写吗?」对**决策**类,规范落点是 `PROJECT.md` 关键决策记录(联动目录规则 2)。
3. 用户确认后**立刻写入目标文件**——这样它们就变成下一步 git 能看见的改动。

> 局限:safety net 只够得到**当前会话**的对话。跨会话未落盘的 B 类事件捞不回——所以结束会话前建议执行一次 wrapup。

## 步骤 2 · 确定本轮检查范围

项目级 sync horizon 仍是 `synced`,但并行 feature branch 不能直接用移动后的全局 tag 作基线。步骤 0 的 guard 已按 Git 历史确定 `scope_base`:

1. 当前 branch = canonical → `scope_base = synced`;`synced` 必须是 HEAD ancestor。
2. 当前 branch ≠ canonical → `scope_base = git merge-base --all HEAD <canonical>`;必须且只能得到一个最佳共同祖先。
3. `scope_base` 存在 → 本轮范围 = 自该提交以来工作区的全部改动:
   ```bash
   git diff --stat <scope_base>
   git diff --name-status <scope_base>
   git status --short
   ```
4. canonical 上 `synced` 不存在(首次建立 horizon)→ 范围 = 全部已跟踪改动 + 未跟踪文件:
   ```bash
   git status --short
   ```
5. 范围为空 → canonical 且 `HEAD == synced` 时报告「无改动可同步」并退出;feature branch 没有自身变化时同样退出。除非步骤 1 已补写了文件。

## 步骤 3 · 查联动目录 + manifest 对账

对步骤 2 列出的每个变化文件,按 `一致性机制/文件联动目录.md`:

1. **Part A 中枢清单**:这个改动是否影响某份中枢文档的内容?
2. **Part B 例外规则**:路径 / 情况是否命中某条规则?
3. 都没命中的,临场判断是否仍有隐性联动(兜底,非保证)。
4. **manifest 对账(条件触发,规则 5)**:**仅当本轮改动落在素材 / 大文件目录**(任何含二进制的目录,或 LFS 指针变了)时,才 `ls` 相关文件夹、与其 `_manifest.md` 对比,差异计入待办。纯文字同步**整步跳过**。manifest 只管 用途 / 来源 / 授权(版权)(美术 / 设计项目可加风格基准引用),不管版本(版本归 git/LFS)。
5. **决策记录轮转检查(条件触发,规则 6)**:`PROJECT.md`「关键决策记录」**超过 10 条** → 把「最老条目剪切到 `一致性机制/决策档案.md`(时间升序),PROJECT 留最近 10 条 + 指针行」列入步骤 4 计划;未超**整步跳过**。

某改动找不到任何对应规则、又判断不出联动 → 标「联动目录未覆盖」,步骤 4 一并展示,提示同步后补 `文件联动目录.md`。

## 步骤 4 · 拟订计划 → 用户确认 → 执行

汇总所有联动动作为一张表:

```
待执行联动清单
┌──────────────────────────────┬──────────────────────────┬────────┐
│ 目标文件                      │ 改动                      │ 状态   │
├──────────────────────────────┼──────────────────────────┼────────┤
│ PROJECT.md                    │ +决策记录 1 行(X)        │ 待确认 │
│ CLAUDE.md                     │ 修复为 @AGENTS.md 导入    │ 待确认 │
│ <某目录>/_manifest.md         │ +2 条新条目               │ 待确认 │
└──────────────────────────────┴──────────────────────────┴────────┘

⚠️ 联动目录未覆盖:改动「Y」—— 建议同步后补 文件联动目录.md
```

询问:

> 这份计划是否执行?
> - 全部执行 → 「是 / go」
> - 否决某项 → 「跳过第 N 行 / 不要 X」
> - 补一项 → 「再加:<改动描述>」
> - 全部取消 → 「取消」

确认后**逐项执行**,写入前按防重复策略检查;单项结果分 ✅ 成功 / ⏭️ 跳过(已存在) / ❌ 失败,单项失败不影响其他项。

## 步骤 5 · 提交 + 条件推进 horizon

> 决策 7:commit 是单向动作,**message 由用户确认**,不自动提交。

1. 先回显 `git status --short`,让用户看清**将入库的全部文件**——本次 commit 含当前 worktree 的完整 delta,不止步骤 4 计划表里的联动项。明确询问「以上是将进入本次提交的完整范围,是否确认提交?」;只有用户确认后才 `git add -A`。被 `.gitignore` 排除的二进制不会进;若项目配了 LFS,栅格图会经 `.gitattributes` 进 LFS。
2. `git add -A` 后检查 staged changes。存在 → AI 起草一句话 commit message并询问用户确认;不存在但 `HEAD != scope_base` → 说明已有 commit 无需再制造空 commit,经用户确认后继续同步边界检查;两者都没有 → 报无变化退出。
3. staged changes 的 message 经用户确认后执行 commit。commit 失败立即停止,不得调用 guard。
4. commit 后重新运行 inspect。canonical branch 只有在 guard 报告可推进时才执行:
   ```bash
   node .agents/skills/wrapup/scripts/synced-guard.mjs advance
   ```
   guard 会再次确认 canonical branch、祖先关系、冲突、干净工作区与旧 tag 未被其他进程移动,再用带 reflog 的原子 ref 更新创建或推进 `synced`;不提供 `--force`。首次没有 `synced` 时允许把当前 HEAD 建为 baseline,即使工作区已有变化——这些变化仍留在新 baseline 之后;已有 `synced` 的推进必须完全干净。
5. 非 canonical branch 到 commit 即止,报告「branch checkpoint 已保存,项目级 synced 未推进;合并回 canonical 后执行最终 wrapup」。
6. **push 由用户手动负责**:wrapup 不自动 push。多机协作若要共享 horizon,仍需用户显式推送移动后的 `synced` tag。
7. 输出报告:

```
wrapup 完成。
- ✅ 联动成功:N 项(列出)
- ⏭️ 跳过:M 项(原因)
- ❌ 失败:K 项(原因 + 建议)
- ⚠️ 联动目录未覆盖:Q 项(建议补 文件联动目录.md)
- 📌 已提交 <短 hash>,horizon `synced` 已推进
```

## 守则

- **绝不**在用户未确认前改任何文件、不自动 commit。
- `git add -A` 前**必先回显 `git status --short`**——用户确认的不只是 message,还有入库范围。
- canonical 的 horizon 永远用 `synced` tag;feature 的检查基线永远用它与 canonical 的唯一最佳 merge-base。不要在 feature 上直接 `git diff synced`,也不得推进全局 tag。
- 自动创建或推进 `synced` 只能委托本 Skill 的 `synced-guard.mjs`;Skill、安装器和宿主适配器不得另写 `git tag` 状态迁移逻辑。
- 联动目录未覆盖时**不自创规则**,只提示用户补 `文件联动目录.md`。
- 防重复 grep 读不到文件时按「失败」处理,不算「成功」。
- manifest 对账是**条件触发**的:本轮没动素材 / 大文件目录就别跑,避免给每次同步加空转的可靠性税。决策记录轮转同理(规则 6):未超 10 条不动。
- 被 gitignore 的二进制(设计源 / PDF / 字体)git 看不见,其 用途/来源/授权 靠 manifest 记;栅格图的版本归 LFS,manifest 不重复记版本。
