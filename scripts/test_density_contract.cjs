'use strict';
const assert = require('node:assert/strict');
const pages = require('./check_pages.cjs');

const unit = (role, purpose) => ({role, purpose});
const base = (over = {}) => ({
  page: 1,
  proves: '毛利下降说明折扣策略并未形成可持续增长。',
  form: 'html.text',
  density: {
    profile: 'balanced',
    evidenceUnits: [
      unit('primary', '展示毛利、销量和价格的同口径变化。'),
      unit('support', '给出基准期与同行差异，限定结论范围。')
    ],
    spaceIntent: '主证据位于左侧主体阅读区，支持证据紧随其后，底部仅保留来源安全区。'
  },
  ...over
});

const valid = {version: 2, pages: [base()]};
assert.equal(pages.check(valid).status, 'PASS', JSON.stringify(pages.check(valid).errors));
assert.equal(pages.check({version: 1, pages: [{page: 1, proves: '历史稿仍可读取。', form: 'html.text'}]}).status, 'PASS');

const cases = [
  [{version: 2, pages: [base({density: undefined})]}, /density 缺失/],
  [{version: 2, pages: [base({density: {...base().density, profile: 'dense'}})]}, /至少需要 3 个/],
  [{version: 2, pages: [base({density: {...base().density, profile: 'sparse'}})]}, /sparseReason/],
  [{version: 2, pages: [base({density: {...base().density, evidenceUnits: [unit('primary', '展示毛利与价格变化。'), unit('primary', '重复主角色不应通过。')]}})]}, /role 重复/]
];
for (const [doc, pattern] of cases) {
  const out = pages.check(doc);
  assert.equal(out.status, 'FAIL', JSON.stringify(doc));
  assert.ok(out.errors.some(error => pattern.test(error)), JSON.stringify(out.errors));
}

const slides = [{page: 1, form: 'html.text', visual: '', proves: valid.pages[0].proves, densityProfile: 'balanced', role: null}];
assert.deepEqual(pages.verifyDeck(valid, slides), []);
assert.ok(pages.verifyDeck(valid, [{...slides[0], densityProfile: 'dense'}]).some(error => /data-density-profile/.test(error)));
assert.deepEqual(pages.inventory(valid).densities, {balanced: 1});
console.log(JSON.stringify({pass: true, checks: 8, densityProfiles: pages.DENSITY_PROFILES}));
