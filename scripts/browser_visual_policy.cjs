/* 在真实浏览器中调用；函数自包含，可由 Playwright 序列化。诊断不作审美 PASS。 */
function inspectSlide(slide) {
  const errors = [], warnings = [], findings = [];
  const sr = slide.getBoundingClientRect(), scale = sr.width / (slide.offsetWidth || sr.width) || 1;
  const densityProfile = slide.dataset.densityProfile || '';
  const bounds = el => { const r = el.getBoundingClientRect(); return { x: (r.left-sr.left)/scale, y: (r.top-sr.top)/scale, width:r.width/scale, height:r.height/scale }; };
  const shown = el => { if (!el.getClientRects().length) return false; for(let n=el;n&&n.nodeType===1;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||s.visibility!=='visible'||+s.opacity===0)return false;}const r=el.getBoundingClientRect();return r.width>0&&r.height>0; };
  const label = el => { const parts=[];for(let n=el;n&&n!==slide;n=n.parentElement){const tag=n.localName;parts.unshift(`${tag}:nth-child(${Array.prototype.indexOf.call(n.parentElement.children,n)+1})`);}return parts.join(' > ')||':scope'; };
  const add = (list,code,el,message,extra={}) => list.push({code,selector:label(el),message,bounds:bounds(el),...extra});
  const painted = c => c && c!=='transparent' && !/rgba?\([^)]*[,/]\s*0(?:\.0+)?\s*\)$/.test(c);
  const saturated = c => {const m=c.match(/[\d.]+/g);return m&&m.length>=3&&Math.max(...m.slice(0,3).map(Number))-Math.min(...m.slice(0,3).map(Number))>24;};
  const structural = el => el.matches('h1,h2,h3,h4,h5,h6,table,thead,tbody,tfoot,tr,td,th,hr,.source,.slide__title,.slide__lead,.slide__tracker,.slide__page,.bookend-footer') || el===slide;
  // 仅豁免真实页头下方的 quiet 细线：结构、位置、尺寸与低对比外观共同匹配，类名本身不是通行证。
  const quietHeaderRule = (el,pseudo,p) => {
    const header=slide.querySelector(':scope > .slide__header'),body=slide.querySelector(':scope > .slide__body');
    if(el!==header||pseudo!=='::after'||!body||!header.querySelector('.slide__title')||!(header.compareDocumentPosition(body)&Node.DOCUMENT_POSITION_FOLLOWING))return false;
    const frame=slide.getAttribute('data-frame')||document.documentElement.getAttribute('data-frame');
    // 网格版心的线在标题带边界（0）；非网格母版放在边界下方（负值）。其余外观约束不变。
    if(frame!=='quiet'||slide.dataset.frameBoundary!=='line'||p.position!=='absolute'||Math.abs(parseFloat(p.height)-1)>.1||parseFloat(p.left)!==0||parseFloat(p.right)!==0||!Number.isFinite(parseFloat(p.bottom))||parseFloat(p.bottom)>0||parseFloat(p.bottom)<-16||parseFloat(p.width)<slide.clientWidth*.75)return false;
    if(p.backgroundImage!=='none'||p.boxShadow!=='none'||['Top','Right','Bottom','Left'].some(side=>parseFloat(p['border'+side+'Width'])>0))return false;
    // Canvas 在离屏内只解析颜色；不读取页面像素、不改变报告 DOM。
    const ctx=document.createElement('canvas').getContext('2d');ctx.fillStyle=p.backgroundColor;ctx.fillRect(0,0,1,1);const rgb=[...ctx.getImageData(0,0,1,1).data].slice(0,3);
    return Math.max(...rgb)-Math.min(...rgb)<=24&&Math.min(...rgb)>=140;
  };
  const nodes=[...slide.querySelectorAll('*')].filter(shown);
  const textModule = el => el && !el.closest('svg,canvas,table') && !structural(el) && (el.textContent||'').trim().length>0 && bounds(el).width>=70 && bounds(el).height>=32;
  for (const el of nodes) {
    if(el.closest('svg')) continue;
    const s=getComputedStyle(el), b=bounds(el);
    if(textModule(el)) {
      const sides=['Top','Right','Bottom','Left'].map(side=>({side,width:parseFloat(s[`border${side}Width`]),color:s[`border${side}Color`],style:s[`border${side}Style`]}));
      const visible=sides.filter(x=>x.width>0&&x.style!=='none'&&painted(x.color));
      // 整圈普通框线、薄中性分隔线不是色条模块；粗单边或有色单边属于可识别禁用外观。
      const accent=visible.filter(x=>(x.width>=2||saturated(x.color))&&x.width<=16);
      if(accent.length && !(visible.length===4&&visible.every(x=>x.width===visible[0].width&&x.color===visible[0].color)))
        add(errors,'V-DECORATIVE-EDGE',el,'文字或数字模块使用装饰性边条，应重排为无边条表达。',{sides:accent.map(x=>x.side.toLowerCase())});
      // 常见零模糊、零扩散的 inset 阴影模拟边条；复杂阴影保留人工检查范围。
      if(s.boxShadow!=='none') {
        const shadows=s.boxShadow.split(/,(?![^()]*\))/);
        for(const shadow of shadows){const nums=shadow.replace(/rgba?\([^)]*\)/g,'').match(/-?[\d.]+px/g)||[];const [x,y,blur=0,spread=0]=nums.map(parseFloat);if(shadow.includes('inset')&&blur===0&&spread===0&&((Math.abs(x)>=2&&Math.abs(x)<=16&&y===0)||(Math.abs(y)>=2&&Math.abs(y)<=16&&x===0))){add(errors,'V-DECORATIVE-SHADOW',el,'模块以内嵌阴影模拟装饰边条。');break;}else add(findings,'V-SHADOW-MANUAL',el,'此阴影路径需实际看图确认是否构成装饰边条。');}
      }
      if(s.backgroundImage!=='none') add(findings,'V-BACKGROUND-MANUAL',el,'背景图像或渐变的视觉用途需实际看图，未自动判定是否模拟边条。');
      // 背景框真实文字结束后仍有大量空置，只作为定位线索，不使用填充率判定。
      if(painted(s.backgroundColor)&&!el.querySelector('svg,canvas,img,video,table')){
        const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT), rects=[];let n;
        while((n=walker.nextNode())){if(!n.textContent.trim()||!shown(n.parentElement))continue;const range=document.createRange();range.selectNodeContents(n);rects.push(...range.getClientRects());}
        if(rects.length){const bottom=Math.max(...rects.map(r=>r.bottom));const gap=(el.getBoundingClientRect().bottom-bottom)/scale;if(gap>72&&b.height>140)add(warnings,'V-EMPTY-MODULE',el,`模块文字下方约 ${Math.round(gap)}px 无内容，需检查是否被轨道伸展成空框。`);}
      }
    }
    if(textModule(el)) for(const pseudo of ['::before','::after']) {
      const p=getComputedStyle(el,pseudo);if(p.content==='none'||p.content==='normal'||p.display==='none'||p.visibility!=='visible'||+p.opacity===0)continue;
      if(quietHeaderRule(el,pseudo,p)){add(findings,'V-QUIET-HEADER',el,'已识别真实页头下方的低对比 quiet 母版细线。');continue;}
      const w=parseFloat(p.width),h=parseFloat(p.height),thin=(w>0&&w<=16&&h>=32)||(h>0&&h<=16&&w>=70);
      const edge=(parseFloat(p.left)===0||parseFloat(p.right)===0||parseFloat(p.top)===0||parseFloat(p.bottom)===0);
      if(thin&&edge&&painted(p.backgroundColor))add(errors,'V-DECORATIVE-PSEUDO',el,`${pseudo} 在文字模块边缘模拟装饰边条。`,{pseudo});
      else if(p.backgroundImage!=='none'||p.boxShadow!=='none'||['Top','Right','Bottom','Left'].some(k=>parseFloat(p[`border${k}Width`])>0))add(findings,'V-PSEUDO-MANUAL',el,`${pseudo} 的复杂绘制路径需实际看图补查。`,{pseudo});
    }
    // 无字窄色块紧贴有字模块边缘；不匹配独立图表数据条或坐标轴。
    if(!(el.textContent||'').trim()&&!el.children.length&&painted(s.backgroundColor)&&textModule(el.parentElement)&&s.position==='absolute') {
      const p=bounds(el.parentElement), thin=(b.width>0&&b.width<=16&&b.height>=p.height*.8)||(b.height>0&&b.height<=16&&b.width>=p.width*.8);
      const edge=Math.abs(b.x-p.x)<1||Math.abs(b.y-p.y)<1||Math.abs(b.x+b.width-p.x-p.width)<1||Math.abs(b.y+b.height-p.y-p.height)<1;
      if(thin&&edge)add(errors,'V-DECORATIVE-STRIP',el,'绝对定位窄色块贴在文字模块边缘，形成装饰边条。');
    }
  }
  for(const el of nodes.filter(el=>el.matches('svg,canvas,img,video,object,iframe'))) add(findings,'V-RASTER-VECTOR-MANUAL',el,'SVG、位图及嵌入内容的装饰边条与视觉均衡须结合整页和实际 PDF 人工检查；此检查器不证明其合规。');
  const body=slide.querySelector('.slide__body');
  if(body&&shown(body)){
    const leaves=[...body.querySelectorAll('*')].filter(el=>shown(el)&&!el.closest('.source')&&(el.matches('svg,canvas,img,table')||(!el.children.length&&(el.textContent||'').trim())));
    const br=bounds(body);if(leaves.length){const bottom=Math.max(...leaves.map(el=>{const b=bounds(el);return b.y+b.height;})),gap=br.y+br.height-bottom;if(gap>120){const message=`正文实际对象下方约 ${Math.round(gap)}px 剩余空间，需检查其分组、强调或节奏用途。`;if(['balanced','dense'].includes(densityProfile))add(errors,'V-UNDERFILLED-PAGE',body,message,{densityProfile,trailingGap:Math.round(gap)});else add(warnings,'V-BODY-REMAINDER',body,message,{densityProfile:densityProfile||'undeclared',trailingGap:Math.round(gap)});}}
    // 文字、图表或表格之间出现大面积“空洞”时，底部是否有 takeaway 已无法说明页面均衡。
    // 仅对作者在 pages.json 中主动承诺为 balanced/dense 的页面升级为错误；sparse 必须由合同写明理由后再作人工判断。
    const units=[...body.querySelectorAll('svg,canvas,img,table,p,ol,ul')].filter(el=>shown(el)&&!el.closest('.source')&&(el.matches('svg,canvas,img,table')||!el.closest('svg,table'))&&bounds(el).width>=42&&bounds(el).height>=8).map(bounds).sort((a,b)=>a.y-b.y);
    const merged=[];
    for(const unit of units){const last=merged[merged.length-1];if(last&&unit.y<=last.bottom+8)last.bottom=Math.max(last.bottom,unit.y+unit.height);else merged.push({top:unit.y,bottom:unit.y+unit.height});}
    const gaps=[];
    for(let i=1;i<merged.length;i++){const gap=merged[i].top-merged[i-1].bottom;if(gap>0)gaps.push({gap,from:merged[i-1].bottom,to:merged[i].top});}
    const largest=gaps.sort((a,b)=>b.gap-a.gap)[0];
    if(largest&&largest.gap>112&&largest.gap>br.height*.18){
      const message=`正文第${Math.round(largest.from-br.y)}–${Math.round(largest.to-br.y)}px 出现约 ${Math.round(largest.gap)}px 的内容空洞；应补强支持证据、注释或解释，或收紧布局，不能以拉伸容器维持空白。`;
      if(['balanced','dense'].includes(densityProfile)) add(errors,'V-UNDERFILLED-PAGE',body,message,{densityProfile,verticalGap:Math.round(largest.gap)});
      else add(warnings,'V-INTERNAL-VOID',body,message,{densityProfile:densityProfile||'undeclared',verticalGap:Math.round(largest.gap)});
    }
    const source=slide.querySelector('.source');if(source&&shown(source)){const top=bounds(source).y;for(const el of leaves){const b=bounds(el);if(b.y<top&&b.y+b.height>top+1)add(warnings,'V-SOURCE-COLLISION',el,'正文对象进入来源区域，请检查来源安全区与关键限定。');}}
  }
  findings.push({code:'V-COVERAGE',message:'自动范围：可见 HTML 模块的典型边框、简单伪元素/窄块、零模糊 inset 阴影，以及局部空置线索。小于70×32px的文字装饰、复杂绘制、未声明对齐关系和整页重心仍须逐页实际审查；无错误不代表视觉通过。'});
  return {errors,warnings,findings};
}
module.exports={inspectSlide};
