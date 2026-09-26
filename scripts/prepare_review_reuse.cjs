/* 对比当前验收与不可变快照，只准备已看证据的继承范围和未审草稿；绝不生成新的 PASS。 */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const {hash, fileHash, stable, requiresIndependent} = require('./report_contract.cjs');
const {auditErrors, reuseDifferences, layers} = require('./review_contract.cjs');
const {loadSnapshot, resolveOutput} = require('./snapshot_review.cjs');
const clone = value => JSON.parse(JSON.stringify(value));

function prepareReuse({auditFile, snapshotDir, outputDir}) {
  if (!auditFile || !snapshotDir || !outputDir) throw Error('须明确当前 audit、快照目录和全新准备目录');
  auditFile = path.resolve(auditFile);
  const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
  const errors = auditErrors(audit, {auditDir: path.dirname(auditFile)});
  if (errors.length) throw Error('当前验收不可用于复核准备：' + errors.join('；'));
  const previous = loadSnapshot(snapshotDir), destination = resolveOutput(outputDir);
  if (fs.existsSync(destination)) throw Error('准备目录已存在，拒绝覆盖：' + destination);
  const oldEvidence = new Map(previous.audit.evidenceManifest.entries.map(e => [e.id, e]));
  const priorReview = {
    audit: {path: path.relative(destination, previous.auditFile), sha256: fileHash(previous.auditFile)},
    review: {path: path.relative(destination, previous.reviewFile), sha256: fileHash(previous.reviewFile)},
    reviewScope: 'complete', basis: '沿用本轮修订的上一完整审查，只追踪未决问题；不增加任何页面覆盖。'
  };
  const currentEvidence = audit.evidenceManifest.entries;
  const reusableIds = new Set(), pages = [];
  for (let page = 1; page <= audit.pages; page++) {
    const entries = currentEvidence.filter(e => e.page === page), differences = [];
    for (const entry of entries) {
      const changes = reuseDifferences(entry, oldEvidence.get(entry.id));
      differences.push(...changes.map(change => entry.medium + ': ' + change));
    }
    // 一页的两种媒介作为同一复核单元；任一改变就重看该页两种媒介。
    if (!differences.length) entries.forEach(e => reusableIds.add(e.id));
    pages.push({page, pageId: entries[0]?.pageId, status: differences.length ? 'requires_review' : 'eligible', reasons: [...new Set(differences)]});
  }
  const roles = requiresIndependent(audit) ? ['author', 'independent'] : ['author'];
  const drafts = [];
  for (const role of roles) {
    const names = [...new Set(previous.review.coverage.filter(c => c.independence === role).map(c => c.reviewer))].sort();
    for (const [index, reviewer] of (names.length ? names : ['']).entries()) {
      const coverage = [];
      for (const old of previous.review.coverage.filter(c => c.independence === role && c.reviewer === reviewer)) {
        const evidence = old.evidence.filter(e => reusableIds.has(e.id)).map(e => ({id: e.id}));
        if (!evidence.length) continue;
        const selected = new Set(evidence.map(e => e.id));
        coverage.push({reviewer, independence: role, layers: [...layers],
          htmlPages: currentEvidence.filter(e => e.medium === 'html' && selected.has(e.id)).map(e => e.page),
          pdfPages: currentEvidence.filter(e => e.medium === 'pdf' && selected.has(e.id)).map(e => e.page), evidence,
          inheritedFrom: {
            audit: {path: path.relative(destination, previous.auditFile), sha256: fileHash(previous.auditFile)},
            review: {path: path.relative(destination, previous.reviewFile), sha256: fileHash(previous.reviewFile)},
            reviewScope: 'complete',
            basis: '页身份、页序、内容、页级样式、公共依赖和两种媒介图像摘要均未改变；仅沿用同一审查者此前实际覆盖。'
          }});
      }
      const htmlCovered = new Set(coverage.flatMap(c => c.htmlPages)), pdfCovered = new Set(coverage.flatMap(c => c.pdfPages));
      const covered = new Set([...htmlCovered].filter(page => pdfCovered.has(page)));
      const pendingPages = pages.filter(p => !covered.has(p.page)).map(p => p.page);
      const draft = {schemaVersion: require('./contract_capabilities.cjs').capabilities(audit.taskContract).finalReview, status: 'incomplete', reviewer, independence: role,
        htmlSha256: audit.htmlArtifact.sha256, pdfSha256: audit.pdfArtifact.sha256, auditSha256: hash(stable(audit)),
        priorReview: clone(priorReview),
        ...(require('./contract_capabilities.cjs').capabilities(audit.taskContract).analysis?{analysisSha256: null}:{}),
        ...(require('./contract_capabilities.cjs').capabilities(audit.taskContract).strict?{analysisAlgorithm:'semantic-v2'}:{}),
        coverage, checks: Object.fromEntries(['analysis', 'evidence', 'visual'].map(k => [k, {status: 'not_reviewed', basis: ''}])),
        warningReview: [], issues: clone(previous.review.issues.filter(i => i.status === 'open')),
        pendingPages, preparationNote: '先实际审查待重审页的 HTML/PDF，并补入 coverage；重新判断全篇分析、证据与视觉及当前告警。旧问题保留原身份并明确标记 open/resolved，不能删除。此草稿不可交付。'};
      drafts.push({file: role + '-' + (index + 1) + '.json', draft});
    }
  }
  const plan = {schemaVersion: 1, status: 'prepared', auditSha256: hash(stable(audit)), pages,
    inheritedIssues: clone(previous.review.issues.filter(i => i.status === 'open')),
    warningsToReview: audit.warnings || [], drafts: drafts.map(({file, draft}) => ({file, reviewer: draft.reviewer, independence: draft.independence, pendingPages: draft.pendingPages})),
    note: 'eligible 只表示图像与声明依赖未变，不证明整篇论证仍然成立；checks 及告警必须由本轮审查者填写。'};
  fs.mkdirSync(path.dirname(destination), {recursive: true}); fs.mkdirSync(destination);
  try {
    for (const {file, draft} of drafts) fs.writeFileSync(path.join(destination, file), JSON.stringify(draft, null, 2) + '\n', {flag: 'wx'});
    fs.writeFileSync(path.join(destination, 'reuse-plan.json'), JSON.stringify(plan, null, 2) + '\n', {flag: 'wx'});
  } catch (error) { fs.rmSync(destination, {recursive: true, force: true}); throw error; }
  return {status: 'prepared', directory: destination, eligiblePages: pages.filter(p => p.status === 'eligible').map(p => p.page),
    requiresReview: pages.filter(p => p.status !== 'eligible').map(p => p.page), drafts: drafts.map(d => d.file)};
}

if (require.main === module) {
  try {
    const [auditFile, snapshotDir, outputDir, ...rest] = process.argv.slice(2);
    if (!outputDir || rest.length) throw Error('用法：node scripts/prepare_review_reuse.cjs 当前audit.json 快照目录 全新准备目录');
    console.log(JSON.stringify(prepareReuse({auditFile, snapshotDir, outputDir}), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {prepareReuse};
