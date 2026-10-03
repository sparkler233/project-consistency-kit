// 一致性机制 version: 2026-10-03
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectStartup } from '../.agents/skills/wrapup/scripts/startup-check.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'pck-startup-'));
const source=process.cwd();
const put=(p,text)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),text);};
const copy=p=>put(p,fs.readFileSync(path.join(source,p==='PROJECT.md'?'templates/PROJECT.md':p),'utf8'));
const snapshot=()=>JSON.stringify(fs.readdirSync(root,{recursive:true}).filter(p=>fs.statSync(path.join(root,p)).isFile()).sort().map(p=>[p,fs.readFileSync(path.join(root,p),'base64')]));
const inspect=(host='codex',platform='linux')=>{const before=snapshot();const out=inspectStartup(root,host,platform);assert.equal(snapshot(),before,'static inspection must not write');return out;};
const has=(out,code)=>out.issues.some(i=>i.code===code);
try {
 for(const p of ['PROJECT.md','一致性机制/运行规则.md','.agents/skills/catchup/SKILL.md',...['scope','synced-guard','synced-ref','checkpoints','linkage','hook-trace'].map(n=>`.agents/skills/wrapup/scripts/${n}.mjs`),...['parallel-notice','compact-reminder'].map(n=>`.agents/hooks/${n}.mjs`),'.agents/hooks/run-hook.ps1','.codex/hooks.json','.claude/settings.json'])copy(p);
 assert.deepEqual(inspect().issues,[]);assert.deepEqual(inspect().unchecked,[]);
 for (const sourceName of ['.codex/hooks.json','.claude/settings.json']) {
  const current=JSON.parse(fs.readFileSync(path.join(root,sourceName),'utf8'));
  assert.equal(current.hooks.Stop,undefined,'kit no longer wires Stop');
  current.hooks.Stop=[{hooks:[{type:'command',command:'user-custom-stop-command'}]}];
  put(sourceName,JSON.stringify(current));
  assert.deepEqual(inspect(sourceName.startsWith('.codex')?'codex':'claude').issues,[],'unrelated Stop is not a kit requirement');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root,sourceName),'utf8')).hooks.Stop[0].hooks[0].command,'user-custom-stop-command');
  copy(sourceName);
 }

 assert.deepEqual(inspect('claude').issues,[]);assert.deepEqual(inspect('codex','win32').issues,[]);
 put('.claude/settings.json','broken');assert.deepEqual(inspect('codex').issues,[]);assert(has(inspect('claude'),'invalid_json'));copy('.claude/settings.json');
 fs.unlinkSync(path.join(root,'一致性机制/运行规则.md'));assert(has(inspect(),'file_missing'));copy('一致性机制/运行规则.md');
 fs.unlinkSync(path.join(root,'.agents/hooks/parallel-notice.mjs'));assert(has(inspect(),'file_missing'));copy('.agents/hooks/parallel-notice.mjs');
 put('.codex/hooks.json','{');assert(has(inspect(),'invalid_json'));copy('.codex/hooks.json');
 let cfg=JSON.parse(fs.readFileSync(path.join(root,'.codex/hooks.json')));delete cfg.hooks.SessionStart;put('.codex/hooks.json',JSON.stringify(cfg));assert(has(inspect(),'mechanism_hook_missing'));copy('.codex/hooks.json');
 cfg=JSON.parse(fs.readFileSync(path.join(root,'.codex/hooks.json')));delete cfg.hooks.SessionStart[0].hooks[0].commandWindows;put('.codex/hooks.json',JSON.stringify(cfg));assert(has(inspect('codex','win32'),'invalid_handler_command'));assert.deepEqual(inspect('codex','linux').issues,[]);copy('.codex/hooks.json');
 cfg=JSON.parse(fs.readFileSync(path.join(root,'.codex/hooks.json')));cfg.hooks.SessionStart[0].hooks[0].command='node /elsewhere/.agents/hooks/compact-reminder.mjs';put('.codex/hooks.json',JSON.stringify(cfg));assert(inspect().unchecked.some(i=>i.code==='custom_hook_path'));copy('.codex/hooks.json');
 put('.claude/settings.local.json',JSON.stringify({disableAllHooks:true}));assert(has(inspect('claude'),'hooks_disabled'));
 fs.unlinkSync(path.join(root,'.codex/hooks.json'));put('.codex/config.toml',"[[hooks.SessionStart.hooks]]\ncommand = 'custom'\n");assert(inspect().unchecked.some(i=>i.code==='toml_hooks_not_checked'));assert(!has(inspect(),'hook_config_missing'));
 const unknown=inspect('unknown');assert(unknown.unchecked.some(i=>i.code==='host_unknown'));assert(!has(unknown,'invalid_json'));
 // 集成:新参数不丢 Git 概况或失败记录,缺检查器不让整个概览崩溃。
 copy('.codex/hooks.json');fs.unlinkSync(path.join(root,'.codex/config.toml'));
 for(const file of fs.readdirSync(path.join(source,'.agents/skills/wrapup/scripts')))if(file.endsWith('.mjs'))copy(`.agents/skills/wrapup/scripts/${file}`);
 put('一致性机制/文件联动目录.md','# fixture\n');
 const run=(cmd,args)=>spawnSync(cmd,args,{cwd:root,encoding:'utf8'});
 assert.equal(run('git',['init','-q']).status,0);
 put('.git/pck-hook-failures.log','2026-10-02T00:00:00Z\tcompact-reminder\tcodex\tfailure\n');
 const scope='.agents/skills/wrapup/scripts/scope.mjs';
 let before=snapshot();let result=run(process.execPath,[scope,'--overview','--host','codex']);assert.equal(result.status,0,result.stderr);
 let output=JSON.parse(result.stdout);assert.deepEqual(output.startup_check.issues,[]);assert.equal(output.hook_failures.count,1);assert('worktree' in output);assert.equal(snapshot(),before);
 fs.unlinkSync(path.join(root,'.agents/skills/wrapup/scripts/startup-check.mjs'));
 result=run(process.execPath,[scope,'--overview','--host','codex']);assert.equal(JSON.parse(result.stdout).startup_check.issues[0].code,'startup_check_unavailable');
 assert.equal(run(process.execPath,[scope,'--host','codex']).status,2);
 assert.equal(run(process.execPath,[scope,'--overview','--host','invalid']).status,2);
 console.log('startup static and integration checks passed; no file or log writes');
} finally {fs.rmSync(root,{recursive:true,force:true});}
