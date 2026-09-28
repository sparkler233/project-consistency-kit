// 一致性机制 version: 2026-09-25
// 联动目录的路径匹配,供 scope.mjs 使用:读出每条规则「触发」行中像路径的内容,与改动文件比较。
// 不解析附加条件,不判断规则是否成立;没有路径可比的规则列入 rules_not_checked,由模型自行判断。

export const LINKAGE = "一致性机制/文件联动目录.md";

export function parseLinkage(text, source) {
  if (text === null || text === undefined) return { recognized: false, reason: "linkage_file_missing" };
  const rules = [];
  text = text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, ""); // 代码块里的格式示例不算规则
  for (const block of text.split(/\n(?=#{2,4} )/)) {
    const heading = (block.match(/^#{2,4} +(.+)/) || [])[1];
    const trigger = block.split("\n").find((l) => /\*\*\s*触发/.test(l));
    if (!heading || !trigger) continue;
    // 像路径的才拿来比较:含 `/`,或形如「名字.扩展名」;`.docx`、`v*` 这类不算,该规则列入 rules_not_checked
    const paths = [...trigger.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim())
      .filter((t) => t && !/[\s*?]/.test(t) && (t.includes("/") || /^[^.][^/]*\.[A-Za-z0-9]+$/.test(t)));
    rules.push({ rule: heading.trim(), paths });
  }
  if (!rules.length) return { recognized: false, reason: "no_rule_with_trigger_line", source };
  return { recognized: true, source, rules };
}

const touches = (file, p) => file === p || file.startsWith(p.endsWith("/") ? p : `${p}/`);

export function ruleHits(linkage, files) {
  if (!linkage.recognized) return [];
  const hits = [];
  for (const { rule, paths } of linkage.rules) {
    const matched = files.filter((f) => paths.some((p) => touches(f, p)));
    if (matched.length) hits.push({ rule, files: matched.slice(0, 20), ...(matched.length > 20 ? { more: matched.length - 20 } : {}) });
  }
  return hits;
}

export const notChecked = (linkage) => (linkage.recognized ? linkage.rules.filter((r) => !r.paths.length).map((r) => r.rule) : []);
