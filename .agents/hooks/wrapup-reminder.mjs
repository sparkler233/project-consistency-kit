#!/usr/bin/env node
// 一致性机制 version: 2026-08-20
// Project Consistency Kit cross-platform Stop hook.
// Always fails open: it only emits one systemMessage per dirty cycle.

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

function git(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: null,
    shell: false,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout ?? Buffer.alloc(0);
}

function nulPaths(buffer) {
  if (!buffer) return [];
  return buffer
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function hasRef(repoRoot, ref) {
  return git(repoRoot, ["rev-parse", "-q", "--verify", ref]) !== null;
}

function changedFiles(repoRoot) {
  let tracked;
  if (hasRef(repoRoot, "refs/tags/synced")) {
    tracked = nulPaths(git(repoRoot, ["diff", "--name-only", "-z", "synced", "--"]));
  } else if (hasRef(repoRoot, "HEAD")) {
    tracked = nulPaths(git(repoRoot, ["diff", "--name-only", "-z", "HEAD", "--"]));
  } else {
    tracked = nulPaths(git(repoRoot, ["ls-files", "--cached", "-z"]));
  }
  const untracked = nulPaths(
    git(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"]),
  );
  return new Set([...tracked, ...untracked]);
}

function readInput() {
  try {
    const text = fs.readFileSync(0, "utf8");
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function asciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

function main() {
  const input = readInput();
  const isClaude = Boolean(process.env.CLAUDE_PROJECT_DIR);
  const startDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const rootBuffer = git(startDir, ["rev-parse", "--show-toplevel"]);
  if (!rootBuffer) return;

  const repoRoot = rootBuffer.toString("utf8").trim();
  if (!repoRoot || !fs.existsSync(path.join(repoRoot, "一致性机制", "文件联动目录.md"))) {
    return;
  }

  const session = String(input.session_id || input.sessionId || "nosession")
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .slice(0, 160);
  const projectHash = crypto.createHash("sha256").update(repoRoot).digest("hex").slice(0, 16);
  const state = path.join(
    os.tmpdir(),
    `project-consistency-reminder-${session || "nosession"}-${projectHash}`,
  );
  const count = changedFiles(repoRoot).size;

  if (count === 0) {
    try {
      fs.rmSync(state, { force: true });
    } catch {
      // Reminder state is best-effort and must never block the host.
    }
    return;
  }

  try {
    fs.writeFileSync(state, "", { flag: "wx" });
  } catch (error) {
    if (error?.code === "EEXIST") return;
    return;
  }

  const entry = isClaude ? "/wrapup" : "$wrapup";
  process.stdout.write(
    asciiJson({
      systemMessage: `⚠️ 一致性机制:${count} 个文件自上次同步后有改动,收尾前建议执行 ${entry}`,
    }),
  );
}

try {
  main();
} catch {
  // Stop hooks are reminders, not gates. Unexpected failures stay silent.
}

process.exitCode = 0;
