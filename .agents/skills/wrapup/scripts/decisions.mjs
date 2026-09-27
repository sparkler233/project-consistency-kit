#!/usr/bin/env node
// 一致性机制 version: 2026-09-25
// 把 PROJECT.md「待提交」的决策迁入提交正文,并维护「最近决策」。只按位置读取,不要求特定写法。
// 用法:
//   node decisions.mjs plan  [选项]   预览:要迁出的决策、提交正文、「最近决策」变化(不写文件)
//   node decisions.mjs apply [选项]   执行:改写 PROJECT.md,把完整提交说明(UTF-8)写到 .git/pck-commit-message.txt,再 `git commit -F <文件>`
//   node decisions.mjs check          提交后核对:「待提交」已清空、「最近决策」不超过上限、HEAD 正文含全部 Decision 行
// 非 canonical 分支上不迁出:plan 标出 branch_mode;apply 不改 PROJECT,只写提交说明文件(标题、说明段、trailer)。
// 分支上的提交是任务检查点:自动加 trailer `Task: <任务名>`;任务名沿用分支上最近一个检查点,没有则用分支名;
// 之后可能由别的 Session 接手或任务没做完时,用 --intro 写三行(由模型判断,脚本不检查),各以「目标:」「进度:」「还剩:」开头:目标写整个任务(不是本次会话的范围),
// 还剩写这个任务还有什么没做(做完写「无」),不写提交、集成这类收尾动作。任务名同样写整个任务,不写当前这一步。
// 撞号检查:「待提交」内重号、与「最近决策」或 git 中已迁出的编号重复,列入 collisions 与 problems。
// 选项(由模型判断后传入):
//   --supersede NEW:OLD   决策 NEW 推翻 OLD:删除 OLD 的索引行,正文加 `Supersedes: OLD`
//   --partial NEW:OLD     决策 NEW 部分调整 OLD:OLD 的索引行末尾加“(部分被决策 NEW 调整)”
//   --trailer "K: V"      追加到正文末尾 trailer 段(如 Co-Authored-By),可重复
//   --title "..."         提交标题(模型撰写);--intro "..." 可选说明段。写入提交说明文件,不经 shell 管道拼接
//   --limit N             「最近决策」上限,默认 10
//   --task "..."          分支上换了任务时指定新任务名(默认沿用上一个检查点的任务名);写整个任务,不写当前这一步

import process from "node:process";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const [cmd = "plan", ...argv] = process.argv.slice(2);
const opt = { supersede: [], partial: [], trailer: [], limit: 10, title: "", intro: "", task: "" };
for (let i = 0; i < argv.length; i += 1) {
  const k = argv[i], v = argv[i + 1];
  if (k === "--supersede" || k === "--partial") { const [n, o] = v.split(":").map(Number); opt[k.slice(2)].push({ new: n, old: o }); i += 1; }
  else if (k === "--trailer") { opt.trailer.push(v); i += 1; }
  else if (k === "--limit") { opt.limit = Number(v); i += 1; }
  else if (k === "--title" || k === "--intro" || k === "--task") { opt[k.slice(2)] = v; i += 1; }
}
// 说明段里字面的 `\n`(如 zsh 双引号不转义)按换行处理,目标 / 进度 / 还剩三行不会挤成一行
opt.intro = opt.intro.replace(/\\n/g, "\n");

function run(args) {
  const r = spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8", windowsHide: true });
  return r.status === 0 ? r.stdout : null;
}
const emit = (v) => process.stdout.write(JSON.stringify(v) + "\n");
const root = (run(["rev-parse", "--show-toplevel"]) || "").trim();
if (!root) { emit({ error: "not_a_git_repository" }); process.exit(1); }
const gitDir = path.resolve(root, (run(["rev-parse", "--git-dir"]) || ".git").trim());
const projectPath = path.join(root, "PROJECT.md");
const messagePath = path.join(gitDir, "pck-commit-message.txt");
const statePath = path.join(gitDir, "pck-decision-state.json");

