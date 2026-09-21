'use strict';
/* 用真实渲染器与浏览器节点核对：两张都闭合的图不能冒认同一个权威输入。 */
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const W=require('./waterfall_contract.cjs'), B=require('../assets/waterfall-bridge.js');
const probe=require('./page_probe.cjs'), pages=require('./check_pages.cjs');
const input={items:[{label:'基期',type:'start',value:100},{label:'增量',type:'delta',value:20},{label:'本期',type:'end',value:120}],
  config:{mode:'bridge',metric:'收入',metric_type:'currency',unit:'万元',source:'合成测试'}};
const clone=v=>JSON.parse(JSON.stringify(v));
function block(spec){const chart=W.diagnoseSpec(spec).chart;return {waterfall:{status:'verified',input:spec,reconciliation:chart.reconciliation,tolerance:chart.tolerance,nodes:chart.bars.length,residual:chart.residual}};}
async function main(){
  const browser=await chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true});let checks=0;
  try{
    const page=await browser.newPage();
    const inspect=async(spec,renderer,form='kit.waterfall')=>{
      const svg=W.renderSpec({...spec,renderer},W.diagnoseSpec(spec));
      await page.setContent('<section class="slide active" data-form="'+form+'">'+svg+'</section>');
      return page.locator('.slide').evaluate(probe.inspectDom,probe.WF_FORMS);
    };
    for(const renderer of ['kit','precision']){
      for(const form of ['kit.waterfall','svg.custom']){
        const facts=await inspect(input,renderer,form);
        assert.deepEqual(pages.waterfallMismatches(facts,block(input),1),[]);checks++;
      }
      const other=clone(input);other.items[1].value=70;other.items[2].value=170;
      let facts=await inspect(other,renderer);
      assert.ok(pages.waterfallMismatches(facts,block(input),1).some(e=>/内核模型/.test(e)));checks++;
      // 即使把轴上的模型换回去，实际柱子的节点属性仍须匹配。
      await page.locator('[data-role="reconciliation"]').evaluate((e,model)=>e.setAttribute('data-waterfall-model',model),B.auditModel(W.diagnoseSpec(input).chart));
      facts=await page.locator('.slide').evaluate(probe.inspectDom,probe.WF_FORMS);
      assert.ok(pages.waterfallMismatches(facts,block(input),1).some(e=>/实际柱节点/.test(e)));checks++;
      const zero=clone(input);zero.items[1].value=0;zero.items[2].value=100;
      facts=await inspect(zero,renderer);
      assert.deepEqual(pages.waterfallMismatches(facts,block(zero),1),[]);checks++;
      // 历史无 input 的合同仍只使用其原有对账字段。
      const historical=block(zero);delete historical.waterfall.input;
      await page.locator('[data-role="reconciliation"]').evaluate(e=>e.removeAttribute('data-waterfall-model'));
      facts=await page.locator('.slide').evaluate(probe.inspectDom,probe.WF_FORMS);
      assert.deepEqual(pages.waterfallMismatches(facts,historical,1),[]);checks++;
    }
    const impossible=clone(input);impossible.items=[{label:'交易额',type:'start',value:100},{label:'退货',type:'delta',value:-18},{label:'创作者',type:'delta',value:-15},{label:'收入',type:'end',value:5}];
    assert.notEqual(W.diagnoseSpec(impossible).status,'ready');checks++;
    console.log(JSON.stringify({pass:true,checks,scope:'两个真实渲染器、节点身份与模型、零增量、自绘语义、历史兼容、错误桥接拒绝'}));
  }finally{await browser.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
