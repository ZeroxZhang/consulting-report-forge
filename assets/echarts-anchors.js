/* ECharts 配方的锚点适配：把一次 SSR 渲染的展示表图元与解析后的 option，翻成通用标注层认的锚点契约。
   只做命名与取值；矩形由调用方传进来（渲染期的根坐标），本模块既不碰几何也不依赖 DOM。
   取值一律取"画出来的那个数"，不重新推导——百分堆积画的是百分比，锚点原值就必须是百分比。 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.EChartsAnchors=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';

  const VERSION='1.0.0';

  function unwrap(item){return item&&typeof item==='object'&&!Array.isArray(item)&&item.value!==undefined?item.value:item;}
  function seriesAt(option,index){
    const list=(option&&option.series)||[],series=list[index];
    if(!series)throw new Error('引用了不存在的系列 '+index);
    return series;
  }
  function dataAt(option,index,data){
    const items=seriesAt(option,index).data;
    if(!Array.isArray(items)||!Number.isInteger(data)||data<0||data>=items.length)throw new Error('系列 '+index+' 取不到第 '+data+' 项数据');
    return items[data];
  }
  function need(name,where){if(!name)throw new Error(where+' 取不到类别名');return String(name);}
  // 差额只报正数部分，避免浮点残差把"守恒"判成不守恒。
  function flowOf(links,name){
    let incoming=0,outgoing=0;
    for(const link of links){if(link.target===name)incoming+=link.value;if(link.source===name)outgoing+=link.value;}
    return Math.max(incoming,outgoing);
  }

  /* 每种配方一个适配器：(option, seriesIndex, dataIndex, chartName, chartValue, elementType) → {id, label, value, group}。
     类别名一律用 ECharts 数据模型给的 chartName：ranking 会排序、树的 dataIndex 从 1 起，从 spec 反推这两处都会错。 */
  const ADAPTERS={
    rankedBar(o,s,d,name){
      const label=need(name,'rankedBar 第 '+d+' 项');
      return {id:'bar:'+label,label,value:unwrap(dataAt(o,s,d))};
    },
    groupedBar(o,s,d,name){
      const label=need(name,'groupedBar 第 '+d+' 项');
      return {id:'bar:'+label+'|'+seriesAt(o,s).name,label,group:label,value:unwrap(dataAt(o,s,d))};
    },
    timeSeries(o,s,d,name){
      const label=need(name,'timeSeries 第 '+d+' 项');
      const raw=unwrap(dataAt(o,s,d));
      // 空值点不编数字：锚点照发（图元确实画了），原值留空而不是写 0。
      return {id:'point:'+label+'|'+seriesAt(o,s).name,label,group:label,value:Number.isFinite(raw)?raw:undefined};
    },
    composition(o,s,d,name){
      const label=need(name,'composition 第 '+d+' 项');
      return {id:'seg:'+label+'|'+seriesAt(o,s).name,label,group:label,value:unwrap(dataAt(o,s,d))};
    },
    histogram(o,s,d,name){
      const label=need(name,'histogram 第 '+d+' 项');
      return {id:'bin:'+label,label,value:unwrap(dataAt(o,s,d))};
    },
    scatter(o,s,d,name){
      const point=dataAt(o,s,d),value=point&&point.value;
      if(!Array.isArray(value)||value.length<2)throw new Error('scatter 第 '+d+' 项不是 [x,y] 形式');
      // 锚点原值只能是一个数，取纵轴值；横轴与规模留在标签里，不塞进 value。
      return {id:'point:'+(name||value[0]),label:String(name||value[0]),value:value[1]};
    },
    heatmap(o,s,d,name){
      const columns=((o.xAxis||{}).data)||[],rows=((o.yAxis||{}).data)||[];
      if(!columns.length||!rows.length)throw new Error('heatmap 取不到行列标签');
      const row=rows[Math.floor(d/columns.length)],column=columns[d%columns.length];
      if(row===undefined||column===undefined)throw new Error('heatmap 第 '+d+' 格超出行列范围');
      const cell=dataAt(o,s,d),value=cell&&cell.value;
      return {id:'cell:'+row+'|'+column,label:String(name||column),group:String(row),value:Array.isArray(value)?value[2]:unwrap(cell)};
    },
    sankey(o,s,d,name,value,element){
      const series=seriesAt(o,s),links=Array.isArray(series.links)?series.links:[];
      // 节点画成 rect、连线画成 path，两者的 (series,data) 会撞在同一个下标上，只能按图元类型分派。
      if(element==='rect'){
        const node=(series.data||[])[d];
        if(!node)throw new Error('sankey 取不到第 '+d+' 个节点');
        const label=String(typeof node==='string'?node:node.name);
        return {id:'node:'+label,label,value:flowOf(links,label)};
      }
      if(element==='path'){
        const link=links[d];
        if(!link)throw new Error('sankey 取不到第 '+d+' 条连线');
        return {id:'flow:'+link.source+'→'+link.target,label:link.source+'→'+link.target,group:link.source,value:link.value};
      }
      throw new Error('sankey 出现认不出的图元类型: '+element);
    },
    tree(o,s,d,name,value){
      const label=need(name,'tree 第 '+d+' 个节点');
      return {id:'node:'+label,label,value:Number.isFinite(value)?value:undefined};
    }
  };

  /* entries：展示表里带元数据的图元，按显示顺序，每项 {seriesIndex,dataIndex,ssrType,type,rect}。
     图例是另一套 ECData（ssr_type!=='chart'）；markLine 画成 ec-line，都不是数据图元。
     认不出的东西记进 issues 交给调用方抛错，绝不静默少发一个锚点。 */
  function anchors(input){
    const o=input||{},option=o.option,entries=Array.isArray(o.entries)?o.entries:[];
    const resolve=typeof o.resolve==='function'?o.resolve:function(){return {};};
    const adapter=ADAPTERS[o.recipe];
    if(!adapter)throw new Error('没有为配方 '+o.recipe+' 定义锚点适配');
    const list=[],issues=[],seen=new Set();
    entries.forEach(function(entry,index){
      if(entry.ssrType!=='chart'||entry.type==='ec-line')return;
      const rect=entry.rect;
      if(!rect||![rect.x,rect.y,rect.width,rect.height].every(Number.isFinite)){issues.push({index,reason:'bad-rect',message:'第 '+index+' 个图元的矩形非有限'});return;}
      let at={};
      try{at=resolve(entry.seriesIndex,entry.dataIndex)||{};}
      catch(error){issues.push({index,reason:'resolve-failed',message:error.message});return;}
      let made;
      try{made=adapter(option,entry.seriesIndex,entry.dataIndex,at.name,at.value,entry.type);}
      catch(error){issues.push({index,reason:'adapter-failed',message:error.message});return;}
      if(seen.has(made.id)){issues.push({index,reason:'duplicate-id',message:'锚点 id 重复: '+made.id+'（配方 '+o.recipe+'）'});return;}
      seen.add(made.id);
      list.push({
        index,
        anchor:{
          id:made.id,label:made.label,group:made.group,value:made.value,
          x:rect.x+rect.width/2,y:rect.y+rect.height/2,
          box:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}
        }
      });
    });
    return {anchors:list,issues};
  }

  return {version:VERSION,recipes:Object.keys(ADAPTERS),anchors};
});
