/* schema3证据归属与有限继承。校验文件关联，不宣称能机器证明人的判断。 */
const fs = require('node:fs'), path = require('node:path');
const {hash, fileHash, stable, requiresIndependent, read: readTask, normalize: normalizeTask} = require('./report_contract.cjs');
const layers = ['page', 'exhibit', 'annotation', 'typography'];
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/* 有 id 时沿用稳定 id；历史问题用原位置、严重度和描述区分，不能只凭同一句话互抵。 */
function issueIdentity(issue) {
  if (typeof issue?.id === 'string' && issue.id.trim()) return 'id:' + issue.id.trim();
  if (typeof issue?.id === 'number' && Number.isFinite(issue.id)) return 'numeric-id:' + issue.id;
  const fields = ['page', 'pageId', 'pages', 'medium', 'layer', 'location', 'position', 'target', 'exhibit', 'objectId', 'severity', 'description'];
  return 'legacy:' + hash(stable(Object.fromEntries(fields.filter(key => issue?.[key] !== undefined).map(key => [key, issue[key]]))));
}

function preserveIssues(current, previous) {
  const retained = new Set((Array.isArray(current.issues) ? current.issues : []).map(issueIdentity));
  for (const issue of previous.issues.filter(item => item.status === 'open')) {
    if (!retained.has(issueIdentity(issue))) throw Error('继承时丢失旧未决问题：' + issue.description + '（' + issueIdentity(issue) + '）');
  }
}

/* coverage 继承与整轮问题追踪使用同一来源校验，不将 priorReview 计入已看页面。 */
function loadPriorReview(old, {baseDir, trail, cache}) {
  if (!old || typeof old !== 'object' || !old.basis?.trim() || trail.length >= 12) throw Error('继承缺少变更依据或链过深');
  if (old.reviewScope !== undefined && !['complete', 'partial'].includes(old.reviewScope)) throw Error('旧审查范围须为 complete/partial');
  if (typeof old.audit?.path !== 'string' || typeof old.review?.path !== 'string' || !digest(old.audit.sha256) || !digest(old.review.sha256)) throw Error('旧审查来源缺少路径或摘要');
  const auditFile = fs.realpathSync(path.resolve(baseDir, old.audit.path)), reviewFile = fs.realpathSync(path.resolve(baseDir, old.review.path));
  if (trail.includes(reviewFile)) throw Error('审查继承循环');
  if (fileHash(auditFile) !== old.audit.sha256 || fileHash(reviewFile) !== old.review.sha256) throw Error('旧审查/audit摘要不符');
  const audit = JSON.parse(fs.readFileSync(auditFile)), review = JSON.parse(fs.readFileSync(reviewFile));
  const sourcePartial = old.reviewScope === 'partial';
  const cacheKey = auditFile + ':' + old.audit.sha256 + ':' + reviewFile + ':' + old.review.sha256 + ':' + sourcePartial + ':' + trail.length;
  let oldErrors = cache.get(cacheKey);
  if (!oldErrors) {
    oldErrors = validate(review, audit, {baseDir: path.dirname(reviewFile), auditDir: path.dirname(auditFile), partial: sourcePartial, trail: [...trail, reviewFile], cache});
    cache.set(cacheKey, oldErrors);
  }
  if (oldErrors.length) throw Error(oldErrors.join('；'));
  return {audit, review};
}

/* pages/blueprint 的 record 相对 HTML，而不是 audit；快照保持内嵌合同不变并复制同位置的记录。 */
function taskRecords(audit, {auditDir = process.cwd()} = {}) {
  const htmlDir = path.dirname(path.resolve(auditDir, audit.htmlArtifact?.path || ''));
  const records=['pages', 'blueprint', 'analysisReview'].filter(key => audit.taskContract?.[key] !== undefined).map(key => {
    const record = audit.taskContract[key];
    if (typeof record?.record !== 'string' || !record.record || !digest(record.sha256)) throw Error('task.' + key + ' 缺少记录路径或摘要');
    return {key, record: record.record, path: path.resolve(htmlDir, record.record), sha256: record.sha256};
  });
  const blueprint=records.find(r=>r.key==='blueprint');
  if(blueprint){const doc=JSON.parse(fs.readFileSync(blueprint.path,'utf8'));if(doc.schemaVersion===3)for(const a of doc.artifacts||[]){
    if(path.isAbsolute(a.path))throw Error('分析附件须用相对蓝图路径，保证可迁移');
    const file=path.resolve(path.dirname(blueprint.path),a.path);
    records.push({key:'artifact:'+a.id,record:path.relative(htmlDir,file),path:file,sha256:a.sha256});
  }}
  return records;
}

