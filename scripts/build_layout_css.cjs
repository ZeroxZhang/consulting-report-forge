#!/usr/bin/env node
/* 由布局目录生成 assets/consulting-layouts.css 末尾的落位规则块。
   为什么生成：作者只该回答"这一格放什么"，不该回答"这一格在第几栏第几行"。
   让作者手抄 grid-column / grid-row，等于把目录里的几何复制一份到每一页 HTML 里——
   换布局要重抄，抄错要等 QA 量出来才发现。这里把几何一次性落到 CSS 上，页面侧只剩
   data-layout 与按序的 data-module。

   选择器用 `:nth-child(n of [data-module])` 而不是 `:nth-child(n)`：
   前者按模块序号数，正文区里混进任何非模块元素都不会让整页错位。

   跑法：
     node scripts/build_layout_css.cjs          写入 assets/consulting-layouts.css
     node scripts/build_layout_css.cjs --check  只比对，漂移则退出码 1（npm test 用） */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const grid = require(path.join(ROOT, 'assets', 'deck-grid.js'));
const layouts = require('./layout_contract.cjs');

const TARGET = path.join(ROOT, 'assets', 'consulting-layouts.css');
const START = '/* ═══ @generated:layout-placement —— 由 scripts/build_layout_css.cjs 生成，不要手改 ═══ */';
const END = '/* ═══ @generated:end ═══ */';

function block() {
  const lines = [START,
    '/* 每条布局把正文区切成固定的 12×6 格，模块按 data-module 的出现顺序逐格落位。',
    '   两种画幅共用同一套拓扑（列宽行高由 --grid-* 变量换），所以这里不区分 16:9 与 4:3。',
    '   改布局 → 改 assets/layout-atlas/catalog.json → 跑 node scripts/build_layout_css.cjs 重新生成。',
    '   校验：scripts/check_layout_grid.cjs 会逐格量实际矩形，与目录的算术对账。 */'];
  for (const layout of layouts.list()) {
    lines.push('');
    lines.push('/* ' + layout.id + ' · ' + layout.name + '（' + layout.familyName + '） */');
    layout.modules.forEach((module, index) => {
      lines.push('.slide.reading[data-layout="' + layout.id + '"] .slide__body > :nth-child('
        + (index + 1) + ' of [data-module]){grid-column:' + module.c + '/span ' + module.w
        + ';grid-row:' + module.r + '/span ' + module.h + '}');
    });
  }
  lines.push('', END);
  return lines.join('\n');
}

const css = fs.readFileSync(TARGET, 'utf8');
const startAt = css.indexOf(START), endAt = css.indexOf(END);
const head = startAt >= 0 && endAt > startAt
  ? css.slice(0, startAt)
  : css.replace(/\s*$/, '\n\n');   // 首次生成：接在现有规则之后
const next = head.replace(/\s*$/, '\n\n') + block() + '\n';

if (process.argv.includes('--check')) {
  if (css !== next) {
    console.error('assets/consulting-layouts.css 的落位规则与布局目录不一致：目录改了但 CSS 没重新生成。'
      + '\n跑 node scripts/build_layout_css.cjs 重新生成（不要手改那一段）。');
    process.exitCode = 1;
  } else {
    console.log('布局落位规则与目录一致（' + layouts.list().length + ' 条）。');
  }
} else {
  fs.writeFileSync(TARGET, next);
  const rules = layouts.list().reduce((sum, layout) => sum + layout.modules.length, 0);
  console.log('已写入 assets/consulting-layouts.css（' + layouts.list().length + ' 条布局，' + rules + ' 条落位规则）。');
}
