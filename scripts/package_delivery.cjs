/* 把已验收 PDF 与定稿 HTML 打包为双格式交付；HTML 内嵌同一 PDF 供离线一键下载。 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');

function fail(message){throw Error(message)}
function sha256(value){return crypto.createHash('sha256').update(value).digest('hex')}
function safeName(value){
  const name=String(value||'').trim().replace(/[<>:"/\\|?*\0-\x1f]/g,'_').replace(/\.html?$|\.pdf$/i,'').replace(/[. ]+$/,'');
  if(!name||name==='.'||name==='..')fail('交付文件名无效');
  return name;
}
function pageCountFromHtml(html){
  return [...html.matchAll(/<section\b[^>]*\bclass=(['"])[^'"]*\bslide\b[^'"]*\1/gi)].length;
}
function pageCountFromPdf(file){
  let info;
  try{info=execFileSync('pdfinfo',[file],{encoding:'utf8'})}
  catch(error){fail('无法读取 PDF 信息；请安装 pdfinfo 并确认 PDF 有效：'+error.message)}
  const pages=Number(info.match(/^Pages:\s+(\d+)/m)?.[1]);
  if(!Number.isInteger(pages)||pages<1)fail('PDF 没有有效页数');
  return pages;
}
function escapeAttr(value){return String(value).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function removeExistingPayload(html){
  return html.replace(/\n?<script\b[^>]*\bid="deck-pdf-payload"[^>]*>[\s\S]*?<\/script>\n?/gi,'\n');
}
function injectPdf(html,pdf,filename,sha256){
  html=removeExistingPayload(html);
  if(!html.includes('</body>'))fail('HTML 缺少 </body>，无法写入 PDF');
  const tag=`<script id="deck-pdf-payload" type="application/pdf" data-filename="${escapeAttr(filename)}" data-sha256="${sha256}" data-bytes="${pdf.length}">\n${pdf.toString('base64')}\n</script>\n`;
  return html.replace('</body>',tag+'</body>');
}
function markDelivery(html,preview){
  if(!/<head\b[^>]*>/i.test(html))fail('HTML 缺少 <head>，无法写入交付状态');
  html=html.replace(/<head\b[^>]*>/i,tag=>tag+'\n<meta name="deck-delivery-status" content="'+(preview?'preview':'complete')+'">');
  if(preview){
    if(!/<title\b[^>]*>/i.test(html))fail('预览 HTML 缺少 <title>，无法标记预览状态');
    html=html.replace(/<title\b[^>]*>/i,tag=>tag+'预览 · ');
  }
  return html;
}
function validateAudit(file,{inputHtml,inputPdf,html,pdf,htmlPages,pdfPages,pdfSha256}){
  if(!fs.statSync(file,{throwIfNoEntry:false})?.isFile())fail('缺少 S7 audit.json，不能确认 HTML 与 PDF 来自同一次验收');
  let audit;try{audit=JSON.parse(fs.readFileSync(file,'utf8'))}catch(error){fail('无法读取 S7 audit.json：'+error.message)}
  if(audit.geometryStatus!=='PASS'||audit.errors?.length)fail('S7 工程验收未通过，拒绝打包');
  // 迭代/冒烟档的 audit 是"这一轮跑到哪"的记录，缺打印、PDF、断网等结论，不能当交付依据。
  const tier=audit.tier??'acceptance';
  if(tier!=='acceptance'||audit.acceptance?.complete===false)fail('audit.json 来自 '+tier+' 档（未跑完的检查：'+((audit.acceptance?.missingStages||[]).join('、')||'不完整')+'），只有验收档 audit 能作为交付依据；请补跑 node scripts/qa_deck.cjs deck.html renders');
  // 从当前HTML读契约，不能因audit遗漏字段就跳过V11覆盖核对。
  const root=html.match(/<html\b[^>]*>/i)?.[0]||'';
  const attr=name=>root.match(new RegExp('\\b'+name+'\\s*=\\s*([\"\'])'+'([^\"\']*)'+'\\1','i'))?.[2];
  const reliability=attr('data-reliability-version'),kind=attr('data-deck-kind');
  if(reliability&&(audit.documentContract?.reliability!==reliability||audit.documentContract?.kind!==kind))fail('audit缺少或错配当前HTML的V11交付契约');
  if(reliability==='2'){
    const contract=require('./report_contract.cjs'),task=contract.read(html);
    if(!task||!audit.taskContract||contract.stable(task)!==contract.stable(contract.normalize(audit.taskContract)))fail('audit任务合同与当前HTML不一致');
  }
  if(path.resolve(audit.input||'')!==inputHtml)fail('audit.json 对应另一份 HTML，拒绝打包');
  if(audit.pages!==htmlPages||audit.pdfPages!==pdfPages)fail('audit.json 页数与当前 HTML/PDF 不一致');
  if(audit.htmlArtifact?.sha256!==sha256(html))fail('HTML 在 S7 验收后已修改，请重新生成 PDF 并复验');
  if(path.resolve(audit.pdfArtifact?.path||'')!==inputPdf||audit.pdfArtifact?.sha256!==pdfSha256||audit.pdfArtifact?.sha256!==sha256(pdf))fail('PDF 不是 S7 验收产物或验收后已修改');
  return audit;
}
function validateReview(file,{htmlSha256,pdfSha256,pages,requireCoverage=false,requireIndependent=false,audit,auditDir}){
  if(!fs.existsSync(file))fail('缺少成稿 review.json；完成内容与目视复核，或用 --preview 导出预览');
  const review=JSON.parse(fs.readFileSync(file,'utf8'));
  if(audit?.documentContract?.reliability==='2'){
    const errors=require('./review_contract.cjs').validate(review,audit,{baseDir:path.dirname(path.resolve(file)),auditDir:auditDir||path.dirname(path.resolve(file))});
    if(errors.length)fail('审查覆盖不完整：'+errors.join('；'));
    return review;
  }
  if(requireCoverage||review.schemaVersion===2){
    const errors=require('./aggregate_reviews.cjs').inspectCoverage(review,{htmlSha256,pdfSha256,pages,requireIndependent,baseDir:path.dirname(path.resolve(file))});
    if(errors.length)fail('审查覆盖不完整：'+errors.join('；'));
  }
  if(review.htmlSha256!==htmlSha256||review.pdfSha256!==pdfSha256)fail('review.json 对应旧版成稿，请复核当前 HTML/PDF');
  if(review.aggregationErrors?.length)fail('审查聚合仍有未解决错误');
  if(review.status!=='complete'||typeof review.reviewer!=='string'||!review.reviewer.trim()||!['author','independent'].includes(review.independence))fail('成稿审查状态、审查者或独立性记录不完整');
  for(const key of ['analysis','evidence','visual']){
    const check=review.checks?.[key];
    const allowed=key==='visual'?['pass']:['pass','not_applicable'];
    if(!check||!allowed.includes(check.status)||typeof check.basis!=='string'||!check.basis.trim())fail(key+' 未完成审查或缺少具体依据');
  }
  if(!Array.isArray(review.issues))fail('需要明确记录 issues（无未决问题可用空数组）');
  for(const issue of review.issues){
    if(!['blocking','major','minor'].includes(issue.severity)||!['open','resolved'].includes(issue.status)||typeof issue.description!=='string'||!issue.description.trim())fail('审查问题格式不完整');
    if(['blocking','major'].includes(issue.severity)&&issue.status!=='resolved')fail('仍有影响交付的问题未解决：'+issue.description);
  }
  return review;
}
function packageDelivery({htmlFile,pdfFile,outputDir,baseName,auditFile,reviewFile,preview=false,force=false}){
  const inputHtml=path.resolve(htmlFile||''),inputPdf=path.resolve(pdfFile||'');
  if(!fs.statSync(inputHtml,{throwIfNoEntry:false})?.isFile())fail('需要定稿 HTML 文件');
  if(!fs.statSync(inputPdf,{throwIfNoEntry:false})?.isFile())fail('需要已验收 PDF 文件');
  const html=fs.readFileSync(inputHtml,'utf8'),pdf=fs.readFileSync(inputPdf);
  if(!pdf.subarray(0,5).equals(Buffer.from('%PDF-')))fail('输入文件不是有效 PDF');
  const htmlPages=pageCountFromHtml(html),pdfPages=pageCountFromPdf(inputPdf);
  if(!htmlPages)fail('HTML 中没有 .slide 页面');
  if(htmlPages!==pdfPages)fail(`HTML 为 ${htmlPages} 页，PDF 为 ${pdfPages} 页，拒绝打包不同版本`);
  const name=safeName(baseName||path.parse(inputHtml).name)+(preview?'-preview':''),dir=path.resolve(outputDir||'delivery');
  const outputHtml=path.join(dir,name+'.html'),outputPdf=path.join(dir,name+'.pdf');
  if([outputHtml,outputPdf].includes(inputHtml)||[outputHtml,outputPdf].includes(inputPdf))fail('交付输出不能覆盖输入文件，请指定独立目录或文件名');
  if(!force&&(fs.existsSync(outputHtml)||fs.existsSync(outputPdf)))fail('交付文件已存在；确认替换时使用 --force');
  const pdfSha256=sha256(pdf),auditPath=path.resolve(auditFile||path.join(path.dirname(inputPdf),'audit.json'));
  const audit=validateAudit(auditPath,{inputHtml,inputPdf,html,pdf,htmlPages,pdfPages,pdfSha256});
  // 逐页形式声明是正式交付的一部分：没有它，全篇用了什么图、重复了几次都无从核对。
  if(!preview&&(!audit.pagesCheck||audit.pagesCheck.status!=='PASS'))fail('缺少可核对的逐页形式声明（audit.pagesCheck='+(audit.pagesCheck?.status||'缺失')+'）：S3 须产出 pages.json 并在装配时通过校验；未完成时只能用 --preview 导出预览');
  const reviewPath=path.resolve(reviewFile||path.join(path.dirname(inputPdf),'review.json'));
  if(!preview)validateReview(reviewPath,{htmlSha256:sha256(html),pdfSha256,pages:htmlPages,audit,auditDir:path.dirname(auditPath),requireCoverage:!!audit.documentContract?.reliability,requireIndependent:!!audit.documentContract?.reliability&&require('./report_contract.cjs').requiresIndependent(audit)});
  let deliveredHtml=injectPdf(html,pdf,path.basename(outputPdf),pdfSha256);
  deliveredHtml=markDelivery(deliveredHtml,preview);
  const embedded=Buffer.from(deliveredHtml.match(/<script\b[^>]*\bid="deck-pdf-payload"[^>]*>\s*([A-Za-z0-9+/=\s]+?)\s*<\/script>/i)?.[1].replace(/\s/g,'')||'','base64');
  if(!embedded.equals(pdf))fail('HTML 内嵌 PDF 校验失败');
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(outputHtml,deliveredHtml);
  fs.copyFileSync(inputPdf,outputPdf);
  return {status:preview?'preview':'complete',review:preview?null:reviewPath,html:outputHtml,pdf:outputPdf,pages:htmlPages,pdfBytes:pdf.length,pdfSha256,htmlBytes:Buffer.byteLength(deliveredHtml),audit:auditPath};
}

if(require.main===module){
  const args=process.argv.slice(2),force=args.includes('--force'),preview=args.includes('--preview'),pos=args.filter(v=>!['--force','--preview'].includes(v));
  const [htmlFile,pdfFile,outputDir,baseName]=pos;
  if(!htmlFile||!pdfFile||!outputDir)fail('用法: node scripts/package_delivery.cjs deck.html renders/deck.pdf delivery [文件名] [--force] [--preview]（PDF 同目录需有 audit.json；正式交付还需 review.json）');
  console.log(JSON.stringify(packageDelivery({htmlFile,pdfFile,outputDir,baseName,force,preview}),null,2));
}

module.exports={packageDelivery,injectPdf,markDelivery,pageCountFromHtml,pageCountFromPdf,validateAudit,validateReview};
