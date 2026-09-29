#!/usr/bin/env node
// 一致性机制 version: 2026-09-29
// 把 PROJECT.md「待提交」的决策迁入提交正文,并按 git 整段生成「最近决策」。只按位置读取,不要求特定写法。
// 「最近决策」= 本次迁出的决策 + 当前分支历史中带 `Decision:` 的提交(取正文「决策 N · 日期 · 标题」行),
// 跳过被 `Supersedes:` 推翻的,取最近 N 条;`Adjusts: 旧 by 新` 生成「(部分被决策 新 调整)」。
// 现有索引里 git 中没有全文的旧行原样保留,排在其后补足条数;被挤出或推翻时逐字写入提交正文(`Decision-Archive`)。
// 用法(--help 只打印本段说明,不做任何改动;不认识的命令或参数报错且不执行):
//   node decisions.mjs plan  [选项]   预览:要迁出的决策、提交正文、「最近决策」变化(不写文件)
//   node decisions.mjs apply [选项]   执行:迁出决策、改写 PROJECT.md,把完整提交说明(UTF-8)写到 Git 目录下的 pck-commit-message.txt;
//                                     没有要迁出的决策时不改 PROJECT,只写提交说明文件;
//                                     加 --commit 时由脚本暂存它改动的 PROJECT.md、用该文件提交并核对(其余文件由调用方先暂存)
//   node decisions.mjs check          提交后核对:「待提交」已清空、「最近决策」不超过上限、HEAD 正文含全部 Decision 行
//   node decisions.mjs regen          只按 git 历史重新生成「最近决策」,「待提交」不动(task.mjs 同步后使用)
// 非 canonical 分支上不迁出,不必先跑 plan:apply 不改 PROJECT,只写提交说明文件(标题、三行、说明段、trailer)并输出 branch_mode。
// 合并模式(--land,用户说「并进主线」时由 task.mjs land 引导):在分支上照主线的做法迁出决策、生成「最近决策」,
// 另加 `Task:` 与 `Land-Checked: <主线提交>`(检查时依据的主线);分支落后主线时拒绝,先运行 task.mjs land。
// 分支上的提交(含合并模式)是任务检查点:自动加 trailer `Task: <任务名>`;任务名沿用分支上最近一个检查点,没有则用分支名。
// 三行由 --goal / --progress / --remaining 传入(由模型判断要不要写,脚本不检查),脚本写成「目标:」「进度:」「还剩:」三行;
// 没给的行沿用上一个检查点(输出中 carried_task_lines)。目标写整个任务(不是本次会话的范围),还剩写这个任务还有什么没做(做完写「无」),
// 不写提交、合并这类收尾动作。任务名同样写整个任务,不写当前这一步。
// 「待提交」里有决策时,--commit 连同 PROJECT 一起暂存(决策随检查点提交)。
// 撞号检查:「待提交」内重号、与「最近决策」或 git 中已迁出的编号重复,列入 collisions 与 problems。
// 两个小节里认不出的内容(如编号列表、段落)列入 problems 且 apply 不执行,脚本不会删掉它;HEAD 不在分支上时同样不执行。
// 要模型判断或处理的事(新决策提到的旧决策、撞号、认不出的内容)列在输出的 next 中,处理后带上选项重跑,直到没有 next。
// 选项(由模型判断后传入):
//   --supersede NEW:OLD   决策 NEW 推翻 OLD:正文加 `Supersedes: OLD`,OLD 不再出现在「最近决策」
//   --partial NEW:OLD     决策 NEW 部分调整 OLD:正文加 `Adjusts: OLD by NEW`,OLD 的索引行末尾显示“(部分被决策 NEW 调整)”
//   --mention NEW:OLD     决策 NEW 只是提到 OLD,两者都有效:不加 trailer,只是不再列入 next
//   --trailer "K: V"      追加到正文末尾 trailer 段(如 Co-Authored-By),可重复
//   --title "..."         提交标题(模型撰写);--intro "..." 可选说明段。写入提交说明文件,不经 shell 管道拼接
//   --goal / --progress / --remaining "..."   分支上:检查点的目标、进度、还剩(见上)
//   --limit N             「最近决策」上限,默认 10
//   --task "..."          分支上换了任务时指定新任务名(默认沿用上一个检查点的任务名);写整个任务,不写当前这一步
//   --land                分支上:合并版 wrapup(见上)
//   --commit              apply 时直接提交并核对,模型不必处理提交说明文件的路径

