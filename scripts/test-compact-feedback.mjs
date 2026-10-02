// 一致性机制 version: 2026-10-02
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
const root = path.resolve(process.argv[2] || '.');
const script = path.join(root, '.agents/hooks/compact-reminder.mjs');
function run(source, args = [], extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };
  const result = spawnSync(process.execPath, [script, ...args], {cwd: root, env, encoding: 'utf8', input: JSON.stringify({source, cwd: root})});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout ? JSON.parse(result.stdout) : null;
}
for (const source of ['startup', 'resume', 'clear', undefined]) {
  assert.equal(run(source, ['--host=codex']), null);
  assert.equal(run(source), null);
}
const codex = run('compact', ['--host=codex'], {CLAUDE_PROJECT_DIR:root});
assert.match(codex.systemMessage, /将重新读取/);
assert.doesNotMatch(codex.systemMessage, /已恢复|完整保留|task\.mjs/);
assert.match(codex.hookSpecificOutput.additionalContext, /完成重读后/);
assert.match(codex.hookSpecificOutput.additionalContext, /有缺口如实说明/);
assert.equal(codex.hookSpecificOutput.hookEventName, 'SessionStart');
const claude = run('compact', [], {CLAUDE_PROJECT_DIR:root});
assert.equal(claude.systemMessage, undefined);
assert.doesNotMatch(claude.hookSpecificOutput.additionalContext, /完成重读后/);
assert.match(claude.hookSpecificOutput.additionalContext, /先重读/);
const config = JSON.parse(fs.readFileSync(path.join(root,'.codex/hooks.json'),'utf8'));
assert.match(config.hooks.SessionStart[0].hooks[0].command, /--host=codex/);
assert.match(config.hooks.SessionStart[0].hooks[0].commandWindows, /-Codex/);
console.log('compact feedback: Codex notice, Agent instruction, other hosts and silent events passed');
