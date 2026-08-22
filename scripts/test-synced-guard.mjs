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
const guard = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(sourceRoot, ".agents", "skills", "wrapup", "scripts", "synced-guard.mjs");
const fixtures = [];

function run(command, args, { cwd, expected = 0 } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
  assert.equal(
    result.status,
    expected,
    `${command} ${args.join(" ")} exited ${result.status}: ${result.stderr || result.stdout}`,
  );
  return result;
}

function git(cwd, ...args) {
  return run("git", args, { cwd }).stdout.trim();
}

function createRepo({ configure = true, tag = true } = {}) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "project-consistency-guard-test-"));
  fixtures.push(repo);
  run("git", ["init", "-q", "-b", "main", repo]);
  git(repo, "config", "user.name", "Project Consistency Test");
  git(repo, "config", "user.email", "test@example.invalid");
  fs.writeFileSync(path.join(repo, "tracked.txt"), "base\n");
  git(repo, "add", "tracked.txt");
  git(repo, "commit", "-qm", "base");
  if (configure) git(repo, "config", "--local", "projectConsistency.canonicalBranch", "main");
  if (tag) git(repo, "tag", "synced");
  return repo;
}

function invoke(repo, command, expected = 0) {
  const result = run(process.execPath, [guard, command], { cwd: repo, expected });
  assert.equal(
    Buffer.byteLength(result.stdout, "utf8"),
    result.stdout.length,
    "guard JSON transport must be ASCII-safe",
  );
  return JSON.parse(result.stdout);
}

