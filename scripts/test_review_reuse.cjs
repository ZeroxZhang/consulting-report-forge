'use strict';
/* 使用真实文件和两轮验收夹具走完整归档/覆写/继承/聚合链；不把夹具 PASS 当业务报告评价。 */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), zlib = require('node:zlib');
const contract = require('./report_contract.cjs'), evidence = require('./audit_evidence.cjs');
const reviews = require('./review_contract.cjs'), {aggregate} = require('./aggregate_reviews.cjs');
const {snapshotReview, loadSnapshot} = require('./snapshot_review.cjs');
const {prepareReuse} = require('./prepare_review_reuse.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, value) => { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n'); };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-review-reuse-'));
let checks = 0;
const equal = (a, b) => { assert.deepEqual(a, b); checks++; };
const rejects = (fn, pattern) => { assert.throws(fn, pattern); checks++; };

function png(seed) {
  const crc = buffer => { let value = 0xffffffff; for (const byte of buffer) { value ^= byte; for (let i = 0; i < 8; i++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; };
  const chunk = (type, bytes) => { const name = Buffer.from(type), size = Buffer.alloc(4), checksum = Buffer.alloc(4); size.writeUInt32BE(bytes.length); checksum.writeUInt32BE(crc(Buffer.concat([name, bytes]))); return Buffer.concat([size, name, bytes, checksum]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rgb = Buffer.from(contract.hash(seed).slice(0, 6), 'hex');
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.concat([Buffer.from([0]), rgb]))), chunk('IEND', Buffer.alloc(0))]);
}
function pdf(texts) {
  const font = 3 + texts.length * 2, objects = [null, '<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Count ' + texts.length + ' /Kids [' + texts.map((_, i) => (3 + i * 2) + ' 0 R').join(' ') + '] >>'];
  texts.forEach((text, i) => {
    const stream = 'BT /F1 12 Tf 10 40 Td (' + text.replace(/[()\\]/g, '') + ') Tj ET';
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /Font << /F1 ' + font + ' 0 R >> >> /Contents ' + (4 + i * 2) + ' 0 R >>', '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream');
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let result = '%PDF-1.4\n'; const offsets = [0];
  for (let i = 1; i < objects.length; i++) { offsets.push(Buffer.byteLength(result)); result += i + ' 0 obj\n' + objects[i] + '\nendobj\n'; }
  const xref = Buffer.byteLength(result);
  result += 'xref\n0 ' + objects.length + '\n0000000000 65535 f \n' + offsets.slice(1).map(n => String(n).padStart(10, '0') + ' 00000 n \n').join('') + 'trailer\n<< /Size ' + objects.length + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return result;
}
function fixture(directory, texts = ['alpha', 'beta'], options = {}) {
  const renderDir = path.join(directory, 'renders'), htmlFile = path.join(directory, 'output', 'decks', 'deck.html');
  fs.mkdirSync(renderDir, {recursive: true}); fs.mkdirSync(path.dirname(htmlFile), {recursive: true});
  const pagesFile = path.join(directory, 'records', 'pages.json'), blueprintFile = path.join(directory, 'records', 'deck-blueprint.json');
  write(pagesFile, {version: 4, pages: texts}); write(blueprintFile, {schemaVersion: 2, pages: texts});
  const task = contract.normalize({complexity: options.simple ? 'simple' : 'complex', majorConclusion: !options.simple, kind: 'report',
    pages: {record: options.absoluteRecord ? pagesFile : '../../records/pages.json', sha256: contract.fileHash(pagesFile)},
    blueprint: {record: options.absoluteRecord ? blueprintFile : '../../records/deck-blueprint.json', sha256: contract.fileHash(blueprintFile)}});
  const sections = texts.map((text, i) => '<section class="slide" data-page-id="p' + (i + 1) + '" data-content-hash="' + contract.hash(text) + '">' + text + '</section>');
  const globalStyle = options.globalStyle || 'default';
  fs.writeFileSync(htmlFile, contract.install('<html><head><style>/*' + globalStyle + '*/</style></head><body>' + sections.join('') + '</body></html>', task));
  const pdfFile = path.join(renderDir, 'deck.pdf'); fs.writeFileSync(pdfFile, pdf(texts));
  const rows = [], pdfRows = [];
  texts.forEach((text, i) => {
    const screen = path.join(renderDir, 'p' + (i + 1) + '.png'), printed = path.join(renderDir, 'pdf-p' + (i + 1) + '.png');
    fs.writeFileSync(screen, png(text + globalStyle + (options.imageChange === i + 1 ? 'new-image' : '')));
    fs.writeFileSync(printed, png(text + globalStyle));
    rows.push({page: i + 1, screenshot: path.basename(screen)}); pdfRows.push({page: i + 1, path: printed});
  });
  const artifacts = {html: {path: htmlFile, sha256: contract.fileHash(htmlFile)}, pdf: {path: pdfFile, sha256: contract.fileHash(pdfFile), pages: texts.length}};
  const manifest = evidence.manifest({pages: sections.map((content, i) => ({page: i + 1, pageId: 'p' + (i + 1), content, styles: [options.pageStyle === i + 1 ? 'new-page-style' : 'same-page-style']})), dependencies: {styles: globalStyle}}, rows, pdfRows, artifacts, task, renderDir, {renderer: 'file-fixture'});
  const audit = {tier: 'acceptance', acceptance: {complete: true}, geometryStatus: 'PASS', errors: [], warnings: ['复核文字可读性'],
    pages: texts.length, pdfPages: texts.length, input: htmlFile, htmlArtifact: artifacts.html, pdfArtifact: artifacts.pdf,
    documentContract: {reliability: '2', kind: 'report'}, taskContract: task, evidenceManifest: manifest, rows};
  const auditFile = path.join(renderDir, 'audit.json'); write(auditFile, audit);
  return {directory, renderDir, audit, auditFile, htmlFile, pdfFile, pagesFile, blueprintFile};
}
function coverage(audit, role, reviewer, pages = Array.from({length: audit.pages}, (_, i) => i + 1)) {
  return {reviewer, independence: role, layers: [...reviews.layers], htmlPages: pages, pdfPages: pages,
    evidence: audit.evidenceManifest.entries.filter(e => pages.includes(e.page)).map(e => ({id: e.id}))};
}
function completeReview(run) {
  const a = run.audit, review = {schemaVersion: 3, status: 'complete', reviewer: 'author-a; reviewer-b', independence: 'independent',
    htmlSha256: a.htmlArtifact.sha256, pdfSha256: a.pdfArtifact.sha256, auditSha256: contract.hash(contract.stable(a)),
    coverage: [coverage(a, 'author', 'author-a'), coverage(a, 'independent', 'reviewer-b')],
    checks: Object.fromEntries(['analysis', 'evidence', 'visual'].map(k => [k, {status: 'pass', basis: '测试夹具中的已完成审查。'}])),
    warningReview: a.warnings.map(warning => ({warning, status: 'accepted', note: '测试夹具中的已记录处置。'})),
    issues: [{severity: 'minor', status: 'open', description: '保留原有小间距问题'}]};
  const reviewFile = path.join(run.renderDir, 'review.json'); write(reviewFile, review);
  return {review, reviewFile};
}
function reviewedDrafts(run, prepared) {
  return prepared.drafts.map(file => {
    const draft = json(path.join(prepared.directory, file));
    if (draft.pendingPages.length) draft.coverage.push(coverage(run.audit, draft.independence, draft.reviewer, draft.pendingPages));
    draft.pendingPages = []; draft.status = 'complete';
    for (const item of Object.values(draft.checks)) Object.assign(item, {status: 'pass', basis: '本轮测试夹具模拟实际复核返回。'});
    draft.warningReview = run.audit.warnings.map(warning => ({warning, status: 'accepted', note: '本轮重新处置。'}));
    return draft;
  });
}
function finalizePrepared(run, prepared) {
  const drafts = reviewedDrafts(run, prepared);
  const result = aggregate(run.audit, drafts, {baseDir: run.renderDir, auditDir: run.renderDir, inputDirs: drafts.map(() => prepared.directory)});
  equal(result.status, 'complete');
  const reviewFile = path.join(run.renderDir, 'review.json'); write(reviewFile, result);
  return {review: result, reviewFile};
}

try {
  const live = path.join(root, 'live'), first = fixture(live), finished = completeReview(first);
  equal(reviews.validate(finished.review, first.audit, {baseDir: first.renderDir, auditDir: first.renderDir}), []);
  const snapshot1 = path.join(root, 'snapshots', 'v1');
  const saved = snapshotReview({auditFile: first.auditFile, reviewFile: finished.reviewFile, outputDir: snapshot1});
  equal(saved.status, 'archived');
  equal(saved.histories, 0);
  rejects(() => snapshotReview({auditFile: first.auditFile, reviewFile: finished.reviewFile, outputDir: snapshot1}), /已存在/);
  const archived1 = loadSnapshot(snapshot1);
  equal(fs.readFileSync(path.resolve(snapshot1, archived1.audit.htmlArtifact.path), 'utf8'), fs.readFileSync(first.htmlFile, 'utf8'));
  equal(reviews.taskRecords(archived1.audit, {auditDir: snapshot1}).map(r => contract.fileHash(r.path)), [first.audit.taskContract.pages.sha256, first.audit.taskContract.blueprint.sha256]);

  // 在原路径覆写 HTML/PDF、截图和来源记录，上一轮快照仍可独立验证。
  const second = fixture(live, ['alpha revised', 'beta']);
  equal(loadSnapshot(snapshot1).review.status, 'complete');
  equal(second.audit.evidenceManifest.dependenciesSha256, first.audit.evidenceManifest.dependenciesSha256);
  const prepared = prepareReuse({auditFile: second.auditFile, snapshotDir: snapshot1, outputDir: path.join(root, 'prepared-2')});
  equal(prepared.eligiblePages, [2]); equal(prepared.requiresReview, [1]);
  const rawDrafts = prepared.drafts.map(file => json(path.join(prepared.directory, file)));
  equal(rawDrafts.map(d => d.status), ['incomplete', 'incomplete']);
  equal(rawDrafts.flatMap(d => Object.values(d.checks).map(c => c.status)), Array(6).fill('not_reviewed'));
  equal(rawDrafts.every(d => d.issues.some(i => i.description === finished.review.issues[0].description)), true);
  const unreviewed = aggregate(second.audit, rawDrafts, {baseDir: second.renderDir, auditDir: second.renderDir, inputDirs: rawDrafts.map(() => prepared.directory)});
  equal(unreviewed.status, 'incomplete');
  const missing = clone(rawDrafts[0]); missing.status = 'complete'; Object.values(missing.checks).forEach(c => { c.status = 'pass'; c.basis = '故意遗漏改页的夹具'; });
  equal(reviews.validate(missing, second.audit, {baseDir: prepared.directory, auditDir: second.renderDir}).some(e => /缺页/.test(e)), true);
  const secondReview = finalizePrepared(second, prepared);
  equal(secondReview.review.issues.length, 1);
  const snapshot2 = path.join(root, 'snapshots', 'v2');
  equal(snapshotReview({auditFile: second.auditFile, reviewFile: secondReview.reviewFile, outputDir: snapshot2}).histories, 1);
  fs.rmSync(snapshot1, {recursive: true}); fs.rmSync(live, {recursive: true});
  const moved = path.join(root, 'moved-v2'); fs.renameSync(snapshot2, moved);
  equal(loadSnapshot(moved).review.status, 'complete');
  const third = fixture(path.join(root, 'third'), ['alpha revised', 'beta']);
  equal(prepareReuse({auditFile: third.auditFile, snapshotDir: moved, outputDir: path.join(root, 'prepared-3')}).eligiblePages, [1, 2]);

  // 问题追踪独立于页面覆盖：同描述不同位置不得互抵，零页复用仍保留旧问题来源。
  const issueRun = fixture(path.join(root, 'issues-old')), issueReview = completeReview(issueRun);
  issueReview.review.issues = [1, 2].map(page => ({page, severity: 'minor', status: 'open', description: '文字间距需要调整'}));
  write(issueReview.reviewFile, issueReview.review);
  const issueSnapshot = path.join(root, 'issues-snapshot');
  snapshotReview({auditFile: issueRun.auditFile, reviewFile: issueReview.reviewFile, outputDir: issueSnapshot});
  equal(reviews.issueIdentity(issueReview.review.issues[0]) === reviews.issueIdentity(issueReview.review.issues[1]), false);
  equal(reviews.issueIdentity({...issueReview.review.issues[0], id: 'issue-a'}) === reviews.issueIdentity({...issueReview.review.issues[0], id: 'issue-b'}), false);
  equal(reviews.issueIdentity({...issueReview.review.issues[0], id: 1}) === reviews.issueIdentity({...issueReview.review.issues[0], id: 2}), false);
  equal(reviews.issueIdentity({...issueReview.review.issues[0], id: 'issue-a', status: 'resolved'}) === reviews.issueIdentity({...issueReview.review.issues[0], id: 'issue-a'}), true);
  const issueSame = fixture(path.join(root, 'issues-same'));
  const issueReuse = prepareReuse({auditFile: issueSame.auditFile, snapshotDir: issueSnapshot, outputDir: path.join(root, 'issues-reuse')});
  const missingLocation = reviewedDrafts(issueSame, issueReuse);
  for (const draft of missingLocation) { delete draft.priorReview; draft.issues = draft.issues.filter(i => i.page === 1); }
  const lostLocation = aggregate(issueSame.audit, missingLocation, {baseDir: issueSame.renderDir, auditDir: issueSame.renderDir, inputDirs: missingLocation.map(() => issueReuse.directory)});
  equal(lostLocation.status, 'incomplete');
  equal(lostLocation.aggregationErrors.some(e => /丢失旧未决问题/.test(e)), true);

  const issueChanged = fixture(path.join(root, 'issues-changed'), ['alpha changed', 'beta changed']);
  const issuePrepared = prepareReuse({auditFile: issueChanged.auditFile, snapshotDir: issueSnapshot, outputDir: path.join(root, 'issues-prepared')});
  equal(issuePrepared.eligiblePages, []);
  const issueRaw = issuePrepared.drafts.map(file => json(path.join(issuePrepared.directory, file)));
  equal(issueRaw.every(d => d.priorReview && d.coverage.length === 0 && d.status === 'incomplete'), true);
  const issueDrafts = reviewedDrafts(issueChanged, issuePrepared);
  const noIssues = clone(issueDrafts); noIssues.forEach(d => { d.issues = []; });
  const issueAggregate = drafts => aggregate(issueChanged.audit, drafts, {baseDir: issueChanged.renderDir, auditDir: issueChanged.renderDir, inputDirs: drafts.map(() => issuePrepared.directory)});
  equal(issueAggregate(noIssues).status, 'incomplete');
  equal(issueAggregate(noIssues).aggregationErrors.some(e => /priorReview.*丢失旧未决问题/.test(e)), true);
  const malformedPrior = clone(issueDrafts); malformedPrior[0].priorReview.reviewScope = 'unknown';
  equal(issueAggregate(malformedPrior).status, 'incomplete');
  for (const draft of issueDrafts) for (const issue of draft.issues) { issue.status = 'resolved'; issue.resolution = '本轮对应页面已调整间距。'; }
  const resolvedIssues = issueAggregate(issueDrafts);
  equal(resolvedIssues.status, 'complete');
  equal(resolvedIssues.issues.length, 2);
  equal(Boolean(resolvedIssues.priorReview), true);
  equal(resolvedIssues.coverage.every(c => !c.inheritedFrom), true);
  const resolvedFile = path.join(issueChanged.renderDir, 'review.json'); write(resolvedFile, resolvedIssues);
  const issueNextSnapshot = path.join(root, 'issues-next-snapshot');
  equal(snapshotReview({auditFile: issueChanged.auditFile, reviewFile: resolvedFile, outputDir: issueNextSnapshot}).histories, 1);
  fs.rmSync(issueRun.directory, {recursive: true}); fs.rmSync(issueChanged.directory, {recursive: true}); fs.rmSync(issueSnapshot, {recursive: true});
  const issueMoved = path.join(root, 'issues-moved'); fs.renameSync(issueNextSnapshot, issueMoved);
  const migratedIssues = loadSnapshot(issueMoved);
  equal(migratedIssues.review.issues.every(i => i.status === 'resolved'), true);
  equal(fs.existsSync(path.resolve(issueMoved, migratedIssues.review.priorReview.review.path)), true);
  const furtherIssueRun = fixture(path.join(root, 'issues-next'), ['alpha changed again', 'beta changed again']);
  const furtherPrepared = prepareReuse({auditFile: furtherIssueRun.auditFile, snapshotDir: issueMoved, outputDir: path.join(root, 'issues-next-prepared')});
  const furtherReview = finalizePrepared(furtherIssueRun, furtherPrepared);
  equal(furtherReview.review.issues, []); // 已明确解决的问题不要求后续每轮重复携带。
  const furtherSnapshot = path.join(root, 'issues-final-snapshot');
  equal(snapshotReview({auditFile: furtherIssueRun.auditFile, reviewFile: furtherReview.reviewFile, outputDir: furtherSnapshot}).histories, 2);
  fs.rmSync(issueMoved, {recursive: true}); fs.rmSync(furtherIssueRun.directory, {recursive: true});
  equal(loadSnapshot(furtherSnapshot).review.status, 'complete');

  for (const [label, options, expected] of [['style', {globalStyle: 'changed'}, []], ['page-style', {pageStyle: 1}, [2]], ['image', {imageChange: 1}, [2]]]) {
    const changed = fixture(path.join(root, label), ['alpha revised', 'beta'], options);
    equal(prepareReuse({auditFile: changed.auditFile, snapshotDir: moved, outputDir: path.join(root, 'prepared-' + label)}).eligiblePages, expected);
  }
  const noStyle = clone(third.audit.evidenceManifest.entries[0]); delete noStyle.pageStyleSha256;
  equal(reviews.reuseDifferences(noStyle, noStyle).some(s => /pageStyleSha256/.test(s)), true);
  const reordered = clone(third.audit.evidenceManifest.entries[0]); reordered.page = 2;
  equal(reviews.reuseDifferences(reordered, third.audit.evidenceManifest.entries[0]).includes('page'), true);

  // 明确标记的单人 partial 历史只贡献自己的角色，不再被递归当成双角色终稿。
  const partialRun = fixture(path.join(root, 'partial')), full = completeReview(partialRun);
  const source = clone(full.review); source.reviewer = 'author-a'; source.independence = 'author'; source.coverage = [source.coverage[0]];
  const sourceFile = path.join(partialRun.renderDir, 'author.json'); write(sourceFile, source);
  const inherited = clone(full.review);
  inherited.coverage[0].inheritedFrom = {audit: {path: 'audit.json', sha256: contract.fileHash(partialRun.auditFile)}, review: {path: 'author.json', sha256: contract.fileHash(sourceFile)}, reviewScope: 'partial', basis: '仅继承原作者已审的证据。'};
  equal(reviews.validate(inherited, partialRun.audit, {baseDir: partialRun.renderDir, auditDir: partialRun.renderDir}), []);
  const wrongScope = clone(inherited); delete wrongScope.coverage[0].inheritedFrom.reviewScope;
  equal(reviews.validate(wrongScope, partialRun.audit, {baseDir: partialRun.renderDir, auditDir: partialRun.renderDir}).some(e => /缺页/.test(e)), true);
  write(full.reviewFile, inherited);
  const partialSnapshot = path.join(root, 'partial-snapshot');
  equal(snapshotReview({auditFile: partialRun.auditFile, reviewFile: full.reviewFile, outputDir: partialSnapshot}).histories, 1);
  rejects(() => snapshotReview({auditFile: partialRun.auditFile, reviewFile: sourceFile, outputDir: path.join(root, 'partial-root')}), /缺页/);

  for (const [label, change, pattern] of [
    ['major', r => r.issues.push({severity: 'major', status: 'open', description: '未解决的分母错误'}), /问题未解决/],
    ['unfinished', r => { r.status = 'incomplete'; }, /未完成/],
    ['warning', r => { r.warningReview = []; }, /告警未处置/],
    ['identity', r => { r.coverage[1].reviewer = 'author-a'; }, /身份重叠/]
  ]) {
    const bad = fixture(path.join(root, label + '-source')), completed = completeReview(bad); change(completed.review); write(completed.reviewFile, completed.review);
    rejects(() => snapshotReview({auditFile: bad.auditFile, reviewFile: completed.reviewFile, outputDir: path.join(root, label + '-snapshot')}), pattern);
  }
  const changedSource = clone(third.audit); write(third.blueprintFile, {unreviewed: true}); changedSource.taskContract.blueprint.sha256 = contract.fileHash(third.blueprintFile);
  equal(reviews.auditErrors(changedSource, {auditDir: third.renderDir}).some(e => /内嵌合同不一致/.test(e)), true);
  const tampered = path.join(root, 'tampered'); fs.cpSync(moved, tampered, {recursive: true});
  const tamperedManifest = json(path.join(tampered, 'snapshot.json'));
  const historyImage = tamperedManifest.files.find(f => f.path.startsWith('history/') && f.path.endsWith('.png'));
  fs.appendFileSync(path.join(tampered, historyImage.path), 'changed');
  rejects(() => loadSnapshot(tampered), /篡改/);
  const escaped = path.join(root, 'escaped'); fs.cpSync(moved, escaped, {recursive: true});
  const escapeEntry = json(path.join(escaped, 'snapshot.json')).files.find(f => f.path.endsWith('.png'));
  const externalImage = path.join(root, 'external.png'); fs.copyFileSync(path.join(escaped, escapeEntry.path), externalImage);
  fs.unlinkSync(path.join(escaped, escapeEntry.path)); fs.symlinkSync(externalImage, path.join(escaped, escapeEntry.path));
  rejects(() => loadSnapshot(escaped), /逃出目录/);
  const absolute = fixture(path.join(root, 'absolute'), ['alpha', 'beta'], {absoluteRecord: true}), absoluteReview = completeReview(absolute);
  rejects(() => snapshotReview({auditFile: absolute.auditFile, reviewFile: absoluteReview.reviewFile, outputDir: path.join(root, 'absolute-snapshot')}), /绝对/);

  // 历史链超过上限时拒绝，不通过缓存绕过递归范围。
  const deep = fixture(path.join(root, 'deep')), base = completeReview(deep); let previousFile = base.reviewFile;
  for (let i = 1; i <= 13; i++) {
    const next = clone(base.review);
    for (const c of next.coverage) c.inheritedFrom = {audit: {path: 'audit.json', sha256: contract.fileHash(deep.auditFile)}, review: {path: path.basename(previousFile), sha256: contract.fileHash(previousFile)}, basis: '明确来源的历史继承夹具。'};
    previousFile = path.join(deep.renderDir, 'review-' + i + '.json'); write(previousFile, next);
  }
  rejects(() => snapshotReview({auditFile: deep.auditFile, reviewFile: previousFile, outputDir: path.join(root, 'too-deep')}), /超过|链过深/);
  console.log(JSON.stringify({pass: true, checks, scope: '不可变快照、原位置覆写、单页复用、双角色双媒介、来源与图像失效、partial 来源、同文问题身份、零页复用的问题追踪、解决记录及递归迁移'}));
} finally { fs.rmSync(root, {recursive: true, force: true}); }
