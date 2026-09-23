/* ECharts 6 咨询图表配方：统一输入校验、标签、语义色和静态渲染入口。 */
(function(root,factory){
  const policy=typeof module==='object'&&module.exports?require('./form-capacity.js'):root.FormCapacity;
  const api=factory(policy);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.EChartsRecipes=api;
})(typeof window!=='undefined'?window:null,function(policy){
  'use strict';
  if(!policy)throw new Error('EChartsRecipes 需要 form-capacity.js');

  const VERSION='1.1.0';
  const colors=['@accent','@cat-2','@cat-3','@cat-4','@cat-5','@cat-6'];
  const cap=(form,key)=>policy.limit('recipe.'+form,key);
  const limits={rankedBar:cap('rankedBar','items'),groupedBar:cap('groupedBar','categories'),groupedSeries:cap('groupedBar','series'),timeSeries:cap('timeSeries','periods'),timeSeriesSeries:cap('timeSeries','series'),composition:cap('composition','items'),compositionSeries:cap('composition','series'),histogram:cap('histogram','bins'),scatter:cap('scatter','items'),heatmap:cap('heatmap','cells'),sankeyNodes:cap('sankey','nodes'),sankeyLinks:cap('sankey','links'),treeNodes:cap('tree','nodes')};

  function fail(message){throw new Error(message);}
  function list(value,name){if(!Array.isArray(value)||!value.length)fail(name+' 必须是非空数组');return value;}
  function text(value,name){if(typeof value!=='string'||!value.trim())fail(name+' 必须是非空文字');return value.trim();}
  function num(value,name){if(typeof value!=='number'||!Number.isFinite(value))fail(name+' 必须是有限数值');return value;}
  function count(value,max,name){if(value>max)fail(name+' 超出单页起始预算 '+max+'；请分面、拆页、换更宽的版位或换绘制路径，不把数据压回表格');}
  function span(value,min,max,def,name){if(value===undefined)return def;if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail(name+' 需为 '+min+'–'+max+' 的数值');return value;}
  function decimals(value,digits=1){return Number(value.toFixed(digits)).toLocaleString('zh-CN',{maximumFractionDigits:digits});}
  function display(item,spec){return item.display===undefined?decimals(item.value,spec.decimals===undefined?1:spec.decimals)+(spec.suffix||''):String(item.display);}
  function roleColor(role,index){
    if(role==='accent')return '@accent';
    if(role==='risk')return '@risk';
    if(role==='good')return '@good';
    if(role==='caution')return '@caution';
    if(role==='positive')return '@delta-positive';
    if(role==='negative')return '@delta-negative';
    if(role==='neutral')return '@gray-3';
    return colors[index%colors.length];
  }
  function grid(extra){return Object.assign({left:10,right:48,top:24,bottom:22,containLabel:true},extra||{});}
  function valueAxis(spec,extra){return Object.assign({type:'value',name:spec.unit||'',nameTextStyle:{color:'@gray-2'},axisLabel:{color:'@gray-2'},splitLine:{lineStyle:{color:'@gray-4'}}},extra||{});}
  function categoryAxis(data,extra){return Object.assign({type:'category',data,axisLine:{lineStyle:{color:'@gray-3'}},axisTick:{show:false},axisLabel:{color:'@ink'}},extra||{});}

  function rankedBar(spec={}){
    const input=list(spec.items,'items').map((d,i)=>({label:text(d.label,'items['+i+'].label'),value:num(d.value,'items['+i+'].value'),display:d.display,role:d.role,selected:!!d.selected}));
    count(input.length,limits.rankedBar,'排序条形类别数');
    const items=spec.sort==='none'?input:input.slice().sort((a,b)=>(spec.sort==='asc'?a.value-b.value:b.value-a.value));
    const data=items.map((d,i)=>({value:d.value,itemStyle:{color:d.selected||(!items.some(v=>v.selected)&&i===0)?roleColor(d.role||'accent',i):roleColor(d.role||'neutral',i)},label:{show:true,position:d.value<0?'left':'right',formatter:display(d,spec),color:d.role==='risk'?'@risk':'@ink',fontWeight:d.selected||i===0?700:400}}));
    const marks=[];
    if(spec.baseline!==undefined){num(spec.baseline,'baseline');marks.push({xAxis:spec.baseline,label:{formatter:spec.baselineLabel||String(spec.baseline)}});}
    if(spec.min!==undefined&&(num(spec.min,'min')>Math.min(0,...items.map(d=>d.value))))fail('条形范围必须包含零和全部数据');
    if(spec.max!==undefined&&(num(spec.max,'max')<Math.max(0,...items.map(d=>d.value))))fail('条形范围必须包含零和全部数据');
    return {animation:false,tooltip:{show:false},grid:grid({left:8,right:70}),xAxis:valueAxis(spec,{min:spec.min,max:spec.max}),yAxis:categoryAxis(items.map(d=>d.label),{inverse:true,axisLabel:{color:'@ink',interval:0}}),series:[{type:'bar',barMaxWidth:28,data,markLine:marks.length?{symbol:'none',silent:true,lineStyle:{color:'@gray-3',type:'dashed'},label:{color:'@gray-2',position:'insideStartTop',rotate:0,distance:6},data:marks}:undefined}]};
  }

  function groupedBar(spec={}){
    const categories=list(spec.categories,'categories').map((d,i)=>text(d,'categories['+i+']'));
    const series=list(spec.series,'series');count(categories.length,limits.groupedBar,'簇状柱类别数');count(series.length,limits.groupedSeries,'簇状柱系列数');
    series.forEach((s,i)=>{text(s.name,'series['+i+'].name');if(!Array.isArray(s.values)||s.values.length!==categories.length)fail('series['+i+'].values 与 categories 长度不一致');s.values.forEach((v,j)=>num(v,'series['+i+'].values['+j+']'));});
    const hasNegative=series.some(s=>s.values.some(v=>v<0));
    return {animation:false,tooltip:{show:false},legend:{bottom:0,textStyle:{color:'@gray-1'}},grid:grid({bottom:48}),xAxis:categoryAxis(categories,{axisLabel:{color:'@ink',interval:0}}),yAxis:valueAxis(spec,{min:hasNegative?undefined:0}),series:series.map((s,i)=>({name:s.name,type:'bar',barMaxWidth:30,itemStyle:{color:roleColor(s.role,i)},label:{show:true,position:'top',formatter:'{c}',color:'@ink'},data:s.values.map(v=>({value:v,label:{position:v<0?'bottom':'top'}}))}))};
  }

  function timeSeries(spec={}){
    const periods=list(spec.periods,'periods').map((d,i)=>text(d,'periods['+i+']'));
    const series=list(spec.series,'series');count(periods.length,limits.timeSeries,'时间点数');count(series.length,limits.timeSeriesSeries,'折线系列数');
    series.forEach((s,i)=>{text(s.name,'series['+i+'].name');if(!Array.isArray(s.values)||s.values.length!==periods.length)fail('series['+i+'].values 与 periods 长度不一致');s.values.forEach((v,j)=>{if(v!==null)num(v,'series['+i+'].values['+j+']');});});
    const values=series.flatMap(s=>s.values).filter(v=>v!==null);
    // 每个期间都必须出现：交给 axisLabel.interval 自动抽稀会静默丢掉期号，实测验收看不出被丢的是哪一期。
    // 点数一多默认不画数据点；但没画点就没有图元可锚，旁解读会整条落空——所以这里留一个显式开关（spec 或单系列都认）。
    const symbolOn=s=>s.showSymbol!==undefined?s.showSymbol:(spec.showSymbol!==undefined?spec.showSymbol:periods.length<=8);
    // 纵向范围写了就必须生效：以前只有 zeroBaseline 管轴，spec.min/max 被静默忽略——
    // 作者以为收窄了轴，图却照旧，是这一层里最难被看出来的一类错。
    // 收窄可以，但不能把数据切掉，所以范围仍须覆盖全部取值；与热力图的"范围必须覆盖全部数据"同一立场。
    const lo=spec.min===undefined?undefined:num(spec.min,'min'),hi=spec.max===undefined?undefined:num(spec.max,'max');
    if(lo!==undefined&&values.length&&lo>Math.min(...values))fail('timeSeries.min 高于最小数据 '+decimals(Math.min(...values))+'，折线会被裁掉；收窄纵轴不能丢数据');
    if(hi!==undefined&&values.length&&hi<Math.max(...values))fail('timeSeries.max 低于最大数据 '+decimals(Math.max(...values))+'，折线会被裁掉；收窄纵轴不能丢数据');
    if(lo!==undefined&&hi!==undefined&&!(hi>lo))fail('timeSeries 的 min 必须小于 max');
    const yRange={min:lo===undefined?(spec.zeroBaseline?Math.min(0,...values):undefined):lo,max:hi===undefined?(spec.zeroBaseline?Math.max(0,...values):undefined):hi};
    return {animation:false,tooltip:{show:false},grid:grid({right:92}),xAxis:categoryAxis(periods,{boundaryGap:false,axisLabel:{color:'@gray-2',interval:0}}),yAxis:valueAxis(spec,yRange),series:series.map((s,i)=>({name:s.name,type:'line',connectNulls:false,showSymbol:symbolOn(s),symbolSize:5,lineStyle:{width:s.selected?3:2,color:roleColor(s.role,i)},itemStyle:{color:roleColor(s.role,i)},endLabel:{show:true,formatter:s.name,color:roleColor(s.role,i),fontWeight:s.selected?700:400},labelLayout:{moveOverlap:'shiftY'},data:s.values}))};
  }

  function composition(spec={}){
    if(!['absolute','percent',undefined].includes(spec.mode))fail('composition.mode 应为 absolute 或 percent');
    const items=list(spec.items,'items');count(items.length,limits.composition,'构成类别数');
    const first=list(items[0].segments,'items[0].segments').map((d,i)=>text(d.label,'items[0].segments['+i+'].label'));count(first.length,limits.compositionSeries,'构成系列数');
    if(new Set(first).size!==first.length)fail('构成系列名称必须唯一');
    const rows=items.map((item,i)=>{text(item.label,'items['+i+'].label');const segs=list(item.segments,'items['+i+'].segments');if(segs.length!==first.length)fail('所有类别必须显式列出相同系列');const values=segs.map((seg,j)=>{if(text(seg.label,'segment.label')!==first[j])fail('所有类别的系列顺序必须一致');const v=num(seg.value,'segment.value');if(v<0)fail('构成值不能为负数');return v;});const total=values.reduce((a,b)=>a+b,0);if(total<=0)fail('构成总量必须大于0');return {label:item.label,values,total};});
    const percent=spec.mode==='percent';
    return {animation:false,tooltip:{show:false},legend:{bottom:0,textStyle:{color:'@gray-1'}},grid:grid({bottom:48}),xAxis:categoryAxis(rows.map(r=>r.label),{axisLabel:{color:'@ink',interval:0}}),yAxis:valueAxis(spec,{min:0,max:percent?100:undefined,axisLabel:{formatter:percent?'{value}%':'{value}',color:'@gray-2'}}),series:first.map((name,j)=>({name,type:'bar',stack:'total',barMaxWidth:54,itemStyle:{color:colors[j%colors.length],borderColor:'@page-bg',borderWidth:1},label:{show:true,position:'inside',formatter:p=>decimals(p.value,spec.decimals===undefined?1:spec.decimals)+(percent?'%':''),color:'@on-accent'},data:rows.map(r=>percent?r.values[j]/r.total*100:r.values[j])}))};
  }

  function histogram(spec={}){
    const bins=list(spec.bins,'bins').map((d,i)=>({label:text(d.label,'bins['+i+'].label'),value:num(d.value,'bins['+i+'].value')}));count(bins.length,limits.histogram,'直方图区间数');
    if(bins.some(d=>d.value<0))fail('频数不能为负数');
    return {animation:false,tooltip:{show:false},grid:grid(),xAxis:categoryAxis(bins.map(d=>d.label),{axisLabel:{color:'@gray-2',interval:0,rotate:bins.length>10?35:0}}),yAxis:valueAxis(spec,{min:0}),series:[{type:'bar',barCategoryGap:'0%',itemStyle:{color:'@accent',borderColor:'@page-bg',borderWidth:.5},data:bins.map(d=>d.value)}]};
  }

  function scatter(spec={}){
    const items=list(spec.items,'items').map((d,i)=>({label:text(d.label,'items['+i+'].label'),x:num(d.x,'items['+i+'].x'),y:num(d.y,'items['+i+'].y'),size:d.size===undefined?null:num(d.size,'items['+i+'].size'),role:d.role,selected:!!d.selected}));count(items.length,limits.scatter,'散点数');
    if(items.some(d=>d.size!==null&&d.size<0))fail('气泡尺寸不能为负数');
    if(items.some(d=>d.size===null)&&items.some(d=>d.size!==null))fail('气泡规模缺失不能与零或普通散点混用；请分组、拆成两张图，或对缺失对象单独编码');
    const actualMax=Math.max(0,...items.map(d=>d.size||0));
    const maxSize=spec.sizeDomainMax===undefined?actualMax:num(spec.sizeDomainMax,'sizeDomainMax');
    if(maxSize<actualMax||maxSize<0)fail('sizeDomainMax必须覆盖全部规模');
    return {animation:false,tooltip:{show:false},grid:grid({right:58,top:46,bottom:60}),xAxis:valueAxis({unit:spec.xUnit||''},{name:(spec.xLabel||'X')+(spec.xUnit?'（'+spec.xUnit+'）':''),nameLocation:'middle',nameGap:28}),yAxis:valueAxis({unit:spec.yUnit||''},{name:(spec.yLabel||'Y')+(spec.yUnit?'（'+spec.yUnit+'）':'')}),series:[{type:'scatter',clip:false,symbolSize:v=>v[2]===null?10:maxSize===0?0:Math.sqrt(v[2]/maxSize)*42,data:items.map((d,i)=>({name:d.label,value:[d.x,d.y,d.size],itemStyle:{color:d.selected?'@accent':roleColor(d.role||'neutral',i),opacity:d.selected?1:.78},label:{show:d.selected||items.length<=policy.limit('recipe.scatter','labeledPoints','softMax'),formatter:d.label,position:'top',color:'@ink',fontWeight:d.selected?700:400}})),markLine:spec.referenceLines?{symbol:'none',silent:true,lineStyle:{color:'@gray-3',type:'dashed'},data:spec.referenceLines}:undefined}]};
  }

  function heatmap(spec={}){
    const rows=list(spec.rows,'rows').map((d,i)=>text(d,'rows['+i+']')),columns=list(spec.columns,'columns').map((d,i)=>text(d,'columns['+i+']')),values=list(spec.values,'values');count(rows.length*columns.length,limits.heatmap,'热力单元格数');
    if(values.length!==rows.length||values.some(r=>!Array.isArray(r)||r.length!==columns.length))fail('values 必须与 rows × columns 一致');values.flat().forEach((v,i)=>num(v,'values['+i+']'));
    const flat=values.flat(),min=spec.min===undefined?Math.min(...flat):num(spec.min,'min');
    const max=spec.max===undefined?Math.max(...flat)===min?min+1:Math.max(...flat):num(spec.max,'max');if(!(max>min))fail('热力图范围必须递增');
    if(Math.min(...flat)<min||Math.max(...flat)>max)fail('热力范围必须覆盖全部数据');
    const data=values.flatMap((row,i)=>row.map((v,j)=>({value:[j,i,v]})));
    return {animation:false,tooltip:{show:false},grid:grid({right:70}),xAxis:categoryAxis(columns,{position:'top'}),yAxis:categoryAxis(rows,{inverse:true}),visualMap:{min,max,orient:'vertical',right:0,top:'middle',calculable:false,inRange:{color:['@seq-1','@seq-3','@seq-5']},textStyle:{color:'@gray-2'}},series:[{type:'heatmap',label:{show:true},data,emphasis:{disabled:true}}]};
  }

  function sankey(spec={}){
    const nodes=list(spec.nodes,'nodes').map((d,i)=>{const colorIndex=typeof d==='object'&&d.colorIndex!==undefined?d.colorIndex:i%colors.length;if(!Number.isInteger(colorIndex)||colorIndex<0||colorIndex>=colors.length)fail('colorIndex必须为0–5');return {name:text(typeof d==='string'?d:d.name,'nodes['+i+'].name'),itemStyle:{color:colors[colorIndex]}};});
    const names=new Set(nodes.map(d=>d.name));if(names.size!==nodes.length)fail('Sankey节点名称必须唯一');count(nodes.length,limits.sankeyNodes,'Sankey节点数');
    const links=list(spec.links,'links').map((d,i)=>{const source=text(d.source,'links['+i+'].source'),target=text(d.target,'links['+i+'].target'),value=num(d.value,'links['+i+'].value');if(!names.has(source)||!names.has(target))fail('Sankey连线引用未知节点');if(value<0)fail('Sankey流量不能为负数');return {source,target,value};});count(links.length,limits.sankeyLinks,'Sankey连线数');
    const visiting=new Set(),done=new Set();function visit(name){if(visiting.has(name))fail('Sankey不能含环；改用关系图');if(done.has(name))return;visiting.add(name);links.filter(l=>l.source===name).forEach(l=>visit(l.target));visiting.delete(name);done.add(name);}nodes.forEach(n=>visit(n.name));
    nodes.forEach(n=>{const incoming=links.filter(l=>l.target===n.name).reduce((s,l)=>s+l.value,0),outgoing=links.filter(l=>l.source===n.name).reduce((s,l)=>s+l.value,0);if(incoming>0&&outgoing>0&&Math.abs(incoming-outgoing)>Math.max(incoming,outgoing)*1e-9)fail('Sankey中间节点流量不闭合：'+n.name+'；显式补出有来源的流失/新增项');if(!links.some(l=>l.source===n.name||l.target===n.name))fail('Sankey节点没有连线：'+n.name);});
    if(!links.some(l=>l.value>0))fail('全部流量为零，Sankey 无法用带宽表示任何关系；请补充正流量数据，或改用能表示零状态的表达（流程状态图、占位标注）');
    if(spec.nodeAlign!==undefined&&!['justify','left','right'].includes(spec.nodeAlign))fail('Sankey nodeAlign 应为 justify/left/right');
    // 节点宽与间距不编码数据，只影响标签能否落在空白处；边标签容易被节点条压住时应显式调小。
    return {animation:false,tooltip:{show:false},series:[{type:'sankey',data:nodes,links,nodeAlign:spec.nodeAlign||'justify',layoutIterations:32,nodeGap:span(spec.nodeGap,0,40,10,'Sankey nodeGap'),nodeWidth:span(spec.nodeWidth,4,40,14,'Sankey nodeWidth'),lineStyle:{color:'gradient',opacity:.35},label:{color:'@ink',fontSize:14},edgeLabel:{show:true,formatter:'{c}',fontSize:14,color:'@ink'},emphasis:{disabled:true}}]};
  }

  function tree(spec={}){
    if(!spec.root||typeof spec.root!=='object')fail('root 必填');let n=0;const seen=new Set();
    function visit(node,path){if(!node||typeof node!=='object'||seen.has(node))fail('树含非法节点或循环');seen.add(node);n++;const out={name:text(node.label,path+'.label')};if(node.value!==undefined)out.value=num(node.value,path+'.value');if(node.children!==undefined){if(!Array.isArray(node.children))fail(path+'.children 必须是数组');out.children=node.children.map((child,i)=>visit(child,path+'.children['+i+']'));}return out;}
    const data=visit(spec.root,'root');count(n,limits.treeNodes,'树节点数');
    return {animation:false,tooltip:{show:false},series:[{type:'tree',data:[data],orient:spec.orient||'LR',symbol:'roundRect',symbolSize:[10,10],edgeShape:'polyline',edgeForkPosition:'50%',lineStyle:{color:'@gray-3',width:1.5},itemStyle:{color:'@accent'},label:{position:'left',verticalAlign:'middle',align:'right',color:'@ink',fontSize:13},leaves:{label:{position:'right',align:'left'}},expandAndCollapse:false,initialTreeDepth:-1,emphasis:{disabled:true}}]};
  }

  const builders={rankedBar,groupedBar,timeSeries,composition,histogram,scatter,heatmap,sankey,tree};
  function build(name,spec){if(!Object.prototype.hasOwnProperty.call(builders,name))fail('未知ECharts配方: '+name);return builders[name](spec||{});}
  return {version:VERSION,names:Object.keys(builders),limits,build,...builders};
});
