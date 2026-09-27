#!/usr/bin/env node
// 一致性机制 version: 2026-09-25

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scripts = path.join(sourceRoot, ".agents", "skills", "wrapup", "scripts");
const decisions = path.join(scripts, "decisions.mjs");
const scope = path.join(scripts, "scope.mjs");
const fixtures = [];

function run(command, args, { cwd, expected = 0 } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: false, windowsHide: true });
  assert.equal(result.status, expected, `${command} ${args.join(" ")} exited ${result.status}: ${result.stderr || result.stdout}`);
  return result;
}
const git = (cwd, ...args) => run("git", args, { cwd }).stdout.trim();
const json = (cwd, script, args = [], expected = 0) => JSON.parse(run(process.execPath, [script, ...args], { cwd, expected }).stdout);

function project(pending, recent) {
  return [
    "# 测试项目", "", "## 关键决策", "", "> 说明放在这里。", "", "### 待提交", "",
    ...(pending.length ? pending : ["(暂无)"]), "", "### 最近决策", "", ...recent, "",
  ].join("\n");
}
const entry = (n, title, extra = []) => [`- 2026-09-25 · 决策 ${n}:${title}`, `  - 决定:${title}。`, ...extra].join("\n");

function createRepo(recent) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "pck-wrapup-scripts-测试-"));
  fixtures.push(repo);
  run("git", ["init", "-q", "-b", "main", repo]);
  git(repo, "config", "user.name", "Fixture");
  git(repo, "config", "user.email", "fixture@example.invalid");
  git(repo, "config", "core.autocrlf", "false");
  git(repo, "config", "projectConsistency.canonicalBranch", "main");
  fs.writeFileSync(path.join(repo, "PROJECT.md"), project([], recent));
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "初始");
  git(repo, "tag", "synced");
  return repo;
}
function setPending(repo, pending) {
  const file = path.join(repo, "PROJECT.md");
  const text = fs.readFileSync(file, "utf8").replace(/### 待提交\n\n[\s\S]*?\n\n### 最近决策/, `### 待提交\n\n${pending.join("\n")}\n\n### 最近决策`);
  fs.writeFileSync(file, text);
}
function commitApplied(repo) {
  git(repo, "add", "-A");
  run("git", ["commit", "-q", "-F", path.join(repo, ".git", "pck-commit-message.txt")], { cwd: repo });
  return json(repo, decisions, ["check"]);
}

try {
  const recent10 = Array.from({ length: 10 }, (_, i) => `- 2026-09-${String(i + 1).padStart(2, "0")}:旧决策${i + 1}(决策 ${i + 1})`);

  // 1. 迁出一条决策:删最老的行,git 中无全文的旧行逐字写入正文并加 Decision-Archive
  const repo = createRepo(recent10);
  setPending(repo, [entry(11, "报名容量改为 80", ["  - 理由:场地可容纳 80 人。"])]);
  let plan = json(repo, decisions, ["plan"]);
  assert.deepEqual(plan.problems, []);
  assert.equal(plan.recent_count_after, 10);
  assert.equal(plan.removed.length, 1);
  assert.equal(plan.removed[0].number, 1);
  assert.equal(plan.removed[0].full_text_in_git, false);
  assert.match(plan.body, /决策 11 · 2026-09-25 · 报名容量改为 80\n {2}决定:报名容量改为 80。\n {2}理由:场地可容纳 80 人。/);
  assert.match(plan.body, /- 2026-09-01:旧决策1\(决策 1\)/);
  assert.match(plan.body, /Decision: 11\nDecision-Archive: 1\n$/);
  const applied = json(repo, decisions, ["apply", "--title", "中文标题〔决策 11〕", "--trailer", "Co-Authored-By: 测试 <t@example.invalid>"]);
  assert.equal(applied.applied, true);
  assert.equal(applied.pending_left, 0);
  assert.equal(applied.recent_count, 10);
  let check = commitApplied(repo);
  assert.equal(check.ok, true, JSON.stringify(check));
  const message = git(repo, "log", "-1", "--format=%B");
  assert.match(message, /^中文标题〔决策 11〕\n/);
  assert.match(message, /Co-Authored-By: 测试 <t@example.invalid>$/);
  assert.match(fs.readFileSync(path.join(repo, "PROJECT.md"), "utf8"), /### 待提交\n\n\(暂无\)\n\n### 最近决策\n\n- 2026-09-02:旧决策2\(决策 2\)/);

  // 2. 推翻与部分调整:mentions_undecided 提示,选项生效;被推翻的行已有全文,不再存档
  setPending(repo, [entry(12, "容量改回 60,推翻决策 11"), entry(13, "报名页小改,部分调整决策 3")]);
  plan = json(repo, decisions, ["plan"]);
  assert.deepEqual(plan.mentions_undecided.map((m) => `${m.new}:${m.old}`).sort(), ["12:11", "13:3"]);
  plan = json(repo, decisions, ["plan", "--supersede", "12:11", "--partial", "13:3"]);
  assert.deepEqual(plan.mentions_undecided, []);
  const dropped = plan.removed.find((r) => r.number === 11);
  assert.equal(dropped.full_text_in_git, true);
  assert.match(plan.body, /Supersedes: 11/);
  assert.doesNotMatch(plan.body, /Decision-Archive:.*11/);
  json(repo, decisions, ["apply", "--supersede", "12:11", "--partial", "13:3", "--title", "推翻与部分调整"]);
  assert.match(fs.readFileSync(path.join(repo, "PROJECT.md"), "utf8"), /旧决策3\(决策 3\)\(部分被决策 13 调整\)/);
  check = commitApplied(repo);
  assert.equal(check.ok, true, JSON.stringify(check));

  // 3. 撞号:与已迁出的编号重复时列出提到它的文件,apply 拒绝执行
  fs.writeFileSync(path.join(repo, "笔记.md"), "按决策 4、12 做的\n");
  setPending(repo, [entry(12, "另一条也叫 12")]);
  plan = json(repo, decisions, ["plan"]);
  assert.equal(plan.collisions.length, 1);
  assert.equal(plan.collisions[0].number, 12);
  assert.ok(plan.collisions[0].files.includes("笔记.md"), JSON.stringify(plan.collisions));
  const refused = json(repo, decisions, ["apply", "--title", "x"], 1);
  assert.equal(refused.applied, false);

  // 4. 分支模式:非 canonical 分支不迁出,apply 只写提交说明文件;提交是任务检查点,说明段由模型按需填写、脚本不检查
  setPending(repo, [entry(14, "分支上的决策")]);
  git(repo, "checkout", "-qb", "feature");
  plan = json(repo, decisions, ["plan"]);
  assert.equal(plan.branch_mode.branch, "feature");
  assert.equal(plan.branch_mode.task, "feature");
  assert.equal(plan.branch_mode.task_source, "branch_name");
  const before = fs.readFileSync(path.join(repo, "PROJECT.md"), "utf8");
  assert.deepEqual(plan.problems, [], "没写说明段也不报问题");
  const branchApply = json(repo, decisions, ["apply", "--title", "分支检查点", "--intro", "目标:x\\n进度:y\\n还剩:无"]);
  assert.equal(branchApply.applied, false);
  assert.equal(branchApply.pending_kept, 1);
  assert.equal(branchApply.task, "feature");
  assert.equal(fs.readFileSync(path.join(repo, "PROJECT.md"), "utf8"), before);
  check = commitApplied(repo);
  assert.equal(check.ok, true, JSON.stringify(check));
  assert.match(git(repo, "log", "-1", "--format=%B"), /^分支检查点\n\n目标:x\n进度:y\n还剩:无\n\nTask: feature$/, "字面 \\n 按换行处理,Task 在 trailer 段");
  git(repo, "checkout", "-q", "main");

  // 5. 无编号的旧行被删时,Decision-Archive 写“无编号”
  const plain = createRepo(Array.from({ length: 10 }, (_, i) => `- 2026-08-${String(i + 1).padStart(2, "0")}:无编号的旧行${i + 1}`));
  setPending(plain, [entry(1, "第一条带编号的决策")]);
  plan = json(plain, decisions, ["plan"]);
  assert.match(plan.body, /Decision-Archive: 无编号\n$/);

  // 6. 范围脚本:基线、未跟踪文件摘要(含中文开头行)、未跟踪目录汇总、概况层字段
  const scoped = createRepo(recent10);
  fs.writeFileSync(path.join(scoped, "说明.md"), "第一行\n第二行\n第三行\n第四行\n");
  fs.mkdirSync(path.join(scoped, "素材"));
  for (let i = 0; i < 3; i += 1) fs.writeFileSync(path.join(scoped, "素材", `图${i}.txt`), "x");
  const out = json(scoped, scope);
  assert.equal(out.base, git(scoped, "rev-parse", "synced"));
  assert.equal(out.commits_since_base.length, 0);
  const file = out.worktree.untracked.find((u) => u.path === "说明.md");
  assert.deepEqual(file.head, ["第一行", "第二行", "第三行"]);
  const dir = out.worktree.untracked.find((u) => u.directory);
  assert.equal(dir.path, "素材/");
  assert.equal(dir.files, 3);
  const overview = json(scoped, scope, ["--overview"]);
  assert.equal(overview.recent_commits[0].subject, "初始");
  // 只有主线一条线:没有 current_branch_state,other_branches 与 anomalies 为空
  assert.equal(overview.current_branch_state, undefined);
  assert.deepEqual(overview.other_branches, []);
  assert.deepEqual(overview.anomalies, []);
  assert.ok(overview.top_files.includes("PROJECT.md"), JSON.stringify(overview.top_files));

  // 7. 任务状态:分支检查点由 decisions.mjs 写入,scope.mjs --overview 读出;经过集成周期仍能读出
  // 分支上不写说明段也能提交检查点,仍带 Task 标记
  git(scoped, "checkout", "-qb", "quick-fix");
  fs.writeFileSync(path.join(scoped, "说明.md"), "改一行\n");
  git(scoped, "add", "说明.md");
  const quick = json(scoped, decisions, ["apply", "--title", "小改动"]);
  git(scoped, "commit", "-q", "-F", quick.message_file);
  assert.equal(git(scoped, "log", "-1", "--format=%B"), "小改动\n\nTask: quick-fix");
  assert.equal(json(scoped, scope, ["--overview"]).current_branch_state.task.name, "quick-fix");
  git(scoped, "checkout", "-q", "main");

  const tsRepo = createRepo(recent10);
  fs.writeFileSync(path.join(tsRepo, "第三章.md"), "第三章\n");
  fs.writeFileSync(path.join(tsRepo, "研究问题.md"), "研究问题 A\n");
  git(tsRepo, "add", "-A");
  git(tsRepo, "commit", "-qm", "素材");
  const wt = `${tsRepo}-第三章`;
  fixtures.push(wt);
  git(tsRepo, "worktree", "add", "-q", "-b", "agent/第三章", wt, "main");
  const state = (cwd) => json(cwd, scope, ["--overview"]);
  const checkpoint = (file, text, title, intro, extra = []) => {
    fs.writeFileSync(path.join(wt, file), text);
    const applied = json(wt, decisions, ["apply", "--title", title, "--intro", intro, "--trailer", "Co-Authored-By: 测试 <t@example.invalid>", ...extra]);
    git(wt, "add", "-A");
    git(wt, "commit", "-q", "-F", applied.message_file); // worktree 里 .git 是文件,用 apply 给出的路径
  };

  // 还没有检查点:任务为空,与主线的关系照常给出;主线上能看到这个分支
  let cur = state(wt).current_branch_state;
  assert.equal(cur.task, null);
  assert.equal(cur.ahead, 0);
  let others = state(tsRepo).other_branches;
  assert.deepEqual(others.map((b) => [b.branch, b.worktree !== null, b.task]), [["agent/第三章", true, null]]);

  checkpoint("第三章.md", "第三章\n结构\n", "第三章:结构调整完成", "目标:让第三章与新的研究问题一致\n进度:结构调整完成\n还剩:重写第二节");
  assert.match(git(wt, "log", "-1", "--format=%B"), /\n\nTask: agent\/第三章\nCo-Authored-By: /);
  cur = state(wt).current_branch_state;
  assert.equal(cur.task.name, "agent/第三章");
  assert.match(cur.task.message, /还剩:重写第二节/);
  assert.deepEqual(cur.task.commits_since_checkpoint, []);
  assert.equal(cur.ahead, 1);
  assert.deepEqual(cur.branch_changed, ["第三章.md"]);

  // 普通提交不是检查点,但列在「检查点之后的提交」里;主线上看到任务名与「还剩」
  fs.writeFileSync(path.join(wt, "第三章.md"), "第三章\n结构\n第二节草稿\n");
  git(wt, "commit", "-qam", "第二节草稿");
  cur = state(wt).current_branch_state;
  assert.deepEqual(cur.task.commits_since_checkpoint.map((c) => c.subject), ["第二节草稿"]);
  others = state(tsRepo).other_branches;
  assert.deepEqual(others[0].task, { name: "agent/第三章", remaining: "还剩:重写第二节", commits_since_checkpoint: 1 });
  assert.equal(others[0].merge_into_canonical.status, git(tsRepo, "version").match(/2\.(\d+)/) && Number(git(tsRepo, "version").match(/2\.(\d+)/)[1]) >= 38 ? "clean" : "unavailable");

  // 主线改了同一个文件:分支上看到交集与冲突
  fs.writeFileSync(path.join(tsRepo, "第三章.md"), "第三章(主线改)\n");
  git(tsRepo, "commit", "-qam", "主线:改第三章");
  cur = state(wt).current_branch_state;
  assert.equal(cur.behind, 1);
  assert.deepEqual(cur.overlap, ["第三章.md"]);
  if (cur.merge_into_canonical.status !== "unavailable") assert.deepEqual(cur.merge_into_canonical.conflicts, ["第三章.md"]);
  git(tsRepo, "revert", "--no-edit", "HEAD");

  // 第二个检查点沿用任务名;集成周期:主线 --no-ff 合并分支、再前进,分支快进接回主线后仍能读出任务
  assert.equal(json(wt, decisions, ["plan"]).branch_mode.task_source, "previous_checkpoint");
  checkpoint("第三章.md", "第三章\n结构\n第二节\n", "第三章:第二节完成", "目标:同上\n进度:第二节完成\n还剩:第三节");
  git(tsRepo, "merge", "-q", "--no-ff", "--no-edit", "agent/第三章");
  fs.writeFileSync(path.join(tsRepo, "研究问题.md"), "研究问题 B\n");
  git(tsRepo, "commit", "-qam", "主线:研究问题改为 B");
  git(wt, "merge", "-q", "--no-edit", "main");
  assert.equal(git(wt, "rev-parse", "HEAD"), git(tsRepo, "rev-parse", "main"), "接回主线是一次快进");
  cur = state(wt).current_branch_state;
  assert.equal(cur.task.name, "agent/第三章", "快进接回主线后仍能读出本分支的任务");
  assert.match(cur.task.message, /进度:第二节完成/);
  assert.equal(cur.behind, 0);

  // 换任务用 --task;从主线新开的分支读不到别人的任务;主线上的提交不带 Task
  checkpoint("第三章.md", "第三章\n结构\n第二节\n第三节\n", "第三章:按 B 修订", "目标:按研究问题 B 修订全章\n进度:第三节完成\n还剩:通读", ["--task", "按研究问题 B 修订第三章"]);
  assert.equal(state(wt).current_branch_state.task.name, "按研究问题 B 修订第三章");
  const wt2 = `${tsRepo}-文献`;
  fixtures.push(wt2);
  git(tsRepo, "worktree", "add", "-q", "-b", "agent/文献", wt2, "main");
  assert.equal(state(wt2).current_branch_state.task, null);
  assert.equal(git(tsRepo, "log", "--first-parent", "-2", "--format=%(trailers:key=Task,valueonly)").trim(), "");
  const main = state(tsRepo);
  assert.equal(main.current_branch_state, undefined);
  assert.deepEqual(Object.fromEntries(main.other_branches.map((b) => [b.branch, b.task && b.task.name])), {
    "agent/文献": null,
    "agent/第三章": "按研究问题 B 修订第三章",
  });

  console.log("wrapup scripts tests passed");
} finally {
  for (const dir of fixtures) fs.rmSync(dir, { recursive: true, force: true });
}
