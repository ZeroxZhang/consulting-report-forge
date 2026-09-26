'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
async function main(){
 const browser=await require('playwright').chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}}),inspect=()=>page.locator('.slide').evaluate(require('./browser_reading_audit.cjs').inspectSlide);
  await page.goto(pathToFileURL(path.resolve(__dirname,'../tests/fixtures/upgrade-reading.html')).href);
  for(const media of ['screen','print']){
   await page.emulateMedia({media});const result=await inspect();const codes=result.observations.map(o=>o.code);
   assert.ok(codes.includes('R-TEXT-OVERLAP'),media+' SVG标签重叠');
   assert.ok(codes.includes('R-SOURCE-OVERLAP'),media+' 表格末行与来源文字相交');
   assert.ok(codes.includes('R-TEXT-CLIPPED'),media+' SVG边界裁字');
   assert.ok(codes.includes('R-TEXT-OCCLUDED'),media+' 不透明矩形覆盖字符');
   assert.equal(result.enforced,false);
  }
  await page.setContent(`<style>body{margin:0}.slide{width:1280px;height:720px;font:20px/30px sans-serif}svg{display:block;margin-top:140px} .source{position:absolute;left:800px;top:100px} .other{position:absolute;left:0;top:100px}</style><section class="slide"><div><p>合法的<strong>行内强调</strong>与嵌套容器。</p></div><div class="other">另一栏文字</div><footer class="source">来源独立在右栏</footer><svg width="400" height="300"><rect x="0" y="30" width="350" height="50" fill="navy"/><text x="30" y="60" fill="white">合法柱内标签</text><text x="60" y="180" transform="rotate(30 60 180)">旋转文字待审</text></svg><canvas width="50" height="50"></canvas></section>`);
  const legal=await inspect();assert.deepEqual(legal.observations,[],'合法包含/行内强调/柱内标签/异栏来源不报警');assert.ok(legal.coverage.unsupported.some(x=>x.reason.includes('旋转')));assert.ok(legal.coverage.unsupported.some(x=>x.reason.includes('位图')));
  console.log(JSON.stringify({pass:true,scope:'synthetic HTML/SVG screen+print, true overlap/clipping/occlusion, legal controls',legalMs:legal.elapsedMs,limit:legal.coverage.scope}));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
