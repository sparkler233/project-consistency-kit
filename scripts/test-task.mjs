#!/usr/bin/env node
// 一致性机制 version: 2026-10-02
// 并行生命周期回归测试(决策 107–110):开工 → 工作 → 谁合并谁负责(land:自动检查点 → 同步 → 合并版 wrapup → 快进主线、推进 synced)
// → 收工;以及每轮提示只在相关时出现、合并冲突在本分支解决、快进失败后重试(不相关时跳过重新检查、相关时要求重新检查)、
// 「最近决策」冲突由脚本重新生成、主线目录不干净时拒绝、主线没检出时直接更新引用、合并后继续工作与新分支不沿用别人的任务名。

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gitAtLeast } from "../.agents/skills/wrapup/scripts/checkpoints.mjs";

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const S = (name) => path.join(kitRoot, ".agents", "skills", "wrapup", "scripts", name);
const HOOK = path.join(kitRoot, ".agents", "hooks", "parallel-notice.mjs");
const temps = [];

function run(command, args, cwd, expected = 0, input) {
  const r = spawnSync(command, args, { cwd, encoding: "utf8", shell: false, windowsHide: true, input });
  if (expected !== null) assert.equal(r.status, expected, `${command} ${args.join(" ")} exited ${r.status}: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}
const git = (cwd, ...args) => run("git", args, cwd);
const node = (cwd, script, args = [], expected = 0) => JSON.parse(run(process.execPath, [S(script), ...args], cwd, expected));
const task = (cwd, args, expected = 0) => node(cwd, "task.mjs", args, expected);
const hookRaw = (cwd) => { const out = run(process.execPath, [HOOK], cwd, 0, JSON.stringify({ cwd })); return out ? JSON.parse(out) : null; };
const hook = (cwd) => { const o = hookRaw(cwd); return o ? o.hookSpecificOutput.additionalContext : null; };
const COMPACT = path.join(kitRoot, ".agents", "hooks", "compact-reminder.mjs");
const compact = (cwd, source) => { const out = run(process.execPath, [COMPACT], cwd, 0, JSON.stringify({ cwd, source })); return out ? JSON.parse(out).hookSpecificOutput.additionalContext : null; };
const write = (dir, rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), "utf8");
const draft = (k, src) => `${k}\n说明一\n说明二\n说明三\n${src}\n`;
const chapter = (l2, l7) => ["第三章", l2, "三", "四", "五", "六", l7, "八", ""].join("\n");
const project = (pending) => ["# 测试项目", "", "## 二、总体状态", "", "- 状态:进行中", "", "## 关键决策", "", "### 待提交", "", ...(pending.length ? pending : ["(暂无)"]), "", "### 最近决策", "", "- 2026-09-01:旧决策(决策 1)", ""].join("\n");
const withPending = (dir, lines) => write(dir, "PROJECT.md", read(dir, "PROJECT.md").replace(/### 待提交\n\n[\s\S]*?\n\n### 最近决策/, `### 待提交\n\n${lines.join("\n")}\n\n### 最近决策`));
const linkage = ["# 文件联动目录", "", "### 规则 1 · 事实底稿变化 → 检查正文", "", "**触发**:`底稿.md` 变化。", "**动作**:检查引用它的章节。", ""].join("\n");
const co = ["--trailer", "Co-Authored-By: Fixture <fixture@example.invalid>"];
const rev = (cwd, r) => git(cwd, "rev-parse", r);
const exists = (cwd, ref) => spawnSync("git", ["rev-parse", "--verify", "-q", ref], { cwd }).status === 0;
const landWrapup = (cwd, title, extra = []) => node(cwd, "decisions.mjs", ["apply", "--land", "--commit", "--title", title, ...co, ...extra]);
// 用户说「并进主线」的完整一轮:land → 合并版 wrapup → land --finish
function landAll(cwd, title) {
  const l = task(cwd, ["land"]);
  assert.equal(l.status, "needs_wrapup", JSON.stringify(l));
  assert.equal(landWrapup(cwd, title).committed, true);
  const f = task(cwd, ["land", "--finish"]);
  assert.equal(f.status, "landed", JSON.stringify(f));
  return f;
}

try {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "pck-task-测试-"));
  temps.push(repo, `${repo}.worktrees`);
  run("git", ["init", "-q", "-b", "main", repo]);
  for (const [k, v] of [["user.name", "Fixture"], ["user.email", "fixture@example.invalid"], ["core.autocrlf", "false"], ["projectConsistency.canonicalBranch", "main"]]) git(repo, "config", k, v);
  write(repo, "PROJECT.md", project([]));
  write(repo, "第三章.md", chapter("二", "七"));
  write(repo, "底稿.md", draft("口径 A", "来源 X"));
  write(repo, "一致性机制/文件联动目录.md", linkage);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "初始");
  git(repo, "tag", "synced");

  // 用法与拦截
  assert.equal(task(repo, ["start", "--here"], 2).error.startsWith("--here"), true, "--here 只写检查点,需要目标");
  assert.equal(task(repo, ["sync"], 3).blockers[0], "on_canonical");
  assert.equal(task(repo, ["land"], 3).blockers[0], "on_canonical", "主线上照常 wrapup,不用 land");
  const help = run(process.execPath, [S("task.mjs"), "--help"], repo);
  assert.match(help, /node task\.mjs land --finish/);
  assert.doesNotMatch(help, /integrate|--ready/, "已去掉集成命令与可集成标记");
  assert.doesNotMatch(help, /提交说明经 stdin/, "--help 不带实现注释");
  assert.doesNotMatch(help, /决策 ?\d/, "分发文件不写套件仓库的决策编号");
  // Git 版本判断:低于 2.38 时 task.mjs 拦下并说明(同步的冲突格式要 2.35,试合并要 2.38)
  assert.match(help, /Git 2\.38/);
  assert.equal(gitAtLeast("git version 2.34.1", 2, 38), false);
  assert.equal(gitAtLeast("git version 2.38.0", 2, 38), true);
  assert.equal(gitAtLeast("git version 2.54.0 (Apple Git-157)", 2, 38), true);
  assert.equal(gitAtLeast("git version 3.0.1", 2, 38), true);
  assert.equal(gitAtLeast("", 2, 38), null, "认不出版本时不拦");
  assert.equal(node(repo, "decisions.mjs", ["plan", "--ready"], 2).error.startsWith("unknown_or_incomplete_option"), true, "--ready 已去掉");
  assert.match(node(repo, "decisions.mjs", ["plan", "--land"]).problems.join(), /只用于分支/);

  // 开工:给目标时写检查点,不给时只建分支和 worktree
  const sa = task(repo, ["start", "task/a", "--task", "改写第三章", "--goal", "按口径 A 改写第三章第二行"]);
  const a = sa.worktree;
  assert.equal(path.basename(path.dirname(a)), `${path.basename(repo)}.worktrees`);
  assert.match(git(a, "log", "-1", "--format=%B"), /^开工:改写第三章\n\n目标:按口径 A 改写第三章第二行\n\nTask: 改写第三章/);
  assert.doesNotMatch(sa.opening, /--ready/);
  const sb = task(repo, ["start", "task/b"]);
  assert.equal(sb.checkpoint, null, "不给目标时不提交空检查点");
  const b = sb.worktree;
  const cPath = `${repo}.worktrees/host-c`;
  git(repo, "worktree", "add", "-q", "-b", "host/c", cPath, "main");
  assert.equal(task(cPath, ["start", "--here", "--goal", "底稿第一行换成口径 B"]).created_worktree, false);

  let ov = node(repo, "scope.mjs", ["--overview"]);
  assert.deepEqual(ov.other_branches.map((x) => x.branch), ["host/c", "task/a", "task/b"]);
  const oa = ov.other_branches.find((x) => x.branch === "task/a");
  assert.equal(oa.merged, true, "只有空检查点,内容上已全部在主线");
  assert.equal(oa.uncommitted, 0);
  assert.equal("ready" in oa, false, "概览里不再有可集成字段");
  assert.equal(hook(repo), null, "主线上不提示");

  // A:改第三章、记一条决策,不提交就说「并进主线」→ 自动检查点(沿用三行)→ 合并版 wrapup → 快进主线
  write(a, "第三章.md", chapter("A 改的第二行", "七"));
  withPending(a, ["- 2026-09-28 · 决策 2:第三章按口径 A", "  - 决定:按口径 A。"]);
  ov = node(repo, "scope.mjs", ["--overview"]);
  assert.equal(ov.other_branches.find((x) => x.branch === "task/a").uncommitted, 2, "概览看得到别的 worktree 里的未提交改动");
  const la = task(a, ["land"]);
  assert.equal(la.status, "needs_wrapup");
  assert.equal(la.reason, "first_check");
  assert.equal(la.auto_checkpoint.files, 2, "未提交的改动先自动提交为检查点(决策 110)");
  assert.doesNotMatch(la.next, /决策 ?\d/, "脚本给模型看的提示里不写套件仓库的决策编号");
  assert.match(la.next, /apply --land --commit --title/, "提示里带上必须给的标题选项");
  assert.match(git(a, "log", "-1", "--format=%B"), /^合并前检查点:提交未提交的改动\n\n目标:按口径 A 改写第三章第二行\n\nTask: 改写第三章/);
  ov = node(repo, "scope.mjs", ["--overview"]);
  assert.deepEqual(ov.other_branches.find((x) => x.branch === "task/a").pending_decisions, ["2026-09-28 · 决策 2:第三章按口径 A"], "看得到分支上还没进主线的决策");
  assert.equal(task(a, ["land", "--finish"], 3).blockers[0], "not_checked", "没走合并版 wrapup 不能完成合并");
  const pa = node(a, "decisions.mjs", ["plan", "--land"]);
  assert.equal(pa.land_mode.checked_against, rev(repo, "main"));
  assert.deepEqual(pa.pending.map((d) => d.number), [2]);
  const ca = landWrapup(a, "并入 A:第三章按口径 A〔决策 2〕");
  assert.equal(ca.committed, true);
  assert.match(ca.next, /land --finish/);
  const cA = rev(a, "HEAD");
  assert.match(git(a, "log", "-1", "--format=%B"), /Decision: 2\nTask: 改写第三章\nLand-Checked: [0-9a-f]{40}/);
  const oldMain = rev(repo, "main");
  git(repo, "update-ref", "refs/pck/synced", cA);
  assert.ok(task(a, ["land", "--finish"], 3).blockers.includes("synced_refs_disagree"));
  assert.equal(rev(repo, "main"), oldMain, "新旧指针不一致时不得推进主线");
  assert.equal(rev(a, "HEAD"), cA);
  git(repo, "update-ref", "-d", "refs/pck/synced", cA);
  const fa = task(a, ["land", "--finish"]);
  assert.equal(fa.status, "landed");
  assert.equal(fa.synced, "advanced");
  assert.equal(git(repo, "tag", "--list", "synced"), "", "并行合并同时退役旧标签");
  assert.equal(fa.recheck_skipped, false);
  const M = rev(repo, "main");
  assert.deepEqual(git(repo, "log", "-1", "--format=%P", M).split(" "), [oldMain, cA], "合并提交:第一父提交是原主线,第二父提交是分支");
  assert.equal(git(repo, "log", "-1", "--format=%s", M), "并入 A:第三章按口径 A〔决策 2〕");
  assert.equal(git(repo, "log", "-1", "--format=%(trailers:key=Task,valueonly)", M), "", "合并提交不带 Task:");
  assert.equal(rev(repo, "refs/pck/synced"), M, "synced 推进到合并提交");
  assert.equal(rev(a, "HEAD"), M, "本分支随之前进");
  assert.equal(read(repo, "第三章.md"), chapter("A 改的第二行", "七"), "主线目录的文件已更新");
  assert.equal(git(repo, "status", "--porcelain"), "");
  assert.match(read(repo, "PROJECT.md"), /### 待提交\n\n\(暂无\)/);
  assert.match(read(repo, "PROJECT.md"), /第三章按口径 A\(决策 2\)/);
  // 最近提交沿 first-parent:这次并进主线只占一行(合并提交),不逐条列出分支上的开工、合并前检查点与合并版 wrapup
  assert.deepEqual(node(repo, "scope.mjs", ["--overview"]).recent_commits.map((c) => c.subject), ["并入 A:第三章按口径 A〔决策 2〕", "初始"]);
  // 合并后在同一分支继续:检查点仍是本任务;从主线新开的分支不会读到别人的任务名
  assert.equal(node(a, "scope.mjs", ["--overview"]).current_branch_state.task.name, "改写第三章");
  const nPath = task(repo, ["start", "task/n"]).worktree;
  assert.equal(node(nPath, "scope.mjs", ["--overview"]).current_branch_state.task, null);
  ov = node(repo, "scope.mjs", ["--overview"]);
  assert.equal(ov.other_branches.find((x) => x.branch === "task/a").merged, true);

  // 提示:B 在同一文件上有未提交改动 → 提示交集,给模型也给用户,不要求同步;只提示一次
  write(b, "第三章.md", chapter("B 也改第二行", "B 改的第七行"));
  const raw = hookRaw(b);
  assert.equal(raw.systemMessage, raw.hookSpecificOutput.additionalContext, "同一段文字也显示给用户");
  assert.match(raw.systemMessage, /新增 1 项:「并入 A:第三章按口径 A〔决策 2〕」/);
  assert.match(raw.systemMessage, /`第三章\.md`/);
  const [facts, how] = raw.systemMessage.split("要同步时");
  assert.doesNotMatch(facts, /sync|做完当前|请同步|需要同步/, "只报事实,不要求同步(决策 108)");
  assert.match(how, /^运行 `node \.agents\/skills\/wrapup\/scripts\/task\.mjs sync`,不手抄主线的改动。$/, "末尾只说同步用什么");
  assert.equal(hook(b), null, "同一主线位置只提示一次");
  // 压缩后提醒:只在 source 为 compact 时出现;主线上只提醒重读,分支上另附三条与同步、合并的做法
  assert.equal(compact(b, "startup"), null, "新会话不提醒,由 catchup 读取规则");
  assert.equal(compact(b, "resume"), null);
  const bom = run(process.execPath, [COMPACT], repo, 0, "\uFEFF" + JSON.stringify({ cwd: repo, source: "compact" }));
  assert.ok(bom && JSON.parse(bom).hookSpecificOutput.additionalContext, "输入开头带 BOM(PowerShell 按 UTF-8 转发)时照常提醒");
  const garbled = run(process.execPath, [COMPACT], repo, 0, "\u00ef\u00bb\u00bf" + JSON.stringify({ cwd: repo, source: "compact" }));
  assert.ok(garbled && JSON.parse(garbled).hookSpecificOutput.additionalContext, "BOM 按错的编码解成三个字符时照常提醒");
  assert.match(compact(repo, "compact"), /^\[一致性机制\] 上下文刚被压缩:继续工作前先重读 `PROJECT\.md` 与 `一致性机制\/运行规则\.md`;用户说「收尾」就运行 wrapup。$/, "主线上只提醒重读");
  assert.match(compact(b, "compact"), /任务分支 `task\/b` 上并行工作.*task\.mjs land.*task\.mjs sync`,不手抄/, "分支上附三条与做法");
  // C 没改相关文件:主线改了第三章与 PROJECT 生成的两段,与 C 不相关 → 不提示
  assert.equal(hook(cPath), null, "不相关的主线变化不提示");

  // B:并进主线时同步有冲突 → 在本分支解决 → 再 land → 合并版 wrapup → 完成
  const lb = task(b, ["land"]);
  assert.equal(lb.status, "conflict");
  assert.deepEqual(lb.conflicts, ["第三章.md"]);
  assert.match(lb.next, /sync --continue,再运行 task\.mjs land/);
  assert.match(read(b, "第三章.md"), /\|\|\|\|\|\|\|/, "冲突块带原文(zdiff3)");
  assert.equal(task(b, ["land"], 3).blockers[0], "merge_in_progress");
  write(b, "第三章.md", chapter("A 改的第二行", "B 改的第七行"));
  git(b, "add", "第三章.md");
  assert.equal(task(b, ["sync", "--continue"]).status, "synced");
  landAll(b, "并入 B:第三章第七行");
  assert.equal(read(repo, "第三章.md"), chapter("A 改的第二行", "B 改的第七行"));

  // 重试,不相关:C 走完合并版 wrapup 后,E 先并进主线(改别的文件,也迁出一条决策)
  // → C 完成时被拒,主线不变 → C 再 land:「最近决策」冲突由脚本重新生成,改动不相关,直接完成合并
  write(cPath, "底稿.md", draft("口径 B", "来源 X"));
  withPending(cPath, ["- 2026-09-28 · 决策 3:底稿改口径 B", "  - 决定:口径 B。"]);
  assert.equal(task(cPath, ["land"]).status, "needs_wrapup");
  assert.equal(landWrapup(cPath, "并入 C:底稿改口径 B〔决策 3〕").committed, true);
  const e = task(repo, ["start", "task/e"]).worktree;
  write(e, "附录.md", "附录\n");
  git(e, "add", "附录.md");
  withPending(e, ["- 2026-09-28 · 决策 4:加附录", "  - 决定:加附录。"]);
  landAll(e, "并入 E:加附录〔决策 4〕");
  const mainE = rev(repo, "main");
  const fc = task(cPath, ["land", "--finish"], 3);
  assert.equal(fc.blockers[0], "canonical_moved");
  assert.equal(rev(repo, "main"), mainE, "被拒时主线不变");
  const lc = task(cPath, ["land"]);
  assert.equal(lc.status, "landed", JSON.stringify(lc));
  assert.equal(lc.recheck_skipped, true, "主线新增的改动与本分支不相关:跳过重新检查(决策 110)");
  const recent = read(repo, "PROJECT.md");
  assert.doesNotMatch(recent, /<<<<<<<|>>>>>>>/);
  assert.match(recent, /底稿改口径 B\(决策 3\)/);
  assert.match(recent, /加附录\(决策 4\)/);
  assert.equal(read(repo, "底稿.md"), draft("口径 B", "来源 X"));
  assert.equal(rev(repo, "refs/pck/synced"), rev(repo, "main"));

  // 重试,相关:G 走完合并版 wrapup 后,H 先并进主线,改了同一份底稿(另一行,合并干净)→ G 要重新走合并版 wrapup
  const g = task(repo, ["start", "task/g"]).worktree;
  write(g, "底稿.md", draft("口径 B", "来源 Y"));
  git(g, "add", "底稿.md");
  assert.equal(task(g, ["land"]).status, "needs_wrapup");
  landWrapup(g, "并入 G:来源改 Y");
  const h = task(repo, ["start", "task/h"]).worktree;
  write(h, "底稿.md", draft("口径 C", "来源 X"));
  git(h, "add", "底稿.md");
  landAll(h, "并入 H:口径改 C");
  const lg = task(g, ["land"]);
  assert.equal(lg.status, "needs_wrapup");
  assert.equal(lg.reason, "recheck");
  assert.deepEqual(lg.relation.overlap, ["底稿.md"]);
  assert.equal(task(g, ["land", "--finish"], 3).blockers[0], "recheck_needed");
  landWrapup(g, "并入 G:来源改 Y(重新检查)");
  assert.equal(task(g, ["land", "--finish"]).status, "landed");
  assert.equal(read(repo, "底稿.md"), draft("口径 C", "来源 Y"));

  // 主线目录有未提交改动:拒绝,主线不变;处理后照常完成
  const k = task(repo, ["start", "task/k"]).worktree;
  write(k, "k.md", "k\n");
  git(k, "add", "k.md");
  task(k, ["land"]);
  landWrapup(k, "并入 K");
  write(repo, "第三章.md", chapter("主线上有人在改", "B 改的第七行"));
  const before = rev(repo, "main");
  assert.equal(task(k, ["land", "--finish"], 3).blockers[0], "canonical_worktree_dirty");
  assert.equal(rev(repo, "main"), before);
  git(repo, "checkout", "--", "第三章.md");
  assert.equal(task(k, ["land", "--finish"]).status, "landed");

  // 主线没检出在任何地方(原目录切到了自己的分支):直接更新主线引用
  git(repo, "switch", "-q", "-c", "home");
  const m2 = task(repo, ["start", "task/m"]).worktree;
  write(m2, "m.md", "m\n");
  git(m2, "add", "m.md");
  const before2 = rev(m2, "main");
  const fm = landAll(m2, "并入 M");
  assert.deepEqual(git(m2, "log", "-1", "--format=%P", "main").split(" ")[0], before2);
  assert.equal(rev(m2, "main"), rev(m2, "HEAD"));
  assert.equal(fm.synced, "advanced");
  git(repo, "switch", "-q", "main");
  assert.equal(fs.existsSync(path.join(repo, "m.md")), true);

  // 不变式提醒:squash 之后检查点丢了;分支之间直接合并过
  const r = task(repo, ["start", "task/r", "--goal", "r 的目标"]).worktree;
  write(r, "r.md", "r\n");
  git(r, "add", "r.md");
  node(r, "decisions.mjs", ["apply", "--commit", "--title", "r 检查点", "--intro", "目标:r\\n进度:一半\\n还剩:另一半", ...co]);
  assert.equal(node(r, "scope.mjs", ["--overview"]).current_branch_state.handoff_missing, false);
  git(r, "reset", "-q", "--soft", "main");
  git(r, "commit", "-qm", "压成一个提交");
  assert.equal(node(r, "scope.mjs", ["--overview"]).current_branch_state.handoff_missing, true, "squash 之后找不到检查点");
  const s2 = task(repo, ["start", "task/s"]).worktree;
  git(s2, "merge", "-q", "--no-edit", "task/r");
  ov = node(repo, "scope.mjs", ["--overview"]);
  assert.deepEqual(ov.other_branches.find((x) => x.branch === "task/s").shares_unmerged_with, ["task/r"]);
  assert.deepEqual(ov.other_branches.find((x) => x.branch === "task/r").shares_unmerged_with, ["task/s"]);
  assert.equal(task(repo, ["close", "task/s", "--abandon"]).abandoned, true);
  assert.equal(task(repo, ["close", "task/r", "--abandon"]).abandoned, true);

  // 合并后接着干:合并版 wrapup 没写三行时沿用上一个检查点的三行,「还剩」不会丢;写了就以写的为准
  const pw = task(repo, ["start", "task/p", "--task", "P 任务"]).worktree;
  write(pw, "p1.md", "p1\n");
  git(pw, "add", "p1.md");
  node(pw, "decisions.mjs", ["apply", "--commit", "--title", "P 前半", "--intro", "目标:做完 P\\n进度:前半\\n还剩:后半", ...co]);
  assert.equal(task(pw, ["land"]).status, "needs_wrapup");
  assert.deepEqual(node(pw, "decisions.mjs", ["plan", "--land"]).land_mode.carried_task_lines, ["目标:做完 P", "进度:前半", "还剩:后半"], "确认时看得到沿用的三行");
  landWrapup(pw, "并入 P 前半");
  assert.equal(task(pw, ["land", "--finish"]).status, "landed");
  let ps = node(pw, "scope.mjs", ["--overview"]).current_branch_state.task;
  assert.equal(ps.name, "P 任务");
  assert.match(ps.message, /还剩:后半/, "合并后的检查点沿用三行,接手的会话读得到还剩");
  write(pw, "p2.md", "p2\n");
  git(pw, "add", "p2.md");
  assert.equal(task(pw, ["land"]).status, "needs_wrapup");
  assert.deepEqual(node(pw, "decisions.mjs", ["plan", "--land", "--intro", "目标:做完 P\\n进度:全部\\n还剩:无"]).land_mode.carried_task_lines, [], "写了三行就不沿用");
  landWrapup(pw, "并入 P 后半", ["--intro", "目标:做完 P\\n进度:全部\\n还剩:无"]);
  assert.equal(task(pw, ["land", "--finish"]).status, "landed");
  ps = node(pw, "scope.mjs", ["--overview"]).current_branch_state.task;
  assert.match(ps.message, /还剩:无/);
  assert.doesNotMatch(ps.message, /还剩:后半/);
  assert.equal(task(repo, ["close", "task/p"]).abandoned, false);

  // 没有要合并的内容
  const lz = task(nPath, ["land"]);
  assert.equal(lz.status, "nothing_to_land");

  // 收工
  assert.equal(task(a, ["close", "task/a"], 3).blockers[0], "run_from_other_worktree");
  const cl = task(repo, ["close", "task/a"]);
  assert.equal(cl.abandoned, false);
  assert.equal(fs.existsSync(a), false);
  for (const br of ["task/b", "host/c", "task/e", "task/g", "task/h", "task/k", "task/m", "task/n"]) assert.equal(task(repo, ["close", br]).abandoned, false, br);
  // 还有未进主线的内容:拒绝,列出决策,提示在该分支的会话里说「并进主线」
  const q = task(repo, ["start", "task/q"]).worktree;
  write(q, "q.md", "q\n");
  withPending(q, ["- 2026-09-28 · 决策 9:Q", "  - 决定:q。"]);
  git(q, "add", "-A");
  git(q, "commit", "-qm", "Q 工作");
  const nq = task(repo, ["close", "task/q"]);
  assert.equal(nq.status, "not_integrated");
  assert.deepEqual(nq.pending_decisions, ["2026-09-28 · 决策 9:Q"]);
  assert.match(nq.next, /并进主线/);
  write(q, "临时.md", "x\n");
  assert.equal(task(repo, ["close", "task/q", "--abandon"], 3).blockers[0], "worktree_dirty");
  fs.rmSync(path.join(q, "临时.md"));
  const cq = task(repo, ["close", "task/q", "--abandon"]);
  assert.equal(cq.abandoned, true);
  assert.deepEqual(cq.remaining_task_branches, [], "home 已切回主线、没有未合并的内容,不算任务分支");
  assert.match(cq.note, /回到单线程/);
  assert.equal(exists(repo, "refs/heads/task/q"), false);

  // --commit 必须带标题:分支上没有标题时 `Task:` 行会成为标题、不再是 trailer,这个检查点之后找不到
  const tw = task(repo, ["start", "task/t"]).worktree;
  write(tw, "t.md", "t\n");
  git(tw, "add", "-A");
  const headT = rev(tw, "HEAD");
  const refused = node(tw, "decisions.mjs", ["apply", "--commit"], 2);
  assert.equal(refused.error, "title_required");
  assert.equal(refused.committed, false);
  assert.equal(rev(tw, "HEAD"), headT, "没有标题就不提交");
  assert.equal(node(tw, "decisions.mjs", ["apply", "--commit", "--title", "T 的检查点"]).committed, true);
  const stT = node(tw, "scope.mjs", ["--overview"]).current_branch_state;
  assert.equal(stT.task.name, "task/t", "带标题提交的检查点找得到");
  assert.equal(stT.handoff_missing, false);
  assert.equal(task(repo, ["close", "task/t", "--abandon"]).abandoned, true);

  // 并进主线后报告别的任务分支:刚开工只有空检查点的、worktree 里有未提交改动的都算;已并进主线还没收工的、什么都没做的不算
  const u = task(repo, ["start", "task/u", "--goal", "刚开工"]).worktree;
  const v = task(repo, ["start", "task/v"]).worktree;
  write(v, "v.md", "v\n");
  task(repo, ["start", "task/w"]);
  const y = task(repo, ["start", "task/y"]).worktree;
  write(y, "y.md", "y\n");
  git(y, "add", "y.md");
  landAll(y, "并入 Y");
  const x = task(repo, ["start", "task/x"]).worktree;
  write(x, "x.md", "x\n");
  git(x, "add", "x.md");
  assert.deepEqual(landAll(x, "并入 X").other_task_branches, ["task/u", "task/v"]);
  fs.rmSync(path.join(v, "v.md"));
  for (const br of ["task/u", "task/v", "task/w", "task/x", "task/y"]) assert.equal(task(repo, ["close", br]).abandoned, false, br);
  assert.equal(fs.existsSync(u), false);

  console.log("并行生命周期测试通过");
} finally {
  for (const t of temps) fs.rmSync(t, { recursive: true, force: true });
}
