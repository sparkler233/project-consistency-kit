// 一致性机制 version: 2026-10-03
// 启动静态检查:只读文件,不执行 hook、不修复、不写自检通过标记。
import fs from 'node:fs';
import path from 'node:path';

const REQUIRED = [
  'PROJECT.md', '一致性机制/运行规则.md', '.agents/skills/catchup/SKILL.md',
  ...['scope', 'synced-guard', 'synced-ref', 'checkpoints', 'linkage', 'hook-trace'].map(n => `.agents/skills/wrapup/scripts/${n}.mjs`),
];
const EVENTS = { UserPromptSubmit: 'parallel-notice', SessionStart: 'compact-reminder' };

export function inspectStartup(root, host, platform = process.platform) {
  const issues = [], unchecked = [];
  const issue = (code, source, extra = {}) => issues.push({ code, source, ...extra });
  function read(rel, optional = false) {
    try {
      const full = path.join(root, rel);
      if (!fs.statSync(full).isFile()) { issue('not_a_file', rel); return null; }
      return fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, '');
    } catch (e) {
      if (!(optional && e.code === 'ENOENT')) issue(e.code === 'ENOENT' ? 'file_missing' : 'file_unreadable', rel, { reason: e.code || 'read_failed' });
      return null;
    }
  }
  for (const rel of REQUIRED) read(rel);
  if (!['codex', 'claude'].includes(host)) {
    unchecked.push({ code: 'host_unknown' });
    return { host: 'unknown', issues, unchecked };
  }
  // 项目级 JSON 可静态解析;其他宿主、用户级配置与信任状态不推断。
  const sources = host === 'claude' ? ['.claude/settings.json', '.claude/settings.local.json'] : ['.codex/hooks.json'];
  const handlers = [];
  let hasConfig = false, uncertain = false;
  for (const source of sources) {
    const text = read(source, true);
    if (text === null) continue;
    hasConfig = true;
    let data;
    try { data = JSON.parse(text); } catch { issue('invalid_json', source); uncertain = true; continue; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) { issue('invalid_hook_config', source); uncertain = true; continue; }
    if (data.disableAllHooks === true) issue('hooks_disabled', source);
    if (data.hooks === undefined) continue;
    if (!data.hooks || typeof data.hooks !== 'object' || Array.isArray(data.hooks)) { issue('invalid_hooks_shape', source); uncertain = true; continue; }
    for (const [event, groups] of Object.entries(data.hooks)) {
      if (!EVENTS[event]) continue;
      if (!Array.isArray(groups)) { issue('invalid_event_shape', source, { event }); uncertain = true; continue; }
      for (const group of groups) {
        if (!Array.isArray(group?.hooks)) { issue('invalid_handler_group', source, { event }); uncertain = true; continue; }
        for (const h of group.hooks) {
          if (!h || (h.type && h.type !== 'command')) continue;
          const command = host === 'codex' && platform === 'win32' ? h.commandWindows : h.command;
          const args = h.args === undefined ? [] : h.args;
          const all = [h.command, h.commandWindows, ...(Array.isArray(args) ? args : [])].filter(x => typeof x === 'string').join(' ');
          if (!/\.agents[\\/]hooks[\\/]|一致性机制[\\/]hooks[\\/]/.test(all)) continue;
          if (typeof command !== 'string' || !command.trim() || !Array.isArray(args) || args.some(a => typeof a !== 'string')) {
            issue('invalid_handler_command', source, { event }); continue;
          }
          const active = [command, ...args].join(' ').replace(/\\/g, '/');
          const refs = [...active.matchAll(/(?:\.agents\/hooks\/[A-Za-z0-9_.-]+\.(?:mjs|ps1))/g)].map(m => m[0]);
          if (!refs.length) { unchecked.push({ code: 'custom_hook_command', source, event }); uncertain = true; continue; }
          // 只解释项目相对路径及安装器使用的根目录写法,不猜自定义绝对路径。
          const localRefs = refs.every(rel => {
            const prefix = active.slice(0, active.indexOf(rel));
            return /(?:^|[\s"'])$/.test(prefix) || prefix.endsWith('${CLAUDE_PROJECT_DIR}/') || prefix.endsWith('$(git rev-parse --show-toplevel)/');
          });
          if (!localRefs) { unchecked.push({ code: 'custom_hook_path', source, event }); uncertain = true; continue; }
          for (const rel of new Set(refs)) read(rel);
          const name = EVENTS[event];
          const matches = refs.includes(`.agents/hooks/${name}.mjs`) ||
            (refs.includes('.agents/hooks/run-hook.ps1') && new RegExp(`(?:^|[\\s"'])${name}(?:$|[\\s"'])`).test(active));
          if (matches) { read(`.agents/hooks/${name}.mjs`); handlers.push(event); }
          else issue('unexpected_hook_target', source, { event });
        }
      }
    }
  }
  if (host === 'codex') {
    const toml = read('.codex/config.toml', true);
    if (toml !== null && /\bhooks\b/.test(toml)) {
      // 不用自制 TOML 子集解析器冒充完整校验,避免拒绝合法的宿主配置。
      unchecked.push({ code: 'toml_hooks_not_checked', source: '.codex/config.toml' });
      uncertain = true;
    }
  }
  if (!uncertain) {
    if (!hasConfig) issue('hook_config_missing', sources[0]);
    else for (const event of Object.keys(EVENTS)) if (!handlers.includes(event)) issue('mechanism_hook_missing', sources[0], { event });
  }
  // 不重复报告同一路径在多个接线项中出现的问题。
  return { host, issues: [...new Map(issues.map(x => [JSON.stringify(x), x])).values()], unchecked };
}
