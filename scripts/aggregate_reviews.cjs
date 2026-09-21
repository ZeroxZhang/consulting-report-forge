/* 一份review核对真实返回：自然语言、缺页、范围收窄均保留为未完成。 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const contract=require('./report_contract.cjs');
const reviewContract=require('./review_contract.cjs');
const layers=['page','exhibit','annotation','typography'];
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function inspectCoverage(review,{htmlSha256,pdfSha256,pages,requireIndependent=false,baseDir=process.cwd()}){
 const errors=[];
 if(review.htmlSha256!==htmlSha256||review.pdfSha256!==pdfSha256)errors.push('审查对应旧版HTML/PDF');
 if(!Array.isArray(review.coverage)||!review.coverage.length)return [...errors,'缺少实际页集合与四层覆盖'];
 const valid=[];
 for(const [i,c] of review.coverage.entries()){
  const tag='coverage '+i;
  if(!c||!['author','independent'].includes(c.independence)||typeof c.reviewer!=='string'||!c.reviewer.trim()){errors.push(tag+'审查身份缺失');continue;}
  if(!Array.isArray(c.layers)||layers.some(l=>!c.layers.includes(l)))errors.push(tag+'四层检查范围不完整');
  for(const medium of ['htmlPages','pdfPages']){
   const set=c[medium];
   if(!Array.isArray(set)||new Set(set).size!==set.length||set.some(n=>!Number.isInteger(n)||n<1||n>pages))errors.push(tag+' '+medium+'集合无效');
  }
  if(!Array.isArray(c.evidence)||!c.evidence.length)errors.push(tag+'缺少实际图像证据');
  else for(const evidence of c.evidence){
   if(!evidence||typeof evidence.path!=='string'||typeof evidence.sha256!=='string'){errors.push(tag+'证据格式错误');continue;}
   const p=path.resolve(baseDir,evidence.path);
   if(!fs.statSync(p,{throwIfNoEntry:false})?.isFile()||sha(p)!==evidence.sha256)errors.push(tag+'证据缺失或已变更：'+evidence.path);
  }
  valid.push(c);
 }
 for(const role of requireIndependent?['author','independent']:['all'])for(const medium of ['htmlPages','pdfPages']){
  const seen=new Set(valid.filter(c=>role==='all'||c.independence===role).flatMap(c=>c[medium]||[]));
  const missing=Array.from({length:pages},(_,i)=>i+1).filter(i=>!seen.has(i));
  if(missing.length)errors.push(role+' '+medium+'缺页：'+missing.join(','));
 }
 return errors;
}
function aggregateCurrent(audit,inputs,{baseDir=process.cwd(),auditDir=baseDir,inputDirs=[]}={}){
 baseDir=fs.realpathSync(baseDir);auditDir=fs.realpathSync(auditDir);inputDirs=inputDirs.map(dir=>fs.realpathSync(dir));
 const errors=[],coverage=[],issues=[],dispositions=[],priorReviews=new Map(),values={analysis:[],evidence:[],visual:[]};
 for(const [i,raw] of inputs.entries()){
  let result=raw;
  if(typeof raw==='string')try{result=JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{errors.push('结果'+i+'为未解析自然语言，须解析核对或补查');continue;}
  let found;
  try{found=reviewContract.validate(result,audit,{baseDir:inputDirs[i]||baseDir,auditDir,partial:true});}
  catch(e){found=['审查合同无效：'+e.message];}
  errors.push(...found.map(e=>'结果'+i+'：'+e));
  if(!result||typeof result!=='object')continue;
  if(result.priorReview&&typeof result.priorReview==='object'){
   const prior=JSON.parse(JSON.stringify(result.priorReview));
   for(const key of ['audit','review'])if(typeof prior[key]?.path==='string')prior[key].path=path.relative(baseDir,path.resolve(inputDirs[i]||baseDir,prior[key].path));
   const key=contract.stable({audit:prior.audit,review:prior.review,reviewScope:prior.reviewScope||'complete'});
   if(!priorReviews.has(key))priorReviews.set(key,prior);
  }
  for(const c of Array.isArray(result.coverage)?result.coverage:[]){
   if(!c||typeof c!=='object')continue;
   const copy=JSON.parse(JSON.stringify(c));
   // 输入review可在独立目录；继承文件路径必须保留原始解析基准。
   for(const key of ['audit','review'])if(typeof copy.inheritedFrom?.[key]?.path==='string')copy.inheritedFrom[key].path=path.relative(baseDir,path.resolve(inputDirs[i]||baseDir,copy.inheritedFrom[key].path));
   coverage.push(copy);
  }
  issues.push(...(Array.isArray(result.issues)?result.issues:[]));
  // 告警处置是逐份输入各自提供的，聚合时并集；覆盖不全会由审查合同点名。
  dispositions.push(...(Array.isArray(result.warningReview)?result.warningReview:[]));
  for(const key of Object.keys(values))if(result.checks?.[key])values[key].push(result.checks[key]);
 }
 const checks={};
 for(const [key,items] of Object.entries(values)){
  const allowed=key==='visual'?['pass']:['pass','not_applicable'];
  checks[key]={status:items.length&&items.every(c=>allowed.includes(c.status))?(items.some(c=>c.status==='pass')?'pass':'not_applicable'):'not_reviewed',basis:[...new Set(items.map(c=>c.basis).filter(v=>typeof v==='string'&&v.trim()))].sort().join('\n')};
 }
 const sorted=items=>items.sort((a,b)=>contract.stable(a).localeCompare(contract.stable(b)));
 const review={schemaVersion:3,status:'complete',reviewer:[...new Set(coverage.map(c=>c.reviewer).filter(v=>typeof v==='string'))].sort().join('; '),independence:coverage.some(c=>c.independence==='independent')?'independent':'author',htmlSha256:audit.htmlArtifact?.sha256,pdfSha256:audit.pdfArtifact?.sha256,auditSha256:contract.hash(contract.stable(audit)),coverage:sorted(coverage),warningReview:sorted([...new Map(dispositions.filter(w=>w&&typeof w.warning==='string').map(w=>[w.warning,w])).values()]),checks,issues:sorted([...new Map(issues.map(issue=>[contract.stable(issue),issue])).values()])};
 if(priorReviews.size===1)review.priorReview=[...priorReviews.values()][0];
 else if(priorReviews.size>1)errors.push('同轮审查的 priorReview 来源不一致，须明确同一前序审查后再聚合');
 // 迭代/冒烟档的 audit 没有证据清单，聚不出可交付的 review；这里点名说清，避免只看到"缺证据"。
 if((audit.tier??'acceptance')!=='acceptance'||audit.acceptance?.complete===false)errors.push('audit 来自 '+(audit.tier??'acceptance')+' 档（未跑完的检查：'+((audit.acceptance?.missingStages||[]).join('、')||'不完整')+'），只有验收档能作为审查与交付依据');
 try{errors.push(...reviewContract.validate(review,audit,{baseDir,auditDir}));}catch(e){errors.push('审查合同无效：'+e.message);}
 review.aggregationErrors=[...new Set(errors)].sort();review.status=errors.length?'incomplete':'complete';return review;
}
function aggregate(audit,inputs,{baseDir=process.cwd(),auditDir=baseDir,inputDirs=[],requireIndependent=contract.requiresIndependent(audit)}={}){
 if(audit.documentContract?.reliability==='2')return aggregateCurrent(audit,inputs,{baseDir,auditDir,inputDirs});
 const errors=[],coverage=[],issues=[],checks={};
 for(const [i,raw] of inputs.entries()){
  let result=raw;
  if(typeof raw==='string')try{result=JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g,''));}catch{errors.push('结果'+i+'为未解析自然语言，须解析核对或补查');continue;}
  if(!result||!Array.isArray(result.coverage)||!Array.isArray(result.issues)){errors.push('结果'+i+'格式不完整，不能视为空问题');continue;}
  if(result.status!=='complete')errors.push('结果'+i+'状态未完成：'+String(result.status??'missing'));
  if(result.htmlSha256!==audit.htmlArtifact.sha256||result.pdfSha256!==audit.pdfArtifact.sha256){errors.push('结果'+i+'版本不匹配');continue;}
  coverage.push(...result.coverage);issues.push(...result.issues);
  for(const key of ['analysis','evidence','visual']){
   const c=result.checks?.[key];
   if(!c||!['pass','not_applicable'].includes(c.status)||(key==='visual'&&c.status!=='pass')||typeof c.basis!=='string'||!c.basis.trim()){errors.push('结果'+i+' '+key+'未通过或缺少本份结果依据');continue;}
   const merged=checks[key]??={status:c.status,basis:''};
   if(c.status==='pass')merged.status='pass';
   merged.basis=[...new Set([...merged.basis.split('\n'),c.basis].filter(Boolean))].sort().join('\n');
  }
 }
 const review={schemaVersion:2,status:'incomplete',reviewer:[...new Set(coverage.map(c=>c.reviewer))].join('; '),independence:coverage.some(c=>c.independence==='independent')?'independent':'author',htmlSha256:audit.htmlArtifact.sha256,pdfSha256:audit.pdfArtifact.sha256,coverage,checks,issues};
 errors.push(...inspectCoverage(review,{htmlSha256:review.htmlSha256,pdfSha256:review.pdfSha256,pages:audit.pages,baseDir,requireIndependent}));
 for(const key of ['analysis','evidence','visual'])if(!checks[key]?.basis?.trim())errors.push('缺少'+key+'审查结果');
 for(const issue of issues){if(!issue||!['minor','major','blocking'].includes(issue.severity)||!['open','resolved'].includes(issue.status)||!issue.description?.trim())errors.push('问题格式不完整');else if(issue.severity!=='minor'&&issue.status==='open')errors.push('未解决：'+issue.description);}
 review.aggregationErrors=errors;review.status=errors.length?'incomplete':'complete';return review;
}
if(require.main===module){
 try{const [auditFile,output,...files]=process.argv.slice(2);if(!files.length)throw Error('用法：node aggregate_reviews.cjs audit.json review.json author.json independent.json');
 const audit=JSON.parse(fs.readFileSync(auditFile,'utf8'));
 const review=aggregate(audit,files.map(f=>fs.readFileSync(f,'utf8')),{baseDir:path.dirname(path.resolve(output)),auditDir:path.dirname(path.resolve(auditFile)),inputDirs:files.map(f=>path.dirname(path.resolve(f)))});
 fs.writeFileSync(output,JSON.stringify(review,null,2));console.log(JSON.stringify({status:review.status,errors:review.aggregationErrors}));if(review.status!=='complete')process.exitCode=1;
 }catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={aggregate,inspectCoverage,layers};
