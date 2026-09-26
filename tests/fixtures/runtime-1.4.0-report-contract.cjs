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
    critical: [], ...defaults, ...value};
  if (![1, 2].includes(c.version)) throw Error('不支持的任务合同版本');
  if(c.version===1&&(c.analysisReview!==undefined||c.analysisPreview!==undefined))throw Error('分析合同不能降级至 task version 1');
  if(c.version===2)for(const key of ['workMode','complexity','majorConclusion'])if(value[key]===undefined)throw Error('task2 须显式声明 '+key);
  if(c.analysisPreview!==undefined&&typeof c.analysisPreview!=='boolean')throw Error('analysisPreview 须为布尔');
  for (const [key, allowed] of Object.entries({workMode: ['editorial', 'analytical', 'exploratory'], complexity: ['simple', 'complex'], mode: ['reading', 'presentation'], ratio: ['16x9', '4x3'], kind: ['report', 'fragment', 'collection']})) {
    if (!allowed.includes(c[key])) throw Error('任务合同 ' + key + ' 无效');
  }
  if (typeof c.majorConclusion !== 'boolean') throw Error('majorConclusion 须明确为 boolean');
  require('../assets/deck-themes.js').get(c.theme);
  require('../assets/deck-typography.js').get(c.typography);
  for (const key of ['pages', 'blueprint', 'analysisReview']) if (c[key] !== undefined) {
    if (!c[key] || typeof c[key] !== 'object' || typeof c[key].record !== 'string' || !c[key].record.trim()) throw Error(key + ' 须绑定 record 路径');
    if (c[key].sha256 !== undefined && !/^[a-f0-9]{64}$/.test(c[key].sha256)) throw Error(key + '.sha256 须为 64 位十六进制');
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
  if(c.analysisPreview)html=html.replace(/<\/head>/i,'<meta name="deck-analysis-status" content="preview">\n</head>').replace(/<body([^>]*)>/i,'<body$1><div style="position:fixed;top:4px;right:12px;z-index:9999;font-size:12px;background:white;color:#8b351e">分析预览 · 尚未完成分析验收</div>');
  return html.replace(/<\/head>/i, '<script id="deck-task-contract" type="application/json">' + stable(c).replace(/</g, '\\u003c') + '</script>\n</head>');
}
function load(file, output, defaults = {}) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  // 已移除字段的残留只能由作者手写的 task.json 触发；成稿内嵌合同不追溯，否则历史交付会在打包时失败。
  if (raw.planner !== undefined) throw Error('task.json 的 planner 字段已移除：图表选型由本技能直接完成，请删除该字段');
  // 装配前核对摘要，成稿内改写为相对输出的路径；同一份 task.json 因此在任何产出位置都可复用。
  for (const key of ['pages', 'blueprint', 'analysisReview']) if (raw[key]?.record) {
    const record = path.resolve(path.dirname(path.resolve(file)), raw[key].record);
    if (!fs.existsSync(record)) throw Error(key + ' 记录缺失: ' + raw[key].record);
    const actual = fileHash(record);
    if (raw[key].sha256 && raw[key].sha256 !== actual) throw Error(key + '记录版本已变化，请重新编译并更新 task.json');
    raw[key] = {...raw[key], record: path.relative(path.dirname(path.resolve(output)), record), sha256: actual};
  }
  if(raw.pages?.record) { const pages=JSON.parse(fs.readFileSync(path.resolve(path.dirname(path.resolve(output)),raw.pages.record),'utf8')); if(pages.blueprintSchemaVersion===3)raw.analysisPreview=pages.preview===true; }
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
/* 新稿在装配与最终 QA 都重新读取权威蓝图，避免只验证两份相互一致的派生假数据。 */
function verifyPlan(contract, baseDir, pagesDoc) {
  const ref = contract.blueprint;
  if (!ref && pagesDoc.version !== 4) return [];
  if (!ref?.record || !ref.sha256) return ['task.blueprint 必须绑定权威蓝图及摘要，pages v4 不能省略'];
  const file = path.resolve(baseDir, ref.record);
  if (!fs.existsSync(file) || fileHash(file) !== ref.sha256) return ['权威 blueprint 缺失或摘要变化：重新编译与装配'];
  try {
    const doc=JSON.parse(fs.readFileSync(file, 'utf8'));
    if (([2,3].includes(doc.schemaVersion))!==(pagesDoc.version===4)) return ['blueprint schemaVersion 2 与 pages version 4 必须配套，不能退回历史合同跳过内容绑定'];
    const options={task:rebaseAnalysisTask(contract,baseDir,path.dirname(file)),baseDir:path.dirname(file),preview:pagesDoc.preview===true};
    if(doc.schemaVersion===3&&(contract.version!==2||pagesDoc.blueprintSchemaVersion!==3||contract.analysisPreview!==pagesDoc.preview))return ['schema3 须搭配 task2 与真实 preview 状态，不得降级'];
    if(doc.schemaVersion!==3&&contract.version===2)return ['task2 须搭配 schema3'];
    const errors=require('./verify_blueprint_pages.cjs').verify(doc, pagesDoc,options);
    if(doc.deck?.mode!==contract.mode || (doc.deck?.ratio||'16x9')!==contract.ratio) errors.push('task 的 mode/ratio 与权威 blueprint 不一致');
    return errors;
  }
  catch (error) { return ['权威 blueprint 校验失败：' + error.message]; }
}
/* 研究阶段只读配置，不要求尚未生成的 pages/audit 文件。 */
function rebaseAnalysisTask(task,from,to){
  const value={...task};
  if(task.analysisReview?.record)value.analysisReview={...task.analysisReview,record:path.relative(to,path.resolve(from,task.analysisReview.record))};
  return value;
}
function readAnalysisTask(file,blueprintFile){
  const task=normalize(JSON.parse(fs.readFileSync(file,'utf8')));
  return rebaseAnalysisTask(task,path.dirname(path.resolve(file)),path.dirname(path.resolve(blueprintFile)));
}
module.exports = {readAnalysisTask, rebaseAnalysisTask, hash, fileHash, stable, normalize, read, install, load, requiresIndependent, authoredPageRecord, verifyPlan};
