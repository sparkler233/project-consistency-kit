#!/usr/bin/env node
// 一致性机制 version: 2026-09-25
// 一次输出 catchup / wrapup 需要的 Git 范围,JSON 格式,模型直接取值,不再抄写哈希。
// 用法:node scope.mjs            → 基线、基线后提交、改动清单、工作区(含未跟踪文件摘要)
//       node scope.mjs --overview → 另加最近 15 条提交标题、目录一层清单、并行与推送异常
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

function overviewInfo(guard) {
  const dirs = lines(git(["ls-tree", "-d", "--name-only", "HEAD"]));
  const tree = {};
  for (const d of dirs) tree[d] = lines(git(["ls-tree", "--name-only", "HEAD", `${d}/`])).map((p) => p.slice(d.length + 1));
  const top_files = lines(git(["ls-tree", "--name-only", "HEAD"])).filter((p) => !dirs.includes(p));
  const anomalies = [];
  const worktrees = lines(git(["worktree", "list", "--porcelain"])).filter((l) => l.startsWith("worktree ")).map((l) => l.slice(9));
  if (worktrees.length > 1) anomalies.push({ kind: "other_worktrees", items: worktrees.filter((w) => path.resolve(w) !== path.resolve(root)) });
  const unmerged = lines(git(["branch", "--no-merged", "--format=%(refname:short)"]));
  if (unmerged.length) anomalies.push({ kind: "unmerged_branches", items: unmerged });
  const upstream = (git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]) || "").trim();
  if (upstream) {
    const [behind, ahead] = (git(["rev-list", "--left-right", "--count", "@{u}...HEAD"]) || "0 0").trim().split(/\s+/).map(Number);
    if (behind || ahead) anomalies.push({ kind: "upstream_diverged", upstream, ahead, behind });
  }
  return { recent_commits: commits("HEAD", ["-15"]), top_files, tree, anomalies };
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
