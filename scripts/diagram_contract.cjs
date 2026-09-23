/* 图示形式与节点、边语义绑定。只校验结构关系，不认证因果事实。 */
'use strict';
const FORMS=['diagram.mechanism','diagram.process','diagram.swimlane','diagram.hierarchy','diagram.condition'];
const EDGE_WIDTH=1.8;
const text=value=>typeof value==='string'&&value.trim().length>0;
const probabilityText=e=>Number((e.probability*100).toFixed(1))+'%（依据：'+e.probabilityBasis+'）';
function acyclic(nodes,edges,skip=()=>false){
  const next=new Map(nodes.map(n=>[n.id,[]]));
  for(const e of edges)if(!skip(e)&&next.has(e.from))next.get(e.from).push(e.to);
  const active=new Set(),done=new Set();
  function visit(id){if(active.has(id))return false;if(done.has(id))return true;active.add(id);for(const to of next.get(id)||[])if(!visit(to))return false;active.delete(id);done.add(id);return true;}
  return nodes.every(n=>visit(n.id));
}
function validate(spec){
  const errors=[],bad=message=>errors.push(message);
  if(!spec||typeof spec!=='object'||!FORMS.includes(spec.form))return ['diagram.form 须为 '+FORMS.join('/')];
  const nodes=Array.isArray(spec.nodes)?spec.nodes:[],edges=Array.isArray(spec.edges)?spec.edges:[];
  if(nodes.length<2)bad(spec.form+' 至少需要两个节点');
  if(!edges.length)bad(spec.form+' 至少需要一条有意义的边');
  const ids=new Set();
  for(const n of nodes){if(!text(n?.id)||ids.has(n.id))bad('节点 id 须唯一且非空');else ids.add(n.id);}
  for(const [i,e] of edges.entries())if(!ids.has(e?.from)||!ids.has(e?.to)||e.from===e.to)bad('第 '+(i+1)+' 条边须连接两个不同的已登记节点');
  if(errors.length)return errors;
  if(spec.form==='diagram.mechanism'){
    for(const e of edges){
      if(!text(e.label))bad('机制边 '+e.from+'→'+e.to+' 须标作用含义');
      if(!['supported','hypothesis','unknown'].includes(e.evidenceStatus))bad('机制边 '+e.from+'→'+e.to+' 须声明 evidenceStatus=supported/hypothesis/unknown');
      if((e.feedback||e.role==='feedback')&&e.feedback!==true)bad('反馈边须显式 feedback:true');
    }
    if(!acyclic(nodes,edges,e=>e.feedback===true))bad('机制循环须把反馈边显式标为 feedback:true');
  }
  if(spec.form==='diagram.process'){
    for(const n of nodes)if(!text(String(n.stage??'')))bad('流程节点 '+n.id+' 须声明 stage');
    for(const e of edges){
      if(!['sequence','transfer'].includes(e.role)||!text(e.label))bad('流程边 '+e.from+'→'+e.to+' 须声明 sequence/transfer 和交接含义');
      if(e.width!==undefined)bad('流程边 '+e.from+'→'+e.to+' 不接受手填线宽；定量流请用经流量核验的形式');
    }
  }
  if(spec.form==='diagram.swimlane'){
    if(!spec.layout||typeof spec.layout!=='object'||spec.layout.headers===false||spec.layout.laneBands!==true)bad('泳道图须启用自动布局、标题和泳道带，以实际画出 lane/stage');
    const lanes=new Set(),stages=new Set();
    for(const n of nodes){if(!text(String(n.lane??''))||!text(String(n.stage??'')))bad('泳道节点 '+n.id+' 须同时声明 lane 与 stage');lanes.add(n.lane);stages.add(n.stage);}
    if(lanes.size<2||stages.size<2)bad('泳道图至少需要两个主体和两个阶段');
    const byId=new Map(nodes.map(n=>[n.id,n]));
    for(const e of edges){const changed=byId.get(e.from)?.lane!==byId.get(e.to)?.lane;if(e.role!==(changed?'handoff':'sequence'))bad('泳道边 '+e.from+'→'+e.to+' 的 role 须与是否跨主体一致');if(changed&&!text(e.label))bad('跨主体交接边须标交接内容');}
  }
  if(spec.form==='diagram.hierarchy'){
    const parent=new Map();
    for(const e of edges){
      if(!['contains','depends_on','requires'].includes(e.relation))bad('层级边 '+e.from+'→'+e.to+' 须区分 contains/depends_on/requires');
      if(e.relation==='contains'){if(parent.has(e.to))bad('层级节点 '+e.to+' 不能有多个包含上级');parent.set(e.to,e.from);}
    }
    if(!edges.some(e=>e.relation==='contains'))bad('层级图须有包含关系；纯依赖请选机制图');
    if(!acyclic(nodes,edges,e=>e.relation!=='contains'))bad('包含关系不能成环');
    const roots=nodes.filter(n=>!parent.has(n.id));if(roots.length!==1)bad('层级包含关系须有唯一根节点，依赖边不能冒充层级');
  }
  if(spec.form==='diagram.condition'){
    const incoming=new Map(nodes.map(n=>[n.id,0]));
    for(const n of nodes)if(!['decision','outcome'].includes(n.role))bad('条件节点 '+n.id+' 须声明 decision/outcome');
    for(const e of edges){incoming.set(e.to,incoming.get(e.to)+1);if(!text(e.condition))bad('条件边 '+e.from+'→'+e.to+' 须写分支条件');if(e.probability!==undefined&&(!(typeof e.probability==='number'&&e.probability>=0&&e.probability<=1)||!text(e.probabilityBasis)))bad('分支概率须在 0–1 之间并附依据');}
    for(const n of nodes){
      const outgoing=edges.filter(e=>e.from===n.id);
      if(n.role==='decision'&&outgoing.length<2)bad('决策节点 '+n.id+' 至少要有两条条件分支');
      if(n.role==='outcome'&&outgoing.length)bad('结果节点 '+n.id+' 不能继续分支');
      if(n.role==='decision'&&outgoing.some(e=>e.probability!==undefined)){
        if(outgoing.some(e=>e.probability===undefined))bad('决策节点 '+n.id+' 的概率须覆盖全部分支');
        else if(Math.abs(outgoing.reduce((sum,e)=>sum+e.probability,0)-1)>1e-6)bad('决策节点 '+n.id+' 的分支概率合计须为 1');
      }
    }
    if([...incoming.values()].filter(v=>v===0).length!==1||!acyclic(nodes,edges))bad('条件树须有唯一入口且无环');
  }
  return errors;
}
function prepare(spec){
  const errors=validate(spec);if(errors.length)throw Error('图示语义不匹配：'+errors.join('；'));
  const copy={...spec,nodes:spec.nodes.map(n=>({...n})),edges:spec.edges.map(e=>({...e}))};
  if(spec.form==='diagram.condition')copy.nodes=copy.nodes.map(n=>({...n,shape:n.role==='decision'?'diamond':'round'}));
  if(spec.form==='diagram.condition')copy.edges=copy.edges.map(e=>({...e,label:e.condition+(e.probability===undefined?'':' · '+probabilityText(e))}));
  if(spec.form==='diagram.mechanism')copy.edges=copy.edges.map(e=>({...e,label:e.label+(e.evidenceStatus==='supported'?'':e.evidenceStatus==='hypothesis'?'（假设）':'（未核实）'),dashed:e.feedback===true||e.evidenceStatus!=='supported'}));
  if(spec.form==='diagram.hierarchy')copy.edges=copy.edges.map(e=>e.relation==='contains'?{...e,arrow:false,dashed:false}:{...e,arrow:true,label:e.label|| (e.relation==='depends_on'?'依赖':'必要条件'),dashed:true});
  return copy;
}
function verifyRendered(form,rendered){
  const errors=[];
  if(!rendered||rendered.contract!=='1')return ['缺少图示语义渲染标记'];
  const nodes=Array.isArray(rendered.nodes)?rendered.nodes:[],edges=Array.isArray(rendered.edges)?rendered.edges:[];
  const spec={form,nodes,edges};
  if(form==='diagram.swimlane')spec.layout={laneBands:rendered.laneBands>=2,headers:rendered.laneTitles>=2&&rendered.stageTitles>=2};
  errors.push(...validate(spec));
  for(const node of nodes)if(!text(node.label))errors.push('节点 '+node.id+' 缺少可见标题');
  if(form==='diagram.swimlane'){
    if(rendered.laneBands<new Set(nodes.map(n=>n.lane)).size)errors.push('可见泳道带少于主体数');
    const same=(a,b)=>a.length===b.size&&new Set(a).size===b.size&&a.every(value=>b.has(value));
    if(!same(rendered.laneTitleText||[],new Set(nodes.map(n=>n.lane)))||!same(rendered.stageTitleText||[],new Set(nodes.map(n=>n.stage))))errors.push('主体或阶段标题文字与节点声明不一致');
  }
  for(const edge of edges){
    if(edge.lineVisible!==true||!Number.isFinite(edge.strokeWidth)||edge.strokeWidth<=0)errors.push('关系边缺少可见且有宽度的连线');
    if(form==='diagram.mechanism'){
      if(edge.dashed!==Boolean(edge.feedback||edge.evidenceStatus!=='supported'))errors.push('机制边线型与证据状态/反馈声明不一致');
      if(edge.evidenceStatus==='hypothesis'&&(!edge.dashed||!edge.label?.includes('假设')))errors.push('假设机制边缺少可见虚线或假设标签');
      if(edge.evidenceStatus==='unknown'&&(!edge.dashed||!edge.label?.includes('未核实')))errors.push('未核实机制边缺少可见虚线或限定标签');
      if(edge.feedback&&!edge.dashed)errors.push('反馈边须以虚线显示');
    }
    if(form==='diagram.process'&&(!Number.isFinite(edge.strokeWidth)||Math.abs(edge.strokeWidth-EDGE_WIDTH)>.01))errors.push('流程边实际线宽与定性流程样式不一致');
    if(form==='diagram.hierarchy'){
      if(edge.relation==='contains'&&(edge.dashed||edge.arrow))errors.push('包含边须是无箭头实线');
      if(['depends_on','requires'].includes(edge.relation)&&(!edge.dashed||!edge.arrow||!text(edge.label)))errors.push('依赖边须是有标签的带箭头虚线');
    }
    if(form==='diagram.condition'){
      const expected=edge.condition+(edge.probability===undefined?'':' · '+probabilityText(edge));
      if(!text(edge.condition)||edge.label!==expected)errors.push('分支可见条件、概率与依据须和声明逐字一致');
    }
  }
  if(form==='diagram.condition')for(const node of nodes)if(node.shape!==(node.role==='decision'?'diamond':'round'))errors.push('条件节点 '+node.id+' 的形状与决策/结果角色不符');
  return errors;
}
module.exports={FORMS,EDGE_WIDTH,validate,prepare,verifyRendered};
