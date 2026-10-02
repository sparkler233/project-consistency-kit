#!/usr/bin/env node
// 一致性机制 version: 2026-10-02
// 「最近决策」按 git 整段生成(决策 81、88):索引被改坏后自动修复、推翻的决策以后都不再出现、部分调整注记持续保留、条数上限。

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const decisions = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".agents", "skills", "wrapup", "scripts", "decisions.mjs");
const repo = fs.mkdtempSync(path.join(os.tmpdir(), "pck-recent-测试-"));

function run(command, args, expected = 0) {
  const r = spawnSync(command, args, { cwd: repo, encoding: "utf8", shell: false, windowsHide: true });
  assert.equal(r.status, expected, `${command} ${args.join(" ")} exited ${r.status}: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}
const git = (...args) => run("git", args);
const node = (args, expected = 0) => JSON.parse(run(process.execPath, [decisions, ...args], expected));
const projectText = () => fs.readFileSync(path.join(repo, "PROJECT.md"), "utf8");
const recentLines = () => projectText().split("### 最近决策")[1].split("\n").filter((l) => l.startsWith("- "));
function setPending(entries) {
  const block = entries.length ? entries.join("\n") : "(暂无)";
  fs.writeFileSync(path.join(repo, "PROJECT.md"), projectText().replace(/### 待提交\n\n[\s\S]*?\n\n### 最近决策/, `### 待提交\n\n${block}\n\n### 最近决策`));
}
const entry = (n, title) => `- 2026-09-${String(n).padStart(2, "0")} · 决策 ${n}:${title}\n  - 决定:${title}。`;
// 迁出一批决策并提交(与主线 wrapup 相同:apply --commit)
function migrate(entries, extra = []) {
  setPending(entries);
  const out = node(["apply", "--title", "迁出", "--commit", ...extra]);
  assert.equal(out.committed, true, JSON.stringify(out));
  assert.equal(out.check.ok, true, JSON.stringify(out.check));
  return out;
}

try {
  git("init", "-q", "-b", "main");
  git("config", "user.name", "Fixture");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "projectConsistency.canonicalBranch", "main");
  fs.writeFileSync(path.join(repo, "PROJECT.md"), "# 测试\n\n### 待提交\n\n(暂无)\n\n### 最近决策\n\n");
  git("add", "-A");
  git("commit", "-qm", "初始");

  // 12 条决策分三次迁出:只留最近 10 条,从旧到新排列
  migrate([entry(1, "一"), entry(2, "二"), entry(3, "三"), entry(4, "四")]);
  migrate([entry(5, "五"), entry(6, "六"), entry(7, "七"), entry(8, "八")]);
  migrate([entry(9, "九"), entry(10, "十"), entry(11, "十一"), entry(12, "十二")]);
  assert.deepEqual(recentLines().map((l) => l.match(/决策 (\d+)/)[1]), ["3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
  assert.equal(recentLines()[0], "- 2026-09-03:三(决策 3)");

  // 推翻与部分调整:13 推翻 5,14 部分调整 12
  setPending([entry(13, "推翻五"), entry(14, "调整十二")]);
  const plan = node(["plan", "--supersede", "13:5", "--partial", "14:12"]);
  assert.deepEqual(plan.removed.map((r) => [r.number, r.reason]).sort(), [[3, "超出最近 10 条"], [5, "被推翻"]]);
  assert.ok(plan.removed.every((r) => r.full_text_in_git), "都有全文,不归档");
  migrate([entry(13, "推翻五"), entry(14, "调整十二")], ["--supersede", "13:5", "--partial", "14:12"]);
  assert.match(git("log", "-1", "--format=%B"), /Supersedes: 5\nAdjusts: 12 by 14/);
  let nums = recentLines().map((l) => l.match(/决策 (\d+)/)[1]);
  assert.ok(!nums.includes("5"), "被推翻的 5 不出现");
  assert.deepEqual(nums, ["4", "6", "7", "8", "9", "10", "11", "12", "13", "14"]);
  assert.ok(recentLines().includes("- 2026-09-12:十二(决策 12)(部分被决策 14 调整)"));

  // 索引被人手改坏(删行、改标题、打乱顺序):下一次提交时按 git 重新生成,恢复正确
  const broken = projectText().replace("- 2026-09-06:六(决策 6)\n", "").replace("七(决策 7)", "七改坏了(决策 7)").replace("- 2026-09-04:四(决策 4)", "- 瞎写的一行");
  fs.writeFileSync(path.join(repo, "PROJECT.md"), broken);
  git("commit", "-qam", "手改索引");
  fs.writeFileSync(path.join(repo, "其他.md"), "x\n");
  git("add", "其他.md");
  node(["apply", "--title", "普通提交", "--commit"]);
  nums = recentLines().map((l) => (l.match(/决策 (\d+)/) || [])[1]);
  assert.deepEqual(nums, ["4", "6", "7", "8", "9", "10", "11", "12", "13", "14"], "按 git 恢复");
  assert.ok(recentLines().includes("- 2026-09-07:七(决策 7)"));
  assert.ok(recentLines().includes("- 2026-09-12:十二(决策 12)(部分被决策 14 调整)"), "注记来自 git,持续保留");
  assert.ok(!recentLines().includes("- 瞎写的一行"));

  // 推翻与注记在以后的迁出中持续生效
  migrate([entry(15, "十五")]);
  nums = recentLines().map((l) => l.match(/决策 (\d+)/)[1]);
  assert.deepEqual(nums, ["6", "7", "8", "9", "10", "11", "12", "13", "14", "15"]);
  assert.ok(recentLines().includes("- 2026-09-12:十二(决策 12)(部分被决策 14 调整)"));

  // 找不到的编号:报问题,不执行
  setPending([entry(16, "十六")]);
  assert.match(node(["apply", "--supersede", "16:99", "--title", "x", "--commit"], 1).problems.join(), /都没有决策 99/);

  // 要模型处理的事列在 next 中,出现时才给:新决策提到「最近决策」里的旧决策 → 三种选项;选定后 next 消失
  setPending([`${entry(16, "十六")}\n  - 限定:沿用决策 15 的范围。`]);
  let p = node(["plan"]);
  assert.equal(p.next.length, 1);
  assert.match(p.next[0], /决策 16 提到了「最近决策」中的决策 15:推翻它加 --supersede 16:15;部分调整加 --partial 16:15;只是提到、两条都有效加 --mention 16:15/);
  p = node(["plan", "--mention", "16:15"]);
  assert.equal(p.next, undefined, "--mention 表示只是提到,不再列入 next");
  assert.doesNotMatch(p.body, /Supersedes|Adjusts/, "--mention 不加 trailer");
  // 撞号:next 给出下一个空号与提到它的文件
  setPending([entry(15, "又一个十五")]);
  p = node(["plan"]);
  assert.ok(p.problems.some((x) => /决策 15 撞号/.test(x)));
  assert.equal(p.next.length, 1, "撞号只在 next 中出现一次");
  assert.match(p.next[0], /把「待提交」里后写的那条改成决策 16\(下一个空号\)/);
  assert.match(node(["apply", "--title", "x", "--commit"], 1).next[0], /决策 16/, "apply 被拦下时同样给出 next");
  // 没有要处理的事:没有 next
  setPending([entry(16, "十六")]);
  assert.equal(node(["plan"]).next, undefined);

  console.log("recent decisions: all checks passed");
} finally {
  fs.rmSync(repo, { recursive: true, force: true });
}
