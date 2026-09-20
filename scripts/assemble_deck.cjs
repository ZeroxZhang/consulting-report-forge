/* 自由正文片段接回现有引擎；只负责装配，不替作者选型或判定视觉质量。 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process'),{pathToFileURL}=require('node:url');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function playwright(){try{return require('playwright');}catch{const name=process.env.PLAYWRIGHT_MODULE||process.env.PLAYWRIGHT_PATH;if(!name)throw Error('装配需要与QA相同的Playwright/Chrome；设置PLAYWRIGHT_MODULE或安装已有运行依赖');return require(name);}}
// 仅核必须显式闭合的section与文档边界；实际HTML/SVG结构由Chromium解析。
function sectionContract(source){
 let i=0,depth=0,count=0;while(i<source.length){const start=source.indexOf('<',i);if(start<0)break;i=start;
  if(source.startsWith('<!--',i)){const end=source.indexOf('-->',i+4);if(end<0)throw Error('片段含未闭合注释');i=end+3;continue;}
  if(!/^<(?:!doctype\b|\/?[a-z])/i.test(source.slice(i))){i++;continue;}
  let j=i+1,quote='';for(;j<source.length;j++){const c=source[j];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;}if(j===source.length)throw Error('片段含未闭合标签');
  const token=source.slice(i,j+1),m=token.match(/^<\s*(\/?)\s*([a-z][\w:-]*)\b/i);i=j+1;
  if(/^<!doctype\b/i.test(token)||m&&['html','head','body'].includes(m[2].toLowerCase()))throw Error('输入须为.slide section片段，不接受完整HTML文档');
  if(!m)continue;const name=m[2].toLowerCase(),close=!!m[1];
  if(name==='section'){if(!close){depth++;count++;}else if(--depth<0)throw Error('section闭合顺序错误');}
  if(!close&&['style','script','textarea','title'].includes(name)){const closeAt=source.toLowerCase().indexOf('</'+name,i);if(closeAt<0)throw Error(name+'未闭合');i=closeAt;}
 }if(depth||!count)throw Error('需要至少一个完整闭合的.slide section');
}
async function assemble(options={}){
 let {pagesFile,outputFile,cssFile,title='报告',contractFile}=options;
 if(!pagesFile||!outputFile)throw Error('需要pagesFile与outputFile');
 // 逐页迭代只装到当前页：整册页数必须与 pages 合同逐页对上，收窄必须两边同时做，否则装不出来。
 const upto=options.upto===undefined?0:Number(options.upto);
 if(options.upto!==undefined&&(!Number.isInteger(upto)||upto<1))throw Error('--upto 需要正整数页码：它表示只装前 N 页正文');
 const contractApi=require('./report_contract.cjs');
 const sourceMode=/class=["'][^"']*\breading\b/.test(fs.readFileSync(pagesFile,'utf8'))?'reading':'presentation';
 const defaults={mode:sourceMode,kind:options.kind||'fragment',theme:options.theme||'mckinsey',typography:options.typography||(sourceMode==='reading'?'serif-report-bold':'sans-presentation'),ratio:options.ratio||'16x9'};
 const task=contractFile?contractApi.load(contractFile,outputFile,defaults):contractApi.normalize({},defaults);
 for(const key of ['kind','theme','typography','ratio'])if(options[key]!==undefined&&options[key]!==task[key])throw Error('命令参数与任务合同冲突：'+key);
 const {kind,theme,typography,ratio}=task;
 const input=path.resolve(pagesFile),output=path.resolve(outputFile),cssPath=cssFile?path.resolve(cssFile):null;
 if([input,cssPath,path.resolve(__dirname,'../assets/deck_engine.html')].includes(output))throw Error('输出不能覆盖正文、CSS或源引擎');
 if(!['fragment','report','collection'].includes(kind))throw Error('kind须为fragment/report/collection');
 if(!['16x9','4x3'].includes(ratio))throw Error('ratio须为16x9/4x3');
 require('../assets/deck-themes.js').get(theme);const profile=require('../assets/deck-typography.js').get(typography);
 if(!profile.faces.length)throw Error('静态自包含路线需要嵌入字体，不能使用legacy-system');
 const pages=fs.readFileSync(input,'utf8'),css=cssPath?fs.readFileSync(cssPath,'utf8'):'';sectionContract(pages);
 if(/<\/style\b/i.test(css))throw Error('CSS文件不能含HTML闭合标签');
 const engine=fs.readFileSync(path.resolve(__dirname,'../assets/deck_engine.html'),'utf8'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'deck-assemble-'));
 let browser;
 try{
  browser=await playwright().chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true});
  const page=await browser.newPage(),issues=[];page.on('pageerror',e=>issues.push(e.message));
  await page.route('**/*',route=>route.abort());
  const assembled=await page.evaluate(({engine,pages,css,title,kind,ratio,mode,explicitContract,upto})=>{
   const doc=new DOMParser().parseFromString(engine,'text/html'),stage=doc.querySelector('#stage');
   if(!stage||doc.querySelectorAll('#stage').length!==1||stage.parentElement.id!=='viewport'||![...doc.querySelectorAll('.slide')].every(s=>stage.contains(s)))throw Error('引擎#stage结构已变化，需更新装配适配器');
   const template=document.createElement('template');template.innerHTML=pages;
   const authorCSS=[];for(const node of [...template.content.childNodes]){
    if(node.nodeType===Node.COMMENT_NODE||node.nodeType===Node.TEXT_NODE&&!node.textContent.trim()){node.remove();continue;}
    if(node.nodeType===Node.ELEMENT_NODE&&node.tagName==='STYLE'){authorCSS.push(node.textContent);node.remove();continue;}
    if(node.nodeType!==Node.ELEMENT_NODE||node.tagName!=='SECTION'||!node.classList.contains('slide'))throw Error('顶层仅允许完整section.slide、style与空白/注释');
   }
   const all=[...template.content.children];if(!all.length||template.content.querySelectorAll('.slide').length!==all.length)throw Error('每页必须是独立的顶层section.slide，不能嵌套slide');
   const BOOKENDS=['cover','references','back-cover','divider'];
   // 制作期只看前 N 页：首尾页留着（它们是整册骨架），正文只留前 N 页，其余从片段里摘掉。
   // 切在这里而不是切文件：上面已经用真解析器验过结构，再拿正则去截字符串只会引入第二套语法。
   if(upto){let content=0;for(const slide of all){if(BOOKENDS.includes(slide.dataset.pageRole))continue;if(content++<upto)continue;slide.remove();}
    if(!template.content.children.length)throw Error('--upto '+upto+' 收窄后没有剩余页面');}
   const slides=[...template.content.children];
   const reserved=new Set([...doc.querySelectorAll('[id]')].filter(e=>!stage.contains(e)).map(e=>e.id)),ids=new Set();
   const allowedUrl=value=>!value||value.startsWith('#')||/^data:(?:image\/(?:png|jpeg|gif|webp)|font\/(?:woff2?|ttf|otf));base64,/i.test(value);
   function checkCSS(text){
    const decoded=text.replace(/\\([0-9a-f]{1,6}\s?|.)/gi,(_,s)=>/^[0-9a-f]/i.test(s)?String.fromCodePoint(parseInt(s,16)):s);
    if(/@import\b/i.test(decoded))throw Error('CSS不接受@import；请先内联资源');
    const sheet=new CSSStyleSheet();sheet.replaceSync(text);
    const inspect=rules=>{for(const r of rules){if(r.type===CSSRule.IMPORT_RULE)throw Error('静态自包含CSS不接受@import；请先内联资源');if(r.cssRules)inspect(r.cssRules);}};inspect(sheet.cssRules);
    // CSSOM规范化转义后的规则；URL仍必须为内联资源或SVG内部引用。
    const normalized=[...sheet.cssRules].map(r=>r.cssText).join('\n');
    for(const match of (normalized+'\n'+decoded).matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi))if(!allowedUrl((match[1]??match[2]??match[3]).trim()))throw Error('CSS含外部URL；请改为内联raster/data:资源或内联SVG');
   }
   for(const el of template.content.querySelectorAll('*')){
    if(el.id){if(reserved.has(el.id)||ids.has(el.id)||/^deck-(?:fonts|font-|theme|typography|author|layouts|geometry|frame|bookends)/.test(el.id))throw Error('重复或引擎保留ID: '+el.id);ids.add(el.id);}
    if(el.matches('script,canvas,iframe,object,embed,link,base,meta,video,audio,source,template,animate,animateTransform,animateMotion,set,.chart,[data-opt],[data-recipe]'))throw Error('静态装配不支持动态/外部依赖: '+el.tagName+(el.classList.contains('chart')?'.chart':'')+'；请先SSR为内联SVG或使用原动态路线');
    if(el.tagName==='STYLE'){checkCSS(el.textContent);authorCSS.push(el.textContent);el.remove();continue;}
    for(const attr of el.attributes){const name=attr.name.toLowerCase(),value=attr.value.trim();
     if(name.startsWith('on')||name==='srcdoc'||name==='srcset')throw Error('静态装配不支持事件脚本/srcdoc/srcset');
     if(name==='style')checkCSS('x{'+value+'}');
     else if(/url\s*\(/i.test(value))checkCSS('x{fill:'+value+'}');
     if(['src','href','xlink:href','poster','background','data'].includes(name)){
      if(el.tagName.toLowerCase()==='a'&&name==='href'&&/^(?:https?:|mailto:|#)/i.test(value))continue;
      if(!allowedUrl(value))throw Error('外部或未适配资源: '+el.tagName+' '+name+'；请先嵌入data:栅格图或内联SVG，不自动联网');
     }
    }
   }
   authorCSS.push(css);for(const text of authorCSS)checkCSS(text);
   const slideForms=[];
  for(const slide of slides){
    if(kind!=='collection'&&!['cover','references','back-cover','divider'].includes(slide.dataset.pageRole)&&slide.classList.contains('reading')!==(mode==='reading'))throw Error('页面reading类与任务mode冲突；请按当前媒介重新排版');
    if(!['line','integrated','space'].includes(slide.getAttribute('data-frame-boundary')))throw Error('每页须由作者显式声明data-frame-boundary="line|integrated|space"；不自动选择标题边界');
    const role=slide.dataset.pageRole||null,isBookend=['cover','references','back-cover','divider'].includes(role);
    if(!isBookend&&!slide.dataset.form)throw Error('第'+(slideForms.length+1)+'页缺少data-form：每页须显式声明本页主形式（取值见assets/deck-forms.js，字段见references/static-html-pdf.md的pages合同）；没有静默默认值');
    // v3 起页面还须声明 data-layout：布局是骨架，CSS 靠它把模块落到 12×6 网格上。
    // data-module 的取值就是该格的槽位，DOM 顺序须与布局目录逐格一致——顺序错了就是顺序错了。
    slideForms.push({page:slideForms.length+1,form:slide.dataset.form||null,visual:slide.dataset.visual||'',proves:slide.dataset.proves||'',densityProfile:slide.dataset.densityProfile||'',layout:slide.dataset.layout||'',modules:[...slide.querySelectorAll('[data-module]')].map(e=>e.dataset.module||''),role});
    slide.classList.remove('active');
    if(!slide.querySelector(':scope > .slide__frame')){const frame=doc.createElement('div');frame.className='slide__frame';frame.setAttribute('aria-hidden','true');slide.prepend(frame);}
   }
   slides[0].classList.add('active');stage.replaceChildren(...slides);doc.title=title;doc.documentElement.dataset.deckKind=kind;doc.documentElement.dataset.assemblyRoute='static-html-svg';doc.body.dataset.ratio=ratio;
   // 切片留在成稿上：文件本身要说得清自己是制作期产物，不能靠调用者记得。
   if(upto)doc.documentElement.dataset.assemblyPartial=String(upto);
   // 静态页不加载未使用图表库；主引擎及其导航、打印、PDF下载功能保持原样。
   for(const script of doc.querySelectorAll('script[src]')){const src=script.getAttribute('src');if(src==='./deck-typography.js')continue;if(['./echarts-recipes.js','./chart-runtime.js'].includes(src)||/^https:\/\/cdn\.jsdelivr\.net\/npm\/echarts@[^/]+\/dist\/echarts\.min\.js$/.test(src))script.remove();else throw Error('未知引擎依赖，不能静默丢弃: '+src);}
   for(const script of doc.querySelectorAll('script[type="module"]')){if(script.textContent.includes('@icon-park/svg'))script.remove();else throw Error('未知引擎模块依赖');}
   const style=doc.createElement('style');style.id='deck-author';style.textContent=authorCSS.join('\n');doc.head.append(style);
   return {html:'<!DOCTYPE html>\n'+doc.documentElement.outerHTML,pages:slides.length,slideForms,partial:upto||null};
  },{engine,pages,css,title,kind,ratio,mode:task.mode,explicitContract:!!contractFile,upto});
  // 形式取值走封闭枚举：写了就必须是真能渲染出来的入口，不是自造名字。
  const deckForms=require('../assets/deck-forms.js');
  for(const item of assembled.slideForms)if(item.form){try{deckForms.get(item.form);}catch(error){throw Error('第'+item.page+'页 data-form="'+item.form+'"：'+error.message);}}
  // pages.json 是 S3 的机器可读产物：逐页形式必须与成稿一一对应。
  const pagesRecord=contractFile?contractApi.authoredPageRecord(contractFile):null;
  if(contractFile&&!pagesRecord)throw Error('任务合同缺少 pages：页面蓝图阶段须产出 pages.json，并在 task.json 用 {"pages":{"record":"pages.json","sha256":"..."}} 绑定（字段见 references/static-html-pdf.md）');
  if(pagesRecord){
   const pagesApi=require('./check_pages.cjs'),pagesContract=pagesApi.load(pagesRecord);
   // verifyDeck 要把 pages.json 的 waterfall 声明与成稿零轴线上的属性逐字对账。上面那个 evaluate 只搬结构，
   // 不产生 DOM 事实；缺了事实，对账会把"没法核对"误报成"成稿里没有对账零轴"——一句假话，且必然阻断。
   // 所以这里补一次现场测量。复用 page_probe 的 inspectDom 而不是再抄一遍属性名：
   // 两处各写一份的话，改一处漏一处就会重新长出这种假事实。只对真的声明了 waterfall 的册子跑，老稿不受影响。
   if(pagesContract.doc.pages.some(page=>page&&page.waterfall)){
    const probe=require('./page_probe.cjs');
    // 上面那个 evaluate 产出的是一个 DOMParser 文档再序列化出来的字符串，页面里那个 #stage 并不是它；
    // 而且此时成稿还没上主题、引擎脚本也还没跑。所以另开一个关掉脚本的页面来量：
    // 引擎的内联脚本会去取没装配进来的 deck-typography.js，跑起来只会制造与本次测量无关的报错。
    const probePage=await browser.newPage({javaScriptEnabled:false});
    try{
     await probePage.setContent(assembled.html,{waitUntil:'domcontentloaded'});
     const slidesLoc=probePage.locator('#stage .slide'),count=await slidesLoc.count();
     if(count!==assembled.slideForms.length)throw Error('装配后 #stage 下有 '+count+' 页，与逐页形式表 '+assembled.slideForms.length+' 条对不上');
     for(let i=0;i<count;i++)assembled.slideForms[i].waterfall=(await slidesLoc.nth(i).evaluate(probe.inspectDom,probe.WF_FORMS)).waterfall;
    }finally{await probePage.close();}
   }
   // pages.json 记录的 sha256 仍在 load 里照常核对——切片只收窄成稿要对账的条目，不改动那份记录。
   const declared=upto?{...pagesContract.doc,pages:pagesContract.doc.pages.filter(page=>page.page<=upto)}:pagesContract.doc;
   const pagesErrors=pagesApi.verifyDeck(declared,assembled.slideForms);
   if(pagesErrors.length)throw Error('pages 合同与成稿不一致：'+pagesErrors.join('；'));
  }
  const base=path.join(tmp,'assembled.html'),themed=path.join(tmp,'themed.html');fs.writeFileSync(base,contractApi.install(assembled.html,task));
  execFileSync(process.execPath,[path.join(__dirname,'apply_theme.cjs'),base,themed,theme,typography],{stdio:['ignore','pipe','pipe'],maxBuffer:5*1024*1024});
  let html=fs.readFileSync(themed,'utf8');
  // 作者样式排在公共默认样式后；字体子集仍按全部正文与这些样式生成。
  html=await page.evaluate(html=>{const doc=new DOMParser().parseFromString(html,'text/html');doc.head.append(doc.getElementById('deck-author'));if(doc.querySelector('script[src],link[href]'))throw Error('装配仍有外部脚本/样式');return '<!DOCTYPE html>\n'+doc.documentElement.outerHTML;},html);
  if(issues.length)throw Error('惰性解析出现脚本错误: '+issues.join(';'));
  // 运行原引擎核对静态装配完整性；这不替代后续截图/PDF及四层QA。
  const candidate=path.join(tmp,'candidate.html'),candidateUrl=pathToFileURL(candidate).href;fs.writeFileSync(candidate,html);
  await page.unroute('**/*');const requests=[];await page.route('**/*',route=>{const url=route.request().url();if(url===candidateUrl||url.startsWith('data:'))return route.continue();requests.push(url);return route.abort();});
  page.on('console',m=>{if(m.type()==='error')issues.push(m.text());});
  await page.goto(candidateUrl,{waitUntil:'load'});await page.evaluate(async()=>{if(!window.deckReady)throw Error('原引擎未就绪');await window.deckReady;});
  for(let n=1;n<=assembled.pages;n++){await page.evaluate(n=>location.hash='#'+n,n);await page.waitForFunction(n=>document.getElementById('hud').textContent.startsWith(n+' / '),n);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));}
  if(await page.locator('#stage > .slide').count()!==assembled.pages||requests.length||issues.length)throw Error('静态装配运行失败: '+JSON.stringify({requests,errors:issues}));
  fs.mkdirSync(path.dirname(output),{recursive:true});const pending=output+'.assembling-'+crypto.randomBytes(5).toString('hex');
  try{fs.writeFileSync(pending,html);fs.renameSync(pending,output);}finally{if(fs.existsSync(pending))fs.unlinkSync(pending);}
  return {status:'assembled',output,pages:assembled.pages,theme,typography,kind,ratio,sha256:sha(html),route:'static-html-svg',partial:assembled.partial};
 }finally{try{if(browser)await browser.close();}finally{fs.rmSync(tmp,{recursive:true,force:true});}}
}
function args(argv){const [pagesFile,outputFile,...rest]=argv;if(!pagesFile||!outputFile)throw Error('用法: node assemble_deck.cjs pages.html deck.html [--css page.css] [--title 标题] [--kind fragment|report|collection] [--theme mckinsey] [--typography serif-report-bold] [--ratio 16x9|4x3] [--upto N]');const out={pagesFile,outputFile},names={css:'cssFile',title:'title',kind:'kind',theme:'theme',typography:'typography',ratio:'ratio',contract:'contractFile',upto:'upto'},seen=new Set();for(let i=0;i<rest.length;i+=2){const key=rest[i].replace(/^--/,'');if(!rest[i].startsWith('--')||!names[key]||rest[i+1]===undefined||seen.has(key))throw Error('未知/缺值/重复参数: '+rest[i]);seen.add(key);out[names[key]]=rest[i+1];}return out;}
if(require.main===module)assemble(args(process.argv.slice(2))).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={assemble,sectionContract,args};
