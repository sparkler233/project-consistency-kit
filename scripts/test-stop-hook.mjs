#!/usr/bin/env node
// 一致性机制 version: 2026-09-27

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hook = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(sourceRoot, ".agents", "hooks", "wrapup-reminder.mjs");
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "project-consistency-hook-test-"));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || fixture,
    encoding: "utf8",
    input: options.input,
    env: options.env || process.env,
    shell: false,
    windowsHide: true,
  });
  assert.equal(result.status, 0, `${command} failed: ${result.stderr}`);
  return result.stdout;
}

function git(...args) {
  return run("git", args);
}

function invoke(session, { cwd = fixture, claude = false } = {}) {
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  if (claude) env.CLAUDE_PROJECT_DIR = fixture;
  const output = run(process.execPath, [hook], {
    cwd,
    env,
    input: JSON.stringify({ session_id: session }),
  });
  assert.equal(Buffer.byteLength(output, "utf8"), output.length, "hook JSON transport must be ASCII-safe");
  return output ? JSON.parse(output) : null;
}

try {
  git("init", "-q");
  git("config", "user.name", "Project Consistency Test");
  git("config", "user.email", "test@example.invalid");
  fs.mkdirSync(path.join(fixture, "一致性机制"), { recursive: true });
  fs.writeFileSync(path.join(fixture, "一致性机制", "文件联动目录.md"), "# fixture\n");
  fs.writeFileSync(path.join(fixture, "tracked.txt"), "clean\n");
  git("add", "-A");
  git("commit", "-qm", "fixture");
  git("tag", "synced");

  assert.equal(invoke("clean"), null, "clean repository must stay silent");

  fs.writeFileSync(path.join(fixture, "untracked.txt"), "dirty\n");
  const first = invoke("dirty-cycle");
  assert.match(first.systemMessage, /1 个文件/);
  assert.match(first.systemMessage, /\$wrapup$/);
  assert.equal("decision" in first, false, "Stop reminder must never block or continue");
  assert.equal(invoke("dirty-cycle"), null, "same dirty cycle must only remind once");

  fs.rmSync(path.join(fixture, "untracked.txt"));
  assert.equal(invoke("dirty-cycle"), null, "clean state must rearm silently");
  fs.writeFileSync(path.join(fixture, "untracked-again.txt"), "dirty again\n");
  assert.ok(invoke("dirty-cycle"), "a new dirty cycle must remind again");
  fs.rmSync(path.join(fixture, "untracked-again.txt"));

  fs.mkdirSync(path.join(fixture, "nested"));
  fs.writeFileSync(path.join(fixture, "tracked.txt"), "changed\n");
  const nested = invoke("nested", { cwd: path.join(fixture, "nested") });
  assert.match(nested.systemMessage, /\$wrapup$/);

  const claude = invoke("claude", { claude: true });
  assert.match(claude.systemMessage, /\/wrapup$/);

  git("add", "tracked.txt");
  git("commit", "-qm", "commit after synced");
  const committed = invoke("committed-after-synced");
  assert.match(committed.systemMessage, /1 个文件/);

  branchBaseline();
  process.stdout.write("test-stop-hook: all scenarios passed\n");
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}

// 分支上的基线:最近的任务检查点(带 `Task:` trailer 的提交);没有检查点时用与主线的分叉点;
// 检查点已进主线且分支已接回主线时用分叉点。主线上仍以 synced 为基线。
function branchBaseline() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "project-consistency-hook-branch-"));
  const wt = `${repo}-wt`;
  let n = 0;
  const g = (cwd, ...args) => run("git", args, { cwd }).trim();
  const remind = (cwd) => {
    const env = { ...process.env };
    delete env.CLAUDE_PROJECT_DIR;
    const out = run(process.execPath, [hook], { cwd, env, input: JSON.stringify({ session_id: `branch-${(n += 1)}` }) });
    return out ? JSON.parse(out).systemMessage : null;
  };
  const checkpoint = (msg) => g(wt, "commit", "-qam", msg, "-m", "目标:x\n进度:y\n还剩:z", "-m", "Task: 第三章");
  try {
    g(repo, "init", "-q", "-b", "main");
    g(repo, "config", "user.name", "Project Consistency Test");
    g(repo, "config", "user.email", "test@example.invalid");
    g(repo, "config", "projectConsistency.canonicalBranch", "main");
    fs.mkdirSync(path.join(repo, "一致性机制"));
    fs.writeFileSync(path.join(repo, "一致性机制", "文件联动目录.md"), "# fixture\n");
    fs.writeFileSync(path.join(repo, "第三章.md"), "第三章\n");
    fs.writeFileSync(path.join(repo, "研究问题.md"), "A\n");
    g(repo, "add", "-A");
    g(repo, "commit", "-qm", "初始");
    g(repo, "tag", "synced");
    g(repo, "worktree", "add", "-q", "-b", "agent/第三章", wt, "main");

    fs.writeFileSync(path.join(repo, "研究问题.md"), "B\n");
    g(repo, "commit", "-qam", "主线:研究问题改为 B");
    assert.match(remind(repo), /1 个文件/, "canonical: commits after synced still remind");
    assert.equal(remind(wt), null, "branch without checkpoint or changes stays silent (merge-base baseline)");

    fs.writeFileSync(path.join(wt, "第三章.md"), "第三章\n第一节\n");
    assert.match(remind(wt), /1 个文件/);
    checkpoint("第三章:第一节");
    assert.equal(remind(wt), null, "silent right after a task checkpoint");

    fs.writeFileSync(path.join(wt, "第三章.md"), "第三章\n第一节\n第二节草稿\n");
    g(wt, "commit", "-qam", "第二节草稿");
    assert.match(remind(wt), /1 个文件/, "commits after the checkpoint remind");
    fs.writeFileSync(path.join(wt, "第三章.md"), "第三章\n第一节\n第二节\n");
    checkpoint("第三章:第二节");
    assert.equal(remind(wt), null);

    g(repo, "merge", "-q", "--no-ff", "--no-edit", "agent/第三章");
    fs.writeFileSync(path.join(repo, "研究问题.md"), "C\n");
    g(repo, "commit", "-qam", "主线:研究问题改为 C");
    g(repo, "tag", "-f", "synced");
    g(wt, "merge", "-q", "main");
    assert.equal(g(wt, "rev-parse", "HEAD"), g(repo, "rev-parse", "main"), "fast-forward back to canonical");
    assert.equal(remind(wt), null, "changes brought in from canonical are not counted as unwrapped");
    fs.writeFileSync(path.join(wt, "第三章.md"), "第三章\n第一节\n第二节\n第三节\n");
    assert.match(remind(wt), /1 个文件/, "new changes after syncing still remind");
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
    fs.rmSync(wt, { recursive: true, force: true });
  }
}
