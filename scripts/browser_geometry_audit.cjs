/* 对最终DOM/SVG测量；所有结果转换成幻灯片逻辑坐标。Canvas未声明适配器不冒充已测。 */
async function settle(page){
  await page.evaluate(async()=>{await document.fonts.ready;await(window.deckReady||Promise.resolve());await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
}
function inspectSlide(slide){
  const sr=slide.getBoundingClientRect(),sx=sr.width/slide.offsetWidth,sy=sr.height/slide.offsetHeight,tolerance=.35,errors=[],groups={},measurements=[];
  const shown=e=>{const r=e.getBoundingClientRect();if(!r.width||!r.height)return false;for(let n=e;n&&n.nodeType===1;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||Number(s.opacity)===0||s.contentVisibility==='hidden')return false;}return true;};
  const logical=r=>({left:(r.left-sr.left)/sx,right:(r.right-sr.left)/sx,top:(r.top-sr.top)/sy,bottom:(r.bottom-sr.top)/sy});
  function actualRect(el){
    if(el.matches('[data-geo-right],[data-geo-left]')&&!el.ownerSVGElement){const range=document.createRange();range.selectNodeContents(el);return range.getBoundingClientRect();}
    return el.getBoundingClientRect();
  }
  function baseline(el){
    const last=el.dataset.geoLine==='last';
    if(el.tagName.toLowerCase()==='text'||el.tagName.toLowerCase()==='tspan'){
      const n=el.getNumberOfChars();if(!n)throw Error('空SVG文字无法测量');
      const pt=el.getStartPositionOfChar(last?n-1:0),matrix=el.getScreenCTM();
      if(getComputedStyle(el).dominantBaseline!=='auto'&&getComputedStyle(el).dominantBaseline!=='alphabetic')throw Error('SVG基线仅支持alphabetic；其他路径需实际适配');
      return (new DOMPoint(pt.x,pt.y).matrixTransform(matrix).y-sr.top)/sy;
    }
    if(el.ownerSVGElement)throw Error('SVG基线锚点必须放在text/tspan实际文字上');
    // 探针随实际内联格式上下文、字体、换行与transform定位。
    if(/flex|grid/.test(getComputedStyle(el).display))throw Error('文字锚点应放在内联文字容器，而非flex/grid外框');
    const marker=document.createElement('span');marker.style.cssText='display:inline-block;width:0;height:0;padding:0;margin:0;border:0;font-size:0;line-height:0;vertical-align:baseline';
    last?el.append(marker):el.prepend(marker);
    const y=(marker.getBoundingClientRect().top-sr.top)/sy;marker.remove();return y;
  }
  // 保存被测首/末行的实际文字，PDF不能只靠任意一个同基线子串冒充整行。
  function textAtBaseline(el,value){
    const target=sr.top+value*sy;
    if(el.ownerSVGElement){
      const matrix=el.getScreenCTM(),chars=[...el.textContent],parts=[];
      for(let i=0;i<el.getNumberOfChars();i++){const p=el.getStartPositionOfChar(i),y=new DOMPoint(p.x,p.y).matrixTransform(matrix).y;if(Math.abs(y-target)/sy<=tolerance)parts.push(chars[i]||'');}
      return parts.join('');
    }
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),parts=[];let node;
    while(node=walker.nextNode()){if(!node.parentElement||!shown(node.parentElement))continue;let offset=0;for(const char of node.nodeValue){const range=document.createRange();range.setStart(node,offset);offset+=char.length;range.setEnd(node,offset);if([...range.getClientRects()].some(r=>r.width&&target>=r.top-.1&&target<=r.bottom+.1))parts.push(char);}}
    return parts.join('');
  }
  for(const e of slide.querySelectorAll('[data-geo-baseline],[data-geo-left],[data-geo-right],[data-geo-top],[data-geo-bottom],[data-geo-center-y]')){
    if(!shown(e)){errors.push({code:'G-HIDDEN',text:e.textContent.slice(0,50)});continue;}
    const rect=logical(actualRect(e));
    for(const role of ['baseline','left','right','top','bottom','center-y'])if(e.hasAttribute('data-geo-'+role)){
      const group=role+':'+e.getAttribute('data-geo-'+role);
      try{const value=role==='baseline'?baseline(e):role==='center-y'?(rect.top+rect.bottom)/2:rect[role];
        (groups[group]??=[]).push(value);measurements.push({group,value,rect,text:e.textContent.slice(0,160),...(role==='baseline'?{lineSelection:e.dataset.geoLine==='last'?'last':'first',lineText:textAtBaseline(e,value)}:{})});
      }catch(error){errors.push({code:'G-UNSUPPORTED',group,message:error.message});}
    }
  }
  for(const [group,values] of Object.entries(groups)){
    const spread=Math.max(...values)-Math.min(...values);
    if(values.length<2)errors.push({code:'G-INCOMPLETE',group});
    else if(spread>tolerance)errors.push({code:'G-ALIGN',group,spread});
  }
  for(const bar of slide.querySelectorAll('[data-geo-bar]')){
    const v=Number(bar.dataset.geoBar),d=bar.dataset.geoDomain.split(',').map(Number),track=bar.parentElement.getBoundingClientRect(),b=bar.getBoundingClientRect();
    const expected=Math.abs(v)/(d[1]-d[0])*track.width/sx,error=Math.abs(b.width/sx-expected),origin=track.left+(Math.min(0,v)-d[0])/(d[1]-d[0])*track.width;
    if(![v,...d,expected].every(Number.isFinite)||error>tolerance||Math.abs(b.left-origin)/sx>tolerance)errors.push({code:'G-MAPPING',value:v,error});
  }
  for(const e of slide.querySelectorAll('[data-geo-row-center]')){
    const row=[...slide.querySelectorAll('[data-geo-row]')].find(r=>r.dataset.geoRow===e.dataset.geoRowCenter);
    if(!row){errors.push({code:'G-ROW-MISSING'});continue;}
    const rr=row.getBoundingClientRect(),er=e.getBoundingClientRect(),cs=getComputedStyle(row);
    const center=(rr.top+parseFloat(cs.borderTopWidth)*sy+rr.bottom-parseFloat(cs.borderBottomWidth)*sy)/2;
    const error=Math.abs((er.top+er.bottom)/2-center)/sy;
    if(error>tolerance)errors.push({code:'G-CENTER',row:row.dataset.geoRow,error});
  }
  const layouts=[];
  for(const e of slide.querySelectorAll('.layout-split,.layout-paired,.layout-three,.evidence-grid,.precision-row,.proof-layout')){
    const cs=getComputedStyle(e);layouts.push({class:e.className,display:cs.display,columns:cs.gridTemplateColumns});
    if(cs.display!=='grid'||cs.gridTemplateColumns==='none')errors.push({code:'G-LAYOUT-MISSING',class:e.className});
  }
  const content=[...slide.querySelectorAll('.slide__body > *,[data-proof-role]')].filter(shown).map(e=>({role:e.dataset.proofRole||'unspecified',...logical(e.getBoundingClientRect())}));
  return {status:errors.length?'FAIL':Object.keys(groups).length?'PASS':'NOT_DECLARED',toleranceLogicalPx:tolerance,slideSize:{width:slide.offsetWidth,height:slide.offsetHeight},scale:{x:sx,y:sy},groups,measurements,layouts,content,errors,canvas:slide.querySelectorAll('canvas').length?'UNSUPPORTED_WITHOUT_ADAPTER':'NONE'};
}
/* 模块网格对账：布局声明了几格、每格在哪，成稿里就必须真的长在那里。
   这是"布局先约束"的落地判据——README 式的声明只能说明意图，量出来的矩形才是事实。
   expected 由 scripts/layout_contract.cjs 的 resolveModules 产出（逻辑像素，相对版心左上角）。
   自包含，供 Playwright 序列化。 */
