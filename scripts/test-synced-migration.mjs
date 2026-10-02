// 一致性机制 version: 2026-10-02
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const source=path.resolve(process.argv[2]||'.');
const scripts=path.join(source,'.agents/skills/wrapup/scripts');
const {readSynced,writeSynced,SYNCED,LEGACY_SYNCED}=await import(pathToFileURL(path.join(scripts,'synced-ref.mjs')));
const temps=[];
function git(p,args,expected=0){const r=spawnSync('git',args,{cwd:p,encoding:'utf8'});assert.equal(r.status,expected,r.stderr);return r.stdout.trim();}
function repo(format){const p=fs.mkdtempSync(path.join(os.tmpdir(),'pck-ref-'));temps.push(p);git(p,['init','-q','-b','main',...(format?[`--object-format=${format}`]:[])]);git(p,['config','user.name','Fixture']);git(p,['config','user.email','fixture@example.invalid']);git(p,['config','projectConsistency.canonicalBranch','main']);fs.writeFileSync(path.join(p,'a'),'base');git(p,['add','.']);git(p,['commit','-qm','base']);return p;}
function guard(p,cmd,expected=0){const r=spawnSync(process.execPath,[path.join(scripts,'synced-guard.mjs'),cmd],{cwd:p,encoding:'utf8'});assert.equal(r.status,expected,r.stderr||r.stdout);return JSON.parse(r.stdout);}
const head=p=>git(p,['rev-parse','HEAD']);
const ref=(p,r)=>{const v=spawnSync('git',['rev-parse','-q','--verify',r],{cwd:p,encoding:'utf8'});return v.status===0?v.stdout.trim():null;};
function commit(p){fs.appendFileSync(path.join(p,'a'),'next');git(p,['commit','-qam','next']);return head(p);}
try {
 for(const format of [undefined,'sha256']){
  const p=repo(format),base=head(p);git(p,['tag','-a','synced','-m','old annotated marker']);const old=ref(p,LEGACY_SYNCED);const latest=commit(p);
  fs.writeFileSync(path.join(p,'pending'),'untracked');fs.appendFileSync(path.join(p,'a'),'dirty');git(p,['add','a']);
  const status=git(p,['status','--porcelain']);
  const inspected=guard(p,'inspect');assert.equal(inspected.synced,base);assert.equal(inspected.synced_source,LEGACY_SYNCED);assert.equal(inspected.legacy_synced_present,true);assert.equal(ref(p,SYNCED),null);
  const moved=guard(p,'migrate');assert.equal(moved.status,'migrated');assert.equal(moved.scope_base,base);assert.equal(ref(p,SYNCED),base);assert.equal(ref(p,LEGACY_SYNCED),null);assert.equal(head(p),latest);assert.equal(git(p,['status','--porcelain']),status);
  assert.equal(guard(p,'migrate').status,'already_migrated');assert.equal(guard(p,'advance',3).status,'blocked');
  // 同一仓库的新 worktree 共享引用,分支不能迁移或推进。
  const wt=p+'-wt';temps.push(wt);git(p,['worktree','add','-q','-b','task',wt]);assert.equal(guard(wt,'inspect').synced,base);guard(wt,'migrate',3);guard(wt,'advance',3);assert.equal(ref(p,SYNCED),base);
  // 已删除旧标签又被旧客户端带回:同位置可再次清理,不同位置不猜。
  git(p,['update-ref',LEGACY_SYNCED,old]);assert.equal(guard(p,'migrate').status,'migrated');git(p,['update-ref',LEGACY_SYNCED,latest]);
  const bad=guard(p,'inspect');assert(bad.blockers.includes('synced_refs_disagree'));assert.equal(bad.scope_base,null);guard(p,'migrate',3);guard(p,'advance',3);assert.equal(ref(p,SYNCED),base);assert.equal(ref(p,LEGACY_SYNCED),latest);
 }
 const p=repo(),base=head(p);git(p,['tag','synced']);assert.equal(guard(p,'advance').status,'migrated');assert.equal(ref(p,SYNCED),base);assert.equal(ref(p,LEGACY_SYNCED),null);assert.equal(guard(p,'advance').status,'already_synced');
 // CAS:读完之后新指针、旧标签或主线改变,均不得覆盖。
 let before=readSynced(p);const next=commit(p);git(p,['update-ref',SYNCED,next]);assert.equal(writeSynced(p,before,next,'refs/heads/main',next).reason,'ref_race');
 before=readSynced(p);git(p,['tag','synced',next]);assert.equal(writeSynced(p,before,next,'refs/heads/main',next).reason,'ref_race');assert.equal(ref(p,LEGACY_SYNCED),next);
 before=readSynced(p);const later=commit(p);assert.equal(writeSynced(p,before,next,'refs/heads/main',next).reason,'ref_race');assert.equal(ref(p,SYNCED),next);assert.equal(ref(p,LEGACY_SYNCED),next);
 assert.equal(writeSynced(p,before,base,'refs/heads/main',later).reason,'synced_not_ancestor');
 // 旧标签锁冲突时,事务失败不能留下新引用或删掉旧标签。
 const locked=repo();git(locked,['tag','synced']);const lock=path.join(locked,'.git/refs/tags/synced.lock');fs.writeFileSync(lock,'locked');guard(locked,'migrate',1);assert.equal(ref(locked,SYNCED),null);assert.equal(ref(locked,LEGACY_SYNCED),head(locked));fs.rmSync(lock);guard(locked,'migrate');
 // 普通 push --tags 不携带专用引用。
 const remote=fs.mkdtempSync(path.join(os.tmpdir(),'pck-ref-remote-'));temps.push(remote);git(remote,['init','--bare','-q']);git(locked,['remote','add','origin',remote]);git(locked,['tag','v-test']);git(locked,['push','--tags','origin']);assert.equal(ref(remote,'refs/tags/v-test'),head(locked));assert.equal(ref(remote,SYNCED),null);
 const empty=repo();assert.equal(guard(empty,'migrate').status,'no_synced');assert.equal(ref(empty,SYNCED),null);
 git(empty,['tag','synced',git(empty,['rev-parse','HEAD:a'])]);assert(guard(empty,'inspect').blockers.includes('synced_not_commit'));guard(empty,'migrate',3);
 const symbolic=repo();git(symbolic,['symbolic-ref',SYNCED,'refs/heads/main']);assert(guard(symbolic,'inspect').blockers.includes('synced_symbolic_ref'));guard(symbolic,'advance',3);
 console.log('synced migration: preservation, dual refs, annotated tags, SHA-256, worktrees, CAS, atomic failure and push boundary passed');
} finally {for(const p of temps.reverse())fs.rmSync(p,{recursive:true,force:true});}
