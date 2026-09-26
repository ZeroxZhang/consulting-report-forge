'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function main(){
 const browser=await require('playwright').chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true});
 const records=[];
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}});
  const cases=[
   ['html-table','R-SOURCE-OVERLAP','<table style="position:absolute;top:60px"><tr><td>密表第一行</td></tr><tr><td>密表末行限定</td></tr></table><footer class="source">来源文字</footer>'],
   ['grid-table','R-SOURCE-OVERLAP','<div style="position:absolute;top:95px;display:grid;grid-template-columns:150px 150px"><span>业务矩阵末行</span><span>期间限定</span></div><footer class="source">来源文字</footer>'],
   ['multiline-table','R-SOURCE-OVERLAP','<table style="position:absolute;top:62px"><tr><td>换行说明<br>密表末行限定</td></tr></table><footer class="source">来源文字</footer>'],
   ['financial-table','R-SOURCE-OVERLAP','<table style="position:absolute;top:95px"><tr><th>合计</th><td>−123.45</td></tr></table><footer class="source">来源文字</footer>'],
   ['polar-labels','R-TEXT-OVERLAP','<svg width="400" height="300"><g transform="translate(20 20)"><text x="100" y="100">径向分类标签甲</text><text x="120" y="102">径向分类标签乙</text></g></svg>'],
   ['negative-sign','R-TEXT-OCCLUDED','<svg width="400" height="300"><text x="40" y="70">−123</text><rect x="38" y="42" width="22" height="34" fill="white"/></svg>'],
   ['svg-clipping','R-TEXT-CLIPPED','<svg width="400" height="300" style="overflow:hidden"><text x="-15" y="70">−123</text></svg>'],
   ['inline-emphasis',null,'<p>合法<strong>行内强调</strong>及文字。</p>'],
   ['nested-container',null,'<div><div><p>合法嵌套布局</p></div></div>'],
   ['inside-bar',null,'<svg width="400" height="300"><rect x="0" y="0" width="350" height="100" fill="navy"/><text x="30" y="60" fill="white">柱内标签</text></svg>'],
   ['rotated-separated',null,'<svg width="400" height="300"><text x="50" y="100" transform="rotate(25 50 100)">旋转待审</text><text x="200" y="230">独立标签</text></svg>']
  ];
  for(const media of ['screen','print'])for(const [id,expected,html] of cases){
   await page.setContent('<style>body{margin:0}.slide{position:relative;width:1280px;height:720px;font:24px/32px sans-serif}.source{position:absolute;left:0;top:100px}table{border-collapse:collapse}td,th{padding:0;height:32px}</style><section class="slide">'+html+'</section>');
   await page.emulateMedia({media});
   const result=await page.locator('.slide').evaluate(require('./browser_reading_audit.cjs').inspectSlide);
   const found=result.observations.map(o=>o.code),passed=expected?found.includes(expected):found.length===0;
   records.push({id,media,expected,observed:found,passed,elapsedMs:result.elapsedMs,unsupported:result.coverage.unsupported});
  }
  const positives=records.filter(r=>r.expected),negatives=records.filter(r=>!r.expected);
  const summary={synthetic:true,enforced:false,unit:'固定标注场景/媒介，不是对象级准确率',cases:records,positiveCases:positives.length,falseNegativeCases:positives.filter(r=>!r.passed).length,legalCases:negatives.length,falsePositiveCases:negatives.filter(r=>!r.passed).length};
  const out=path.resolve(__dirname,'../renders/upgrade-r3');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'reading-matrix.json'),JSON.stringify(summary,null,2));
  assert.ok(records.every(r=>r.passed),JSON.stringify(records.filter(r=>!r.passed),null,2));
  console.log('PASS labelled reading matrix: '+positives.length+' positive and '+negatives.length+' legal screen/print cases; scope exclusions retained');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
