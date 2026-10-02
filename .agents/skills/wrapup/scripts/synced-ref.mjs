// 一致性机制 version: 2026-10-02
// 项目收尾指针:新引用优先,旧标签兼容读取;两者不同则阻止推进。更新与退役旧标签在同一 Git 事务内完成。
import { spawnSync } from 'node:child_process';
export const SYNCED = 'refs/pck/synced';
export const LEGACY_SYNCED = 'refs/tags/synced';
const git = (root, args, input) => spawnSync('git', args, {cwd:root, input, encoding:'utf8', windowsHide:true});
const oid = (root, ref) => { const r=git(root,['rev-parse','-q','--verify',ref]);return r.status===0?r.stdout.trim():null; };
export function readSynced(root) {
  const raw=oid(root,SYNCED), legacyRaw=oid(root,LEGACY_SYNCED);
  const current=raw?oid(root,`${SYNCED}^{commit}`):null;
  const legacy=legacyRaw?oid(root,`${LEGACY_SYNCED}^{commit}`):null;
  const blockers=[];
  if ((raw&&!current)||(legacyRaw&&!legacy)) blockers.push('synced_not_commit');
  for (const ref of [SYNCED,LEGACY_SYNCED]) if (git(root,['symbolic-ref','-q',ref]).status===0) blockers.push('synced_symbolic_ref');
  if (current&&legacy&&current!==legacy) blockers.push('synced_refs_disagree');
  return {raw,legacyRaw,commit:current||legacy,source:raw?SYNCED:legacyRaw?LEGACY_SYNCED:null,blockers};
}
export function writeSynced(root, before, target, canonicalRef, canonicalHead) {
  if (before.blockers.length) return {ok:false,reason:before.blockers[0]};
  if (!canonicalRef?.startsWith('refs/heads/') || !canonicalHead) return {ok:false,reason:'canonical_ref_missing'};
  if (before.commit && git(root,['merge-base','--is-ancestor',before.commit,target]).status!==0) return {ok:false,reason:'synced_not_ancestor'};
  const zero='0'.repeat(target.length);
  // 同时比较新旧指针和主线位置;任一已变化则整个事务失败,不留下半次迁移。
  const input=['start','option no-deref',`verify ${canonicalRef} ${canonicalHead}`,
    `update ${SYNCED} ${target} ${before.raw||zero}`,
    before.legacyRaw?`delete ${LEGACY_SYNCED} ${before.legacyRaw}`:`verify ${LEGACY_SYNCED} ${zero}`,
    'prepare','commit',''].join('\n');
  const r=git(root,['update-ref','--create-reflog','-m','Project Consistency Kit wrapup','--stdin'],input);
  if(r.status===0)return {ok:true};
  const after=readSynced(root);
  const race=after.raw!==before.raw||after.legacyRaw!==before.legacyRaw||oid(root,canonicalRef)!==canonicalHead;
  return {ok:false,reason:race?'ref_race':'update_failed',error:r.stderr.trim()};
}
