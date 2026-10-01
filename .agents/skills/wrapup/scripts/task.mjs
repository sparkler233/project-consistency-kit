#!/usr/bin/env node
// 一致性机制 version: 2026-10-01
// 并行的机械部分:开工、同步主线、并进主线、收工。只做 Git 操作并报告结果,JSON 格式;要判断的事留给模型与用户。
// 三条不变式:主线只前进,每一步都经过检查;交接写在分支上;不动别人的东西。满足它们,其余怎么做由 Harness 与用户决定,
// 本脚本只是便捷工具。存在未收工的任务分支就是在并行,全部收工即回到单线程。需要 Git 2.38 及以上,版本不够时拦下并说明。
// 用法(--help 只打印本段说明,不做任何改动;不认识的参数报错且不执行):
//   node task.mjs start <分支> [--goal "目标"] [--task "任务名"] [--path 目录] [--trailer "K: V"]
//       从主线建分支和 worktree(默认放在主 worktree 旁的「<仓库名>.worktrees/」下);给了 --goal 或 --task 时提交一个只带 `Task:`(与「目标:」)的空检查点,记下任务名与目标。
//       输出新会话该在哪里打开和一句开场白。任务名默认用分支名,可以是中文
//   node task.mjs start --here --goal "目标" [--task "任务名"]
//       宿主已建好分支和 worktree 时,在其中只写检查点
//   node task.mjs sync [--continue | --abort]
//       在本分支上把主线 merge 进来(已跟踪文件须没有未提交改动)。合并干净时由脚本提交;PROJECT.md「最近决策」一段是按 git 生成的,
//       那里的冲突由脚本处理并重新生成;其余冲突留给模型(冲突块 ||||||| 之后是原文),解决并 git add 后用 --continue,--abort 放弃
//   node task.mjs land
//       用户说「并进主线」时运行。已跟踪文件有未提交的改动时,先自动提交为检查点;再同步主线;
//       然后提示走合并版 wrapup(decisions.mjs --land),或者(已走过合并版 wrapup、之后主线新增的改动与本分支不相关时)直接完成合并
//   node task.mjs land --finish
//       合并版 wrapup 提交之后运行:做一个合并提交(第一父提交是主线、第二父提交是本分支),把主线快进到它并推进 synced,本分支随之前进。
//       主线又前进了、或主线所在目录有未提交改动时拒绝,不改动任何东西
//   node task.mjs close <分支> [--abandon]
//       收工:分支的改动已全部进主线、worktree 没有未提交改动时,删 worktree 和分支。还有未进主线的改动时拒绝,
//       列出会丢掉的提交与「待提交」决策;经用户确认放弃后加 --abandon。须在别的 worktree 中运行
// 退出码:0 完成或只是报告状态;1 执行出错;2 用法错误;3 被拦下(blocked,附原因)

import process from "node:process";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { readFileSync as readText, writeFileSync } from "node:fs";
import { gitIn, gitAtLeast, findCheckpoint, taskLines, pendingDecisions, projectBody, leadingComments } from "./checkpoints.mjs";
import { LINKAGE, parseLinkage, ruleHits } from "./linkage.mjs";

const emit = (v, code = 0) => { process.stdout.write(JSON.stringify(v) + "\n"); process.exit(code); };
const usage = (msg) => emit({ status: "error", error: msg, hint: "node task.mjs --help 查看用法;未做任何改动" }, 2);
const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help") || argv.includes("-h")) {
  process.stdout.write(leadingComments(readFileSync(fileURLToPath(import.meta.url), "utf8")));
  process.exit(0);
}

