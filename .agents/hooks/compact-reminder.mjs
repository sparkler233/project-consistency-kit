#!/usr/bin/env node
// 一致性机制 version: 2026-10-02
// 压缩后提醒 hook:接在 SessionStart(Claude Code 与 Codex 0.158 起都在上下文压缩后以 source 为 compact 触发)。
// 只在压缩后输出,其余时候(新会话、恢复、清空)静默——新会话由 catchup 读取规则。
// 压缩可能把 catchup 时读进来的运行规则一起压掉,这里把「重读」与并行的三条重新交给模型(additionalContext);
// Codex 接线显式传 --host=codex:先给用户简短状态提示,再由 Agent 完成重读后反馈;其他接线只给模型。
// 不保存任何状态(这不是压缩前保存),不写仓库文件,不做 Git 改动;出错一律静默,不阻塞宿主,只在 Git 目录留一行失败记录。

import process from "node:process";
import { gitIn } from "../skills/wrapup/scripts/checkpoints.mjs";
import { readHookInput, traceFailure } from "../skills/wrapup/scripts/hook-trace.mjs";

// 输出只用 ASCII(中文转成 \uXXXX):Windows PowerShell 5.1 经管道转发时按系统代码页解码,非 ASCII 会被解乱
function asciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

const codex = process.argv.includes("--host=codex");

function main() {
  const input = readHookInput("compact-reminder");
  if (input.source !== "compact") return null;
  const parts = ["[一致性机制] 上下文刚被压缩:继续工作前先重读 `PROJECT.md` 与 `一致性机制/运行规则.md`;用户说「收尾」就运行 wrapup。"];
  const git = gitIn(input.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd());
  const ok = (args) => { const r = git(args); return r.status === 0 ? r.out.trim() : ""; };
  const canonical = ok(["config", "--get", "projectConsistency.canonicalBranch"]);
  const current = ok(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  if (canonical && current && current !== canonical) {
    parts.push(`本会话在任务分支 \`${current}\` 上并行工作,只守三条:主线只通过检查过的合并前进(用户说「并进主线」时按 wrapup 运行 \`node .agents/skills/wrapup/scripts/task.mjs land\`,不自己把分支合进主线);停下时把目标、进度、还剩写进分支上的检查点;只写自己的分支和 worktree,不动别人的。同步主线用 \`task.mjs sync\`,不手抄主线的改动。`);
  }
  if (codex) parts.push("完成重读后,结合保留的任务上下文简短向用户说明已恢复的背景与接下来继续的工作;有缺口如实说明,不要声称信息完整保留,无需等待确认。未完成重读时不要宣称恢复完成。");
  return parts.join("");
}

try {
  const text = main();
  if (text) {
    const output = { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } };
    if (codex) output.systemMessage = "[一致性机制] 上下文已压缩,Agent 将重新读取项目说明与运行规则。";
    process.stdout.write(asciiJson(output));
  }
} catch (error) {
  // 提醒只是补充,任何意外都静默,只留一行记录
  traceFailure("compact-reminder", error);
}
process.exitCode = 0;
