/* 归档已完成的审查及其整条证据链。新目录只写一次；不改 HTML/PDF 字节，不代签审查结论。 */
'use strict';
const fs = require('node:fs'), path = require('node:path');
const {hash, fileHash, stable} = require('./report_contract.cjs');
const reviewContract = require('./review_contract.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const relative = (from, to) => path.relative(from, to).split(path.sep).join('/');

/* 输出可以尚不存在；向上找到真实目录，避免 /var 与 /private/var 混算相对路径。 */
function resolveOutput(directory) {
  let current = path.resolve(directory); const rest = [];
  while (!fs.existsSync(current)) { rest.unshift(path.basename(current)); current = path.dirname(current); }
  return path.join(fs.realpathSync(current), ...rest);
}

function within(root, file) {
  const rel = path.relative(root, file);
  return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}

/* 收集有向无环的来源图。partial 仅允许出现在明确声明的历史节点；快照根必须完整。 */
function collectGraph(auditFile, reviewFile, {confinedTo} = {}) {
  const nodes = new Map(), visiting = new Set(), cache = new Map();
  const root = confinedTo && fs.realpathSync(confinedTo);
  function checked(file) {
    const resolved = fs.realpathSync(file);
    if (root && !within(root, resolved)) throw Error('快照验证依赖逃出目录：' + file);
    if (!fs.statSync(resolved).isFile()) throw Error('不是文件：' + file);
    return resolved;
  }
  function visit(af, rf, scope = 'complete', depth = 0) {
    if (depth > 12) throw Error('审查继承链超过 12 层');
    af = checked(af); rf = checked(rf);
    const key = af + '\0' + rf + '\0' + scope;
    if (visiting.has(key)) throw Error('审查继承循环');
    if (nodes.has(key)) return nodes.get(key);
    visiting.add(key);
    const audit = read(af), review = read(rf), files = [af, rf];
    for (const medium of ['html', 'pdf']) {
      const artifact = audit[medium + 'Artifact'];
      if (typeof artifact?.path !== 'string') throw Error('audit 缺少 ' + medium + ' 产物路径');
      files.push(checked(path.resolve(path.dirname(af), artifact.path)));
    }
    for (const entry of audit.evidenceManifest?.entries || []) {
      if (typeof entry?.path !== 'string') throw Error('证据路径缺失');
      files.push(checked(path.resolve(path.dirname(af), entry.path)));
    }
    const records = reviewContract.taskRecords(audit, {auditDir: path.dirname(af)});
    for (const record of records) {
      if (path.isAbsolute(record.record)) throw Error('快照不能迁移绝对 task.' + record.key + '.record；请用相对 HTML 路径重新装配和验收');
      files.push(checked(record.path));
    }
    const node = {auditFile: af, reviewFile: rf, audit, review, scope, files, records, children: new Map(),
      auditSha256: fileHash(af), reviewSha256: fileHash(rf)};
    nodes.set(key, node);
    function visitReference(old) {
      if (old.reviewScope !== undefined && !['complete', 'partial'].includes(old.reviewScope)) throw Error('旧审查范围须为 complete/partial');
      if (typeof old.audit?.path !== 'string' || typeof old.review?.path !== 'string') throw Error('继承来源路径缺失');
      return visit(path.resolve(path.dirname(rf), old.audit.path), path.resolve(path.dirname(rf), old.review.path), old.reviewScope || 'complete', depth + 1);
    }
    for (const [index, coverage] of (review.coverage || []).entries()) if (coverage.inheritedFrom) node.children.set(index, visitReference(coverage.inheritedFrom));
    if (review.priorReview !== undefined) {
      if (!review.priorReview || typeof review.priorReview !== 'object') throw Error('priorReview 须为审查来源对象');
      node.priorChild = visitReference(review.priorReview);
    }
    const errors = reviewContract.validate(review, audit, {auditDir: path.dirname(af), baseDir: path.dirname(rf), partial: scope === 'partial', cache});
    if (errors.length) throw Error('不能归档未完成或已失效的审查：' + errors.join('；'));
    visiting.delete(key);
    return node;
  }
  const head = visit(auditFile, reviewFile);
  return {head, nodes: [...nodes.values()]};
}

function snapshotReview({auditFile, reviewFile, outputDir}) {
  if (!auditFile || !reviewFile || !outputDir) throw Error('须明确 audit、完整 review 和全新快照目录');
  const destination = resolveOutput(outputDir);
  if (fs.existsSync(destination)) throw Error('快照目录已存在，拒绝覆盖：' + destination);
  const graph = collectGraph(path.resolve(auditFile), path.resolve(reviewFile));
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  fs.mkdirSync(destination); // 独占创建；失败不清理调用者的目录。
  const files = [], written = new Map();
  let nextHistory = 0;
  graph.head.output = destination;
  for (const node of graph.nodes) if (node !== graph.head) node.output = path.join(destination, 'history', String(++nextHistory).padStart(3, '0'));
  function remember(file) { files.push({path: relative(destination, file), sha256: fileHash(file)}); }
  function writeJson(file, value) {
    fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', {flag: 'wx'}); remember(file);
  }
  function copy(source, target, expected) {
    fs.mkdirSync(path.dirname(target), {recursive: true});
    if (fs.existsSync(target)) {
      if (fileHash(target) !== expected) throw Error('快照中的依赖路径冲突：' + target);
      return;
    }
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    if (fileHash(target) !== expected) throw Error('归档过程中源文件已变更：' + source);
    remember(target);
  }
  function writeNode(node) {
    if (written.has(node)) return written.get(node);
    const dir = node.output;
    fs.mkdirSync(path.join(dir, 'artifacts'), {recursive: true});
    fs.mkdirSync(path.join(dir, 'evidence'), {recursive: true});
    const audit = clone(node.audit), review = clone(node.review);
    function rebind(old, child) {
      const previous = writeNode(child);
      old.audit = {path: relative(dir, previous.auditFile), sha256: fileHash(previous.auditFile)};
      old.review = {path: relative(dir, previous.reviewFile), sha256: fileHash(previous.reviewFile)};
    }
    for (const [index, child] of node.children) {
      rebind(review.coverage[index].inheritedFrom, child);
    }
    if (node.priorChild) rebind(review.priorReview, node.priorChild);
    // 原 record 可以含 ../；增加容器深度以保持引用和 HTML 摘要，不把来源复制到快照外。
    const depth = Math.max(0, ...node.records.map(record => path.normalize(record.record).split(path.sep).findIndex(part => part !== '..')).map(count => count < 0 ? 0 : count));
    const htmlTarget = path.join(dir, 'artifacts', 'html', ...Array(depth + 1).fill('root'), 'deck.html');
    for (const medium of ['html', 'pdf']) {
      const artifact = audit[medium + 'Artifact'];
      const target = medium === 'html' ? htmlTarget : path.join(dir, 'artifacts', 'deck.pdf');
      copy(path.resolve(path.dirname(node.auditFile), artifact.path), target, artifact.sha256);
      artifact.path = relative(dir, target);
    }
    for (const record of node.records) {
      const target = path.resolve(path.dirname(htmlTarget), record.record);
      if (!within(path.join(dir, 'artifacts', 'html'), target)) throw Error('任务来源记录无法保存在快照目录内：' + record.record);
      copy(record.path, target, record.sha256);
    }
    audit.input = audit.htmlArtifact.path;
    const evidenceById = new Map();
    for (const entry of audit.evidenceManifest.entries) {
      const extension = path.extname(entry.path).toLowerCase();
      const suffix = ['.png', '.jpg', '.jpeg', '.webp'].includes(extension) ? extension : '.bin';
      const target = path.join(dir, 'evidence', entry.medium + '-p' + String(entry.page).padStart(3, '0') + suffix);
      copy(path.resolve(path.dirname(node.auditFile), entry.path), target, entry.sha256);
      entry.path = relative(dir, target); evidenceById.set(entry.id, entry);
    }
    for (const row of audit.rows || []) {
      const image = audit.evidenceManifest.entries.find(e => e.medium === 'html' && e.page === row.page);
      if (image && row.screenshot !== undefined) row.screenshot = image.path;
    }
    for (const coverage of review.coverage) for (const evidence of coverage.evidence) {
      if (evidence.path !== undefined) evidence.path = evidenceById.get(evidence.id).path;
      if (evidence.sha256 !== undefined) evidence.sha256 = evidenceById.get(evidence.id).sha256;
    }
    review.auditSha256 = hash(stable(audit));
    const result = {auditFile: path.join(dir, 'audit.json'), reviewFile: path.join(dir, 'review.json')};
    writeJson(result.auditFile, audit); writeJson(result.reviewFile, review);
    written.set(node, result);
    return result;
  }
  try {
    writeNode(graph.head);
    const manifest = {schemaVersion: 1, kind: 'review-snapshot', createdAt: new Date().toISOString(),
      root: {audit: 'audit.json', review: 'review.json'},
      source: {auditSha256: graph.head.auditSha256, reviewSha256: graph.head.reviewSha256},
      files: files.sort((a, b) => a.path.localeCompare(b.path))};
    fs.writeFileSync(path.join(destination, 'snapshot.json'), JSON.stringify(manifest, null, 2) + '\n', {flag: 'wx'});
    loadSnapshot(destination);
    return {status: 'archived', directory: destination, histories: graph.nodes.length - 1, files: files.length};
  } catch (error) {
    fs.rmSync(destination, {recursive: true, force: true}); // 仅移除本次独占创建的不完整快照。
    throw error;
  }
}

function loadSnapshot(directory) {
  const root = fs.realpathSync(path.resolve(directory)), manifest = read(path.join(root, 'snapshot.json'));
  if (manifest.schemaVersion !== 1 || manifest.kind !== 'review-snapshot' || !Array.isArray(manifest.files)) throw Error('不是可用的审查快照');
  function local(name) {
    if (typeof name !== 'string' || !name || path.isAbsolute(name) || name.split(/[\\/]/).includes('..')) throw Error('快照文件路径须在目录内：' + name);
    const file = fs.realpathSync(path.resolve(root, name));
    if (!within(root, file)) throw Error('快照文件链接逃出目录：' + name);
    return file;
  }
  const listed = new Set();
  for (const entry of manifest.files) {
    const file = local(entry.path);
    if (listed.has(file) || fileHash(file) !== entry.sha256) throw Error('快照文件重复或已篡改：' + entry.path);
    listed.add(file);
  }
  const auditFile = local(manifest.root?.audit), reviewFile = local(manifest.root?.review);
  const graph = collectGraph(auditFile, reviewFile, {confinedTo: root});
  for (const node of graph.nodes) for (const file of node.files) if (!listed.has(file)) throw Error('快照清单未绑定验证依赖：' + relative(root, file));
  return {directory: root, auditFile, reviewFile, audit: graph.head.audit, review: graph.head.review, manifest};
}

if (require.main === module) {
  try {
    const [auditFile, reviewFile, outputDir, ...rest] = process.argv.slice(2);
    if (!outputDir || rest.length) throw Error('用法：node scripts/snapshot_review.cjs audit.json review.json 全新快照目录');
    console.log(JSON.stringify(snapshotReview({auditFile, reviewFile, outputDir}), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {snapshotReview, loadSnapshot, resolveOutput};
