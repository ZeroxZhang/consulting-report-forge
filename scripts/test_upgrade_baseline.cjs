/* 固定旧合同缺口，不将它们伪装成新增检测器已经解决的问题。 */
'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('../tests/fixtures/analysis_fixture.cjs'),analysis=require('./analysis_contract.cjs');
const doc=fixture(),digest=analysis.digest(doc),observed=[];
for(const [name,mutate] of [
  ['exhibit',d=>{d.slides[1].exhibit={value:1.01,denominator:100,encoding:'类别A'};}],
  ['title',d=>{d.slides[1].title='未经登记的实质判断';}],
  ['sidebar',d=>{d.slides[1].sidebar='未经登记的侧栏结论';}]
]){const next=structuredClone(doc);mutate(next);assert.equal(analysis.digest(next),digest);observed.push({case:name,legacy:'NOT_COVERED'});}
const changed=structuredClone(doc);changed.claims[0].statement+='变化';assert.notEqual(analysis.digest(changed),digest);
const rows=['cover','content','references','references','back-cover'].map(role=>({bookends:{role,title:'测试',entries:[],meta:{},clipped:[]}}));
assert.ok(require('./check_bookends.cjs').checkDocument(rows,{kind:'report'}).errors.some(e=>e.includes('恰有一页 references')));
observed.push({case:'multiple-references',legacy:'REJECTED'});
async function main(){
 const font=require('fontkit').openSync(path.resolve(__dirname,'../assets/fonts/inter-400.woff2'));
 assert.deepEqual(require('./font_glyph_coverage.cjs').missing('123',[font]),[]);
 assert.equal(require('./font_glyph_coverage.cjs').missing('123\u{10ffff}',[font])[0].codepoint,'U+10FFFF');
 if(process.argv.includes('--browser')){
  const {chromium}=require('playwright');const browser=await chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true});
  try{
   const page=await browser.newPage({viewport:{width:1400,height:900}});
   await page.goto(require('node:url').pathToFileURL(path.resolve(__dirname,'../tests/fixtures/upgrade-reading.html')).href);
   for(const medium of ['screen','print']){
    await page.emulateMedia({media:medium});
    const result=await page.locator('.slide').evaluate(require('./browser_visual_policy.cjs').inspectSlide);
    assert.equal(result.errors.filter(e=>e.code==='V-DECORATIVE-PSEUDO').length,2,'浅线误报与彩线真阳性均复现');
    assert.ok(result.warnings.some(e=>e.code==='V-SOURCE-COLLISION'),'现有来源区检查已覆盖密表跨区');
    assert.ok(result.findings.some(e=>e.code==='V-RASTER-VECTOR-MANUAL'),'SVG未测范围仍明确待人工');
    const candidate=await page.locator('.slide').evaluate(require('./candidate_structural_lines.cjs').inspectSlide);
    assert.equal(candidate.candidates.filter(c=>c.pseudo).length,1,'只将浅色伪元素线列为候选，彩线仍不豁免');
    assert.equal(candidate.enforced,false);
    const current=await require('./browser_visual_policy.cjs').inspect(page.locator('.slide'),'structural-lines-1');
    assert.equal(current.errors.filter(e=>e.code==='V-DECORATIVE-PSEUDO').length,1,'新政策仅放行浅色线，彩线仍拦截');
    observed.push({case:'reading-fixture',medium,legacyErrors:result.errors,legacyWarnings:result.warnings,svg:'MANUAL_NOT_DETECTED'});
   }
   await page.locator('.legal').evaluate(el=>{el.style.borderBottomColor='#bbcbd6';});
   const blueLegacy=await page.locator('.slide').evaluate(require('./browser_visual_policy.cjs').inspectSlide);
   assert.ok(blueLegacy.errors.some(e=>e.code==='V-DECORATIVE-EDGE'),'真实浅蓝灰边框误报复现');
   const blueCandidate=await page.locator('.slide').evaluate(require('./candidate_structural_lines.cjs').inspectSlide);
   assert.ok(blueCandidate.candidates.some(c=>c.side==='bottom'),'亮度与背景对比识别浅蓝灰1px线');
   assert.ok(!(await require('./browser_visual_policy.cjs').inspect(page.locator('.slide'),'structural-lines-1')).errors.some(e=>e.code==='V-DECORATIVE-EDGE'));
   const fontAudit=require('./browser_font_audit.cjs');
   const data=require('node:fs').readFileSync(path.resolve(__dirname,'../assets/fonts/inter-400.woff2')).toString('base64');
   const family=require('fontkit').create(Buffer.from(data,'base64')).familyName;
   await fontAudit.attach(page);
   await page.setContent(`<html data-typography="sans-presentation" data-font-status="ready"><style>@font-face{font-family:'Numeric';src:url(data:font/woff2;base64,${data})}p{font-family:'Numeric';font-weight:400;font-style:normal}</style><script id="deck-font-manifest" type="application/json">${JSON.stringify({faces:[{family:'Deck Inter',platform_families:['Different Expected Family']}]})}</script><section class="slide active"><p>123</p></section></html>`);
   await page.evaluate(()=>document.fonts.load('400 20px Numeric','123'));
   const custom=await fontAudit.inspect(page);
   assert.equal(custom.identity,'FAIL');
   assert.ok(custom.unexpected[0].fonts.some(f=>f.isCustomFont&&f.familyName===family));
   assert.ok(custom.unexpected[0].diagnostics.some(d=>d.code==='F-CUSTOM-ROLE'));
   assert.ok(!fontAudit.describe(custom).includes('系统回退'));
   await page.locator('p').evaluate(el=>{el.style.fontFamily='Arial';});
   assert.ok((await fontAudit.inspect(page)).unexpected[0].diagnostics.some(d=>d.code==='F-SYSTEM-FALLBACK'));
   await page.evaluate(()=>{document.documentElement.dataset.fontStatus='error';});
   assert.ok((await fontAudit.inspect(page)).diagnostics.some(d=>d.code==='F-LOAD-STATE'));
   observed.push({case:'font-classification',loadedCustom:'ROLE_MISMATCH',system:'SYSTEM_FALLBACK',load:'LOAD_STATE',glyphCoverage:'UNKNOWN'});
  }finally{await browser.close();}
 }
 console.log(JSON.stringify({pass:true,fixtureOrigin:'reconstructed-not-historical',observed},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
