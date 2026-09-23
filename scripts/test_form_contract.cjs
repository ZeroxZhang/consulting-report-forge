'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fixture,task}=require('../tests/fixtures/analysis_fixture.cjs');
const blueprint=require('./deck_blueprint.cjs'),content=require('./content_contract.cjs'),pages=require('./check_pages.cjs');
const capacity=require('../assets/form-capacity.js'),forms=require('../assets/deck-forms.js');
const diagram=require('./diagram_contract.cjs'),renderDiagram=require('./render_diagram.cjs');
const precision=require('./render_precision_exhibit.cjs');
const copy=value=>structuredClone(value);
const checked=d=>blueprint.validate(d,{task,stage:'ready',preview:true});
const base=fixture();
assert.equal(checked(base).status,'PASS');
for(const [change,pattern] of [
  [d=>delete d.slides[1].visual.selection,/visual.selection/],
  [d=>d.slides[1].visual.selection.relationship='trend',/selection.relationship/],
  [d=>d.slides[1].visual.selection.reason='随便选的',/selection.reason/],
  [d=>d.slides[1].visual.capacity.items=15,/硬上限/],
  [d=>delete d.slides[1].visual.capacity,/visual.capacity/]
]){const d=copy(base);change(d);assert.match(checked(d).errors.join('；'),pattern);}
const compiled=content.compile(base,{task,preview:true});
assert.equal(compiled.pages[0].selection.relationship,'comparison');
assert.equal(compiled.pages[0].capacity.items,1);
assert.equal(pages.check(compiled).status,'PASS');
const tampered=copy(compiled);tampered.pages[0].selection.relationship='trend';assert.equal(pages.check(tampered).status,'FAIL');
const plan=compiled.pages[0],fakeSlide={page:1,form:plan.form,visual:plan.visual,proves:plan.proves,densityProfile:plan.density.profile,layout:plan.layout,modules:plan.regions.map(r=>r.slot),exhibits:[{id:'main',form:plan.form,capacity:capacity.encoded(plan.form,{items:[{},{}]})}]};
assert.ok(pages.verifyDeck(compiled,[fakeSlide]).some(e=>e.includes('超过蓝图计划 1')),'最终图示的实际计数须对照蓝图');
fakeSlide.exhibits[0].form='kit.slope';assert.ok(pages.verifyDeck(compiled,[fakeSlide]).some(e=>e.includes('缺少与主形式')),'声明形式须有对应的最终图示');
assert.equal(capacity.limit('kit.waterfall','nodes'),forms.get('kit.waterfall').limits.maxNodes);
assert.equal(capacity.inspect('recipe.scatter',{items:20,labeledPoints:16},{requireAll:true}).errors.length,0);
assert.equal(capacity.inspect('recipe.scatter',{items:20,labeledPoints:16}).warnings.length,1);
assert.match(capacity.inspect('recipe.scatter',{items:20},{requireAll:true}).errors.join('；'),/labeledPoints/);
assert.equal(capacity.inspect('recipe.scatter',{items:201}).errors.length,1);
const scatterItems=Array.from({length:20},(_,i)=>({label:'点'+i,x:i,y:i,selected:i<16}));
assert.equal(capacity.dimensions('recipe.scatter',{items:scatterItems}).labeledPoints,16);
assert.equal(require('../assets/echarts-recipes.js').scatter({items:scatterItems}).series[0].data.filter(item=>item.label.show).length,16);
const scatterWarnings=[];
pages.verifyDeck({blueprintSchemaVersion:3,pages:[{form:'recipe.scatter',capacity:{items:20,labeledPoints:16}}]},[{page:1,form:'recipe.scatter',exhibits:[{id:'plot',form:'recipe.scatter',capacity:capacity.encoded('recipe.scatter',{items:scatterItems})}]}],{warnings:scatterWarnings});
assert.match(scatterWarnings.join('；'),/建议阅读量 15/);
assert.match(pages.verifyDeck({blueprintSchemaVersion:3,pages:[{form:'html.kpi',capacity:{items:5}}]},[{page:1,form:'html.kpi',kpiCards:0}]).join('；'),/须有可见 KPI 卡片/);
assert.match(pages.verifyDeck({blueprintSchemaVersion:3,pages:[{form:'html.finding',capacity:{items:3}}]},[{page:1,form:'html.finding',finding:[]}]).join('；'),/有且仅有一个可见/);
assert.throws(()=>precision.render({type:'waterfall',theme:'mckinsey',typography_id:'serif-report-bold',width:3600,height:650,items:[{id:'start',label:'起点',type:'total',value:100},...Array.from({length:17},(_,i)=>({id:'delta'+i,label:'变化'+i,type:'delta',value:1})),{id:'end',label:'终点',type:'total',value:117}]}),/超过 18/);
assert.throws(()=>require('../assets/exhibit-kit.js').dumbbell({items:Array.from({length:15},(_,i)=>({label:String(i),start:i,end:i+1}))}),/硬上限 14/);
assert.throws(()=>require('../assets/echarts-recipes.js').groupedBar({categories:['A'],series:Array.from({length:5},(_,i)=>({name:String(i),values:[i]}))}),/起始预算 4/);
const sandbox={window:{}};vm.createContext(sandbox);
for(const file of ['form-capacity.js','echarts-recipes.js'])vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../assets',file),'utf8'),sandbox,{filename:file});
assert.equal(sandbox.window.EChartsRecipes.limits.groupedSeries,capacity.limit('recipe.groupedBar','series'));

