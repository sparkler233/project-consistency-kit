#!/usr/bin/env node
// 一致性机制 version: 2026-09-29
// 并行事实回归测试:在临时仓库里造出各种并行情形,核对 scope.mjs --overview 给出的分支与主线关系(决策 105 起 parallel.mjs 并入 overview)。

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(kitRoot, ".agents", "skills", "wrapup", "scripts", "scope.mjs");
const temps = [];

function run(command, args, cwd, expected = 0) {
  const r = spawnSync(command, args, { cwd, encoding: "utf8", shell: false, windowsHide: true });
  assert.equal(r.status, expected, `${command} ${args.join(" ")} exited ${r.status}: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}
const git = (cwd, ...args) => run("git", args, cwd);
const check = (cwd, extraEnv = {}) => JSON.parse(runWithEnv(process.execPath, [script, "--overview"], cwd, extraEnv));
const state = (cwd, extraEnv = {}) => check(cwd, extraEnv).current_branch_state;
function runWithEnv(command, args, cwd, extraEnv = {}, expected = 0) {
  const r = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    env: { ...process.env, ...extraEnv },
  });
  assert.equal(r.status, expected, `${command} ${args.join(" ")} exited ${r.status}: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}
const write = (repo, rel, text) => { fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true }); fs.writeFileSync(path.join(repo, rel), text); };
const chapter = (line2, line7) => ["第三章", line2, "三", "四", "五", "六", line7, "八", ""].join("\n");

function branchCommit(repo, branch, edit, message) {
  git(repo, "switch", "-q", "-c", branch, "main~0");
  edit();
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", message);
  git(repo, "switch", "-q", "main");
}

const linkage = [
  "# 文件联动目录", "",
  "## 项目联动规则", "",
  "### 规则 1 · 事实档案变化 → 检查引用它的章节", "",
  "**触发**:`research/fact-dossiers/` 下的档案变化。", "**动作**:检查 `book/` 中引用该档案的章节。", "",
  "### 规则 2 · 研究问题调整 → 全书", "",
  "**触发**:研究问题或论证主线调整。", "**动作**:检查各章论证。", "",
  "### 规则 3 · 外来文件 → 写摘要", "",
  "**触发**:出现 `.docx` 或 `v*` 这类外来文件。", "**动作**:写摘要。", "",
  "### 规则 4 · 交稿契约变化 → 全书", "",
  "**触发**:`交稿契约.md` 变化。", "**动作**:核对全书。", "",
  "## 添加新规则的格式", "", "```", "### 规则 N · <一句话规则名>", "", "**触发**:<什么文件>", "**动作**:<做什么>", "```", "",
].join("\n");

