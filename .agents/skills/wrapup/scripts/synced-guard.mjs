#!/usr/bin/env node
// 一致性机制 version: 2026-08-22

import process from "node:process";
import { spawnSync } from "node:child_process";

const canonicalConfigKey = "projectConsistency.canonicalBranch";

function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
}

function stdout(result) {
  return result.status === 0 ? result.stdout.trim() : null;
}

function asciiJson(value) {
  return JSON.stringify(value).replace(/[\u007f-\uffff]/g, (character) =>
    `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

function emit(value) {
  process.stdout.write(`${asciiJson(value)}\n`);
}

function unique(values) {
  return [...new Set(values)];
}

function inspectState(startDir = process.cwd()) {
  const rootResult = git(startDir, ["rev-parse", "--show-toplevel"]);
  const repoRoot = stdout(rootResult);
  if (!repoRoot) {
    return {
      current_branch: null,
      canonical_branch: null,
      scope_base: null,
      head: null,
      synced: null,
      dirty: false,
      has_conflicts: false,
      can_advance: false,
      blockers: ["not_git_repo"],
    };
  }

  const blockers = [];
  const head = stdout(git(repoRoot, ["rev-parse", "--verify", "HEAD^{commit}"]));
  if (!head) blockers.push("no_head");

  const branch = stdout(git(repoRoot, ["symbolic-ref", "--quiet", "--short", "HEAD"]));
  if (!branch) blockers.push("detached_head");

  const configResult = git(repoRoot, ["config", "--local", "--get", canonicalConfigKey]);
  const canonicalBranch = stdout(configResult);
  if (!canonicalBranch) blockers.push("canonical_unconfigured");

  let canonicalValid = false;
  let canonicalCommit = null;
  if (canonicalBranch) {
    canonicalValid = git(repoRoot, ["check-ref-format", "--branch", canonicalBranch]).status === 0;
    if (!canonicalValid) {
      blockers.push("invalid_canonical_branch");
    } else {
      canonicalCommit = stdout(
        git(repoRoot, ["rev-parse", "--verify", `refs/heads/${canonicalBranch}^{commit}`]),
      );
      if (!canonicalCommit) blockers.push("canonical_ref_missing");
    }
  }

  const conflictsResult = git(repoRoot, ["ls-files", "-u", "-z"]);
  const hasConflicts = conflictsResult.status !== 0 || conflictsResult.stdout.length > 0;
  if (hasConflicts) blockers.push("unmerged_paths");

  const statusResult = git(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const dirty = statusResult.status !== 0 || statusResult.stdout.length > 0;

  const syncedRaw = stdout(git(repoRoot, ["rev-parse", "-q", "--verify", "refs/tags/synced"]));
  let syncedCommit = null;
  if (syncedRaw) {
    syncedCommit = stdout(
      git(repoRoot, ["rev-parse", "-q", "--verify", "refs/tags/synced^{commit}"]),
    );
    if (!syncedCommit) blockers.push("synced_not_commit");
  }

  let scopeBase = null;
  const onCanonical = Boolean(branch && canonicalBranch && branch === canonicalBranch);
  if (head && branch && canonicalValid && canonicalCommit) {
    if (onCanonical) {
      if (syncedCommit) {
        const ancestor = git(repoRoot, ["merge-base", "--is-ancestor", syncedCommit, head]);
        if (ancestor.status === 0) {
          scopeBase = syncedCommit;
        } else {
          blockers.push("synced_not_ancestor");
        }
      }
    } else {
      blockers.push("not_canonical");
      const mergeBases = git(repoRoot, [
        "merge-base",
        "--all",
        head,
        `refs/heads/${canonicalBranch}`,
      ]);
      const candidates = mergeBases.status === 0
        ? mergeBases.stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
        : [];
      if (candidates.length === 1) {
        scopeBase = candidates[0];
      } else if (candidates.length === 0) {
        blockers.push("no_merge_base");
      } else {
        blockers.push("ambiguous_merge_base");
      }
    }
  }

  if (onCanonical && syncedRaw && dirty) blockers.push("dirty_worktree");

  const advanceBlockers = new Set([
    "not_git_repo",
    "no_head",
    "detached_head",
    "canonical_unconfigured",
    "invalid_canonical_branch",
    "canonical_ref_missing",
    "not_canonical",
    "unmerged_paths",
    "synced_not_commit",
    "synced_not_ancestor",
    "dirty_worktree",
  ]);
  const normalizedBlockers = unique(blockers);

  return {
    repo_root: repoRoot,
    current_branch: branch,
    canonical_branch: canonicalBranch,
    scope_base: scopeBase,
    head,
    synced: syncedCommit,
    synced_ref: syncedRaw,
    dirty,
    has_conflicts: hasConflicts,
    can_advance: !normalizedBlockers.some((blocker) => advanceBlockers.has(blocker)),
    blockers: normalizedBlockers,
  };
}

function publicState(state) {
  const {
    current_branch,
    canonical_branch,
    scope_base,
    head,
    synced,
    dirty,
    has_conflicts,
    can_advance,
    blockers,
  } = state;
  return {
    current_branch,
    canonical_branch,
    scope_base,
    head,
    synced,
    dirty,
    has_conflicts,
    can_advance,
    blockers,
  };
}

function advance() {
  const before = inspectState();
  if (!before.can_advance) {
    emit({ status: "blocked", ...publicState(before) });
    return 3;
  }

  const after = inspectState(before.repo_root);
  if (before.head !== after.head || before.current_branch !== after.current_branch) {
    emit({ status: "blocked", ...publicState(after), blockers: unique([...after.blockers, "head_changed"]) });
    return 3;
  }
  if (before.synced_ref !== after.synced_ref) {
    emit({ status: "blocked", ...publicState(after), blockers: unique([...after.blockers, "ref_race"]) });
    return 3;
  }
  if (!after.can_advance) {
    emit({ status: "blocked", ...publicState(after) });
    return 3;
  }

  if (after.synced === after.head) {
    emit({ status: "already_synced", ...publicState(after) });
    return 0;
  }

  const expectedOld = after.synced_ref || "0".repeat(after.head.length);
  const update = git(after.repo_root, [
    "update-ref",
    "--create-reflog",
    "-m",
    "Project Consistency Kit wrapup",
    "refs/tags/synced",
    after.head,
    expectedOld,
  ]);
  if (update.status !== 0) {
    const currentSynced = stdout(
      git(after.repo_root, ["rev-parse", "-q", "--verify", "refs/tags/synced"]),
    );
    if (currentSynced !== after.synced_ref) {
      emit({ status: "blocked", ...publicState(inspectState(after.repo_root)), blockers: ["ref_race"] });
      return 3;
    }
    emit({ status: "error", error: update.stderr.trim() || "git update-ref failed" });
    return 1;
  }

  const finalState = inspectState(after.repo_root);
  emit({ status: after.synced_ref ? "advanced" : "created", ...publicState(finalState) });
  return 0;
}

const command = process.argv[2];
if (process.argv.length !== 3 || !["inspect", "advance"].includes(command)) {
  emit({ status: "error", error: "usage: synced-guard.mjs inspect|advance" });
  process.exitCode = 2;
} else if (command === "inspect") {
  emit(publicState(inspectState()));
  process.exitCode = 0;
} else {
  process.exitCode = advance();
}
