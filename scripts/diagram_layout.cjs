/* 图示共同布局：阶段/主体轨道、真实字体测量、节点端点及正交避让。 */
'use strict';
const typography=require('../assets/deck-typography.js');
const {measurer}=require('./font_metrics.cjs');
const finite=(v,name,min=0)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min)throw Error(name+'必须为有限数且≥'+min);return v;};
const unique=items=>[...new Set(items)];
const near=(a,b)=>Math.abs(a-b)<1e-6;
function wrapText(text,width,measure,font){
  const lines=[];
  for(const paragraph of String(text??'').split('\n')){
    let line='';for(const char of paragraph){if(measure(char,font).width>width)throw Error('文字区不足一个字宽');if(line&&measure(line+char,font).width>width){lines.push(line.trimEnd());line=char;}else line+=char;}
    if(line||!paragraph)lines.push(line);
  }return lines;
}
function nodeHeight(node,width,type,measure){
  const inset=node.shape==='diamond'?.5:node.shape==='ellipse'?.68:1,padding=finite(node.padding??12,'padding'),inner=width*inset-padding*2;
  const title=finite(node.titleSize??18,'titleSize',1),body=finite(node.fontSize??16,'fontSize',1);
  if(inner<=0)throw Error('节点宽度不足以容纳文字');
  const titles=wrapText(node.title??node.label,inner,measure,`600 ${title}px ${type.body}`),bodies=node.body?wrapText(node.body,inner,measure,`400 ${body}px ${type.body}`):[];
  return Math.ceil((titles.length*title*1.35+bodies.length*body*1.35+(bodies.length?7:0)+2*padding)/inset);
}
function anchor(node,side){
  const {x,y,w,h}=node;return {left:[x,y+h/2],right:[x+w,y+h/2],top:[x+w/2,y],bottom:[x+w/2,y+h]}[side];
}
function inside(point,b){return point[0]>b.x+1e-6&&point[0]<b.x+b.w-1e-6&&point[1]>b.y+1e-6&&point[1]<b.y+b.h-1e-6;}
function crosses(a,b,r){
  if(near(a[0],b[0]))return a[0]>r.x+1e-6&&a[0]<r.x+r.w-1e-6&&Math.max(a[1],b[1])>r.y+1e-6&&Math.min(a[1],b[1])<r.y+r.h-1e-6;
  if(near(a[1],b[1]))return a[1]>r.y+1e-6&&a[1]<r.y+r.h-1e-6&&Math.max(a[0],b[0])>r.x+1e-6&&Math.min(a[0],b[0])<r.x+r.w-1e-6;
  throw Error('自动连线必须为正交线段');
}
function simplify(points){return points.filter((p,i)=>!(i&&near(p[0],points[i-1][0])&&near(p[1],points[i-1][1]))).filter((p,i,a)=>!i||i===a.length-1||!(near(a[i-1][0],p[0])&&near(p[0],a[i+1][0])||near(a[i-1][1],p[1])&&near(p[1],a[i+1][1])));}
function route(start,end,obstacles,width,height,clearance){
  const xs=unique([clearance,width-clearance,start[0],end[0],...obstacles.flatMap(r=>[r.x,r.x+r.w])]).filter(x=>x>=0&&x<=width).sort((a,b)=>a-b);
  const ys=unique([clearance,height-clearance,start[1],end[1],...obstacles.flatMap(r=>[r.y,r.y+r.h])]).filter(y=>y>=0&&y<=height).sort((a,b)=>a-b);
  const key=(x,y)=>x+','+y,points=new Map();
  xs.forEach((x,ix)=>ys.forEach((y,iy)=>{if(!obstacles.some(r=>inside([x,y],r)))points.set(key(ix,iy),[x,y]);}));
  const from=key(xs.indexOf(start[0]),ys.indexOf(start[1])),to=key(xs.indexOf(end[0]),ys.indexOf(end[1]));
  if(!points.has(from)||!points.has(to))throw Error('连接端口被邻接节点占用，请增大轨道间距');
  const distances=new Map([[from,0]]),previous=new Map(),queue=new Set([from]),done=new Set();
  while(queue.size){
    let current;for(const k of queue)if(current===undefined||distances.get(k)<distances.get(current))current=k;
    queue.delete(current);if(current===to)break;done.add(current);
    const [ix,iy]=current.split(',').map(Number),a=points.get(current);
    for(const [nx,ny] of [[ix-1,iy],[ix+1,iy],[ix,iy-1],[ix,iy+1]]){
      const next=key(nx,ny),b=points.get(next);if(!b||done.has(next)||obstacles.some(r=>crosses(a,b,r)))continue;
      const d=distances.get(current)+Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);
      if(d<(distances.get(next)??Infinity)){distances.set(next,d);previous.set(next,current);queue.add(next);}
    }
  }
  if(!distances.has(to))throw Error('没有避开节点的连线路径；请增大间距或分面');
  const result=[];let cursor=to;while(cursor){result.unshift(points.get(cursor));cursor=previous.get(cursor);}return simplify(result);
}
function overlaps(a,b,gap=0){return a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;}
function labelPosition(edge,points,nodes,labels,width,height,measure,type){
  if(!edge.label)return {};
  const size=finite(edge.fontSize??14,'边字号',1),w=measure(edge.label,`400 ${size}px ${type.body}`).width+10,h=size*1.4;
  const segments=points.slice(1).map((b,i)=>({a:points[i],b,len:Math.abs(b[0]-points[i][0])+Math.abs(b[1]-points[i][1])})).sort((a,b)=>b.len-a.len);
  for(const {a,b} of segments)for(const fraction of [.5,.33,.67])for(const offset of [-1,1]){
    let x=a[0]+(b[0]-a[0])*fraction,y=a[1]+(b[1]-a[1])*fraction;
    if(near(a[1],b[1]))y+=offset*(h/2+4);else x+=offset*(w/2+4);
    const box={x:x-w/2,y:y-h/2,w,h};
    if(box.x<0||box.y<0||box.x+w>width||box.y+h>height||nodes.some(n=>overlaps(box,n,3))||labels.some(n=>overlaps(box,n,3)))continue;
    labels.push(box);return {labelX:x,labelY:y+size*.35,labelBox:box};
  }
  throw Error('边标签无法避让：'+edge.label+'；扩大轨道间距或缩短有同义依据的标签');
}
function layout(spec){
  const config=typeof spec.layout==='object'?spec.layout:{},type=typography.get(spec.typography_id),measure=measurer(type.id);
  if(!type.faces.length)throw Error('自动布局需要已注册字体');
  const requestedWidth=finite(spec.width??1000,'width',1),requestedHeight=finite(spec.height??500,'height',1);
  const margin=finite(config.margin??24,'margin',12),clearance=finite(config.clearance??10,'clearance',2);
  // 边标签也是布局输入：跨列短边必须为完整标签预留通道宽度。
  const edgeLabels=(spec.edges||[]).filter(e=>e.label);
  const gapX=Math.max(finite(config.gapX??64,'gapX',24),...edgeLabels.map(e=>measure(e.label,`400 ${finite(e.fontSize??14,'边字号',1)}px ${type.body}`).width+22));
  const gapY=Math.max(finite(config.gapY??42,'gapY',24),...edgeLabels.map(e=>(e.fontSize??14)*1.4+16));
  if(clearance*2>=Math.min(gapX,gapY))throw Error('clearance 必须小于轨道间距的一半');
  const fit=config.fit??'grow';if(!['grow','error'].includes(fit))throw Error('fit 仅支持 grow/error');
  const original=(spec.nodes||[]).map(n=>({...n,shape:n.shape||(n.role==='decision'?'diamond':n.role==='outcome'?'round':'rect')}));
  if(!original.length)throw Error('需要至少一个节点');
  const map=new Map();for(const n of original){if(!n.id||map.has(n.id))throw Error('节点id须唯一且非空');if(!String(n.title??n.label??'').trim())throw Error(n.id+'缺少标题');map.set(n.id,n);}
  const edges=(spec.edges||[]).map(e=>({...e}));for(const e of edges)if(!map.has(e.from)||!map.has(e.to))throw Error('边引用不存在的节点');
  const list=v=>(v||[]).map(x=>typeof x==='object'?{id:String(x.id),title:String(x.title??x.id)}:{id:String(x),title:String(x)});
  const lanes=list(config.lanes?.length?config.lanes:unique(original.map(n=>String(n.lane??n.owner??'流程'))));
  if(lanes.some(l=>!l.id)||unique(lanes.map(l=>l.id)).length!==lanes.length)throw Error('lane id 须唯一');
  let stages=list(config.stages);
  if(!stages.length&&original.some(n=>n.stage!==undefined))stages=list(unique(original.map(n=>String(n.stage??'阶段'))));
  if(!stages.length){
    // 反馈边不参与拓扑定阶段；普通循环必须显式给阶段或标为 feedback。
    const ranks=new Map(original.map(n=>[n.id,0])),incoming=new Map(original.map(n=>[n.id,0]));
    const forward=edges.filter(e=>e.role!=='feedback'&&!e.feedback);for(const e of forward)incoming.set(e.to,incoming.get(e.to)+1);
    const queue=original.filter(n=>!incoming.get(n.id)).map(n=>n.id);let visited=0;
    for(let i=0;i<queue.length;i++){const id=queue[i];visited++;for(const e of forward.filter(e=>e.from===id)){ranks.set(e.to,Math.max(ranks.get(e.to),ranks.get(id)+1));incoming.set(e.to,incoming.get(e.to)-1);if(!incoming.get(e.to))queue.push(e.to);}}
    if(visited!==original.length)throw Error('循环依赖需显式阶段或 feedback 边；不会删除关系推成树');
    original.forEach(n=>n.stage=String(ranks.get(n.id)));stages=list(unique(original.map(n=>n.stage)).sort((a,b)=>Number(a)-Number(b)));
  }
  for(const n of original){n.lane=String(n.lane??n.owner??lanes[0].id);n.stage=String(n.stage??stages[0].id);if(!lanes.some(l=>l.id===n.lane)||!stages.some(s=>s.id===n.stage))throw Error('节点引用未知 lane/stage：'+n.id);}
  const minimumNodeWidth=finite(config.minNodeWidth??156,'minNodeWidth',60);
  let direction=config.direction??'auto';if(!['auto','LR','TB'].includes(direction))throw Error('direction 仅支持 auto/LR/TB');
  if(direction==='auto')direction=(requestedWidth-2*margin-(stages.length-1)*gapX)/stages.length>=minimumNodeWidth?'LR':'TB';
  const columns=direction==='LR'?stages:lanes,rows=direction==='LR'?lanes:stages;
  const showHeaders=config.headers!==false,headerTop=showHeaders?42:0;
  const rowTitleWidth=showHeaders?Math.max(90,...rows.map(row=>measure(row.title,`600 16px ${type.body}`).width+20)):0;
  let width=Math.max(requestedWidth,2*margin+rowTitleWidth+columns.length*minimumNodeWidth+(columns.length-1)*gapX);
  const cellWidth=(width-2*margin-rowTitleWidth-(columns.length-1)*gapX)/columns.length;
  const cells=rows.map(row=>columns.map(col=>original.filter(n=>direction==='LR'?n.lane===row.id&&n.stage===col.id:n.stage===row.id&&n.lane===col.id)));
  const rowHeights=cells.map(cellsInRow=>Math.max(64,...cellsInRow.map(ns=>ns.reduce((sum,n)=>sum+Math.max(n.h??0,nodeHeight(n,cellWidth,type,measure)),0)+Math.max(0,ns.length-1)*gapY)));
  const height=Math.max(requestedHeight,2*margin+headerTop+rowHeights.reduce((a,b)=>a+b,0)+(rows.length-1)*gapY);
  if(fit==='error'&&(width>requestedWidth+.1||height>requestedHeight+.1))throw Error(`当前文字/轨道需要 ${Math.ceil(width)}×${Math.ceil(height)}，超过 ${requestedWidth}×${requestedHeight}；请换方向、扩展或分面`);
  const nodes=[],groups=[],annotations=[];let y=margin+headerTop;
  if(showHeaders)columns.forEach((col,i)=>annotations.push({text:col.title,x:margin+rowTitleWidth+i*(cellWidth+gapX)+cellWidth/2,y:margin+20,anchor:'middle',fontSize:16,weight:600,role:direction==='LR'?'stage-title':'lane-title'}));
  for(let r=0;r<rows.length;r++){
    if(showHeaders)annotations.push({text:rows[r].title,x:margin,y:y+rowHeights[r]/2+6,fontSize:16,weight:600,role:direction==='LR'?'lane-title':'stage-title'});
    if(config.laneBands&&direction==='LR')groups.push({x:margin-8,y:y-10,w:width-2*margin+16,h:rowHeights[r]+20,fill:'surface',stroke:'grid',role:'lane-band'});
    for(let c=0;c<columns.length;c++){
      const ns=cells[r][c],total=ns.reduce((sum,n)=>sum+Math.max(n.h??0,nodeHeight(n,cellWidth,type,measure)),0)+Math.max(0,ns.length-1)*gapY;
      let cy=y+(rowHeights[r]-total)/2;
      for(const n of ns){const h=Math.max(n.h??0,nodeHeight(n,cellWidth,type,measure));nodes.push({...n,x:margin+rowTitleWidth+c*(cellWidth+gapX),y:cy,w:cellWidth,h});cy+=h+gapY;}
    }y+=rowHeights[r]+gapY;
  }
  if(config.laneBands&&direction==='TB')for(let c=0;c<columns.length;c++)groups.push({x:margin+rowTitleWidth+c*(cellWidth+gapX)-8,y:margin+headerTop-10,w:cellWidth+16,h:height-2*margin-headerTop+20,fill:'surface',stroke:'grid',role:'lane-band'});
  const actual=new Map(nodes.map(n=>[n.id,n])),obstacles=nodes.map(n=>({x:n.x-clearance,y:n.y-clearance,w:n.w+2*clearance,h:n.h+2*clearance})),labelBoxes=[];
  const vectors={left:[-1,0],right:[1,0],top:[0,-1],bottom:[0,1]};
  const routed=edges.map(e=>{
    const a=actual.get(e.from),b=actual.get(e.to),dx=b.x+b.w/2-a.x-a.w/2,dy=b.y+b.h/2-a.y-a.h/2;
    let fromSide=e.fromSide,toSide=e.toSide;
    if(!fromSide)fromSide=direction==='LR'&&Math.abs(dx)>1?(dx>0?'right':'left'):Math.abs(dy)>1?(dy>0?'bottom':'top'):(dx>0?'right':'left');
    if(!toSide)toSide={left:'right',right:'left',top:'bottom',bottom:'top'}[fromSide];
    if(!vectors[fromSide]||!vectors[toSide])throw Error('未知连接边');
    if(e.from===e.to){fromSide=e.fromSide??'right';toSide=e.toSide??'top';}
    const start=anchor(a,fromSide),end=anchor(b,toSide),lead=(p,side)=>p.map((v,i)=>v+vectors[side][i]*clearance);
    const points=simplify([start,...route(lead(start,fromSide),lead(end,toSide),obstacles,width,height,clearance),end]);
    return {...e,fromSide,toSide,points:points.slice(1,-1),resolvedPoints:points,...labelPosition(e,points,nodes,labelBoxes,width,height,measure,type)};
  });
  return {...spec,width,height,layout:undefined,nodes,edges:routed,groups:[...(spec.groups||[]),...groups],annotations:[...annotations,...(spec.annotations||[])],layout_result:{version:1,direction,requested:{width:requestedWidth,height:requestedHeight},actual:{width,height},resized:width!==requestedWidth||height!==requestedHeight,measurement:'fontkit-tnum',lanes,stages,label_boxes:labelBoxes}};
}
module.exports={layout,anchor,crosses,nodeHeight,wrapText};
