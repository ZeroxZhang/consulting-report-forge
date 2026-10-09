/* 固定要求是执行合同，不以篇幅、材料类型或图型数量豁免。 */
'use strict';
const FIXED=Object.freeze([
  Object.freeze({id:'chart-diversity',text:'图表多样性：必须尽可能多地使用不同类型的图表。'}),
  Object.freeze({id:'layout-diversity',text:'版式布局多样性：必须尽可能多地采用不同的版式来组织每一页的内容。'})
]);
const MODULE_FILL=Object.freeze({id:'module-fill',text:'模块填充：必须逐一检查正文每页的每个模块及每一栏，尤其是文字模块；没有明确设计功能的大块留白必须修复，裁切和溢出必须消除。'});
function moduleFill(task){return task?.policyVersions?.workflow==='execution-plan-2';}
function fixed(task){return moduleFill(task)?[...FIXED,MODULE_FILL]:FIXED;}
function planning(task){return ['analysis','chart-plan','layout-plan',...(moduleFill(task)?['module-fill-plan']:[])];}
function items(task){const requirements=fixed(task);return [
  {id:'analysis',title:'完成问题拆解、证据、分析与缺口处置',phase:'analysis',source:'analysis'},
  {id:'chart-plan',title:FIXED[0].text+' 完成整册规划。',phase:'planning',requirementRefs:['chart-diversity'],dependsOn:['analysis'],criterion:'planning'},
  {id:'layout-plan',title:FIXED[1].text+' 完成逐页与整册规划。',phase:'planning',requirementRefs:['layout-diversity'],dependsOn:['analysis'],criterion:'planning'},
 ...(moduleFill(task)?[{id:'module-fill-plan',title:MODULE_FILL.text+' 在排版前明确各模块、栏位、内容量与留白用途。',phase:'planning',requirementRefs:['module-fill'],dependsOn:['analysis'],criterion:'planning'}]:[]),
  ...(task.workMode==='editorial'?[]:[{id:'analysis-review',title:'核实当前前置分析审查',phase:'planning',source:'analysis-review',dependsOn:['analysis']}]),
 {id:'representatives',title:moduleFill(task)?'查看代表页，分别核实图表表达、版式阅读路径与逐模块填充':'查看代表页，分别核实图表表达与版式阅读路径',phase:'production',requirementRefs:requirements.map(x=>x.id),dependsOn:planning(task).filter(id=>id!=='analysis'),criterion:'visual'},
  {id:'production',title:'完成当前全部页面制作与整册检查',phase:'production',dependsOn:['representatives'],criterion:'production'},
  {id:'acceptance',title:'完成正式工程验收及排印检查',phase:'acceptance',source:'acceptance',dependsOn:['production']},
  {id:'final-review',title:'完成当前 HTML/PDF 实际审查及问题处置',phase:'review',source:'final-review',dependsOn:['acceptance']},
 ...requirements.map(r=>({id:r.id,title:r.text,phase:'review',requirementRefs:[r.id],source:r.id,dependsOn:['final-review']})),
 {id:'package',title:'核实正式打包结果',phase:'delivery',source:'package',dependsOn:['final-review',...requirements.map(r=>r.id)]},
  {id:'archive',title:'保存审查与执行恢复归档',phase:'delivery',source:'archive',dependsOn:['package']},
  {id:'delivery',title:'交付文件及验证范围说明，记录实际发送结果',phase:'delivery',dependsOn:['package','archive'],criterion:'delivery'}
].map(x=>({dependsOn:[],requirementRefs:[],...x,...(x.source?{}:{state:'pending',evidenceRefs:[]})}));}
function enabled(task){return ['execution-plan-1','execution-plan-2'].includes(task?.policyVersions?.workflow);}
module.exports={FIXED,MODULE_FILL,fixed,planning,moduleFill,items,enabled};
