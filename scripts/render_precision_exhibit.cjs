#!/usr/bin/env node
/* 静态 SVG 的专业标注入口：数值只由数据派生，文字按交付字体测量。 */
const fs=require('node:fs'),path=require('node:path');
const G=require('../assets/exhibit-geometry.js'),Typography=require('../assets/deck-typography.js'),Themes=require('../assets/deck-themes.js'),Metrics=require('./font_metrics.cjs');
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attrs=data=>Object.entries(data).filter(([,v])=>v!==undefined&&v!==null).map(([k,v])=>`${k}="${esc(v)}"`).join(' ');
const point=(x,y)=>({x,y});
const nonempty=(v,name)=>{if(v===undefined||v===null||!String(v).trim())throw Error(name+' 不可为空');return String(v);};
function wrap(text,maxWidth,measure,font){
  const lines=[];let line='';for(const char of String(text)){if(char==='\n'){lines.push(line);line='';continue;}if(measure(line+char,font).width>maxWidth&&line){lines.push(line);line=char;}else line+=char;}
  if(line||!lines.length)lines.push(line);if(lines.some(v=>measure(v,font).width>maxWidth))throw Error('单字宽度超出分配空间');return lines;
}
function normalize(spec){
  if(!['columns','stacked','waterfall'].includes(spec.type))throw Error('type 须为 columns/stacked/waterfall');
  if(!Array.isArray(spec.items)||!spec.items.length)throw Error('items 不可为空');
  if(spec.type==='waterfall')return {items:G.waterfall(spec.items).map(v=>({...v,label:nonempty(v.label,'类别标签')})),series:[]};
  const ids=new Set(),series=[];const items=spec.items.map((raw,i)=>{
    const id=String(raw.id===undefined?i:raw.id),label=nonempty(raw.label,'类别标签');if(ids.has(id))throw Error('item.id 不可重复');ids.add(id);
    if(spec.type==='columns'){
      const value=G.finite(raw.value),type=raw.type||'value';if(!['value','total','subtotal'].includes(type))throw Error('柱图 type 须为 value/total/subtotal');
      return {...raw,id,label,value,from:0,to:value,type};
    }
    if(!Array.isArray(raw.segments)||!raw.segments.length)throw Error('segments 不可为空');
    let total=0;const seen=new Set();const segments=raw.segments.map(seg=>{const sid=String(seg.id===undefined?nonempty(seg.label,'系列标签'):seg.id),sl=nonempty(seg.label===undefined?sid:seg.label,'系列标签');if(seen.has(sid))throw Error('系列 id 不可重复');seen.add(sid);if(!series.some(v=>v.id===sid))series.push({id:sid,label:sl});else if(series.find(v=>v.id===sid).label!==sl)throw Error('同一系列的标签须一致');const value=G.finite(seg.value);if(value<0)throw Error('本入口 stacked 仅支持非负组成；负值请用 columns 或 waterfall');total=G.finite(total+value);return {...seg,id:sid,label:sl,value};});
    if(raw.total!==undefined&&!G.close(G.finite(raw.total),total))throw Error('stacked total 不等于系列之和');
    return {...raw,id,label,segments,value:total,total,type:'total',from:0,to:total};
  });
  if(spec.type==='columns')items.forEach((item,i)=>{
    if(['total','subtotal'].includes(item.type)){
      if(!Array.isArray(item.sumOf)||!item.sumOf.length||new Set(item.sumOf.map(String)).size!==item.sumOf.length)throw Error('柱图 total/subtotal 须提供不重复的 sumOf');
      const sum=item.sumOf.reduce((s,id)=>{const v=items.find((k,j)=>k.id===String(id)&&j<i);if(!v)throw Error('sumOf 只能引用前置 item.id');return s+v.value;},0);if(!G.close(sum,item.value))throw Error('柱图 total/subtotal 未闭合: '+item.id);
    }
  });
  else items.forEach(item=>{if(item.segments.length!==series.length)throw Error('每个堆积列须显式包含全部系列；未知不等于零');let acc=0;item.segments=series.map(({id})=>{const seg=item.segments.find(v=>v.id===id);if(!seg)throw Error('堆积系列不完整');const from=acc;acc+=seg.value;return {...seg,from,to:acc};});});
  return {items,series};
}
function textColor(hex){const rgb=hex.match(/^#([0-9a-f]{6})$/i);if(!rgb)return '#172C3B';const h=rgb[1];const l=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return l[0]*.2126+l[1]*.7152+l[2]*.0722<.179?'#FFFFFF':'#172C3B';}
function auditLayout(model){
  const issues=[],all=model.labels,canvas={x:0,y:0,width:model.width,height:model.height};
  const scale=G.createScale(model.domain,[model.plot.y+model.plot.height,model.plot.y],{breaks:model.breaks});
  for(const mark of model.marks){
    const expected=scale.segments(mark.from,mark.to);
    if(expected.length!==mark.pieces.length||expected.some((p,i)=>!mark.pieces[i]||Math.abs(mark.pieces[i].y-Math.min(p.p1,p.p2))>.25||Math.abs(mark.pieces[i].height-Math.abs(p.p1-p.p2))>.25))issues.push({code:'mark-scale',mark:mark.id});
  }
  for(const [key,anchor] of Object.entries(model.anchors)){
    if(anchor.space==='layer-value'){
      const track=model.layerTracks.find(t=>t.id===anchor.track),expected=G.createScale(track.domain,track.range).map(anchor.value);
      if(Math.abs(anchor.x-expected)>.25)issues.push({code:'layer-anchor-scale',anchor:key});
    }else if(Math.abs(anchor.y-scale.map(anchor.axisValue))>.25)issues.push({code:'anchor-scale',anchor:key});
  }
  for(const track of model.layerTracks)for(const bar of track.bars){const map=G.createScale(track.domain,track.range);if(Math.abs(bar.rect.x-map.map(0))>.25||Math.abs(bar.rect.width-(map.map(bar.value)-map.map(0)))>.25)issues.push({code:'layer-mark-scale',mark:bar.key});}

  for(let i=0;i<all.length;i++){
    const label=all[i];if(!G.contains(canvas,label.box))issues.push({code:'outside',label:label.id});
    for(let j=i+1;j<all.length;j++)if(G.intersects(label.box,all[j].box,1))issues.push({code:'label-collision',labels:[label.id,all[j].id]});
    if(label.placement==='inside'){
      const piece=model.marks.flatMap(m=>m.pieces.map(p=>({...p,markId:m.id}))).find(p=>p.markId===label.markId&&G.contains(p,label.box,2));if(!piece)issues.push({code:'inside-label-outside-mark',label:label.id});
    }else for(const mark of model.marks)if(mark.pieces.some(p=>G.intersects(p,label.box,2)))issues.push({code:'label-mark-collision',label:label.id,mark:mark.id});
    for(const track of model.layerTracks)for(const bar of track.bars)if(G.intersects(bar.rect,label.box,2))issues.push({code:'label-layer-collision',label:label.id,mark:bar.key});
    for(const route of model.routes){if(route.owner===label.id)continue;for(let j=1;j<route.points.length;j++)if(G.lineHitsRect(route.points[j-1],route.points[j],label.box,2))issues.push({code:'label-line-collision',label:label.id,route:route.id});}
  }
  for(const route of model.routes){
    if(route.role==='leader'){
      const mark=model.marks.find(v=>v.id===route.markId),a=route.points[0];
      if(!mark||!mark.pieces.some(p=>(Math.abs(a.x-p.x)<.001||Math.abs(a.x-p.x-p.width)<.001)&&a.y>=p.y-.001&&a.y<=p.y+p.height+.001))issues.push({code:'leader-unbound',route:route.id});
    }
    if(route.role==='comparison'){
      const a=model.anchors[route.fromAnchorKey||route.fromKey],b=model.anchors[route.toAnchorKey||route.toKey],first=route.points[0],last=route.points.at(-1);
      if(!a||!b||Math.abs(first.x-a.x)>.001||Math.abs(first.y-a.y)>.001||Math.abs(last.x-b.x)>.001||Math.abs(last.y-b.y)>.001)issues.push({code:'comparison-unbound',route:route.id});
      if(a&&b&&!G.close(route.delta,b.value-a.value))issues.push({code:'comparison-delta',route:route.id});
      if(route.space==='layer-value'&&a&&b&&Math.sign(route.arrowAt.x-route.arrowFrom.x)!==Math.sign(b.value-a.value))issues.push({code:'layer-arrow-direction',route:route.id});
    }
  }
  return {ok:issues.length===0,issues};
}
function build(spec){
  if(!spec||typeof spec!=='object')throw Error('需要 spec 对象');
  const width=G.finite(spec.width===undefined?960:spec.width),height=G.finite(spec.height===undefined?500:spec.height),fontSize=G.finite(spec.fontSize===undefined?16:spec.fontSize);
  if(width<400||height<260||fontSize<14)throw Error('本入口至少 400×260，fontSize 至少 14');
  const profile=Typography.get(spec.typography_id);if(!profile.faces.length)throw Error('精度入口需要可测量的随包字体，不支持 legacy-system');
  const palette={...Themes.palette(spec.theme||'mckinsey'),...spec.palette};const measure=Metrics.measurer(profile.id),font=(weight=400,size=fontSize)=>`${weight} ${size}px ${profile.body}`;
  // Noto Sans SC 真实字体 ascent/descent 是当前正文中最高的度量；保守占位不强拉字形顶底。
  const ascent=fontSize*1.16,descent=fontSize*.288,lineHeight=fontSize*1.55;
  const sizeOf=(text,weight=400,size=fontSize)=>({width:measure(text,font(weight,size)).width,height:size*1.448,ascent:size*1.16,descent:size*.288});
  const {items,series}=normalize(spec),comparisons=spec.comparisons||[];
  if(!Array.isArray(comparisons))throw Error('comparisons 须为数组');
  if(spec.connections){if(!['continuous','cumulative'].includes(spec.connections.mode))throw Error('连接线须显式声明 continuous 或 cumulative 关系');if(spec.connections.mode==='cumulative'&&spec.type!=='waterfall')throw Error('cumulative 连接只适用于 waterfall');if(spec.type==='stacked'&&spec.connections.mode==='continuous'&&!spec.connections.series&&spec.connections.target!=='total')throw Error('堆积连续线须声明 target: total 或 series');}
  const rawValues=items.flatMap(v=>spec.type==='stacked'?v.segments.flatMap(k=>[k.from,k.to]):[v.from,v.to]),domain=G.extent(rawValues,spec.domain);
  const formatOptions=spec.format||{},valueLabel=(value,kind='value')=>G.semanticFormat(value,{...formatOptions,kind});
  let ticks=[domain[0],0,domain[1]];
  const interval=(domain[1]-domain[0])/4;ticks.push(...Array.from({length:5},(_,i)=>domain[0]+i*interval));
  for(const k of spec.axisBreaks||[])ticks.push(k.from,k.to);
  ticks=[...new Set(ticks)].filter(v=>!(spec.axisBreaks||[]).some(k=>v>k.from&&v<k.to)).sort((a,b)=>a-b);
  const tickText=v=>G.formatNumber(v,{decimals:formatOptions.axisDecimals===undefined?Math.min(formatOptions.decimals===undefined?1:formatOptions.decimals,2):formatOptions.axisDecimals});
  const maxTick=Math.max(...ticks.map(v=>measure(tickText(v),font()).width));
  const plotLeft=Math.max(58,maxTick+20),plotRight=width-28,baseSlot=(plotRight-plotLeft)/items.reduce((s,v)=>s+((v.type==='total'||v.type==='subtotal')&&spec.type!=='stacked'?1.15:1),0);
  if(baseSlot<fontSize*2.7)throw Error('类别过密：增加宽度或分面');
  let cursor=plotLeft;const barWidth=Math.min(spec.barWidth===undefined?76:G.finite(spec.barWidth),baseSlot*.52);if(barWidth<12)throw Error('柱宽不足');
  const slots=items.map(v=>{const width=baseSlot*((v.type==='total'||v.type==='subtotal')&&spec.type!=='stacked'?1.15:1),slot={x:cursor,width,center:cursor+width/2};cursor+=width;return slot;});
  const categoryLines=items.map((v,i)=>wrap(v.label,slots[i].width-14,measure,font(['total','subtotal'].includes(v.type)?600:400)));
  const maxCategory=Math.max(...categoryLines.map(v=>v.length));if(maxCategory>4)throw Error('类别标签超过 4 行：增加宽度或分面');
  const legendRows=[];let legend=[];let used=0;
  for(const s of series){const needed=sizeOf(s.label).width+32;if(needed>width-32)throw Error('单个图例标签过宽');if(used+needed>width-32&&legend.length){legendRows.push(legend);legend=[];used=0;}legend.push({...s,x:16+used});used+=needed;}if(legend.length)legendRows.push(legend);
  const legendHeight=legendRows.length*(lineHeight+4),bottomReserve=18+maxCategory*lineHeight+legendHeight+10;
  const titleLines=spec.showTitle?wrap(nonempty(spec.title,'title'),width-32,measure,font(600,fontSize+2)):[];
  const axisNote=(spec.axisBreaks||[]).length?'数值轴省略 '+spec.axisBreaks.map(k=>G.formatNumber(k.from)+'–'+G.formatNumber(k.to)).join('、'):'';
  const unitText=[spec.unit,axisNote].filter(Boolean).join(' · ');if(unitText&&sizeOf(unitText).width>width-plotLeft-16)throw Error('单位/断层说明过宽，请减少断层或增加宽度');
  const headHeight=12+titleLines.length*(fontSize+2)*1.55+(unitText?lineHeight:0);
  const isLayer=comparison=>typeof comparison.from==='object'&&comparison.from.series!==undefined||typeof comparison.to==='object'&&comparison.to.series!==undefined;
  const comparisonBlocks=comparisons.map((c,i)=>({index:i,layer:isLayer(c),height:isLayer(c)?lineHeight*5+14:lineHeight+14}));
  let comparisonHeight=0;for(const block of [...comparisonBlocks].sort((a,b)=>Number(b.layer)-Number(a.layer))){block.top=headHeight+comparisonHeight;comparisonHeight+=block.height;}

  const plotTop=headHeight+comparisonHeight+20,plotBottom=height-bottomReserve;
  if(plotBottom-plotTop<110)throw Error('绘图区不足：标题/比较/标签过多，请增加高度或分面');
  const scale=G.createScale(domain,[plotBottom,plotTop],{breaks:spec.axisBreaks||[]});
  rawValues.forEach(v=>scale.map(v));
  // 断层边缘的刻度优先，其余刻度按最终像素间隔稀疏，避免伪通过。
  const protectedTicks=new Set([0,...(spec.axisBreaks||[]).flatMap(k=>[k.from,k.to])]);
  ticks=ticks.sort((a,b)=>Number(protectedTicks.has(b))-Number(protectedTicks.has(a))).reduce((out,v)=>{if(!out.some(q=>Math.abs(scale.map(q)-scale.map(v))<lineHeight+3))out.push(v);return out;},[]).sort((a,b)=>a-b);
  const labels=[],marks=[],routes=[],anchors={},decorations=[],layerTracks=[],references=new Map();
  const canvas={x:8,y:4,width:width-16,height:height-8};
  function fixedText(id,text,x,baseline,options={}){
    const size=sizeOf(text,options.weight||400,options.fontSize||fontSize),anchor=options.anchor||'start';const left=anchor==='middle'?x-size.width/2:anchor==='end'?x-size.width:x;
    const label={id,text,x,baseline,anchor,box:{x:left,y:baseline-size.ascent,width:size.width,height:size.height},color:options.color||palette.ink,weight:options.weight||400,fontSize:options.fontSize||fontSize,role:options.role||'text',...options};labels.push(label);return label;
  }
  titleLines.forEach((line,i)=>fixedText('title-'+i,line,16,12+(fontSize+2)*1.16+i*(fontSize+2)*1.55,{weight:600,fontSize:fontSize+2,role:'title'}));
  if(unitText)fixedText('unit',unitText,plotLeft,headHeight-4,{color:palette.muted,role:axisNote?'axis-break-label':'unit'});
  ticks.forEach((v,i)=>fixedText('tick-'+i,tickText(v),plotLeft-10,scale.map(v)+(ascent-descent)/2,{anchor:'end',color:palette.muted,role:'axis'}));
  categoryLines.forEach((lines,i)=>lines.forEach((line,j)=>fixedText('category-'+i+'-'+j,line,slots[i].center,plotBottom+16+ascent+j*lineHeight,{anchor:'middle',weight:['total','subtotal'].includes(items[i].type)?600:400,role:'category',item:items[i].id})));
  legendRows.forEach((row,r)=>row.forEach(s=>{const baseline=plotBottom+16+maxCategory*lineHeight+ascent+r*(lineHeight+4);decorations.push({type:'legend',x:s.x,y:baseline-fontSize*.65,width:10,height:10,fill:palette.series[series.findIndex(v=>v.id===s.id)%palette.series.length]});fixedText('legend-'+s.id,s.label,s.x+16,baseline,{role:'legend',series:s.id});}));
  function addMark(item,i,segment,seriesIndex){
    const value=segment?segment.value:item.value,from=segment?segment.from:item.from,to=segment?segment.to:item.to;
    const id=item.id+(segment?'::'+segment.id:''),fill=segment?palette.series[seriesIndex%palette.series.length]:item.type==='delta'?(value<0?palette.negative:palette.positive):palette.accent;
    const pieces=scale.segments(from,to).map((p,j)=>({x:slots[i].center-barWidth/2,y:Math.min(p.p1,p.p2),width:barWidth,height:Math.abs(p.p2-p.p1),from:p.from,to:p.to,index:j}));
    const mark={id,item:item.id,series:segment?segment.id:null,type:segment?'segment':item.type,value,from,to,x:slots[i].center,endpointY:scale.map(to),pieces,fill,weight:!segment&&['total','subtotal'].includes(item.type)?600:400};marks.push(mark);
    anchors[id]={x:mark.x,y:mark.endpointY,value,axisValue:to,item:item.id,series:mark.series,markId:id};return mark;
  }
  items.forEach((item,i)=>{if(spec.type==='stacked'){item.segments.forEach((seg,j)=>addMark(item,i,seg,j));anchors[item.id]={x:slots[i].center,y:scale.map(item.total),value:item.total,axisValue:item.total,item:item.id,series:null,markId:null};}else addMark(item,i,null,0);});
  const resolve=ref=>{if(typeof ref==='string'||typeof ref==='number')ref={item:String(ref)};if(!ref||ref.item===undefined)throw Error('比较端点须有 item');const key=String(ref.item)+(ref.series!==undefined?'::'+ref.series:'');if(!anchors[key])throw Error('未知比较端点: '+key);return {key,...anchors[key]};};
  const addRoute=(route)=>{routes.push(route);return route;};
  const connectionRefs=spec.connections?items.map(v=>resolve({item:v.id,...(spec.connections.series?{series:spec.connections.series}:{})})):[];
  if(spec.connections)connectionRefs.slice(0,-1).forEach((a,i)=>{
    const b=connectionRefs[i+1],x1=a.x+barWidth/2,x2=b.x-barWidth/2,mid=(x1+x2)/2;
    const expected=spec.connections.mode==='cumulative'&&items[i+1].type==='delta'?scale.map(items[i+1].from):b.y;
    const points=[point(x1,a.y),point(mid,a.y),point(mid,expected),point(x2,expected)];
    // 瀑布的累计连接是上一步终点到下一增量起点；total/subtotal 接到累计值。
    addRoute({id:'step-'+i,role:'step',points,fromKey:a.key,toKey:b.key,axisFrom:a.axisValue,axisTo:spec.connections.mode==='cumulative'&&items[i+1].type==='delta'?items[i+1].from:b.axisValue,dashed:spec.connections.style!=='solid',color:palette.muted});
  });
  comparisons.forEach((comparison,i)=>{
    const a=resolve(comparison.from),b=resolve(comparison.to);if(a.key===b.key)throw Error('比较须引用不同端点');
    const layer=!!(a.series||b.series);if(layer&&(!a.series||!b.series))throw Error('指定层比较的两端须同时指定 series；层与总量不可共用比较轨道');
    const derived=G.change(a.value,b.value,{...formatOptions,...comparison.format,kind:comparison.kind||'delta'}),subject=comparison.label?comparison.label+' ':layer?(series.find(v=>v.id===a.series)?.label||a.series)+' · Δ 层值 ':'Δ ';
    const text=subject+derived.deltaLabel+(comparison.showRelative===false?'':' · '+derived.rateLabel);
    const size=sizeOf(text,600);if(size.width>width-32)throw Error('比较文字过宽，请简化名称、增加宽度或分面');
    const block=comparisonBlocks[i],labelX=layer?width/2:Math.max(16+size.width/2,Math.min(width-16-size.width/2,(a.x+b.x)/2)),baseline=block.top+ascent;
    const label=fixedText('comparison-label-'+i,text,labelX,baseline,{anchor:'middle',weight:600,role:'comparison',comparison:i});
    if(layer){
      const refs=[a,b].map(v=>{if(!references.has(v.key))references.set(v.key,String.fromCharCode(65+references.size));return references.get(v.key);});
      const rowNames=[a,b].map((v,j)=>refs[j]+' '+items.find(k=>k.id===v.item).label),nameWidth=Math.max(...rowNames.map(v=>sizeOf(v).width)),valueWidth=Math.max(sizeOf(valueLabel(a.value)).width,sizeOf(valueLabel(b.value)).width);
      const railWidth=Math.min(230,width-nameWidth-valueWidth-100);if(railWidth<100)throw Error('层比较轨道空间不足，请增加宽度或缩短类别名称');
      const panelWidth=nameWidth+16+railWidth+12+valueWidth,left=(width-panelWidth)/2,zeroX=left+nameWidth+16;
      const localScale=G.createScale([0,Math.max(a.value,b.value)||1],[zeroX,zeroX+railWidth]),y1=block.top+lineHeight+18,y2=y1+lineHeight*2,middle=(y1+y2)/2;
      const track={id:'layer-track-'+i,domain:localScale.domain,range:localScale.range,bars:[]};
      [a,b].forEach((v,j)=>{const cy=j?y2:y1,x=localScale.map(v.value),key='layer-anchor-'+i+'-'+j,reference=refs[j];
        anchors[key]={x,y:cy,value:v.value,item:v.item,series:v.series,space:'layer-value',originKey:v.key,track:track.id};
        const mark=marks.find(k=>k.id===v.key);track.bars.push({key:v.key,value:v.value,reference,item:v.item,series:v.series,rect:{x:zeroX,y:cy-5,width:x-zeroX,height:10},fill:mark.fill});
        fixedText('layer-name-'+i+'-'+j,rowNames[j],left,cy+(ascent-descent)/2,{role:'layer-reference',item:v.item,series:v.series,reference});
        fixedText('layer-value-'+i+'-'+j,valueLabel(v.value),x+12,cy+(ascent-descent)/2,{role:'layer-value',item:v.item,series:v.series,value:v.value,reference});
      });
      fixedText('layer-zero-'+i,'0',zeroX,y2+lineHeight+2,{anchor:'middle',role:'layer-zero',color:palette.muted});
      layerTracks.push(track);
      const start=anchors['layer-anchor-'+i+'-0'],end=anchors['layer-anchor-'+i+'-1'];
      addRoute({id:'comparison-'+i,role:'comparison',space:'layer-value',owner:label.id,points:[point(start.x,start.y),point(start.x,middle),point(end.x,middle),point(end.x,end.y)],fromKey:a.key,toKey:b.key,fromAnchorKey:'layer-anchor-'+i+'-0',toAnchorKey:'layer-anchor-'+i+'-1',delta:derived.delta,rate:derived.rate,rateStatus:derived.rateStatus,axisFrom:a.value,axisTo:b.value,color:palette.ink,arrow:true,arrowAt:point(end.x,middle),arrowFrom:point(start.x,middle)});
    }else{
      const top=label.box.y+label.box.height+7,direction=Math.sign(b.x-a.x)||1;
      const ax=a.x+direction*(barWidth/2+8+i*2),bx=b.x-direction*(barWidth/2+8+i*2);
      addRoute({id:'comparison-'+i,role:'comparison',owner:label.id,points:[point(a.x,a.y),point(ax,a.y),point(ax,top),point(bx,top),point(bx,b.y),point(b.x,b.y)],fromKey:a.key,toKey:b.key,delta:derived.delta,rate:derived.rate,rateStatus:derived.rateStatus,axisFrom:a.axisValue,axisTo:b.axisValue,color:palette.ink,arrow:true});
    }
    label.fromKey=a.key;label.toKey=b.key;label.delta=derived.delta;label.rate=derived.rate;label.rateStatus=derived.rateStatus;
  });
  // 拆分穿越断层的竖直路线。数据端点、柱片和注释仍共用同一 map。
  function splitRoutes(){
    for(const route of routes){const pieces=[];for(let i=1;i<route.points.length;i++){
      const a=route.points[i-1],b=route.points[i];if(a.x!==b.x){pieces.push([a,b]);continue;}
      const ascending=a.y<b.y,low=Math.min(a.y,b.y),high=Math.max(a.y,b.y);let start=low;
      for(const band of [...scale.breaks].sort((x,y)=>Math.min(x.start,x.end)-Math.min(y.start,y.end))){const lo=Math.min(band.start,band.end),hi=Math.max(band.start,band.end);if(lo>low&&hi<high){pieces.push([point(a.x,start),point(a.x,lo)]);start=hi;}}
      pieces.push([point(a.x,start),point(a.x,high)]);if(!ascending){/* 路径分片只承载描边，箭头仍按真实末端单独绘制。 */}
    }route.drawPieces=pieces;}
  }
  const candidatesFor=(mark,text,weight)=>{
    const size=sizeOf(text,weight),w=size.width,h=size.height,largest=[...mark.pieces].sort((a,b)=>b.height-a.height)[0],out=[];
    for(const piece of [...mark.pieces].sort((a,b)=>b.height-a.height))if(piece.width>=w+12&&piece.height>=h+8)out.push({placement:'inside',box:{x:mark.x-w/2,y:piece.y+(piece.height-h)/2,width:w,height:h}});
    const top=Math.min(...mark.pieces.map(v=>v.y)),bottom=Math.max(...mark.pieces.map(v=>v.y+v.height));
    if(mark.series===null){out.push({placement:'outside',box:{x:mark.x-w/2,y:mark.value<0?bottom+7:top-h-8,width:w,height:h},noLeader:true});out.push({placement:'outside',box:{x:mark.x-w/2,y:mark.value<0?top-h-8:bottom+7,width:w,height:h},noLeader:true});}
    const center=largest.y+largest.height/2;
    for(let distance=0;distance<10;distance++)for(const sign of distance===0?[1]:[1,-1])for(const side of ['right','left']){
      const y=center-h/2+distance*sign*(h+7),x=side==='right'?mark.x+barWidth/2+16:mark.x-barWidth/2-16-w;
      out.push({placement:'outside',box:{x,y,width:w,height:h},side,anchor:point(side==='right'?mark.x+barWidth/2:mark.x-barWidth/2,center)});
    }
    return out;
  };
  function accepted(candidate,mark){
    const box=candidate.box;
    if(!G.contains(canvas,box)||box.y<plotTop-20||box.y+box.height>plotBottom+5)return false;
    if(labels.some(l=>G.intersects(box,l.box,4)))return false;
    if(marks.some(m=>m.pieces.some(p=>G.intersects(p,box,3))&&!(m.id===mark.id&&candidate.placement==='inside')))return false;
    if(routes.some(r=>r.points.slice(1).some((p,i)=>G.lineHitsRect(r.points[i],p,box,3))))return false;
    return true;
  }
  function leaderFor(candidate,mark,id){
    if(candidate.placement==='inside'||candidate.noLeader)return null;
    const b=candidate.box,side=candidate.side,anchor=candidate.anchor,destination=point(side==='right'?b.x:b.x+b.width,b.y+b.height/2);
    for(const offset of [6,9,12]){
      const elbow=anchor.x+(side==='right'?offset:-offset),points=[anchor,point(elbow,anchor.y),point(elbow,destination.y),destination];
      if(points.slice(1).some((p,i)=>labels.some(l=>G.lineHitsRect(points[i],p,l.box,2))))continue;
      if(points.slice(1).some((p,i)=>marks.some(m=>m.id!==mark.id&&m.pieces.some(r=>G.lineHitsRect(points[i],p,r,0)))))continue;
      return {id:'leader-'+id,role:'leader',owner:id,markId:marks.some(m=>m.id===mark.id)?mark.id:marks.filter(m=>m.item===mark.item).at(-1)?.id,points,color:palette.muted};
    }
    return false;
  }
  const requests=[];
  if(spec.type==='stacked')items.forEach((item,i)=>{
    const mark={id:item.id+'::total-label',item:item.id,series:null,type:'total',value:item.total,from:0,to:item.total,x:slots[i].center,endpointY:scale.map(item.total),pieces:[{x:slots[i].center-barWidth/2,y:scale.map(item.total),width:barWidth,height:0}],weight:600};
    requests.push({mark,text:valueLabel(item.total),priority:-100,total:true});
  });
  marks.forEach(mark=>requests.push({mark,text:(references.has(mark.id)?references.get(mark.id)+' ':'')+valueLabel(mark.value,mark.type==='delta'?'delta':'value'),priority:mark.pieces.reduce((s,p)=>s+p.height,0)}));
  // 小片先取得外置候选，避免大块的宽松候选挤占其唯一出路。
  requests.sort((a,b)=>a.priority-b.priority);
  requests.forEach((request,index)=>{
    const {mark,text}=request,id='value-'+mark.id,choices=candidatesFor(mark,text,mark.weight);let chosen,leader;
    for(const candidate of choices){if(!accepted(candidate,mark))continue;const route=leaderFor(candidate,mark,id);if(route===false)continue;chosen=candidate;leader=route;break;}
    if(!chosen)throw Error('无法无碰撞放置标签 '+mark.id+'（'+text+'）：增加画布/柱间距、减少比较或分面');
    if(leader)addRoute(leader);
    fixedText(id,text,chosen.box.x,chosen.box.y+ascent,{weight:mark.weight,color:chosen.placement==='inside'?textColor(mark.fill):palette.ink,role:request.total?'total-label':'value',placement:chosen.placement,markId:mark.id,item:mark.item,series:mark.series,value:mark.value,axisValue:mark.to,reference:references.get(mark.id)});
  });
  splitRoutes();
  // 通用旁解读：只在声明 annotations 时启用，复用与 ExhibitKit 同一个标注层；不声明时输出与旧版逐字节一致。
  let annotationSvg='';
  if(Array.isArray(spec.annotations)&&spec.annotations.length){
    const AL=require('../assets/annotation-layer.js');
    const layerScene=AL.createScene({width,height,fontSize,canvas:{x:8,y:4,width:width-16,height:height-8},plot:{top:plotTop,bottom:plotBottom},
      measure:(text,options)=>({width:measure(text,font(options.weight||400,options.size||fontSize)).width})});
    marks.forEach(mark=>mark.pieces.forEach((piece,index)=>AL.addObstacle(layerScene,{id:mark.pieces.length>1?mark.id+'#'+index:mark.id,box:{x:piece.x,y:piece.y,width:piece.width,height:Math.max(piece.height,1)}})));
    labels.forEach(label=>AL.addLabel(layerScene,{id:label.id,box:label.box,text:label.text,role:'text'}));
    routes.forEach(route=>AL.addRoute(layerScene,{id:route.id,points:route.points}));
    Object.entries(anchors).forEach(([id,anchor])=>{
      const mark=markOwner(anchor.markId);if(!mark)return;
      const xs=mark.pieces.map(p=>p.x),ys=mark.pieces.map(p=>p.y);
      AL.addAnchor(layerScene,{id,x:anchor.x,y:anchor.y,side:anchor.y<=plotTop+(plotBottom-plotTop)/2?'top':'bottom',value:anchor.value,label:id,markId:mark.id,
        box:{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...mark.pieces.map(p=>p.x+p.width))-Math.min(...xs),height:Math.max(...mark.pieces.map(p=>p.y+p.height))-Math.min(...ys)}});
    });
    const result=AL.annotate(layerScene,spec.annotations,{format:spec.format||{}});
    annotationSvg=AL.serialize(layerScene,result.items,{color:palette.ink,leaderColor:palette.muted});
  }
  function markOwner(id){return id===null||id===undefined?null:marks.find(mark=>mark.id===id)||null;}
  const model={version:'1.1.0',type:spec.type,width,height,fontSize,typography:profile.id,theme:spec.theme||'mckinsey',domain,plot:{x:plotLeft,y:plotTop,width:plotRight-plotLeft,height:plotBottom-plotTop},breaks:scale.breaks,marks,labels,routes,anchors,layerTracks};
  const audit=auditLayout(model);if(!audit.ok)throw Error('内部布局检查失败: '+JSON.stringify(audit.issues));
  const out=[],line=(a,b,color,extra={})=>`<line ${attrs({x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:color,...extra})}/>`;
  const commonData=mark=>({'data-item':mark.item,'data-series':mark.series,'data-value':mark.value,'data-from':mark.from,'data-to':mark.to,'data-mark-id':mark.id});
  // 统一锚点契约：与 ExhibitKit 同一组 data-anchor-*，供 AnnotationLayer.collect 与跨图型旁解读复用。
  const anchorData=(mark,piece,i)=>({'data-anchor-id':mark.pieces.length>1?mark.id+'#'+i:mark.id,
    'data-anchor-x':piece.x+piece.width/2,'data-anchor-y':piece.height===0?piece.y:mark.to>=mark.from?piece.y:piece.y+piece.height,
    'data-anchor-side':mark.to>=mark.from?'top':'bottom',
    'data-anchor-box':[piece.x,piece.y,piece.width,piece.height].join(','),
    'data-anchor-label':mark.item+(mark.series?'|'+mark.series:'')});
  for(const tick of ticks)out.push(line(point(plotLeft,scale.map(tick)),point(plotRight,scale.map(tick)),tick===0?palette.ink:palette.grid,{'stroke-width':tick===0?1.2:.6,'data-role':tick===0?'zero-axis':'axis-grid','data-axis-value':tick}));
  marks.forEach(mark=>{
    mark.pieces.forEach((piece,i)=>out.push(piece.height===0?line(point(piece.x,piece.y),point(piece.x+piece.width,piece.y),mark.fill,{'stroke-width':2,'data-role':'bar',...commonData(mark),...anchorData(mark,piece,i)}):`<rect ${attrs({x:piece.x,y:piece.y,width:piece.width,height:piece.height,fill:mark.fill,stroke:mark.weight===600?palette.ink:'white','stroke-width':mark.weight===600?1.6:.8,'data-role':'bar','data-semantic':mark.type,'data-piece':i,...commonData(mark),...anchorData(mark,piece,i)})}/>`));
    for(const band of scale.breaks)if(Math.min(mark.from,mark.to)<band.from&&Math.max(mark.from,mark.to)>band.to){const y=band.center;out.push(`<path d="M ${mark.x-barWidth/2} ${y+3} l ${barWidth*.33} -6 l ${barWidth*.34} 6 l ${barWidth*.33} -6" fill="none" stroke="${esc(palette.ink)}" stroke-width="1.3" data-role="mark-break" ${attrs(commonData(mark))}/>`);}
  });
  for(const band of scale.breaks){out.push(`<path d="M ${plotLeft-5} ${band.center+3} l 5 -6 l 5 6 l 5 -6" fill="none" stroke="${esc(palette.ink)}" stroke-width="1.3" data-role="axis-break" data-break-from="${band.from}" data-break-to="${band.to}"/>`);}
  decorations.forEach(d=>out.push(`<rect ${attrs(d)}/>`));
  layerTracks.forEach(track=>{
    const first=track.bars[0],last=track.bars.at(-1);out.push(line(point(track.range[0],first.rect.y-3),point(track.range[0],last.rect.y+last.rect.height+3),palette.grid,{'data-role':'layer-zero-axis','data-track':track.id}));
    track.bars.forEach(bar=>out.push(`<rect ${attrs({...bar.rect,fill:bar.fill,'data-role':'layer-bar','data-track':track.id,'data-mark-id':bar.key,'data-item':bar.item,'data-series':bar.series,'data-value':bar.value,'data-reference':bar.reference})}/>`));
  });
  routes.forEach(route=>{
    const d=route.drawPieces.map(([a,b])=>`M ${a.x} ${a.y} L ${b.x} ${b.y}`).join(' ');
    out.push(`<path ${attrs({d,fill:'none',stroke:route.color,'stroke-width':route.role==='comparison'?1.25:1,'stroke-dasharray':route.dashed?'4 3':undefined,'data-role':route.role,'data-route-id':route.id,'data-mark-id':route.markId,'data-from-key':route.fromKey,'data-to-key':route.toKey,'data-delta':route.delta,'data-rate':route.rate,'data-rate-status':route.rateStatus,'data-axis-from':route.axisFrom,'data-axis-to':route.axisTo,'data-space':route.space,'data-from-anchor-key':route.fromAnchorKey,'data-to-anchor-key':route.toAnchorKey,'data-anchor-x':route.points[0].x,'data-anchor-y':route.points[0].y})}/>`);
    if(route.arrow&&!(route.space==='layer-value'&&route.delta===0)){const end=route.arrowAt||route.points.at(-1),before=route.arrowFrom||route.points.at(-2),dx=Math.sign(end.x-before.x)||1;out.push(`<path d="M ${end.x-dx*6} ${end.y-4} L ${end.x} ${end.y} L ${end.x-dx*6} ${end.y+4}" fill="none" stroke="${esc(route.color)}" stroke-width="1.4" data-role="comparison-arrow" data-route-id="${route.id}" data-direction="${dx}"/>`);const start=route.points[0];out.push(`<circle cx="${start.x}" cy="${start.y}" r="2.5" fill="white" stroke="${esc(route.color)}" data-role="comparison-start"/>`);}
    if(route.role==='leader'){const p=route.points[0];out.push(`<circle cx="${p.x}" cy="${p.y}" r="1.7" fill="${esc(route.color)}" data-role="leader-anchor"/>`);}
    for(const band of scale.breaks)for(let i=1;i<route.points.length;i++){const a=route.points[i-1],b=route.points[i];if(a.x===b.x&&Math.min(a.y,b.y)<Math.min(band.start,band.end)&&Math.max(a.y,b.y)>Math.max(band.start,band.end))out.push(`<path d="M ${a.x-3} ${band.center+3} l 6 -6" fill="none" stroke="${esc(route.color)}" data-role="route-break"/>`);}
  });
  labels.forEach(label=>out.push(`<text ${attrs({x:label.x,y:label.baseline,'text-anchor':label.anchor,fill:label.color,'font-size':label.fontSize,'font-weight':label.weight,'data-role':label.role,'data-label-id':label.id,'data-placement':label.placement,'data-mark-id':label.markId,'data-item':label.item,'data-series':label.series,'data-value':label.value,'data-axis-value':label.axisValue,'data-reference':label.reference,'data-baseline':label.baseline,'data-from-key':label.fromKey,'data-to-key':label.toKey,'data-delta':label.delta,'data-rate':label.rate,'data-rate-status':label.rateStatus})}>${esc(label.text)}</text>`));
  const metadata={version:model.version,type:spec.type,domain,breaks:scale.breaks,anchors,layerTracks,layoutAudit:audit,measurement:'fontkit-tnum',font:profile.id};
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(spec.title||'数值分析展品')}" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" data-exhibit="precision" data-exhibit-type="${spec.type}" data-typography="${profile.id}" style="font-family:${esc(profile.body)};font-variant-numeric:lining-nums tabular-nums;font-synthesis:none;text-rendering:geometricPrecision"><title>${esc(spec.title||'数值分析展品')}</title><metadata>${esc(JSON.stringify(metadata))}</metadata><rect width="${width}" height="${height}" fill="white"/>${out.join('')}${annotationSvg}</svg>`;
  return {svg,geometry:model,audit};
}
function render(spec){return build(spec).svg;}
module.exports={render,build,auditLayout,normalize};
if(require.main===module){try{const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('用法: node render_precision_exhibit.cjs spec.json exhibit.svg');const result=build(JSON.parse(fs.readFileSync(input,'utf8')));fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,result.svg);console.log(JSON.stringify({ok:result.audit.ok,file:path.resolve(output),type:result.geometry.type,marks:result.geometry.marks.length,labels:result.geometry.labels.length,measurement:'fontkit-tnum'}));}catch(e){console.error(e.message);process.exitCode=1;}}
