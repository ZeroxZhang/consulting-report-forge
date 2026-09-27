/* 真实渲染器、屏幕和打印探针回归；不以声明字段替代实际图形。 */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const kit=require('../assets/exhibit-kit.js');
const W=require('./waterfall_contract.cjs');
const probe=require('./page_probe.cjs');
const pages=require('./check_pages.cjs');
const clone=v=>JSON.parse(JSON.stringify(v));
const scale={domain:[0,100],unit:'万元',scaleType:'linear'};
const input={items:[{label:'基期',type:'start',value:100},{label:'增量',type:'delta',value:20},{label:'本期',type:'end',value:120}],config:{mode:'bridge',metric:'收入',metric_type:'currency',unit:'万元',source:'合成测试'}};
async function main(){
 const browser=await chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true});let checks=0;
 const pass=(label,condition)=>{assert.ok(condition,label);checks++;};
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}});
  const read=async()=>({...await page.locator('.slide').evaluate(probe.inspectDom,probe.WF_FORMS),page:1,waterfallScope:'panel'});
  const mount=async(a,b,form)=>page.setContent('<style>.slide{width:1280px} [data-panel-id]{display:inline-block;vertical-align:top} @media print{.print-hide{display:none}}</style><section class="slide active" data-form="'+form+'"><div class="slide__body"><div data-panel-id="main">'+a+'</div><div data-panel-id="support">'+b+'</div></div></section>');
  const plan=(form,panels,extra={})=>({version:1,blueprintSchemaVersion:3,pages:[{form,capacity:panels.main.capacity,composition:{panels,...extra}}]});
  const dumb=(n,options={})=>kit.dumbbell({width:600,height:400,unit:'万元',domain:[0,100],items:Array.from({length:n},(_,i)=>({label:'对象'+i,start:10+i,end:50+i})),...options});
  const panels={main:{form:'kit.dumbbell',capacity:{items:2},scale},support:{form:'kit.dumbbell',capacity:{items:5},scale}};
  const groups={scaleGroups:{shared:{panelRefs:['main','support'],mode:'shared',check:'auto',basis:'两个面板同口径同量尺直接比较长度。',...scale}}};
  const doc=plan('kit.dumbbell',panels,groups);
  for(const medium of ['screen','print']){
   await page.emulateMedia({media:medium});
   await mount(dumb(2),dumb(5),'kit.dumbbell');
   assert.deepEqual(pages.verifyDeck(doc,[await read()]),[],medium+' 合法2+5不套用主图容量');checks++;
   const limited=clone(doc);limited.pages[0].composition.panels.support.capacity.items=4;
   pass(medium+' 次图超计划准确定位',pages.verifyDeck(limited,[await read()]).some(e=>e.includes('panel support')&&e.includes('items=5')));
   for(const [label,opts] of [['范围',{domain:[0,200]}],['单位',{unit:'美元'}],['像素映射',{width:550}]]){
    await mount(dumb(2),dumb(5,opts),'kit.dumbbell');
    pass(medium+' 实际'+label+'不一致被拦',pages.verifyDeck(doc,[await read()]).some(e=>e.includes('scaleGroup shared')&&e.includes('support')));
   }
   await mount(dumb(2),dumb(5),'kit.dumbbell');
   await page.locator('[data-panel-id="support"] circle[data-role="end"]').first().evaluate(e=>e.setAttribute('cx',Number(e.getAttribute('cx'))+20));
   pass(medium+' 篡改真实点坐标被拦',pages.verifyDeck(doc,[await read()]).some(e=>e.includes('实际量尺测量')));
   await mount(dumb(2),dumb(5),'kit.dumbbell');
   await page.locator('[data-panel-id="support"] svg').evaluate(e=>e.removeAttribute('data-scale'));
   pass(medium+' 缺量尺元数据被拦',pages.verifyDeck(doc,[await read()]).some(e=>e.includes('实际量尺测量')));
   const manual=clone(doc);manual.pages[0].composition.scaleGroups.shared={panelRefs:['main','support'],mode:'independent',check:'manual',basis:'量纲不同分别读取，两图不可直接比较长度。'};
   const warnings=[];assert.deepEqual(pages.verifyDeck(manual,[await read()],{warnings}),[]);checks++;
   pass(medium+' 人工项保留组和panel身份',warnings.some(w=>w.includes('scaleGroup shared [main,support]')&&w.includes('自动未覆盖')));
  }
  /* 第二个量尺适配器：slope 把值映射到纵轴，与 dumbbell 的横轴不能共用同一套判据。
     适配器表分派错误会表现为"swlope 的量尺永远核不上"或"横向图按纵轴判而恒过"，两种都要挡住。 */
  {
   const slope=(n,opts={})=>kit.slope({width:600,height:400,unit:'万元',domain:[0,100],items:Array.from({length:n},(_,i)=>({label:'对象'+i,start:10+i,end:50+i})),...opts});
   const slopePanels={main:{form:'kit.slope',capacity:{items:2},scale},support:{form:'kit.slope',capacity:{items:5},scale}};
   const slopeDoc=plan('kit.slope',slopePanels,groups);
   for(const medium of ['screen','print']){
    await page.emulateMedia({media:medium});
    await mount(slope(2),slope(5),'kit.slope');
    const facts=await read();
    pass(medium+' slope 量尺被实际测量',Number.isFinite(facts.exhibits[0]?.scale?.pixelSpan)&&facts.exhibits[0].scale.adapter==='kit.slope-v1');
    assert.deepEqual(pages.verifyDeck(slopeDoc,[facts]),[],medium+' slope 共同量尺通过');checks++;
    await page.locator('[data-panel-id="support"] circle[data-role="end"]').first().evaluate(e=>e.setAttribute('cy',Number(e.getAttribute('cy'))+20));
    pass(medium+' slope 篡改纵坐标被拦',pages.verifyDeck(slopeDoc,[await read()]).some(e=>e.includes('实际量尺测量')));
    await mount(slope(2),slope(5),'kit.slope');
    await page.locator('[data-panel-id="support"] svg').evaluate(e=>e.setAttribute('data-scale',decodeURIComponent(e.getAttribute('data-scale')).replace('"axis":"y"','"axis":"x"')));
    pass(medium+' 轴声明与适配器不符被拦',pages.verifyDeck(slopeDoc,[await read()]).some(e=>e.includes('实际量尺测量')));
   }
   await page.emulateMedia({media:'screen'});
  }
  // HTML形式也必须按本panel计数，不能把旁边组件算入主图。
  const cards=n=>Array.from({length:n},()=>'<div class="kpi-card">100</div>').join('');
  const finding=n=>'<div class="finding"><div class="finding__verdict">判断</div><div class="finding__limit">限定</div>'+Array.from({length:n},()=>'<div class="finding__step"><span class="finding__label">依据</span><span class="finding__why">解释</span></div>').join('')+'</div>';
  for(const [form,render] of [['html.kpi',cards],['html.finding',finding]]){
   const d=plan(form,{main:{form,capacity:{items:3}},support:{form,capacity:{items:4}}});
   await mount(render(3),render(4),form);assert.deepEqual(pages.verifyDeck(d,[await read()]),[]);checks++;
   d.pages[0].composition.panels.support.capacity.items=3;
   pass(form+'次图超计划定位',pages.verifyDeck(d,[await read()]).some(e=>e.includes('panel support')&&e.includes('items=4')));
  }
  // 两张不同桥各自绑定权威输入；篡改第二张不能借第一张的正确结果通过。
  const second=clone(input);second.items[0].value=50;second.items[1].value=-5;second.items[2].value=45;
  for(const renderer of ['kit','precision']){
   const form=renderer+'.waterfall';
   const wfDoc=plan(form,{main:{form,capacity:{nodes:3},waterfall:{input}},support:{form,capacity:{nodes:3},waterfall:{input:second}}});
   const svg=spec=>W.renderSpec({...spec,renderer},W.diagnoseSpec(spec));
   for(const medium of ['screen','print']){
    await page.emulateMedia({media:medium});
    const reset=()=>mount(svg(input),svg(second),form);
    await reset();assert.deepEqual(pages.verifyDeck(wfDoc,[await read()]),[],renderer+' '+medium+' 两桥各自正确');checks++;
    for(const [attr,value] of [['data-residual','999'],['data-tolerance','999'],['data-waterfall-model','tampered'],['data-nodes','99']]){
     await reset();await page.locator('[data-panel-id="support"] [data-role="reconciliation"]').evaluate((e,p)=>e.setAttribute(...p),[attr,value]);
     pass(renderer+' '+medium+' 第二桥 '+attr,pages.verifyDeck(wfDoc,[await read()]).some(e=>e.includes('panel support')));
    }
    await reset();await page.locator('[data-panel-id="support"] [data-from][data-to]').first().evaluate(e=>e.setAttribute('data-to','999'));
    pass('第二桥实际柱被篡改',pages.verifyDeck(wfDoc,[await read()]).some(e=>e.includes('panel support')&&e.includes('实际柱节点')));
    await reset();await page.locator('[data-panel-id="support"] [data-role="reconciliation"]').evaluate(e=>e.remove());
    pass('第二桥缺对账轴',pages.verifyDeck(wfDoc,[await read()]).some(e=>e.includes('panel support')&&e.includes('对账轴')));
    await reset();await page.locator('[data-panel-id="support"] [data-role="reconciliation"]').evaluate(e=>e.after(e.cloneNode(true)));
    pass('同panel重复对账轴',pages.verifyDeck(wfDoc,[await read()]).some(e=>e.includes('panel support')&&e.includes('恰有')));
    await reset();const wrongInput=clone(wfDoc);wrongInput.pages[0].composition.panels.support.waterfall.input=input;
    pass('第二桥绑定不同权威输入被拦',pages.verifyDeck(wrongInput,[await read()]).some(e=>e.includes('panel support')&&e.includes('内核模型')));
    await reset();const facts=await read();facts.waterfallScope='page';
    pass('旧策略仍拒绝双桥',probe.waterfallErrors(facts).some(e=>e.code==='WF-MULTIPLE-AUDIT'&&e.fatal));
   }
   await page.emulateMedia({media:'screen'});await mount(svg(input),svg(second),form);
   await page.locator('[data-panel-id="support"]').evaluate(e=>e.classList.add('print-hide'));
   assert.deepEqual(pages.verifyDeck(wfDoc,[await read()]),[]);checks++;
   await page.emulateMedia({media:'print'});
   pass('打印隐藏次图被拦',pages.verifyDeck(wfDoc,[await read()]).some(e=>e.includes('panel support')));
  }
  // 实际走一次PDF打印；探针对打印媒介的拒绝不依赖截图猜测。
  const pdf=await page.pdf({width:'1280px',height:'900px'});pass('实际PDF输出',pdf.subarray(0,5).toString()==='%PDF-');
  console.log(JSON.stringify({pass:true,checks,scope:'screen/print、同型独立容量、真实量尺/像素映射、双瀑布逐节点对账、旧策略冻结、PDF打印'}));
 }finally{await browser.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
