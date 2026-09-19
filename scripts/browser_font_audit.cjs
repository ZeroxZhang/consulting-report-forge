/* 实际字形身份 + 语义角色双重检查；CDP在导航前启用，避免file: SVG引用的观察器副作用。 */
const type=require('../assets/deck-typography.js'),sessions=new WeakMap();
async function attach(page){if(!sessions.has(page)){const client=await page.context().newCDPSession(page);await client.send('DOM.enable');await client.send('CSS.enable');sessions.set(page,client);}return sessions.get(page);}
/* 字重越界多半是作者样式压过了引擎的归一化规则（引擎把 b/strong/.row-label 之类统一成 600）。
   只说"字重不对"，作者就得回头猜是哪一条；把真正命中 font-weight 的规则连选择器带出来，
   报错就能直接指到 page.css 的那一行。只在越界时查，正常页不付这个代价。 */
async function weightRulesFor(client,nodeId){
 try{
  const {matchedCSSRules=[]}=await client.send('CSS.getMatchedStylesForNode',{nodeId});
  return matchedCSSRules.map(m=>m.rule).filter(Boolean).map(rule=>{
   const prop=(rule.style?.cssProperties||[]).find(p=>p.name==='font-weight');
   return prop?{selector:rule.selectorList?.text||'',value:String(prop.value)}:null;
  }).filter(Boolean);
 }catch(error){return [];}
}
/* 供单页自查与正式审计共用同一句描述，避免两边各写一份。 */
function describe(fonts){
 const list=(fonts?.unexpected||[]).slice(0,3).map(node=>{
  // matchedCSSRules 按层叠顺序返回，末条就是压过引擎归一化的那一条；只留末三条，免得盖住重点。
  const all=(node.weightRules||[]).map(rule=>rule.selector+'{font-weight:'+rule.value+'}');
  const rules=(all.length>3?['…'].concat(all.slice(-3)):all).join('、');
  return (node.role==='title'?'标题':'正文')+'「'+String(node.text||'').trim().slice(0,18)+'」'+((node.reasons||[]).join('；')||'字体未就绪')+(rules?'；命中（层叠顺序，末条生效）：'+rules:'');
 });
 return '字体未就绪或出现系统回退'+(list.length?'——'+list.join(' ／ '):'');
}
async function inspect(page){
 const state=await page.evaluate(()=>({profile:document.documentElement.dataset.typography||'unrecorded',status:document.documentElement.dataset.fontStatus||'unrecorded',faces:window.__deckFontState?.faces||[],manifest:JSON.parse(document.getElementById('deck-font-manifest')?.textContent||'null')}));
 if(state.profile==='unrecorded'||state.profile==='legacy-system')return {...state,identity:'LEGACY_NOT_LOCKED',unexpected:[]};
 const client=await attach(page),p=type.get(state.profile),chain=s=>s.split(',').map(s=>s.trim().replace(/^['"]|['"]$/g,'')).join(',');
 try{
  const nodes=await page.evaluate(()=>{const nodes=[];for(const el of document.querySelectorAll('.slide.active *')){if(!el.getClientRects().length||getComputedStyle(el).visibility==='hidden'||!Array.from(el.childNodes).some(c=>c.nodeType===3&&c.textContent.trim()))continue;el.setAttribute('data-font-audit',String(nodes.length));const cs=getComputedStyle(el);nodes.push({role:el.closest('.slide__title,.cover-title,.divider-name')?'title':'body',latin:!!el.closest('.type-latin'),family:cs.fontFamily,weight:+cs.fontWeight,style:cs.fontStyle,text:el.textContent.slice(0,80)});}return nodes;});
  const {root}=await client.send('DOM.getDocument'),unexpected=[],families=new Set();
  for(let i=0;i<nodes.length;i++){
   const {nodeId}=await client.send('DOM.querySelector',{nodeId:root.nodeId,selector:'[data-font-audit="'+i+'"]'});
   const {fonts}=await client.send('CSS.getPlatformFontsForNode',{nodeId});fonts.forEach(f=>families.add(f.familyName));
   const node=nodes[i],expected=chain(node.role==='title'?p.title:p.body),aliases=expected.split(',');
   const allowed=(state.manifest?.faces||[]).filter(f=>aliases.includes(f.family)).flatMap(f=>f.platform_families||[]);
   const weightOK=node.role==='title'?node.weight===(node.latin?p.weights.titleLatin:p.weights.title):[400,500,600].includes(node.weight);
   const reasons=[];
   if(chain(node.family)!==expected)reasons.push('字族回退：实际 '+node.family+'，期望 '+expected);
   if(!weightOK)reasons.push(node.role==='title'?'标题字重应为 '+(node.latin?p.weights.titleLatin:p.weights.title)+'，实际 '+node.weight:'正文字重只能用 400/500/600，实际 '+node.weight);
   if(node.style!=='normal')reasons.push('字形须为 normal，实际 '+node.style);
   if(!fonts.length)reasons.push('浏览器没有为这个元素匹配到任何字体');
   else{const fallback=fonts.filter(f=>!f.isCustomFont||(allowed.length&&!allowed.includes(f.familyName)));if(fallback.length)reasons.push('出现系统回退字体：'+fallback.map(f=>f.familyName).join('/'));}
   if(reasons.length){const entry={index:i,...node,expected,fonts,reasons};if(!weightOK)entry.weightRules=await weightRulesFor(client,nodeId);unexpected.push(entry);}
  }
  delete state.manifest;
  return {...state,identity:state.status==='ready'&&!unexpected.length?'PASS':'FAIL',families:[...families],unexpected};
 }finally{await page.evaluate(()=>document.querySelectorAll('[data-font-audit]').forEach(e=>e.removeAttribute('data-font-audit')));}
}
async function signature(page){return page.locator('.slide.active').evaluate(s=>{const box=s.getBoundingClientRect(),scale=box.width/s.offsetWidth;return [...s.querySelectorAll('*')].filter(e=>e.children.length===0&&e.textContent.trim()&&e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return [e.textContent,cs.fontFamily,cs.fontWeight,...[r.x-box.x,r.y-box.y,r.width,r.height].map(v=>Math.round(v/scale*10)/10)];});});}
module.exports={attach,inspect,signature,describe};