/* 新旧两轮共用同一判据。缺少页级样式摘要属于不可判，不能让 undefined === undefined 变成可继承。 */
function reuseDifferences(current, previous) {
  if (!previous) return ['旧审查没有此证据'];
  if (!current) return ['当前验收没有此证据'];
  const changed = [];
  for (const key of ['id', 'pageId', 'medium', 'page']) if (current[key] !== previous[key]) changed.push(key);
  for (const key of ['pageSha256', 'pageStyleSha256', 'dependenciesSha256', 'sha256']) {
    if (!digest(current[key]) || !digest(previous[key])) changed.push(key + ' 缺失或无效');
    else if (current[key] !== previous[key]) changed.push(key);
  }
  return changed;
}

/* 复用准备和快照也检查真实文件，不能仅相信 audit 内部声称的摘要。 */
function auditErrors(audit, {auditDir = process.cwd()} = {}) {
  const errors = [];
  if (!audit || typeof audit !== 'object') return ['缺少 audit'];
  if (audit.geometryStatus !== 'PASS' || !Array.isArray(audit.errors) || audit.errors.length) errors.push('工程验收未通过');
  if ((audit.tier ?? 'acceptance') !== 'acceptance' || audit.acceptance?.complete === false) errors.push('只有完整 acceptance audit 可用于审查和继承');
  if (!Number.isInteger(audit.pages) || audit.pages < 1) errors.push('audit 页数无效');
  for (const medium of ['html', 'pdf']) {
    const artifact = audit[medium + 'Artifact'];
    try {
      if (!artifact || typeof artifact.path !== 'string' || !digest(artifact.sha256) ||
          fileHash(path.resolve(auditDir, artifact.path)) !== artifact.sha256) throw Error();
    } catch { errors.push(medium + ' 产物缺失或已修改'); }
  }
  if (audit.documentContract?.reliability === '2') {
    try {
      const task = readTask(fs.readFileSync(path.resolve(auditDir, audit.htmlArtifact.path), 'utf8'));
      if (!task || !audit.taskContract || stable(task) !== stable(normalizeTask(audit.taskContract))) errors.push('audit 任务合同与 HTML 内嵌合同不一致');
    } catch (error) { errors.push('HTML 任务合同不可核对：' + error.message); }
  }
  try {
    for (const record of taskRecords(audit, {auditDir})) {
      if (fileHash(record.path) !== record.sha256) errors.push('task.' + record.key + ' 记录已修改');
    }
  } catch (error) { errors.push('任务来源记录不可核对：' + error.message); }
  const entries = audit.evidenceManifest?.entries;
  if (!Array.isArray(entries) || !entries.length) return [...errors, 'audit缺少真实渲染证据清单'];
  const ids = new Set(), slots = new Set(), pageIds = new Map();
  for (const entry of entries) {
    if (!entry || ids.has(entry.id) || !/^[\w-]+$/.test(entry.pageId || '') || !['html', 'pdf'].includes(entry.medium) ||
        entry.id !== entry.medium + ':' + entry.pageId || !Number.isInteger(entry.page) || entry.page < 1 || entry.page > audit.pages) {
      errors.push('audit证据身份无效'); continue;
    }
    ids.add(entry.id);
    const slot = entry.medium + ':' + entry.page;
    if (slots.has(slot)) errors.push('audit同一媒介/页号重复：' + slot);
    slots.add(slot);
    if (pageIds.has(entry.page) && pageIds.get(entry.page) !== entry.pageId) errors.push('audit同页身份不一致：' + entry.page);
    pageIds.set(entry.page, entry.pageId);
    if (entry.sourceSha256 !== audit[entry.medium + 'Artifact']?.sha256 || !digest(entry.pageSha256) ||
        entry.pageStyleSha256 !== undefined && !digest(entry.pageStyleSha256) || !digest(entry.dependenciesSha256) ||
        entry.dependenciesSha256 !== audit.evidenceManifest.dependenciesSha256) errors.push('audit证据来源/依赖错配：' + entry.id);
    try {
      if (!entry || typeof entry.path !== 'string' || !digest(entry.sha256) ||
          fileHash(path.resolve(auditDir, entry.path)) !== entry.sha256) throw Error();
    } catch { errors.push('当前渲染图缺失/已改变：' + (entry?.id || '未知证据')); }
  }
  for (const medium of ['html', 'pdf']) for (let page = 1; page <= audit.pages; page++) {
    if (!slots.has(medium + ':' + page)) errors.push('audit渲染证据缺页：' + medium + ':' + page);
  }
  return errors;
}

