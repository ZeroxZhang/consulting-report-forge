/* 检查已有page_spec中的加载、实际规划、成稿落实；不代替模型作出选择。 */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFileSync}=require('node:child_process');
const {loadPlanner}=require('./load_viz_planner.cjs');
const digest=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function check(record,page,{baseDir=process.cwd()}={}){
 const errors=[],states={loaded:false,planned:false,implemented:false};
 const resolve=f=>path.resolve(baseDir,f);
 function bound(entry,name){
  if(!entry||typeof entry.path!=='string'||typeof entry.sha256!=='string'){errors.push(name+'缺少路径/版本');return null;}
  const file=resolve(entry.path);
  if(!fs.statSync(file,{throwIfNoEntry:false})?.isFile()||digest(file)!==entry.sha256){errors.push(name+'文件缺失或版本改变');return null;}return file;
 }
 const data=bound(record.data,'data');
 let resource;
 if(!record.planner?.root)errors.push('缺少实际planner加载来源');
 else{
  resource=loadPlanner({planner:resolve(record.planner.root),offline:true});
  states.loaded=resource.status==='ok'&&path.resolve(resource.skill_root)===resolve(record.planner.root)&&resource.source_sha256===record.planner.sourceSha256;
  if(!states.loaded)errors.push('planner实际资源与记录不符');
 }
 const plans=Array.isArray(record.plans)?record.plans:[];
 if(!plans.length)errors.push('仅加载不等于规划：缺少实际plan结果');
 for(const [i,entry] of plans.entries()){
  const file=bound(entry,'plan '+i);if(!file||!states.loaded)continue;
  try{
   execFileSync(process.env.PLANNER_PYTHON||'python3',[path.join(resource.skill_root,'scripts/validate_plan.py'),file,'--schema'],{encoding:'utf8',maxBuffer:2e6});
   const plan=JSON.parse(fs.readFileSync(file,'utf8'));
   if(!['ok','ok_with_assumptions'].includes(plan.status)||!Array.isArray(plan.plan)||!plan.plan.length)throw Error('plan尚不能用于制作');
   const ref=plan.data?.ref;
   if(ref?.type!=='file'||typeof ref.id!=='string'||!ref.id.trim())throw Error('执行核对要求plan.data.ref为可核对的本地数据文件');
   const input=path.resolve(path.dirname(file),ref.id.split('#')[0]);
   if(!data||!fs.statSync(input,{throwIfNoEntry:false})?.isFile()||fs.realpathSync(input)!==fs.realpathSync(data))throw Error('plan引用的数据不是record.data的同一实际文件');
   if(typeof plan.data.sha256!=='string'||plan.data.sha256!==record.data.sha256||digest(input)!==plan.data.sha256)throw Error('plan.data.sha256与当前数据版本不一致或缺失；不能复用旧规划');
  }catch(e){errors.push('plan '+i+'校验失败：'+e.message.slice(0,500));}
 }
 states.planned=states.loaded&&!!data&&plans.length>0&&!errors.length;
 const pages=record.pages||[];
 const adopted=new Set();
 for(const spec of pages){
  const slide=page.locator('.slide').nth(spec.page-1);
  if(!Number.isInteger(spec.page)||spec.page<1||spec.page>await page.locator('.slide').count()){errors.push('page_spec页号无效');continue;}
  if(!spec.proves||!spec.roles||!Array.isArray(spec.readingOrder)||!spec.readingOrder.length||!Array.isArray(spec.alignment))errors.push('第'+spec.page+'页缺少四项构图决定');
  if(spec.plan===undefined){if(!spec.directReason)errors.push('第'+spec.page+'页缺少采纳plan或直接制作理由');continue;}
  if(!Number.isInteger(spec.plan)||spec.plan<0||spec.plan>=plans.length){errors.push('第'+spec.page+'页引用无效plan');continue;}
  adopted.add(spec.plan);
  if(!Array.isArray(spec.relationships)||!spec.relationships.length){errors.push('第'+spec.page+'页没有可核对的成稿关系');continue;}
  // 每页显示后检查实际图元，不能由隐藏节点或仅有声明的规格冒充成稿。
  await page.keyboard.press('Home');for(let i=1;i<spec.page;i++)await page.keyboard.press('ArrowRight');
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  for(const relation of spec.relationships){
   try{const seen=await slide.locator(relation.selector).evaluateAll(es=>es.filter(e=>{const r=e.getBoundingClientRect();if(!(r.width>0&&r.height>0))return false;for(let n=e;n&&n.nodeType===1;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||Number(s.opacity)===0||s.contentVisibility==='hidden')return false;}return true;}).length);
    if(!relation.meaning||!Number.isInteger(relation.minCount)||relation.minCount<1||seen<relation.minCount)errors.push('第'+spec.page+'页关系未落实：'+relation.selector);
   }catch(e){errors.push('成稿关系选择器无效：'+e.message.slice(0,120));}
  }
 }
 if(plans.some((_,i)=>!adopted.has(i)))errors.push('有plan未映射到实际成稿');
 states.implemented=states.planned&&adopted.size===plans.length&&!errors.length;
 return {status:errors.length?'FAIL':'PASS',states,errors,dataSha256:record.data?.sha256,planSha256:plans.map(p=>p.sha256),scope:'验证文件版本、决策schema及可见图元存在；关系含义、证据和构图仍需四层看图'};
}
if(require.main===module){(async()=>{
 const [file,html]=process.argv.slice(2);if(!file||!html)throw Error('用法：node check_planner_execution.cjs page_spec.json deck.html');
 const pw=require(process.env.PLAYWRIGHT_MODULE||'playwright'),browser=await pw.chromium.launch({channel:'chrome',headless:true});
 try{const p=await browser.newPage();await p.goto(require('node:url').pathToFileURL(path.resolve(html)).href);await p.evaluate(()=>window.deckReady||document.fonts.ready);const r=await check(JSON.parse(fs.readFileSync(file,'utf8')),p,{baseDir:path.dirname(path.resolve(file))});console.log(JSON.stringify(r,null,2));if(r.status!=='PASS')process.exitCode=1;}finally{await browser.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});}
module.exports={check};
