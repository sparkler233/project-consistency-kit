#!/usr/bin/env node
// 一致性机制 version: 2026-10-03
// hook 可观测性回归测试:失败留痕(输入解析不出、hook 内部异常、超过上限截断、自检通过后不再报告、scope.mjs --overview 的 hook_failures)
// 与自检命令(本套件接线全部通过;hook 抛异常、脚本缺失、少接一项、接线文件坏掉时报失败;Codex 的 config.toml 内联接线;没有接线)。
// 自检按当前平台运行:Windows 上 Codex 一侧经 commandWindows 与 PowerShell 适配器。

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const kitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const temps = [];
const LOG = "pck-hook-failures.log";

function run(command, args, cwd, { input, env, expected = 0 } = {}) {
  const r = spawnSync(command, args, { cwd, encoding: "utf8", input, env: env || process.env, windowsHide: true });
  if (expected !== null) assert.equal(r.status, expected, `${command} ${args.join(" ")} exited ${r.status}: ${r.stderr || r.stdout}`);
  return r;
}
const git = (cwd, ...args) => run("git", args, cwd).stdout.trim();
const logOf = (dir) => { try { return fs.readFileSync(path.join(dir, ".git", LOG), "utf8").split("\n").filter(Boolean); } catch { return []; } };

// 逐个文件复制,不用 fs.cpSync:Windows 上 Node 24 的 cpSync 遇到非 ASCII 路径(如「一致性机制」)会让进程直接崩溃
function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else if (e.isFile()) fs.copyFileSync(a, b);
  }
}

// 一个装了本套件 hook 与接线的项目(复制 .agents/ 与三份接线文件)
function project() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pck-observe-测试-")));
  temps.push(dir);
  copyDir(path.join(kitRoot, ".agents"), path.join(dir, ".agents"));
  for (const rel of [".claude/settings.json", ".codex/hooks.json"]) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.copyFileSync(path.join(kitRoot, rel), path.join(dir, rel));
  }
  fs.mkdirSync(path.join(dir, "一致性机制"));
  fs.writeFileSync(path.join(dir, "一致性机制", "文件联动目录.md"), "# fixture\n");
  run("git", ["init", "-q"], dir);
  for (const [k, v] of [["user.name", "Fixture"], ["user.email", "fixture@example.invalid"], ["commit.gpgsign", "false"]]) git(dir, "config", k, v);
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "--no-verify", "-m", "fixture");
  return dir;
}
const selfcheck = (dir, expected) => JSON.parse(run(process.execPath, [path.join(dir, ".agents/hooks/selfcheck.mjs"), "--json"], dir, { expected }).stdout);
const overview = (dir) => JSON.parse(run(process.execPath, [path.join(dir, ".agents/skills/wrapup/scripts/scope.mjs"), "--overview"], dir).stdout);
const failed = (report) => report.results.filter((r) => r.status === "fail");

