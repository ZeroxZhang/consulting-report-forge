/* 单页焦点的真实浏览器反例：收束节点、副标题复述、字号越级、主展品失焦。
   测量走 page_probe，判定走 narrative_contract——两者都是生产路径上的同一份实现。 */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const probe=require('./page_probe.cjs');
const pages=require('./check_pages.cjs');
const caps=require('./contract_capabilities.cjs');

const NARRATIVE='narrative-focus-1';
const LEGACY='structural-lines-1';
const TITLE='销量下滑集中在商超，其他渠道没有同步下滑';
const LEAD_SCOPE='单位：万台｜期间：2025 全年 vs 2024 同口径';
const TAKEAWAY='先在高信号渠道试点，以增量测量决定是否扩张';

const slideHtml=({takeaways=1,lead=LEAD_SCOPE,takeaway=TAKEAWAY,bodyFont=16,mainWidth='70%',sideWidth='20%'})=>`
<style>.slide{width:1280px;height:720px}.slide__title{font-size:32px}.slide__lead{font-size:15px}
[data-panel-id]{display:inline-block;vertical-align:top;background:#f7f8fa}
[data-panel-id="main"]{width:${mainWidth};height:320px}[data-panel-id="side"]{width:${sideWidth};height:320px}</style>
<section class="slide active" data-form="html.text">
  <header class="slide__header"><h1 class="slide__title">${TITLE}</h1><p class="slide__lead">${lead}</p></header>
  <div class="slide__body">
    <div data-panel-id="main"><p style="font-size:${bodyFont}px">主展品正文，承担本页唯一的判断。</p></div>
    <div data-panel-id="side"><p style="font-size:14px">口径与分母。</p></div>
  </div>
  ${Array.from({length:takeaways},(_,i)=>`<div class="takeaway" data-reading-role="takeaway">${i===0?takeaway:'第二个收束点'}</div>`).join('')}
</section>`;

function planDoc(panelRefs={main:'main',side:'side'}){
  return {version:4,blueprintSchemaVersion:3,ratio:'16x9',
    pages:[{page:1,id:'p1',form:'html.text',
      regions:[{slot:'main',role:'primary',panelRef:panelRefs.main},{slot:'aside',role:'evidence',panelRef:panelRefs.side}],
      composition:{panels:{},relations:[]}}]};
}