try {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "pck-parallel-测试-"));
  temps.push(repo);
  run("git", ["init", "-q", "-b", "main", repo]);
  git(repo, "config", "user.name", "Fixture");
  git(repo, "config", "user.email", "fixture@example.invalid");
  git(repo, "config", "core.autocrlf", "false");
  git(repo, "config", "projectConsistency.canonicalBranch", "main");
  write(repo, "一致性机制/文件联动目录.md", linkage);
  write(repo, "book/第一章.md", "第一章\n");
  write(repo, "book/第三章.md", chapter("二", "七"));
  write(repo, "research/fact-dossiers/案例A.md", "案例 A\n");
  write(repo, "research/fact-dossiers/案例B.md", "案例 B\n");
  write(repo, "交稿契约.md", "契约\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "初始");

  // 各分支都从初始提交出发
  branchCommit(repo, "agent/独立", () => write(repo, "book/第一章.md", "第一章 改\n"), "独立:改第一章");
  branchCommit(repo, "agent/第三章", () => write(repo, "book/第三章.md", chapter("B 改第二行", "七")), "第三章:改第二行");
  branchCommit(repo, "agent/同文件", () => write(repo, "book/第三章.md", chapter("二", "C 改第七行")), "同文件:改第七行");
  branchCommit(repo, "agent/已合并", () => write(repo, "附录.md", "附录\n"), "已合并:加附录");

  // 主线:合并一个分支,再改第三章第二行和事实档案 A
  git(repo, "merge", "-q", "--no-ff", "--no-edit", "agent/已合并");
  write(repo, "book/第三章.md", chapter("主线改第二行", "七"));
  write(repo, "research/fact-dossiers/案例A.md", "案例 A 修订\n");
  git(repo, "commit", "-qam", "主线:改第三章第二行与案例 A");

  const wt = (name, branch) => { const p = path.join(path.dirname(repo), `${path.basename(repo)}-${name}`); temps.push(p); git(repo, "worktree", "add", "-q", p, branch); return p; };
  const wtA = wt("独立", "agent/独立"), wtB = wt("第三章", "agent/第三章"), wtC = wt("同文件", "agent/同文件");

  // 主线概况:已合并的分支与主线本身不列入;每个分支有领先 / 落后与试合并结果
  const by = Object.fromEntries(check(repo).other_branches.map((b) => [b.branch, b]));
  assert.deepEqual(Object.keys(by).sort(), ["agent/同文件", "agent/独立", "agent/第三章"].sort());
  assert.equal(by["agent/第三章"].merge_into_canonical.status, "conflict");
  assert.equal(by["agent/同文件"].merge_into_canonical.status, "clean");

  // 完全独立:无交集、可干净合入、领先 1、落后于主线;文件不重叠但主线改了事实档案,命中规则 1
  const a = state(wtA);
  assert.equal(a.ahead, 1);
  assert.ok(a.behind >= 2);
  assert.deepEqual(a.overlap, []);
  assert.equal(a.merge_into_canonical.status, "clean");
  assert.deepEqual(a.branch_changed, ["book/第一章.md"]);
  assert.ok(a.canonical_changed.includes("附录.md"), "主线合并进来的内容也算主线的改动");
  assert.deepEqual(a.rules_hit_by_canonical.map((h) => h.rule), ["规则 1 · 事实档案变化 → 检查引用它的章节"]);
  assert.deepEqual(a.rules_hit_by_canonical[0].files, ["research/fact-dossiers/案例A.md"]);

  // 同一文件同一处:交集且冲突;同一文件不同处:有交集但能干净合入
  const b = state(wtB);
  assert.deepEqual(b.overlap, ["book/第三章.md"]);
  assert.equal(b.merge_into_canonical.status, "conflict");
  assert.deepEqual(b.merge_into_canonical.conflicts, ["book/第三章.md"]);
  const c = state(wtC);
  assert.deepEqual(c.overlap, ["book/第三章.md"]);
  assert.equal(c.merge_into_canonical.status, "clean");

  // Git < 2.38: fake only `git --version`, forwarding every other command to the real Git.
  const fakeGitDir = path.join(repo, "fake-git-bin");
  const realGit = runWithEnv("/bin/sh", ["-c", "command -v git"], repo);
  write(repo, path.join("fake-git-bin", "git"), [
    "#!/bin/sh",
    "for arg do",
    "  if [ \"$arg\" = \"version\" ] || [ \"$arg\" = \"--version\" ]; then",
    "    printf '%s\\n' 'git version 2.37.0'",
    "    exit 0",
    "  fi",
    "done",
    `exec ${JSON.stringify(realGit)} \"$@\"`,
    "",
  ].join("\n"));
  fs.chmodSync(path.join(fakeGitDir, "git"), 0o755);
  const fake = { PATH: `${fakeGitDir}${path.delimiter}${process.env.PATH || ""}` };
  assert.deepEqual(state(wtB, fake).merge_into_canonical, { status: "unavailable", reason: "git_older_than_2.38" });
  assert.ok(check(repo, fake).other_branches.every((x) => x.merge_into_canonical.status === "unavailable"));
  fs.rmSync(fakeGitDir, { recursive: true, force: true });

  // 未提交的改动不算分支的已提交改动;wrapup 的范围(scope.mjs 默认模式)含工作区改动,未提交的改动也列出命中的规则
  write(wtA, "交稿契约.md", "契约 未提交的改动\n");
  assert.deepEqual(state(wtA).branch_changed, ["book/第一章.md"]);
  const scope = JSON.parse(run(process.execPath, [script], wtA));
  const hit4 = scope.linkage.rules_hit.find((h) => h.rule.startsWith("规则 4"));
  assert.deepEqual(hit4 && hit4.files, ["交稿契约.md"]);
  assert.deepEqual(scope.linkage.rules_not_checked, ["规则 2 · 研究问题调整 → 全书", "规则 3 · 外来文件 → 写摘要"]);

  // 分支把主线接进来后:起点前移,主线已有的改动不再算作主线的新改动
  git(wtA, "checkout", "-q", "--", "交稿契约.md");
  git(wtA, "merge", "-q", "--no-edit", "main");
  const after = state(wtA);
  assert.equal(after.behind, 0);
  assert.deepEqual(after.canonical_changed, []);
  assert.deepEqual(after.rules_hit_by_canonical, []);

  // 没有联动目录:主线一侧命中为 null,不报错
  fs.rmSync(path.join(wtB, "一致性机制/文件联动目录.md"));
  assert.equal(state(wtB).rules_hit_by_canonical, null);

  // 未配置主线
  git(repo, "config", "--unset", "projectConsistency.canonicalBranch");
  assert.equal(check(repo).branches_note, "canonical_unconfigured");

  console.log("parallel facts (overview): all checks passed");
} finally {
  for (const t of temps) fs.rmSync(t, { recursive: true, force: true });
}
