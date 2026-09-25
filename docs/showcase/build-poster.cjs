// 将可编辑海报源导出为 3:4 PNG，并检查文字和画布边界。
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
(async()=>{
  const browser=await chromium.launch({channel:process.env.CHROME_CHANNEL||'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1080,height:1440},deviceScaleFactor:2});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.goto(pathToFileURL(path.join(__dirname,'skill-poster.html')).href);
    await page.evaluate(()=>document.fonts.ready);
    const check=await page.evaluate(()=>{
      const main=document.querySelector('main');const box=main.getBoundingClientRect();
      const overflow=[...main.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>1080||r.bottom>1440||e.scrollWidth>e.clientWidth+1;}).map(e=>e.tagName+':'+e.textContent.slice(0,40));
      const intro=document.querySelector(".intro");
      if(intro.scrollHeight>intro.clientHeight)overflow.push("intro: vertical overflow");
      return {width:box.width,height:box.height,overflow,imagesReady:[...document.images].every(i=>i.complete&&i.naturalWidth>0),fontsReady:document.fonts.check('700 64px "Deck Noto Serif SC"')};
    });
    if(errors.length||check.overflow.length||!check.imagesReady||!check.fontsReady||check.width!==1080||check.height!==1440)throw Error(JSON.stringify({errors,...check}));
    await page.screenshot({path:path.join(__dirname,'skill-poster.png')});
    console.log(JSON.stringify({...check,output:'skill-poster.png',pixels:'2160 × 2880'}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
