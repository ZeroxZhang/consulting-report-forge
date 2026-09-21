'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const blueprint = require('./deck_blueprint.cjs');
const template = JSON.parse(fs.readFileSync(require('node:path').resolve(__dirname, '../tests/fixtures/legacy-deck-blueprint.json'), 'utf8'));

const valid = blueprint.validate(template);
assert.equal(valid.status, 'PASS', JSON.stringify(valid.errors));
assert.equal(valid.inventory.slides, 3);
assert.deepEqual(valid.inventory.densities, {balanced: 1, dense: 1});
assert.ok(blueprint.validate(template, {ready: true}).errors.some(error => /仍为 to_verify/.test(error)));
const readyTemplate = JSON.parse(JSON.stringify(template));
readyTemplate.slides[1].sourcePlan = {status: 'verified', keys: ['S1']};
assert.equal(blueprint.validate(readyTemplate, {ready: true}).status, 'PASS');

const cases = [
  [doc => { doc.deck.decision = ''; }, /deck.decision/],
  [doc => { doc.slides[0].pageRole = 'analysis'; }, /第1页须为 cover/],
  [doc => { doc.slides[1].density.evidenceUnits = [doc.slides[1].density.evidenceUnits[0]]; }, /至少需要 2 个/],
  [doc => { doc.slides[2].density.evidenceUnits = doc.slides[2].density.evidenceUnits.filter(unit => unit.role !== 'implication'); }, /必须有 role="implication"/],
  [doc => { doc.slides[1].sourcePlan = {status: 'verified', keys: []}; }, /verified 须列出/],
  [doc => { doc.slides[1].visual = {...doc.slides[1].visual, form: 'kit.unknown'}; }, /未知图示形式/],
  [doc => { doc.slides[1].sequence = 4; }, /sequence 须等于 2/]
];
for (const [mutate, pattern] of cases) {
  const doc = JSON.parse(JSON.stringify(template));
  mutate(doc);
  const result = blueprint.validate(doc);
  assert.equal(result.status, 'FAIL', JSON.stringify(doc));
  assert.ok(result.errors.some(error => pattern.test(error)), JSON.stringify(result.errors));
}
// 已移除字段的残留必须显式报错，不能被静默忽略
const residual = JSON.parse(JSON.stringify(template));
residual.deck.route = 'static-report';
const residualResult = blueprint.validate(residual);
assert.equal(residualResult.status, 'FAIL');
assert.ok(residualResult.errors.some(error => /deck\.route 已移除/.test(error)), JSON.stringify(residualResult.errors));
console.log(JSON.stringify({pass: true, checks: cases.length + 6, residualRouteRejected: true}));
