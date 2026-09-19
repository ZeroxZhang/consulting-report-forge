/* 共用画布/主题契约的静态SVG渲染；输出作者指定的表达，文字验收不通过就直接失败。
   配方产物带统一锚点契约，可像 kit 形式一样声明 annotations 走通用标注层。 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),runtime=require('../assets/chart-runtime.js'),themes=require('../assets/deck-themes.js');
const pinned=require('../package.json').dependencies.echarts;
const type=require('../assets/deck-typography.js'),metrics=require('./font_metrics.cjs');
const Anchors=require('../assets/echarts-anchors.js'),AnnotationLayer=require('../assets/annotation-layer.js');

/* 锚点框要的是"图元画出来的几何"，不含描边——这正是浏览器 getBBox() 给的东西。
   而 zrender 的 getBoundingRect() 对带描边的图元返回的是外扩过的框（Path.js:185 起：有填充按 lineWidth 外扩半宽，
   无填充再按 strokeContainThreshold 放大）。同一个调用里它把纯几何框留在 _rect 上，取那个就是同一个框。
   拿不到就报错：宁可不出图，也不发一个比真实几何大出描边的锚点框（下游避让会跟着偏）。 */
function geometryRect(el){
  const stroked=el.getBoundingRect();
  const base=el._rect;
  if(!base||![base.x,base.y,base.width,base.height].every(Number.isFinite))throw Error('取不到图元「'+el.type+'」的纯几何矩形，锚点框无法保证不含描边');
  return base.clone();
}

/* 展示表里带元数据的图元，按显示顺序；矩形取根坐标（局部矩形乘累计变换，否则拿到的是自己的坐标系）。 */
function displayEntries(chart,zr){
  const entries=[];
  for(const el of chart.getZr().storage.getDisplayList(true)){
    const meta=zr.getElementSSRData(el);
    if(!meta)continue;
    const named={};meta.each((value,key)=>{named[key]=value;});
    const rect=geometryRect(el),transform=el.getComputedTransform?el.getComputedTransform():el.transform;
    if(transform)rect.applyTransform(transform);
    entries.push({seriesIndex:named.series_index,dataIndex:named.data_index,ssrType:named.ssr_type,type:el.type,rect:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}});
  }
  return entries;
}
function readAttrs(source){const out={};for(const pair of source.matchAll(/([a-zA-Z_-]+)="([^"]*)"/g))out[pair[1]]=pair[2];return out;}

/* zrender 的标识前缀是进程内的实例序号：zr0-c0（裁剪）、zr0-g1（渐变）、zr0-cls-1（样式类）。
   跨进程各渲染一张，两张图都会拿到同一个 zr0，而 <style>、clipPath、渐变在一篇文档里是全局生效的——
   同页两张配方图会互相覆盖 hover 配色，url(#zr0-c0) 还会解析到先出现的那个，让 B 图用上 A 图的裁剪区。
   换成按内容算的前缀：同一张图稳定可复现，不同图不会撞。 */
function namespaceIds(svg,seed){
  const tag='zr'+crypto.createHash('sha1').update(seed).digest('hex').slice(0,8);
  // 类序号同样是进程内的累计值（同一张图在暖进程里会从 cls-3 起），按首次出现重新编号，
  // 让同样的输入出同样的字节：产物可复现，成稿哈希也才可比对。
  const classes=new Map();
  return svg.replace(/\bzr\d+-(cls-\d+|c\d+|g\d+)\b/g,(whole,name)=>{
    if(!name.startsWith('cls-'))return tag+'-'+name;
    if(!classes.has(name))classes.set(name,tag+'-cls-'+classes.size);
    return classes.get(name);
  });
}

/* 锚点按位置注进对应图元：SVG 标签顺序与展示表顺序实测一致，但一致本身逐项断言——
   对不上宁可不出图，也不发一个挂错对象的锚点（挂错了没有任何下游检查能发现）。 */
function injectAnchors(svg,entries,byIndex){
  let seen=0;
  const out=svg.replace(/<([a-zA-Z][\w:-]*)([^>]*\becmeta_data_index="[^"]*"[^>]*)>/g,(whole,tag,attrs)=>{
    const index=seen++,entry=entries[index];
    if(!entry)throw Error('锚点对齐失败：SVG 带标记图元多于展示表');
    const named=readAttrs(attrs);
    if(named.ecmeta_ssr_type!==entry.ssrType||Number(named.ecmeta_series_index)!==entry.seriesIndex||Number(named.ecmeta_data_index)!==entry.dataIndex)throw Error('锚点对齐失败：第 '+index+' 个图元的标记与展示表不一致');
    const made=byIndex.get(index);
    return made?`<${tag}${attrs} ${AnnotationLayer.anchorAttrs(made.anchor)}>`:whole;
  });
  if(seen!==entries.length)throw Error('锚点对齐失败：SVG 带标记图元 '+seen+' 个，展示表 '+entries.length+' 个');
  return out;
}

