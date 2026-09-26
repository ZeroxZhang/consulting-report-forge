/* 对旧/新HTML单独运行影子测量，产物不能作为 acceptance 或审查签署。 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
async function run(input,directory){
 input=fs.realpathSync(input);directory=require('./snapshot_review.cjs').resolveOutput(directory);
 if(fs.existsSync(directory))throw Error('影子测量输出必须是新目录');
 if(directory.startsWith(path.dirname(input)+path.sep))throw Error('影子测量目录须在输入报告目录之外');
 const before=require('./report_contract.cjs').fileHash(input);
 const browser=await require('playwright').chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true});
 const rows=[];
 try{
  fs.mkdirSync(path.dirname(directory),{recursive:true});fs.mkdirSync(directory);const page=await browser.newPage({viewport:{width:1400,height:900}});
  await page.goto(pathToFileURL(input).href,{waitUntil:'networkidle'});await page.evaluate(()=>window.deckReady||document.fonts.ready);
  const count=await page.locator('.slide').count();if(!count)throw Error('没有 slide');
  for(let index=0;index<count;index++){
   await require('./page_probe.cjs').activate(page,index);const slide=page.locator('.slide.active');
   const measurement=await slide.evaluate(require('./browser_reading_audit.cjs').inspectSlide);
   const number=String(index+1).padStart(2,'0'),screenshot='p'+number+'.png';await slide.screenshot({path:path.join(directory,screenshot)});
   const bounds=await slide.boundingBox(),scale=await slide.evaluate(el=>el.getBoundingClientRect().width/el.offsetWidth);
   const crops=[];
   for(const [i,observation] of measurement.observations.slice(0,5).entries()){
    const b=observation.bounds,x=Math.max(0,bounds.x+b.x*scale-15),y=Math.max(0,bounds.y+b.y*scale-15);
    const clip={x,y,width:Math.min(1400-x,b.width*scale+30),height:Math.min(900-y,b.height*scale+30)};
    if(clip.width<=0||clip.height<=0)continue;
    const name='p'+number+'-finding-'+i+'.png';await page.screenshot({path:path.join(directory,name),clip});crops.push({observation:i,path:name});
   }
   rows.push({page:index+1,pageId:await slide.getAttribute('data-page-id'),screenshot,crops,...measurement});
  }
  if(require('./report_contract.cjs').fileHash(input)!==before)throw Error('测量期间原HTML发生变化');
  const result={version:1,mode:'shadow',actualReview:false,input,inputSha256:before,pages:rows.length,observations:rows.reduce((n,r)=>n+r.observations.length,0),rows};
  fs.writeFileSync(path.join(directory,'reading-shadow.json'),JSON.stringify(result,null,2)+'\n');
  return {directory,pages:result.pages,observations:result.observations,actualReview:false};
 }finally{await browser.close();}
}
if(require.main===module){if(process.argv.length!==4){console.error('用法：node scripts/probe_reading_shadow.cjs deck.html 全新输出目录');process.exitCode=1;}else run(...process.argv.slice(2)).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;});}
module.exports={run};
