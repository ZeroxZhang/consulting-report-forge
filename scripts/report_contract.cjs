/* 任务合同是制作参数、检查范围和独立性要求的共同来源；默认保守，不推断已审查。 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const fileHash = file => hash(fs.readFileSync(file));
const stable = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
function normalize(value = {}, defaults = {}) {
  const c = {version: 1, workMode: 'editorial', complexity: 'complex', majorConclusion: false,
    mode: 'reading', theme: 'mckinsey', typography: 'serif-report-bold', ratio: '16x9', kind: 'fragment',
    planner: {mode: 'direct'}, critical: [], ...defaults, ...value};
  if (c.version !== 1) throw Error('不支持的任务合同版本');
  for (const [key, allowed] of Object.entries({workMode: ['editorial', 'analytical', 'exploratory'], complexity: ['simple', 'complex'], mode: ['reading', 'presentation'], ratio: ['16x9', '4x3'], kind: ['report', 'fragment', 'collection']})) {
    if (!allowed.includes(c[key])) throw Error('任务合同 ' + key + ' 无效');
  }
  if (typeof c.majorConclusion !== 'boolean') throw Error('majorConclusion 须明确为 boolean');
  require('../assets/deck-themes.js').get(c.theme);
  require('../assets/deck-typography.js').get(c.typography);
  if (!c.planner || !['direct', 'used', 'unavailable'].includes(c.planner.mode)) throw Error('planner.mode 无效');
  if (c.planner.mode === 'used' && (!c.planner.record || !/^[a-f0-9]{64}$/.test(c.planner.sha256 || ''))) throw Error('采用planner须绑定record路径和sha256');
  if (c.planner.mode === 'unavailable' && !c.planner.reason?.trim()) throw Error('planner不可用须说明实际限制');
  if (c.pages !== undefined) {
    if (!c.pages || typeof c.pages !== 'object' || typeof c.pages.record !== 'string' || !c.pages.record.trim()) throw Error('pages 须绑定 record 路径（S3 的 pages.json）');
    if (c.pages.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(c.pages.sha256)) throw Error('pages.sha256 须为 64 位十六进制');
  }
  if (!Array.isArray(c.critical)) throw Error('critical 须为数组');
  const ids = new Set();
  for (const item of c.critical) {
    if (!item || !/^[a-zA-Z][\w-]*$/.test(item.id || '') || !item.text?.trim() || ids.has(item.id)) throw Error('关键语义须有唯一id与真实text');
    if (item.target !== undefined && !/^[a-zA-Z][\w-]*$/.test(item.target)) throw Error('critical.target须为对象id');
    ids.add(item.id);
  }
  const reviewPolicy = c.complexity === 'complex' || c.majorConclusion ? 'independent' : 'author';
  if (c.reviewPolicy !== undefined && c.reviewPolicy !== reviewPolicy) throw Error('reviewPolicy与任务风险冲突');
  c.reviewPolicy = reviewPolicy;
  return c;
}
function read(html) {
  const matches = [...html.matchAll(/<script\b[^>]*\bid=["']deck-task-contract["'][^>]*>([\s\S]*?)<\/script>/gi)];
  if (matches.length > 1) throw Error('重复任务合同');
  return matches.length ? normalize(JSON.parse(matches[0][1])) : null;
}
function install(html, contract) {
  const c = normalize(contract);
  html = html.replace(/<script\b[^>]*\bid=["']deck-task-contract["'][^>]*>[\s\S]*?<\/script>\s*/gi, '');
  html = html.replace(/<html\b[^>]*>/i, tag => tag.replace(/\sdata-reliability-version\s*=\s*(["']).*?\1/i, '').replace(/\sdata-deck-kind\s*=\s*(["']).*?\1/i, '').replace(/>$/, ' data-reliability-version="2" data-deck-kind="' + c.kind + '">'));
  return html.replace(/<\/head>/i, '<script id="deck-task-contract" type="application/json">' + stable(c).replace(/</g, '\\u003c') + '</script>\n</head>');
}
function load(file, output, defaults = {}) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (raw.planner?.mode === 'used') {
    const record = path.resolve(path.dirname(path.resolve(file)), raw.planner.record || '');
    const actual = fileHash(record);
    if (raw.planner.sha256 && raw.planner.sha256 !== actual) throw Error('planner记录版本已变化');
    raw.planner = {...raw.planner, record: path.relative(path.dirname(path.resolve(output)), record), sha256: actual};
  }
  // pages.json 与 planner 记录同一条版本链：装配前核对摘要，成稿内改写为相对输出的路径。
  if (raw.pages?.record) {
    const record = path.resolve(path.dirname(path.resolve(file)), raw.pages.record);
    if (!fs.existsSync(record)) throw Error('pages 记录缺失: ' + raw.pages.record);
    const actual = fileHash(record);
    if (raw.pages.sha256 && raw.pages.sha256 !== actual) throw Error('pages记录版本已变化，请重跑 S3 并更新 task.json');
    raw.pages = {...raw.pages, record: path.relative(path.dirname(path.resolve(output)), record), sha256: actual};
  }
  return normalize(raw, defaults);
}
function requiresIndependent(audit) {
  if (audit.documentContract?.reliability === '2') {
    if (!audit.taskContract) throw Error('新版audit缺少任务合同');
    return normalize(audit.taskContract).reviewPolicy === 'independent';
  }
  return audit.documentContract?.kind === 'report';
}
/* 装配期需要按作者书写的相对路径取原始记录；load() 之后该路径已改写为相对输出。 */
function authoredPageRecord(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!raw.pages?.record) return null;
  return path.resolve(path.dirname(path.resolve(file)), raw.pages.record);
}
module.exports = {hash, fileHash, stable, normalize, read, install, load, requiresIndependent, authoredPageRecord};
