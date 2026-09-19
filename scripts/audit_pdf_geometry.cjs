/* 读取真实PDF文字；先核页集合/文字归属，再核基线/右缘。未声明路径明确PARTIAL。 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
async function inspect(audit,output){
 const bytes=fs.readFileSync(audit.pdfArtifact.path);
 if(digest(bytes)!==audit.pdfArtifact.sha256)throw Error('最终PDF与audit版本不同');
 const {doc,canvas}=await require('./render_pdf_pages.cjs').openPdf(bytes),rows=[],errors=[],unmeasured=[];
 fs.mkdirSync(output,{recursive:true});
 const normalize=s=>String(s??'').replace(/\s/g,'');
 try{
  for(const [field,value] of [['audit.pages',audit.pages],['audit.pdfPages',audit.pdfPages],['audit.pdfArtifact.pages',audit.pdfArtifact.pages]])if(!Number.isInteger(value)||value!==doc.numPages)errors.push({code:'PDF-PAGE-SET',field,expected:value??null,actual:doc.numPages});
  const sourceRows=Array.isArray(audit.rows)?audit.rows:[],seen=new Set();
  for(const r of sourceRows){if(!Number.isInteger(r?.page)||r.page<1||r.page>doc.numPages||seen.has(r.page))errors.push({code:'PDF-AUDIT-PAGE',page:r?.page??null});else seen.add(r.page);}
  for(let n=1;n<=doc.numPages;n++)if(!seen.has(n))errors.push({code:'PDF-AUDIT-MISSING',page:n});
  for(let n=1;n<=doc.numPages;n++){
   const page=await doc.getPage(n),viewport=page.getViewport({scale:4/3}),surface=canvas.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
   await page.render({canvasContext:surface.getContext('2d'),viewport}).promise;
   const png=path.join(output,'pdf-p'+String(n).padStart(2,'0')+'.png');fs.writeFileSync(png,surface.toBuffer('image/png'));
   const {items}=await page.getTextContent(),source=sourceRows.find(r=>r.page===n)?.relations,checks=[],groups=[];
   const declared=Array.isArray(source?.measurements)?source.measurements.filter(m=>m.group?.startsWith('baseline:')||m.group?.startsWith('right:')):[];
   if(source?.status==='FAIL')errors.push({code:'PDF-SOURCE-FAILED',page:n});
   if(!source?.slideSize||!declared.length){unmeasured.push({page:n,reason:'没有可核对的HTML水平基线/右缘锚点；仅完成PDF渲染'});}
   else{
    const [x0,y0,x1,y1]=page.view,sx=source.slideSize.width/(x1-x0),sy=source.slideSize.height/(y1-y0),tolerance=source.toleranceLogicalPx;
    if(![sx,sy,tolerance].every(Number.isFinite)||sx<=0||sy<=0||tolerance<=0||tolerance>1)errors.push({code:'PDF-SOURCE-GEOMETRY',page:n});
    else for(const m of declared){
     const baseline=m.group.startsWith('baseline:'),expected=normalize(baseline?(m.lineText??m.text):m.text);
     // 先找对应行的文字对象，再要求整个期望文本被覆盖；不能把移出窗口的字符静默丢弃。
     const matches=items.filter(i=>{
      const token=normalize(i.str),left=(i.transform[4]-x0)*sx,base=(y1-i.transform[5])*sy;
      return token&&expected.includes(token)&&left>=m.rect.left-1&&left<m.rect.right+1&&(baseline?Math.abs(base-m.value)<12:base>=m.rect.top-1&&base<=m.rect.bottom+1);
     });
     const matchedText=normalize(matches.map(i=>i.str).join(''));
     const horizontal=matches.every(i=>Math.abs(i.transform[1])<1e-6&&Math.abs(i.transform[2])<1e-6);
     const actual=baseline?matches.map(i=>(y1-i.transform[5])*sy):matches.length?[Math.max(...matches.map(i=>(i.transform[4]-x0+i.width)*sx))]:[];
     const delta=actual.length?Math.max(...actual.map(v=>Math.abs(v-m.value))):null;
     const correspondence=!!expected&&matchedText===expected;
     const check={group:m.group,text:m.text,lineSelection:m.lineSelection??null,expectedText:expected,matchedText,correspondence,expected:m.value,actual,error:delta,status:correspondence&&horizontal&&delta!==null&&Number.isFinite(m.value)?'PASS':'FAIL'};
     if(!horizontal)check.reason='旋转/斜置文字不在水平基线适配范围';else if(!correspondence)check.reason='PDF未完整匹配被测文字；缺失、移位或歧义不能视作通过';
     checks.push(check);
    }
    // 关系精度与跨媒介偏移分开判断。Chrome打印的整行基线可取到最近CSS像素，
    // 但只接受实测签名：所有片段同基线、最近整数残差<=.02、共同偏移<=.5。
    // 这不是放宽组内.35px容差，也不适用于右缘或任意共同平移。
    for(const name of new Set(checks.map(c=>c.group))){
     const members=checks.filter(c=>c.group===name),values=members.flatMap(c=>c.actual),expected=members.map(c=>c.expected);
     const spread=values.length?Math.max(...values)-Math.min(...values):null,expectedSpread=Math.max(...expected)-Math.min(...expected);
     const correspondence=members.every(c=>c.status==='PASS'),aligned=members.length>=2&&correspondence&&spread!==null&&spread<=tolerance&&expectedSpread<=tolerance;
     const absoluteMatch=members.every(c=>c.error!==null&&c.error<=tolerance);
     const roundingResidual=Math.max(...members.flatMap(c=>c.actual.map(v=>Math.abs(v-Math.round(c.expected)))));
     const roundedBaseline=name.startsWith('baseline:')&&aligned&&roundingResidual<=.02&&members.every(c=>c.error<=.5+.02);
     const position=absoluteMatch?'EXACT_WITHIN_TOLERANCE':roundedBaseline?'CALIBRATED_BASELINE_ROUNDING':'FAIL';
     const group={group:name,members:members.length,spread,expectedSpread,tolerance,status:aligned&&position!=='FAIL'?'PASS':'FAIL',position,offsets:members.map(c=>({text:c.text,offsets:c.actual.map(v=>v-c.expected)}))};
     if(position==='CALIBRATED_BASELINE_ROUNDING')group.calibration={model:'nearest-css-pixel-baseline',residual:roundingResidual,residualTolerance:.02,maxQuantization:.5,verifiedWith:'Chrome 152 fractional line-height fixture; scripts/test_execution_contracts.cjs'};
     if(!aligned)group.reason='PDF组内关系不满足原0.35px容差，或文字对应/成员不完整';
     else if(position==='FAIL')group.reason='跨媒介位置偏移不符合已验证的基线取整模型';
     groups.push(group);
     for(const c of members){c.position=position;if(group.status==='FAIL')c.status='FAIL';}
     if(group.status==='FAIL')errors.push({page:n,code:'PDF-GROUP',...group});
    }
    for(const c of checks)if(c.status==='FAIL')errors.push({page:n,...c});
   }
   rows.push({page:n,image:png,imageSha256:digest(fs.readFileSync(png)),status:checks.some(c=>c.status==='FAIL')?'FAIL':checks.length?'PASS':'NOT_DECLARED',checks,groups});
  }
  const report={pdfSha256:audit.pdfArtifact.sha256,pages:doc.numPages,rows,errors,unmeasured,status:errors.length?'FAIL':unmeasured.length?'PARTIAL':'PASS',scope:'实际PDF水平文字基线/右缘；先核页集合和对应文字完整性；无锚点页仅渲染，PARTIAL不能升级为整份精度通过'};
  fs.writeFileSync(path.join(output,'pdf-geometry.json'),JSON.stringify(report,null,2));return report;
 }finally{await doc.destroy();}
}
if(require.main===module){(async()=>{const [auditFile,out]=process.argv.slice(2);if(!auditFile||!out)throw Error('用法：node audit_pdf_geometry.cjs audit.json output-dir');const r=await inspect(JSON.parse(fs.readFileSync(auditFile,'utf8')),path.resolve(out));console.log(JSON.stringify({status:r.status,pages:r.pages,errors:r.errors,unmeasured:r.unmeasured}));process.exitCode=r.status==='PASS'?0:r.status==='PARTIAL'?2:1;})().catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={inspect};
