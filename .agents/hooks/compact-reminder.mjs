#!/usr/bin/env node
// 一致性机制 version: 2026-10-01
// 压缩后提醒 hook:接在 SessionStart(Claude Code 与 Codex 0.158 起都在上下文压缩后以 source 为 compact 触发)。
// 只在压缩后输出,其余时候(新会话、恢复、清空)静默——新会话由 catchup 读取规则。
// 压缩可能把 catchup 时读进来的运行规则一起压掉,这里把「重读」与并行的三条重新交给模型(additionalContext);
// 不保存任何状态(这不是压缩前保存),不写仓库文件,不做 Git 改动;出错一律静默,不阻塞宿主。

import fs from "node:fs";
import process from "node:process";
import { gitIn } from "../skills/wrapup/scripts/checkpoints.mjs";

// 输出只用 ASCII(中文转成 \uXXXX):Windows PowerShell 5.1 经管道转发时按系统代码页解码,非 ASCII 会被解乱(与收尾提醒相同)
function asciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

function readInput() {
  // 输入总是一个 JSON 对象,从第一个 { 读起:PowerShell 转发时开头可能多出 BOM,或按错的编码解出的 BOM 字符
  try { const t = fs.readFileSync(0, "utf8"); const i = t.indexOf("{"); return i >= 0 ? JSON.parse(t.slice(i)) : {}; } catch { return {}; }
}

function main() {
  const input = readInput();
  if (input.source !== "compact") return null;
  const parts = ["[一致性机制] 上下文刚被压缩:继续工作前先重读 `PROJECT.md` 与 `一致性机制/运行规则.md`;用户说「收尾」就运行 wrapup。"];
  const git = gitIn(input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const ok = (args) => { const r = git(args); return r.status === 0 ? r.out.trim() : ""; };
  const canonical = ok(["config", "--get", "projectConsistency.canonicalBranch"]);
  const current = ok(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (canonical && current && current !== canonical) {
    parts.push(`本会话在任务分支 \`${current}\` 上并行工作,只守三条:主线只通过检查过的合并前进(用户说「并进主线」时按 wrapup 运行 \`node .agents/skills/wrapup/scripts/task.mjs land\`,不自己把分支合进主线);停下时把目标、进度、还剩写进分支上的检查点;只写自己的分支和 worktree,不动别人的。同步主线用 \`task.mjs sync\`,不手抄主线的改动。`);
  }
  return parts.join("");
}

try {
  const text = main();
  if (text) process.stdout.write(asciiJson({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } }));
} catch {
  // 提醒只是补充,任何意外都静默
}
process.exitCode = 0;
