#!/usr/bin/env node
// 一致性机制 version: 2026-10-01
// hook 自检:按本项目的实际接线(`.claude/settings.json`、`.codex/hooks.json` 或 `.codex/config.toml` 里机制的 hook 项),
// 在临时仓库里把每个 hook 跑一遍,报告哪些有输出。临时仓库复制本项目的 `.agents/` 与接线文件,造出三个 hook 都该出声的场景:
// 任务分支上有未收尾的改动(收尾提醒)、主线新增了改同一文件的提交(每轮提示)、上下文刚被压缩(压缩后提醒)。
// 只跑当前平台的接线:Codex 在 Windows 上跑 commandWindows,其他平台跑 command;另一侧注明未测。
// 只验证这套接线在干净场景里能出声,不解释真实项目里某次为什么没提示;宿主自己的 PATH(如找不到 node)也测不到。
// 不改本项目的文件;全部通过时在 Git 目录的 hook 失败记录里追加 `selfcheck ok`,之前的失败 catchup 不再报告。
// 用法:node .agents/hooks/selfcheck.mjs [--json]
// 退出码:0 全部通过;1 有失败,或没有找到机制的 hook 接线

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { leadingComments } from "../skills/wrapup/scripts/checkpoints.mjs";
import { FAILURE_LOG, failuresSinceSelfcheck, markSelfcheckOk } from "../skills/wrapup/scripts/hook-trace.mjs";

const self = fileURLToPath(import.meta.url);
const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  process.stdout.write(leadingComments(fs.readFileSync(self, "utf8")));
  process.exit(0);
}
const bad = args.filter((a) => a !== "--json");
if (bad.length) {
  process.stderr.write(`未知参数:${bad.join(" ")};node .agents/hooks/selfcheck.mjs --help 查看用法\n`);
  process.exit(2);
}
const asJson = args.includes("--json");
const root = path.resolve(path.dirname(self), "..", "..");
const windows = process.platform === "win32";

// 每个事件该接哪个 hook、输出里该有什么
const EVENTS = {
  Stop: { hook: "wrapup-reminder", field: "systemMessage", ok: (o) => typeof o.systemMessage === "string" && o.systemMessage.length > 0 },
  UserPromptSubmit: { hook: "parallel-notice", field: "additionalContext", ok: (o) => o.hookSpecificOutput?.hookEventName === "UserPromptSubmit" && Boolean(o.hookSpecificOutput.additionalContext) },
  SessionStart: { hook: "compact-reminder", field: "additionalContext", ok: (o) => o.hookSpecificOutput?.hookEventName === "SessionStart" && Boolean(o.hookSpecificOutput.additionalContext) },
};
const MECHANISM = /\.agents[\\/]+hooks[\\/]|一致性机制[\\/]+hooks[\\/]/;
const readText = (rel) => { try { return fs.readFileSync(path.join(root, rel), "utf8"); } catch { return null; } };

// ---------- 读接线 ----------

// JSON 形式(Claude Code 的 settings.json 与 Codex 的 hooks.json 结构相同):hooks.<事件>[].hooks[]
function fromJson(rel, host) {
  const text = readText(rel);
  if (text === null) return null;
  let data;
  try { data = JSON.parse(text); } catch (e) { return { host, source: rel, error: `不是合法 JSON:${e.message}` }; }
  const handlers = [];
  for (const [event, groups] of Object.entries(data?.hooks || {})) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const h of Array.isArray(group?.hooks) ? group.hooks : []) {
        const all = [h.command, ...(Array.isArray(h.args) ? h.args : []), h.commandWindows].filter(Boolean).join(" ");
        if (MECHANISM.test(all)) handlers.push({ event, command: h.command, args: h.args, commandWindows: h.commandWindows, timeout: h.timeout });
      }
    }
  }
  return { host, source: rel, handlers };
}

