'use strict';
/* 本轮运行发现的跨阶段回归：只测真实边界，不靠放宽政策解决误报。 */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const lc=require('./layout_contract.cjs'),bp=require('./deck_blueprint.cjs'),pages=require('./check_pages.cjs'),probe=require('./probe_capabilities.cjs'),kit=require('../assets/exhibit-kit.js');
const root=path.resolve(__dirname,'..'),clone=x=>JSON.parse(JSON.stringify(x));
const template=JSON.parse(fs.readFileSync(path.join(root,'templates/deck-blueprint.json')));
assert.throws(()=>probe.parseArgs(['out','--verify']),/答案文件/);
assert.throws(()=>probe.parseArgs(['out','--verify','--help']),/答案文件/);
assert.throws(()=>probe.parseArgs(['out','--verify','a.json','--verify','b.json']),/只能/);
assert.throws(()=>probe.parseArgs(['--unknown']),/未知参数/);
assert.equal(probe.parseArgs(['out','--verify','response.json']).verify,'response.json');
assert.equal(probe.verifyImageResponse({code:'ABC123',shape_left_to_right:['red square']},{code:'ABC123',shape_left_to_right:['红色方块']}).status,'pass');
assert.equal(probe.verifyImageResponse({code:'ABC123',shape_left_to_right:['red square']},{code:'ABC124',shape_left_to_right:['red square']}).status,'fail');
const module10=lc.get('L10').modules[0];
assert.equal(lc.formFit('kit.processFlow',module10,'16x9').fits,false);
assert.equal(lc.formFit('kit.processFlow',module10,'4x3').fits,true);
assert.equal(lc.formFit('kit.processFlow',module10,'4x3',{titled:true}).fits,false);
assert.equal(lc.measure('L10').modules[0].formFits.find(f=>f.form==='kit.processFlow').fits,false);
assert.equal(lc.formFit('kit.processFlow',module10,'4x3',{stages:6}).fits,false);
assert.throws(()=>lc.formFit('kit.processFlow',module10,'16x9',{stages:1}),/至少2/);
for(const ratio of ['16x9','4x3']) for(const layout of lc.list()) for(const m of lc.measure(layout.id,ratio).modules) {
  for(const f of m.formFits.filter(f=>f.required))assert.equal(f.fits,f.available.width>=f.required.width&&f.available.height>=f.required.height);
}
const flow={stages:[{label:'A',owner:'甲',output:'乙',gate:'丙'},{label:'B',owner:'甲',output:'乙',gate:'丙'}],transitions:['通过']};
const minimum=kit.minimumSize('processFlow',{stages:2});
assert.match(kit.processFlow({...flow,...minimum}),/<svg/);
assert.throws(()=>kit.processFlow({...flow,width:minimum.width,height:minimum.height-1}),/最少|至少/);
assert.throws(()=>kit.processFlow({...flow,width:minimum.width-1,height:minimum.height}),/至少/);
const b=clone(template);b.slides[1].visual={...b.slides[1].visual,form:'kit.processFlow',layout:'L10'};
assert.ok(bp.validate(b).errors.some(e=>/最小画布/.test(e)));
b.deck.ratio='4x3';assert.equal(bp.validate(b).status,'PASS');
b.slides[1].visual.sizing={titled:true};assert.ok(bp.validate(b).errors.some(e=>/最小画布/.test(e)));
const claimDeck=clone(template);claimDeck.slides[1].sourcePlan.status='verified';const c=claimDeck.slides[1].sourcePlan.claims[0];
assert.ok(bp.validate(claimDeck,{ready:true}).errors.some(e=>/pending/.test(e)));
c.verification='provided';assert.equal(bp.validate(claimDeck,{ready:true}).status,'PASS');
c.verification='not_applicable';assert.ok(bp.validate(claimDeck).errors.some(e=>/不能免核对/));
c.verification='source_checked';c.sourceKeys=['missing'];assert.ok(bp.validate(claimDeck).errors.some(e=>/未登记/));
c.sourceKeys=claimDeck.slides[1].sourcePlan.keys;c.denominator='';assert.ok(bp.validate(claimDeck).errors.some(e=>/denominator/.test(e)));
const sizedPage={page:1,form:'kit.processFlow',layout:'L10',proves:'两个阶段交接并保留职责。',regions:[{form:'kit.processFlow'},{form:'html.text'}],density:clone(template.slides[1].density)};
assert.ok(pages.check({version:3,pages:[sizedPage]}).errors.some(e=>/最小画布/.test(e)));
assert.equal(pages.check({version:3,ratio:'4x3',pages:[sizedPage]}).status,'PASS');
assert.ok(pages.check({version:3,ratio:'4x3',pages:[sizedPage]},{ratio:'16x9'}).errors.some(e=>/画幅不一致/.test(e)));
const verifier=require('./verify_blueprint_pages.cjs'),sb=clone(template);sb.slides=sb.slides.slice(0,2);sb.slides[1].visual.sizing={titled:true};sb.slides[1].sourcePlan={status:'verified',keys:['S1']};
const sp={version:3,pages:[{page:1,layout:'L01',form:'kit.dumbbell',proves:sb.slides[1].proves,density:sb.slides[1].density,regions:[{form:'kit.dumbbell'},{form:'html.text'}]}]};
assert.ok(verifier.verify(sb,sp).some(e=>/sizing/.test(e)));sp.pages[0].regions[0].sizing={titled:true};assert.deepEqual(verifier.verify(sb,sp),[]);
const legacy={version:1,pages:[{page:1,form:'kit.processFlow',proves:'旧合同不追加入布局尺寸要求。'}]};assert.equal(pages.check(legacy).status,'PASS');
console.log(JSON.stringify({pass:true,scope:'probe arguments, renderer sizing, 38 layouts × 2 ratios, evidence identity, legacy contract'}));

