'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const verifier = require('./verify_blueprint_pages.cjs');

const blueprint = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../templates/deck-blueprint.json'), 'utf8'));
blueprint.slides[1].sourcePlan = {status: 'verified', keys: ['S1']};
const content = verifier.contentSlides(blueprint);
const pages = {
  version: 2,
  pages: content.map((slide, index) => ({
    page: index + 1,
    proves: slide.proves,
    form: slide.visual.form,
    density: JSON.parse(JSON.stringify(slide.density))
  }))
};
assert.deepEqual(verifier.verify(blueprint, pages), []);

const cases = [
  [doc => { doc.pages[0].proves = '改写后的关系。'; }, /proves 与 blueprint/],
  [doc => { doc.pages[1].form = 'html.text'; }, /form 与 blueprint/],
  [doc => { doc.pages[0].density.evidenceUnits[1].role = 'context'; }, /density 与 blueprint/],
  [doc => { doc.pages.pop(); }, /正文页数不一致/]
];
for (const [mutate, pattern] of cases) {
  const doc = JSON.parse(JSON.stringify(pages));
  mutate(doc);
  const errors = verifier.verify(blueprint, doc);
  assert.ok(errors.some(error => pattern.test(error)), JSON.stringify(errors));
}
console.log(JSON.stringify({pass: true, checks: cases.length + 1, staticContentSlides: content.length}));