const node=(id,x,y,extra={})=>({id,title:id,x,y,w:150,h:120,...extra});
const common={width:900,height:420,typography_id:'serif-report-bold',theme_id:'mckinsey'};
const mechanism={...common,form:'diagram.mechanism',nodes:[node('A',80,130),node('B',550,130)],edges:[{from:'A',to:'B',label:'推动',evidenceStatus:'supported'},{from:'B',to:'A',label:'反馈',evidenceStatus:'hypothesis',feedback:true,fromSide:'bottom',toSide:'bottom',points:[[625,340],[155,340]],labelX:400,labelY:335}]};
const processSpec={...common,form:'diagram.process',nodes:[node('A',80,130,{stage:'启动'}),node('B',550,130,{stage:'完成'})],edges:[{from:'A',to:'B',role:'sequence',label:'交付'}]};
const swimlane={...common,form:'diagram.swimlane',layout:{laneBands:true},nodes:[{id:'A',title:'申请',lane:'业务',stage:'申请'},{id:'B',title:'批准',lane:'财务',stage:'批准'}],edges:[{from:'A',to:'B',role:'handoff',label:'申请单'}]};
const hierarchy={...common,form:'diagram.hierarchy',nodes:[node('A',80,130),node('B',550,130)],edges:[{from:'A',to:'B',relation:'contains'}]};
const condition={...common,form:'diagram.condition',nodes:[node('A',80,130,{role:'decision'}),node('B',550,70,{role:'outcome'}),node('C',550,260,{role:'outcome'})],edges:[{from:'A',to:'B',condition:'达标',labelX:390,labelY:65},{from:'A',to:'C',condition:'未达标',labelX:390,labelY:265}]};
for(const spec of [mechanism,processSpec,swimlane,hierarchy,condition]){
  assert.deepEqual(diagram.validate(spec),[],spec.form);
  const svg=renderDiagram.render(spec);assert.match(svg,new RegExp('data-form="'+spec.form.replace('.','\\.')+'"'));
  assert.match(svg,/data-node=/);assert.match(svg,/data-edge=/);
}
assert.match(renderDiagram.render(mechanism),/data-feedback="true"/);
assert.match(renderDiagram.render(mechanism),/反馈（假设）/);
assert.match(renderDiagram.render(condition),/data-node-role="decision"/);
assert.match(diagram.verifyRendered('diagram.condition',null).join('；'),/缺少图示语义渲染标记/);
assert.match(renderDiagram.render(swimlane),/data-role="lane-band"/);
assert.match(renderDiagram.render({...condition,edges:condition.edges.map((edge,i)=>({...edge,probability:i===0?.4:.6,probabilityBasis:'样本频率'}))}),/40%（依据：样本频率）/);
assert.ok(!renderDiagram.render({...hierarchy,edges:[{...hierarchy.edges[0],dashed:true}]}).includes('stroke-dasharray'), '包含边必须保持实线');
assert.match(renderDiagram.render({...hierarchy,edges:[{...hierarchy.edges[0],relation:'depends_on',arrow:false},{from:'A',to:'B',relation:'contains'}]}),/data-relation="depends_on"[^]*?marker-end=/);
assert.doesNotMatch(renderDiagram.render({...processSpec,form:undefined}),/data-form=/,'旧图示输入可继续独立渲染，新报告会由最终形式对账拦截');
assert.equal(diagram.prepare({...hierarchy,nodes:[...hierarchy.nodes,node('C',550,280)],edges:[...hierarchy.edges,{from:'A',to:'C',relation:'contains'},{from:'B',to:'C',relation:'depends_on'}]}).edges[2].label,'依赖');
for(const [spec,mutate,pattern] of [
  [mechanism,s=>delete s.edges[0].evidenceStatus,/evidenceStatus/],
  [mechanism,s=>delete s.edges[1].feedback,/机制循环/],
  [processSpec,s=>s.edges[0].width=4,/不接受手填线宽/],
  [swimlane,s=>delete s.layout,/自动布局/],
  [swimlane,s=>s.layout.headers=false,/标题和泳道带/],
  [swimlane,s=>s.layout.laneBands=false,/标题和泳道带/],
  [hierarchy,s=>s.edges[0].relation='depends_on',/须有包含关系/],
  [condition,s=>delete s.edges[0].condition,/须写分支条件/],
  [condition,s=>s.edges[0].probability=.6,/附依据/],
  [condition,s=>{s.edges[0].probability=.4;s.edges[0].probabilityBasis='样本频率';},/概率须覆盖全部分支/],
  [condition,s=>{s.edges[0].probability=.7;s.edges[1].probability=.7;s.edges.forEach(e=>e.probabilityBasis='样本频率');},/分支概率合计须为 1/]
]){const bad=copy(spec);mutate(bad);assert.match(diagram.validate(bad).join('；'),pattern);assert.throws(()=>renderDiagram.render(bad),/图示语义不匹配/);}
console.log('PASS form contract: selection, hard/soft capacity, Node/browser recipes, five diagram semantics and counterexamples');
if(process.argv.includes('--browser'))(async()=>{
  const {chromium}=require('playwright'),probe=require('./page_probe.cjs');
  const browser=await chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1200,height:800}});
    const svg=require('../assets/exhibit-kit.js').dumbbell({width:800,height:400,items:[{label:'甲',start:1,end:2},{label:'乙',start:2,end:3}]});
    const probabilistic={...condition,edges:condition.edges.map((edge,i)=>({...edge,probability:i===0?.4:.6,probabilityBasis:'样本频率'}))};
    await page.setContent('<html><head><style>.slide{width:1000px;height:600px}.slide__body{width:800px;height:400px}.kpi-card{display:inline-block;width:40px;height:30px}</style></head><body><div id="stage"><section class="slide"><div class="slide__body">'+svg+renderDiagram.render(probabilistic)+'<div>'+Array.from({length:6},()=>'<div class="kpi-card">1</div>').join('')+'</div></div></section></div></body></html>');
    const facts=await page.locator('.slide').evaluate(probe.inspectDom,probe.WF_FORMS);
    assert.equal(facts.exhibits.find(e=>e.form==='kit.dumbbell')?.form,'kit.dumbbell');
    assert.equal(JSON.parse(decodeURIComponent(facts.exhibits.find(e=>e.form==='kit.dumbbell').capacity)).items,2);
    assert.equal(facts.kpiCards,6);
    const diagramFacts=facts.exhibits.find(e=>e.form==='diagram.condition')?.diagram;
    assert.deepEqual(diagram.verifyRendered('diagram.condition',diagramFacts),[]);
    assert.match(diagram.verifyRendered('diagram.condition',{...diagramFacts,edges:[]}).join('；'),/至少需要一条有意义的边/);
    await page.locator('[data-form="diagram.condition"] [data-edge] text').first().evaluate(e=>e.textContent=e.textContent.replace('40%','90%'));
    const wrongProbability=(await page.locator('.slide').evaluate(probe.inspectDom,probe.WF_FORMS)).exhibits.find(e=>e.form==='diagram.condition').diagram;
    assert.match(diagram.verifyRendered('diagram.condition',wrongProbability).join('；'),/可见条件、概率与依据/);
    await page.locator('[data-form="diagram.condition"] [data-edge]').first().evaluate(e=>e.style.display='none');
    const hiddenEdge=(await page.locator('.slide').evaluate(probe.inspectDom,probe.WF_FORMS)).exhibits.find(e=>e.form==='diagram.condition').diagram;
    assert.match(diagram.verifyRendered('diagram.condition',hiddenEdge).join('；'),/至少要有两条条件分支/);
    await page.setContent('<html><body><div id="stage"><section class="slide"><div class="slide__body">'+renderDiagram.render(processSpec)+'</div></section></div></body></html>');
    await page.locator('[data-form="diagram.process"] polyline').evaluate(e=>e.setAttribute('stroke-width','8'));
    const thickProcess=(await page.locator('.slide').evaluate(probe.inspectDom,probe.WF_FORMS)).exhibits.find(e=>e.form==='diagram.process').diagram;
    assert.match(diagram.verifyRendered('diagram.process',thickProcess).join('；'),/实际线宽/);
    await page.locator('[data-form="diagram.process"] polyline').evaluate(e=>e.setAttribute('stroke','none'));
    const absentProcess=(await page.locator('.slide').evaluate(probe.inspectDom,probe.WF_FORMS)).exhibits.find(e=>e.form==='diagram.process').diagram;
    assert.match(diagram.verifyRendered('diagram.process',absentProcess).join('；'),/至少需要一条有意义的边/);
    for(const spec of [mechanism,swimlane,hierarchy]){
      await page.setContent('<html><body><div id="stage"><section class="slide"><div class="slide__body">'+renderDiagram.render(spec)+'</div></section></div></body></html>');
      const observed=(await page.locator('.slide').evaluate(probe.inspectDom,probe.WF_FORMS)).exhibits.find(e=>e.form===spec.form).diagram;
      assert.deepEqual(diagram.verifyRendered(spec.form,observed),[],spec.form);
      if(spec.form==='diagram.mechanism'){
        await page.locator('[data-form="diagram.mechanism"] [data-edge] polyline').first().evaluate(e=>e.setAttribute('stroke-dasharray','6 4'));
        const changed=(await page.locator('.slide').evaluate(probe.inspectDom,probe.WF_FORMS)).exhibits.find(e=>e.form===spec.form).diagram;
        assert.match(diagram.verifyRendered(spec.form,changed).join('；'),/线型与证据状态/);
      }
      if(spec.form==='diagram.swimlane'){
        await page.locator('[data-form="diagram.swimlane"] text[data-role="lane-title"]').last().evaluate(e=>e.textContent='业务');
        const changed=(await page.locator('.slide').evaluate(probe.inspectDom,probe.WF_FORMS)).exhibits.find(e=>e.form===spec.form).diagram;
        assert.match(diagram.verifyRendered(spec.form,changed).join('；'),/标题文字与节点声明/);
      }
      if(spec.form==='diagram.hierarchy'){
        await page.locator('[data-form="diagram.hierarchy"] [data-edge] polyline').first().evaluate(e=>e.setAttribute('stroke-dasharray','6 4'));
        const changed=(await page.locator('.slide').evaluate(probe.inspectDom,probe.WF_FORMS)).exhibits.find(e=>e.form===spec.form).diagram;
        assert.match(diagram.verifyRendered(spec.form,changed).join('；'),/包含边须是无箭头实线/);
      }
    }
    await page.setContent('<html><body><div id="stage"><section class="slide"><div class="slide__body">'+renderDiagram.render(swimlane)+'</div></section></div></body></html>');
    await page.locator('[data-form="diagram.swimlane"] text[data-role="lane-title"]').first().evaluate(e=>{e.setAttribute('fill','none');e.setAttribute('stroke','none');});
    const unpaintedTitle=(await page.locator('.slide').evaluate(probe.inspectDom,probe.WF_FORMS)).exhibits.find(e=>e.form==='diagram.swimlane').diagram;
    assert.match(diagram.verifyRendered('diagram.swimlane',unpaintedTitle).join('；'),/标题文字与节点声明/);
    await page.setContent('<html><body><div id="stage"><section class="slide"><div class="slide__body">'+renderDiagram.render(swimlane)+'</div></section></div></body></html>');
    await page.locator('[data-form="diagram.swimlane"] [data-role="lane-band"] rect').first().evaluate(e=>{e.setAttribute('fill','none');e.setAttribute('stroke','none');});
    const unpaintedBand=(await page.locator('.slide').evaluate(probe.inspectDom,probe.WF_FORMS)).exhibits.find(e=>e.form==='diagram.swimlane').diagram;
    assert.match(diagram.verifyRendered('diagram.swimlane',unpaintedBand).join('；'),/可见泳道带少于主体数/);
    const observed={...fakeSlide,exhibits:facts.exhibits};
    assert.ok(pages.verifyDeck(compiled,[observed]).some(e=>e.includes('超过蓝图计划 1')));
    const revised=copy(compiled);revised.pages[0].capacity.items=2;
    assert.ok(!pages.verifyDeck(revised,[observed]).some(e=>e.includes('超过蓝图计划')));
    console.log('PASS form contract browser: rendered SVG metadata reaches actual page probe and page plan comparison');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
