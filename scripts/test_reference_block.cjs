'use strict';
const assert=require('node:assert/strict');
const contract=require('./report_contract.cjs'),bookends=require('./bookends.cjs'),check=require('./check_bookends.cjs');
async function main(){
  const base={version:3,analysisAlgorithm:'semantic-v2',workMode:'editorial',complexity:'simple',majorConclusion:false};
  const policies={...contract.normalize(base).policyVersions,references:'reference-block-1'};
  assert.throws(()=>contract.normalize({...base,policyVersions:policies}),/referenceIds/);
  const task=contract.normalize({...base,policyVersions:policies,referenceIds:['S1','S2','S3']});
  assert.throws(()=>contract.normalize({...task,version:2}),/降级/);
  assert.throws(()=>contract.normalize({...task,referenceIds:['S1','S1']}),/唯一/);
  const sources=task.referenceIds.map(id=>({id,title:'合成回归资料 '+id,url:'https://example.org/'+id}));
  const bundle=bookends.referenceBundle({sources,pageSize:2});assert.deepEqual(bundle.referenceIds,task.referenceIds);assert.equal(bundle.policy,'reference-block-1');
  const {chromium}=require('playwright'),browser=await chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true});
  try{
    const page=await browser.newPage();
    async function inspect(options){
      await page.setContent('<style>.slide{width:1000px;padding:30px}.reference-text{display:block}</style>'+bookends.referencesBlock({sources,pageSize:2,...options}));
      return page.locator('.slide').evaluateAll((slides,src)=>slides.map(slide=>({bookends:(0,eval)('('+src+')')(slide)})),check.inspectPage.toString());
    }
    const options={kind:'fragment',referencePolicy:policies.references,expectedIds:task.referenceIds};
    let rows=await inspect();assert.equal(rows.length,2);assert.deepEqual(check.checkDocument(rows,options).errors,[]);
    assert.ok(check.checkDocument(rows,{kind:'fragment'}).errors.length,'旧策略不能接受跨页总数');
    for(const mutate of [r=>r[1].bookends.entries.pop(),r=>r[1].bookends.entries[0].id='S1',r=>r.reverse(),r=>r.splice(1,0,{bookends:{role:'content'}}),r=>r[0].bookends.total=2]){
      const changed=structuredClone(rows);mutate(changed);assert.ok(check.checkDocument(changed,options).errors.length);
    }
    rows=await inspect({selectedIds:['S1','S3'],pageSize:1,note:'完整底稿见来源登记表'});
    assert.deepEqual(check.checkDocument(rows,options).errors,[]);
    assert.ok(rows.every(r=>r.bookends.note.includes('列示 2 项')&&r.bookends.note.includes('共 3 项')));
    await page.addStyleTag({content:'.reference-text{width:5px;overflow:hidden;white-space:nowrap}'});
    const clipped=await page.locator('.slide').evaluateAll((slides,src)=>slides.map(slide=>({bookends:(0,eval)('('+src+')')(slide)})),check.inspectPage.toString());
    assert.ok(check.checkDocument(clipped,options).errors.some(e=>e.includes('容量')),'长链接标题裁切须被检查');
    console.log('PASS reference-block production contract, generator, browser observations, selection and negative mutations');
  }finally{await browser.close();}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={main};
