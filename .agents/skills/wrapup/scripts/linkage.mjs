// 一致性机制 version: 2026-09-30
// 联动目录的路径匹配,供 scope.mjs 与并行提示 hook 共用:读出每条规则「触发」段中像路径的内容,与改动文件比较。
// 不解析附加条件,不判断规则是否成立;脚本判断不全的规则列入 rules_not_checked,由模型自行判断:
// 触发里没有可比的路径,或者除路径外还有文字条件(如「或新增顶层目录」)而按路径没有命中。

export const LINKAGE = "一致性机制/文件联动目录.md";

// 分句去掉标点和这些泛指的词后仍有文字,就算文字条件(宁可多列,不漏)
const FILLER = ["或者", "以及", "发生", "真实", "变化", "新增", "删除", "改名", "修改", "改动", "更新", "内容", "结构",
  "文件", "目录", "任一", "或", "和", "及", "与", "有", "时", "下", "的", "中", "内", "里", "等"];

function triggerText(block) {
  const rows = block.split("\n");
  const i = rows.findIndex((l) => /\*\*\s*触发/.test(l));
  if (i < 0) return null;
  const out = [rows[i]];
  // 触发可以跨行(如下面列出几个路径),到空行、下一个加粗字段或标题为止
  for (const l of rows.slice(i + 1)) {
    if (!l.trim() || /^\s*\*\*/.test(l) || /^#{1,6}\s/.test(l)) break;
    out.push(l);
  }
  return out.join("\n");
}

// 像路径的才拿来比较:含 `/`,或形如「名字.扩展名」;可带 * ? ** 通配;`.docx`、`v*`、带空格的命令这类不算
function pathsOf(trigger) {
  return [...trigger.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim().replace(/\\/g, "/"))
    .filter((t) => t && !/\s/.test(t) && (t.includes("/") || /^[^.][^/]*\.[A-Za-z0-9*?]+$/.test(t)));
}

// 按「、,;或 以及」切成分句:带路径的分句是对该路径的限定(如「`a.md` 中的资格变化」),不算;
// 不带路径、去掉泛指的词后仍有文字的分句是另一个触发条件(如「或新增顶层目录」)
function hasTextCondition(trigger) {
  const clauses = trigger.replace(/\*\*[^*]*\*\*/g, " ").split(/[、,，;；。\n]|或者|以及|或/);
  return clauses.some((c) => {
    if (pathsOf(c).length) return false;
    let rest = c.replace(/`[^`]*`/g, " ");
    for (const w of FILLER) rest = rest.split(w).join(" ");
    return rest.replace(/[\s\p{P}\p{S}]/gu, "").length >= 2;
  });
}

export function parseLinkage(text, source) {
  if (text === null || text === undefined) return { recognized: false, reason: "linkage_file_missing" };
  const rules = [];
  text = text.replace(/\r\n?/g, "\n").replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, ""); // 代码块里的格式示例不算规则
  for (const block of text.split(/\n(?=#{2,4} )/)) {
    const heading = (block.match(/^#{2,4} +(.+)/) || [])[1];
    const trigger = triggerText(block);
    if (!heading || !trigger) continue;
    rules.push({ rule: heading.trim(), paths: pathsOf(trigger), text_condition: hasTextCondition(trigger) });
  }
  if (!rules.length) return { recognized: false, reason: "no_rule_with_trigger_line", source };
  return { recognized: true, source, rules };
}

const globRe = (p) => new RegExp("^" + p.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  .replace(/\*\*\//g, "\u0001").replace(/\*\*/g, "\u0002").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")
  .replace(/\u0001/g, "(?:.*/)?").replace(/\u0002/g, ".*") + (p.endsWith("/") ? "" : "(?:/.*)?") + "$");
function touches(file, p) {
  if (/[*?]/.test(p)) return globRe(p).test(file) || (!p.includes("/") && globRe(p).test(file.split("/").pop()));
  return file === p || file.startsWith(p.endsWith("/") ? p : `${p}/`);
}

export function ruleHits(linkage, files) {
  if (!linkage.recognized) return [];
  const hits = [];
  for (const { rule, paths } of linkage.rules) {
    const matched = files.filter((f) => paths.some((p) => touches(f, p)));
    if (matched.length) hits.push({ rule, files: matched.slice(0, 20), ...(matched.length > 20 ? { more: matched.length - 20 } : {}) });
  }
  return hits;
}

// 不带改动文件时只列没有路径的规则;带上时再加上「有文字条件、按路径没命中」的规则
export const notChecked = (linkage, files = null) => {
  if (!linkage.recognized) return [];
  const hit = new Set(files ? ruleHits(linkage, files).map((h) => h.rule) : []);
  return linkage.rules.filter((r) => !r.paths.length || (files && r.text_condition && !hit.has(r.rule))).map((r) => r.rule);
};
