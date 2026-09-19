/* 静态报告的双合同对账：确保咨询叙事蓝图没有在 pages.json / HTML 制作阶段悄然漂移。 */
'use strict';
const fs = require('node:fs');
const blueprintApi = require('./deck_blueprint.cjs');
const pagesApi = require('./check_pages.cjs');

const stable = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const norm = pagesApi.norm;

function contentSlides(doc) {
  return doc.slides.filter(slide => blueprintApi.CONTENT_ROLES.has(slide.pageRole));
}

function verify(blueprint, pagesDoc) {
  const errors = [];
  const blueprintCheck = blueprintApi.validate(blueprint, {ready: true});
  if (blueprintCheck.status !== 'PASS') return ['blueprint 未准备好：' + blueprintCheck.errors.join('；')];
  const pagesCheck = pagesApi.check(pagesDoc);
  if (pagesCheck.status !== 'PASS') return ['pages.json 无效：' + pagesCheck.errors.join('；')];
  const slides = contentSlides(blueprint), pages = pagesDoc.pages;
  if (slides.length !== pages.length) errors.push('正文页数不一致：blueprint 有 ' + slides.length + ' 页，pages.json 有 ' + pages.length + ' 页；封面/章节/参考/封底不计入 pages.json');
  for (let index = 0; index < Math.min(slides.length, pages.length); index++) {
    const slide = slides[index], page = pages[index], at = '正文第 ' + (index + 1) + ' 页';
    if (page.page !== index + 1) errors.push(at + ' pages.json.page 须为连续的 ' + (index + 1));
    if (norm(slide.proves) !== norm(page.proves)) errors.push(at + ' proves 与 blueprint 不一致；不能在制作阶段替换页面要证明的关系');
    const expectedForm = slide.visual.form === 'custom' ? 'svg.custom' : slide.visual.form;
    if (page.form !== expectedForm) errors.push(at + ' form 与 blueprint 不一致：应为 ' + expectedForm + '，当前为 ' + page.form);
    if (stable(slide.density) !== stable(page.density)) errors.push(at + ' density 与 blueprint 不一致；主展品、支持证据与留白意图必须同步');
  }
  return errors;
}

if (require.main === module) {
  try {
    const [blueprintFile, pagesFile, ...rest] = process.argv.slice(2);
    if (!blueprintFile || !pagesFile || rest.length) throw Error('用法: node scripts/verify_blueprint_pages.cjs deck-blueprint.json pages.json');
    const errors = verify(JSON.parse(fs.readFileSync(blueprintFile, 'utf8')), JSON.parse(fs.readFileSync(pagesFile, 'utf8')));
    console.log(JSON.stringify({status: errors.length ? 'FAIL' : 'PASS', errors}, null, 2));
    if (errors.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = {contentSlides, verify};
