#!/usr/bin/env node
/* 只读本地实现入口；选型范围见 references/expression-guide.md。 */
'use strict';
const forms = require('../assets/deck-forms.js');
function sweep() {
  return {
    generatedFrom: { forms: forms.version },
    families: Object.entries(forms.familyLabels).map(([family, label]) => ({ family, label,
      forms: forms.list().filter(form => forms.familyOf(form) === family).map(form => {
        const entry = forms.get(form);
        return { form, label: entry.label, annotation: entry.annotation, capacity: entry.capacity };
      })
    }))
  };
}
function text(report, onlyFamily) {
  const lines = ['# 已有实现入口', '> 选型看 references/expression-guide.md；没有封装的图可用 svg.custom，并记录 visual。'];
  for (const group of report.families) {
    if (onlyFamily && group.family !== onlyFamily) continue;
    lines.push('', '## ' + group.label + '（' + group.family + '）');
    for (const item of group.forms) {
      const annotation = item.annotation === 'layer' ? '通用标注层' : item.annotation === 'comparisons' ? '自带 Δ 入口' : '未接入';
      lines.push('- ' + item.form + '：' + item.label + ' · ' + item.capacity + ' · 旁解读 ' + annotation);
    }
  }
  return lines.join('\n');
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2); let family;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--family' && args[i + 1]) family = args[++i];
      else if (!['--json', '--check'].includes(args[i])) throw Error('未知参数或缺少值：' + args[i]);
    }
    if (family && !forms.familyLabels[family]) throw Error('未知族：' + family);
    const report = sweep();
    for (const form of forms.list()) if (!forms.familyLabels[forms.familyOf(form)]) throw Error('入口缺少分析族：' + form);
    console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : text(report, family));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { sweep, text };