function inspectModules(slide,expected){
  const sr=slide.getBoundingClientRect(),sx=sr.width/slide.offsetWidth,sy=sr.height/slide.offsetHeight,tolerance=.35,errors=[],modules=[];
  const logical=r=>({x:(r.left-sr.left)/sx,y:(r.top-sr.top)/sy,width:r.width/sx,height:r.height/sy});
  const nodes=[...slide.querySelectorAll('[data-module]')];
  if(nodes.length!==expected.length){
    errors.push({code:'M-COUNT',got:nodes.length,want:expected.length,detail:'布局声明 '+expected.length+' 格，成稿有 '+nodes.length+' 个 [data-module]；逐格对应才能对账'});
    return {status:'FAIL',toleranceLogicalPx:tolerance,modules,errors};
  }
  nodes.forEach((node,i)=>{
    const want=expected[i],got=logical(node.getBoundingClientRect());
    if((node.dataset.module||'')!==want.slot)errors.push({code:'M-SLOT',index:i,got:node.dataset.module||'',want:want.slot,detail:'第 '+(i+1)+' 格的槽位与布局不符'});
    // 每个方向单独给差值：只说"对不上"等于让作者回去猜是哪一边偏了。
    const delta={x:got.x-want.box.x,y:got.y-want.box.y,width:got.width-want.box.width,height:got.height-want.box.height};
    const rounded=Object.fromEntries(Object.entries(delta).map(([key,value])=>[key,Math.round(value*100)/100]));
    const worst=Math.max(...Object.values(delta).map(Math.abs));
    modules.push({index:i,slot:want.slot,title:want.title,worst:Math.round(worst*100)/100,delta:rounded,want:want.box,got:{x:Math.round(got.x*10)/10,y:Math.round(got.y*10)/10,width:Math.round(got.width*10)/10,height:Math.round(got.height*10)/10}});
    if(worst>tolerance)errors.push({code:'M-GRID',index:i,slot:want.slot,title:want.title,worst:Math.round(worst*100)/100,delta:rounded,want:want.box,got:modules[modules.length-1].got,
      detail:'第 '+(i+1)+' 格「'+want.title+'」实际占位与布局网格不符：模块必须落在 12×6 的格线上，偏移超过 '+tolerance+'px 就说明没按布局排'});
  });
  return {status:errors.length?'FAIL':'PASS',toleranceLogicalPx:tolerance,modules,errors};
}
module.exports={settle,inspectSlide,inspectModules};
