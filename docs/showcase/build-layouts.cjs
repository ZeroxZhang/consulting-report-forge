/* 从实际 Layout Atlas 提取线框，生成 README 展示图。
 * 不维护第二套布局几何；中间 HTML 与检查记录放在忽略目录 renders/readme/。
 */
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {execFileSync} = require('node:child_process');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '../..');
const work = path.join(root, 'renders/readme');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const selected = [
  {id:'L09', benefit:'围绕一个判断，把四项成立条件摆在同一页。'},
  {id:'L14', benefit:'从总指标逐层拆开，保留驱动因素与计算口径。'},
  {id:'L24', benefit:'沿两条议题线，将问题、证据和行动含义逐项对齐。'},
  {id:'L26', benefit:'将阶段计划、责任、风险和放行门槛放在一起管理。'}
];
function shell(body) {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><link rel="stylesheet" href="${pathToFileURL(path.join(root,'assets/fonts/deck-fonts.css')).href}"><style>
  *{box-sizing:border-box}body{margin:0;color:#172c3b;font-family:'Deck Inter','Deck Noto Sans SC',sans-serif;font-synthesis:none;background:#edf1f4}
  .board{width:1600px;padding:48px}.kicker{font-size:15px;letter-spacing:2px;color:#50606e}h1{font:700 40px/1.4 'Deck Noto Serif SC',serif;color:#000080;margin:14px 0 12px}
  .intro{font-size:21px;line-height:1.6;margin:0;color:#50606e}.facts{display:flex;gap:36px;margin-top:24px;font-size:18px}.facts b{font-size:28px;color:#000080;margin-right:8px}
  .cards{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:32px}.card{background:white;border:1px solid #d3dde3;padding:22px;min-width:0}h2{font-size:23px;line-height:1.4;font-weight:600;margin:0 0 12px}h2 span{font-size:17px;font-weight:400;color:#50606e;margin-right:12px}
  svg{display:block;width:100%;height:auto;background:white}.card p{font-size:19px;line-height:1.55;margin:14px 0 0;min-height:58px}.legend{display:flex;gap:24px;font-size:17px;margin:28px 0 0}.legend span{display:flex;align-items:center;gap:8px}.legend i{width:12px;height:12px;background:var(--c);display:inline-block}.foot{font-size:15px;line-height:1.6;margin-top:20px;color:#50606e}
  .all .cards{grid-template-columns:repeat(5,1fr);gap:18px}.all .card{padding:12px}.all h2{font-size:16px;margin:9px 0 0;line-height:1.5;min-height:48px}.all h2 span{font-size:14px;margin-right:8px}
  </style>${body}</html>`;
}
async function main(){
  execFileSync(process.execPath,[path.join(root,'scripts/build_layout_atlas.cjs'),'--check'],{stdio:'inherit'});
  fs.mkdirSync(work,{recursive:true});
  const browser = await chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1600,height:1100},deviceScaleFactor:1});
    await page.goto(pathToFileURL(path.join(root,'assets/layout-atlas.html')).href);
    await page.evaluate(()=>document.fonts.ready);
    // 调用图谱自身的线框生成器；几何与槽位颜色完全沿用实际产品。
    const layouts = await page.evaluate(()=>D.layouts.filter(l=>l.master==='analysis').map(l=>({
      id:l.id,name:l.name,use:l.use,path:l.path,svg:wireframe(l,{mini:true}),
      modules:l.modules.map((m,i)=>({title:m.title,role:m.role,box:l.measured['16x9'].modules[i].box}))
    })));
    await page.locator('.side [data-go="L26"]').click();
    await page.locator('[data-mode="capacity"]').click();
    await page.screenshot({path:path.join(__dirname,'layout-atlas-workbench.png')});
    // 在同一套真实矩形内加面向读者的模块标题，去掉缩图中读不清的开发参数。
    function labeled(l){
      const labels=l.modules.map(m=>{
        const {x,y,width,height}=m.box;
        const chars=[...m.title],count=Math.max(1,Math.floor((width-32)/30));
        const lines=[];for(let i=0;i<chars.length;i+=count)lines.push(chars.slice(i,i+count).join(''));
        if(lines.length*39>height-12)throw Error(l.id+' 模块标题装不下：'+m.title);
        return `<text x="${x+width/2}" y="${y+height/2-(lines.length-1)*19.5+10}" text-anchor="middle" font-size="30" font-weight="${m.role==='primary'?600:400}" fill="#172c3b">${lines.map((s,i)=>`<tspan x="${x+width/2}" dy="${i?39:0}">${esc(s)}</tspan>`).join('')}</text>`;
      }).join('');
      return l.svg.replace('</svg>',labels+'</svg>');
    }
    const legend='<div class="legend"><span><i style="--c:#000080"></i>图表证据</span><span><i style="--c:#007A78"></i>精确表格</span><span><i style="--c:#8652A0"></i>机制图示</span><span><i style="--c:#1F6FB2"></i>时间与阶段</span><span><i style="--c:#50606E"></i>判断与说明</span></div>';
    const featured = shell(`<main class="board"><div class="kicker">CONSULTING REPORT FORGE / LAYOUT ATLAS</div><h1>每一种分析任务，都有适合的页面结构</h1><p class="intro">把结论、证据、条件与行动组织成清晰的阅读路径。</p><div class="facts"><span><b>${layouts.length}</b>套正文布局</span><span><b>12 × 6</b>统一网格</span><span><b>16:9 / 4:3</b>两种画幅</span></div><div class="cards">${selected.map(s=>{const l=layouts.find(x=>x.id===s.id);return `<section class="card"><h2><span>${l.id}</span>${esc(l.name)}</h2>${labeled(l)}<p>${s.benefit}</p></section>`;}).join('')}</div>${legend}<div class="foot">结构示意，非业务数据。矩形位置与比例来自实际 Layout Atlas；标签为目录中的模块名称。颜色区分内容职责，非数值大小。</div></main>`);
    const all = shell(`<main class="board all"><div class="kicker">CONSULTING REPORT FORGE / LAYOUT COLLECTION</div><h1>${layouts.length} 套正文布局，从证据展开到决策行动</h1><p class="intro">同一套网格，不同的主辅关系、比较方式与阅读顺序。</p><div class="cards">${layouts.map(l=>`<section class="card">${l.svg}<h2><span>${l.id}</span>${esc(l.name)}</h2></section>`).join('')}</div><div class="foot">来源：assets/layout-atlas/catalog.json · 全部正文布局，16:9 结构缩略图。布局也定义模块职责；几何相同的方案可能服务于不同的论证任务。</div></main>`);
    const checks=[];
    for(const [name,html] of [['layout-featured',featured],['layout-overview',all]]){
      const file=path.join(work,name+'.html');fs.writeFileSync(file,html);
      await page.goto(pathToFileURL(file).href);await page.evaluate(()=>document.fonts.ready);
      const check=await page.locator('.board').evaluate(el=>({width:el.clientWidth,height:el.clientHeight,overflow:el.scrollWidth>el.clientWidth,cards:el.querySelectorAll('.card').length}));
      if(check.overflow)throw Error(name+' 版面溢出');checks.push({name,...check});
      await page.locator('.board').screenshot({path:path.join(__dirname,name+'.png')});
    }
    fs.writeFileSync(path.join(work,'layout-check.json'),JSON.stringify(checks,null,2));console.log(JSON.stringify(checks));
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