async function main(){
  const browser=await chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true});
  let checks=0;
  const pass=(label,condition)=>{assert.ok(condition,label);checks++;};
  const fail=(label,condition)=>{assert.ok(condition,label);checks++;};
  try{
    const page=await browser.newPage({viewport:{width:1400,height:900}});
    const read=async(policy=NARRATIVE)=>{
      const facts={...await page.locator('.slide').evaluate(probe.inspectDom,probe.WF_FORMS),page:1,policyName:policy};
      return facts;
    };
    const mount=async(options,policy=NARRATIVE)=>{await page.setContent(slideHtml(options));return read(policy);};

    for(const medium of ['screen','print']){
      await page.emulateMedia({media:medium});

      /* 正例：恰一个收束节点、副标题写口径、字号低于标题 —— 焦点合同不得报错。 */
      const good=await mount({});
      pass(medium+' 合法页采集到收束节点',good.focus.takeaways===1);
      pass(medium+' 收束节点文字被采集',good.focus.takeawayText===TAKEAWAY);
      const warnings=[];
      const clean=pages.verifyDeck(planDoc(),[good],{warnings});
      fail(medium+' 合法页不报焦点错误',!clean.some(e=>/takeaway|收束/.test(e)));
      pass(medium+' 合法页不报焦点诊断',!warnings.some(w=>/N-LEAD-REPEATS-TITLE|N-BODY-LARGER|N-PRIMARY/.test(w)));

      if(medium==='screen'){
        /* 反例 1：没有收束节点。内容再多，读者也不知道这一页要记住什么。 */
        const none=await mount({takeaways:0});
        const empty=pages.verifyDeck(planDoc(),[none],{warnings:[]});
        pass('缺收束节点被拦',empty.some(e=>/没有标记为 takeaway/.test(e)));
        /* 反例 2：两个收束节点。一页只讲一件事，两处收束等于没有收束。 */
        const two=await mount({takeaways:2});
        pass('多收束节点被拦',pages.verifyDeck(planDoc(),[two],{warnings:[]}).some(e=>/有 2 个 data-reading-role/.test(e)));
        /* 反例 3：副标题复述标题。标题已给判断，副标题该写口径。 */
        const repeat=await mount({lead:TITLE});const w1=[];
        pages.verifyDeck(planDoc(),[repeat],{warnings:w1});
        pass('副标题复述标题出诊断',w1.some(w=>w.includes('N-SAME-PAGE-REPEAT')));
        /* 收束节点写成了标题的复述：数量对、位置对、样式对，但这一页仍然没有送达新的重点。
           这是"重点感不强"最省事的伪装，必须挡住。 */
        const echo=await mount({takeaway:TITLE});const w4=[];
        pages.verifyDeck(planDoc(),[echo],{warnings:w4});
        pass('收束句复述标题出诊断',w4.some(w=>w.includes('N-SAME-PAGE-REPEAT')&&w.includes('takeawayText')));
        /* 收束句在标题之上给出行动，属于正常写法，不能误报。 */
        const adds=await mount({takeaway:TITLE+'——先在高信号渠道试点，以增量测量决定扩张'});const w5=[];
        pages.verifyDeck(planDoc(),[adds],{warnings:w5});
        pass('收束句在标题之上加行动不误报',!w5.some(w=>w.includes('N-SAME-PAGE-REPEAT')));
        /* 反例 4：正文里有比标题大的字，读者第一眼落在别处。 */
        const big=await mount({bodyFont:44});const w2=[];
        pages.verifyDeck(planDoc(),[big],{warnings:w2});
        pass('正文越级字号出诊断',w2.some(w=>w.includes('N-BODY-LARGER-THAN-TITLE')));
        /* 反例 5：声明的 primary 不是页面上最大的展品。 */
        const offFocus=await mount({mainWidth:'20%',sideWidth:'55%'});const w3=[];
        pages.verifyDeck(planDoc(),[offFocus],{warnings:w3});
        pass('主展品不是最大展品出诊断',w3.some(w=>w.includes('N-PRIMARY-NOT-LARGEST')));
        /* 打印媒介不重复报同一批焦点问题：屏幕已判过一次，媒介差异由 takeaway 计数对账。 */
        const printFacts={...await (async()=>{await page.emulateMedia({media:'print'});const f=await mount({takeaways:0});await page.emulateMedia({media:'screen'});return f;})(),medium:'print'};
        pass('打印媒介不重复报焦点错误',!pages.verifyDeck(planDoc(),[printFacts],{warnings:[]}).some(e=>/takeaway/.test(e)));
      }
    }

    /* 旧策略冻结：同样的页面在 structural-lines-1 下不因缺少收束节点被拦，历史稿不追溯返工。 */
    await page.emulateMedia({media:'screen'});
    const legacy=await mount({takeaways:0},LEGACY);
    pass('旧策略不套用焦点合同',!pages.verifyDeck(planDoc(),[legacy],{warnings:[]}).some(e=>/takeaway|收束/.test(e)));
    /* 未登记策略不得被当成"新策略"或"旧策略"任意一种：能力查询失败即不启用新检查。 */
    const unknown=await mount({takeaways:0},'nope-1');
    pass('未知策略不启用焦点合同',!pages.verifyDeck(planDoc(),[unknown],{warnings:[]}).some(e=>/takeaway|收束/.test(e)));

    /* 能力表本身：包含关系与冻结值都不能被改坏。 */
    pass('能力表包含关系',caps.visualPolicy(NARRATIVE).pageFocus===true&&caps.visualPolicy(NARRATIVE).composition===true
      &&caps.visualPolicy(NARRATIVE).structuralLines===true);
    pass('旧策略能力冻结',caps.visualPolicy('evidence-composition-1').pageFocus===false
      &&caps.visualPolicy('structural-lines-1').composition===false&&caps.visualPolicy(LEGACY).pageFocus===false);

    console.log(JSON.stringify({pass:true,checks,scope:'收束节点唯一性、副标题复述、字号越级、主展品失焦、打印媒介、策略冻结'}));
  }finally{await browser.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