function section(lines, name) {
  const start = lines.findIndex((l) => /^#{2,6}\s/.test(l) && l.includes(name));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^#{1,6}\s/.test(l));
  if (end < 0) end = lines.length;
  return { start, end };
}
const numberOf = (text) => { const m = text.match(/决策\s*(\d+)/); return m ? Number(m[1]) : null; };
const indexNumber = (line) => { const m = line.match(/[(（]决策\s*(\d+)/) || line.match(/决策\s*(\d+)/); return m ? Number(m[1]) : null; };

function parse() {
  const text = readFileSync(projectPath, "utf8");
  const lines = text.split("\n");
  const pend = section(lines, "待提交"), recent = section(lines, "最近决策");
  if (!pend || !recent) return { error: "section_not_found", need: ["待提交", "最近决策"] };
  const entries = [];
  for (const l of lines.slice(pend.start + 1, pend.end)) {
    if (/^[-*]\s/.test(l)) entries.push([l]);
    else if (entries.length && (/^\s+\S/.test(l) || l === "")) entries[entries.length - 1].push(l);
  }
  const pending = entries.map((e) => {
    while (e.length && e[e.length - 1] === "") e.pop();
    const first = e[0].replace(/^[-*]\s+/, "");
    const number = numberOf(first);
    const date = (first.match(/\d{4}-\d{2}-\d{2}/) || [""])[0];
    const after = first.match(/决策\s*\d+\s*[:：·]?\s*(.*)$/);
    const title = (after && after[1].trim()) || first.replace(date, "").replace(/^[\s·:：-]+/, "");
    const body = e.slice(1).map((l) => l.replace(/^\s+[-*]\s+/, "  ").replace(/^\s+/, "  "));
    const mentions = [...e.join("\n").matchAll(/决策\s*(\d+)/g)].map((m) => Number(m[1])).filter((n) => n !== number);
    return { number, date, title, body, mentions: [...new Set(mentions)] };
  });
  const recentLines = lines.slice(recent.start + 1, recent.end).filter((l) => /^[-*]\s/.test(l));
  return { text, lines, pend, recent, pending, recentLines };
}

function branchMode() {
  const canonical = (run(["config", "--local", "--get", "projectConsistency.canonicalBranch"]) || "").trim();
  const branch = (run(["symbolic-ref", "--quiet", "--short", "HEAD"]) || "").trim();
  return canonical && branch && branch !== canonical ? { branch, canonical } : null;
}
const mode = branchMode();

// 分支上最近一个检查点的任务名:先查分支的 reflog,没有再沿分支的提交线(first-parent)往回找带 `Task:` trailer 的提交
function lastTask() {
  const find = (walk) => (run(["log", ...walk, "-n", "200", "--format=%(trailers:key=Task,valueonly,separator=%x2C)"]) || "")
    .split("\n").map((l) => l.trim()).find(Boolean) || null;
  return find(["-g", `refs/heads/${mode.branch}`]) || find(["--first-parent", "HEAD"]);
}
const task = mode ? (opt.task.trim() || lastTask() || mode.branch) : null;

function mentionFiles(n) {
  const re = `决策[[:space:]]*([0-9]+[[:space:]]*(、|,|，|/|和)[[:space:]]*)*${n}([^0-9]|$)`;
  const out = run(["-c", "core.quotepath=false", "grep", "-l", "--untracked", "-E", re]);
  return out ? out.split("\n").filter(Boolean) : [];
}

function collisions(p) {
  const count = new Map();
  for (const d of p.pending) if (d.number !== null) count.set(d.number, (count.get(d.number) || 0) + 1);
  const recentNums = new Set(p.recentLines.map(indexNumber));
  const out = [];
  for (const [n, c] of count) {
    const reasons = [];
    if (c > 1) reasons.push(`「待提交」中有 ${c} 条`);
    if (recentNums.has(n)) reasons.push("「最近决策」已有此编号");
    else if (hasFullText(n)) reasons.push("git 中已有此编号迁出的全文");
    if (reasons.length) out.push({ number: n, reasons, files: mentionFiles(n) });
  }
  return out;
}

function hasFullText(n) {
  const out = run(["log", "--all", "-E", `--grep=^Decision: ${n}$`, "--format=%H", "-n", "1"]);
  return Boolean(out && out.trim());
}
const ranges = (nums) => {
  const s = [...new Set(nums)].sort((a, b) => a - b), out = [];
  for (let i = 0; i < s.length; i += 1) { let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j += 1; out.push(i === j ? `${s[i]}` : `${s[i]}-${s[j]}`); i = j; }
  return out.join(",");
};

function compute(p) {
  const problems = p.pending.filter((d) => d.number === null).map((d) => `无法从第一行认出决策编号:${d.title}`);
  const clash = collisions(p);
  for (const c of clash) problems.push(`决策 ${c.number} 撞号:${c.reasons.join(";")}`);
  if (mode) {
    return {
      branch_mode: { ...mode, task, task_source: opt.task.trim() ? "option" : lastTask() ? "previous_checkpoint" : "branch_name", note: "非 canonical 分支:决策留在「待提交」随检查点提交,合并回 canonical 后再迁出;本次提交是任务检查点" },
      pending: p.pending.map(({ number, date, title }) => ({ number, date, title })),
      collisions: clash,
      problems,
      body: [`Task: ${task}`, ...opt.trailer].join("\n") + "\n",
      recent: p.recentLines,
    };
  }
  let recent = p.recentLines.slice();
  const dropped = [];
  for (const { new: n, old } of opt.supersede) {
    const i = recent.findIndex((l) => indexNumber(l) === old);
    if (i >= 0) dropped.push({ line: recent.splice(i, 1)[0], number: old, reason: `被决策 ${n} 推翻` });
    else problems.push(`--supersede ${n}:${old}:「最近决策」中没有决策 ${old}`);
  }
  for (const { new: n, old } of opt.partial) {
    const i = recent.findIndex((l) => indexNumber(l) === old);
    if (i >= 0) recent[i] = `${recent[i]}(部分被决策 ${n} 调整)`;
    else problems.push(`--partial ${n}:${old}:「最近决策」中没有决策 ${old}`);
  }
  const added = p.pending.map((d) => `- ${d.date ? d.date + ":" : ""}${d.title}(决策 ${d.number})`);
  recent = recent.concat(added);
  const trimmed = [];
  while (recent.length > opt.limit) { const line = recent.shift(); trimmed.push({ line, number: indexNumber(line), reason: "超过上限,删除最老行" }); }
  const removed = dropped.concat(trimmed).map((r) => ({ ...r, full_text_in_git: r.number !== null && (hasFullText(r.number) || p.pending.some((d) => d.number === r.number)) }));
  const archive = removed.filter((r) => !r.full_text_in_git);

  const recentBefore = new Set(p.recentLines.map(indexNumber));
  const mentions = p.pending.flatMap((d) => d.mentions.filter((m) => recentBefore.has(m)).map((m) => ({ new: d.number, old: m, line: p.recentLines.find((l) => indexNumber(l) === m) })));
  const handled = new Set([...opt.supersede, ...opt.partial].map((x) => `${x.new}:${x.old}`));
  const undecided = mentions.filter((m) => !handled.has(`${m.new}:${m.old}`));

  const blocks = p.pending.map((d) => [`决策 ${d.number} · ${d.date} · ${d.title}`, ...d.body].join("\n"));
  if (archive.length) blocks.push(["移出「最近决策」的旧行(逐字;这些决策在 git 中没有全文):", "", ...archive.map((r) => r.line)].join("\n"));
  const trailers = [
    ...p.pending.map((d) => `Decision: ${d.number}`),
    ...opt.supersede.map((x) => `Supersedes: ${x.old}`),
    ...(archive.length ? [`Decision-Archive: ${ranges(archive.map((r) => r.number).filter((n) => n !== null)) || "无编号"}`] : []),
    ...opt.trailer,
  ];
  const body = [...blocks, trailers.join("\n")].filter(Boolean).join("\n\n") + "\n";
  const numbers = p.pending.map((d) => d.number);
  return {
    pending: p.pending.map(({ number, date, title }) => ({ number, date, title })),
    title_tag: numbers.length ? `〔决策 ${numbers.join("/")}〕` : null,
    recent_count_before: p.recentLines.length,
    recent_count_after: recent.length,
    limit: opt.limit,
    added,
    removed,
    mentions_undecided: undecided,
    collisions: clash,
    problems,
    body,
    recent,
  };
}

function writeProject(p, r) {
  const lines = p.lines.slice();
  const pendBlock = ["", "(暂无)", ""], recentBlock = ["", ...r.recent, ""];
  const edits = [
    { start: p.pend.start + 1, end: p.pend.end, block: pendBlock },
    { start: p.recent.start + 1, end: p.recent.end, block: recentBlock },
  ].sort((a, b) => b.start - a.start);
  for (const e of edits) lines.splice(e.start, e.end - e.start, ...e.block);
  writeFileSync(projectPath, lines.join("\n").replace(/\n{3,}/g, "\n\n"));
}

const p = parse();
if (p.error) { emit(p); process.exit(1); }

if (cmd === "plan" || cmd === "apply") {
  const r = compute(p);
  if (cmd === "apply") {
    if (r.problems.length) { emit({ applied: false, problems: r.problems, collisions: r.collisions }); process.exit(1); }
    if (mode) {
      writeFileSync(messagePath, [opt.title, opt.intro, r.body].filter(Boolean).join("\n\n"));
      writeFileSync(statePath, JSON.stringify({ numbers: [], limit: opt.limit, branch_mode: true }));
      emit({ applied: false, branch_mode: r.branch_mode, message_file: messagePath, has_title: Boolean(opt.title), pending_kept: r.pending.length, task });
      process.exit(0);
    }
    writeProject(p, r);
    writeFileSync(messagePath, [opt.title, opt.intro, r.body].filter(Boolean).join("\n\n"));
    writeFileSync(statePath, JSON.stringify({ numbers: r.pending.map((d) => d.number), limit: opt.limit }));
    const after = parse();
    emit({ applied: true, message_file: messagePath, has_title: Boolean(opt.title), pending_left: after.pending.length, recent_count: after.recentLines.length, limit: opt.limit, removed: r.removed.map((x) => x.line), added: r.added, title_tag: r.title_tag });
  } else {
    const { recent, ...shown } = r;
    emit(shown);
  }
} else if (cmd === "check") {
  let state = { numbers: [], limit: opt.limit };
  try { state = JSON.parse(readFileSync(statePath, "utf8")); } catch {}
  const msg = run(["log", "-1", "--format=%B"]) || "";
  const missing = state.numbers.filter((n) => !new RegExp(`^Decision: ${n}$`, "m").test(msg));
  const problems = [];
  if (p.pending.length && !state.branch_mode) problems.push(`「待提交」仍有 ${p.pending.length} 条`);
  if (p.recentLines.length > state.limit) problems.push(`「最近决策」${p.recentLines.length} 条,超过上限 ${state.limit}`);
  if (missing.length) problems.push(`HEAD 提交正文缺少 Decision 行:${missing.join(", ")}`);
  emit({ ok: problems.length === 0, recent_count: p.recentLines.length, checked_numbers: state.numbers, problems });
} else {
  emit({ error: `unknown_command: ${cmd}` });
  process.exit(1);
}
