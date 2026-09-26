/* 严格合同的可审投影；未知自定义展品保守全签。旧 digest 不调用此模块。 */
'use strict';
const {hash,stable}=require('./report_contract.cjs');
const list=v=>Array.isArray(v)?v:[];
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const escape=s=>String(s).replace(/~/g,'~0').replace(/\//g,'~1');
const STYLE=new Set(['fontFamily','fontSize','fontWeight','gap','padding','x','y','width','height']);
function split(exhibit){return exhibit?.contract==='semantic-exhibit-v1';}
function metrics(doc){return require('./content_contract.cjs').evaluateMetrics({sourcePlan:{claims:doc.claims||[]}});}
function metricRefs(slide){
  const refs=new Set(list(slide.displayBindings).map(b=>b?.metricRef).filter(Boolean));
  function walk(v){if(Array.isArray(v))v.forEach(walk);else if(object(v)){if(typeof v.$metric==='string')refs.add(v.$metric);Object.values(v).forEach(walk);}}
  walk(slide.exhibit);return [...refs];
}
function resolve(value,values){
  if(Array.isArray(value))return value.map(v=>resolve(v,values));
  if(!object(value))return value;
  if(Object.hasOwn(value,'$metric')){
    if(Object.keys(value).length!==1||typeof value.$metric!=='string')throw Error('$metric 节点只能包含一个指标引用');
    const metric=values.find(m=>m.id===value.$metric);
    if(!metric)throw Error('展示指标引用不存在：'+value.$metric);
    return metric.value;
  }
  return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolve(v,values)]));
}
function project(doc){
  const warnings=[];
  const slides=list(doc.slides).map(slide=>{
    // 除已明确的排版字段外，未知字段也纳入签名，避免增加侧栏后漏签。
    const {sequence,wide,density,visual,...rest}=slide;
    const projected={...rest};
    if(visual){const {layout,sizing,regions,...semantic}=visual;projected.visual={...semantic,regions:list(regions).map(({span,sizing,...r})=>r)};}
    if(split(slide.exhibit)){
      const {style,...exhibit}=slide.exhibit;projected.exhibit=exhibit;
    }else if(slide.exhibit!==undefined)warnings.push({slideId:slide.id,code:'A-CUSTOM-CONSERVATIVE',message:'exhibit 未分离语义与样式，整体纳入分析摘要；排版修改也可能要求重审'});
    return projected;
  }).sort((a,b)=>String(a.id).localeCompare(String(b.id),'en'));
  const {mode,ratio,...deck}=doc.deck||{};
  return {projection:{algorithm:'semantic-v2',deck,analysis:doc.analysis,claims:doc.claims,sources:doc.sources,
    artifacts:list(doc.artifacts).map(({path,...a})=>a),slides},warnings};
}
function digest(doc){return hash(stable(project(doc).projection));}
function differences(before,after,pointer=''){
  if(stable(before)===stable(after))return [];
  if((object(before)&&object(after))||(Array.isArray(before)&&Array.isArray(after))){
    const keys=[...new Set([...Object.keys(before),...Object.keys(after)])].sort();
    return keys.flatMap(k=>differences(before[k],after[k],pointer+'/'+escape(k)));
  }
  return [{pointer:pointer||'/',before:before===undefined?null:before,after:after===undefined?null:after,change:before===undefined?'added':after===undefined?'removed':'changed'}];
}
function validate(doc){
  const errors=[];let values;
  try{values=metrics(doc);}catch(e){return [e.message];}
  const ids=new Set();
  for(const s of list(doc.slides)){
    if(typeof s.id!=='string'||!s.id||ids.has(s.id))errors.push('严格投影须有唯一 slide.id');ids.add(s.id);
    if(split(s.exhibit)){
      const ex=s.exhibit;
      if(!object(ex.semantics))errors.push(s.id+' exhibit.semantics 须为对象');
      if(ex.style!==undefined&&!object(ex.style))errors.push(s.id+' exhibit.style 须为对象');
      for(const [key,value] of Object.entries(object(ex.style)?ex.style:{})){
        if(!STYLE.has(key)||(!['string','number'].includes(typeof value)))errors.push(s.id+' 不支持的纯样式字段：'+key);
        if(key==='fontFamily'&&typeof value!=='string')errors.push(s.id+' fontFamily 须为字符串');
        if(key!=='fontFamily'&&(typeof value!=='number'||!Number.isFinite(value)||value<0))errors.push(s.id+' 样式尺寸/字重须为非负有限数字');
      }
    }else if(s.exhibit?.contract!==undefined)errors.push(s.id+' 未知 exhibit.contract');
    try{resolve(s.exhibit,values);}catch(e){errors.push(s.id+' '+e.message);}
    for(const binding of list(s.displayBindings)){
      try{
        if(!object(binding)||typeof binding.pointer!=='string'||!binding.pointer.startsWith('/exhibit/'))throw Error('displayBindings.pointer 须指向本页 exhibit');
        const actual=require('./analysis_artifacts.cjs').pointer(s,binding.pointer),metric=values.find(m=>m.id===binding.metricRef);
        if(!metric)throw Error('展示指标未登记：'+binding.metricRef);
        if(resolve(actual,values)!==metric.value)throw Error('展示值与指标原值不一致：'+binding.pointer+' → '+binding.metricRef);
      }catch(e){errors.push(s.id+' '+e.message);}
    }
    if(s.displayBindings!==undefined&&!Array.isArray(s.displayBindings))errors.push(s.id+' displayBindings 须为数组');
  }
  return errors;
}
module.exports={project,digest,differences,validate,resolve,metrics,metricRefs,split};
