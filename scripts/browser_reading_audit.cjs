/* 只读影子测量：HTML 行框与普通 SVG 字符；不输出整页无碰撞或改变旧 QA 判据。 */
function inspectSlide(slide){
  const started=performance.now(),box=slide.getBoundingClientRect(),scale=box.width/(slide.offsetWidth||box.width)||1;
  const observations=[],unsupported=[],lines=[],characters=[],MAX_CHARS=4000,MAX_LINES=1200;
  const shown=el=>{if(!el.getClientRects().length)return false;for(let n=el;n&&n.nodeType===1;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility!=='visible'||+s.opacity===0)return false;}return true;};
  const selector=el=>{const parts=[];for(let n=el;n&&n!==slide;n=n.parentElement)parts.unshift(n.localName+':nth-child('+(Array.prototype.indexOf.call(n.parentElement.children,n)+1)+')');return parts.join(' > ')||':scope';};
  const rect=r=>({x:r.left,y:r.top,width:r.width,height:r.height});
  const logical=r=>({x:(r.x-box.left)/scale,y:(r.y-box.top)/scale,width:r.width/scale,height:r.height/scale});
  const overlap=(a,b)=>({width:Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x),height:Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y)});
  const source=el=>!!el.closest('.source,.page-sources,.bookend-footer,[data-reading-role="source"]');
  const region=el=>{const n=el.closest('[data-module],[data-reading-region],main,aside,.source,.page-sources');return n?{selector:selector(n),id:n.dataset.module||n.dataset.readingRegion||null}:null;};
  const add=(code,a,b,message,confidence='candidate')=>observations.push({code,selector:selector(a.el),region:region(a.el),otherSelector:b?.el?selector(b.el):undefined,text:a.text,bounds:logical(a.rect),otherBounds:b?.rect?logical(b.rect):undefined,message,confidence});
  const rotated=el=>{for(let n=el;n&&n!==slide.parentElement;n=n.parentElement){const t=getComputedStyle(n).transform;if(t!=='none'){const m=new DOMMatrix(t);if(Math.abs(m.b)>.001||Math.abs(m.c)>.001||!m.is2D)return true;}}return false;};
  const walker=document.createTreeWalker(slide,NodeFilter.SHOW_TEXT);let node,limited=false;
  while((node=walker.nextNode())){
    const el=node.parentElement;if(!el||!node.textContent.trim()||!shown(el)||el.closest('script,style,defs,clipPath'))continue;
    if(lines.length>=MAX_LINES||characters.length>=MAX_CHARS){limited=true;break;}
    if(rotated(el)){unsupported.push({selector:selector(el),reason:'旋转/斜切文字：未使用字形四边形，保留人工审查'});continue;}
    const svg=el.closest('svg');
    if(svg){
      if(!el.matches('text,tspan')||el.children.length){unsupported.push({selector:selector(el),reason:'复杂SVG文字嵌套'});continue;}
      const matrix=el.getScreenCTM();if(!matrix||Math.abs(matrix.b)>.001||Math.abs(matrix.c)>.001){unsupported.push({selector:selector(el),reason:'SVG旋转文字'});continue;}
      const range=document.createRange();range.selectNodeContents(node);
      const r=range.getBoundingClientRect();if(r.width&&r.height)lines.push({el,text:node.textContent,rect:rect(r)});
      for(let i=0;i<el.getNumberOfChars()&&characters.length<MAX_CHARS;i++){
        try{const b=el.getExtentOfChar(i),a=new DOMPoint(b.x,b.y).matrixTransform(matrix),z=new DOMPoint(b.x+b.width,b.y+b.height).matrixTransform(matrix);
          characters.push({el,text:el.textContent[i],rect:{x:Math.min(a.x,z.x),y:Math.min(a.y,z.y),width:Math.abs(z.x-a.x),height:Math.abs(z.y-a.y)}});
        }catch{unsupported.push({selector:selector(el),reason:'SVG字符几何不可读'});break;}
      }
    }else{
      const range=document.createRange();range.selectNodeContents(node);
      for(const r of range.getClientRects())if(r.width&&r.height)lines.push({el,text:node.textContent.trim(),rect:rect(r)});
      for(let i=0;i<node.textContent.length&&characters.length<MAX_CHARS;i++)if(node.textContent[i].trim()){
        range.setStart(node,i);range.setEnd(node,i+1);const r=range.getBoundingClientRect();if(r.width&&r.height)characters.push({el,text:node.textContent[i],rect:rect(r)});
      }
    }
  }
  const sorted=lines.sort((a,b)=>a.rect.y-b.rect.y);
  for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length&&sorted[j].rect.y<sorted[i].rect.y+sorted[i].rect.height;j++){
    const a=sorted[i],b=sorted[j];if(a.el===b.el||a.el.contains(b.el)||b.el.contains(a.el))continue;
    const hit=overlap(a.rect,b.rect),min=Math.min(a.rect.width*a.rect.height,b.rect.width*b.rect.height);
    if(hit.width>2*scale&&hit.height>2*scale&&hit.width*hit.height>min*.08)add(source(a.el)!==source(b.el)?'R-SOURCE-OVERLAP':'R-TEXT-OVERLAP',a,b,'实际文字框相交；须查看局部图确认阅读影响');
  }
  const dedup=new Set();
  for(const char of characters){
    const {el}=char;
    for(let ancestor=el.parentElement;ancestor&&ancestor!==slide.parentElement;ancestor=ancestor.parentElement){
      const cs=getComputedStyle(ancestor),clipX=['hidden','clip','scroll','auto'].includes(cs.overflowX),clipY=['hidden','clip','scroll','auto'].includes(cs.overflowY);
      if(cs.clipPath!=='none'){unsupported.push({selector:selector(ancestor),reason:'复杂clip-path，未推断其实际裁切形状'});}
      if(!clipX&&!clipY)continue;
      const r=rect(ancestor.getBoundingClientRect()),c=char.rect;
      const clipped=(clipX&&(c.x<r.x-.8||c.x+c.width>r.x+r.width+.8))||(clipY&&(c.y<r.y-.8||c.y+c.height>r.y+r.height+.8));
      const key=selector(el)+'|'+selector(ancestor)+'|clip';
      if(clipped&&!dedup.has(key)){dedup.add(key);add('R-TEXT-CLIPPED',char,{el:ancestor,rect:r},'字符框超过裁切祖先边界；包含负号或小数点时需特别核对');}
    }
    // 逐字符中心采样可发现负号被实心矩形盖住；只处理明确不透明HTML背景/普通SVG矩形。
    const c=char.rect,x=c.x+c.width/2,y=c.y+c.height/2;
    if(x<0||y<0||x>=innerWidth||y>=innerHeight)continue;
    const stack=document.elementsFromPoint(x,y),self=stack.findIndex(e=>e===el||el.contains(e));
    if(self<0)continue;
    for(const cover of stack.slice(0,self)){
      if(cover.contains(el)||el.contains(cover)||!shown(cover))continue;
      const cs=getComputedStyle(cover);let opacity=1;for(let n=cover;n&&n.nodeType===1;n=n.parentElement)opacity*=+getComputedStyle(n).opacity;
      if(opacity!==1||cs.clipPath!=='none'||cs.borderRadius!=='0px'||rotated(cover))continue;
      const color=cover.matches('rect')?cs.fill:(!cover.closest('svg')?cs.backgroundColor:null);
      if(!color||color==='none'||color==='transparent'||(/rgba/.test(color)&&!/,\s*1\)$/.test(color)))continue;
      if(cover.matches('rect')&&(+cs.fillOpacity!==1||+cover.getAttribute('rx')>0))continue;
      const key=selector(el)+'|'+selector(cover)+'|cover';
      if(!dedup.has(key)){dedup.add(key);add('R-TEXT-OCCLUDED',char,{el:cover,rect:rect(cover.getBoundingClientRect())},'字符中心被前景不透明对象遮挡；未推断整字可读性');}
      break;
    }
  }
  for(const el of slide.querySelectorAll('canvas,img,video,object,iframe,svg path,svg [clip-path]'))if(shown(el))unsupported.push({selector:selector(el),reason:el.localName==='path'?'复杂SVG路径的遮挡未覆盖':'位图/嵌入/复杂裁切须人工检查'});
  return {version:'reading-shadow-1',mode:'shadow',enforced:false,observations,
    coverage:{html:'文字行框/字符中心',svg:'无旋转text/tspan与实心rect；复杂形状未覆盖',lines:lines.length,characters:characters.length,limited:limited||characters.length>=MAX_CHARS,unsupported:[...new Map(unsupported.map(x=>[x.selector+'|'+x.reason,x])).values()],scope:'VIEWPORT_ONLY：遮挡采样仅限当前可见视口；无观测不代表无碰撞'},elapsedMs:Math.round((performance.now()-started)*100)/100};
}
module.exports={inspectSlide};
