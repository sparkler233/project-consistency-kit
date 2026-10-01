// 一致性机制 version: 2026-10-01
// hook 失败留痕,供三个 hook、自检命令与 scope.mjs 使用,只此一份。
// hook 照旧失败时静默放行,只在 Git 公共目录(各 worktree 共用)的 pck-hook-failures.log 追加一行:
// 时间、hook、宿主、简短原因,以制表符分隔。正常的静默(没什么可提醒)不算失败。
// 自检通过时追加一行 `selfcheck ok`;只报告最近一次 ok 之后的失败。日志超过 KEEP 行时只留最后 KEEP 行。
// 留痕本身出错也静默:hook 不能因为写日志而失败。

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

export const FAILURE_LOG = "pck-hook-failures.log";
const KEEP = 100, REASON_MAX = 200;

const startDir = () => process.env.CLAUDE_PROJECT_DIR || process.cwd();
const host = () => (process.env.CLAUDE_PROJECT_DIR ? "claude" : "codex");

// Git 公共目录下的日志路径;不在 Git 仓库里时为 null
export function failureLogPath(cwd = startDir()) {
  const r = spawnSync("git", ["rev-parse", "--git-common-dir"], { cwd, encoding: "utf8", windowsHide: true });
  const dir = r.status === 0 ? r.stdout.trim() : "";
  return dir ? path.join(path.resolve(cwd, dir), FAILURE_LOG) : null;
}

function append(line, cwd) {
  try {
    const log = failureLogPath(cwd);
    if (!log) return;
    fs.appendFileSync(log, line + "\n");
    const all = fs.readFileSync(log, "utf8").split("\n").filter(Boolean);
    if (all.length > KEEP) fs.writeFileSync(log, all.slice(-KEEP).join("\n") + "\n");
  } catch {
    // 留痕只是补充,写不了也不影响 hook
  }
}

const oneLine = (s) => String(s).replace(/\s+/g, " ").trim().slice(0, REASON_MAX);

// reason 可以是 Error 或文字
export function traceFailure(hook, reason, cwd = startDir()) {
  const text = reason instanceof Error ? `${reason.name}: ${reason.message}` : reason;
  append([new Date().toISOString(), hook, host(), oneLine(text)].join("\t"), cwd);
}

export function markSelfcheckOk(cwd) {
  append([new Date().toISOString(), "selfcheck", "-", "ok"].join("\t"), cwd);
}

// 最近一次 `selfcheck ok` 之后的失败:{ count, recent }(recent 为最后几行);没有则 null
export function failuresSinceSelfcheck(cwd, recent = 5) {
  let lines;
  try { lines = fs.readFileSync(failureLogPath(cwd), "utf8").split("\n").filter(Boolean); } catch { return null; }
  let ok = lines.length - 1;
  while (ok >= 0 && lines[ok].split("\t")[1] !== "selfcheck") ok -= 1;
  const after = lines.slice(ok + 1);
  return after.length ? { count: after.length, recent: after.slice(-recent).map((l) => l.replace(/\t/g, " ")) } : null;
}

// 读宿主传来的输入:总是一个 JSON 对象,从第一个 { 读起(PowerShell 转发时开头可能多出 BOM,或按错的编码解出的 BOM 字符)。
// 没有输入时返回 {};有输入却解析不出时也返回 {},并留痕(只记长度与开头几个字符的码位,不记内容)
export function readHookInput(hook) {
  let text;
  try { text = fs.readFileSync(0, "utf8"); } catch (e) { traceFailure(hook, `stdin unreadable: ${e.code || e.message}`); return {}; }
  if (!text.trim()) return {};
  const start = text.indexOf("{");
  try {
    if (start >= 0) return JSON.parse(text.slice(start));
  } catch {}
  const head = [...text.slice(0, 3)].map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`).join(" ");
  traceFailure(hook, `input is not JSON (${text.length} chars, starts ${head})`);
  return {};
}