/* 图元没画出来时锚点会一个都不剩，旁解读整条落空。这时要说清是哪张图、哪根杠杆，
   而不是把作者打发去改版式——版式再改也变不出一个可锚的图元。 */
function noAnchorHint(recipe){
  if(recipe==='timeSeries')return '折线在期间数超过 8 时默认不画数据点，没有点就没有可标注的图元；给 spec 加 showSymbol:true 把点画出来，或缩短期间数，或把这段解读移到页面层';
  return '这张图在当前设置下没有画出可标注的图元；先看配方有没有控制图元显隐的选项，或把这段解读移到页面层';
}

/* 标注场景：图元登记成障碍，图上已有的文字登记成静态标签（不带 kind，否则会被 audit 当成标注统计）。
   图元坐标即最终坐标，不做扩容重排——ECharts 按画布自己排版，放大等于交付一张作者没指定过的图。
   满版图（桑基、树、热力没有页边距）靠 padding 让出四周空白，否则旁解读无处可放。 */
function annotateLayer(chart,payload,settings,profile,list,report,padding,outer){
  const tokens=settings.tokens,base=metrics.measurer(profile.id);
  const scene=AnnotationLayer.createScene({
    width:outer.width,height:outer.height,fontSize:settings.fontSize,
    measure:(text,options)=>base(text,(options.weight||400)+' '+(options.size||14)+'px '+profile.body),
    canvas:{x:4,y:4,width:outer.width-8,height:outer.height-8},
    plot:payload.plot||null
  });
  for(const made of list){
    AnnotationLayer.addAnchor(scene,made.anchor);
    AnnotationLayer.addObstacle(scene,{id:made.anchor.id,box:made.anchor.box});
  }
  (report.boxes||[]).forEach((box,index)=>AnnotationLayer.addLabel(scene,{id:'plain-'+index,box:{x:box.x+padding,y:box.y+padding,width:box.w,height:box.h},text:box.text,role:'text'}));
  const options=Object.assign({format:payload.format||{}},payload.annotationOptions||{});
  let result;
  try{result=AnnotationLayer.annotate(scene,payload.annotations,options);}
  catch(error){
    // 锚点压根不存在（图元没画出来、或 id 写错）不是"放不下"：套上版式建议只会把人引到错的方向。
    if(/未知标注锚点/.test(error.message)){
      const known=list.map(made=>made.anchor.id);
      throw Error(error.message+'——'+(known.length?'本图可用的锚点：'+known.join('、'):noAnchorHint(payload.recipe)));
    }
    // 放不下是页面层的事：这条链路只报清楚卡在哪，不替作者删标注、也不偷偷换掉他指定的图。
    throw Error(error.message+'——旁解读放不下要改的是页面：图宽高、side、文案长度或整页版式，不是丢掉这条标注。');
  }
  const leaders=AnnotationLayer.serialize(scene,result.items,Object.assign({color:tokens.ink,leaderColor:tokens['gray-2']},payload.serializeOptions||{}));
  return {items:result.items,leaders,scene};
}