// Codex 的 config.toml 内联 hooks:只认安装器写的形式 [[hooks.<事件>.hooks]] 下的 command / command_windows / timeout
function tomlString(raw) {
  const v = raw.trim();
  if (v.startsWith("'")) return v.slice(1, v.indexOf("'", 1));
  if (v.startsWith('"')) {
    let out = "";
    for (let i = 1; i < v.length; i += 1) {
      const c = v[i];
      if (c === '"') return out;
      if (c !== "\\") { out += c; continue; }
      const n = v[(i += 1)];
      if (n === "u" || n === "U") { const len = n === "u" ? 4 : 8; out += String.fromCodePoint(parseInt(v.slice(i + 1, i + 1 + len), 16)); i += len; }
      else out += { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f" }[n] ?? n;
    }
  }
  return null;
}
function fromToml(rel) {
  const text = readText(rel);
  if (text === null || !/^\s*\[\[?hooks[.\]]/m.test(text)) return null;
  const handlers = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const section = line.match(/^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/);
    if (section) {
      const m = section[1].match(/^hooks\.([A-Za-z]+)\.hooks$/);
      cur = m ? { event: m[1] } : null;
      if (cur) handlers.push(cur);
      continue;
    }
    const kv = cur && line.match(/^\s*(command|command_windows|timeout)\s*=\s*(.+)$/);
    if (!kv) continue;
    if (kv[1] === "timeout") cur.timeout = Number(kv[2]);
    else cur[kv[1] === "command" ? "command" : "commandWindows"] = tomlString(kv[2]);
  }
  return { host: "Codex", source: rel, handlers: handlers.filter((h) => MECHANISM.test(`${h.command || ""} ${h.commandWindows || ""}`)) };
}

// ---------- 临时仓库 ----------

// 逐个文件复制,不用 fs.cpSync:Windows 上 Node 24 的 cpSync 遇到非 ASCII 路径(如「一致性机制」)会让进程直接崩溃
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else if (e.isFile()) fs.copyFileSync(a, b);
  }
}

function makeScratch() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pck-selfcheck-")));
  const g = (...a) => {
    const r = spawnSync("git", a, { cwd: dir, encoding: "utf8", windowsHide: true });
    if (r.status !== 0) throw new Error(`git ${a.join(" ")}:${(r.stderr || "").trim()}`);
  };
  const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
  copyDir(path.join(root, ".agents"), path.join(dir, ".agents"));
  for (const rel of [".claude/settings.json", ".codex/hooks.json", ".codex/config.toml"]) {
    if (fs.existsSync(path.join(root, rel))) { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.copyFileSync(path.join(root, rel), path.join(dir, rel)); }
  }
  if (fs.existsSync(path.join(root, "一致性机制", "hooks"))) copyDir(path.join(root, "一致性机制", "hooks"), path.join(dir, "一致性机制", "hooks"));
  write("一致性机制/文件联动目录.md", "# 文件联动目录\n");
  write("PROJECT.md", "# 自检\n");
  write("shared.txt", "base\n");
  g("init", "-q");
  g("symbolic-ref", "HEAD", "refs/heads/main");
  for (const [k, v] of [["user.name", "Selfcheck"], ["user.email", "selfcheck@example.invalid"], ["core.autocrlf", "false"],
    ["commit.gpgsign", "false"], ["tag.gpgsign", "false"], ["projectConsistency.canonicalBranch", "main"]]) g("config", k, v);
  g("add", "-A");
  g("commit", "-q", "--no-verify", "-m", "自检:起点");
  g("tag", "synced");
  g("branch", "selfcheck-task");
  write("shared.txt", "base\nmain\n");
  g("commit", "-q", "--no-verify", "-am", "自检:主线改动");
  g("checkout", "-q", "selfcheck-task");
  write("shared.txt", "base\ntask\n"); // 未提交:收尾提醒有改动可报,每轮提示与主线有交集
  return dir;
}

// ---------- 运行 ----------

const run = { id: `pck-selfcheck-${process.pid}-${Date.now().toString(36)}`, n: 0 };

function logLines(dir) {
  try { return fs.readFileSync(path.join(dir, ".git", FAILURE_LOG), "utf8").split("\n").filter(Boolean); } catch { return []; }
}

// 返回 { status: ok | fail | untested, detail }
function runHandler(scratch, host, h) {
  const spec = EVENTS[h.event];
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  let cmd, argv, shellNote = "";
  if (host === "Claude Code") {
    env.CLAUDE_PROJECT_DIR = scratch;
    if (Array.isArray(h.args)) {
      cmd = h.command;
      argv = h.args.map((a) => String(a).replace(/\$\{CLAUDE_PROJECT_DIR\}|\$CLAUDE_PROJECT_DIR\b/g, scratch));
    } else if (!windows) { cmd = "sh"; argv = ["-c", h.command]; }
    else return { status: "untested", detail: "命令字符串形式由宿主决定用哪个 shell,Windows 上未测;安装器写的是 command + args 形式" };
  } else if (windows) {
    if (!h.commandWindows) return { status: "fail", detail: "缺 commandWindows:Windows 上 Codex 没有可用的 PowerShell 接线" };
    cmd = "powershell.exe"; argv = ["-NoProfile", "-NonInteractive", "-Command", h.commandWindows]; shellNote = "commandWindows";
  } else {
    if (!h.command) return { status: "fail", detail: "缺 command" };
    cmd = "sh"; argv = ["-c", h.command]; shellNote = "command";
  }
  try { fs.rmSync(path.join(scratch, ".git", "pck-notice.json"), { force: true }); } catch {}
  const before = logLines(scratch).length;
  const input = { session_id: `${run.id}-${(run.n += 1)}`, hook_event_name: h.event, cwd: scratch, prompt: "selfcheck", source: "compact" };
  const r = spawnSync(cmd, argv, { cwd: scratch, env, input: JSON.stringify(input), encoding: "utf8", windowsHide: true,
    timeout: (Number(h.timeout) > 0 ? Number(h.timeout) : 60) * 1000 });
  const traced = logLines(scratch).slice(before).map((l) => l.split("\t").slice(3).join(" "));
  const extra = (traced.length ? `;hook 留下的失败记录:${traced.join(";")}` : "") + (r.stderr && r.stderr.trim() ? `;stderr:${r.stderr.trim().split("\n")[0].slice(0, 200)}` : "");
  const via = shellNote ? `经 ${shellNote}:` : "";
  if (r.error) return { status: "fail", detail: `${via}无法运行:${r.error.code === "ETIMEDOUT" ? "超时" : r.error.message}${extra}` };
  if (r.status !== 0) return { status: "fail", detail: `${via}退出码 ${r.status}${extra}` };
  const out = (r.stdout || "").trim();
  if (!out) return { status: "fail", detail: `${via}没有输出${extra}` };
  let parsed;
  try { parsed = JSON.parse(out); } catch { return { status: "fail", detail: `${via}输出不是合法 JSON:${out.slice(0, 120)}${extra}` }; }
  if (!spec.ok(parsed)) return { status: "fail", detail: `${via}输出里没有预期的 ${spec.field}${extra}` };
  return { status: "ok", detail: `${via}有输出(${spec.field})${extra}` };
}