function validate(review, audit, {baseDir = process.cwd(), auditDir = baseDir, partial = false, trail = [], cache = new Map()} = {}) {
  baseDir = fs.realpathSync(baseDir); auditDir = fs.realpathSync(auditDir);
  const errors = [], fail = msg => errors.push(msg);
  const caps=require('./contract_capabilities.cjs').capabilities(audit?.taskContract),expectedVersion=caps.finalReview;
  if (!review || review.schemaVersion !== expectedVersion) return ['新版交付必须使用review schemaVersion:'+expectedVersion];
  if(caps.analysis){
    if(audit.taskContract.analysisPreview)errors.push('分析预览不能作为正式审查');
    try{const records=taskRecords(audit,{auditDir}),bp=records.find(r=>r.key==='blueprint'),pp=records.find(r=>r.key==='pages');
      const doc=JSON.parse(fs.readFileSync(bp.path,'utf8'));
      if(caps.strict&&review.analysisAlgorithm!==caps.algorithm)errors.push('最终审查分析算法身份错误');
      if(review.analysisSha256!==require('./analysis_contract.cjs').digest(doc,audit.taskContract))errors.push('最终审查未绑定当前分析版本');
      errors.push(...require('./report_contract.cjs').verifyPlan(audit.taskContract,path.dirname(path.resolve(auditDir,audit.htmlArtifact.path)),JSON.parse(fs.readFileSync(pp.path,'utf8'))));
    }catch(e){errors.push('最终分析绑定失败：'+e.message);}
  }
  errors.push(...auditErrors(audit, {auditDir}));
  if (!audit || typeof audit !== 'object') return errors;
  if (review.status !== 'complete') fail('审查未完成');
  if (review.htmlSha256 !== audit.htmlArtifact?.sha256 || review.pdfSha256 !== audit.pdfArtifact?.sha256 || review.auditSha256 !== hash(stable(audit))) fail('审查未绑定当前HTML/PDF/audit');
  if (typeof review.reviewer !== 'string' || !review.reviewer.trim() || !['author', 'independent'].includes(review.independence)) fail('审查身份缺失');
  for (const k of ['analysis', 'evidence', 'visual']) {
    const c = review.checks?.[k];
    if (!c || !(k === 'visual' ? ['pass'] : ['pass', 'not_applicable']).includes(c.status) || typeof c.basis !== 'string' || !c.basis.trim()) fail(k + '未完成或依据缺失');
  }
  if (!Array.isArray(review.issues)) fail('缺少issues');
  for (const i of review.issues || []) if (!i || !['minor', 'major', 'blocking'].includes(i.severity) || !['open', 'resolved'].includes(i.status) || !i.description?.trim() || i.severity !== 'minor' && i.status !== 'resolved') fail('问题未解决或格式无效');
  if (review.priorReview !== undefined) {
    try { preserveIssues(review, loadPriorReview(review.priorReview, {baseDir, trail, cache}).review); }
    catch (error) { fail('priorReview 无效：' + error.message); }
  }
  if (review.aggregationErrors?.length) fail('聚合仍有错误');
  // 旧稿没有 tier 字段，按验收档处理；迭代/冒烟档缺打印、PDF、断网等结论，不能进入审查。
  if ((audit.tier ?? 'acceptance') !== 'acceptance' || audit.acceptance?.complete === false) fail('audit 不是验收档（tier=' + (audit.tier ?? 'acceptance') + '，未跑完：' + ((audit.acceptance?.missingStages || []).join('、') || '不完整') + '），只有验收档能作为审查与交付依据');
  // audit 的告警是"需目视判断"的清单，不是自动通过项。审查者可以判它不构成问题，但不能不处置：
  // 不处置的告警等于被无声丢掉，而制稿里最贵的漏项恰恰是这类没有被任何人看过的软发现。
  const dispositions = new Map();
  for (const entry of Array.isArray(review.warningReview) ? review.warningReview : []) {
    if (!entry || typeof entry.warning !== 'string' || !['accepted', 'fixed'].includes(entry.status) || typeof entry.note !== 'string' || !entry.note.trim()) {fail('告警处置格式无效：每条须为 {warning, status: accepted|fixed, note}'); continue;}
    dispositions.set(entry.warning, entry);
  }
  // 逐份输入的校验不强求覆盖全集（多位审查者各处置一部分）；聚合后的最终 review 才必须逐条对上。
  if (!partial) for (const warning of Array.isArray(audit.warnings) ? audit.warnings : []) if (!dispositions.has(warning)) fail('audit 告警未处置（须写明接受理由或修复位置）：' + warning);
  const manifest = audit.evidenceManifest?.entries;
  if (!Array.isArray(manifest) || !manifest.length) return [...errors, 'audit缺少真实渲染证据清单'];
  const verified = new Map(manifest.filter(e => e && typeof e.id === 'string').map(e => [e.id, e]));
  if (!Array.isArray(review.coverage) || !review.coverage.length) return [...errors, '审查coverage缺失'];
  const sets = {author: {html: new Set(), pdf: new Set()}, independent: {html: new Set(), pdf: new Set()}};
  const reviewers={author:new Set(),independent:new Set()};
  for (const c of review.coverage) {
    if (!c || !sets[c.independence] || typeof c.reviewer !== 'string' || !c.reviewer.trim() || !Array.isArray(c.layers) || layers.some(l => !c.layers.includes(l))) {fail('coverage身份/四层范围无效'); continue;}
    reviewers[c.independence].add(c.reviewer.trim());
    if(partial&&(c.reviewer!==review.reviewer||c.independence!==review.independence))fail('原始审查coverage与顶层身份不一致');
    const refs = Array.isArray(c.evidence) ? c.evidence.map(e => e?.id) : [];
    if (!refs.length || new Set(refs).size !== refs.length || refs.some(id => !verified.has(id))) fail('coverage证据不属于当前audit');
    for (const medium of ['html', 'pdf']) {
      const pages = c[medium + 'Pages'];
      if (!Array.isArray(pages) || new Set(pages).size !== pages.length || pages.some(n => !Number.isInteger(n) || n < 1 || n > audit.pages)) {fail('coverage页集合无效'); continue;}
      const covered = refs.map(id => verified.get(id)).filter(e => e?.medium === medium).map(e => e.page);
      if (covered.length !== pages.length || pages.some(n => !covered.includes(n))) fail('coverage页号/媒介与证据不匹配');
      pages.forEach(n => sets[c.independence][medium].add(n));
    }
    if (c.inheritedFrom) {
      try {
        const {audit: oa, review: or} = loadPriorReview(c.inheritedFrom, {baseDir, trail, cache});
        for (const id of refs) {
          const current = verified.get(id), previous = oa.evidenceManifest.entries.find(e => e.id === id);
          // pageStyleSha256 只覆盖本页能命中的样式；别的页面改样式不再连带作废这一页。
          const differences = reuseDifferences(current, previous);
          if (differences.length) throw Error('页面/字体样式/图像/页序已变或不可判，须重新审查：' + id + '（' + differences.join('、') + '）');
          if (!or.coverage.some(oc => oc.reviewer === c.reviewer && oc.independence === c.independence && oc.evidence?.some(e => e.id === id))) throw Error('旧审查者未覆盖此证据：' + id);
        }
        preserveIssues(review, or);
      } catch (e) { fail('继承无效：' + e.message); }
    }
  }
  for(const name of reviewers.author)if(reviewers.independent.has(name))fail('作者与独立审查者身份重叠：'+name);
  if(!partial){
    const names=[...new Set([...reviewers.author,...reviewers.independent])].sort().join('; ');
    if(review.reviewer!==names||review.independence!==(reviewers.independent.size?'independent':'author'))fail('审查汇总身份与coverage不一致');
  }
  if (!partial) for (const role of requiresIndependent(audit) ? ['author', 'independent'] : ['author']) for (const medium of ['html', 'pdf']) for (let n = 1; n <= audit.pages; n++) if (!sets[role][medium].has(n)) fail(role + ' ' + medium + '缺页：' + n);
  return errors;
}
module.exports = {validate, layers, auditErrors, reuseDifferences, taskRecords, issueIdentity};
