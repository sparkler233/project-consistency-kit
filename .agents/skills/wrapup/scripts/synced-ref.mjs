// 一致性机制 version: 2026-10-03
// 项目收尾指针 refs/pck/synced:读取与原子更新。
import { spawnSync } from 'node:child_process';
export const SYNCED = 'refs/pck/synced';
const git = (root, args, input) => spawnSync('git', args, {cwd:root, input, encoding:'utf8', windowsHide:true});
const oid = (root, ref) => { const r=git(root,['rev-parse','-q','--verify',ref]);return r.status===0?r.stdout.trim():null; };
export function readSynced(root) {
  const raw=oid(root,SYNCED);
  const commit=raw?oid(root,`${SYNCED}^{commit}`):null;
  const blockers=[];
  if (raw&&!commit) blockers.push('synced_not_commit');
  if (git(root,['symbolic-ref','-q',SYNCED]).status===0) blockers.push('synced_symbolic_ref');
  return {raw,commit,blockers};
}
export function writeSynced(root, before, target, canonicalRef, canonicalHead) {
  if (before.blockers.length) return {ok:false,reason:before.blockers[0]};
  if (!canonicalRef?.startsWith('refs/heads/') || !canonicalHead) return {ok:false,reason:'canonical_ref_missing'};
  if (before.commit && git(root,['merge-base','--is-ancestor',before.commit,target]).status!==0) return {ok:false,reason:'synced_not_ancestor'};
  const zero='0'.repeat(target.length);
  // 同时比较指针和主线位置;任一已变化则整个事务失败。
  const input=['start','option no-deref',`verify ${canonicalRef} ${canonicalHead}`,
    `update ${SYNCED} ${target} ${before.raw||zero}`,'prepare','commit',''].join('\n');
  const r=git(root,['update-ref','--create-reflog','-m','Recensio wrapup','--stdin'],input);
  if(r.status===0)return {ok:true};
  const race=readSynced(root).raw!==before.raw||oid(root,canonicalRef)!==canonicalHead;
  return {ok:false,reason:race?'ref_race':'update_failed',error:r.stderr.trim()};
}
