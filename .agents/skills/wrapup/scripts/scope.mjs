#!/usr/bin/env node
// 一致性机制 version: 2026-10-01
// 一次输出 catchup / wrapup 需要的 Git 范围,JSON 格式,模型直接取值,不再抄写哈希。
// 用法:node scope.mjs            → 基线、基线后提交、改动清单、工作区(含未跟踪文件摘要)
//       node scope.mjs --overview → 另加最近 15 条提交标题(沿 first-parent:一次并进主线只占一行,被合并进来的分支提交不逐条列出)、
//                                   本 worktree「待提交」里的决策(pending_decisions)、目录一层清单、分支状态(当前分支的任务检查点与和主线的关系,
//                                   其他分支的任务、领先 / 落后、是否已全部进主线、未提交改动、还没进主线的决策)、推送异常;
//                                   不变式的提醒:分支有主线之外的提交却找不到检查点(handoff_missing,如 rebase 之后),
//                                   与别的分支共有还没进主线的提交(shares_unmerged_with,分支之间直接合并过,对方的决策会被一起带进主线);
//                                   分支上另给主线一侧改动命中的联动规则(rules_hit_by_canonical)
// 默认模式另给 hints:整理线索(本次涉及的文档中大量重复的行、没有被任何文档引用的文档),只供模型判断是否提醒整理;
// 以及 linkage:本次范围(基线后已提交与工作区改动)按路径命中的联动规则 rules_hit,和脚本判断不全、要模型自行判断的
// rules_not_checked(触发里没有路径,或还有文字条件而按路径没命中);是否成立、要不要改由模型按规则原文判断

import process from "node:process";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { existsSync, openSync, readSync, closeSync, lstatSync, readlinkSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { LINKAGE, parseLinkage, ruleHits, notChecked } from "./linkage.mjs";
import { taskState as taskStateAt, remainingLine, pendingDecisions, pendingIn, leadingComments, gitAtLeast } from "./checkpoints.mjs";

// --help 只打印开头这段说明,不做任何改动;不认识的参数报错且不执行
{
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(leadingComments(readFileSync(fileURLToPath(import.meta.url), "utf8")));
    process.exit(0);
  }
  const bad = args.filter((a) => !["--overview"].includes(a));
  if (bad.length) {
    process.stdout.write(JSON.stringify({ error: `unknown_option: ${bad.join(" ")}`, hint: "node scope.mjs --help 查看用法;未做任何改动" }) + "\n");
    process.exit(2);
  }
}
const here = path.dirname(fileURLToPath(import.meta.url));
const overview = process.argv.includes("--overview");
const HEAD_LINES = 3, LINE_MAX = 120, READ_MAX = 2 * 1024 * 1024, LIST_MAX = 200, WALK_MAX = 20000;

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}
const root = (run("git", ["rev-parse", "--show-toplevel"], process.cwd()) || "").trim();
if (!root) {
  process.stdout.write(JSON.stringify({ error: "not_a_git_repository" }) + "\n");
  process.exit(0);
}
const git = (args) => run("git", ["-c", "core.quotepath=false", ...args], root);
const lines = (s) => (s || "").split("\n").filter(Boolean);

function guardState() {
  const candidates = [path.join(here, "synced-guard.mjs"), path.join(root, ".agents/skills/wrapup/scripts/synced-guard.mjs")];
  const guard = candidates.find(existsSync);
  if (!guard) return { error: "guard_not_found" };
  const out = run(process.execPath, [guard, "inspect"], root);
  try { return JSON.parse(out); } catch { return { error: "guard_failed" }; }
}

function commits(range, extra = []) {
  return lines(git(["log", "--format=%h%x09%s", ...extra, range])).map((l) => {
    const [hash, ...rest] = l.split("\t");
    return { hash, subject: rest.join("\t") };
  });
}

