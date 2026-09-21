/* 原创零依赖、可打印 SVG 分析图组件。所有数值编码由数据计算。 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  // 内核是第三个依赖，但只有声明了 waterfall 报告的图才用得上；浏览器少加载它不影响其余形式。
  const api = factory(isNode ? require('./deck-typography.js') : root.DeckTypography, isNode ? require('./annotation-layer.js') : root.AnnotationLayer, isNode ? require('./waterfall-bridge.js') : root.WaterfallBridge);
  if (isNode) module.exports = api;
  if (root) root.ExhibitKit = api;
})(typeof window !== 'undefined' ? window : null, function (typography, AnnotationLayer, WaterfallBridge) {
  'use strict';
  if (!AnnotationLayer) throw new Error('ExhibitKit 需要 annotation-layer.js（浏览器加载时须先于本文件）');
  const esc = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num = (v, name) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(name + ' 必须为有限数值'); return v; };
  const list = (v, name) => { if (!Array.isArray(v) || !v.length) throw new Error(name + ' 不可为空'); return v; };
  /* residual 取主题的 risk 令牌：它必须在灰度里也能与 positive/negative 分开。
     三个预设的 caution/warn 都太靠近 delta-negative（麦肯锡 #805B18 对 #9C5C14），
     用它们等于让"说不清的差额"和"下降"长成同一个颜色。 */
  const p0 = {"ink":"#172C3B","muted":"#50606E","grid":"#BFCBD2","accent":"#000080","positive":"#000080","negative":"#9C5C14","residual":"#A3313C","surface":"#F2F5F7","selected":"#D9D9EC","series":["#000080","#007A78","#8652A0","#9C5C14","#667586","#9B4566"],"sequential":["#D9D9EC","#A3A3D1","#6D6DB6","#36369B","#000080"],"ranges":["#F2F5F7","#E8EDF0","#BFCBD2"]};
  /* 透明填充叠加白底后计算实际亮度，不能用透明度阈值推断文字颜色。 */
  function rgb(color) {
    if (typeof color !== 'string') throw new Error('颜色需要字符串');
    const hex=color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if(hex){const h=hex[1].length===3?hex[1].split('').map(v=>v+v).join(''):hex[1];return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));}
    const match=color.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
    if(match&&match.slice(1).every(v=>+v<=255))return match.slice(1).map(Number);
    throw new Error('热力表颜色请使用 #RGB、#RRGGBB 或 rgb(r,g,b)，以便验证对比度');
  }
  function luminance(channels){const linear=channels.map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);});return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722;}
  function contrast(a,b){return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);}
  function cellText(accent,alpha,ink){
    const bg=luminance(rgb(accent).map(v=>alpha*v+(1-alpha)*255));
    const dark=contrast(bg,luminance(rgb(ink))),light=contrast(bg,1);
    if(dark>=4.5)return ink;
    if(light>=4.5)return '#FFFFFF';
    /* 自定义 ink 太浅时，黑色兜底；黑或白至少有一个满足4.5。 */
    return '#000000';
  }
  // 标注测量：优先用交付字体的真实字形；取不到时退回保守估宽，不冒认真实测量。
  function lazyMeasure(spec,profile){
    let impl=null;
    return function(text,options){
      if(!impl){
        if(typeof spec.measure==='function')impl=spec.measure;
        else if(typeof module==='object'&&module.exports){
          try{const Metrics=require('../scripts/font_metrics.cjs'),base=Metrics.measurer(profile),type=typography;impl=(value,opts)=>base(value,(opts.weight||400)+' '+(opts.size||14)+'px '+type.get(profile).body);}
          catch(error){impl=AnnotationLayer.estimateMeasure;}
        }else impl=AnnotationLayer.estimateMeasure;
      }
      return impl(text,options);
    };
  }
  function canvas(s) {
    if (!s || typeof s !== 'object') throw new Error('需要规格对象');
    const w=num(s.width === undefined ? 960 : s.width,'width'), h=num(s.height === undefined ? 500 : s.height,'height');
    if(w<320||h<200) throw new Error('画布至少 320×200');
    const fs=num(s.fontSize===undefined?14:s.fontSize,'fontSize'); if(fs<14) throw new Error('标签字号不得小于14');
    const p=Object.assign({},p0,s.palette||{}); if(s.palette&&s.palette.accent&&!Object.prototype.hasOwnProperty.call(s.palette,'sequential'))p.sequential=null; list(p.series,'palette.series');
    const fontFamily=typography.get(s.typography_id).body;
    const out=[];
    // 只有声明了 annotations 的图才建立标注场景；无标注时保持原有快速路径与逐像素输出。
    const scene=s.annotations?AnnotationLayer.createScene({width:w,height:h,fontSize:fs,measure:lazyMeasure(s,typography.get(s.typography_id).id),canvas:{x:4,y:4,width:w-8,height:h-8},plot:s.plot||null}):null;
    const ascent=fs*1.16,descent=fs*0.288;
    function boxFor(x,y,t,anchor){const width=scene?AnnotationLayer.sizeOf(scene,t,{size:fs}).width:0;const left=anchor==='middle'?x-width/2:anchor==='end'?x-width:x;return {x:left,y:y-ascent,width,height:ascent+descent};}
    const text=(x,y,t,anchor='start',color=p.ink,extra='') => { if(t===undefined||t===null||String(t).trim()==='')throw new Error('文字标签不能为空'); if(scene)AnnotationLayer.addLabel(scene,{id:'plain-'+(scene.labels.length),box:boxFor(x,y,t,anchor),text:String(t),role:'text'}); out.push(`<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${esc(color)}" ${extra}>${esc(t)}</text>`); };
    const rect=(x,y,width,height,color,extra='') => { if (![x,y,width,height].every(Number.isFinite)||width<0||height<0) throw new Error('非法矩形'); if(scene)AnnotationLayer.addObstacle(scene,{id:(/data-anchor-id="([^"]+)"/.exec(extra)||[])[1]||'rect-'+(scene.obstacles.length),box:{x,y,width,height}}); out.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${esc(color)}" ${extra}/>`); };
    const line=(x1,y1,x2,y2,color=p.grid,extra='') => { if(scene)AnnotationLayer.addRoute(scene,{id:'line-'+(scene.routes.length),points:[{x:x1,y:y1},{x:x2,y:y2}],color}); out.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${esc(color)}" ${extra}/>`); };
    const circle=(cx,cy,r,color,extra='') => out.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${esc(color)}" ${extra}/>`);
    // 锚点契约：图元中心为参考点，box 为图元矩形；引线接在 box 边界上。
    const anchor=(spec)=>{if(scene)AnnotationLayer.addAnchor(scene,spec);return AnnotationLayer.anchorAttrs(spec);};
    // 标注装不下时向右／向下扩容，图元坐标不动，与原引擎 fit:'grow' 同一约定；上报 requested/actual。
    const growth=Array.isArray(s.annotationGrowth)?s.annotationGrowth:[[0,0],[160,0],[160,72],[300,72],[300,144],[440,200]];
    const actual={width:w,height:h,requestedWidth:w,requestedHeight:h,resized:false};
    const end=()=>{
      let body=out.join(''),leaderSvg='';
      if(scene&&s.annotations){
        const options=Object.assign({format:s.format||{}},s.annotationOptions||{});
        let result=null,failure=null;
        for(const [growX,growY] of growth){
          AnnotationLayer.setCanvas(scene,{x:4,y:4,width:w-8+growX,height:h-8+growY});
          const mark=AnnotationLayer.snapshot(scene);
          try{result=AnnotationLayer.annotate(scene,s.annotations,options);break;}
          catch(error){AnnotationLayer.restore(scene,mark);failure=error;}
        }
        if(!result)throw failure||new Error('标注无法放置');
        actual.width=scene.canvas.width+8;actual.height=scene.canvas.height+8;
        actual.resized=actual.width!==w||actual.height!==h;
        actual.annotations=result.items.length;
        // 柱内标注按图元实际填充取反差色，不手写颜色。
        result.items.forEach(item=>{const owner=scene.anchors[item.anchor];if(!item.color&&item.placement==='inside'&&owner&&owner.fill)item.color=cellText(owner.fill,1,p.ink);});
        leaderSvg=AnnotationLayer.serialize(scene,result.items,Object.assign({color:p.ink,leaderColor:p.muted,annotationColor:p.ink},s.serializeOptions||{}));
      }
      return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(s.title||'分析图')}" viewBox="0 0 ${actual.width} ${actual.height}" width="${actual.width}" height="${actual.height}" data-typography="${typography.get(s.typography_id).id}" data-requested-size="${w}×${h}" data-actual-size="${actual.width}×${actual.height}" style="font-family:${esc(fontFamily)};font-size:${fs}px;font-synthesis:none;text-rendering:geometricPrecision;font-variant-numeric:lining-nums tabular-nums"><title>${esc(s.title||'分析图')}</title><rect width="${actual.width}" height="${actual.height}" fill="white"/>${body.replace(/font-weight="700"/g,'font-weight="600"')}${leaderSvg}</svg>`;
    };
    return {w,h,fs,p,out,text,rect,line,circle,anchor,scene,end,actual};
  }
  function domain(values, supplied) {
    let lo=Math.min(0,...values),hi=Math.max(0,...values);
    if(supplied!==undefined){if(!Array.isArray(supplied)||supplied.length!==2)throw new Error('domain 需要两个数');lo=num(supplied[0],'domain');hi=num(supplied[1],'domain');if(values.some(v=>v<lo||v>hi))throw new Error('domain 截断数据');}
    if(lo===hi){lo-=1;hi+=1;} if(lo>=hi)throw new Error('domain 顺序错误');return [lo,hi];
  }
  const scale=(d,a,b)=>v=>a+(v-d[0])/(d[1]-d[0])*(b-a);
  function rows(c,n){const y0=40,dy=(c.h-90)/n;if(dy<c.fs+12)throw new Error('行过多，请增加高度或拆分');return {y0,dy};}
  // 统一数字格式；计算使用原值，四舍五入只发生在显示阶段。
  function formatNumber(value, options={}) {
    num(value,'value');
    const decimals=options.decimals;
    if(decimals!==undefined&&(!Number.isInteger(decimals)||decimals<0||decimals>6))throw new Error('decimals 须为0至6的整数');
    const rounded=Number(value.toFixed(decimals===undefined?8:decimals));
    const digits=new Intl.NumberFormat('en-US',{useGrouping:options.grouping!==false,minimumFractionDigits:decimals||0,maximumFractionDigits:decimals===undefined?8:decimals}).format(Math.abs(rounded));
    return (rounded<0?'−':options.signed&&rounded>0?'+':'')+digits+(options.suffix||'');
  }
  function difference(start,end,options={}) {
    num(start,'start');num(end,'end');let value=end-start,suffix=options.suffix||'';
    const mode=options.mode||'absolute';
    if(mode==='relative') {if(start<=0)throw new Error('相对变化需正基数；请改用绝对差');value=(end-start)/start*100;suffix='%';}
    else if(mode==='pp') {
      if(!['fraction','percent'].includes(options.basis))throw new Error('百分点需声明 basis: fraction 或 percent');
      value*=options.basis==='fraction'?100:1;suffix='个百分点';
    } else if(mode==='cagr') {
      if(start<=0||end<=0||num(options.periods,'periods')<=0)throw new Error('CAGR 需正起止值和实际年数');
      value=((end/start)**(1/options.periods)-1)*100;suffix='% CAGR';
    } else if(mode!=='absolute')throw new Error('未知差异类型');
    num(value,'difference');
    return {value,label:formatNumber(value,{...options,suffix,signed:true})};
  }
  // 保守估宽用于选择布局，不声称取代浏览器字形测量。
  const textWidth=(value,fs)=>Array.from(String(value)).reduce((n,ch)=>n+(/[\u0000-\u007f]/.test(ch)?.62:1),0)*fs;
  function fittedText(c,x,y,value,width,anchor='start',color=c.p.ink,extra='') {
    if(textWidth(value,c.fs)>width)throw new Error('标签空间不足，请扩容、简化措辞、换行或把该标注移到引线通道：'+value);
    c.text(x,y,value,anchor,color,extra);
  }
  function comparisonBracket(c,points,options) {
    const {from,to}=options;
    if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<=from||to>=points.length)throw new Error('comparison 需有效的 from < to 索引');
    const a=points[from],b=points[to],result=difference(a.value,b.value,options);
    let label=result.label;
    if(options.showRelative)label+='（'+difference(a.value,b.value,{mode:'relative',decimals:options.decimals}).label+'）';
    const center=(a.x+b.x)/2;
    fittedText(c,center,24,label,2*Math.min(center-12,c.w-12-center),'middle',c.p.ink,'font-weight="700" data-role="comparison-label"');
    c.line(a.x,40,b.x,40,c.p.ink);
    c.line(a.x,40,a.x,49,c.p.ink);c.line(b.x,40,b.x,49,c.p.ink);
  }
  const WF_MAX_NODES=18;
  /* 内核报告的节点已带 from/to/value 与预格式化文本：渲染器只画，不重算累计、不重排数字。
     体检未通过的报没有图可画——画一张对不上账的图比拒绝出图更糟。 */
  function kernelBars(report){
    if(!report||typeof report!=='object')throw new Error('waterfall 应为内核报告对象');
    if(report.status!=='ready'||!report.chart)throw new Error('瀑布数据未通过体检，不能出图：'+((report.issues||[]).map(v=>v.code).join('、')||'缺少 chart'));
    const bars=report.chart.bars;
    if(!Array.isArray(bars)||!bars.length)throw new Error('内核报告缺 bars');
    if(bars.length>WF_MAX_NODES)throw new Error('瀑布节点 '+bars.length+' 个，超过 '+WF_MAX_NODES+'：请归并驱动项，不静默截断');
    return bars.map(b=>{
      if(!['start','delta','subtotal','end','residual'].includes(b.type))throw new Error('未知瀑布节点类型: '+b.type);
      return {label:b.label,from:num(b.from,'from'),to:num(b.to,'to'),type:b.type,value:num(b.value,'value'),text:b.valueText};});
  }
  /* 折行只在放不下时发生；放得下时逐字符与不折行相同，既有 spec 的输出因此不变。 */
  function wrapLabel(c,text,width){
    const lines=WaterfallBridge?WaterfallBridge.labelLines(text,width/c.fs):[String(text)];
    if(lines.length>2)throw new Error('类别标签折成 '+lines.length+' 行，超出瀑布标签区：请缩短措辞或加宽画布：'+text);
    return lines;
  }
  function waterfall(s){
    const c=canvas(s),report=s.waterfall;
    if(report&&s.items)throw new Error('不要同时声明 items 与 waterfall：几何与文本都来自内核，重复声明必然漂移');
    const items=report?kernelBars(report):list(s.items,'items');let acc=0;
    const steps=report?items:items.map((d,i)=>{if(!['total','delta','subtotal'].includes(d.type))throw new Error('waterfall type 应为 total/delta/subtotal');let from,to;
      if(d.type==='delta'){from=acc;to=acc+num(d.value,'value');acc=to;}
      else if(d.type==='total'){from=0;to=num(d.value,'value');if(i>0&&Math.abs(to-acc)>1e-8*Math.max(1,Math.abs(acc)))throw new Error('总计不等于累计值');acc=to;}
      else {from=0;to=acc;if(d.value!==undefined&&Math.abs(num(d.value,'value')-acc)>1e-8)throw new Error('小计不等于累计值');}
      return {label:d.label,from,to,type:d.type,value:d.type==='delta'?to-from:to};});
    /* 净变化括号占预留带，与 comparison 括线是同一条带；两者都要时须显式选择，不能叠着画。 */
    const netBracket=Boolean(report)&&s.bracket!=='comparison';
    if(netBracket&&s.comparison)throw new Error('净变化括号与 comparison 括线占用同一条预留带：请显式选择 s.bracket="comparison" 或移除 comparison');
    /* 内核报告的预格式化文本由 present() 产生；渲染器不自己拼这些串，缺了就报错而不是印出 undefined。 */
    if(report&&typeof report.chart.netText!=='string')throw new Error('内核报告缺少 present() 产生的预格式化文本（netText）：请先把报告过一遍 WaterfallBridge.present() 再交给渲染器');
    /* 残差是内核的结论，它必须有自己的颜色；落回默认色等于让读者把"说不清的差额"读成主数据。 */
    if(report&&steps.some(v=>v.type==='residual')&&!c.p.residual)throw new Error('调色板缺少 residual 令牌：残差柱要有自己的颜色，不能与主数据或下降共用');
    const labelSeen=new Map();
    const head=s.comparison||netBracket?90:45;
    const d=domain(steps.flatMap(x=>[x.from,x.to]),s.domain),y=scale(d,c.h-65,head),dx=(c.w-110)/items.length,bw=Math.min(76,dx*.65);if(dx<45)throw new Error('柱过多');
    if(c.h-65-head<70)throw new Error('瀑布绘图区不足');
    const chart=report?report.chart:null;
    /* 对账结论挂在已有的零轴线上做属性，不做成可见文字：−0.0000004 这种串既超宽又没人要读。 */
    /* data-nodes 让 pages.json 声明的节点数有个能对账的现场：声明里的数字要么能核对，要么不该写。
       整串只在声明了内核报告时生成，未声明时仍是空串，老 spec 的输出逐字节不变。 */
    const audit=chart?` data-role="reconciliation" data-residual="${esc(chart.residual===null||chart.residual===undefined?'':chart.residual)}" data-tolerance="${esc(chart.tolerance)}" data-nodes="${chart.bars.length}" data-waterfall-model="${esc(WaterfallBridge.auditModel(chart))}"`:'';
    c.line(60,y(0),c.w-30,y(0),c.p.grid,audit);
    steps.forEach((v,i)=>{const x=65+i*dx;const barTop=y(Math.max(v.from,v.to)),barH=Math.abs(y(v.from)-y(v.to));const seen=(labelSeen.get(v.label)||0)+1;labelSeen.set(v.label,seen);const aw=c.anchor({id:'bar:'+(seen>1?v.label+'#'+seen:v.label),x:x+bw/2,y:barTop+barH/2,side:'top',value:v.value,label:v.label,box:{x,y:barTop,width:bw,height:barH},group:v.type});c.rect(x,barTop,bw,barH,v.type==='residual'?c.p.residual:v.type==='delta'?(v.value>=0?c.p.positive:c.p.negative):c.p.accent,`${aw} data-from="${v.from}" data-to="${v.to}"`);
      if(v.from===v.to)c.line(x,y(v.to),x+bw,y(v.to),c.p.ink);
      /* 负值标签落到柱子下沿之下，不压住浮条；只有声明了内核报告的图才改这一处。 */
      const labelY=report&&v.value<0?y(Math.min(v.from,v.to))+c.fs+8:y(Math.max(v.from,v.to))-8;
      fittedText(c,x+bw/2,labelY,v.text===undefined?formatNumber(v.value,{...s.format,signed:v.type==='delta'}):v.text,dx-6,'middle');
      /* 折行只给内核报告那一支：老 items 路径把标签原样交给 fittedText，多切一个 \n 都是改老稿的输出。 */
      const lines=report?wrapLabel(c,v.label,dx-6):[v.label];
      lines.forEach((line,j)=>fittedText(c,x+bw/2,c.h-30-(lines.length-1-j)*(c.fs+2),line,dx-6,'middle'));
      if(i<steps.length-1)c.line(x+bw,y(v.to),65+(i+1)*dx,y(v.to),c.p.grid,'stroke-dasharray="4 3"');});
    if(netBracket){
      const first=65+bw/2,last=65+(steps.length-1)*dx+bw/2,growth=chart.growthText&&chart.growthText!=='—'?'  /  '+chart.growthText:'';
      fittedText(c,(first+last)/2,24,'净变化 '+chart.netText+growth,2*Math.min((first+last)/2-12,c.w-12-(first+last)/2),'middle',c.p.ink,'font-weight="700" data-role="net-change"');
      c.line(first,40,last,40,c.p.ink);c.line(first,40,first,49,c.p.ink);c.line(last,40,last,49,c.p.ink);
    }
    if(s.comparison)comparisonBracket(c,steps.map((v,i)=>({x:65+i*dx+bw/2,value:v.to})),s.comparison);
    return c.end();
  }
  function dumbbell(s){const c=canvas(s),data=list(s.items,'items');data.forEach(d=>{num(d.start,'start');num(d.end,'end');});const d=domain(data.flatMap(v=>[v.start,v.end]),s.domain),x=scale(d,190,c.w-85),r=rows(c,data.length);
    data.forEach((v,i)=>{const y=r.y0+i*r.dy+r.dy/2;c.text(15,y+5,v.label);c.line(x(v.start),y,x(v.end),y,c.p.grid,'stroke-width="4"');const a0=c.anchor({id:'start:'+v.label,x:x(v.start),y,side:'top',value:v.start,label:v.label+' '+(s.startLabel||'起始'),box:{x:x(v.start)-6,y:y-6,width:12,height:12},group:'start'});const a1=c.anchor({id:'end:'+v.label,x:x(v.end),y,side:'right',value:v.end,label:v.label,box:{x:x(v.end)-7,y:y-7,width:14,height:14},group:'end',fill:c.p.accent});c.circle(x(v.start),y,6,'#FFFFFF',`${a0} stroke="${esc(c.p.muted)}" stroke-width="2" data-role="start"`);c.circle(x(v.end),y,7,c.p.accent,`${a1} data-role="end"`);c.text(x(v.start),y-13,v.start,'middle',c.p.muted);c.text(x(v.end),y+25,v.end,'middle',c.p.accent);});c.circle(190,20,6,'#FFFFFF',`stroke="${esc(c.p.muted)}" stroke-width="2"`);c.text(203,25,s.startLabel||'起始','start',c.p.ink);c.circle(c.w-140,20,7,c.p.accent);c.text(c.w-127,25,s.endLabel||'结束','start',c.p.ink);return c.end();}
  function slope(s){const c=canvas(s),data=list(s.items,'items');data.forEach(d=>{num(d.start,'start');num(d.end,'end');});const d=domain(data.flatMap(v=>[v.start,v.end]),s.domain),y=scale(d,c.h-65,60);c.text(180,25,s.startLabel||'起始','middle');c.text(c.w-180,25,s.endLabel||'结束','middle');data.forEach((v,i)=>{const col=c.p.series[i%c.p.series.length];const a0=c.anchor({id:'start:'+v.label,x:180,y:y(v.start),side:'left',value:v.start,label:v.label+' '+(s.startLabel||'起始'),box:{x:176,y:y(v.start)-4,width:8,height:8},group:'start'});const a1=c.anchor({id:'end:'+v.label,x:c.w-180,y:y(v.end),side:'right',value:v.end,label:v.label,box:{x:c.w-184,y:y(v.end)-4,width:8,height:8},group:'end',fill:col});c.line(180,y(v.start),c.w-180,y(v.end),col,'stroke-width="2"');c.circle(180,y(v.start),4,col,`${a0} data-role="start"`);c.circle(c.w-180,y(v.end),4,col,`${a1} data-role="end"`);c.text(168,y(v.start)+5,v.label+' '+v.start,'end');c.text(c.w-168,y(v.end)+5,v.end);});return c.end();}
  function bullet(s){const c=canvas(s),data=list(s.items,'items'),r=rows(c,data.length);data.forEach((v,i)=>{num(v.value,'value');num(v.target,'target');num(v.max,'max');if(v.max<=0||v.value<0||v.target<0||v.value>v.max||v.target>v.max)throw new Error('bullet 值须位于0至max');const ranges=v.ranges===undefined?[v.max]:v.ranges;list(ranges,'ranges');let prev=0;ranges.forEach(n=>{num(n,'range');if(n<=prev||n>v.max)throw new Error('ranges 须严格递增且不超max');prev=n;});const x=scale([0,v.max],190,c.w-90),y=r.y0+i*r.dy+r.dy/2;c.text(15,y+5,v.label);prev=0;ranges.forEach((n,j)=>{c.rect(x(prev),y-15,x(n)-x(prev),30,(c.p.ranges||[c.p.surface,c.p.grid,c.p.grid])[Math.min(j,2)]);prev=n;});const av=c.anchor({id:'value:'+v.label,x:(x(0)+x(v.value))/2,y,side:'bottom',value:v.value,label:v.label,box:{x:x(0),y:y-6,width:Math.max(x(v.value)-x(0),0),height:12},group:'value',fill:c.p.accent});const at=c.anchor({id:'target:'+v.label,x:x(v.target),y,side:'top',value:v.target,label:v.label+' 目标',box:{x:x(v.target),y:y-21,width:0,height:42},group:'target'});c.rect(x(0),y-6,x(v.value)-x(0),12,c.p.accent,`${av} data-value="${v.value}"`);c.line(x(v.target),y-21,x(v.target),y+21,c.p.ink,`${at} stroke-width="3" data-role="target"`);c.text(c.w-75,y+5,v.value+' / '+v.target);});return c.end();}
  function heatmap(s){const c=canvas(s),rs=list(s.rows,'rows'),cs=list(s.columns,'columns'),vals=list(s.values,'values');if(vals.length!==rs.length||vals.some(r=>!Array.isArray(r)||r.length!==cs.length))throw new Error('矩阵尺寸不一致');vals.flat().forEach(v=>num(v,'cell'));const d=domain(vals.flat(),s.domain),cw=(c.w-200)/cs.length,ch=(c.h-95)/rs.length;if(cw<45||ch<32)throw new Error('热力表过密');cs.forEach((v,j)=>c.text(170+(j+.5)*cw,30,v,'middle'));rs.forEach((v,i)=>{c.text(12,55+(i+.5)*ch+5,v);vals[i].forEach((n,j)=>{const ratio=(n-d[0])/(d[1]-d[0]),a=c.p.sequential?1:.12+.78*ratio;let fill=c.p.accent;if(c.p.sequential){const seq=list(c.p.sequential,'palette.sequential'),pos=ratio*(seq.length-1),lo=Math.floor(pos),hi=Math.min(seq.length-1,lo+1),k=pos-lo;fill='rgb('+rgb(seq[lo]).map((v,i)=>Math.round(v*(1-k)+rgb(seq[hi])[i]*k)).join(',')+')';}const ah=c.anchor({id:'cell:'+v+'|'+cs[j],x:170+(j+.5)*cw,y:55+(i+.5)*ch,side:'right',value:n,label:cs[j],box:{x:170+j*cw,y:55+i*ch,width:cw-3,height:ch-3},group:'row:'+v,fill});c.rect(170+j*cw,55+i*ch,cw-3,ch-3,fill,`${ah} fill-opacity="${a}" data-value="${n}"`);c.text(170+(j+.5)*cw,55+(i+.5)*ch+5,n,'middle',cellText(fill,a,c.p.ink));});});return c.end();}
  // 构成图共用同一份数据契约：列内完整列出系列，面积/高度按原值计算。
  function composition(s, variableWidth) {
    const c=canvas(s),data=list(s.items,'items'),names=[];
    const content=s.labelContent||'value';
    if(!['value','share','both'].includes(content))throw new Error('labelContent 应为 value/share/both');
    if(s.labels!==undefined)throw new Error('构成图不再提供改表开关：段内放不下的标注改用同侧引线通道；需要精确查数时另起一个表格展品');
    data.forEach(v=>{
      if(v.label===undefined||v.label===null||String(v.label).trim()==='')throw new Error('类别标签不能为空');
      const seen=new Set();list(v.segments,'segments').forEach(g=>{
        if(!g.label||seen.has(g.label))throw new Error('系列名称须非空且列内唯一');seen.add(g.label);
        num(g.value,'value');if(g.value<0)throw new Error('构成图不接受负值');if(!names.includes(g.label))names.push(g.label);
      });
    });
    data.forEach(v=>{if(v.segments.length!==names.length)throw new Error('每列须显式列出所有系列；零值填0，未知值不能当作0');});
    const totals=data.map(v=>v.segments.reduce((a,g)=>a+g.value,0));
    totals.forEach(v=>{num(v,'total');if(v<=0)throw new Error('类别总量须大于0');});
    const total=num(totals.reduce((a,b)=>a+b,0),'total'),normalized=variableWidth||s.mode==='percent';
    if(!variableWidth&&!['absolute','percent',undefined].includes(s.mode))throw new Error('stacked mode 应为 absolute/percent');
    const top=s.comparison?92:52,max=normalized?1:Math.max(...totals),ph=c.h-top-72;
    if(variableWidth&&s.comparison)throw new Error('Mekko 比较请用相邻表或份额图，避免给列宽添加含混标注');
    if(ph<90)throw new Error('构成图绘图区仅 '+Math.round(ph)+'px；请提高模块高度、减少系列或拆页');
    const values=(g,i)=>content==='share'?formatNumber(g.value/totals[i]*100,{decimals:s.shareDecimals===undefined?0:s.shareDecimals,suffix:'%'}):formatNumber(g.value,s.format)+(content==='both'?' ('+formatNumber(g.value/totals[i]*100,{decimals:s.shareDecimals===undefined?0:s.shareDecimals,suffix:'%'})+')':'');
    /* 段内放不下名称与数值的段（含零值）与放不下类目名的窄列改走引线通道：通道在绘图区两侧，
       引线就近接回同一侧的图元，不横穿绘图区。面积仍按原值计算，零值只留位置标记，不改成表格。 */
    const pw0=c.w-90-(variableWidth?0:90);
    const widthsFor=pw=>variableWidth?totals.map(t=>pw*t/total):data.map(()=>pw/data.length*.58);
    let needRight=false;
    const scan=pw=>{
      const widths=widthsFor(pw),dx=pw/data.length,items=[];let cum=0;
      data.forEach((v,i)=>{
        const room=(variableWidth?widths[i]:dx)-8,last=i===data.length-1;
        const center=variableWidth?(cum+totals[i]/2)/total:(i+.5)/data.length;
        cum+=totals[i];
        const side=center<.5?'left':'right';
        // 右侧有通道时，最后一列的系列名不能再摆到右留白里，段内要放得下"名称+数值"两行。
        const folded=last&&!variableWidth&&needRight,need=variableWidth||folded?c.fs*2.6:c.fs+8;
        v.segments.forEach(g=>{
          const hh=ph*(normalized?g.value/totals[i]:g.value)/max;
          const wide=variableWidth?(textWidth(g.label,c.fs)>widths[i]-14||textWidth(values(g,i),c.fs)>widths[i]-14):textWidth(folded?g.label+' '+values(g,i):values(g,i),c.fs)>widths[i]-14;
          if(hh<need||wide)items.push({key:'seg:'+i+'|'+g.label,text:g.label+' '+values(g,i),side});
        });
        if(textWidth(v.label,c.fs)>room)items.push({key:'col:'+i,text:v.label,side});
        if(textWidth(formatNumber(totals[i],s.format),c.fs)>widths[i]-4)items.push({key:'total:'+i,text:'合计 '+formatNumber(totals[i],s.format),side});
      });
      return items;
    };
    // 收窄绘图区会带出更多要外置的标注：反复求解到两侧通道宽度稳定，不能只用第一次的结果。
    let pw=pw0,widths=widthsFor(pw0),lane=[],laneW={left:0,right:0};
    for(let pass=0;pass<6;pass++){
      const need=scan(pw);
      if(!need.length){lane=[];break;}
      lane=need;needRight=need.some(v=>v.side==='right');
      const next={left:0,right:0};
      for(const side of ['left','right']){
        const group=need.filter(v=>v.side===side);
        next[side]=group.length?Math.max(...group.map(v=>textWidth(v.text,c.fs)))+26:0;
        if(next[side]>230){const over=group.find(v=>textWidth(v.text,c.fs)+26>230);throw new Error('引线标注「'+over.text+'」超出通道可用宽度；请缩短系列名、类目名或数值格式');}
      }
      const npw=pw0-(next.left?next.left+14:0)-(next.right?next.right+14:0);
      laneW=next;
      if(npw===pw)break;
      pw=npw;widths=widthsFor(pw);
    }
    for(const side of ['left','right'])for(const item of lane.filter(v=>v.side===side))if(textWidth(item.text,c.fs)>laneW[side]-25)throw new Error('引线标注「'+item.text+'」超出通道可用宽度；请缩短系列名、类目名或数值格式');
    if(lane.length&&pw<Math.max(160,pw0*.4))throw new Error('外置标注需要 '+Math.round(laneW.left+laneW.right)+'px 引线通道，剩余绘图区仅 '+Math.round(pw)+'px；请加宽模块、减少系列或拆成两页');
    const left=60+(laneW.left?laneW.left+14:0),dx=pw/data.length,routed=new Set(lane.map(v=>v.key)),sideOf=new Map(lane.map(v=>[v.key,v.side]));
    const plotRight=left+pw;
    let x=left;
    if(normalized){c.text(left-8,top+5,'100%','end',c.p.muted);c.text(left-8,top+ph+5,'0','end',c.p.muted);}
    const points=[],callouts=[];
    data.forEach((v,i)=>{
      const width=widths[i],xx=variableWidth?x:left+i*dx+(dx-width)/2;
      const barH=ph*(normalized?1:totals[i]/max),folded=i===data.length-1&&needRight;let yy=top+ph;
      points.push({x:xx+width/2,value:totals[i]});
      // 同一系列跨列固定堆积顺序和颜色，第一系列从零基线起。
      names.forEach((name,k)=>{
        const g=v.segments.find(g=>g.label===name),hh=ph*(normalized?g.value/totals[i]:g.value)/max;
        yy-=hh;const fill=c.p.series[k%c.p.series.length];
        const as=c.anchor({id:'seg:'+v.label+'|'+name,x:xx+width/2,y:yy+hh/2,side:'right',value:g.value,label:name,box:{x:xx,y:yy,width,height:hh},group:'col:'+v.label,fill});
        c.rect(xx,yy,width,hh,fill,`${as} stroke="white" stroke-width="1" data-value="${g.value}" data-total="${totals[i]}"`);
        if(g.value===0)c.line(xx,yy,xx+Math.max(8,Math.min(width,12)),yy,fill,'stroke-width="2" data-role="zero-mark"');
        const key='seg:'+i+'|'+name;
        if(routed.has(key)){callouts.push({side:sideOf.get(key),y:yy+hh/2,x1:sideOf.get(key)==='right'?xx+width:xx,fill,text:name+' '+values(g,i)});return;}
        const color=cellText(fill,1,c.p.ink);
        if(variableWidth||folded){c.text(xx+width/2,yy+hh/2-3,name,'middle',color);c.text(xx+width/2,yy+hh/2+c.fs+2,values(g,i),'middle',color);}
        else {c.text(xx+width/2,yy+hh/2+c.fs/3,values(g,i),'middle',color);if(i===data.length-1)fittedText(c,xx+width+12,yy+hh/2+c.fs/3,name,c.w-xx-width-20);}
      });
      if(routed.has('col:'+i))callouts.push({side:sideOf.get('col:'+i),y:top+ph-4,x1:xx+width/2,fill:c.p.ink,text:v.label});
      else fittedText(c,xx+width/2,top+ph+24,v.label,variableWidth?Math.max(width-4,15):dx-8,'middle');
      const total=formatNumber(totals[i],s.format);
      if(routed.has('total:'+i))callouts.push({side:sideOf.get('total:'+i),y:top+ph-barH-6,x1:xx+width/2,fill:c.p.ink,text:'合计 '+total});
      else fittedText(c,xx+width/2,top+ph-barH-12,total,width,'middle',c.p.ink,'font-weight="700"');
      if(variableWidth)x+=width;
    });
    c.line(left,top+ph,plotRight,top+ph,c.p.ink);
    for(const side of ['left','right']){
      const group=callouts.filter(v=>v.side===side);
      if(!group.length)continue;
      // 通道在绘图区外侧的留白里，可用高度是全画布，不受绘图区上下界限制。
      const rowH=c.fs+8,laneBottom=c.h-c.fs;
      group.sort((a,b)=>a.y-b.y);
      let cursor=c.fs;
      group.forEach(v=>{v.ly=Math.max(cursor,v.y);if(v.ly>laneBottom)throw new Error(group.length+' 条引线标注超出通道可用高度；请拆页、减少系列或提高模块高度');cursor=v.ly+rowH;});
      group.forEach(v=>{
        c.circle(v.x1,v.y,2.5,v.fill);
        if(side==='left'){
          const edge=left-62;
          c.out.push(`<path d="M ${v.x1} ${v.y} H ${edge-2} V ${v.ly+c.fs*.35} H ${edge-8}" fill="none" stroke="${esc(c.p.muted)}" stroke-width="1" data-role="leader"/>`);
          c.text(edge-8,v.ly+c.fs*.35,v.text,'end',c.p.ink);
        }else{
          const edge=plotRight+14;
          c.out.push(`<path d="M ${v.x1} ${v.y} H ${edge+2} V ${v.ly+c.fs*.35} H ${edge+8}" fill="none" stroke="${esc(c.p.muted)}" stroke-width="1" data-role="leader"/>`);
          c.text(edge+8,v.ly+c.fs*.35,v.text,'start',c.p.ink);
        }
      });
    }
    if(s.comparison)comparisonBracket(c,points,s.comparison);
    return c.end();
  }
  function mekko(s){return composition(s,true);}
  function stacked(s){return composition(s,false);}
  function tree(s){const c=canvas(s);if(!s.root||typeof s.root!=='object')throw new Error('root 必填');const nodes=[],seen=new Set();let leaves=0,maxDepth=0;function visit(n,depth,parent){if(!n||typeof n!=='object'||seen.has(n))throw new Error('树含非法节点或循环');seen.add(n);const v={n,depth,parent};nodes.push(v);maxDepth=Math.max(maxDepth,depth);if(n.children!==undefined&&!Array.isArray(n.children))throw new Error('children 必须为数组');const children=n.children||[];if(children.length){v.children=children.map(ch=>visit(ch,depth+1,v));v.row=v.children.reduce((a,k)=>a+k.row,0)/v.children.length;}else v.row=leaves++;return v;}visit(s.root,0,null);const nw=Math.min(180,(c.w-60)/(maxDepth+1)-35),rh=(c.h-70)/leaves;if(nw<80||rh<42)throw new Error('树过密');const dx=(c.w-60)/(maxDepth+1);nodes.forEach(v=>{v.x=30+v.depth*dx;v.y=35+v.row*rh;});nodes.forEach(v=>{if(v.parent){const a=v.parent,mid=(a.x+nw+v.x)/2;c.out.push(`<path d="M ${a.x+nw} ${a.y+18} H ${mid} V ${v.y+18} H ${v.x}" fill="none" stroke="${esc(c.p.grid)}" stroke-width="2"/>`);}});nodes.forEach(v=>{c.rect(v.x,v.y,nw,36,v.depth===0?c.p.accent:c.p.surface);c.text(v.x+8,v.y+24,v.n.label,'start',v.depth===0?cellText(c.p.accent,1,c.p.ink):c.p.ink);});return c.end();}
  function swimlane(s){const c=canvas(s),lanes=list(s.lanes,'lanes'),stages=list(s.stages,'stages'),items=list(s.items,'items'),cw=(c.w-160)/stages.length,rh=(c.h-70)/lanes.length;if(cw<90||rh<55)throw new Error('泳道过密');const ids=new Map(),occupied=new Set();stages.forEach((v,i)=>c.text(150+(i+.5)*cw,26,v,'middle'));lanes.forEach((v,i)=>{c.text(12,50+(i+.5)*rh,v);c.line(140,40+(i+1)*rh,c.w-10,40+(i+1)*rh);});items.forEach(v=>{if(!Number.isInteger(v.lane)||v.lane<0||v.lane>=lanes.length||!Number.isInteger(v.stage)||v.stage<0||v.stage>=stages.length||!v.id||ids.has(v.id))throw new Error('节点id或行列非法');const cell=v.lane+':'+v.stage;if(occupied.has(cell))throw new Error('同一泳道阶段只能有一个节点；请拆分阶段');occupied.add(cell);ids.set(v.id,{...v,x:150+v.stage*cw+8,y:40+v.lane*rh+(rh-36)/2});});const edges=s.edges||[];if(!Array.isArray(edges))throw new Error('edges 必须是数组');edges.forEach(e=>{const a=ids.get(e.from),b=ids.get(e.to);if(!a||!b)throw new Error('连线引用未知节点');const ax=a.x+cw-26,ay=a.y+18,bx=b.x,by=b.y+18,mid=(ax+bx)/2;c.out.push(`<path d="M ${ax} ${ay} H ${mid} V ${by} H ${bx}" fill="none" stroke="${esc(c.p.muted)}" stroke-width="2"/>`);c.out.push(`<path d="M ${bx-6} ${by-4} L ${bx} ${by} L ${bx-6} ${by+4}" fill="none" stroke="${esc(c.p.muted)}"/>`);});ids.forEach(v=>{c.rect(v.x,v.y,cw-26,36,c.p.selected,`data-id="${esc(v.id)}"`);c.text(v.x+7,v.y+24,v.label);});return c.end();}
  function comparisonTable(s) {
    const columns=list(s.columns,'columns'),data=list(s.rows,'rows'),p=Object.assign({},p0,s.palette||{}),keys=new Set();
    columns.forEach(col=>{
      if(!col.key||keys.has(col.key)||!col.label)throw new Error('表格列需唯一key与label');keys.add(col.key);
      if(!['text','number',undefined].includes(col.type))throw new Error('表格type 应为 text/number');
      if(col.bar){
        if(!Array.isArray(col.bar.domain)||col.bar.domain.length!==2||col.bar.domain[0]>=col.bar.domain[1])throw new Error('数据条需显式非零范围domain');domain([0],col.bar.domain);
        if(![undefined,'value','delta'].includes(col.bar.role))throw new Error('数据条role 应为value/delta');
      }
      if((col.bar||col.derive)&&col.type!=='number')throw new Error('数据条和计算列须为number');
    });
    const cell=(row,col)=>{
      let value=row.values[col.key],display;
      if(col.derive){
        const a=row.values[col.derive.from],b=row.values[col.derive.to];
        if(a==null||b==null)value=null;
        else {const d=difference(a,b,{...col.derive,...col.format});value=d.value;display=d.label;}
      }
      if(value==null)return '<td'+(col.type==='number'?' class="num"':'')+'><span aria-label="缺失">—</span></td>';
      if(col.type!=='number')return '<td>'+esc(value)+'</td>';
      num(value,'table cell');display=display===undefined?formatNumber(value,col.format):display;
      let bar='';
      if(col.bar){
        const d=domain([0,value],col.bar.domain),x=scale(d,1,159),a=x(0),b=x(value);
        const role=col.bar.role||(col.derive?'delta':'value'),fill=role==='delta'?(value<0?p.negative:p.positive):p.accent;
        bar=`<svg class="table-bar" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 14" preserveAspectRatio="none" aria-hidden="true"><line x1="1" y1="7" x2="159" y2="7" stroke="${esc(p.grid)}"/><rect x="${Math.min(a,b)}" y="3" width="${Math.abs(b-a)}" height="8" fill="${esc(fill)}" data-value="${value}"/><line x1="${a}" y1="1" x2="${a}" y2="14" stroke="${esc(p.ink)}"/></svg>`;
      }
      return '<td class="num">'+esc(display)+bar+'</td>';
    };
    return `<table class="data-table analytical-table">${s.title?'<caption>'+esc(s.title)+'</caption>':''}<thead><tr>${columns.map(col=>'<th scope="col"'+(col.type==='number'?' class="num"':'')+'>'+esc(col.label)+(col.unit?'<span class="column-unit">'+esc(col.unit)+'</span>':'')+(col.bar?'<span class="column-unit">量尺 '+esc(formatNumber(col.bar.domain[0]))+' 至 '+esc(formatNumber(col.bar.domain[1]))+'</span>':'')+'</th>').join('')}</tr></thead><tbody>${data.map(row=>{
      if(row.kind==='group'){if(!row.label)throw new Error('分组需label');return '<tr class="group"><th colspan="'+columns.length+'" scope="rowgroup">'+esc(row.label)+'</th></tr>';}
      if(![undefined,'data','total'].includes(row.kind)||!row.values)throw new Error('表格行需values，kind 应为data/total/group');
      return '<tr'+(row.kind==='total'?' class="total"':row.selected?' class="selected"':'')+'>'+columns.map(col=>cell(row,col)).join('')+'</tr>';
    }).join('')}</tbody></table>`;
  }
  /* 单期横向构成条：一个整体切成几块，回答"这份钱/量去了哪几块"。
     与 kit.stacked 的分工——那道是纵向多列、比列与列之间的构成差异；
     这道是横向单条，段内直接标注，放不下的段走条上方的引线通道。
     正因为段内能直接标，它不需要图例：图例占的那一行在窄模块里就是纯损失。 */
  function shareBar(s) {
    const c = canvas(s), data = list(s.items, 'items');
    if (data.length > 2) throw new Error('横向构成条一次最多 2 条；三期以上请改用 kit.stacked 逐列比较');
    if (s.mode !== undefined) throw new Error('构成条只做 100% 构成；要按绝对值跨期比较请用 kit.stacked');
    if (s.labels !== undefined) throw new Error('构成条不提供改表开关：段内放不下的标注改走条上方引线通道');
    const content = s.labelContent || 'share';
    if (!['share','value','both'].includes(content)) throw new Error('labelContent 应为 share/value/both');
    const names = [];
    data.forEach((v, i) => {
      /* 单条时类别标签必是模块标题的复述，省略；两条以上不写就分不清哪条是哪条。 */
      const labelNeeded = data.length > 1;
      if (labelNeeded && (v.label === undefined || String(v.label).trim() === '')) throw new Error('两条以上时每条都要有类别标签，否则分不清哪条是哪条');
      const segs = list(v.segments, 'items[' + i + '].segments');
      if (segs.length < 2) throw new Error('构成条至少两段；只有一段时请用 KPI 或单个数字');
      const seen = new Set();
      segs.forEach(g => {
        if (!g.label || !String(g.label).trim()) throw new Error('系列名称不能为空');
        if (seen.has(g.label)) throw new Error('系列名称须列内唯一：' + g.label);
        seen.add(g.label); num(g.value, 'segments.value');
        if (g.value < 0) throw new Error('构成条不接受负值；缺失不等于零，请单独编码');
        if (!names.includes(g.label)) names.push(g.label);
      });
      if (segs.length !== names.length) throw new Error('每条须显式列出全部系列；零值填 0，未知值不能当作 0');
    });
    if (names.length > 6) throw new Error('系列 ≤ 6；更多请把次要项并为"其他"或改用表格');
    const totals = data.map(v => v.segments.reduce((a, g) => a + g.value, 0));
    totals.forEach((v, i) => { if (!(v > 0)) throw new Error('items[' + i + '] 总量须大于 0，构成比才有定义'); });
    const shareOf = (g, i) => g.value / totals[i];
    const shareText = (g, i) => formatNumber(shareOf(g, i) * 100, { decimals: s.shareDecimals === undefined ? 1 : s.shareDecimals, suffix: '%' });
    const textOf = (g, i) => content === 'value' ? formatNumber(g.value, s.format) : content === 'both' ? formatNumber(g.value, s.format) + ' · ' + shareText(g, i) : shareText(g, i);
    const colorOf = j => c.p.series[j % c.p.series.length];

    const PAD = 10, capH = c.fs * 1.5, rowH = c.fs * 1.45, gapToBar = 6;
    const bandGap = c.fs * 1.4;
    /* 条的厚度不承载信息（段宽才是份额），所以按容器宽度定，不按可用高度反推：
       反推出来是一块填满格子的实心方块，会和相邻的柱状图抢重量。 */
    const barH = Math.min(Math.max(34, (c.w - PAD * 2) / 5), 84);
    const bandH = (c.h - PAD * 2 - bandGap * (data.length - 1)) / data.length;
    if (bandH - barH < gapToBar) throw new Error('构成条高度不足：' + data.length + ' 条至少需要 ' + Math.ceil((barH + gapToBar) * data.length + bandGap * (data.length - 1) + PAD * 2) + 'px，当前仅 ' + Math.round(c.h) + 'px；请减少条数或改用 kit.stacked');
    /* 段内两行（名称在上、数值在下）的高度门槛：条太薄时一律改走引线通道，不让字压出条外。 */
    const twoLineH = capH + rowH;
    const bands = data.map((v, i) => {
      const usable = c.w - PAD * 2;
      const segs = v.segments;
      const widths = segs.map(g => shareOf(g, i) * usable);
      const centers = widths.map((w, j) => PAD + widths.slice(0, j).reduce((a, x) => a + x, 0) + w / 2);
      const inside = segs.map((g, j) => barH >= twoLineH + 6 && Math.max(textWidth(g.label, c.fs), textWidth(textOf(g, i), c.fs)) + 16 <= widths[j]);
      const leader = inside.map(ok => !ok);
      /* 引线标注本来贴在段中心，靠边时回拉到画布内——回拉后的位置才是它真正占的横向区间。 */
      const labelText = segs.map(g => g.label + ' ' + textOf(g, i));
      const halfOf = j => textWidth(labelText[j], c.fs) / 2;
      const labelX = centers.map((cx, j) => Math.max(PAD + halfOf(j), Math.min(c.w - PAD - halfOf(j), cx)));
      /* 同一通道行里相邻两条标注的实际区间不能相交。分行按真实字宽判断，不能用固定像素差：
         标签长短随内容变，定长阈值早晚会让长标签直接压字。 */
      const rows = [], rowRight = [];
      segs.forEach((g, j) => {
        if (!leader[j]) return;
        let r = 0;
        while (rowRight[r] !== undefined && labelX[j] - halfOf(j) < rowRight[r] + 10) r++;
        rowRight[r] = labelX[j] + halfOf(j);
        rows[j] = r;
      });
      return { v, i, usable, widths, centers, inside, leader, labelText, labelX, rows, leaderRows: rowRight.length };
    });
    let y = PAD;
    bands.forEach(band => {
      const { v, i, usable, widths, centers, inside, leader, labelText, labelX, rows, leaderRows } = band;
      const hasCap = v.label !== undefined && String(v.label).trim() !== '';
      const blockH = (hasCap ? capH : 0) + leaderRows * rowH + (leaderRows ? gapToBar : 0) + barH;
      if (blockH > bandH + 0.5) throw new Error('构成条第 ' + (i + 1) + ' 条的标注通道放不下：需要 ' + Math.ceil(blockH) + 'px，仅 ' + Math.floor(bandH) + 'px；请把这一格加高、减少系列，或改用 kit.stacked');
      const bandTop = y + (bandH - blockH) / 2;
      const capY = bandTop + c.fs * 1.1;
      if (hasCap) c.text(PAD, capY, v.label, 'start', c.p.ink, 'font-weight="600"');
      const barTop = bandTop + (hasCap ? capH : 0) + leaderRows * rowH + (leaderRows ? gapToBar : 0);
      let x = PAD;
      v.segments.forEach((g, j) => {
        const w = widths[j], j0 = x; let aw = '';
        c.rect(j0, barTop, w, barH, colorOf(j), (leader[j] ? '' : `${aw} `) + `data-value="${g.value}"`);
        if (!leader[j]) aw = c.anchor({ id: 'seg:' + v.label + '|' + g.label, x: centers[j], y: barTop + barH / 2, side: 'right', value: g.value, label: g.label, box: { x: j0, y: barTop, width: w, height: barH }, group: 'seg:' + v.label, fill: colorOf(j) });
        x += w;
      });
      // 段内两行：名称在上、数值在下；对比色按各自填充色算，不写死。
      v.segments.forEach((g, j) => {
        if (!inside[j]) return;
        const fg = cellText(colorOf(j), 1, c.p.ink);
        c.text(centers[j], barTop + barH / 2 - c.fs * 0.12, g.label, 'middle', fg);
        c.text(centers[j], barTop + barH / 2 + c.fs * 1.28, textOf(g, i), 'middle', fg, 'font-weight="600"');
      });
      // 段外引线：从条上方引到该段中心，标注落在通道行里，不横穿其他段。
      v.segments.forEach((g, j) => {
        if (!leader[j]) return;
        const ty = bandTop + (hasCap ? capH : 0) + rows[j] * rowH + c.fs * 0.9;
        c.line(centers[j], ty + 4, centers[j], barTop - 3, c.p.grid);
        c.text(labelX[j], ty, labelText[j], 'middle', c.p.muted);
      });
      y = bandTop + blockH + bandGap;
    });
    return c.end();
  }

  function wrappedText(c,x,y,value,width,maxLines=3,color=c.p.ink) {
    if(value===undefined||value===null||String(value).trim()==='')throw new Error('流程文字不能为空');
    const lines=[];let line='';
    for(const ch of String(value)){if(ch==='\n'||textWidth(line+ch,c.fs)>width){lines.push(line);line=ch==='\n'?'':ch;}else line+=ch;}
    if(line)lines.push(line);if(lines.length>maxLines)throw new Error('流程文字过长，请拆分或扩容：'+value);
    lines.forEach((t,i)=>c.text(x,y+i*(c.fs+7),t,'start',color));
  }
  // 选型与渲染共用最低尺寸；只证明几何可行，不承诺长标签一定放得下。
  const FLOW = {left:90,right:20,gap:48,column:140,header:120,row:68,rows:3};
  function minimumSize(kind, sizing={}) {
    if(kind!=='processFlow')return null;
    const stages=sizing.stages===undefined?2:sizing.stages;
    if(!Number.isInteger(stages)||stages<2)throw new Error('processFlow sizing.stages 须为至少2的整数');
    return {width:FLOW.left+FLOW.right+FLOW.gap*(stages-1)+FLOW.column*stages,height:FLOW.header+FLOW.rows*FLOW.row};
  }
  function processFlow(s) {
    const c=canvas(s),stages=list(s.stages,'stages'),transitions=list(s.transitions,'transitions');
    if(stages.length<2||transitions.length!==stages.length-1)throw new Error('线性流程需至少2阶段和逐段转换条件');
    const min=minimumSize('processFlow',{stages:stages.length});
    if(c.w<min.width||c.h<min.height)throw new Error('流程画布不足：至少 '+min.width+'×'+min.height+'px，当前 '+c.w+'×'+c.h+'px；请换布局或拆页');
    const left=FLOW.left,gap=FLOW.gap,cw=(c.w-left-FLOW.right-gap*(stages.length-1))/stages.length;
    const rh=(c.h-FLOW.header)/FLOW.rows;
    const fields=[['owner','责任'],['output','交付'],['gate','放行条件']];
    fields.forEach(([key,label],r)=>{const yy=110+r*rh;c.text(8,yy,label,'start',c.p.muted);c.line(left,yy-24,c.w-20,yy-24,c.p.grid);});
    stages.forEach((v,i)=>{
      const x=left+i*(cw+gap);c.line(x,29,x+cw,29,c.p.ink,'stroke-width="2"');
      wrappedText(c,x,55,v.label,cw,1,c.p.ink);
      fields.forEach(([key],r)=>wrappedText(c,x,110+r*rh,v[key],cw,Math.floor((rh-14)/(c.fs+7))));
      if(i<stages.length-1){const ax=x+cw+7,bx=ax+gap-14;c.line(ax,51,bx,51,c.p.muted);c.out.push(`<path d="M ${bx-5} 47 L ${bx} 51 L ${bx-5} 55" fill="none" stroke="${esc(c.p.muted)}"/>`);fittedText(c,(ax+bx)/2,76,transitions[i],gap-2,'middle',c.p.muted);}
    });
    return c.end();
  }
  return {shareBar,waterfall,dumbbell,slope,bullet,heatmap,mekko,tree,swimlane,stacked,comparisonTable,processFlow,minimumSize,formatNumber,difference};
});
