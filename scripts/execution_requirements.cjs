/* 固定要求是执行合同，不以篇幅、材料类型或图型数量豁免。 */
'use strict';
const FIXED=Object.freeze([
  Object.freeze({id:'chart-diversity',text:'图表多样性：必须尽可能多地使用不同类型的图表。'}),
  Object.freeze({id:'layout-diversity',text:'版式布局多样性：必须尽可能多地采用不同的版式来组织每一页的内容。'})
]);
function items(task){return [
  {id:'analysis',title:'完成问题拆解、证据、分析与缺口处置',phase:'analysis',source:'analysis'},
  {id:'chart-plan',title:FIXED[0].text+' 完成整册规划。',phase:'planning',requirementRefs:['chart-diversity'],dependsOn:['analysis'],criterion:'planning'},
  {id:'layout-plan',title:FIXED[1].text+' 完成逐页与整册规划。',phase:'planning',requirementRefs:['layout-diversity'],dependsOn:['analysis'],criterion:'planning'},
  ...(task.workMode==='editorial'?[]:[{id:'analysis-review',title:'核实当前前置分析审查',phase:'planning',source:'analysis-review',dependsOn:['analysis']}]),
  {id:'representatives',title:'查看代表页，分别核实图表表达与版式阅读路径',phase:'production',requirementRefs:FIXED.map(x=>x.id),dependsOn:['chart-plan','layout-plan'],criterion:'visual'},
  {id:'production',title:'完成当前全部页面制作与整册检查',phase:'production',dependsOn:['representatives'],criterion:'production'},
  {id:'acceptance',title:'完成正式工程验收及排印检查',phase:'acceptance',source:'acceptance',dependsOn:['production']},
  {id:'final-review',title:'完成当前 HTML/PDF 实际审查及问题处置',phase:'review',source:'final-review',dependsOn:['acceptance']},
  ...FIXED.map(r=>({id:r.id,title:r.text,phase:'review',requirementRefs:[r.id],source:r.id,dependsOn:['final-review']})),
  {id:'package',title:'核实正式打包结果',phase:'delivery',source:'package',dependsOn:['final-review','chart-diversity','layout-diversity']},
  {id:'archive',title:'保存审查与执行恢复归档',phase:'delivery',source:'archive',dependsOn:['package']},
  {id:'delivery',title:'交付文件及验证范围说明，记录实际发送结果',phase:'delivery',dependsOn:['package','archive'],criterion:'delivery'}
].map(x=>({dependsOn:[],requirementRefs:[],...x,...(x.source?{}:{state:'pending',evidenceRefs:[]})}));}
function enabled(task){return task?.policyVersions?.workflow==='execution-plan-1';}
module.exports={FIXED,items,enabled};
