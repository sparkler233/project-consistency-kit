#!/usr/bin/env node
// 一致性机制 version: 2026-10-02
// synced 的操作入口:检查能否推进、按条件创建或推进本地 `refs/pck/synced` 指针(兼容旧 synced 标签)。输出 JSON。
// 另有一处推进:并行时 `task.mjs land --finish` 在主线快进到合并提交之后推进 synced(它在任务分支的 worktree 里运行,不满足这里「在主线上」的条件)。
// 用法:node synced-guard.mjs inspect   只检查,不做改动
//       node synced-guard.mjs advance   条件满足时创建或推进 synced
//       node synced-guard.mjs migrate   只迁移原位置,不推进检查边界;须在主线上运行
//       node synced-guard.mjs --help    只打印本段说明,不做任何改动;其他参数报错且不执行

import process from "node:process";
import { readSynced, writeSynced } from "./synced-ref.mjs";
import { spawnSync } from "node:child_process";

const guardUsage = "inspect  只检查,不做改动\nadvance  条件满足时创建或推进 synced\nmigrate  只迁移原位置,不推进检查边界\n--help   只打印用法\n";
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

  const refs = readSynced(repoRoot);
  const syncedRaw = refs.raw || refs.legacyRaw;
  const syncedCommit = refs.commit;
  blockers.push(...refs.blockers);

  let scopeBase = null;
  const onCanonical = Boolean(branch && canonicalBranch && branch === canonicalBranch);
  if (head && branch && canonicalValid && canonicalCommit) {
    if (onCanonical) {
      if (syncedCommit && !refs.blockers.length) {
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
    "synced_refs_disagree",
    "synced_symbolic_ref",
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
    refs,
    synced_source: refs.source,
    legacy_synced_present: Boolean(refs.legacyRaw),
    migration_command: refs.legacyRaw ? "node .agents/skills/wrapup/scripts/synced-guard.mjs migrate" : null,
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
    synced_source,
    legacy_synced_present,
    migration_command,
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
    synced_source,
    legacy_synced_present,
    migration_command,
    dirty,
    has_conflicts,
    can_advance,
    blockers,
  };
}

function advance(migrateOnly = false) {
  const before = inspectState();
  const allowed = (state) => migrateOnly
    ? Boolean(state.repo_root) && state.blockers.every(b => b === "dirty_worktree")
    : state.can_advance;
  if (!allowed(before)) { emit({ status: "blocked", ...publicState(before) }); return 3; }
  const after = inspectState(before.repo_root);
  if (before.head !== after.head || before.current_branch !== after.current_branch) {
    emit({ status:"blocked", ...publicState(after), blockers:unique([...after.blockers,"head_changed"]) }); return 3;
  }
  if (before.refs.raw!==after.refs.raw || before.refs.legacyRaw!==after.refs.legacyRaw) {
    emit({status:"blocked", ...publicState(after), blockers:["ref_race"]}); return 3;
  }
  if (!allowed(after)) { emit({status:"blocked", ...publicState(after)}); return 3; }
  if (migrateOnly && !after.synced) { emit({status:"no_synced", ...publicState(after)}); return 0; }
  if (!after.refs.legacyRaw && (migrateOnly || after.synced===after.head)) {
    emit({status:migrateOnly?"already_migrated":"already_synced", ...publicState(after)});return 0;
  }
  const update=writeSynced(after.repo_root,after.refs,migrateOnly?after.synced:after.head,`refs/heads/${after.canonical_branch}`,after.head);
  if (!update.ok) {
    emit({status:update.reason==="update_failed"?"error":"blocked",...publicState(inspectState(after.repo_root)),blockers:[update.reason],error:update.error});
    return update.reason==="update_failed"?1:3;
  }
  const status=migrateOnly || (after.synced===after.head && after.refs.legacyRaw)?"migrated":after.synced?"advanced":"created";
  emit({status,...publicState(inspectState(after.repo_root))});return 0;
}

const command = process.argv[2];
if (process.argv.length === 3 && (command === "--help" || command === "-h")) {
  process.stdout.write(`${guardUsage}`);
  process.exitCode = 0;
} else if (process.argv.length !== 3 || !["inspect", "advance", "migrate"].includes(command)) {
  emit({ status: "error", error: "usage: synced-guard.mjs inspect|advance|migrate" });
  process.exitCode = 2;
} else if (command === "inspect") {
  emit(publicState(inspectState()));
  process.exitCode = 0;
} else {
  process.exitCode = advance(command === "migrate");
}
