/* 将 schema 2 蓝图派生为 pages v4；不会改写输入蓝图，也不生成虚假的完整页面。 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const blueprint = require('./deck_blueprint.cjs');
const content = require('./content_contract.cjs');
const SNIPPET_MARKER = '<!-- consulting-report-forge:generated-content-snippets:v1 -->';

function sameFile(left, right) {
  if (path.resolve(left) === path.resolve(right)) return true;
  if (!fs.existsSync(left) || !fs.existsSync(right)) return false;
  const a = fs.statSync(left), b = fs.statSync(right);
  return (a.dev === b.dev && a.ino === b.ino) || fs.realpathSync(left) === fs.realpathSync(right);
}

function run(args) {
  const [input, output, ...rest] = args;
  let snippetFile;
  if (rest.length) {
    if (rest.length !== 2 || rest[0] !== '--snippets' || !rest[1]) throw Error('用法：node scripts/compile_blueprint.cjs blueprint.json pages.json [--snippets content-snippets.html]');
    snippetFile = rest[1];
  }
  if (!input || !output) throw Error('用法：node scripts/compile_blueprint.cjs blueprint.json pages.json [--snippets content-snippets.html]');
  for (const file of [output, snippetFile].filter(Boolean)) if (sameFile(input, file)) throw Error('拒绝覆盖输入蓝图：' + file);
  if (snippetFile && sameFile(output, snippetFile)) throw Error('pages 与 snippets 必须使用不同输出文件');
  const doc = JSON.parse(fs.readFileSync(input, 'utf8'));
  const checked = blueprint.validate(doc, {ready: true});
  if (checked.status !== 'PASS') throw Error('blueprint 未准备好：' + checked.errors.join('；'));
  const pages = content.compile(doc);
  // v4 接入后同样通过最终页面合同；历史检查器不应成为 schema 2 的绕过路径。
  const pageCheck = require('./check_pages.cjs').check(pages, {ratio: pages.ratio});
  if (pageCheck.status !== 'PASS') throw Error('派生 pages 无效：' + pageCheck.errors.join('；'));
  if (fs.existsSync(output)) {
    let old;
    try { old = JSON.parse(fs.readFileSync(output, 'utf8')); } catch (_) { throw Error('拒绝覆盖非生成的 pages 文件：' + output); }
    if (old.version !== 4 || !/^[a-f0-9]{64}$/.test(old.blueprintSha256 || '')) throw Error('拒绝覆盖非生成的 pages 文件：' + output);
  }
  if (snippetFile && fs.existsSync(snippetFile) && !fs.readFileSync(snippetFile, 'utf8').startsWith(SNIPPET_MARKER + '\n')) throw Error('拒绝覆盖作者片段：snippets 输出已存在且不是编译器生成文件：' + snippetFile);
  fs.mkdirSync(path.dirname(path.resolve(output)), {recursive: true});
  fs.writeFileSync(output, JSON.stringify(pages, null, 2) + '\n');
  if (snippetFile) {
    fs.mkdirSync(path.dirname(path.resolve(snippetFile)), {recursive: true});
    fs.writeFileSync(snippetFile, SNIPPET_MARKER + '\n' + pages.pages.map(content.snippets).join('\n\n') + '\n');
  }
  return {status: 'PASS', pages: pages.pages.length, blueprintSha256: pages.blueprintSha256, output: path.resolve(output),
    ...(snippetFile ? {snippets: path.resolve(snippetFile)} : {})};
}

if (require.main === module) {
  try { console.log(JSON.stringify(run(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = {run, sameFile, SNIPPET_MARKER};