import process from "node:process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { findCheckpoint, taskLines, leadingComments } from "./checkpoints.mjs";

const [cmd = "plan", ...argv] = process.argv.slice(2);
if (cmd === "--help" || cmd === "-h" || cmd === "help" || argv.includes("--help") || argv.includes("-h")) {
  // 用法就是文件开头的注释;只打印,不做任何改动
  process.stdout.write(leadingComments(readFileSync(fileURLToPath(import.meta.url), "utf8")));
  process.exit(0);
}
const opt = { supersede: [], partial: [], mention: [], trailer: [], limit: 10, title: "", intro: "", task: "", goal: "", progress: "", remaining: "", land: false, commit: false };
if (!["plan", "apply", "check", "regen"].includes(cmd)) {
  process.stdout.write(JSON.stringify({ error: `unknown_command: ${cmd}`, hint: "node decisions.mjs --help 查看用法" }) + "\n");
  process.exit(2);
}
const WITH_VALUE = ["--supersede","--partial","--mention","--trailer","--limit","--title","--intro","--task","--goal","--progress","--remaining"], KNOWN = [...WITH_VALUE, "--land", "--commit"];
for (let i = 0; i < argv.length; i += 1) {
  if (!KNOWN.includes(argv[i]) || (WITH_VALUE.includes(argv[i]) && argv[i + 1] === undefined)) {
    process.stdout.write(JSON.stringify({ error: `unknown_or_incomplete_option: ${argv[i]}`, hint: "node decisions.mjs --help 查看用法;未做任何改动" }) + "\n");
    process.exit(2);
  }
  if (WITH_VALUE.includes(argv[i])) i += 1;
}
const badValue = (k, v) => {
  process.stdout.write(JSON.stringify({ error: `invalid_value: ${k} ${v}`, hint: "node decisions.mjs --help 查看用法;未做任何改动" }) + "\n");
  process.exit(2);
};
for (let i = 0; i < argv.length; i += 1) {
  const k = argv[i], v = argv[i + 1];
  if (k === "--supersede" || k === "--partial" || k === "--mention") {
    const m = v.trim().match(/^(\d+)\s*[:：]\s*(\d+)$/);
    if (!m) badValue(k, v);
    opt[k.slice(2)].push({ new: Number(m[1]), old: Number(m[2]) }); i += 1;
  }
  else if (k === "--trailer") { opt.trailer.push(v); i += 1; }
  else if (k === "--limit") { if (!/^[1-9]\d*$/.test(v.trim())) badValue(k, v); opt.limit = Number(v); i += 1; }
  else if (["--title", "--intro", "--task", "--goal", "--progress", "--remaining"].includes(k)) { opt[k.slice(2)] = v; i += 1; }
  else if (k === "--land" || k === "--commit") opt[k.slice(2)] = true;
}
// 说明段里字面的 `\n`(如 zsh 双引号不转义)按换行处理;三行各自的值里不留换行
opt.intro = opt.intro.replace(/\\n/g, "\n");
for (const k of ["goal", "progress", "remaining"]) opt[k] = opt[k].replace(/\\n|\s*\n\s*/g, " ").trim();

