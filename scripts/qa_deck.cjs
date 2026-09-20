/* 自动运行与几何审计；按档位产出，不代替逐页目视验收。需要Node、Playwright和Chrome。
   档位只决定“这一轮跑到哪”，不改变任何判据：验收档与以前一样全量跑完。 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{pathToFileURL}=require('node:url'),{execFileSync}=require('node:child_process');
const fontAudit=require('./browser_font_audit.cjs');
const bookends=require('./check_bookends.cjs');
const geometry=require('./browser_geometry_audit.cjs');
const pageProbe=require('./page_probe.cjs');
const taskContracts=require('./report_contract.cjs'),criticalContent=require('./critical_content.cjs'),visualPolicy=require('./browser_visual_policy.cjs'),auditEvidence=require('./audit_evidence.cjs'),deckForms=require('../assets/deck-forms.js');
let pw;try{pw=require('playwright')}catch(e){if(!process.env.PLAYWRIGHT_MODULE)throw Error('请安装playwright，或将PLAYWRIGHT_MODULE设为现有模块路径');pw=require(process.env.PLAYWRIGHT_MODULE)}
const TIERS=['iteration','smoke','acceptance'];
// 每一档明确列出它没有覆盖的东西；缺项写在 audit 里，不靠调用者记忆。
// iteration 必须点名页码，所以它列的缺项就是它实际没跑的东西，不存在"列了却跑了"的偏差。
const TIER_SKIPS={
 iteration:['打印媒体复检','PDF产物校验','断网一致性','导航与深链','总览图','首尾与逐页合同对账'],
 smoke:['PDF产物校验','断网一致性','导航与深链'],
 acceptance:[]
};
function parseArgs(argv){
 const out={input:null,directory:'renders',tier:null,pages:null};let positional=0;
 for(let i=0;i<argv.length;i++){
  const value=argv[i];
  if(value==='--tier'){out.tier=argv[++i];continue;}
  if(value==='--pages'){out.pages=String(argv[++i]||'').split(',').map(text=>Number(text.trim()));continue;}
  if(value&&!value.startsWith('--')){if(positional++===0)out.input=value;else if(positional===2)out.directory=value;else throw Error('多余的位置参数: '+value);continue;}
  throw Error('未知参数: '+value);
 }
 if(!out.input)throw Error('用法: node scripts/qa_deck.cjs deck.html [输出目录] [--tier iteration|smoke|acceptance] [--pages 1,3]');
 if(out.tier&&!TIERS.includes(out.tier))throw Error('tier 须为 '+TIERS.join(' / '));
 // QA_SKIP_PDF 是历史别名：只在没有显式 --tier 时等价于冒烟档。
 out.tier=out.tier||(process.env.QA_SKIP_PDF?'smoke':'acceptance');
 if(out.pages&&out.tier!=='iteration')throw Error('--pages 只用于 iteration 档：冒烟与验收档必须覆盖全部页面，否则不能作为交付证据');
 if(out.pages&&(!out.pages.length||out.pages.some(n=>!Number.isInteger(n)||n<1)))throw Error('--pages 需要正整数页码，如 --pages 3 或 --pages 2,5,7');
 // iteration 的用途就是"只看这一页"，不点名页码就拿不到它该省的东西，还会让缺项清单与实跑不符；整册自查用冒烟档。
 if(out.tier==='iteration'&&!out.pages)throw Error('iteration 档要指定 --pages（如 --pages 3 或 --pages 2,5）：它的缺项清单假定只跑了点名的页；要看整册但不出 PDF 请用 --tier smoke');
 return out;
}
(async()=>{
 const options=parseArgs(process.argv.slice(2)),tier=options.tier;
 const input=path.resolve(options.input),out=path.resolve(options.directory);
 if(!fs.statSync(input).isFile())throw Error('需要HTML文件');fs.mkdirSync(out,{recursive:true});
 const acceptance=tier==='acceptance',partial=!!options.pages;
 const initialHtml=fs.readFileSync(input),initialSha256=taskContracts.hash(initialHtml);
 const browser=await pw.chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true});
 try{
 const p=await browser.newPage({viewport:{width:1400,height:820}}),errors=[],warnings=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await fontAudit.attach(p);
 await p.goto(pathToFileURL(input).href,{waitUntil:'networkidle'});await p.evaluate(()=>window.deckReady||document.fonts.ready);
 const total=await p.locator('.slide').count(),rows=[];if(!total)throw Error('没有幻灯片');
 const documentContract=await p.evaluate(()=>({kind:document.documentElement.dataset.deckKind,reliability:document.documentElement.dataset.reliabilityVersion,partial:document.documentElement.dataset.assemblyPartial||null}));
 // 切片稿（assemble --upto）只服务于逐页迭代，永远不是交付物；冒烟/验收档拿它跑等于用半个稿子出证据。
 if(documentContract.partial){if(tier==='iteration')warnings.push('这份成稿只装了前 '+documentContract.partial+' 页正文（制作期切片），结论只覆盖已装的页');else errors.push('这份成稿是只装了前 '+documentContract.partial+' 页正文的制作期切片，不能作为'+tier+'档证据；整册装配后再跑');}
 const modern=documentContract.reliability==='2';let taskContract=null;
 if(modern){
  try{taskContract=taskContracts.read(initialHtml.toString());if(!taskContract)throw Error('reliability 2 缺少任务合同');
   const actual=await p.evaluate(()=>({kind:document.documentElement.dataset.deckKind,theme:document.documentElement.dataset.theme,typography:document.documentElement.dataset.typography,ratio:document.body.dataset.ratio,modes:[...document.querySelectorAll('.slide')].filter(s=>!['cover','references','back-cover','divider'].includes(s.dataset.pageRole)).map(s=>s.classList.contains('reading')?'reading':'presentation')}));
   for(const key of ['kind','theme','typography','ratio'])if(actual[key]!==taskContract[key])errors.push('任务合同与实际'+key+'不一致');
   if(taskContract.kind!=='collection'&&actual.modes.some(mode=>mode!==taskContract.mode))errors.push('任务合同与正文模式不一致');
  }catch(e){errors.push('任务合同无效：'+e.message);}
 }
 if(documentContract.reliability&&!await p.locator('#deck-layouts').count())errors.push('初始化缺少必需布局资源deck-layouts');
 // 逐页测量走共享探针；单页自查与正式审计因此不可能出现两套判据。
 const requested=partial?[...new Set(options.pages)]:[];
 const untestable=requested.filter(n=>n>total);
 if(untestable.length)warnings.push('指定页码超出范围，已跳过：'+untestable.join(','));
 const targets=partial?requested.filter(n=>n<=total).sort((a,b)=>a-b):Array.from({length:total},(_,i)=>i+1);
 if(!targets.length)throw Error('没有可检查的页码；本稿共 '+total+' 页');
 for(const pageNumber of targets){
  const result=await pageProbe.collect(p,pageNumber-1,{modern});
  result.page=pageNumber;result.screenshot=pageProbe.screenshotName(pageNumber);
  if(modern){
   errors.push(...result.visualPolicy.errors.map(e=>'第'+pageNumber+'页视觉禁令：'+JSON.stringify(e)));
   warnings.push(...result.visualPolicy.warnings.map(e=>'第'+pageNumber+'页视觉诊断：'+JSON.stringify(e)));
  }
  errors.push(...result.relations.errors.map(e=>'第'+pageNumber+'页几何关系：'+JSON.stringify(e)));
  // 图被 CSS 缩放在预览里看不见，但它改的是图内每一个字号与偏移，必须当错误报。
  for(const item of result.scaledSvg||[]){const line='第'+pageNumber+'页图形被缩放：按 '+item.source+' '+item.intrinsic.join('×')+' 渲染，实际占位 '+item.rendered.join('×')+'（缩放 '+item.scale+'）';if(item.source==='data-actual-size')errors.push(line+'——配方图不能靠 CSS 缩放；改 exhibits 的 width/height 或版位比例');else warnings.push(line+'——请确认是有意的');}
  if(result.fonts.identity==='FAIL')errors.push('第'+pageNumber+'页'+fontAudit.describe(result.fonts));
  const titleFit=await p.locator('.slide.active .slide__title').evaluateAll(es=>es.map(e=>{const cs=getComputedStyle(e);return {text:e.textContent,lines:e.offsetHeight/parseFloat(cs.lineHeight)};}));if(titleFit.some(t=>t.lines>2.1))warnings.push('第'+pageNumber+'页标题超过两行建议，请目视判断');
  if(result.tinyText.length||result.smallDataText.length)warnings.push('第'+pageNumber+'页部分文字低于建议字号，请按实际可读性复核');
  // 声明"没有静默默认值"就必须真的拦住：新稿缺 boundary 直接失败；老稿保持提示，不追溯返工。
  if(!result.frame.boundary){if(modern)errors.push('第'+pageNumber+'页未显式声明 data-frame-boundary（line/integrated/space）：没有静默默认值，须按正文结构逐页选择');else if(result.frame.ruleVisible)warnings.push('第'+pageNumber+'页标题线已生效但未显式声明 data-frame-boundary（line/integrated/space），请按正文结构选择边界');}
  if(result.frame.ruleVisible&&result.frame.doubleBorder.length)warnings.push('第'+pageNumber+'页标题区隔线与正文首排顶线可能并存（'+result.frame.doubleBorder[0]+'）：首排模块已有顶线时建议 data-frame-boundary="integrated"');
  if(!modern&&result.notePad.length)warnings.push('第'+pageNumber+'页有文字贴近左侧边条（padding-left<6px）：'+result.notePad.slice(0,4).map(x=>(x.text||x.cls||'?')+'('+x.pad+')').join('；'));
  await p.locator('.slide.active').screenshot({path:path.join(out,result.screenshot)});rows.push(result);
 }
 // 证据快照必须在翻页刚结束时取：后面的打印模拟与导航会改视口与页码，不能拿来当截图时点的页面状态。
 const evidenceSnapshot=acceptance&&modern?await p.evaluate(auditEvidence.captureDocument):null;
 // 以下都是整稿级判据：只跑局部页时不能拿它当全稿结论。
 if(modern&&!partial)errors.push(...criticalContent.verifyDeclared(taskContract,rows));
 let bookendsCheck={status:'NOT_CHECKED',reason:partial?'只检查了部分页面，不能给出整稿首尾结论':'未执行'};
 if(!partial){
  const bookendResult=bookends.checkDocument(rows,documentContract);bookendsCheck=bookendResult;errors.push(...bookendResult.errors);warnings.push(...bookendResult.warnings);
  await p.keyboard.press('g');await p.screenshot({path:path.join(out,'overview.png'),fullPage:true});await p.keyboard.press('Escape');
 }
 // 逐页形式声明：独立于装配器重新对账一次，并给出全篇形式清单供审查者判断节奏。
 const pagesApi=require('./check_pages.cjs');
 let pagesCheck={status:'NOT_PROVIDED',reason:partial?'只检查了部分页面，不能对账逐页形式':'任务合同未绑定 pages.json；S3 未产出逐页形式声明，不能正式交付'};
 if(modern&&taskContract?.pages&&!partial){
  try{
   const record=path.resolve(path.dirname(input),taskContract.pages.record);
   if(!fs.existsSync(record)||taskContracts.fileHash(record)!==taskContract.pages.sha256)throw Error('pages记录缺失或sha256与任务合同不符');
   const doc=JSON.parse(fs.readFileSync(record,'utf8')),checked=pagesApi.check(doc);
   const mismatches=pagesApi.verifyDeck(doc,rows.map(r=>({page:r.page,form:r.form,visual:r.visual,proves:r.proves,densityProfile:r.densityProfile,role:r.bookends?.role})));
   const all=[...checked.errors,...mismatches];
   pagesCheck={status:all.length?'FAIL':'PASS',errors:all,record,sha256:taskContract.pages.sha256,inventory:checked.inventory};
   all.forEach(e=>errors.push('pages合同：'+e));
  }catch(error){pagesCheck={status:'FAIL',errors:[error.message]};errors.push('pages合同：'+error.message);}
 }
 // 声明为图的形式必须在成稿里真的出现 SVG：绘图受阻不能退成表格再沿用原图型名称通过。
 if(modern)for(const r of rows){
  if(!r.form)continue;let entry=null;try{entry=deckForms.get(r.form);}catch(e){continue;}
  if(entry.kind==='svg'&&!r.shapes.svg)errors.push('第'+r.page+'页声明 '+r.form+'（'+entry.label+'）是图形实现，但正文里没有 SVG'+(r.shapes.tables?'，只有表格（含 '+(r.shapes.sparklines||0)+' 个表格内数据条）':'')+'：图型不因容量不足被替换');
  for(const c of r.charts||[])if(c.risks)warnings.push('第'+r.page+'页图表预算提示：'+c.risks);
 }
 let printCheck={status:'NOT_CHECKED',reason:'iteration 档不做打印媒体复检'},pdfRows=[],evidenceManifest=null;
 let pdfPages=null,pdfFonts=null,pdfArtifact={skipped:true,reason:'tier='+tier},navigation={skipped:true,reason:'tier='+tier},offlineState={skipped:true,reason:'tier='+tier};
 // 对照屏幕上已存在的展品，检查打印布局中是否仍可见；实际PDF另核关键标签并目视。
 if(tier!=='iteration'){
  const expected=rows.flatMap(r=>r.exhibits.map(e=>({...e,page:r.page})));
  await p.emulateMedia({media:'print'});await p.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  const printMissing=await p.evaluate(expected=>expected.filter(item=>{const e=document.querySelector('[data-deck-exhibit-id="'+item.id+'"]');if(!e)return true;const r=e.getBoundingClientRect();if(!r.width||!r.height)return true;for(let n=e;n&&n.nodeType===1;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||Number(s.opacity)===0)return true;}return false;}),expected);
  printMissing.forEach(e=>errors.push('打印缺少第'+e.page+'页展品 '+e.id));
  printCheck={expected:expected.length,missing:printMissing};
  if(modern){await geometry.settle(p);for(const row of rows){const slide=p.locator('.slide').nth(row.page-1);row.printCritical=await slide.evaluate(criticalContent.inspectSlide);errors.push(...criticalContent.verifyPrint(row.critical,row.printCritical).map(e=>'第'+row.page+'页：'+e));row.printVisualPolicy=await slide.evaluate(visualPolicy.inspectSlide);errors.push(...row.printVisualPolicy.errors.map(e=>'第'+row.page+'页打印视觉禁令：'+JSON.stringify(e)));warnings.push(...row.printVisualPolicy.warnings.map(e=>'第'+row.page+'页打印视觉诊断：'+JSON.stringify(e)));}}
  if(!acceptance)await p.emulateMedia({media:'screen'});
 }
 if(acceptance){
  const pdfPath=path.join(out,'deck.pdf');await p.pdf({path:pdfPath,printBackground:true,preferCSSPageSize:true});
  const pdfInfo=execFileSync('pdfinfo',[pdfPath],{encoding:'utf8'});pdfPages=Number(pdfInfo.match(/Pages:\s+(\d+)/)?.[1]);if(pdfPages!==total)errors.push('PDF页数与deck不符');
  pdfFonts=execFileSync('pdffonts',[pdfPath],{encoding:'utf8'});const fontRows=pdfFonts.split('\n').slice(2).filter(Boolean);if(!fontRows.length||fontRows.some(row=>row.trim().split(/\s+/).slice(-5,-2).some(v=>v!=='yes')))errors.push('PDF 字体未完整嵌入或缺少字符映射');
  const normalize=s=>s.replace(/\s+/g,'');
  const printedPages=execFileSync('pdftotext',['-layout',pdfPath,'-'],{encoding:'utf8'}).split('\f').map(normalize);
  const rawPages=rows.some(r=>['references','cover','back-cover'].includes(r.bookends.role))?execFileSync('pdftotext',['-raw',pdfPath,'-'],{encoding:'utf8'}).split('\f').map(normalize):[];
  for(const row of rows){
    const pageText=printedPages[row.page-1]||'';
    if(!pageText.includes(normalize(row.title)))errors.push('PDF缺少第'+row.page+'页标题');
    if(['cover','back-cover'].includes(row.bookends.role))for(const [field,value] of Object.entries(row.bookends.meta)){
      if(value&&!pageText.includes(normalize(value))&&!(rawPages[row.page-1]||'').includes(normalize(value)))errors.push('PDF第'+row.page+'页缺少首尾元信息: '+field);
    }
    if(row.bookends.role==='references'){
      const rawText=rawPages[row.page-1]||'';
      const missing=row.bookends.entries.filter(e=>!rawText.includes(normalize(e.text))&&!pageText.includes(normalize(e.text))).map(e=>e.id);
      row.referencesPrint={expected:row.bookends.entries.length,missing};
      if(missing.length)errors.push('PDF第'+row.page+'页缺少完整参考条目: '+missing.join(', '));
    }
    const labels=[...new Set(row.exhibits.flatMap(e=>e.labels).map(normalize))];
    const missing=labels.filter(t=>t.length>1&&!pageText.includes(t));
    if(missing.length)errors.push('PDF第'+row.page+'页缺少展品标签：'+missing.slice(0,8).join(' / '));
    const bodyText=[...new Set(row.textEvidence.map(normalize).filter(t=>t.length>1))];
    const textUnits=[...new Set(bodyText.flatMap(t=>t.length<4?[t]:[...Array(t.length-3)].map((_,i)=>t.slice(i,i+4))))];
    const missingText=textUnits.filter(t=>!pageText.includes(t)),textCoverage=textUnits.length?1-missingText.length/textUnits.length:1;
    row.printText={expectedUnits:textUnits.length,missingUnits:missingText.length,coverage:Number(textCoverage.toFixed(4))};
    if(textUnits.length>=8&&textCoverage<.85)errors.push('PDF第'+row.page+'页正文文字覆盖率不足：'+(textCoverage*100).toFixed(1)+'%；缺少片段 '+missingText.slice(0,8).join(' / '));
  }
  if(modern){try{pdfRows=await require('./render_pdf_pages.cjs').render(pdfPath,out);if(pdfRows.length!==total)errors.push('实际PDF栅格页数与deck不符');for(const row of rows){const rendered=pdfRows.find(r=>r.page===row.page);row.criticalPdf={status:rendered?'CHECKED':'NOT_CHECKED',scope:'仅作者显式关键内容及关联对象的真实PDF文字位置',errors:rendered?criticalContent.verifyPdf(row.printCritical,rendered.words):['缺少PDF页面文字位置']};errors.push(...row.criticalPdf.errors.map(e=>'第'+row.page+'页：'+e));}}catch(e){errors.push('实际PDF逐页渲染/关键位置检查失败：'+e.message);}}
  pdfArtifact={path:pdfPath,bytes:fs.statSync(pdfPath).size,sha256:crypto.createHash('sha256').update(fs.readFileSync(pdfPath)).digest('hex'),pages:pdfPages};
  await p.evaluate(()=>window.dispatchEvent(new Event('afterprint')));await p.emulateMedia({media:'screen'});
  const onlineContent=await p.locator('.slide').evaluateAll(es=>es.map(s=>({text:s.textContent.replace(/\s+/g,''),svg:s.querySelectorAll('svg text').length})));
  await p.keyboard.press('Home');await p.keyboard.press('f');await p.waitForTimeout(100);const fullscreen=await p.evaluate(()=>!!document.fullscreenElement);if(fullscreen)await p.evaluate(()=>document.exitFullscreen());
  const scales=[];for(const width of [800,2560]){await p.setViewportSize({width,height:900});await p.waitForTimeout(100);scales.push(await p.locator('#stage').evaluate(e=>Number(e.style.getPropertyValue('--scale'))));}
  await p.goto(pathToFileURL(input).href+'#'+Math.min(3,total));await p.evaluate(()=>window.deckReady||document.fonts.ready);await p.waitForTimeout(100);const deepLink=await p.locator('.slide').evaluateAll(es=>es.findIndex(e=>e.classList.contains('active'))+1);if(deepLink!==Math.min(3,total))errors.push('深链错误');
  navigation={fullscreen,deepLink,scales};
  const offline=await browser.newPage({viewport:{width:1400,height:820}});await fontAudit.attach(offline);offline.on('pageerror',e=>errors.push('断网: '+e.message));offline.on('console',m=>{if(m.type()==='error')errors.push('断网: '+m.text())});await offline.route('**/*',r=>/^https?:/.test(r.request().url())?r.abort():r.continue());await offline.goto(pathToFileURL(input).href,{waitUntil:'networkidle'});await offline.evaluate(()=>window.deckReady||document.fonts.ready);offlineState=await offline.evaluate(()=>({externalScripts:[...document.scripts].filter(s=>s.src).length,warning:document.body.classList.contains('no-charts'),staticSVG:document.querySelectorAll('.slide svg').length}));
  // 外部脚本存在时不能证明离线自包含；这是缺证据，不是通过。
  if(offlineState.externalScripts>0)errors.push('离线自包含未验证：页面仍有 '+offlineState.externalScripts+' 个外部脚本，断网一致性未检查');
  if(offlineState.externalScripts===0){offlineState.fonts=[];offlineState.layoutParity=true;for(let i=0;i<total;i++){await offline.keyboard.press('Home');for(let k=0;k<i;k++)await offline.keyboard.press('ArrowRight');const identity=await fontAudit.inspect(offline);offlineState.fonts.push(identity);if(identity.identity==='FAIL')errors.push('断网第'+(i+1)+'页字体失败');if(JSON.stringify(await fontAudit.signature(offline))!==JSON.stringify(rows[i].layoutSignature))offlineState.layoutParity=false;}if(!offlineState.layoutParity)errors.push('断网前后版式不一致');}
  // 离线延迟图表须与在线采用相同的逐页初始化时点，再比较内容。
  if(offlineState.externalScripts===0){const offContent=await offline.locator('.slide').evaluateAll(es=>es.map(s=>({text:s.textContent.replace(/\s+/g,''),svg:s.querySelectorAll('svg text').length})));offlineState.contentParity=JSON.stringify(onlineContent)===JSON.stringify(offContent);if(!offlineState.contentParity)errors.push('断网前后逐页文字或SVG标签不一致');}
 }
 const htmlBuffer=fs.readFileSync(input),htmlArtifact={path:input,bytes:htmlBuffer.length,sha256:crypto.createHash('sha256').update(htmlBuffer).digest('hex')};
 if(acceptance&&htmlArtifact.sha256!==initialSha256)errors.push('QA期间HTML文件发生变化，截图/PDF证据不能绑定当前文件');
 if(acceptance&&pdfArtifact.sha256&&taskContract&&htmlArtifact.sha256===initialSha256){try{evidenceManifest=auditEvidence.manifest(evidenceSnapshot,rows,pdfRows,{html:htmlArtifact,pdf:pdfArtifact},taskContract,out,{browser:browser.version(),viewport:{width:1400,height:820},pdfRasterScale:4/3});}catch(e){errors.push('审查证据关联失败：'+e.message);}}
 const missingStages=[...TIER_SKIPS[tier]];
 const report={tier,acceptance:{complete:acceptance&&!missingStages.length,tier,missingStages},scope:{pages:rows.map(r=>r.page),partial,of:total},taskContract,pagesCheck,pagesInventory:pagesCheck.inventory||null,evidenceManifest,criticalCoverage:modern?'DECLARED_ONLY：只检查声明的关键内容，不证明全部业务语义覆盖':'LEGACY_NOT_CHECKED',documentContract,warnings,bookendsCheck,printCheck,input,pages:total,pdfPages,htmlArtifact,pdfArtifact,pdfFonts,navigation,errors,offline:offlineState,rows,visualStatus:'NOT_REVIEWED：必须实际查看每页图片与PDF',geometryStatus:rows.some(r=>r.overflow.length||r.unreadableText.length||r.charts.some(c=>!c.rendered||c.error))||errors.length?'FAIL':'PASS'};
 fs.writeFileSync(path.join(out,'audit.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({tier,acceptance:report.acceptance.complete,pages:total,scope:report.scope,geometry:report.geometryStatus,warnings:report.warnings.length,errors,overflow:rows.filter(r=>r.overflow.length).map(r=>({page:r.page,items:r.overflow})),tiny:rows.filter(r=>r.tinyText.length).map(r=>r.page),offline:offlineState}));
 if(report.geometryStatus==='FAIL')process.exitCode=1;
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exitCode=1});
