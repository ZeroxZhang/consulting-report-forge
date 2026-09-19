/* 共享的数值语义、数据尺度和布局轨道。纯函数；不依赖 DOM 或本机字体。 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.ExhibitGeometry=api;})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const finite=(value,name='value')=>{if(typeof value!=='number'||!Number.isFinite(value))throw Error(name+' 必须为有限数值');return value;};
  const close=(a,b)=>Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));
  function formatNumber(value,options={}){
    finite(value);const decimals=options.decimals;
    if(decimals!==undefined&&(!Number.isInteger(decimals)||decimals<0||decimals>8))throw Error('decimals 须为 0 至 8 的整数');
    let digits=decimals===undefined?8:decimals,rounded=Number(value.toFixed(digits));
    // 不把真实的小值印成零；必要时增加有效小数或使用科学计数法。
    if(value!==0&&rounded===0){digits=Math.min(8,Math.max(digits,Math.ceil(-Math.log10(Math.abs(value)))+1));rounded=Number(value.toFixed(digits));}
    const signed=options.signed===true,prefix=value<0?'−':signed&&value>0?'+':'';
    let label=rounded===0&&value!==0?Math.abs(value).toExponential(2):new Intl.NumberFormat('en-US',{useGrouping:options.grouping!==false,minimumFractionDigits:decimals===undefined?0:digits,maximumFractionDigits:digits}).format(Math.abs(rounded));
    return prefix+label+(options.suffix||'');
  }
  function semanticFormat(value,options={}){
    const kind=options.kind||'value';finite(value);
    if(kind==='value')return formatNumber(value,options);
    if(kind==='delta')return formatNumber(value,{...options,signed:true});
    if(kind==='rate')return formatNumber(value*100,{...options,signed:options.signed!==false,suffix:'%'});
    if(kind==='pp'){
      if(!['fraction','percent'].includes(options.basis))throw Error('百分点须声明 basis: fraction 或 percent');
      return formatNumber(value*(options.basis==='fraction'?100:1),{...options,signed:true,suffix:' 个百分点'});
    }
    if(kind==='multiple')return formatNumber(value,{...options,suffix:'×'});
    throw Error('未知数值语义: '+kind);
  }
  function change(start,end,options={}){
    finite(start,'start');finite(end,'end');const delta=finite(end-start,'delta');
    let rate=null,rateStatus='ok';
    if(start===0)rateStatus='zero-base';else if(start<0)rateStatus='negative-base';else rate=finite(delta/start,'rate');
    const deltaKind=options.kind==='pp'?'pp':'delta';
    return {start,end,delta,deltaLabel:semanticFormat(delta,{...options,kind:deltaKind}),rate,rateStatus,
      rateLabel:rate===null?(rateStatus==='zero-base'?'增长率不适用（零基数）':'增长率不适用（负基数）'):semanticFormat(rate,{...options,kind:'rate',decimals:options.rateDecimals===undefined?1:options.rateDecimals})};
  }
  function extent(values,supplied){
    if(!Array.isArray(values)||!values.length)throw Error('尺度需要数据');values.forEach(v=>finite(v));
    let lo=Math.min(0,...values),hi=Math.max(0,...values);
    if(supplied!==undefined){if(!Array.isArray(supplied)||supplied.length!==2)throw Error('domain 需要两个端点');[lo,hi]=supplied;finite(lo);finite(hi);if(lo>0||hi<0)throw Error('柱/瀑布的数值轴须保留零点');if(values.some(v=>v<lo||v>hi))throw Error('domain 截断数据');}
    else if(lo===hi){lo=-1;hi=1;}else {const pad=(hi-lo)*.1;if(lo<0)lo-=pad;if(hi>0)hi+=pad;}
    if(lo>=hi)throw Error('domain 须递增');return [lo,hi];
  }
  function createScale(domain,range,options={}){
    if(!Array.isArray(domain)||domain.length!==2||!Array.isArray(range)||range.length!==2)throw Error('domain/range 需要两个端点');
    const [lo,hi]=domain,[a,b]=range;[lo,hi,a,b].forEach(v=>finite(v));if(lo>=hi||a===b)throw Error('尺度范围无效');
    const breaks=(options.breaks||[]).map(v=>({from:finite(v.from,'break.from'),to:finite(v.to,'break.to'),gap:v.gap===undefined?14:finite(v.gap,'break.gap')})).sort((x,y)=>x.from-y.from);
    breaks.forEach((v,i)=>{if(v.from<=lo||v.to>=hi||v.from>=v.to||v.gap<8||v.from<=0&&v.to>=0||i&&breaks[i-1].to>=v.from)throw Error('断层须在域内、不含零点、不重叠且 gap 至少为 8');});
    const distance=Math.abs(b-a),removed=breaks.reduce((s,v)=>s+v.to-v.from,0),gap=breaks.reduce((s,v)=>s+v.gap,0);
    if(gap>=distance*.35)throw Error('断层间隔占据过多绘图区');
    const unit=(distance-gap)/(hi-lo-removed),direction=Math.sign(b-a);
    function visible(v){finite(v);return v>=lo&&v<=hi&&!breaks.some(k=>v>k.from&&v<k.to);}
    function map(v){finite(v);if(!visible(v))throw Error('数据端点位于域外或断层内部: '+v);let travelled=(v-lo)*unit;for(const k of breaks)if(v>=k.to)travelled-=(k.to-k.from)*unit-k.gap;return a+direction*travelled;}
    const bands=breaks.map(v=>({...v,start:map(v.from),end:map(v.to),center:(map(v.from)+map(v.to))/2}));
    function segments(start,end){finite(start);finite(end);if(!visible(start)||!visible(end))throw Error('图元端点位于域外或断层内部');const min=Math.min(start,end),max=Math.max(start,end),pieces=[];let cursor=min;for(const k of breaks){if(k.to<=min||k.from>=max)continue;if(cursor<k.from)pieces.push({from:cursor,to:k.from});cursor=k.to;}if(cursor<max||start===end)pieces.push({from:cursor,to:max});return pieces.map(v=>({...v,p1:map(v.from),p2:map(v.to)}));}
    return {domain:[lo,hi],range:[a,b],breaks:bands,unit,map,visible,segments};
  }
  function waterfall(items){
    if(!Array.isArray(items)||!items.length)throw Error('items 不可为空');let acc=0;const ids=new Set();
    return items.map((d,i)=>{const id=String(d.id===undefined?i:d.id);if(ids.has(id))throw Error('item.id 不可重复');ids.add(id);if(!['total','subtotal','delta'].includes(d.type))throw Error('瀑布 type 应为 total/subtotal/delta');let from=0,to;
      if(d.type==='delta'){from=acc;to=finite(acc+finite(d.value),'cumulative');acc=to;}
      else if(d.type==='total'){to=finite(d.value);if(i>0&&!close(to,acc))throw Error('总计不等于累计值: '+id);acc=to;}
      else {to=acc;if(d.value!==undefined&&!close(finite(d.value),acc))throw Error('小计不等于累计值: '+id);}
      return {...d,id,from,to,value:d.type==='delta'?finite(to-from):to};});
  }
  function rowTracks(rows,options={}){
    if(!Array.isArray(rows))throw Error('rows 须为数组');const size=finite(options.fontSize===undefined?16:options.fontSize),lineHeight=finite(options.lineHeight===undefined?size*1.5:options.lineHeight),gap=finite(options.gap===undefined?8:options.gap);let top=finite(options.top===undefined?0:options.top);
    if(size<=0||lineHeight<size||gap<0)throw Error('行轨道尺寸无效');
    return rows.map((row,index)=>{const lines=Array.isArray(row)?row.length:Array.isArray(row.lines)?row.lines.length:1;if(lines<1)throw Error('行至少含一条基线');const height=lines*lineHeight,firstBaseline=top+(lineHeight-size)/2+size*.8,lastBaseline=firstBaseline+(lines-1)*lineHeight,track={index,top,height,center:top+height/2,firstBaseline,lastBaseline,baselines:Array.from({length:lines},(_,i)=>firstBaseline+i*lineHeight),right:options.right};top+=height+gap;return track;});
  }
  function intersects(a,b,gap=0){return a.x<b.x+b.width+gap&&a.x+a.width+gap>b.x&&a.y<b.y+b.height+gap&&a.y+a.height+gap>b.y;}
  function contains(a,b,gap=0){return b.x>=a.x+gap&&b.y>=a.y+gap&&b.x+b.width<=a.x+a.width-gap&&b.y+b.height<=a.y+a.height-gap;}
  function lineHitsRect(a,b,rect,pad=0){
    const r={x:rect.x-pad,y:rect.y-pad,width:rect.width+2*pad,height:rect.height+2*pad};
    if(a.x===b.x)return a.x>r.x&&a.x<r.x+r.width&&Math.max(a.y,b.y)>r.y&&Math.min(a.y,b.y)<r.y+r.height;
    if(a.y===b.y)return a.y>r.y&&a.y<r.y+r.height&&Math.max(a.x,b.x)>r.x&&Math.min(a.x,b.x)<r.x+r.width;
    // Liang–Barsky，供自定义斜线和引线复用。
    const dx=b.x-a.x,dy=b.y-a.y,p=[-dx,dx,-dy,dy],q=[a.x-r.x,r.x+r.width-a.x,a.y-r.y,r.y+r.height-a.y];let t0=0,t1=1;
    for(let i=0;i<4;i++){if(p[i]===0){if(q[i]<=0)return false;}else {const t=q[i]/p[i];if(p[i]<0)t0=Math.max(t0,t);else t1=Math.min(t1,t);if(t0>=t1)return false;}}return true;
  }
  return {version:'1.0.0',finite,close,formatNumber,semanticFormat,change,extent,createScale,waterfall,rowTracks,intersects,contains,lineHitsRect};
});