function render(payload){
  const echarts=require(process.env.ECHARTS_MODULE||'echarts');
  if(echarts.version!==pinned)throw Error('需要固定ECharts '+pinned+'，当前 '+echarts.version);
  const profile=type.get(payload.typography_id),measurement=metrics.install(echarts,profile.id);
  const settings={width:payload.width??960,height:payload.height??500,fontSize:payload.fontSize??14,tokens:themes.get(payload.theme_id).tokens,typography_id:profile.id};
  let plan;
  if(payload.recipe)plan=runtime.prepare(payload.recipe,payload.spec||{},settings);
  else if(payload.option&&typeof payload.option==='object'){
    if(!Number.isFinite(settings.width)||!Number.isFinite(settings.height)||settings.width<320||settings.height<200)throw Error('画布至少320×200');
    plan={recipe:null,width:settings.width,height:settings.height,fontSize:settings.fontSize,risks:[],axes:[],pages:[{kind:'chart',option:runtime.options(payload.option,settings.tokens,settings.fontSize,profile.id)}]};
  }else throw Error('输入需包含recipe+spec或原生option');
  const chart=echarts.init(null,null,{renderer:'svg',ssr:true,width:settings.width,height:settings.height});
  try{
    chart.setOption(plan.pages[0].option);
    const report=runtime.check(chart,plan);
    // 实测越界、遮挡、字号不足会阻止输出；配方层不会改写成别的表达来绕过。
    if(report.status!=='ok')throw Error('文字验收未通过：'+report.problems.slice(0,6).map(p=>p.type+'「'+p.text+'」'+(p.other?'↔「'+p.other+'」':'')+' → '+p.fix).join('；'));
    const padding=Number.isFinite(payload.padding)&&payload.padding>0?Math.round(payload.padding):0;
    const outer={width:settings.width+padding*2,height:settings.height+padding*2};
    const entries=displayEntries(chart,echarts.zrender);
    // 没有配方的原生 option 没有锚点适配；此时不发锚点，也不允许声明 annotations。
    let list=[],anchorIssues=[];
    if(plan.recipe){const found=Anchors.anchors({recipe:plan.recipe,option:plan.pages[0].option,entries,resolve:chartResolver(chart)});list=found.anchors;anchorIssues=found.issues;}
    else if(Array.isArray(payload.annotations)&&payload.annotations.length)throw Error('原生 option 没有锚点适配，不能声明 annotations；需要旁解读请用配方或自绘 SVG');
    if(anchorIssues.length)throw Error('锚点生成失败：'+anchorIssues.map(i=>i.reason+'（'+i.message+'）').join('；'));
    // 锚点一律用最终坐标：留白时加上偏移，序列化出的引线与文字画在同一层，下游不再二次换算。
    if(padding)for(const made of list){const a=made.anchor;a.x+=padding;a.y+=padding;a.box={x:a.box.x+padding,y:a.box.y+padding,width:a.box.width,height:a.box.height};}
    const byIndex=new Map(list.map(made=>[made.index,made]));
    const chartSvg=injectAnchors(chart.renderToSVGString(),entries,byIndex);
    let annotations=null,leaders='';
    if(Array.isArray(payload.annotations)&&payload.annotations.length){
      const drawn=annotateLayer(chart,payload,settings,profile,list,report,padding,outer);
      annotations=drawn.items.length;leaders=drawn.leaders;
    }
    const head=`<svg data-typography="${profile.id}" data-requested-size="${settings.width}×${settings.height}" data-actual-size="${outer.width}×${outer.height}" style="font-synthesis:none;text-rendering:geometricPrecision;font-variant-numeric:lining-nums tabular-nums" `;
    let svg;
    if(padding){
      // 满版图四周让出空白：图整体挪进内嵌坐标系，让出的空白就是旁解读的落点。
      const inner=chartSvg.replace(/^\s*<svg\b[^>]*>/,'').replace(/<\/svg>\s*$/,'');
      svg=`${head}width="${outer.width}" height="${outer.height}" viewBox="0 0 ${outer.width} ${outer.height}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect width="${outer.width}" height="${outer.height}" fill="${settings.tokens['page-bg']}"/><g transform="translate(${padding},${padding})">${inner}</g>${leaders}</svg>`;
    }else svg=chartSvg.replace('<svg ',head).replace(/<\/svg>\s*$/,(leaders||'')+'</svg>');
    svg=namespaceIds(svg,(plan.recipe||'option')+'|'+settings.width+'x'+settings.height+'|'+JSON.stringify(plan.pages[0].option));
    if(/(?:translate|matrix|[MLCQ])[^<>]*\b(?:NaN|Infinity)\b/.test(svg))throw Error('SVG出现非有限坐标');
    return {...plan,padding,typography_id:profile.id,typography_version:profile.version,measurement,font_delivery:'requires-embedding-in-host',report,anchors:list.map(made=>made.anchor),annotations,pages:plan.pages.map(page=>({...page,svg}))};
  }finally{chart.dispose();}
}
/* 类别名一律走 ECharts 数据模型：rankedBar 会先排序、树的 dataIndex 从 1 起，从 spec 反推这两处都会错。 */
function chartResolver(chart){
  return (seriesIndex,dataIndex)=>{
    const out={};
    try{
      const model=chart.getModel().getSeriesByIndex(seriesIndex),data=model.getData();
      out.name=data.getName(dataIndex);
      const value=data.get('value',dataIndex);
      if(Number.isFinite(value))out.value=value;
    }catch(error){void error;}
    return out;
  };
}
if(require.main===module){
  try{
    const [input,output]=process.argv.slice(2);
    if(!input||!output)throw Error('用法: node scripts/render_echarts_svg.cjs input.json output.svg');
    const plan=render(JSON.parse(fs.readFileSync(path.resolve(input),'utf8'))),out=path.resolve(output);
    if(fs.existsSync(out))throw Error('输出已存在，请使用新路径：'+out);
    fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,plan.pages[0].svg);
    console.log(JSON.stringify({files:[out],recipe:plan.recipe,anchors:plan.anchors.length,risks:plan.risks}));
  }catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={render};
