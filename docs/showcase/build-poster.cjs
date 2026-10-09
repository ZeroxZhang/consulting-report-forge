// 同步海报文案和项目版本，检查实际排版后导出 3:4 PNG。
const path = require('node:path');
const fs = require('node:fs');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
(async()=>{
  const htmlPath=path.join(__dirname,'skill-poster.html');
  const ir=JSON.parse(fs.readFileSync(path.join(__dirname,'skill-poster.ir.json'),'utf8'));
  const {version}=JSON.parse(fs.readFileSync(path.join(__dirname,'../../package.json'),'utf8'));
  const escape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const copy=new Map(ir.modules.flatMap(m=>Object.entries(m.content).filter(([k])=>k==='title'||k==='body').map(([k,v])=>[`${m.id}.${k}`,v])));
  const source=fs.readFileSync(htmlPath,'utf8').replace(/(<([a-z][a-z0-9]*)\b[^>]*\bdata-copy="([^"]+)"[^>]*>)[\s\S]*?(<\/\2>)/g,(_,open,tag,key,close)=>{
    if(!copy.has(key))throw Error(`缺少海报文案：${key}`);
    return open+escape(copy.get(key))+close;
  }).replace(/(<span data-version>)[^<]*(<\/span>)/,`$1v${version}$2`);
  fs.writeFileSync(htmlPath,source);
  const browser=await chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1080,height:1440},deviceScaleFactor:2});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    page.on('requestfailed',r=>errors.push(r.url()));
    await page.goto(pathToFileURL(htmlPath).href);
    await page.evaluate(()=>document.fonts.ready);
    const check=await page.evaluate(()=>{
      const main=document.querySelector('main');const box=main.getBoundingClientRect();
      const overflow=[...main.querySelectorAll('*')].filter(e=>{
        if(e instanceof SVGElement)return false;
        const r=e.getBoundingClientRect();
        return r.left<-.5||r.top<-.5||r.right>1080.5||r.bottom>1440.5||e.scrollWidth>e.clientWidth+1;
      }).map(e=>e.tagName+':'+e.textContent.slice(0,40));
      const texts=[...main.querySelectorAll('[data-copy],h1,header,footer')];
      for(const e of texts){
        if(e.scrollHeight>e.clientHeight+1)overflow.push(e.tagName+': vertical overflow');
        const range=document.createRange();range.selectNodeContents(e);
        const r=range.getBoundingClientRect(), b=e.getBoundingClientRect();
        if(r.left<b.left-2||r.right>b.right+2||r.top<b.top-4||r.bottom>b.bottom+4)overflow.push(e.tagName+': text clipping');
      }
      const loaded=[...document.fonts].filter(f=>f.status==='loaded').map(f=>`${f.family}:${f.weight}`);
      const fontsReady=['Poster Sans:400','Poster Sans:600','Poster Display:600'].every(f=>loaded.includes(f));
      const overlaps=[];
      const sections=[...main.children].map(e=>({name:e.tagName,box:e.getBoundingClientRect()}));
      sections.slice(1).forEach((e,i)=>{if(e.box.top<sections[i].box.bottom-.5)overlaps.push(e.name);});
      return {width:box.width,height:box.height,overflow,overlaps,imagesReady:[...document.images].every(i=>i.complete&&i.naturalWidth>0),fontsReady,version:document.querySelector('[data-version]').textContent};
    });
    if(errors.length||check.overflow.length||check.overlaps.length||!check.imagesReady||!check.fontsReady||check.width!==1080||check.height!==1440)throw Error(JSON.stringify({errors,...check}));
    await page.screenshot({path:path.join(__dirname,'skill-poster.png')});
    console.log(JSON.stringify({...check,output:'skill-poster.png',pixels:'2160 × 2880'}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
