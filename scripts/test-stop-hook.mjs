#!/usr/bin/env node
// 一致性机制 version: 2026-08-22

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

  process.stdout.write("test-stop-hook: all scenarios passed\n");
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}