// 路径一律用 -z 取,文件名含空格、引号、制表符或中文都原样给出;改名给出新路径 path 与原路径 from
const fields = (s) => (s || "").split("\0");
function nameStatus(args) {
  const f = fields(git(["diff", "--name-status", "-z", ...args])), out = [];
  for (let i = 0; i + 1 < f.length && f[i]; ) {
    const status = f[i];
    if (/^[RC]/.test(status)) { out.push({ status: status[0], path: f[i + 2], from: f[i + 1] }); i += 3; }
    else { out.push({ status, path: f[i + 1] }); i += 2; }
  }
  return out;
}

function numstat(args) {
  const map = {}, f = fields(git(["diff", "--numstat", "-z", ...args]));
  for (let i = 0; i < f.length && f[i]; ) {
    const [a, d, p] = f[i].split("\t");
    const stat = { added: a === "-" ? null : Number(a), deleted: d === "-" ? null : Number(d) };
    if (p) { map[p] = stat; i += 1; } else { map[f[i + 2]] = stat; i += 3; } // 改名:空路径后跟原路径、新路径
  }
  return map;
}

// 未跟踪文件的摘要;符号链接只报指向,不跟进;读不了的报 unreadable,不中断整个输出
function fileSummary(rel) {
  const full = path.join(root, rel);
  let st;
  try { st = lstatSync(full); } catch { return { path: rel, missing: true }; }
  if (st.isSymbolicLink()) { let target = null; try { target = readlinkSync(full); } catch {} return { path: rel, symlink: true, target }; }
  if (!st.isFile()) return { path: rel, special: true };
  const bytes = st.size;
  const buf = Buffer.alloc(Math.min(bytes, READ_MAX));
  try {
    const fd = openSync(full, "r");
    try { readSync(fd, buf, 0, buf.length, 0); } finally { closeSync(fd); }
  } catch { return { path: rel, bytes, unreadable: true }; }
  const text = !buf.subarray(0, 8000).includes(0);
  if (!text) return { path: rel, bytes, text: false };
  const s = buf.toString("utf8");
  const head = s.split("\n").slice(0, HEAD_LINES).map((l) => (l.length > LINE_MAX ? l.slice(0, LINE_MAX) + "…" : l));
  const count = bytes > READ_MAX ? null : s.split("\n").length - (s.endsWith("\n") ? 1 : 0);
  return { path: rel, bytes, lines: count, text: true, head };
}

// 未跟踪目录的汇总;里面的 .git(嵌套仓库)不计入,标 nested_repo;读不了的子目录跳过;最多走 WALK_MAX 个文件
function dirSummary(rel) {
  let files = 0, bytes = 0, nested = false, skipped = 0, truncated = false;
  const sample = [];
  const walk = (d) => {
    let ents;
    try { ents = readdirSync(path.join(root, d), { withFileTypes: true }); } catch { skipped += 1; return; }
    for (const ent of ents) {
      if (files >= WALK_MAX) { truncated = true; return; }
      const r = path.posix.join(d, ent.name);
      if (ent.name === ".git") { nested = true; continue; }
      if (ent.isDirectory()) walk(r);
      else { files += 1; try { bytes += lstatSync(path.join(root, r)).size; } catch {} if (sample.length < 5) sample.push(r.slice(rel.length)); }
    }
  };
  walk(rel.replace(/\/$/, ""));
  return { path: rel, directory: true, files, bytes, sample, ...(nested ? { nested_repo: true } : {}),
    ...(skipped ? { unreadable_dirs: skipped } : {}), ...(truncated ? { files_truncated: true } : {}) };
}