async function browserRegression(){
  const {chromium}=require('playwright'),policy=require('./browser_visual_policy.cjs');
  const browser=await chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true});
  try{
    const p=await browser.newPage({viewport:{width:1400,height:900}});
    const css=['deck-geometry.css','deck-frame.css','consulting-layouts.css'].map(f=>fs.readFileSync(path.join(root,'assets',f),'utf8')).join('\n');
    for(const ratio of ['16x9','4x3']){
      const width=ratio==='16x9'?1280:1024;
      await p.setContent(`<html data-frame="quiet"><head><style>:root{--gray-2:#50606e;--page-bg:#fff;--brand:#000080}.slide{position:relative;width:${width}px;height:720px;padding:32px 40px;box-sizing:border-box}.slide__body{display:grid}.slide__header{width:100%}${css}</style></head><body data-ratio="${ratio}"><section class="slide reading" data-layout="L01" data-frame-boundary="line"><header class="slide__header"><h1 class="slide__title">标准标题边界</h1></header><div class="slide__body"><div data-module="chart">主证据</div><div data-module="annotation">条件</div></div></section></body></html>`);
      const inspect=()=>p.locator('.slide').evaluate(policy.inspectSlide);
      const result=await inspect();assert.ok(!result.errors.some(e=>e.code==='V-DECORATIVE-PSEUDO'),JSON.stringify(result.errors));assert.ok(result.findings.some(e=>e.code==='V-QUIET-HEADER'));
      for(const rule of ['bottom:2px','height:5px','background:#000080','width:100px;right:auto']){
        const s=await p.addStyleTag({content:'.slide__header::after{'+rule+'}'});const changed=await inspect();assert.ok(!changed.findings.some(e=>e.code==='V-QUIET-HEADER'),rule);if(rule!=='bottom:2px')assert.ok(changed.errors.some(e=>e.code==='V-DECORATIVE-PSEUDO'),rule);await s.evaluate(e=>e.remove());
      }
      for(const offset of [-8,0]){const s=await p.addStyleTag({content:'.slide__header::after{bottom:'+offset+'px}'});assert.ok((await inspect()).findings.some(e=>e.code==='V-QUIET-HEADER'));await s.evaluate(e=>e.remove());}
    }
    console.log(JSON.stringify({pass:true,scope:'real Chrome header policy, 16x9/4x3, zero and negative offset, decorated counterexamples'}));
  }finally{await browser.close();}
}
if(process.argv.includes('--browser'))browserRegression().catch(e=>{console.error(e);process.exitCode=1;});
