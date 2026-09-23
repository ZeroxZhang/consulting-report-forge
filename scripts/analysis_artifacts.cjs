/* 模型附件与导入数值的共同不变量；导入、综合、生产和审查均走此处。 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const fileHash=file=>require('./report_contract.cjs').fileHash(file);
const list=v=>Array.isArray(v)?v:[];
const text=v=>typeof v==='string'&&v.trim().length>0;
function pointer(value,ref){
  if(typeof ref!=='string'||!ref.startsWith('/')||/~(?![01])/u.test(ref))throw Error('外部指标须指定有效 JSON pointer');
  return ref.slice(1).split('/').map(s=>s.replace(/~1/g,'/').replace(/~0/g,'~')).reduce((v,k)=>{
    if(v===null||typeof v!=='object'||!Object.hasOwn(v,k))throw Error('输出字段不存在：'+ref);
    return v[k];
  },value);
}
function lineage(artifacts,ref,trail=[]){
  if(trail.includes(ref))throw Error('模型血缘循环：'+ref);
  const a=artifacts.get(ref);if(!a)throw Error('模型血缘缺失：'+ref);
  return [a,...list(a.dependsOn).flatMap(r=>lineage(artifacts,r,[...trail,ref]))];
}
function outputErrors(artifacts,ref){
  try{
    const a=artifacts.get(ref);if(a?.kind!=='output')return ['external 必须指向输出 artifact：'+ref];
    const chain=lineage(artifacts,ref),errors=[];
    if(!chain.some(x=>x.kind==='input')||!chain.some(x=>['code','model'].includes(x.kind)))errors.push('输出须记录输入和模型/代码血缘：'+ref);
    if(!text(a.run?.id)||!text(a.run?.command)||!text(a.run?.executedAt)||!Number.isFinite(Date.parse(a.run.executedAt)))errors.push('输出须登记实际运行 run：'+ref);
    return errors;
  }catch(e){return [e.message];}
}
function validate(doc,{baseDir,files=false}={}){
  const errors=[],artifacts=new Map(list(doc.artifacts).map(a=>[a.id,a]));
  for(const a of artifacts.values())if(a.kind==='output')errors.push(...outputErrors(artifacts,a.id));
  const externals=list(doc.claims).flatMap(c=>list(c.metrics).filter(m=>m.external!==undefined).map(m=>({c,m})));
  for(const {c,m} of externals){
    if(!m.external||typeof m.external!=='object'||Array.isArray(m.external)||!text(m.external.artifactRef)||typeof m.external.pointer!=='string'||!m.external.pointer.startsWith('/')||/~(?![01])/u.test(m.external.pointer)){errors.push('external 映射格式无效：'+m.id);continue;}
    errors.push(...outputErrors(artifacts,m.external.artifactRef));
    if(!list(c.artifactRefs).includes(m.external.artifactRef))errors.push('导入主张须引用输出 artifact：'+c.id);
    if(m.formula||typeof m.value!=='number'||!Number.isFinite(m.value))errors.push('导入值须为有限 value：'+m.id);
  }
  if(!files)return [...new Set(errors)];
  if(artifacts.size&&!baseDir)return [...errors,'核对分析附件须提供 baseDir'];
  const contents=new Map();
  for(const a of artifacts.values()){
    try{const file=path.resolve(baseDir,a.path);if(!fs.statSync(file).isFile())throw Error('不是文件');if(fileHash(file)!==a.sha256){errors.push('分析附件摘要变化：'+a.id);continue;}if(a.kind==='output')contents.set(a.id,file);}
    catch(e){errors.push('分析附件缺失或不可读：'+a.id+'；'+e.message);}
  }
  const parsed=new Map();
  for(const {m} of externals){
    const ref=m.external?.artifactRef;if(!contents.has(ref))continue;
    try{if(!parsed.has(ref))parsed.set(ref,JSON.parse(fs.readFileSync(contents.get(ref),'utf8')));const actual=pointer(parsed.get(ref),m.external.pointer);
      if(typeof actual!=='number'||!Number.isFinite(actual))throw Error('输出数值不是有限数字');
      if(actual!==m.value)errors.push('导入值与输出数值不一致：'+m.id+'；重新映射导入后再生产');
    }catch(e){errors.push('导入指标 '+m.id+'：'+e.message);}
  }
  return [...new Set(errors)];
}
module.exports={validate,pointer,lineage,outputErrors};