function worktree() {
  const staged = numstat(["--cached"]), unstagedStat = numstat([]);
  const result = { staged: [], unstaged: [], untracked: [] };
  const f = fields(git(["status", "--porcelain=v1", "-z", "--untracked-files=normal"]));
  for (let i = 0; i < f.length && f[i]; i += 1) {
    const x = f[i][0], y = f[i][1], p = f[i].slice(3);
    if (x === "?") { result.untracked.push(p); continue; }
    if (x === "!") continue;
    const from = /[RC]/.test(x) ? f[(i += 1)] : null; // 改名 / 复制:下一个字段是原路径
    const where = from ? { path: p, from } : { path: p };
    if (x !== " ") result.staged.push({ status: x, ...where, ...(staged[p] || {}) });
    if (y !== " ") result.unstaged.push({ status: y, ...where, ...(unstagedStat[p] || {}) });
  }
  const total = result.untracked.length;
  result.untracked = result.untracked.slice(0, LIST_MAX).map((p) => (p.endsWith("/") ? dirSummary(p) : fileSummary(p)));
  if (total > LIST_MAX) result.untracked_truncated = total - LIST_MAX;
  return result;
}

// 分支:任务检查点是分支上 wrapup 的提交,带 `Task:` trailer。找法见 checkpoints.mjs
const taskState = (ref) => taskStateAt(root, ref);

