/* 选型和容量合同：检查可证伪的字段，不声称机器能判断图是否最好。 */
'use strict';
const forms=require('../assets/deck-forms.js');
const capacity=require('../assets/form-capacity.js');
const RELATIONSHIPS={
  comparison:['comparison','bridge'], trend:['trend'], composition:['composition'],
  distribution:['distribution'], correlation:['correlation'], flow:['flow','process'],
  hierarchy:['hierarchy'], kpi:['kpi'], diagram:['mechanism','process','decision'],
  table:['exact','comparison','decision'], text:['text','decision'],
  custom:['comparison','bridge','trend','composition','distribution','correlation','flow','process','hierarchy','kpi','mechanism','decision','exact','text']
};
const OVERRIDES={
  'kit.waterfall':['bridge'],'precision.waterfall':['bridge'],
  'diagram.mechanism':['mechanism'],'diagram.process':['process','flow'],
  'diagram.swimlane':['process'],'diagram.hierarchy':['hierarchy'],
  'diagram.condition':['decision'],'kit.processFlow':['process'],
  'kit.swimlane':['process'],'recipe.sankey':['flow'],
  'html.finding':['text','decision'],'html.matrix':['exact','decision'],
  'precision.columns':['comparison','bridge']
};
const nonempty=value=>typeof value==='string'&&value.trim().length>0;
function validate(visual,{required=true}={}){
  const errors=[],warnings=[];
  if(!visual||typeof visual!=='object')return {errors:['visual 须为对象'],warnings};
  let entry;
  try{entry=forms.get(visual.form);}catch(e){return {errors:[e.message],warnings};}
  const selection=visual.selection;
  if(required||selection!==undefined){
    if(!selection||typeof selection!=='object'||Array.isArray(selection))errors.push('visual.selection 须记录证据关系与选型理由');
    else{
      const allowed=OVERRIDES[entry.form]||RELATIONSHIPS[entry.family]||[];
      if(!allowed.includes(selection.relationship))errors.push(entry.form+' 的 selection.relationship 须为 '+allowed.join('/'));
      if(!nonempty(selection.reason)||selection.reason.trim().length<12)errors.push('visual.selection.reason 须具体说明此形式如何呈现本页证据关系（至少12字）');
      if(selection.alternative!==undefined&&(!nonempty(selection.alternative)||!nonempty(selection.tradeoff)))errors.push('记录备选时须同时写 alternative 与 tradeoff');
      if(selection.tradeoff!==undefined&&!nonempty(selection.alternative))errors.push('tradeoff 须对应 alternative');
    }
  }
  const rules=capacity.rules(entry.form);
  if(Object.keys(rules).length&&(required||visual.capacity!==undefined)){
    if(!visual.capacity||typeof visual.capacity!=='object'||Array.isArray(visual.capacity))errors.push(entry.form+' 须记录 visual.capacity 的实际计数');
    else{
      const result=capacity.inspect(entry.form,visual.capacity,{requireAll:true});
      errors.push(...result.errors);warnings.push(...result.warnings);
      for(const key of Object.keys(visual.capacity))if(!rules[key])errors.push(entry.form+' 未登记容量维度 '+key);
    }
  }
  return {errors,warnings};
}
module.exports={RELATIONSHIPS,OVERRIDES,validate};