function check() {
  const wirings = [fromJson(".claude/settings.json", "Claude Code"), fromJson(".codex/hooks.json", "Codex"), fromToml(".codex/config.toml")].filter(Boolean);
  const results = [];
  const add = (host, source, event, status, detail) => results.push({ host, source, event, hook: EVENTS[event]?.hook || null, status, detail });
  let scratch = null;
  try {
    for (const w of wirings) {
      if (w.error) { add(w.host, w.source, null, "fail", w.error); continue; }
      if (!w.handlers.length) continue;
      for (const event of Object.keys(EVENTS)) {
        if (!w.handlers.some((h) => h.event === event)) add(w.host, w.source, event, "fail", "未接线(安装器会接上这一项)");
      }
      for (const h of w.handlers) {
        if (!EVENTS[h.event]) { add(w.host, w.source, h.event, "untested", "自检不认识这个事件"); continue; }
        scratch ||= makeScratch();
        const r = runHandler(scratch, w.host, h);
        add(w.host, w.source, h.event, r.status, r.detail);
        if (w.host === "Codex") {
          const other = windows ? (h.command ? "command" : null) : (h.commandWindows ? "commandWindows" : null);
          if (other) add(w.host, w.source, h.event, "untested", `${other} 只在${windows ? "非 Windows 平台" : " Windows 上"}运行,本平台未测`);
        }
      }
    }
  } catch (e) {
    results.push({ host: null, source: null, event: null, hook: null, status: "fail", detail: `临时仓库准备失败:${e.message}` });
  } finally {
    if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
    try { for (const f of fs.readdirSync(os.tmpdir())) if (f.startsWith(`project-consistency-reminder-${run.id}-`)) fs.rmSync(path.join(os.tmpdir(), f), { force: true }); } catch {}
  }
  return results;
}

const results = check();
const ran = results.filter((r) => r.status !== "untested");
const passed = ran.length > 0 && ran.every((r) => r.status === "ok");
const earlier = failuresSinceSelfcheck(root);
if (passed) markSelfcheckOk(root);

if (asJson) {
  process.stdout.write(JSON.stringify({ platform: process.platform, passed, results, failures_since_last_ok: earlier }) + "\n");
} else {
  const mark = { ok: "✓", fail: "✗", untested: "·" };
  const lines = [`hook 自检:按本项目接线在临时仓库中运行(平台 ${process.platform})`];
  if (!results.length) lines.push("  ✗ 没有找到机制的 hook 接线(.claude/settings.json、.codex/hooks.json、.codex/config.toml);用安装器接线");
  for (const r of results) lines.push(`  ${mark[r.status]} ${[r.host, r.event && `${r.event}${r.hook ? ` → ${r.hook}` : ""}`].filter(Boolean).join(" · ")}:${r.detail}`);
  if (earlier) lines.push(`自上次自检通过以来,hook 留下 ${earlier.count} 条失败记录(最近:${earlier.recent.slice(-3).join(";")})${passed ? ";这次通过,catchup 不再报告它们" : ""}`);
  lines.push(passed ? "结论:全部通过" : `结论:${results.length ? `${results.filter((r) => r.status === "fail").length} 项失败` : "没有接线"},见上`);
  process.stdout.write(lines.join("\n") + "\n");
}
process.exitCode = passed ? 0 : 1;
