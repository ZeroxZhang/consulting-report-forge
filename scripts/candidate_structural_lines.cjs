/* 浏览器影子观测，不豁免原策略错误；低对比细线候选不等于证明结构用途。 */
function inspectSlide(slide){
  const candidates=[];
  const label=el=>{const parts=[];for(let n=el;n&&n!==slide;n=n.parentElement)parts.unshift(n.localName+':nth-child('+(Array.prototype.indexOf.call(n.parentElement.children,n)+1)+')');return parts.join(' > ');};
  const rgba=color=>{const ctx=document.createElement('canvas').getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
  const luminance=rgb=>rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
  const quiet=(color,el)=>{
    const [r,g,b,a]=rgba(color);if(a!==255||Math.max(r,g,b)-Math.min(r,g,b)>64||Math.min(r,g,b)<140)return false;
    let background;
    for(let n=el;n&&n.nodeType===1;n=n.parentElement){const cs=getComputedStyle(n);if(cs.backgroundImage!=='none'||+cs.opacity!==1)return false;const rgb=rgba(cs.backgroundColor);if(rgb[3]===255){background=rgb;break;}if(rgb[3]!==0)return false;}
    if(!background)return false;
    const first=luminance([r,g,b]),second=luminance(background);return (Math.max(first,second)+.05)/(Math.min(first,second)+.05)<=2;
  };
  for(const el of slide.querySelectorAll('*')){
    if(!el.getClientRects().length||el.closest('svg'))continue;
    const style=getComputedStyle(el);
    for(const side of ['Top','Bottom'])if(style['border'+side+'Style']==='solid'&&parseFloat(style['border'+side+'Width'])>0&&parseFloat(style['border'+side+'Width'])<=1&&el.getBoundingClientRect().width>=70&&quiet(style['border'+side+'Color'],el))candidates.push({code:'C-STRUCTURAL-LINE',selector:label(el),side:side.toLowerCase(),message:'低对比水平边框细线候选；旧规则结果保留'});
    for(const pseudo of ['::before','::after']){
      const p=getComputedStyle(el,pseudo),s=getComputedStyle(el);
      if(['none','normal'].includes(p.content)||p.display==='none'||p.visibility!=='visible'||+p.opacity!==1||s.visibility!=='visible')continue;
      const w=parseFloat(p.width),h=parseFloat(p.height);
      if(!(h>0&&h<=1&&w>=70)||!['left','right','top','bottom'].some(k=>parseFloat(p[k])===0))continue;
      if(p.backgroundImage!=='none'||p.boxShadow!=='none'||['Top','Right','Bottom','Left'].some(k=>parseFloat(p['border'+k+'Width'])>0))continue;
      if(!quiet(p.backgroundColor,el))continue;
      const parts=[];for(let n=el;n&&n!==slide;n=n.parentElement)parts.unshift(n.localName+':nth-child('+(Array.prototype.indexOf.call(n.parentElement.children,n)+1)+')');
      candidates.push({code:'C-STRUCTURAL-LINE',selector:parts.join(' > '),pseudo,message:'低对比水平细线候选；待确认其结构用途，旧规则结果保留'});
    }
  }
  return {candidate:true,policy:'structural-lines-candidate-1',enforced:false,candidates};
}
module.exports={inspectSlide};