try {
  // ---------- 失败留痕 ----------
  const p = project();
  const env = { ...process.env };
  delete env.CLAUDE_PROJECT_DIR;
  const hook = (name, input) => run(process.execPath, [path.join(p, ".agents/hooks", `${name}.mjs`)], p, { input, env });
  assert.equal(hook("compact-reminder", JSON.stringify({ cwd: p, source: "startup" })).stdout, "", "正常的静默");
  assert.deepEqual(logOf(p), [], "正常的静默不算失败");
  assert.equal(hook("compact-reminder", "").stdout, "", "没有输入也不算失败");
  assert.deepEqual(logOf(p), []);

  const garbled = hook("compact-reminder", "ï»¿ not json");
  assert.equal(garbled.status, 0, "解析不出也放行");
  let log = logOf(p);
  assert.equal(log.length, 1, log.join("\n"));
  const [time, name, host, reason] = log[0].split("\t");
  assert.ok(!Number.isNaN(Date.parse(time)));
  assert.equal(name, "compact-reminder");
  assert.equal(host, "codex");
  assert.match(reason, /input is not JSON \(\d+ chars, starts U\+00EF U\+00BB U\+00BF\)/);
  assert.doesNotMatch(reason, /not json/, "不记输入内容");

  hook("parallel-notice", "{ broken");
  assert.match(logOf(p)[1], /\tparallel-notice\tcodex\tinput is not JSON/);
  const claude = run(process.execPath, [path.join(p, ".agents/hooks/compact-reminder.mjs")], p, { input: "oops", env: { ...env, CLAUDE_PROJECT_DIR: p } });
  assert.equal(claude.status, 0);
  assert.match(logOf(p)[2], /\tcompact-reminder\tclaude\tinput is not JSON/);

  // 分支 worktree 里的失败写进公共目录,主目录的 catchup 也看得到
  const wt = `${p}-wt`;
  temps.push(wt);
  git(p, "worktree", "add", "-q", "-b", "task", wt);
  run(process.execPath, [path.join(wt, ".agents/hooks/compact-reminder.mjs")], wt, { input: "x", env });
  assert.equal(logOf(p).length, 4, "worktree 的失败记录在公共 Git 目录");
  for (const w of fs.readdirSync(path.join(p, ".git", "worktrees"))) assert.equal(fs.existsSync(path.join(p, ".git", "worktrees", w, LOG)), false);

  let o = overview(p);
  assert.equal(o.hook_failures.count, 4);
  assert.equal(o.hook_failures.recent.length, 4);
  assert.match(o.hook_failures.recent[3], /compact-reminder codex input is not JSON/);
  assert.equal(overview(wt).hook_failures.count, 4, "worktree 里的 catchup 看到同一份记录");

  // 上限:只留最后 100 行
  fs.appendFileSync(path.join(p, ".git", LOG), Array.from({ length: 120 }, (_, i) => `2026-10-01T00:00:00.000Z\tparallel-notice\tcodex\tfiller ${i}`).join("\n") + "\n");
  hook("parallel-notice", "still broken");
  log = logOf(p);
  assert.equal(log.length, 100);
  assert.match(log[99], /input is not JSON/);
  assert.equal(overview(p).hook_failures.count, 100);
  assert.equal(overview(p).hook_failures.recent.length, 5);

  // ---------- 自检 ----------
  // 本套件的接线全部通过,记下 selfcheck ok,之前的失败不再报告
  const scratchBefore = new Set(fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("pck-selfcheck-")));
  let report = selfcheck(p, 0);
  assert.equal(report.passed, true, JSON.stringify(failed(report)));
  assert.equal(report.failures_since_last_ok.count, 100, "自检先报出之前的失败");
  const ran = report.results.filter((r) => r.status === "ok");
  assert.equal(ran.length, 4, JSON.stringify(report.results));
  for (const host of ["Claude Code", "Codex"]) for (const event of ["UserPromptSubmit", "SessionStart"]) {
    assert.ok(ran.some((r) => r.host === host && r.event === event), `${host} ${event}`);
  }
  assert.equal(report.results.filter((r) => r.status === "untested").length, 2, "Codex 另一平台的接线注明未测");
  assert.match(logOf(p).at(-1), /\tselfcheck\t-\tok$/);
  assert.equal(overview(p).hook_failures, undefined, "自检通过后 catchup 不再报告");
  hook("compact-reminder", "after ok");
  assert.equal(overview(p).hook_failures.count, 1, "之后的新失败照常报告");
  assert.equal(fs.readdirSync(os.tmpdir()).some((f) => f.startsWith("pck-selfcheck-") && !scratchBefore.has(f)), false, "临时仓库已删除");

  // hook 内部抛异常:输出为空,自检报出 hook 留下的记录
  const notice = path.join(p, ".agents/hooks/parallel-notice.mjs");
  const original = fs.readFileSync(notice, "utf8");
  fs.writeFileSync(notice, original.replace("function main() {", 'function main() {\n  throw new Error("boom");'));
  report = selfcheck(p, 1);
  assert.equal(report.passed, false);
  let bad = failed(report);
  assert.deepEqual(bad.map((r) => `${r.host}/${r.event}`).sort(), ["Claude Code/UserPromptSubmit", "Codex/UserPromptSubmit"]);
  for (const r of bad) assert.match(r.detail, /没有输出;hook 留下的失败记录:Error: boom/);
  assert.equal(overview(p).hook_failures.count, 1, "失败的自检不记 ok;临时仓库里的记录不进本项目");
  fs.writeFileSync(notice, original);

  // 脚本缺失:node 以非 0 退出
  const compactPath = path.join(p, ".agents/hooks/compact-reminder.mjs");
  const compactText = fs.readFileSync(compactPath, "utf8");
  fs.rmSync(compactPath);
  bad = failed(selfcheck(p, 1));
  assert.equal(bad.length, 2, JSON.stringify(bad));
  for (const r of bad) assert.equal(r.event, "SessionStart");
  // POSIX 上 node 直接以 1 退出;Windows 上 Codex 经适配器,适配器发现脚本缺失、静默放行并留一行
  const codexDetail = (list) => list.find((r) => r.host === "Codex").detail;
  assert.ok(bad.some((r) => /退出码 1/.test(r.detail)), JSON.stringify(bad));
  if (process.platform === "win32") assert.match(codexDetail(bad), /没有输出;hook 留下的失败记录:adapter: hook script missing: \.agents\/hooks\/compact-reminder\.mjs/);
  else assert.match(codexDetail(bad), /退出码 1/);

  // 脚本语法错误:node 以非 0 退出;Windows 上适配器记下 node 的退出码
  fs.writeFileSync(compactPath, "this is not javascript (\n");
  bad = failed(selfcheck(p, 1));
  assert.equal(bad.length, 2, JSON.stringify(bad));
  if (process.platform === "win32") assert.match(codexDetail(bad), /没有输出;hook 留下的失败记录:adapter: node exited 1/);
  else assert.match(codexDetail(bad), /退出码 1/);
  fs.writeFileSync(compactPath, compactText);

  // 少接一项、接线文件坏掉
  const codexPath = path.join(p, ".codex/hooks.json");
  const codexText = fs.readFileSync(codexPath, "utf8");
  const codex = JSON.parse(codexText);
  delete codex.hooks.SessionStart;
  fs.writeFileSync(codexPath, JSON.stringify(codex));
  bad = failed(selfcheck(p, 1));
  assert.deepEqual(bad.map((r) => `${r.host}/${r.event}/${r.detail}`), ["Codex/SessionStart/未接线(安装器会接上这一项)"]);
  fs.writeFileSync(codexPath, "{ not json");
  bad = failed(selfcheck(p, 1));
  assert.equal(bad.length, 1);
  assert.match(bad[0].detail, /不是合法 JSON/);

  // Codex 用 config.toml 的内联接线(安装器在已有 [hooks] 时写这种)
  fs.rmSync(codexPath);
  const toml = ["model = \"x\"", ""];
  for (const [event, name, win] of [["UserPromptSubmit", "parallel-notice", "run-hook.ps1') parallel-notice"], ["SessionStart", "compact-reminder", "run-hook.ps1') compact-reminder"]]) {
    toml.push(`[[hooks.${event}]]`, "", `[[hooks.${event}.hooks]]`, 'type = "command"',
      `command = 'node "$(git rev-parse --show-toplevel)/.agents/hooks/${name}.mjs"'`,
      `command_windows = "powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File (Join-Path (git rev-parse --show-toplevel) '.agents/hooks/${win}"`,
      "timeout = 10", "");
  }
  fs.writeFileSync(path.join(p, ".codex/config.toml"), toml.join("\n"));
  report = selfcheck(p, 0);
  assert.equal(report.results.filter((r) => r.source === ".codex/config.toml" && r.status === "ok").length, 2, JSON.stringify(report.results));

  // 没有任何接线
  fs.rmSync(path.join(p, ".codex"), { recursive: true });
  fs.rmSync(path.join(p, ".claude"), { recursive: true });
  report = selfcheck(p, 1);
  assert.deepEqual(report.results, []);
  assert.equal(report.passed, false);
  const text = run(process.execPath, [path.join(p, ".agents/hooks/selfcheck.mjs")], p, { expected: 1 }).stdout;
  assert.match(text, /没有找到机制的 hook 接线/);
  assert.match(run(process.execPath, [path.join(p, ".agents/hooks/selfcheck.mjs"), "--help"], p).stdout, /用法:node \.agents\/hooks\/selfcheck\.mjs/);
  assert.doesNotMatch(fs.readFileSync(path.join(kitRoot, ".agents/hooks/selfcheck.mjs"), "utf8"), /决策 ?\d/, "分发文件不写套件仓库的决策编号");

  process.stdout.write("hook observability: all checks passed\n");
} finally {
  for (const t of temps.reverse()) fs.rmSync(t, { recursive: true, force: true });
}
