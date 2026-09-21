'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const verifier = require('./verify_blueprint_pages.cjs');

const blueprint = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../tests/fixtures/legacy-deck-blueprint.json'), 'utf8'));
blueprint.slides[1].sourcePlan = {status: 'verified', keys: ['S1']};
const content = verifier.contentSlides(blueprint);
/* 正文页按蓝图选的布局逐格填形式：布局定了有几格，regions 就必须有几项。 */
const regions = {
  L01: [{form: 'kit.dumbbell'}, {form: 'html.text'}],
  L27: [{form: 'html.text'}, {form: 'html.matrix'}, {form: 'html.text'}]
};
const pages = {
  version: 3,
  pages: content.map((slide, index) => ({
    page: index + 1,
    layout: slide.visual.layout,
    proves: slide.proves,
    form: slide.visual.form,
    regions: regions[slide.visual.layout],
    density: JSON.parse(JSON.stringify(slide.density))
  }))
};
assert.deepEqual(verifier.verify(blueprint, pages), []);

const cases = [
  [doc => { doc.pages[0].proves = '改写后的关系。'; }, /proves 与 blueprint/],
  /* 只改 pages.json 一侧：必须同时改主展品那一格，否则先被 pages 合同拦下，测不到蓝图对账。 */
  [doc => { doc.pages[1].form = 'html.table'; doc.pages[1].regions[1] = {form: 'html.table'}; }, /form 与 blueprint/],
  [doc => { doc.pages[0].layout = 'L17'; doc.pages[0].form = 'html.table'; doc.pages[0].regions = [{form: 'html.table'}, {form: 'html.text'}]; }, /layout 与 blueprint/],
  [doc => { doc.pages[0].density.evidenceUnits[1].role = 'context'; }, /density 与 blueprint/],
  [doc => { doc.pages.pop(); }, /正文页数不一致/]
];
for (const [mutate, pattern] of cases) {
  const doc = JSON.parse(JSON.stringify(pages));
  mutate(doc);
  const errors = verifier.verify(blueprint, doc);
  assert.ok(errors.some(error => pattern.test(error)), JSON.stringify(errors));
}
console.log(JSON.stringify({pass: true, checks: cases.length + 1, staticContentSlides: content.length, layouts: content.map(slide => slide.visual.layout)}));
