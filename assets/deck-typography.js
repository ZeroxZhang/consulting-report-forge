/* 字体唯一配置：与配色独立；浏览器和 Node 共用，不读取本机安装字体。 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.DeckTypography=api;})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const version='1.1.0',defaultId='serif-report-bold';
  const body="'Deck Inter','Deck Noto Sans SC',sans-serif";
  const faces={
    'inter-400':{family:'Deck Inter',weight:400},'inter-500':{family:'Deck Inter',weight:500},'inter-600':{family:'Deck Inter',weight:600},
    'noto-sans-sc-400':{family:'Deck Noto Sans SC',weight:400},'noto-sans-sc-600':{family:'Deck Noto Sans SC',weight:600},
    'noto-serif-sc-600':{family:'Deck Noto Serif SC',weight:600},'dm-serif-text-400':{family:'Deck DM Serif Text',weight:400},
    'playfair-display-500':{family:'Deck Playfair Display',weight:500},
    'noto-serif-sc-700':{family:'Deck Noto Serif SC',weight:700},'playfair-display-700':{family:'Deck Playfair Display',weight:700}
  };
  const common=['inter-400','inter-500','inter-600','noto-sans-sc-400','noto-sans-sc-600'];
  const presets={
    'serif-report-bold':{title:"'Deck Playfair Display','Deck Noto Serif SC',serif",latin:'Deck Playfair Display',zh:'Deck Noto Serif SC',weights:{title:700,titleLatin:700},faces:[...common,'noto-serif-sc-700','playfair-display-700']},
    'serif-report':{title:"'Deck DM Serif Text','Deck Noto Serif SC',serif",latin:'Deck DM Serif Text',zh:'Deck Noto Serif SC',weights:{title:600,titleLatin:400},faces:[...common,'noto-serif-sc-600','dm-serif-text-400']},
    'serif-playfair':{title:"'Deck Playfair Display','Deck Noto Serif SC',serif",latin:'Deck Playfair Display',zh:'Deck Noto Serif SC',weights:{title:600,titleLatin:500},faces:[...common,'noto-serif-sc-600','playfair-display-500']},
    'sans-presentation':{title:body,latin:'Deck Inter',zh:'Deck Noto Sans SC',weights:{title:600,titleLatin:600},faces:common},
    'legacy-system':{title:"'PingFang SC','Microsoft YaHei',Arial,sans-serif",body:"Arial,'PingFang SC','Microsoft YaHei',sans-serif",latin:'Arial',zh:'PingFang SC',weights:{title:700,titleLatin:700},faces:[]}
  };
  function get(id){id=id||defaultId;if(!Object.prototype.hasOwnProperty.call(presets,id))throw Error('未知字体配置: '+id);const p=presets[id];return JSON.parse(JSON.stringify({id,version,body:p.body||body,num:p.body||body,...p}));}
  function css(id){const p=get(id);return `:root{--font-title:${p.title};--font-body:${p.body};--font-num:${p.num};--weight-title:${p.weights.title};--weight-title-latin:${p.weights.titleLatin};--fs-title:32px;--lh-title:1.28;--fs-body:17px;--fs-data:16px;--fs-table-head:15px;--fs-subtitle:15px;--fs-exhibit-title:19px;--fs-annotation:15px;--fs-note:12px}
body{font-family:var(--font-body);font-synthesis:none}
.slide__title,.cover-title,.divider-name{font-family:var(--font-title);font-weight:var(--weight-title);font-synthesis:none;letter-spacing:normal}
.slide__title,.reading .slide__title{font-size:var(--fs-title);line-height:var(--lh-title);text-wrap:balance}
.type-latin{font-weight:var(--weight-title-latin)}
.cover-title{font-size:46px;line-height:1.2}.divider-name{font-size:38px;line-height:1.25}
.slide h2,.slide h3,.analytical-table caption{font-family:var(--font-body);font-weight:600}
b,strong,.data-table th,.row-label,.status-label,.evidence-note strong,.analytical-table .total td,.kpi-card .kpi-val,.divider-num{font-weight:600}
.num,.kpi-val,.kpi-delta{font-family:var(--font-num);font-variant-numeric:lining-nums tabular-nums}
.slide svg{font-synthesis:none;text-rendering:geometricPrecision}.slide svg text{font-variant-numeric:lining-nums tabular-nums}.slide svg text[font-weight="700"]{font-weight:600}
.type-note{font-size:14px;line-height:1.5}.source{font-size:12px}
${id==='legacy-system'?'.reading .slide__title{font-size:30px;line-height:1.22}':''}`;}
  function fontCSS(entries,url){return entries.map(f=>`@font-face{font-family:'${f.family}';font-style:normal;font-weight:${f.weight};font-display:block;src:url('${url(f)}') format('woff2')}`).join('\n');}
  // 只处理主标题的西文片段，数字保留标题风格；不改变正文和 SVG 的数据内容。
  function markTitles(doc){
    for(const title of doc.querySelectorAll('.slide__title,.cover-title,.divider-name')){
      const walker=doc.createTreeWalker(title,4),nodes=[];while(walker.nextNode())if(!walker.currentNode.parentElement.closest('.type-latin'))nodes.push(walker.currentNode);
      for(const node of nodes){const parts=node.textContent.split(/([\u0020-\u024f\u1e00-\u1eff]+)/g);if(parts.length===1)continue;const fragment=doc.createDocumentFragment();parts.forEach((part,i)=>{if(i%2&&part.trim()){const span=doc.createElement('span');span.className='type-latin';span.textContent=part;fragment.appendChild(span);}else fragment.appendChild(doc.createTextNode(part));});node.replaceWith(fragment);}
    }
  }
  async function ready(doc){
    const p=get(doc.documentElement.dataset.typography),state={profile:p.id,version,status:'loading',faces:[]};
    doc.documentElement.dataset.fontStatus='loading';markTitles(doc);
    try{
      const packed=doc.getElementById('deck-font-manifest');
      const manifest=packed?JSON.parse(packed.textContent):null;
      const entries=manifest?manifest.faces:p.faces.map(id=>({id,...faces[id],sample:id.startsWith('noto-')?'收入增长':'Revenue 0123456789'}));
      if(manifest&&manifest.profile!==p.id)throw Error('字体清单与当前配置不符');
      for(const f of entries){
        const loaded=await doc.fonts.load(`${f.weight} 16px "${f.family}"`,f.sample||'Revenue 收入');
        if(!loaded.length||loaded.some(x=>x.status!=='loaded'))throw Error('字体未加载: '+f.id);
        state.faces.push({id:f.id,family:f.family,weight:f.weight,status:'loaded'});
      }
      await doc.fonts.ready;state.status=p.id==='legacy-system'?'legacy':'ready';doc.documentElement.dataset.fontStatus=state.status;return state;
    }catch(e){state.status='error';state.error=e.message;doc.documentElement.dataset.fontStatus='error';throw e;}
  }
  function installMetrics(echarts,doc){
    const probe=doc.createElement('span');probe.setAttribute('aria-hidden','true');probe.style.cssText='position:fixed;left:-100000px;top:0;white-space:pre;visibility:hidden;width:auto;height:auto;padding:0;border:0;letter-spacing:normal;font-synthesis:none;font-variant-numeric:lining-nums tabular-nums';doc.body.appendChild(probe);
    echarts.setPlatformAPI({measureText(text,font){probe.style.font=font||'14px '+get(doc.documentElement.dataset.typography).body;probe.style.fontVariantNumeric='lining-nums tabular-nums';probe.textContent=text;return {width:probe.getBoundingClientRect().width};}});
  }
  return {version,defaultId,ids:Object.keys(presets),faces,get,css,fontCSS,markTitles,ready,installMetrics};
});