function tryMerge(a, b) {
  if (gitAtLeast(git(["version"]), 2, 38) !== true) return { status: "unavailable", reason: "git_older_than_2.38" };
  const r = spawnSync("git", ["-c", "core.quotepath=false", "merge-tree", "--write-tree", "--name-only", "--no-messages", "-z", a, b], { cwd: root, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.status === 0) return { status: "clean" };
  if (r.status === 1) return { status: "conflict", conflicts: [...new Set((r.stdout || "").split("\0").filter(Boolean).slice(1))] };
  return { status: "error" };
}

// 分支与主线的关系:分叉点、领先 / 落后、两边自分叉点以来改动的文件及交集、试合并进主线的结果。只看已提交的内容。
function relation(ref, canonicalRef, detail) {
  const bases = lines(git(["merge-base", "--all", canonicalRef, ref]));
  if (bases.length !== 1) return { error: bases.length ? "ambiguous_merge_base" : "no_merge_base" };
  const [behind, ahead] = (git(["rev-list", "--left-right", "--count", `${canonicalRef}...${ref}`]) || "0 0").trim().split(/\s+/).map(Number);
  const merge = ahead ? tryMerge(canonicalRef, ref) : { status: "nothing_to_merge" };
  if (!detail) return { ahead, behind, merge_into_canonical: merge };
  const changed = (to) => (git(["diff", "--name-only", "--no-renames", "-z", bases[0], to, "--"]) || "").split("\0").filter(Boolean);
  const cap = (list) => (list.length > LIST_MAX ? { items: list.slice(0, LIST_MAX), truncated: list.length - LIST_MAX } : list);
  const mine = changed(ref), theirs = changed(canonicalRef);
  const theirSet = new Set(theirs);
  let rules = null;
  try { const l = parseLinkage(readFileSync(path.join(root, LINKAGE), "utf8"), LINKAGE); if (l.recognized) rules = ruleHits(l, theirs); } catch {}
  return { base: bases[0].slice(0, 12), ahead, behind, branch_changed: cap(mine), canonical_changed: cap(theirs),
    overlap: mine.filter((f) => theirSet.has(f)), rules_hit_by_canonical: rules, merge_into_canonical: merge };
}

// 当前在分支上:current_branch_state 给出任务状态与和主线的关系;other_branches 列出其他有主线没有的提交、或检出在某个 worktree 中的分支
function branchInfo(canonical, current, worktreeOf) {
  const canonicalRef = `refs/heads/${canonical}`;
  if (!git(["rev-parse", "--verify", "-q", `${canonicalRef}^{commit}`])) return { branches_note: "canonical_ref_missing" };
  const info = {};
  const unmerged = lines(git(["branch", "--no-merged", canonicalRef, "--format=%(refname:short)"]));
  const all = [...new Set([...unmerged, ...Object.keys(worktreeOf), ...(current && current !== canonical ? [current] : [])])].filter((b) => b !== canonical).sort();
  // 各分支还没进主线的提交;两个分支共有这样的提交,说明它们之间直接合并过
  const own = new Map(all.map((b) => [b, new Set(lines(git(["rev-list", "-n", "500", `refs/heads/${b}`, `^${canonicalRef}`])))]));
  const shares = (b) => all.filter((o) => o !== b && [...own.get(b)].some((h) => own.get(o).has(h)));
  // 交接写在分支上:有主线之外的提交,就应能在分支历史里找到检查点
  const handoffMissing = (b, task) => own.get(b).size > 0 && !task;
  if (current && current !== canonical) {
    const ref = `refs/heads/${current}`;
    const task = taskState(ref);
    info.current_branch_state = { task, handoff_missing: handoffMissing(current, task), shares_unmerged_with: shares(current), ...relation(ref, canonicalRef, true) };
  }
  const others = all.filter((b) => b !== current);
  info.other_branches = others.map((b) => {
    const ref = `refs/heads/${b}`;
    const task = taskState(ref);
    const wt = worktreeOf[b] || null;
    // 是否已全部进主线:看分叉点之后的内容差异(合并后又同步过主线时,分支头不在主线里,但没有未进主线的内容)
    const base = (git(["merge-base", canonicalRef, ref]) || "").trim();
    const merged = Boolean(base) && spawnSync("git", ["diff", "--quiet", base, ref, "--"], { cwd: root, windowsHide: true }).status === 0;
    let uncommitted = null;
    if (wt && existsSync(wt)) {
      const r = spawnSync("git", ["status", "--porcelain"], { cwd: wt, encoding: "utf8", windowsHide: true });
      uncommitted = r.status === 0 ? lines(r.stdout).length : null;
    }
    return { branch: b, worktree: wt, last_commit: (git(["log", "-1", "--format=%s", ref]) || "").trim(),
      task: task ? { name: task.name, remaining: remainingLine(task.message), commits_since_checkpoint: task.commits_since_checkpoint.length } : null,
      merged, uncommitted, pending_decisions: merged ? [] : pendingDecisions(root, ref),
      handoff_missing: handoffMissing(b, task), shares_unmerged_with: shares(b),
      ...relation(ref, canonicalRef, false) };
  });
  return info;
}

function overviewInfo(guard) {
  const dirs = lines(git(["ls-tree", "-d", "--name-only", "HEAD"]));
  const tree = {};
  for (const d of dirs) tree[d] = lines(git(["ls-tree", "--name-only", "HEAD", `${d}/`])).map((p) => p.slice(d.length + 1));
  const top_files = lines(git(["ls-tree", "--name-only", "HEAD"])).filter((p) => !dirs.includes(p));
  const anomalies = [];
  const worktreeOf = {}, detached = [];
  let wt = null;
  for (const l of lines(git(["worktree", "list", "--porcelain"]))) {
    if (l.startsWith("worktree ")) wt = l.slice(9);
    else if (l.startsWith("branch refs/heads/")) worktreeOf[l.slice(18)] = wt;
    else if (l === "detached" && path.resolve(wt) !== path.resolve(root)) detached.push(wt);
  }
  if (detached.length) anomalies.push({ kind: "detached_worktrees", items: detached });
  const upstream = (git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) || "").trim();
  if (upstream) {
    const [behind, ahead] = (git(["rev-list", "--left-right", "--count", "@{u}...HEAD"]) || "0 0").trim().split(/\s+/).map(Number);
    if (behind || ahead) anomalies.push({ kind: "upstream_diverged", upstream, ahead, behind });
  }
  const branches = guard.canonical_branch ? branchInfo(guard.canonical_branch, guard.current_branch ?? null, worktreeOf) : { branches_note: "canonical_unconfigured" };
  // 本 worktree「待提交」里还没迁出的决策(读工作区的 PROJECT.md,含未提交的改动)
  let pending_decisions = [];
  try { pending_decisions = pendingIn(readFileSync(path.join(root, "PROJECT.md"), "utf8")); } catch {}
  // 最近提交沿 first-parent:并进主线的合并提交与它的第二父提交标题相同,再加同步提交,逐条列出会把一次合并写成两三行
  return { recent_commits: commits("HEAD", ["-15", "--first-parent"]), pending_decisions, top_files, tree, ...branches, anomalies };
}

