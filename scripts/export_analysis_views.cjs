/* 派生阅读视图，不维护第二套主张，也不自动复制原始附件。 */
'use strict';
const fs=require('node:fs');
const content=require('./content_contract.cjs');
function render(doc){
  if(doc?.schemaVersion!==3)throw Error('分析视图仅支持 schema3');
  const metrics=content.evaluateMetrics({sourcePlan:{claims:doc.claims}}),resolve=s=>content.interpolateText(s,metrics),a=doc.analysis;
  const lines=['# '+doc.deck.title,'','> 本文由蓝图派生；修订请回到蓝图。不是独立的审查通过证明。','','## 核心问题','',a.brief.question,'','## 综合回答','',resolve(a.synthesis.basis),...a.synthesis.answerClaimRefs.map(id=>resolve(doc.claims.find(c=>c.id===id).statement)),'','## 判断与证据',''];
  for(const c of doc.claims)lines.push('### '+c.id+' · '+c.kind+' / '+c.verification,'',resolve(c.statement),'','- 限制：'+resolve(c.limitation),'- 来源：'+c.sourceKeys.map(k=>doc.sources[k].label+' · '+doc.sources[k].locator).join('；'),'');
  lines.push('## 问题与工作','');for(const i of a.issues)lines.push('- '+i.id+'：'+i.question+'（'+i.disposition+'）');
  lines.push('','## 缺口','');for(const g of a.gaps)lines.push('- '+g.id+'：'+g.description+'；'+g.status+'；影响 '+g.affectedRefs.join('、'));
  lines.push('','## 方案与条件','');for(const o of a.options)lines.push('- '+o.id+'：'+o.label+'；约束 '+o.constraints+'；验证 '+o.validation);
  lines.push('','## 附件索引','');for(const f of doc.artifacts)lines.push('- '+f.id+' · '+f.kind+' · SHA-256 '+f.sha256+'（原文件未复制）');return lines.join('\n')+'\n';
}
function run(args){const [input,output]=args;if(!output||args.length!==2)throw Error('用法：node scripts/export_analysis_views.cjs blueprint.json new-view.md');if(fs.existsSync(output))throw Error('拒绝覆盖已有视图');fs.writeFileSync(output,render(JSON.parse(fs.readFileSync(input,'utf8'))),{flag:'wx'});return {status:'exported',output};}
if(require.main===module){try{console.log(JSON.stringify(run(process.argv.slice(2))));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={render,run};