// 参数:子命令、位置参数、带值选项、开关
const [cmd, ...rest] = argv;
const SPEC = {
  start: { values: ["--goal", "--task", "--path", "--trailer"], flags: ["--here"] },
  sync: { values: [], flags: ["--continue", "--abort"] },
  land: { values: [], flags: ["--finish"] },
  close: { values: [], flags: ["--abandon"] },
};
if (!SPEC[cmd]) usage(`unknown_command: ${cmd}`);
const opt = { trailer: [] }, pos = [];
for (let i = 0; i < rest.length; i += 1) {
  const a = rest[i];
  if (SPEC[cmd].values.includes(a)) {
    if (rest[i + 1] === undefined) usage(`missing_value: ${a}`);
    const k = a.slice(2);
    if (k === "trailer") opt.trailer.push(rest[i + 1]); else opt[k] = rest[i + 1];
    i += 1;
  } else if (SPEC[cmd].flags.includes(a)) opt[a.slice(2)] = true;
  else if (a.startsWith("-")) usage(`unknown_option: ${a}`);
  else pos.push(a);
}

const cwd = process.cwd();
const top = gitIn(cwd)(["rev-parse", "--show-toplevel"]);
if (top.status !== 0) emit({ status: "error", error: "not_a_git_repository" }, 1);
const root = top.out.trim();
const git = gitIn(root);
const ok = (args) => { const r = git(args); return r.status === 0 ? r.out : null; };
const lines = (s) => (s || "").split("\n").filter(Boolean);
const canonical = (ok(["config", "--get", "projectConsistency.canonicalBranch"]) || "").trim();
const current = (ok(["symbolic-ref", "--quiet", "--short", "HEAD"]) || "").trim();
const canonicalRef = `refs/heads/${canonical}`;
const merging = () => git(["rev-parse", "-q", "--verify", "MERGE_HEAD"]).status === 0;
const dirtyTracked = () => lines(ok(["status", "--porcelain", "--untracked-files=no"]));
const unresolved = () => lines(ok(["diff", "--name-only", "--diff-filter=U"]));
const blocked = (blockers, extra = {}) => emit({ status: "blocked", command: cmd, canonical_branch: canonical || null, current_branch: current || null, blockers, ...extra }, 3);
// 同步用到 Git 2.35 的冲突格式(zdiff3),试合并用到 2.38 的 merge-tree --write-tree;版本不够时在这里说明,不让后面的命令以看不懂的错误失败
const gitVersion = (ok(["version"]) || "").trim();
if (gitAtLeast(gitVersion, 2, 38) === false) blocked(["git_older_than_2.38"], { git: gitVersion, next: "并行脚本需要 Git 2.38 及以上:升级 Git 后再运行" });
if (!canonical) blocked(["canonical_unconfigured"]);

function worktrees() {
  const list = [];
  let wt = null;
  for (const l of lines(ok(["worktree", "list", "--porcelain"]))) {
    if (l.startsWith("worktree ")) { wt = { path: l.slice(9), branch: null }; list.push(wt); }
    else if (l.startsWith("branch refs/heads/") && wt) wt.branch = l.slice(18);
  }
  return list;
}
// 任务分支:有主线没有的提交,或检出在某个 worktree 中;不含主线
function taskBranches() {
  const unmerged = lines(ok(["branch", "--no-merged", canonicalRef, "--format=%(refname:short)"]));
  return [...new Set([...unmerged, ...worktrees().map((w) => w.branch).filter(Boolean)])].filter((b) => b !== canonical).sort();
}
// 提交说明经 stdin 传给 git,不经 shell 拼接
const commitWith = (message, cwdFor, extra = []) => gitIn(cwdFor)(["commit", "-q", ...extra, "-F", "-"], { input: message });