const MECH = [".agents/", ".claude/", ".codex/", "一致性机制/"];
function hints(out) {
  const text = (rel) => { try { const s = readFileSync(path.join(root, rel), "utf8"); return s.includes("\u0000") ? null : s; } catch { return null; } };
  const md = lines(git(["ls-files", "*.md"])).filter((f) => !MECH.some((m) => f.startsWith(m)));
  const touched = new Set([
    ...(out.committed_since_base || []).map((x) => x.path),
    ...out.worktree.staged.map((x) => x.path), ...out.worktree.unstaged.map((x) => x.path),
    ...out.worktree.untracked.filter((x) => !x.directory).map((x) => x.path), "PROJECT.md",
  ].filter((f) => f.endsWith(".md")));
  const repeated_lines = [];
  for (const f of touched) {
    const counts = {};
    for (const l of (text(f) || "").split("\n").map((x) => x.trim()).filter((x) => x.length >= 8)) counts[l] = (counts[l] || 0) + 1;
    for (const [line, count] of Object.entries(counts)) if (count >= 5) repeated_lines.push({ file: f, count, line: line.slice(0, 80) });
  }
  const corpus = md.map((f) => [f, text(f) || ""]);
  const referenced = (f) => {
    const keys = [f, path.posix.basename(f)];
    for (let d = path.posix.dirname(f); d.includes("/"); d = path.posix.dirname(d)) keys.push(`${d}/`); // 只认两层以上的目录,`docs/` 这类处处出现
    return corpus.some(([g, s]) => g !== f && keys.some((k) => s.includes(k)));
  };
  const top = new Set(["PROJECT.md", "AGENTS.md", "CLAUDE.md", "README.md"]);
  const unreferenced_docs = md.filter((f) => !top.has(f) && !referenced(f)).slice(0, 10);
  const h = {};
  if (repeated_lines.length) h.repeated_lines = repeated_lines.slice(0, 10);
  if (unreferenced_docs.length) h.unreferenced_docs = unreferenced_docs;
  return Object.keys(h).length ? h : null;
}

function linkageInfo(out) {
  let text = null;
  try { text = readFileSync(path.join(root, LINKAGE), "utf8"); } catch {}
  const l = parseLinkage(text, LINKAGE);
  if (!l.recognized) return l;
  const files = [...new Set([
    ...(out.committed_since_base || []).map((x) => x.path),
    ...out.worktree.staged.map((x) => x.path), ...out.worktree.unstaged.map((x) => x.path),
    ...out.worktree.untracked.map((x) => x.path),
  ])];
  return { rules_hit: ruleHits(l, files), rules_not_checked: notChecked(l, files) };
}

const guard = guardState();
const base = guard && guard.scope_base ? guard.scope_base : null;
const out = {
  branch: guard.current_branch ?? null,
  canonical_branch: guard.canonical_branch ?? null,
  base,
  head: guard.head ?? null,
  synced: guard.synced ?? null,
  can_advance: guard.can_advance ?? false,
  blockers: guard.blockers ?? [],
  commits_since_base: base ? commits(`${base}..HEAD`) : null,
  committed_since_base: base ? nameStatus([base, "HEAD"]) : null, // 基线后已提交的文件(改名另给原路径 from);未提交的见 worktree
  worktree: worktree(),
};
if (!base) out.note = "no_reliable_base: 不猜替代基线,见 guard 字段";
if (guard.error) out.guard_error = guard.error;
if (overview) Object.assign(out, overviewInfo(guard));
else { out.linkage = linkageInfo(out); const h = hints(out); if (h) out.hints = h; }
process.stdout.write(JSON.stringify(out) + "\n");