try {
  const canonical = createRepo();
  const initialHead = git(canonical, "rev-parse", "HEAD");
  const clean = invoke(canonical, "inspect");
  assert.equal(clean.current_branch, "main");
  assert.equal(clean.canonical_branch, "main");
  assert.equal(clean.scope_base, initialHead);
  assert.equal(clean.can_advance, true);

  fs.writeFileSync(path.join(canonical, "tracked.txt"), "dirty\n");
  assert.ok(invoke(canonical, "inspect").blockers.includes("dirty_worktree"));
  assert.equal(invoke(canonical, "advance", 3).status, "blocked");
  git(canonical, "restore", "tracked.txt");

  fs.writeFileSync(path.join(canonical, "staged.txt"), "staged\n");
  git(canonical, "add", "staged.txt");
  assert.ok(invoke(canonical, "inspect").blockers.includes("dirty_worktree"));
  git(canonical, "restore", "--staged", "staged.txt");
  fs.rmSync(path.join(canonical, "staged.txt"));

  fs.writeFileSync(path.join(canonical, "untracked.txt"), "untracked\n");
  assert.ok(invoke(canonical, "inspect").blockers.includes("dirty_worktree"));
  fs.rmSync(path.join(canonical, "untracked.txt"));

  fs.writeFileSync(path.join(canonical, "tracked.txt"), "next\n");
  git(canonical, "add", "tracked.txt");
  git(canonical, "commit", "-qm", "next");
  const nextHead = git(canonical, "rev-parse", "HEAD");
  const advanced = invoke(canonical, "advance");
  assert.equal(advanced.status, "advanced");
  assert.equal(git(canonical, "rev-parse", "synced"), nextHead);
  assert.match(git(canonical, "reflog", "show", "refs/tags/synced"), /Project Consistency Kit wrapup/);
  assert.equal(invoke(canonical, "advance").status, "already_synced");

  const featureDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-consistency-feature-worktree-"));
  fixtures.push(featureDir);
  git(canonical, "worktree", "add", "-q", "-b", "feature-a", featureDir, nextHead);
  fs.writeFileSync(path.join(canonical, "main-only.txt"), "canonical moved\n");
  git(canonical, "add", "main-only.txt");
  git(canonical, "commit", "-qm", "move canonical");
  invoke(canonical, "advance");
  fs.writeFileSync(path.join(featureDir, "feature-only.txt"), "feature change\n");
  const feature = invoke(featureDir, "inspect");
  assert.equal(feature.current_branch, "feature-a");
  assert.equal(feature.scope_base, nextHead, "feature scope must stay at its merge base");
  assert.ok(feature.blockers.includes("not_canonical"));
  const tagBeforeFeatureAdvance = git(canonical, "rev-parse", "synced");
  assert.equal(invoke(featureDir, "advance", 3).status, "blocked");
  assert.equal(git(canonical, "rev-parse", "synced"), tagBeforeFeatureAdvance);

  const nested = path.join(canonical, "nested");
  fs.mkdirSync(nested);
  assert.equal(invoke(nested, "inspect").current_branch, "main");

  const unconfigured = createRepo({ configure: false });
  assert.ok(invoke(unconfigured, "inspect").blockers.includes("canonical_unconfigured"));
  assert.equal(invoke(unconfigured, "advance", 3).status, "blocked");

  const initial = createRepo({ tag: false });
  fs.writeFileSync(path.join(initial, "pending.txt"), "pending\n");
  const created = invoke(initial, "advance");
  assert.equal(created.status, "created");
  assert.equal(git(initial, "rev-parse", "synced"), git(initial, "rev-parse", "HEAD"));
  assert.equal(invoke(initial, "inspect").dirty, true, "initial baseline must not hide pending files");

  const detached = createRepo();
  git(detached, "switch", "--detach", "-q");
  assert.ok(invoke(detached, "inspect").blockers.includes("detached_head"));
  assert.equal(invoke(detached, "advance", 3).status, "blocked");

  const diverged = createRepo();
  const oldSynced = git(diverged, "rev-parse", "synced");
  git(diverged, "checkout", "-q", "--orphan", "replacement");
  git(diverged, "rm", "-q", "-f", "tracked.txt");
  fs.writeFileSync(path.join(diverged, "replacement.txt"), "replacement\n");
  git(diverged, "add", "replacement.txt");
  git(diverged, "commit", "-qm", "replacement root");
  git(diverged, "branch", "-f", "main", "HEAD");
  git(diverged, "switch", "-q", "main");
  const divergence = invoke(diverged, "inspect");
  assert.ok(divergence.blockers.includes("synced_not_ancestor"));
  assert.equal(invoke(diverged, "advance", 3).status, "blocked");
  assert.equal(git(diverged, "rev-parse", "synced"), oldSynced);

  const conflict = createRepo();
  git(conflict, "switch", "-q", "-c", "other");
  fs.writeFileSync(path.join(conflict, "tracked.txt"), "other\n");
  git(conflict, "commit", "-qam", "other");
  git(conflict, "switch", "-q", "main");
  fs.writeFileSync(path.join(conflict, "tracked.txt"), "main\n");
  git(conflict, "commit", "-qam", "main");
  run("git", ["merge", "other"], { cwd: conflict, expected: 1 });
  assert.ok(invoke(conflict, "inspect").blockers.includes("unmerged_paths"));
  assert.equal(invoke(conflict, "advance", 3).status, "blocked");

  const unrelated = createRepo();
  const unrelatedDir = fs.mkdtempSync(path.join(os.tmpdir(), "project-consistency-unrelated-worktree-"));
  fixtures.push(unrelatedDir);
  git(unrelated, "worktree", "add", "-q", "--detach", unrelatedDir);
  git(unrelatedDir, "switch", "--orphan", "unrelated");
  fs.writeFileSync(path.join(unrelatedDir, "unrelated.txt"), "unrelated\n");
  git(unrelatedDir, "add", "unrelated.txt");
  git(unrelatedDir, "commit", "-qm", "unrelated root");
  const noBase = invoke(unrelatedDir, "inspect");
  assert.ok(noBase.blockers.includes("no_merge_base"));
  assert.equal(noBase.scope_base, null);

  process.stdout.write("test-synced-guard: all scenarios passed\n");
} finally {
  for (const fixture of fixtures.reverse()) {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}
