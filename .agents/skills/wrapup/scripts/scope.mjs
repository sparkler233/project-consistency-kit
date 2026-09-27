#!/usr/bin/env node
// 一致性机制 version: 2026-09-25
// 一次输出 catchup / wrapup 需要的 Git 范围,JSON 格式,模型直接取值,不再抄写哈希。
// 用法:node scope.mjs            → 基线、基线后提交、改动清单、工作区(含未跟踪文件摘要)
//       node scope.mjs --overview → 另加最近 15 条提交标题、目录一层清单、分支状态(当前分支的任务检查点与和主线的关系,
//                                   其他分支的任务与领先 / 落后)、推送异常
// 默认模式另给 hints:整理线索(本次涉及的文档中大量重复的行、没有被任何文档引用的文档),只供模型判断是否提醒整理

import process from "node:process";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { existsSync, openSync, readSync, closeSync, statSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const overview = process.argv.includes("--overview");
const HEAD_LINES = 3, LINE_MAX = 120, READ_MAX = 2 * 1024 * 1024, LIST_MAX = 200;

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

function nameStatus(args) {
  return lines(git(["diff", "--name-status", ...args])).map((l) => {
    const [status, ...paths] = l.split("\t");
    return { status, path: paths.join(" -> ") };
  });
}

function numstat(args) {
  const map = {};
  for (const l of lines(git(["diff", "--numstat", ...args]))) {
    const [a, d, ...p] = l.split("\t");
    map[p.join("\t")] = { added: a === "-" ? null : Number(a), deleted: d === "-" ? null : Number(d) };
  }
  return map;
}

function fileSummary(rel) {
  const full = path.join(root, rel);
  let bytes = 0;
  try { bytes = statSync(full).size; } catch { return { path: rel, missing: true }; }
  const fd = openSync(full, "r");
  const buf = Buffer.alloc(Math.min(bytes, READ_MAX));
  readSync(fd, buf, 0, buf.length, 0);
  closeSync(fd);
  const text = !buf.subarray(0, 8000).includes(0);
  if (!text) return { path: rel, bytes, text: false };
  const s = buf.toString("utf8");
  const head = s.split("\n").slice(0, HEAD_LINES).map((l) => (l.length > LINE_MAX ? l.slice(0, LINE_MAX) + "…" : l));
  const count = bytes > READ_MAX ? null : s.split("\n").length - (s.endsWith("\n") ? 1 : 0);
  return { path: rel, bytes, lines: count, text: true, head };
}

function dirSummary(rel) {
  let files = 0, bytes = 0;
  const sample = [];
  const walk = (d) => {
    for (const ent of readdirSync(path.join(root, d), { withFileTypes: true })) {
      const r = path.posix.join(d, ent.name);
      if (ent.isDirectory()) walk(r);
      else { files += 1; try { bytes += statSync(path.join(root, r)).size; } catch {} if (sample.length < 5) sample.push(r.slice(rel.length)); }
    }
  };
  walk(rel.replace(/\/$/, ""));
  return { path: rel, directory: true, files, bytes, sample };
}

function worktree() {
  const staged = numstat(["--cached"]), unstagedStat = numstat([]);
  const result = { staged: [], unstaged: [], untracked: [] };
  const entries = (git(["status", "--porcelain=v1", "--untracked-files=normal"]) || "").split("\n").filter(Boolean);
  for (const e of entries) {
    const x = e[0], y = e[1], p = e.slice(3);
    if (x === "?") { result.untracked.push(p); continue; }
    const target = p.includes(" -> ") ? p.split(" -> ")[1] : p;
    if (x !== " ") result.staged.push({ status: x, path: p, ...(staged[target] || {}) });
    if (y !== " ") result.unstaged.push({ status: y, path: p, ...(unstagedStat[target] || {}) });
  }
  const total = result.untracked.length;
  result.untracked = result.untracked.slice(0, LIST_MAX).map((p) => (p.endsWith("/") ? dirSummary(p) : fileSummary(p)));
  if (total > LIST_MAX) result.untracked_truncated = total - LIST_MAX;
  return result;
}

// 分支:任务检查点是分支上 wrapup 的提交,带 `Task:` trailer,说明段写目标 / 进度 / 还剩。
// 找最近的检查点先查分支的 reflog(快进接回主线后仍在,新开的分支里没有别人的检查点),查不到再沿 first-parent 往回找。
function taskState(ref) {
  const find = (walk) => (git(["log", ...walk, "-n", "200", "--format=%H%x1f%(trailers:key=Task,valueonly,separator=%x2C)%x1e"]) || "")
    .split("\x1e").map((r) => r.trim().split("\x1f")).find((r) => r[1] && r[1].trim()) || null;
  const hit = find(["-g", ref]) || find(["--first-parent", ref]);
  if (!hit) return null;
  const message = (git(["log", "-1", "--format=%B", hit[0]]) || "").trim();
  const since = commits(`${hit[0]}..${ref}`, ["--first-parent"]);
  return { name: hit[1].trim(), checkpoint: hit[0].slice(0, 12), message, commits_since_checkpoint: since };
}

function tryMerge(a, b) {
  const v = (git(["version"]) || "").match(/(\d+)\.(\d+)/);
  if (!v || Number(v[1]) < 2 || (Number(v[1]) === 2 && Number(v[2]) < 38)) return { status: "unavailable", reason: "git_older_than_2.38" };
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
  return { base: bases[0].slice(0, 12), ahead, behind, branch_changed: cap(mine), canonical_changed: cap(theirs),
    overlap: mine.filter((f) => theirSet.has(f)), merge_into_canonical: merge };
}

// 当前在分支上:current_branch_state 给出任务状态与和主线的关系;other_branches 列出其他有主线没有的提交、或检出在某个 worktree 中的分支
function branchInfo(canonical, current, worktreeOf) {
  const canonicalRef = `refs/heads/${canonical}`;
  if (!git(["rev-parse", "--verify", "-q", `${canonicalRef}^{commit}`])) return { branches_note: "canonical_ref_missing" };
  const info = {};
  if (current && current !== canonical) {
    const ref = `refs/heads/${current}`;
    info.current_branch_state = { task: taskState(ref), ...relation(ref, canonicalRef, true) };
  }
  const unmerged = lines(git(["branch", "--no-merged", canonicalRef, "--format=%(refname:short)"]));
  const others = [...new Set([...unmerged, ...Object.keys(worktreeOf)])].filter((b) => b !== canonical && b !== current).sort();
  info.other_branches = others.map((b) => {
    const ref = `refs/heads/${b}`;
    const task = taskState(ref);
    const remaining = task && (task.message.split("\n").find((l) => /^\s*还剩\s*[:：]/.test(l)) || "").trim();
    return { branch: b, worktree: worktreeOf[b] || null, last_commit: (git(["log", "-1", "--format=%s", ref]) || "").trim(),
      task: task ? { name: task.name, remaining: remaining || null, commits_since_checkpoint: task.commits_since_checkpoint.length } : null,
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
  return { recent_commits: commits("HEAD", ["-15"]), top_files, tree, ...branches, anomalies };
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
  committed_since_base: base ? nameStatus([base, "HEAD"]) : null, // 基线后已提交的文件;未提交的见 worktree
  worktree: worktree(),
};
if (!base) out.note = "no_reliable_base: 不猜替代基线,见 guard 字段";
if (guard.error) out.guard_error = guard.error;
if (overview) Object.assign(out, overviewInfo(guard));
else { const h = hints(out); if (h) out.hints = h; }
process.stdout.write(JSON.stringify(out) + "\n");
