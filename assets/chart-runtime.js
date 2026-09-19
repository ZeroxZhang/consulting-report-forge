/* 浏览器/Node共用的画布预算、主题解析与文字验收。只生成作者选定的表达并报告问题，不替作者换图型。 */
(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./echarts-recipes.js'):root.EChartsRecipes,typeof module==='object'&&module.exports?require('./deck-typography.js'):root.DeckTypography);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ChartRuntime=api;
})(typeof window!=='undefined'?window:null,function(recipes,typography){
  'use strict';
  const required=['ink','accent','gray-1','gray-2','gray-3','gray-4','page-bg','on-accent',...Array.from({length:6},(_,i)=>'cat-'+(i+1)),'seq-1','seq-3','seq-5'];
  const fmt=v=>typeof v==='number'?(v!==0&&Math.abs(v)<.0001?String(v):Number(v.toFixed(4)).toLocaleString('zh-CN',{maximumFractionDigits:4})):String(v??'—');
  function widthOf(s,font=14){return [...String(s)].reduce((sum,c)=>sum+(/[ -~]/.test(c)?font*.68:font),0);}
  function rgb(c){if(/^#[\da-f]{6}$/i.test(c))return c.slice(1).match(/../g).map(x=>parseInt(x,16));if(/^#[\da-f]{3}$/i.test(c))return [...c.slice(1)].map(x=>parseInt(x+x,16));if(/^rgba?\(/.test(c))return c.match(/[\d.]+/g).slice(0,3).map(Number);throw Error('颜色需先解析为HEX或RGB: '+c);}
  function luminance(c){const a=rgb(c).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;});return a[0]*.2126+a[1]*.7152+a[2]*.0722;}
  function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
  function textColor(bg,t){
    const choices=[t.ink,t['on-accent']];const valid=choices.filter(x=>contrast(x,bg)>=4.5);
    if(valid.length)return valid.sort((a,b)=>contrast(b,bg)-contrast(a,bg))[0];
    // 自定义色板的中间亮度可能让主题墨色和白色都不达标；黑白中至少一个可读。
    return contrast('#000000',bg)>contrast('#FFFFFF',bg)?'#000000':'#FFFFFF';
  }
  function interpolate(colors,v){const n=Math.max(0,Math.min(1,v))*(colors.length-1),i=Math.min(colors.length-2,Math.floor(n)),f=n-i,a=rgb(colors[i]),b=rgb(colors[i+1]);return 'rgb('+a.map((x,j)=>Math.round(x+(b[j]-x)*f)).join(',')+')';}
  function resolve(v,t){
    if(typeof v==='string'&&/^@[a-z][a-z0-9-]*$/.test(v)){if(!t[v.slice(1)])throw Error('未知主题token: '+v);return t[v.slice(1)];}
    if(Array.isArray(v))return v.map(x=>resolve(x,t));
    if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,resolve(x,t)]));
    return v;
  }
  function theme(t,font=14,typography_id){
    const fontFamily=typography.get(typography_id).body;
    required.forEach(k=>{if(!t[k])throw Error('主题缺少 '+k);});
    return {animation:false,color:Array.from({length:6},(_,i)=>t['cat-'+(i+1)]),backgroundColor:t['page-bg'],textStyle:{fontFamily,fontSize:font,color:t.ink},
      categoryAxis:{axisLabel:{fontSize:font,color:t.ink},axisTick:{show:false}},valueAxis:{axisLabel:{fontSize:font,color:t['gray-2']},splitLine:{lineStyle:{color:t['gray-4']}}}};
  }
  function options(raw,t,font=14,typography_id){
    const base=theme(t,font,typography_id),opt=resolve(raw,t);
    opt.color=opt.color||base.color;opt.backgroundColor=opt.backgroundColor||base.backgroundColor;opt.textStyle={...base.textStyle,...opt.textStyle};opt.animation=false;opt.tooltip={show:false};
    for(const name of ['xAxis','yAxis'])for(const axis of [].concat(opt[name]||[])){axis.axisLabel={fontSize:font,...axis.axisLabel};axis.nameTextStyle={fontSize:font,...axis.nameTextStyle};}
    for(const s of opt.series||[]){s.label={...s.label,fontSize:Math.max(font,s.label?.fontSize||0)};if(s.endLabel)s.endLabel={...s.endLabel,fontSize:Math.max(font,s.endLabel.fontSize||0)};}
    if(opt.legend)opt.legend.textStyle={fontSize:font,...opt.legend.textStyle};
    opt.textStyle.fontFamily=base.textStyle.fontFamily;
    function normalize(v){if(!v||typeof v!=='object')return;for(const k of Object.keys(v)){
      if(k==='fontFamily')v[k]=base.textStyle.fontFamily;
      else if(k==='fontStyle'&&v[k]!=='normal')throw Error('交付字体未提供斜体；请改用常规字形');
      else if(k==='fontWeight')v[k]=v[k]==='bold'||+v[k]>=600?600:+v[k]===500?500:400;
      else if(k==='font'&&typeof v[k]==='string'){
        if(/\b(?:italic|oblique)\b/.test(v[k]))throw Error('交付字体未提供斜体；请改用常规字形');
        const m=v[k].match(/^\s*(?:(normal|bold|[1-9]00)\s+)?([\d.]+)px\s+.+$/);
        if(!m)throw Error('图表 font 简写需使用常规字形、可选字重和 px 字号');
        const weight=m[1]==='bold'||+m[1]>=600?600:+m[1]===500?500:400;
        v[k]=`${weight} ${m[2]}px ${base.textStyle.fontFamily}`;
      }else normalize(v[k]);
    }}
    normalize(opt);
    return opt;
  }
  /* 预算只产生风险提示：写明受影响的对象和下一步该改什么，不改变表达类型、不写替代图形。 */
  function prepare(name,spec,settings){
    const ctx={width:960,height:500,fontSize:14,...settings};const {width,height,fontSize:font,tokens:t}=ctx;
    if(!Number.isFinite(width)||!Number.isFinite(height)||width<320||height<200)throw Error('画布至少320×200');
    if(!Number.isFinite(font)||font<14)throw Error('图表数据字号至少14px；模块放不下时扩大模块、拆分视图或减少同屏对象，不缩字号');
    theme(t,font,ctx.typography_id);
    const opt=options(recipes.build(name,spec),t,font,ctx.typography_id),plotH=height-100,risks=[];
    const risk=(code,scope,message)=>risks.push({code,scope,message});
    // 值轴名称位于轴端上方：预留名称、nameGap与字体空间，不靠验收失败后每图补坐标。
    if(opt.grid&&opt.yAxis?.name)opt.grid.top=Math.max(opt.grid.top||0,font*2+(opt.yAxis.nameGap??15)+5);
    if(name==='rankedBar'){
      const labels=opt.yAxis.data,perLabel=plotH/labels.length,maxWidth=Math.max(...labels.map(s=>widthOf(s,font))),valueWidth=Math.max(...opt.series[0].data.map(d=>widthOf(d.label.formatter,font)));
      if(perLabel<font*1.9)risk('category-space',labels,labels.length+' 个类别在 '+Math.round(plotH)+'px 绘图高度内每项约 '+perLabel.toFixed(1)+'px，低于标签行高；请提高模块高度、分组或拆成小多图。');
      if(maxWidth+valueWidth>width*.65)risk('label-space',labels,'最长类别名与数值合计占画布 65% 以上，绘图区被压到不足；请缩短措辞、换点图，或在更宽的版位上重排。');
      opt.grid={left:maxWidth+18,right:valueWidth+25,top:36,bottom:42,containLabel:false};
    }else if(name==='composition'){
      const totals=spec.items.map(x=>x.segments.reduce((sum,s)=>sum+s.value,0)),max=Math.max(...totals),barWidth=Math.min(54,(width-100)/spec.items.length*.6);
      spec.items.forEach((item,i)=>item.segments.forEach((seg,j)=>{
        const v=opt.series[j].data[i],label=opt.series[j].label.formatter({value:v}),denom=spec.mode==='percent'?totals[i]:max,h=seg.value/denom*plotH;
        if(h<font*1.8)risk('segment-space',{item:item.label,segment:seg.label,value:seg.value},'「'+item.label+'·'+seg.label+'」高度约 '+h.toFixed(1)+'px，段内放不下标签；请改用引线标注或局部放大，零值以位置标记表示，不虚增面积。');
        else if(widthOf(label,font)>barWidth-6)risk('segment-label',{item:item.label,segment:seg.label},'「'+item.label+'·'+seg.label+'」的标注长于我方可用的柱宽；请改用引线或缩短标签。');
      }));
      opt.series.forEach(s=>s.label.color=textColor(s.itemStyle.color,t));
    }else if(name==='groupedBar'){
      const cellWidth=(width-100)/spec.categories.length/spec.series.length,long=spec.categories.filter(s=>widthOf(s,font)>(width-100)/spec.categories.length-8);
      if(long.length)risk('category-space',long,'类别标签「'+long.join('」「')+'」在 '+spec.categories.length+' 类中超出可用列宽；请换横向布局、缩短措辞或减少类别。');
      spec.series.forEach(s=>s.values.forEach((v,i)=>{if(widthOf(fmt(v),font)+8>cellWidth)risk('value-space',{category:spec.categories[i],series:s.name},'「'+spec.categories[i]+'·'+s.name+'」的数值标注超出柱宽；请减少系列、加宽模块或改用点图。');}));
    }else if(name==='heatmap'){
      const left=Math.max(...spec.rows.map(s=>widthOf(s,font)))+18,colW=(width-left-84)/spec.columns.length,rowH=plotH/spec.rows.length;
      if(rowH<font*2)risk('row-space',spec.rows,spec.rows.length+' 行在 '+Math.round(plotH)+'px 内每行约 '+rowH.toFixed(1)+'px；请提高模块高度或拆分矩阵。');
      const wide=spec.columns.filter(s=>widthOf(s,font)>colW-8);
      if(wide.length)risk('column-space',wide,'列名「'+wide.join('」「')+'」超出单元格宽度；请缩短列名、减少列数或改用横向布局。');
      spec.values.forEach((row,i)=>row.forEach((v,j)=>{if(widthOf(fmt(v),font)>colW-8)risk('cell-space',{row:spec.rows[i],column:spec.columns[j]},'「'+spec.rows[i]+'·'+spec.columns[j]+'」的数值超出单元格宽度；请减少小数位或拆分矩阵。');}));
      opt.grid={left,right:84,top:48,bottom:32,containLabel:false};
      opt.xAxis.axisLabel.interval=0;opt.yAxis.axisLabel.interval=0;
      const vm=opt.visualMap;opt.series[0].data.forEach(d=>{const bg=interpolate(vm.inRange.color,(d.value[2]-vm.min)/(vm.max-vm.min));d.label={color:textColor(bg,t),formatter:fmt(d.value[2])};});
    }else if(name==='histogram'){
      const cellW=(width-100)/spec.bins.length,wide=spec.bins.filter(d=>widthOf(d.label,font)>cellW-6);
      if(wide.length)risk('bin-space',wide.map(d=>d.label),'区间标签「'+wide.map(d=>d.label).join('」「')+'」超出柱宽；请减少区间数、改为较少分箱或旋转标签。');
    }else if(name==='timeSeries'){
      const long=spec.series.filter(s=>widthOf(s.name,font)>82);
      if(long.length)risk('endpoint-space',long.map(s=>s.name),'系列名「'+long.map(s=>s.name).join('」「')+'」超出末端标签预算；请缩短系列名、改用图例或在更宽的版位上重排。');
    }else if(name==='tree'){
      let nodes=0,maxLabel=0,depth=0;(function visit(n,d){nodes++;depth=Math.max(depth,d);maxLabel=Math.max(maxLabel,widthOf(n.label,font));(n.children||[]).forEach(c=>visit(c,d+1));})(spec.root,0);
      if(nodes>12||depth>3||maxLabel>width/4)risk('node-space',{nodes,depth,maxLabel:Math.round(maxLabel)},nodes+' 个节点、'+depth+' 层、最长标签约 '+Math.round(maxLabel)+'px；请拆成总览＋局部，或把同一层换成更宽的版位。');
      opt.series[0].label.formatter=p=>p.name+(p.value===undefined?'':'\n'+fmt(p.value));
    }else if(name==='sankey'){
      const zero=spec.links.filter(l=>l.value===0),long=spec.nodes.map(n=>typeof n==='string'?n:n.name).filter(n=>widthOf(n,font)>width/4);
      if(zero.length)risk('zero-flow',zero.map(l=>l.source+'→'+l.target),'零流量连线「'+zero.map(l=>l.source+'→'+l.target).join('」「')+'」的带宽为零，图上只有它的数值标签 0 落在该路径上；请在旁解读里写明这是真实的零，或把该状态改为独立表达。');
      if(spec.nodes.length>12||spec.links.length>15)risk('flow-space',{nodes:spec.nodes.length,links:spec.links.length},spec.nodes.length+' 节点 / '+spec.links.length+' 连线超出静态标签预算；请分组、只画主要流向，或拆成总览＋局部。');
      if(long.length)risk('node-label',long,'节点名「'+long.join('」「')+'」超出画布四分之一；请缩短节点名或加宽模块。');
    }else if(name==='scatter'){
      const zeros=spec.items.filter(d=>d.size===0);
      if(zeros.length){
        risk('zero-size',zeros.map(d=>d.label),'零规模对象「'+zeros.map(d=>d.label).join('」「')+'」面积为零；已用等大的空心位置标记表示位置，不参与面积编码。');
        opt.series[0].data.forEach((d,i)=>{if(spec.items[i].size===0){d.symbol='emptyCircle';d.symbolSize=[9,9];}});
      }
      if(spec.items.some(d=>d.size!==undefined)){
        const max=Math.max(...spec.items.map(d=>d.size));
        opt.series[0].data.forEach((d,i)=>{const item=spec.items[i];d.label.show=d.label.show||item.size===max;d.label.formatter=item.label+'\n'+fmt(item.size)+(spec.sizeUnit||'');});
        opt.graphic=[{type:'text',x:12,y:height-18,silent:true,style:{text:'气泡面积与规模成正比；最大圆：'+fmt(max)+(spec.sizeUnit||'（规模单位未提供）')+(zeros.length?'；空心小圈为零规模的位置标记，不代表面积':''),fontSize:font,fontFamily:typography.get(ctx.typography_id).body,fill:t['gray-2']}}];
      }
      // 数值轴末端留空白给标签，不改变数据点。
      for(const [axis,key] of [['xAxis','x'],['yAxis','y']]){const vals=spec.items.map(d=>d[key]),lo=Math.min(0,...vals),hi=Math.max(0,...vals),pad=(hi-lo||1)*.12;opt[axis].min=lo-pad;opt[axis].max=hi+pad;}
    }
    // 逐类目/期间必须出现的坐标轴标签：ECharts 会自动抽稀，静默丢标签不能被当成通过。
    const axes=[];
    if(name==='timeSeries')axes.push(...spec.periods);
    else if(name==='groupedBar'||name==='histogram')axes.push(...(spec.categories||spec.bins.map(d=>d.label)));
    else if(name==='rankedBar')axes.push(...spec.items.map(d=>d.label));
    else if(name==='heatmap')axes.push(...spec.rows,...spec.columns);
    return {recipe:name,width,height,fontSize:font,risks,axes,pages:[{kind:'chart',option:opt}],context:ctx};
  }
  // 图元可能嵌在分组里，局部矩形要乘上累计变换，否则拿到的是自己的坐标系而不是画布坐标。
  function rectOf(el){const rect=el.getBoundingRect().clone(),t=el.getComputedTransform?el.getComputedTransform():el.transform;if(t)rect.applyTransform(t);return rect;}
  /* 实心图元才算遮挡：描边、虚线和透明填充不挡字，且只比较画在文字之后的图元——
     段内标签画在自己的色块之后属正常，画在色块之前才会被吞掉。 */
  function solid(el){
    if(el.ignore||el.invisible||el.type==='tspan'||el.type==='text')return null;
    const style=el.style||{},fill=style.fill,opacity=(style.opacity??1)*(style.fillOpacity??1);
    if(!fill||fill==='none'||fill==='transparent'||/^rgba\([^)]*,\s*0\s*\)$/i.test(fill)||opacity<.85)return null;
    const rect=rectOf(el);
    if(rect.width<2||rect.height<2)return null;
    return rect;
  }
  function audit(chart,minFont=14){
    const boxes=[],problems=[],width=chart.getWidth(),height=chart.getHeight();
    const list=chart.getZr().storage.getDisplayList(true);
    for(let index=0;index<list.length;index++){
      const el=list[index];
      if(el.type!=='tspan'||el.ignore||el.invisible||!String(el.style.text||'').trim())continue;
      const rect=rectOf(el),t=el.getComputedTransform?el.getComputedTransform():el.transform;
      const font=parseFloat(el.style.fontSize||el.style.font||minFont),scale=t?Math.hypot(t[2],t[3]):1;
      const item={text:String(el.style.text),x:rect.x,y:rect.y,w:rect.width,h:rect.height};
      if(rect.x<-.5||rect.y<-.5||rect.x+rect.width>width+.5||rect.y+rect.height>height+.5)problems.push({type:'bounds',text:item.text});
      if(Number.isFinite(font)&&font*scale<minFont-.5)problems.push({type:'font',text:item.text});
      for(const other of boxes){const dx=Math.min(item.x+item.w,other.x+other.w)-Math.max(item.x,other.x),dy=Math.min(item.y+item.h,other.y+other.h)-Math.max(item.y,other.y);if(dx>.5&&dy>.5)problems.push({type:'overlap',text:item.text,other:other.text});}
      // 被后画的实心图元盖住：数值还在，但读者读不到，不能算通过。
      // 只看是否盖住文字中心：图例色块、色阶块这类贴边的小图元会压到文本框，但不会挡字。
      const cx=item.x+item.w/2,cy=item.y+item.h/2;
      for(let later=index+1;later<list.length;later++){
        const mark=solid(list[later]);if(!mark)continue;
        if(cx<mark.x||cx>mark.x+mark.width||cy<mark.y||cy>mark.y+mark.height)continue;
        const dx=Math.min(item.x+item.w,mark.x+mark.width)-Math.max(item.x,mark.x),dy=Math.min(item.y+item.h,mark.y+mark.height)-Math.max(item.y,mark.y);
        if(dx*dy/(item.w*item.h)>=.25){problems.push({type:'covered',text:item.text,by:list[later].type});break;}
      }
      boxes.push(item);
    }
    // boxes 一并返回：旁解读要把图上已有的文字登记成静态标签来避让，重推一遍会和这里算出的框对不上。
    return {problems,texts:boxes.map(b=>b.text),boxes};
  }
  const FIX={bounds:'标签超出画布：调整绘图区边距、换行、标签位置或引线；仍放不下就扩大模块或拆分视图。',overlap:'标签相互遮挡：调整方向、顺序、间距或引线位置，或改用分面与局部细节；不能靠缩小字号或删掉必要标签解决。',font:'实际字号小于 14px：扩大模块或减少同屏对象，不缩字号。',missing:'声明的类目或期间没有出现在图上：查是否被自动抽稀、截断或隐藏，改到每个都画出来或改成明确的分面。',covered:'有数值被后画的图形盖住：把标签移到带内、空白处或加引线，必要时调整节点尺寸与间距。'};
  /* 报告实测问题：越界、遮挡、字号，以及声明了却没画出来的类目。通过前必须据此返修，不能换成别的表达。 */
  function check(chart,plan){
    const inspection=audit(chart,plan.fontSize||14),seen=new Set(inspection.texts);
    const problems=inspection.problems.map(p=>({...p,fix:FIX[p.type]}));
    for(const label of plan.axes||[])if(!seen.has(String(label)))problems.push({type:'missing',text:String(label),fix:FIX.missing});
    return {status:problems.length?'needs-repair':'ok',problems,boxes:inspection.boxes};
  }
  return {version:'3.0.0',prepare,check,audit,options,theme,resolve,contrast,textColor,interpolate,widthOf};
});
