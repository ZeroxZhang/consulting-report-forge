/* 只读核对实际嵌入字库 cmap；不以系统回退推测缺字，不覆盖旧字体失败判据。 */
'use strict';
const fontkit=require('fontkit'),crypto=require('node:crypto'),cache=new Map();
function missing(text,fonts){
  return [...new Set([...text].filter(c=>!/[\s\p{Default_Ignorable_Code_Point}]/u.test(c)).map(c=>c.codePointAt(0)))].filter(cp=>!fonts.some(font=>font.hasGlyphForCodePoint(cp))).map(cp=>({character:String.fromCodePoint(cp),codepoint:'U+'+cp.toString(16).toUpperCase().padStart(4,'0')}));
}
async function inspect(page){
  const observed=await page.evaluate(()=>{
    const clean=s=>s.trim().replace(/^['"]|['"]$/g,'');
    const faces=[];
    for(const rule of document.getElementById('deck-fonts')?.sheet?.cssRules||[]){
      if(rule.type!==CSSRule.FONT_FACE_RULE)continue;
      const src=rule.style.getPropertyValue('src'),data=src.match(/data:font\/[\w-]+;base64,([A-Za-z0-9+/=]+)/)?.[1];
      faces.push({family:clean(rule.style.getPropertyValue('font-family')),data});
    }
    const nodes=[...document.querySelectorAll('.slide.active *')].filter(e=>e.getClientRects().length&&getComputedStyle(e).visibility==='visible').map(e=>({family:getComputedStyle(e).fontFamily.split(',').map(clean),text:[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('')})).filter(n=>n.text.trim());
    return {faces,nodes};
  });
  const faces=observed.faces.map(f=>{
    if(!f.data)return {...f,font:null};
    const key=crypto.createHash('sha256').update(f.data).digest('hex');
    if(!cache.has(key)){try{cache.set(key,fontkit.create(Buffer.from(f.data,'base64')));}catch{cache.set(key,null);}if(cache.size>32)cache.delete(cache.keys().next().value);}
    return {family:f.family,font:cache.get(key)};
  });
  const findings=[];let checked=0,unknown=0;
  for(const [index,node] of observed.nodes.entries()){
    const requested=node.family.filter(f=>!['serif','sans-serif','monospace','cursive','fantasy','system-ui'].includes(f));
    if(!requested.length||requested.some(f=>!faces.some(entry=>entry.family===f&&entry.font))){unknown++;continue;}
    const fonts=faces.filter(f=>requested.includes(f.family)&&f.font).map(f=>f.font),gaps=missing(node.text,fonts);checked++;
    if(gaps.length)findings.push({code:'F-MISSING-GLYPH',index,text:node.text.slice(0,80),missing:gaps,message:'已声明的嵌入字体 cmap 均不含这些字符'});
  }
  return {status:unknown?'PARTIAL':'CHECKED',checkedNodes:checked,unknownNodes:unknown,findings,enforced:false,scope:'嵌入字体各字重 cmap 并集；不证明字形塑形、变体或真实回退结果，字体身份另由 CDP 检查'};
}
module.exports={missing,inspect};
