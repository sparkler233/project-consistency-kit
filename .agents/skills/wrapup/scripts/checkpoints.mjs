// 一致性机制 version: 2026-10-01
// 任务检查点的共享找法,供 scope.mjs、decisions.mjs、task.mjs 与每轮提示 hook 使用,只此一份。
// 检查点是分支上带 `Task:` trailer 的提交;合并版 wrapup 的提交另带 `Land-Checked:`(检查时依据的主线提交)。
// 先查分支的 reflog(分支先后指向过的提交;快进接回主线后仍在,新开的分支里没有别人的检查点),查不到再沿 first-parent 往回找。
// reflog 里的提交须仍在分支历史中:分支被 reset 离开旧任务后,那里的检查点不再算数。

import { spawnSync } from "node:child_process";

const WALK = 200;

export function gitIn(cwd) {
  return (args, extra = {}) => {
    const r = spawnSync("git", ["-c", "core.quotepath=false", ...args], { cwd, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024, ...extra });
    return { status: r.status, out: r.stdout || "", err: (r.stderr || "").trim() };
  };
}

// `git version` 的输出是否不低于 major.minor;认不出版本号时返回 null
export function gitAtLeast(versionText, major, minor) {
  const m = (versionText || "").match(/(\d+)\.(\d+)/);
  if (!m) return null;
  const a = Number(m[1]), b = Number(m[2]);
  return a > major || (a === major && b >= minor);
}

// 返回 { commit, value } 或 null;ref 用完整引用名,如 refs/heads/task/a
export function findCheckpoint(cwd, key, ref) {
  const git = gitIn(cwd);
  const inBranch = (h) => git(["merge-base", "--is-ancestor", h, ref]).status === 0;
  const find = (walk) => {
    const r = git(["log", ...walk, "-n", String(WALK), `--format=%H%x1f%(trailers:key=${key},valueonly,separator=%x2C)%x1e`]);
    if (r.status !== 0) return null;
    const hit = r.out.split("\x1e").map((x) => x.trim().split("\x1f")).find((x) => x[1] && x[1].trim() && inBranch(x[0]));
    return hit ? { commit: hit[0], value: hit[1].trim() } : null;
  };
  return find(["-g", ref]) || find(["--first-parent", ref]);
}

// 任务状态:任务名、检查点、检查点说明全文、之后的提交(first-parent,{ hash, subject },与 scope.mjs 其他提交列表同格式)
export function taskState(cwd, ref) {
  const hit = findCheckpoint(cwd, "Task", ref);
  if (!hit) return null;
  const git = gitIn(cwd);
  const message = git(["log", "-1", "--format=%B", hit.commit]).out.trim();
  const since = git(["log", "--first-parent", "--format=%h%x09%s", `${hit.commit}..${ref}`]).out.split("\n").filter(Boolean)
    .map((l) => { const [hash, ...rest] = l.split("\t"); return { hash, subject: rest.join("\t") }; });
  return { name: hit.value, checkpoint: hit.commit.slice(0, 12), message, commits_since_checkpoint: since };
}

// 「还剩:」一行(任务说明里的剩余工作),没有则 null
export function remainingLine(message) {
  const l = (message || "").split("\n").find((x) => /^\s*还剩\s*[:：]/.test(x));
  return l ? l.trim() : null;
}

// 检查点说明里的「目标:」「进度:」「还剩:」三行,没有则空数组;自动检查点沿用它们
export function taskLines(message) {
  return (message || "").split("\n").filter((x) => /^\s*(目标|进度|还剩)\s*[:：]/.test(x)).map((x) => x.trim());
}

// 某个提交里 PROJECT.md「待提交」区的决策首行(还没进主线的决策),读不到则空数组
export function pendingDecisions(cwd, rev) {
  const r = gitIn(cwd)(["show", `${rev}:PROJECT.md`]);
  return r.status === 0 ? pendingIn(r.out) : [];
}

// PROJECT.md 文字中「待提交」区的决策首行
export function pendingIn(text) {
  const out = [];
  let inPending = false;
  for (const l of (text || "").split("\n")) {
    if (/^#{2,6}\s/.test(l)) inPending = /^#{2,6}\s*待提交/.test(l);
    else if (inPending && /^[-*]\s.*决策\s*\d+/.test(l)) out.push(l.replace(/^[-*]\s+/, "").trim());
  }
  return out;
}

// PROJECT.md 去掉「待提交」与「最近决策」两段内容后的文字:这两段随迁出或按 git 生成而变,不算人写的改动
export function projectBody(text) {
  if (text === null || text === undefined) return null;
  const keep = [];
  let skip = false;
  for (const l of text.split("\n")) {
    if (/^#{1,6}\s/.test(l)) skip = /^#{2,6}\s*(最近决策|待提交)/.test(l);
    if (!skip || /^#{1,6}\s/.test(l)) keep.push(l);
  }
  return keep.join("\n");
}

// --help 只打印文件开头连续的注释块(第一行 shebang 之后),不带实现注释
export function leadingComments(fileText) {
  const out = [];
  for (const l of fileText.split("\n").slice(fileText.startsWith("#!") ? 1 : 0)) {
    if (!l.startsWith("//")) break;
    out.push(l.replace(/^\/\/ ?/, ""));
  }
  return out.join("\n") + "\n";
}
