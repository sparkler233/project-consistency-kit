// 一致性机制 version: 2026-10-02
// 收尾指针 refs/pck/synced 的回归测试:创建与推进、SHA-256 仓库、worktree 共享、并发保护、事务失败、推送边界与异常引用。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const source=path.resolve(process.argv[2]||'.');
const scripts=path.join(source,'.agents/skills/wrapup/scripts');
const {readSynced,writeSynced,SYNCED}=await import(pathToFileURL(path.join(scripts,'synced-ref.mjs')));
const temps=[];
function git(p,args,expected=0){const r=spawnSync('git',args,{cwd:p,encoding:'utf8'});assert.equal(r.status,expected,r.stderr);return r.stdout.trim();}
function repo(format){const p=fs.mkdtempSync(path.join(os.tmpdir(),'pck-ref-'));temps.push(p);git(p,['init','-q','-b','main',...(format?[`--object-format=${format}`]:[])]);git(p,['config','user.name','Fixture']);git(p,['config','user.email','fixture@example.invalid']);git(p,['config','projectConsistency.canonicalBranch','main']);fs.writeFileSync(path.join(p,'a'),'base');git(p,['add','.']);git(p,['commit','-qm','base']);return p;}
function guard(p,cmd,expected=0){const r=spawnSync(process.execPath,[path.join(scripts,'synced-guard.mjs'),cmd],{cwd:p,encoding:'utf8'});assert.equal(r.status,expected,r.stderr||r.stdout);return JSON.parse(r.stdout);}
const head=p=>git(p,['rev-parse','HEAD']);
const ref=(p,r)=>{const v=spawnSync('git',['rev-parse','-q','--verify',r],{cwd:p,encoding:'utf8'});return v.status===0?v.stdout.trim():null;};
function commit(p){fs.appendFileSync(path.join(p,'a'),'next');git(p,['commit','-qam','next']);return head(p);}
try {
 for(const format of [undefined,'sha256']){
  const p=repo(format),base=head(p);
  assert.equal(guard(p,'advance').status,'created');assert.equal(ref(p,SYNCED),base);
  assert.equal(guard(p,'advance').status,'already_synced');
  const latest=commit(p);assert.equal(guard(p,'inspect').scope_base,base);
  assert.equal(guard(p,'advance').status,'advanced');assert.equal(ref(p,SYNCED),latest);
  // 旧版位置不再读取:只有 refs/tags/synced 时视为没有指针。
  git(p,['tag','synced',base]);assert.equal(guard(p,'inspect').synced,latest);
  // 同一仓库的 worktree 共享引用,分支上不能推进。
  const wt=p+'-wt';temps.push(wt);git(p,['worktree','add','-q','-b','task',wt]);assert.equal(guard(wt,'inspect').synced,latest);guard(wt,'advance',3);assert.equal(ref(p,SYNCED),latest);
  // 工作区不干净时不推进。
  commit(p);fs.writeFileSync(path.join(p,'pending'),'untracked');assert(guard(p,'inspect').blockers.includes('dirty_worktree'));guard(p,'advance',3);assert.equal(ref(p,SYNCED),latest);
 }
 // CAS:读完之后指针或主线改变,均不得覆盖。
 const p=repo(),base=head(p);guard(p,'advance');
 let before=readSynced(p);const next=commit(p);git(p,['update-ref',SYNCED,next]);assert.equal(writeSynced(p,before,next,'refs/heads/main',next).reason,'ref_race');
 before=readSynced(p);const later=commit(p);assert.equal(writeSynced(p,before,next,'refs/heads/main',next).reason,'ref_race');assert.equal(ref(p,SYNCED),next);
 assert.equal(writeSynced(p,before,base,'refs/heads/main',later).reason,'synced_not_ancestor');
 // 引用锁冲突时事务失败,指针保持原值。
 const locked=repo();guard(locked,'advance');const lockedBase=head(locked);commit(locked);
 const lock=path.join(locked,'.git/refs/pck/synced.lock');fs.writeFileSync(lock,'locked');guard(locked,'advance',1);assert.equal(ref(locked,SYNCED),lockedBase);fs.rmSync(lock);assert.equal(guard(locked,'advance').status,'advanced');
 // 普通 push --tags 不携带专用引用。
 const remote=fs.mkdtempSync(path.join(os.tmpdir(),'pck-ref-remote-'));temps.push(remote);git(remote,['init','--bare','-q']);git(locked,['remote','add','origin',remote]);git(locked,['tag','v-test']);git(locked,['push','--tags','origin']);assert.equal(ref(remote,'refs/tags/v-test'),head(locked));assert.equal(ref(remote,SYNCED),null);
 // 指向非提交对象或符号引用时阻止推进。
 const odd=repo();git(odd,['update-ref',SYNCED,git(odd,['rev-parse','HEAD:a'])]);assert(guard(odd,'inspect').blockers.includes('synced_not_commit'));guard(odd,'advance',3);
 const symbolic=repo();git(symbolic,['symbolic-ref',SYNCED,'refs/heads/main']);assert(guard(symbolic,'inspect').blockers.includes('synced_symbolic_ref'));guard(symbolic,'advance',3);
 console.log('synced ref: create/advance, SHA-256, worktrees, CAS, atomic failure, push boundary and odd refs passed');
} finally {for(const p of temps.reverse())fs.rmSync(p,{recursive:true,force:true});}
