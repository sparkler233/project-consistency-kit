#!/usr/bin/env node
// 一致性机制 version: 2026-09-30
// Task State 回归测试(决策 85):分支检查点写入 `Task:` trailer,scope.mjs --overview 读出任务状态,经过集成周期仍能读出(决策 105 起 parallel.mjs 并入 overview)。

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scripts = path.join(kitRoot, ".agents", "skills", "wrapup", "scripts");
const decisions = path.join(scripts, "decisions.mjs");
const scope = path.join(scripts, "scope.mjs");
const temps = [];

function run(command, args, cwd, expected = 0) {
  const r = spawnSync(command, args, { cwd, encoding: "utf8", shell: false, windowsHide: true });
  assert.equal(r.status, expected, `${command} ${args.join(" ")} exited ${r.status}: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}
const git = (cwd, ...args) => run("git", args, cwd);
const node = (cwd, script, args = []) => JSON.parse(run(process.execPath, [script, ...args], cwd));
const project = ["# 测试项目", "", "## 关键决策", "", "### 待提交", "", "(暂无)", "", "### 最近决策", "", "- 2026-09-01:旧决策(决策 1)", ""].join("\n");
const coauthor = "Co-Authored-By: Fixture <fixture@example.invalid>";

// 按 wrapup 在分支上的做法提交一个检查点
function checkpoint(wt, file, text, title, intro, extra = []) {
  fs.writeFileSync(path.join(wt, file), text);
  const applied = node(wt, decisions, ["apply", "--title", title, "--intro", intro, "--trailer", coauthor, ...extra]);
  git(wt, "add", "-A");
  git(wt, "commit", "-q", "-F", applied.message_file);
  return applied;
}
const current = (wt) => node(wt, scope, ["--overview"]).current_branch_state;
const only = (state) => { assert.ok(state, "分支上有 current_branch_state"); return state; };

try {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "pck-task-测试-"));
  temps.push(repo);
  run("git", ["init", "-q", "-b", "main", repo]);
  git(repo, "config", "user.name", "Fixture");
  git(repo, "config", "user.email", "fixture@example.invalid");
  git(repo, "config", "core.autocrlf", "false");
  git(repo, "config", "projectConsistency.canonicalBranch", "main");
  fs.writeFileSync(path.join(repo, "PROJECT.md"), project);
  fs.writeFileSync(path.join(repo, "第三章.md"), "第三章\n");
  fs.writeFileSync(path.join(repo, "研究问题.md"), "研究问题 A\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "初始");

  const wt = path.join(path.dirname(repo), `${path.basename(repo)}-第三章`);
  temps.push(wt);
  git(repo, "worktree", "add", "-q", "-b", "agent/第三章", wt, "main");

  // 还没有检查点:没有任务状态;plan 预告任务名取分支名
  assert.equal(only(current(wt)).task, null);
  const plan = node(wt, decisions, ["plan"]);
  assert.equal(plan.branch_mode.task, "agent/第三章");
  assert.equal(plan.branch_mode.task_source, "branch_name");

  // 第一个检查点:三行说明 + Task trailer(与其他 trailer 同在最后一段)
  const intro = "目标:让第三章与新的研究问题一致\n进度:结构调整完成\n还剩:重写第二节";
  const first = checkpoint(wt, "第三章.md", "第三章\n结构\n", "第三章:结构调整完成", intro);
  assert.equal(first.task, "agent/第三章");
  const msg = git(wt, "log", "-1", "--format=%B");
  assert.match(msg, /\n\nTask: agent\/第三章\nCo-Authored-By: /);
  assert.equal(git(wt, "log", "-1", "--format=%(trailers:key=Task,valueonly)"), "agent/第三章");
  let t = only(current(wt)).task;
  assert.equal(t.name, "agent/第三章");
  assert.match(t.message, /还剩:重写第二节/);
  assert.deepEqual(t.commits_since_checkpoint, []);

  // 普通提交(不经 wrapup)不是检查点,但会出现在「检查点之后的提交」里
  fs.writeFileSync(path.join(wt, "第三章.md"), "第三章\n结构\n第二节草稿\n");
  git(wt, "commit", "-qam", "第二节草稿");
  t = only(current(wt)).task;
  assert.equal(t.checkpoint, git(wt, "rev-parse", "HEAD~1").slice(0, 12));
  assert.deepEqual(t.commits_since_checkpoint.map((c) => c.subject), ["第二节草稿"]);

  // 第二个检查点:不传 --task 时沿用上一个检查点的任务名
  const plan2 = node(wt, decisions, ["plan"]);
  assert.equal(plan2.branch_mode.task_source, "previous_checkpoint");
  checkpoint(wt, "第三章.md", "第三章\n结构\n第二节\n", "第三章:第二节完成,可集成", "目标:同上\n进度:第二节完成\n还剩:第三节");
  t = only(current(wt)).task;
  assert.equal(t.name, "agent/第三章");
  assert.match(t.message, /进度:第二节完成/);

  // 集成周期:主线 --no-ff 合并分支、再前进;分支把主线接回来
  git(repo, "merge", "-q", "--no-ff", "--no-edit", "agent/第三章");
  fs.writeFileSync(path.join(repo, "研究问题.md"), "研究问题 B\n");
  git(repo, "commit", "-qam", "主线:研究问题改为 B");
  assert.equal(git(repo, "log", "-2", "--format=%(trailers:key=Task,valueonly)").trim(), "", "主线上的提交不带 Task");
  git(wt, "merge", "-q", "--no-edit", "main");
  assert.equal(git(wt, "rev-parse", "HEAD"), git(repo, "rev-parse", "main"), "接回主线是一次快进");
  const afterSync = only(current(wt));
  assert.equal(afterSync.behind, 0);
  assert.equal(afterSync.task.name, "agent/第三章", "快进接回主线后仍能读出本分支的任务");
  assert.match(afterSync.task.message, /进度:第二节完成/);
  assert.deepEqual(afterSync.task.commits_since_checkpoint.map((c) => c.subject),
    ["主线:研究问题改为 B", "Merge branch 'agent/第三章'"], "检查点之后的提交里能看到集成与主线的前进");
  assert.equal(node(wt, decisions, ["plan"]).branch_mode.task, "agent/第三章", "下一个检查点沿用原任务名");

  // 换任务:--task 指定新名字,之后读到的是新任务
  checkpoint(wt, "第三章.md", "第三章\n结构\n第二节\n第三节\n", "第三章:按研究问题 B 修订", "目标:按研究问题 B 修订全章\n进度:第三节完成\n还剩:通读", ["--task", "按研究问题 B 修订第三章"]);
  assert.equal(only(current(wt)).task.name, "按研究问题 B 修订第三章");
  assert.equal(node(wt, decisions, ["plan"]).branch_mode.task, "按研究问题 B 修订第三章");

  // 从集成后的主线新开分支:读不到别人的任务
  const wt2 = path.join(path.dirname(repo), `${path.basename(repo)}-文献`);
  temps.push(wt2);
  git(repo, "worktree", "add", "-q", "-b", "agent/文献", wt2, "main");
  assert.equal(only(current(wt2)).task, null);
  assert.equal(node(wt2, decisions, ["plan"]).branch_mode.task, "agent/文献");

  // 三行用选项传入(不必先跑 plan):脚本写成三行;没给的行沿用上一个检查点
  fs.writeFileSync(path.join(wt2, "文献.md"), "文献\n");
  git(wt2, "add", "-A");
  let a = node(wt2, decisions, ["apply", "--commit", "--title", "文献:列出", "--goal", "整理文献综述", "--progress", "列出 5 篇", "--remaining", "写综述"]);
  assert.equal(a.committed, true);
  assert.deepEqual(a.task_lines, ["目标:整理文献综述", "进度:列出 5 篇", "还剩:写综述"]);
  assert.match(git(wt2, "log", "-1", "--format=%B"), /^文献:列出\n\n目标:整理文献综述\n进度:列出 5 篇\n还剩:写综述\n\nTask: agent\/文献$/);
  fs.writeFileSync(path.join(wt2, "文献.md"), "文献\n综述\n");
  git(wt2, "add", "-A");
  a = node(wt2, decisions, ["apply", "--commit", "--title", "文献:写了一半", "--progress", "综述写了一半"]);
  assert.deepEqual(a.branch_mode.carried_task_lines, ["目标:整理文献综述", "还剩:写综述"]);
  assert.deepEqual(a.task_lines, ["目标:整理文献综述", "进度:综述写了一半", "还剩:写综述"], "按目标、进度、还剩排列");
  assert.equal(only(current(wt2)).task.message.split("\n\n")[1], "目标:整理文献综述\n进度:综述写了一半\n还剩:写综述");
  // 本 worktree「待提交」里的决策出现在概况里(含未提交的)
  fs.writeFileSync(path.join(wt2, "PROJECT.md"), project.replace("(暂无)", "- 2026-09-02 · 决策 2:文献只收近五年\n  - 决定:只收近五年。"));
  assert.deepEqual(node(wt2, scope, ["--overview"]).pending_decisions, ["2026-09-02 · 决策 2:文献只收近五年"]);
  git(wt2, "checkout", "--", "PROJECT.md");
  assert.deepEqual(node(wt2, scope, ["--overview"]).pending_decisions, []);

  // 在主线上:不是分支模式,提交正文里没有 Task
  const mainPlan = node(repo, decisions, ["plan"]);
  assert.equal(mainPlan.branch_mode, undefined);
  assert.doesNotMatch(mainPlan.body, /Task:/);
  // 主线概况列出全部分支,各分支的任务都能看到
  const all = node(repo, scope, ["--overview"]);
  assert.deepEqual(Object.fromEntries(all.other_branches.map((b) => [b.branch, b.task && b.task.name])), {
    "agent/文献": "agent/文献",
    "agent/第三章": "按研究问题 B 修订第三章",
  });

  console.log("task state: all checks passed");
} finally {
  for (const t of temps) fs.rmSync(t, { recursive: true, force: true });
}