function git(args) {
  const r = spawnSync("git", args, { cwd: process.cwd(), encoding: "utf8", windowsHide: true });
  return { status: r.status, out: r.stdout || "", err: (r.stderr || "").trim() };
}
function run(args) {
  const r = git(args);
  return r.status === 0 ? r.out : null;
}
const emit = (v) => process.stdout.write(JSON.stringify(v) + "\n");
const root = (run(["rev-parse", "--show-toplevel"]) || "").trim();
if (!root) { emit({ error: "not_a_git_repository" }); process.exit(1); }
const gitDir = path.resolve(root, (run(["rev-parse", "--git-dir"]) || ".git").trim());
const projectPath = path.join(root, "PROJECT.md");
const messagePath = path.join(gitDir, "pck-commit-message.txt");
const statePath = path.join(gitDir, "pck-decision-state.json");

function section(lines, name) {
  // 优先取标题正好是该名字的小节,没有再取标题包含它的(如「待提交(拍板即写)」)
  const heading = (l) => /^#{2,6}\s/.test(l);
  let start = lines.findIndex((l) => heading(l) && l.replace(/^#+\s*/, "").trim() === name);
  if (start < 0) start = lines.findIndex((l) => heading(l) && l.includes(name));
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^#{1,6}\s/.test(l));
  if (end < 0) end = lines.length;
  return { start, end };
}
const numberOf = (text) => { const m = text.match(/决策\s*(\d+)/); return m ? Number(m[1]) : null; };
const indexNumber = (line) => { const m = line.match(/[(（]决策\s*(\d+)/) || line.match(/决策\s*(\d+)/); return m ? Number(m[1]) : null; };

// 两个小节里能认出的行:空行、占位「(暂无)」、条目行(`- ` / `* ` 开头)及其缩进的续行;其余一律算认不出
const PLACEHOLDER = /^\s*[(（]\s*暂无\s*[)）]\s*$/;
function parse() {
  let text;
  try { text = readFileSync(projectPath, "utf8"); } catch { return { error: "project_missing", path: projectPath }; }
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const pend = section(lines, "待提交"), recent = section(lines, "最近决策");
  if (!pend || !recent) return { error: "section_not_found", need: ["待提交", "最近决策"] };
  const entries = [], unrecognized = [];
  lines.slice(pend.start + 1, pend.end).forEach((l, i) => {
    if (/^[-*]\s/.test(l)) entries.push([l]);
    else if (entries.length && (/^\s+\S/.test(l) || l.trim() === "")) entries[entries.length - 1].push(l.trim() === "" ? "" : l);
    else if (l.trim() !== "" && !PLACEHOLDER.test(l)) unrecognized.push({ section: "待提交", line: pend.start + 2 + i, text: l.slice(0, 80) });
  });
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
  const recentLines = [];
  lines.slice(recent.start + 1, recent.end).forEach((l, i) => {
    if (/^[-*]\s/.test(l)) recentLines.push(l);
    else if (l.trim() !== "" && !PLACEHOLDER.test(l)) unrecognized.push({ section: "最近决策", line: recent.start + 2 + i, text: l.slice(0, 80) });
  });
  return { text, eol, lines, pend, recent, pending, recentLines, unrecognized };
}

const detached = Boolean(run(["rev-parse", "--verify", "-q", "HEAD"])) && !(run(["symbolic-ref", "--quiet", "HEAD"]) || "").trim();
function branchMode() {
  const canonical = (run(["config", "--local", "--get", "projectConsistency.canonicalBranch"]) || "").trim();
  const branch = (run(["symbolic-ref", "--quiet", "--short", "HEAD"]) || "").trim();
  return canonical && branch && branch !== canonical ? { branch, canonical } : null;
}
const mode = branchMode();

// 分支上最近一个检查点的任务名,找法见 checkpoints.mjs
function lastTask() {
  const hit = findCheckpoint(process.cwd(), "Task", `refs/heads/${mode.branch}`);
  return hit ? hit.value : null;
}
const task = mode ? (opt.task.trim() || lastTask() || mode.branch) : null;

// 检查点的三行:选项给的,加上说明段里已写的;两处都没有的行沿用上一个检查点(carried)
const LABELS = ["目标", "进度", "还剩"];
function taskBlock() {
  if (!mode) return { lines: [], carried: [] };
  const own = [[LABELS[0], opt.goal], [LABELS[1], opt.progress], [LABELS[2], opt.remaining]].filter(([, v]) => v).map(([k, v]) => `${k}:${v}`);
  const has = new Set([...own, ...taskLines(opt.intro)].map((l) => l.slice(0, 2)));
  const prev = findCheckpoint(process.cwd(), "Task", `refs/heads/${mode.branch}`);
  const carried = prev ? taskLines(run(["log", "-1", "--format=%B", prev.commit])).filter((l) => !has.has(l.slice(0, 2))) : [];
  const order = (l) => LABELS.indexOf(l.slice(0, 2));
  return { lines: [...own, ...carried].sort((a, b) => order(a) - order(b)), carried };
}
const block = taskBlock();

// 撞号时建议的空号:git 中迁出过的、「最近决策」与「待提交」里的编号之后
function freeNumber(p) {
  const used = [...(run(["log", "--all", "-E", "--grep=^Decision: [0-9]+$", "--format=%B"]) || "").matchAll(/^Decision: (\d+)$/gm)].map((m) => Number(m[1]));
  return Math.max(0, ...used, ...p.recentLines.map(indexNumber).filter((n) => n !== null), ...p.pending.map((d) => d.number).filter((n) => n !== null)) + 1;
}
// 要模型处理的事,出现时才给;处理后带上选项重跑,直到没有 next
function nextSteps(p, problems, clash, undecided = []) {
  const free = clash.length ? freeNumber(p) : 0;
  return [
    ...problems.map((x) => `先处理:${x}`),
    ...clash.map((c, i) => `决策 ${c.number} 撞号(${c.reasons.join(";")}):把「待提交」里后写的那条改成决策 ${free + i}(下一个空号),再逐个文件判断其中的「决策 ${c.number}」指哪一条、改对:${c.files.join("、") || "没有别的文件提到"}`),
    ...undecided.map((m) => `决策 ${m.new} 提到了「最近决策」中的决策 ${m.old}:推翻它加 --supersede ${m.new}:${m.old};部分调整加 --partial ${m.new}:${m.old};只是提到、两条都有效加 --mention ${m.new}:${m.old}`),
  ];
}

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
// 当前分支历史中的决策(从新到旧):正文「决策 N · 日期 · 标题」行,以及 Supersedes / Adjusts trailer
function gitDecisions() {
  const out = run(["log", "HEAD", "-E", "--grep=^Decision: [0-9]+$", "--format=%x1e%B"]) || "";
  const entries = [], superseded = new Set(), adjusts = [];
  for (const body of out.split("\x1e").slice(1)) {
    const blocks = [...body.matchAll(/^决策 (\d+) · (\d{4}-\d{2}-\d{2}) · (.+)$/gm)].map((m) => ({ number: Number(m[1]), date: m[2], title: m[3].trim() }));
    entries.push(...blocks.reverse());
    for (const m of body.matchAll(/^Supersedes:\s*(\d+)\s*$/gm)) superseded.add(Number(m[1]));
    for (const m of body.matchAll(/^Adjusts:\s*(\d+)\D+(\d+)\s*$/gm)) adjusts.push({ old: Number(m[1]), new: Number(m[2]) });
  }
  return { entries, superseded, adjusts };
}

const ranges = (nums) => {
  const s = [...new Set(nums)].sort((a, b) => a - b), out = [];
  for (let i = 0; i < s.length; i += 1) { let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j += 1; out.push(i === j ? `${s[i]}` : `${s[i]}-${s[j]}`); i = j; }
  return out.join(",");
};

function compute(p, regen = false) {
  const problems = p.pending.filter((d) => d.number === null).map((d) => `无法从第一行认出决策编号:${d.title}`);
  for (const u of p.unrecognized) problems.push(`「${u.section}」第 ${u.line} 行认不出(条目须以「- 」开头,续行缩进):${u.text}`);
  if (detached) problems.push("HEAD 不在任何分支上(detached):不迁出决策,先切回分支");
  const clash = collisions(p);
  const plain = problems.slice(); // 撞号另在 next 中给出处理办法
  for (const c of clash) problems.push(`决策 ${c.number} 撞号:${c.reasons.join(";")}`);
  if (mode && !opt.land && !regen) {
    const next = nextSteps(p, plain, clash);
    return {
      branch_mode: { ...mode, task, task_source: opt.task.trim() ? "option" : lastTask() ? "previous_checkpoint" : "branch_name", carried_task_lines: block.carried,
        note: "非 canonical 分支:决策留在「待提交」随检查点提交,并进主线时再迁出;本次提交是任务检查点,任务名见 task(换了任务时加 --task 新任务名)。三行没给的沿用上一个检查点(carried_task_lines)。PROJECT 的总体状态与阅读入口留到并进主线时由合并版 wrapup 更新,不写进「还剩」" },
      pending: p.pending.map(({ number, date, title }) => ({ number, date, title })),
      collisions: clash,
      problems,
      ...(next.length ? { next } : {}),
      body: [`Task: ${task}`, ...opt.trailer].join("\n") + "\n",
      recent: p.recentLines,
    };
  }
  let landMode = null;
  if (opt.land) {
    if (!mode) problems.push("--land 只用于分支:主线上照常收尾");
    else {
      const behind = Number((run(["rev-list", "--count", `HEAD..refs/heads/${mode.canonical}`]) || "0").trim()) || 0;
      if (behind) problems.push(`分支落后主线 ${behind} 个提交:先运行 task.mjs land(它会同步主线)`);
      landMode = { ...mode, task, checked_against: (run(["rev-parse", `refs/heads/${mode.canonical}`]) || "").trim(), carried_task_lines: block.carried,
        note: "合并版 wrapup:照主线的做法迁出决策、更新 PROJECT 状态、查联动;提交后运行 task.mjs land --finish 把主线快进到这里。这个提交会成为本分支最近的检查点:任务状态变了就用 --goal / --progress / --remaining 写新的,没给的沿用上一个检查点(carried_task_lines)" };
    }
  }
  const hist = gitDecisions();
  const superseded = new Set([...hist.superseded, ...opt.supersede.map((x) => x.old)]);
  const adjusts = [...hist.adjusts, ...opt.partial];
  const known = new Set([...hist.entries.map((e) => e.number), ...p.recentLines.map(indexNumber), ...p.pending.map((d) => d.number)]);
  for (const [flag, list] of [["supersede", opt.supersede], ["partial", opt.partial], ["mention", opt.mention]]) {
    for (const { new: n, old } of list) if (!known.has(old)) problems.push(`--${flag} ${n}:${old}:「最近决策」与 git 中都没有决策 ${old}`);
  }
  const note = (n) => adjusts.filter((a) => a.old === n).map((a) => `(部分被决策 ${a.new} 调整)`);
  const withNotes = (line, n) => note(n).reduce((l, x) => (l.includes(x) ? l : l + x), line);

  // 从新到旧:本次迁出的(越靠后越新)→ git 历史;同一编号只取最新一处
  const seen = new Set(), picked = [];
  for (const e of [...p.pending.slice().reverse(), ...hist.entries]) {
    if (e.number === null || seen.has(e.number)) continue;
    seen.add(e.number);
    if (!superseded.has(e.number)) picked.push(withNotes(`- ${e.date ? e.date + ":" : ""}${e.title}(决策 ${e.number})`, e.number));
  }
  // git 中没有全文的旧行:原样保留(按原顺序从新到旧),排在后面补足条数
  const legacy = p.recentLines.filter((l) => !seen.has(indexNumber(l))).reverse()
    .filter((l) => !superseded.has(indexNumber(l))).map((l) => withNotes(l, indexNumber(l)));
  const recent = [...picked, ...legacy].slice(0, opt.limit).reverse();

  const keptNums = new Set(recent.map(indexNumber));
  const keptText = new Set(recent);
  const removed = p.recentLines
    .filter((l) => { const n = indexNumber(l); return n === null ? !keptText.has(l) : !keptNums.has(n); })
    .map((line) => {
      const number = indexNumber(line);
      return { line, number, reason: superseded.has(number) ? "被推翻" : `超出最近 ${opt.limit} 条`,
        full_text_in_git: number !== null && (seen.has(number) || hasFullText(number)) };
    });
  const archive = removed.filter((r) => !r.full_text_in_git);
  const added = recent.filter((l) => !p.recentLines.includes(l));

  const recentBefore = new Set(p.recentLines.map(indexNumber));
  const mentions = p.pending.flatMap((d) => d.mentions.filter((m) => recentBefore.has(m)).map((m) => ({ new: d.number, old: m, line: p.recentLines.find((l) => indexNumber(l) === m) })));
  const handled = new Set([...opt.supersede, ...opt.partial, ...opt.mention].map((x) => `${x.new}:${x.old}`));
  const undecided = mentions.filter((m) => !handled.has(`${m.new}:${m.old}`));

  const blocks = p.pending.map((d) => [`决策 ${d.number} · ${d.date} · ${d.title}`, ...d.body].join("\n"));
  if (archive.length) blocks.push(["移出「最近决策」的旧行(逐字;这些决策在 git 中没有全文):", "", ...archive.map((r) => r.line)].join("\n"));
  const trailers = [
    ...p.pending.map((d) => `Decision: ${d.number}`),
    ...opt.supersede.map((x) => `Supersedes: ${x.old}`),
    ...opt.partial.map((x) => `Adjusts: ${x.old} by ${x.new}`),
    ...(archive.length ? [`Decision-Archive: ${ranges(archive.map((r) => r.number).filter((n) => n !== null)) || "无编号"}`] : []),
    ...(landMode ? [`Task: ${task}`, `Land-Checked: ${landMode.checked_against}`] : []),
    ...opt.trailer,
  ];
  const body = [...blocks, trailers.join("\n")].filter(Boolean).join("\n\n") + "\n";
  const numbers = p.pending.map((d) => d.number);
  const next = nextSteps(p, problems.filter((x) => !/撞号:/.test(x)), clash, undecided);
  return {
    ...(landMode ? { land_mode: landMode } : {}),
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
    ...(next.length ? { next } : {}),
    body,
    recent,
  };
}

// 只替换两个小节的内容,其余行原样保留;沿用文件原来的换行符;内容不变时不写文件
function writeProject(p, r, keepPending = false) {
  const lines = p.lines.slice();
  const pendBlock = ["", "(暂无)", ""], recentBlock = ["", ...(r.recent.length ? r.recent : ["(暂无)"]), ""];
  const edits = [
    ...(keepPending ? [] : [{ start: p.pend.start + 1, end: p.pend.end, block: pendBlock }]),
    { start: p.recent.start + 1, end: p.recent.end, block: recentBlock },
  ].sort((a, b) => b.start - a.start);
  for (const e of edits) lines.splice(e.start, e.end - e.start, ...e.block);
  const text = lines.join(p.eol);
  if (text === p.text) return false;
  writeFileSync(projectPath, text);
  return true;
}

function checkResult() {
  const now = parse();
  let state = { numbers: [], limit: opt.limit };
  try { state = JSON.parse(readFileSync(statePath, "utf8")); } catch {}
  const msg = run(["log", "-1", "--format=%B"]) || "";
  const missing = state.numbers.filter((n) => !new RegExp(`^Decision: ${n}$`, "m").test(msg));
  const problems = [];
  if (now.pending.length && !state.branch_mode) problems.push(`「待提交」仍有 ${now.pending.length} 条`);
  if (now.recentLines.length > state.limit) problems.push(`「最近决策」${now.recentLines.length} 条,超过上限 ${state.limit}`);
  if (missing.length) problems.push(`HEAD 提交正文缺少 Decision 行:${missing.join(", ")}`);
  return { ok: problems.length === 0, recent_count: now.recentLines.length, checked_numbers: state.numbers, problems };
}

// --commit:暂存脚本改动的 PROJECT.md,用提交说明文件提交,再核对。
// 合并模式下允许空提交:这个提交本身就是「依据哪个主线检查过」的记录(Land-Checked),改动可能都已在之前的检查点里
function commitNow(projectChanged, allowEmpty = false) {
  if (projectChanged) {
    const add = git(["add", "--", "PROJECT.md"]);
    if (add.status !== 0) return { committed: false, error: add.err || "git add PROJECT.md failed" };
  }
  const c = git(["commit", "-q", ...(allowEmpty ? ["--allow-empty"] : []), "-F", messagePath]);
  if (c.status !== 0) return { committed: false, error: c.err || (c.out || "").trim() || "git commit failed" };
  return { committed: true, commit: (run(["rev-parse", "--short", "HEAD"]) || "").trim(), check: checkResult() };
}

const p = parse();
if (p.error) { emit(p); process.exit(1); }

if (cmd === "plan" || cmd === "apply") {
  const r = compute(p);
  if (cmd === "apply") {
    if (r.problems.length) { emit({ applied: false, problems: r.problems, collisions: r.collisions, next: r.next }); process.exit(1); }
    if (mode && !opt.land) {
      writeFileSync(messagePath, [opt.title, block.lines.join("\n"), opt.intro, r.body].filter(Boolean).join("\n\n"));
      writeFileSync(statePath, JSON.stringify({ numbers: [], limit: opt.limit, branch_mode: true }));
      const out = { applied: false, branch_mode: r.branch_mode, message_file: messagePath, has_title: Boolean(opt.title), task_lines: block.lines, pending_kept: r.pending.length, task };
      if (opt.commit) Object.assign(out, commitNow(r.pending.length > 0)); // 分支上的决策留在「待提交」,随检查点一起提交
      emit(out);
      process.exit(out.committed === false ? 1 : 0);
    }
    writeProject(p, r);
    writeFileSync(messagePath, [opt.title, block.lines.join("\n"), opt.intro, r.body].filter(Boolean).join("\n\n"));
    writeFileSync(statePath, JSON.stringify({ numbers: r.pending.map((d) => d.number), limit: opt.limit }));
    const after = parse();
    const out = { applied: true, ...(r.land_mode ? { land_mode: r.land_mode } : {}), message_file: messagePath, has_title: Boolean(opt.title), pending_left: after.pending.length, recent_count: after.recentLines.length, limit: opt.limit, removed: r.removed.map((x) => x.line), added: r.added, title_tag: r.title_tag };
    if (r.land_mode && opt.commit) out.next = "提交后运行 node .agents/skills/wrapup/scripts/task.mjs land --finish";
    if (opt.commit) Object.assign(out, commitNow(after.text !== p.text, Boolean(r.land_mode)));
    emit(out);
    if (out.committed === false) process.exit(1);
  } else {
    const { recent, ...shown } = r;
    emit(shown);
  }
} else if (cmd === "check") {
  emit(checkResult());
} else if (cmd === "regen") {
  // 只按 git 历史重新生成「最近决策」:「待提交」里的决策还没迁出,不计入也不动
  const r = compute({ ...p, pending: [] }, true);
  const changed = writeProject(p, r, true);
  emit({ regenerated: changed, recent_count: r.recent.length, problems: r.problems });
} else {
  emit({ error: `unknown_command: ${cmd}` });
  process.exit(1);
}
