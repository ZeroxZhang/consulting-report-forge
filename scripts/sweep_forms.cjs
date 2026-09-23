#!/usr/bin/env node
/* 从形式目录与容量真源生成查询及发布目录。 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const forms = require('../assets/deck-forms.js');
const capacity=require('../assets/form-capacity.js');
const CATALOG=path.resolve(__dirname,'../references/form-capacity.md');
const ruleText=rules=>Object.entries(rules||{}).map(([key,r])=>[r.label||key,r.hardMin!==undefined?'硬下限 '+r.hardMin:'',r.hardMax!==undefined?'硬上限 '+r.hardMax:'',r.softMin!==undefined?'建议下限 '+r.softMin:'',r.softMax!==undefined?'建议上限 '+r.softMax:''].filter(Boolean).join(' · ')).join('；');
function sweep() {
  return {
    generatedFrom: { forms: forms.version },
    families: Object.entries(forms.familyLabels).map(([family, label]) => ({ family, label,
      forms: forms.list().filter(form => forms.familyOf(form) === family).map(form => {
        const entry = forms.get(form);
        return { form, label: entry.label, annotation: entry.annotation, capacity: entry.capacity, rules:capacity.rules(form), limits: entry.limits, minimumSize: forms.minimumSize(form) };
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
      lines.push('- ' + item.form + '：' + item.label + ' · ' + [ruleText(item.rules),item.capacity].filter(Boolean).join('；') + ' · 旁解读 ' + annotation + (item.minimumSize ? ' · 最低画布 ' + item.minimumSize.width + '×' + item.minimumSize.height + 'px（条数增加需重算）' : ''));
    }
  }
  return lines.join('\n');
}
function catalog(report){
  const lines=['# 形式与容量目录','','> 由 `node scripts/sweep_forms.cjs --write-catalog` 生成；下表的形式专项容量数字只在 `assets/form-capacity.js` 维护，文字说明来自 `assets/deck-forms.js`。各渲染器还会检查通用画布和可读性条件。硬容量在对应渲染器拦截；建议值供读图审查，不作为失败配额。',''];
  for(const group of report.families){lines.push('## '+group.label+'（'+group.family+'）','','| form | 形式 | 容量规则 | 其他约束 |','|---|---|---|---|');for(const item of group.forms)lines.push('| `'+item.form+'` | '+item.label+' | '+(ruleText(item.rules)||'按画面判断')+' | '+item.capacity.replace(/\|/g,'/')+' |');lines.push('');}
  return lines.join('\n');
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2); let family;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--family' && args[i + 1]) family = args[++i];
      else if (!['--json', '--check','--write-catalog'].includes(args[i])) throw Error('未知参数或缺少值：' + args[i]);
    }
    if (family && !forms.familyLabels[family]) throw Error('未知族：' + family);
    const report = sweep();
    for (const form of forms.list()) if (!forms.familyLabels[forms.familyOf(form)]) throw Error('入口缺少分析族：' + form);
    for(const form of Object.keys(capacity.RULES))if(!forms.list().includes(form))throw Error('容量规则对应未知形式：'+form);
    for(const form of forms.list())if(Object.keys(capacity.rules(form)).length&&/\d/.test(forms.get(form).capacity))throw Error('形式 '+form+' 的容量文案含数字：形式专项容量须只在 form-capacity.js 维护');
    if(args.includes('--write-catalog')){fs.writeFileSync(CATALOG,catalog(report));console.log('已生成 '+CATALOG);}
    else if(args.includes('--check')){if(!fs.existsSync(CATALOG)||fs.readFileSync(CATALOG,'utf8')!==catalog(report))throw Error('容量目录已过期：运行 node scripts/sweep_forms.cjs --write-catalog');console.log('PASS form capacity catalog');}
    else console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : text(report, family));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { sweep, text, catalog };