// ---------- start ----------
if (cmd === "start") {
  const goal = (opt.goal || "").trim();
  if (opt.here && !goal) usage("--here 只写检查点,需要 --goal");
  let branch, where;
  if (opt.here) {
    if (pos.length) usage("--here 不带分支名");
    if (!current || current === canonical) blocked([current ? "on_canonical" : "detached_head"]);
    const prev = findCheckpoint(root, "Task", `refs/heads/${current}`);
    if (prev) blocked(["already_started"], { task: prev.value, checkpoint: prev.commit.slice(0, 12) });
    branch = current; where = root;
  } else {
    if (pos.length !== 1) usage("start 需要一个分支名");
    branch = pos[0];
    if (git(["check-ref-format", "--branch", branch]).status !== 0) usage(`invalid_branch_name: ${branch}`);
    if (ok(["rev-parse", "--verify", "-q", `refs/heads/${branch}`])) blocked(["branch_exists"], { branch });
    const main = worktrees()[0].path;
    where = path.resolve(opt.path || path.join(path.dirname(main), `${path.basename(main)}.worktrees`, branch.replace(/\//g, "-")));
    if (existsSync(where)) blocked(["path_exists"], { worktree: where });
    const add = git(["worktree", "add", "-q", "-b", branch, where, canonicalRef]);
    if (add.status !== 0) emit({ status: "error", error: add.err || "git worktree add failed", branch, worktree: where }, 1);
  }
  const task = (opt.task || branch).trim();
  let checkpoint = null;
  if (goal || opt.task) {
    const message = [`开工:${task}`, ...(goal ? [`目标:${goal}`] : []), [`Task: ${task}`, ...opt.trailer].join("\n")].join("\n\n") + "\n";
    const c = commitWith(message, where, ["--allow-empty"]);
    if (c.status !== 0) emit({ status: "error", error: c.err || "git commit failed", branch, worktree: where }, 1);
    checkpoint = (gitIn(where)(["rev-parse", "--short=12", "HEAD"]).out || "").trim();
  }
  emit({
    status: "started", branch, task, worktree: where, checkpoint, created_worktree: !opt.here,
    opening: `这是「${task}」的工作目录(分支 ${branch})。先运行 catchup 再开始${goal ? `;目标:${goal}` : ""}。`,
    next: opt.here ? "在本会话中按目标开始工作" : `在 ${where} 打开一个新会话,把 opening 作为第一句话发给它`,
  });
}

// ---------- 同步 ----------
const conflictNext = (then) => `冲突块中 ||||||| 之后是原文:按两边意图解决后 git add,再运行 task.mjs sync --continue${then};放弃用 task.mjs sync --abort`;
const PROJECT = "PROJECT.md";
const decisionsScript = path.join(path.dirname(fileURLToPath(import.meta.url)), "decisions.mjs");

// PROJECT.md「最近决策」一段按 git 生成:冲突块全部落在这一段时,两边的行合在一起,提交后由 decisions.mjs regen 重新生成
function resolveRecent() {
  const file = path.join(root, PROJECT);
  let text;
  try { text = readText(file, "utf8"); } catch { return false; }
  const rows = text.split("\n");
  const start = rows.findIndex((l) => /^#{2,6}\s*最近决策/.test(l));
  if (start < 0) return false;
  let end = rows.findIndex((l, i) => i > start && /^#{1,6}\s/.test(l));
  if (end < 0) end = rows.length;
  const out = [];
  for (let i = 0; i < rows.length; i += 1) {
    if (!rows[i].startsWith("<<<<<<< ")) { out.push(rows[i]); continue; }
    const close = rows.findIndex((l, k) => k > i && l.startsWith(">>>>>>> "));
    if (i < start || close < 0 || close >= end) return false;
    const block = rows.slice(i + 1, close);
    const baseAt = block.findIndex((l) => l.startsWith("||||||| ")), mid = block.indexOf("=======");
    if (mid < 0) return false;
    const ours = block.slice(0, baseAt >= 0 && baseAt < mid ? baseAt : mid), theirs = block.slice(mid + 1);
    for (const l of [...theirs, ...ours]) if (!out.includes(l) || !l.trim()) out.push(l);
    i = close;
  }
  writeFileSync(file, out.join("\n"));
  return git(["add", "--", PROJECT]).status === 0;
}

// 同步后按 git 历史重新生成「最近决策」;有变化就并进刚才的同步提交
function regenRecent() {
  const r = spawnSync(process.execPath, [decisionsScript, "regen"], { cwd: root, encoding: "utf8", windowsHide: true });
  if (r.status !== 0) return false;
  if (git(["diff", "--quiet", "--", PROJECT]).status === 0) return false;
  return git(["add", "--", PROJECT]).status === 0 && git(["commit", "-q", "--amend", "--no-edit"]).status === 0;
}

function finishMerge() {
  const r = git(["commit", "-q", "--no-edit"]);
  if (r.status !== 0) return { status: "error", error: r.err || "git commit failed" };
  return { status: "synced", commit: (ok(["rev-parse", "--short=12", "HEAD"]) || "").trim(), behind: 0, recent_regenerated: regenRecent() };
}

// 把主线 merge 进本分支;返回 up_to_date / synced / conflict / error
function syncCore() {
  const behind = Number((ok(["rev-list", "--count", `HEAD..${canonicalRef}`]) || "0").trim()) || 0;
  if (!behind) return { status: "up_to_date", behind: 0 };
  const base = (ok(["merge-base", "HEAD", canonicalRef]) || "").trim();
  const subjects = lines(ok(["log", "--first-parent", "--format=%s", `${base}..${canonicalRef}`]));
  const shown = subjects.slice(0, 10).map((x) => `- ${x}`).concat(subjects.length > 10 ? [`- 等共 ${subjects.length} 项`] : []);
  const head = (ok(["rev-parse", "--short=12", canonicalRef]) || "").trim();
  const m = git(["-c", "merge.conflictStyle=zdiff3", "merge", "-q", "-m", `同步主线:合并 ${canonical}(${head})到 ${current}`, "-m", `主线新增:\n${shown.join("\n")}`, canonicalRef]);
  const extra = { merged: head, canonical_commits: subjects.slice(0, 10) };
  if (m.status === 0) return { ...extra, status: "synced", commit: (ok(["rev-parse", "--short=12", "HEAD"]) || "").trim(), behind: 0, recent_regenerated: regenRecent() };
  let conflicts = unresolved();
  const autoResolved = conflicts.includes(PROJECT) && resolveRecent() ? [`${PROJECT}「最近决策」`] : [];
  conflicts = unresolved();
  if (merging() && !conflicts.length) return { ...extra, ...finishMerge(), auto_resolved: autoResolved };
  if (conflicts.length && merging()) return { ...extra, status: "conflict", conflicts, auto_resolved: autoResolved };
  return { status: "error", error: m.err || m.out.trim() || `git merge exited ${m.status}`, merge_in_progress: merging() };
}

if (cmd === "sync") {
  if (pos.length) usage("sync 不带分支名:在本分支的 worktree 中运行");
  if (!current || current === canonical) blocked([current ? "on_canonical" : "detached_head"]);
  if (opt.abort) {
    if (!merging()) emit({ status: "nothing_to_abort" });
    const r = git(["merge", "--abort"]);
    emit(r.status === 0 ? { status: "aborted" } : { status: "error", error: r.err }, r.status === 0 ? 0 : 1);
  }
  if (opt.continue) {
    if (!merging()) emit({ status: "nothing_to_continue" });
    const left = unresolved();
    if (left.length) emit({ status: "conflict", conflicts: left, next: conflictNext("") });
    const r = finishMerge();
    emit(r, r.status === "error" ? 1 : 0);
  }
  if (merging()) blocked(["merge_in_progress"], { next: "有进行中的合并:解决后用 task.mjs sync --continue,或用 --abort 放弃" });
  const dirty = dirtyTracked();
  if (dirty.length) blocked(["dirty_worktree"], { files: dirty.slice(0, 20), next: "已跟踪文件有未提交改动:先做检查点(wrapup),再同步" });
  const r = syncCore();
  emit(r.status === "conflict" ? { ...r, next: conflictNext("") } : r, r.status === "error" ? 1 : 0);
}

// ---------- 并进主线 ----------
// 合并版 wrapup 的提交带 `Land-Checked: <主线提交>`。从 HEAD 沿 first-parent 跳过同步提交,找到最近一个这样的提交,且它还没进主线
function checked() {
  for (const row of lines(ok(["log", "--first-parent", "-n", "50", "--format=%H%x1f%s%x1f%(trailers:key=Land-Checked,valueonly,separator=%x2C)", "HEAD"]))) {
    const [h, subject, against] = row.split("\x1f");
    if (subject.startsWith("同步主线:")) continue;
    if (!against || !against.trim() || git(["merge-base", "--is-ancestor", h, canonicalRef]).status === 0) return null;
    return { commit: h, against: against.trim(), subject };
  }
  return null;
}

const projectAt = (rev) => { const r = git(["show", `${rev}:${PROJECT}`]); return r.status === 0 ? projectBody(r.out) : null; };

// 检查之后主线新增的改动与本分支是否相关:文件交集(PROJECT.md 只比人写的部分)、主线一侧命中联动规则
function relation(against, mine) {
  const now = (ok(["rev-parse", canonicalRef]) || "").trim();
  if (now === against || git(["merge-base", "--is-ancestor", now, against]).status === 0) return { related: false, canonical_changed: [], overlap: [], rules: [] };
  const names = (a, b) => lines(ok(["diff", "--name-only", "--no-renames", a, b, "--"])).filter((f) => f !== PROJECT);
  const theirs = names(against, now), ours = names(against, mine);
  const b0 = projectAt(against), bt = projectAt(now), bo = projectAt(mine);
  if (bt !== b0) theirs.push(PROJECT);
  if (bo !== b0) ours.push(PROJECT);
  const overlap = theirs.filter((f) => ours.includes(f));
  let rules = [];
  try { const l = parseLinkage(readText(path.join(root, LINKAGE), "utf8"), LINKAGE); if (l.recognized) rules = ruleHits(l, theirs).map((x) => x.rule); } catch {}
  return { related: overlap.length > 0 || rules.length > 0, canonical_changed: theirs.slice(0, 50), overlap, rules };
}

// 别的任务分支还在进行:有主线没有的提交(只有开工检查点也算),或 worktree 里有未提交改动;已并进主线还没收工的不算
function otherTaskBranches() {
  const wtOf = Object.fromEntries(worktrees().filter((w) => w.branch).map((w) => [w.branch, w.path]));
  return taskBranches().filter((b) => {
    if (b === current) return false;
    if (git(["merge-base", "--is-ancestor", `refs/heads/${b}`, canonicalRef]).status !== 0) return true;
    const p = wtOf[b];
    return Boolean(p && existsSync(p) && lines(gitIn(p)(["status", "--porcelain"]).out).length);
  });
}

// 做合并提交,快进主线,推进 synced,本分支随之前进。任何一步前的检查不通过都不改动东西
function finishLanding(ck, recheckSkipped) {
  const tip = (ok(["rev-parse", canonicalRef]) || "").trim();
  const head = (ok(["rev-parse", "HEAD"]) || "").trim();
  const message = `${ck.subject}\n\n合并 ${current} 到 ${canonical}:本分支的检查与决策全文见第二父提交。\n`;
  const tree = (ok(["rev-parse", "HEAD^{tree}"]) || "").trim();
  const m = git(["commit-tree", tree, "-p", tip, "-p", head, "-F", "-"], { input: message });
  if (m.status !== 0) emit({ status: "error", error: m.err || "git commit-tree failed" }, 1);
  const landed = m.out.trim();
  const mainWt = worktrees().find((w) => w.branch === canonical);
  if (mainWt && existsSync(mainWt.path)) {
    const dirty = lines(gitIn(mainWt.path)(["status", "--porcelain", "--untracked-files=no"]).out);
    if (dirty.length) blocked(["canonical_worktree_dirty"], { worktree: mainWt.path, files: dirty.slice(0, 20), next: `主线所在目录有未提交的改动,主线没有改动:请用户处理那边的改动(提交或放弃)后,再运行 task.mjs land --finish` });
    const f = gitIn(mainWt.path)(["merge", "--ff-only", "-q", landed]);
    if (f.status !== 0) {
      if ((ok(["rev-parse", canonicalRef]) || "").trim() !== tip) blocked(["canonical_moved"], { next: "主线刚被别人推进,主线没有改动:运行 task.mjs land 重新同步" });
      emit({ status: "error", error: f.err || "git merge --ff-only failed", worktree: mainWt.path }, 1);
    }
  } else {
    const u = git(["update-ref", canonicalRef, landed, tip]);
    if (u.status !== 0) blocked(["canonical_moved"], { next: "主线刚被别人推进,主线没有改动:运行 task.mjs land 重新同步" });
  }
  // 主线已前进;本分支随之前进(内容相同,不改文件)
  const own = git(["merge", "--ff-only", "-q", landed]);
  // synced 只会落后、不会超前:主线推进之后再推进它
  const oldSynced = (ok(["rev-parse", "-q", "--verify", "refs/tags/synced"]) || "").trim();
  let synced = "advanced";
  if (oldSynced && git(["merge-base", "--is-ancestor", oldSynced, landed]).status !== 0) synced = "not_advanced:synced_not_ancestor";
  else if (git(["update-ref", "refs/tags/synced", landed, oldSynced || ""]).status !== 0) synced = "not_advanced:update_failed";
  const others = otherTaskBranches();
  emit({
    status: "landed", canonical_branch: canonical, commit: landed.slice(0, 12), checked: ck.commit.slice(0, 12), recheck_skipped: recheckSkipped,
    branch_advanced: own.status === 0, synced, other_task_branches: others,
    note: others.length ? "主线已前进,其他任务分支下一轮开始时按相关性收到提示" : "已没有别的任务分支在并行:可以回到主线单线程工作,或留在本分支继续",
  });
}

if (cmd === "land") {
  if (pos.length) usage("land 不带分支名:在要并进主线的分支的 worktree 中运行");
  if (!current || current === canonical) blocked([current ? "on_canonical" : "detached_head"], { next: "主线上照常 wrapup 即可" });
  if (merging()) blocked(["merge_in_progress"], { next: "有进行中的合并:解决冲突后运行 task.mjs sync --continue,再运行 task.mjs land" });
  if (opt.finish) {
    if (dirtyTracked().length) blocked(["dirty_worktree"], { next: "有未提交的改动:运行 task.mjs land(会先把它们提交为检查点)" });
    if (git(["merge-base", "--is-ancestor", canonicalRef, "HEAD"]).status !== 0) blocked(["canonical_moved"], { next: "主线又前进了:运行 task.mjs land 重新同步" });
    const ck = checked();
    if (!ck) blocked(["not_checked"], { next: "还没有走合并版 wrapup:按 wrapup 收尾,decisions.mjs 加 --land,提交后再运行 task.mjs land --finish" });
    const rel = relation(ck.against, ck.commit);
    if (rel.related) blocked(["recheck_needed"], { ...rel, next: "检查之后主线新增的改动与本分支相关:重新走合并版 wrapup(--land),再运行 task.mjs land --finish" });
    finishLanding(ck, ck.against !== (ok(["rev-parse", canonicalRef]) || "").trim());
  }
  // 1. 未提交的改动自动提交为检查点:沿用上一个检查点的任务名与三行
  let autoCheckpoint = null;
  const dirty = dirtyTracked();
  if (dirty.length) {
    const prev = findCheckpoint(root, "Task", `refs/heads/${current}`);
    const task = prev ? prev.value : current;
    const carried = prev ? taskLines(ok(["log", "-1", "--format=%B", prev.commit])) : [];
    const message = ["合并前检查点:提交未提交的改动", ...(carried.length ? [carried.join("\n")] : []), `Task: ${task}`].join("\n\n") + "\n";
    const c = commitWith(message, root, ["-a"]);
    if (c.status !== 0) emit({ status: "error", error: c.err || "git commit failed" }, 1);
    autoCheckpoint = { commit: (ok(["rev-parse", "--short=12", "HEAD"]) || "").trim(), files: dirty.length };
  }
  const untracked = lines(ok(["ls-files", "--others", "--exclude-standard"])).slice(0, 20);
  const base = { auto_checkpoint: autoCheckpoint, ...(untracked.length ? { untracked, untracked_note: "未跟踪文件没有自动提交:合并版 wrapup 时判断是否纳入" } : {}) };
  // 2. 同步主线
  const s = syncCore();
  if (s.status === "error") emit({ ...base, sync: s, status: "error" }, 1);
  if (s.status === "conflict") emit({ ...base, status: "conflict", sync: s, conflicts: s.conflicts, next: conflictNext(",再运行 task.mjs land") });
  if (git(["diff", "--quiet", canonicalRef, "HEAD", "--"]).status === 0) emit({ ...base, sync: s, status: "nothing_to_land", next: "本分支没有主线之外的改动,不需要合并" });
  // 3. 已检查过、之后主线新增的改动不相关(同步干净):直接完成合并;否则走合并版 wrapup
  const ck = checked();
  if (ck && !untracked.length) {
    const rel = relation(ck.against, ck.commit);
    if (!rel.related) finishLanding(ck, true);
    emit({ ...base, sync: s, status: "needs_wrapup", reason: "recheck", relation: rel,
      next: "检查之后主线新增的改动与本分支相关:重新走合并版 wrapup(decisions.mjs 加 --land),提交后运行 task.mjs land --finish" });
  }
  emit({ ...base, sync: s, status: "needs_wrapup", reason: ck ? "untracked_files" : "first_check",
    next: "按 wrapup 合并模式收尾:照主线的做法检查联动、更新 PROJECT 状态与阅读入口;「待提交」有决策时先 decisions.mjs plan --land,按输出的 next 处理;分支上不等确认,直接 decisions.mjs apply --land --commit --title \"<标题>\",再运行 task.mjs land --finish" });
}

// ---------- close ----------
if (cmd === "close") {
  if (pos.length !== 1) usage("close 需要一个分支名");
  const branch = pos[0], ref = `refs/heads/${branch}`;
  if (branch === canonical) blocked(["is_canonical"], { branch });
  const head = (ok(["rev-parse", "--verify", "-q", `${ref}^{commit}`]) || "").trim();
  if (!head) blocked(["branch_missing"], { branch });
  if (current === branch) blocked(["run_from_other_worktree"], { branch, next: "在主线或别的 worktree 中运行 close" });
  const wt = worktrees().find((w) => w.branch === branch) || null;
  const base = (ok(["merge-base", canonicalRef, ref]) || "").trim();
  const unintegrated = base ? git(["diff", "--quiet", base, ref, "--"]).status !== 0 : true;
  let dropped = null;
  if (unintegrated) {
    const pending = pendingDecisions(root, ref);
    dropped = { commits: lines(ok(["log", "--first-parent", "--format=%h %s", `${canonicalRef}..${ref}`])).slice(0, 20), pending_decisions: pending };
    if (!opt.abandon) emit({ status: "not_integrated", branch, ...dropped,
      next: "还有未进主线的改动:要保留,就在该分支的会话里说「并进主线」;经用户确认放弃后,加 --abandon 再运行" });
  }
  if (wt && existsSync(wt.path)) {
    const dirty = lines(gitIn(wt.path)(["status", "--porcelain"]).out);
    if (dirty.length) blocked(["worktree_dirty"], { branch, worktree: wt.path, files: dirty.slice(0, 20), next: "该 worktree 有未提交的改动或未跟踪文件:先让任务会话提交,或由用户决定丢弃,再收工" });
    const r = git(["worktree", "remove", wt.path]);
    if (r.status !== 0) emit({ status: "error", error: r.err || "git worktree remove failed", branch, worktree: wt.path }, 1);
  } else if (wt) git(["worktree", "prune"]);
  const d = git(["branch", "-D", branch]);
  if (d.status !== 0) emit({ status: "error", error: d.err || "git branch -D failed", branch }, 1);
  const left = taskBranches();
  emit({
    status: "closed", branch, head, abandoned: Boolean(unintegrated), ...(dropped ? { dropped } : {}),
    worktree_removed: wt ? wt.path : null,
    remaining_task_branches: left,
    note: left.length ? "仍有任务分支在并行" : "已没有任务分支,回到单线程",
    recover: `误删时,在 git gc 之前可用 git branch ${branch} ${head.slice(0, 12)} 找回分支`,
  });
}
