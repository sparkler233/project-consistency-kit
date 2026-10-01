#!/usr/bin/env node
// 一致性机制 version: 2026-10-01
// 并行提示 hook:每轮开始时运行(Claude Code 与 Codex 都接在 UserPromptSubmit)。
// 只按 Git 事实生成提示,不写仓库文件,不做任何 Git 改动;出错一律静默,不阻塞宿主。
// 在分支上:主线有本分支没有的提交,且与本分支相关(改了同样的文件,含未提交的;主线一侧命中联动规则;试合并冲突)、
// 这个主线位置还没提示过时,提示主线新增的提交标题、交集、命中的规则、试合并结果。只报事实,不要求同步:
// 要不要为此打断手上的事由用户决定,所以同一段文字既进模型上下文(additionalContext),也显示给用户(systemMessage)。
// 不相关的主线变化不提示,并进主线时会一起同步。主线上不提示。去重记录存在各 worktree 自己的 git 目录(pck-notice.json)。
// 末尾附一句同步用什么(只说怎么做,不说要不要做):模型平时干活时手边未必有 wrapup Skill,曾手抄主线的改动(2026-09-29 Luna)。

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { gitIn, projectBody } from "../skills/wrapup/scripts/checkpoints.mjs";
import { LINKAGE, parseLinkage, ruleHits } from "../skills/wrapup/scripts/linkage.mjs";

const SUBJECTS = 5, FILES = 8;

// 输出只用 ASCII(中文转成 \uXXXX):Windows PowerShell 5.1 经管道转发时按系统代码页解码,非 ASCII 会被解乱(与收尾提醒相同)
function asciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function readInput() {
  try { const t = fs.readFileSync(0, "utf8"); return t ? JSON.parse(t) : {}; } catch { return {}; }
}
const lines = (s) => (s || "").split("\n").filter(Boolean);
const list = (items, max) => items.slice(0, max).map((x) => `\`${x}\``).join("、") + (items.length > max ? ` 等 ${items.length} 个` : "");

function main() {
  const input = readInput();
  const start = input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const top = gitIn(start)(["rev-parse", "--show-toplevel"]);
  if (top.status !== 0) return null;
  const root = top.out.trim();
  const git = gitIn(root);
  const ok = (args) => { const r = git(args); return r.status === 0 ? r.out : null; };
  const canonical = (ok(["config", "--get", "projectConsistency.canonicalBranch"]) || "").trim();
  if (!canonical) return null;
  const canonicalRef = `refs/heads/${canonical}`;
  const canonicalHead = (ok(["rev-parse", "--verify", "-q", canonicalRef]) || "").trim();
  if (!canonicalHead) return null;
  const current = (ok(["symbolic-ref", "--quiet", "--short", "HEAD"]) || "").trim();
  if (!current) return null;

  const gitDir = path.resolve(root, (ok(["rev-parse", "--git-dir"]) || "").trim());
  const statePath = path.join(gitDir, "pck-notice.json");
  let state = {};
  try { state = JSON.parse(fs.readFileSync(statePath, "utf8")); } catch {}
  const save = () => { try { fs.writeFileSync(statePath, JSON.stringify(state)); } catch {} };

  if (current === canonical) return null;
  const behind = Number((ok(["rev-list", "--count", `HEAD..${canonicalRef}`]) || "0").trim()) || 0;
  if (!behind || state.canonical_seen === canonicalHead) return null;
  const base = (ok(["merge-base", "HEAD", canonicalRef]) || "").trim();
  if (!base) return null;
  const subjects = lines(ok(["log", "--first-parent", "--format=%s", `${base}..${canonicalRef}`]));
  let theirs = lines(ok(["diff", "--name-only", "--no-renames", base, canonicalRef, "--"]));
  const mine = new Set([
    ...lines(ok(["diff", "--name-only", "--no-renames", base, "HEAD", "--"])),
    ...lines(ok(["diff", "--name-only", "--no-renames", "HEAD", "--"])),
  ]);
  // PROJECT.md 只比人写的部分:两边都改了「待提交」「最近决策」之外的内容才算交集
  const body = (rev) => { const r = git(["show", `${rev}:PROJECT.md`]); return r.status === 0 ? projectBody(r.out) : null; };
  let work = null;
  try { work = projectBody(fs.readFileSync(path.join(root, "PROJECT.md"), "utf8")); } catch {}
  const b0 = body(base);
  if (b0 === body(canonicalRef)) theirs = theirs.filter((f) => f !== "PROJECT.md");
  if (b0 === work) mine.delete("PROJECT.md");
  const overlap = theirs.filter((f) => mine.has(f));
  let rules = [];
  try {
    const l = parseLinkage(fs.readFileSync(path.join(root, LINKAGE), "utf8"), LINKAGE);
    if (l.recognized) rules = ruleHits(l, theirs).map((r) => r.rule);
  } catch {}
  const mt = git(["merge-tree", "--write-tree", "--name-only", "--no-messages", "-z", "HEAD", canonicalRef]);
  const merge = mt.status === 0 ? "已提交的内容与主线试合并是干净的" : mt.status === 1 ? `已提交的内容与主线合并会冲突:${list([...new Set(mt.out.split("\0").filter(Boolean).slice(1))], FILES)}` : null;
  const conflict = mt.status === 1;
  if (!overlap.length && !rules.length && !conflict) return null; // 不相关:不打扰,并进主线时一起同步
  const parts = [`[一致性机制] 主线 ${canonical} 自本分支上次同步后新增 ${subjects.length} 项:${subjects.slice(0, SUBJECTS).map((s) => `「${s}」`).join("、")}${subjects.length > SUBJECTS ? ` 等 ${subjects.length} 项` : ""}。`];
  if (overlap.length) parts.push(`与本分支改过的文件有交集:${list(overlap, FILES)}。`);
  if (rules.length) parts.push(`主线改动命中联动规则:${rules.slice(0, 5).join(";")}。`);
  if (merge) parts.push(`${merge}。`);
  parts.push("要同步时运行 `node .agents/skills/wrapup/scripts/task.mjs sync`,不手抄主线的改动。");
  state.canonical_seen = canonicalHead;
  save();
  return parts.join("");
}

try {
  const text = main();
  if (text) process.stdout.write(asciiJson({ systemMessage: text, hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: text } }));
} catch {
  // 提示只是补充信息,任何意外都静默
}
process.exitCode = 0;
