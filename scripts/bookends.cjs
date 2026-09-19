/* 构建时生成首尾片段；来源选取由作者完成，本模块不评分、不缩字、不静默删条目。 */
const fs=require('node:fs'),path=require('node:path');
const version='1.0.0';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=value=>String(value??'').trim();
function required(value,name){const text=clean(value);if(!text)throw Error('缺少 '+name);return text;}
function applyStyles(html,{kind}={}){
  if(!/<html\b/i.test(html)||!/<\/head\s*>/i.test(html))throw Error('首尾样式需要完整 HTML');
  if(kind!==undefined&&!['report','collection','fragment'].includes(kind))throw Error('kind 仅支持 report / collection / fragment');
  const tag='<style id="deck-bookends">\n'+fs.readFileSync(path.join(__dirname,'../assets/deck-bookends.css'),'utf8')+'</style>';
  let found=false;
  html=html.replace(/<style\b[^>]*\bid\s*=\s*(["'])deck-bookends\1[^>]*>[\s\S]*?<\/style>/gi,()=>{if(found)return '';found=true;return tag;});
  if(!found)html=html.replace(/<\/head\s*>/i,()=>tag+'\n</head>');
  return html.replace(/<html\b[^>]*>/i,m=>{
    m=m.replace(/\sdata-bookends-version\s*=\s*(?:(["']).*?\1|[^\s>]+)/gi,'');
    if(kind!==undefined)m=m.replace(/\sdata-deck-kind\s*=\s*(?:(["']).*?\1|[^\s>]+)/gi,'');
    return m.replace(/>$/,` data-bookends-version="${version}"${kind===undefined?'':` data-deck-kind="${kind}"`}>`);
  });
}
function bookend(meta,{back=false}={}){
  const title=required(back?(meta.shortTitle||meta.title):meta.title,'报告标题');
  const date=required(meta.date,'报告日期');
  const field=(name,value,cls='')=>clean(value)?`<span${cls?` class="${cls}"`:''} data-report-field="${name}">${escape(value)}</span>`:'';
  const top=[field('producer',meta.producer,'bookend-producer'),field('access',meta.access,'bookend-access')].filter(Boolean).join('');
  const footer=[field('date',date),field('version',meta.version),field('project',meta.project)].filter(Boolean).join('');
  const kind=back?'back-cover':'cover';
  return `<section class="slide${back?'':' cover'}" data-page-role="${kind}" data-frame="off">
  <div class="slide__frame" aria-hidden="true"></div>
  ${top?`<header class="bookend-top">${top}</header>`:''}
  <div class="bookend-main">
    ${!back&&clean(meta.type)?`<p class="bookend-kicker">${escape(meta.type)}</p>`:''}
    ${!back&&clean(meta.client)?`<p class="bookend-client">致：<strong>${escape(meta.client)}</strong></p>`:''}
    <h1 class="cover-title">${escape(title).replace(/\r?\n/g,'<br>')}</h1>
    ${clean(back?meta.closingText:meta.subtitle)?`<p class="bookend-subtitle">${escape(back?meta.closingText:meta.subtitle)}</p>`:''}
  </div>
  <footer class="bookend-footer"><div class="bookend-meta">${footer}</div>${clean(meta.statement)?`<p class="bookend-statement" data-report-field="statement">${escape(meta.statement)}</p>`:''}</footer>
</section>`.replace(/[ \t]+$/gm,'');
}
function normalizeSources(sources){
  if(!Array.isArray(sources)||!sources.length)throw Error('参考资料需要至少一项真实使用的来源；示意稿可明确记录合成材料');
  const ids=new Map(),identities=new Map(),out=[];
  for(const raw of sources){
    if(!raw||typeof raw!=='object')throw Error('来源需要对象');
    const s=Object.fromEntries(['id','author','title','date','version','locator','kind','url'].map(k=>[k,clean(raw[k])]));
    s.title=required(s.title,'资料标题');
    if(s.url){let url;try{url=new URL(s.url);}catch(e){throw Error('来源 URL 不是绝对网址: '+s.title);}if(!['https:','http:'].includes(url.protocol))throw Error('来源链接仅支持 http / https: '+s.title);s.url=url.href;}
    // URL 相同不等于同一版本；标题、年份与版本共同保留资料身份。
    const identity=JSON.stringify([s.author,s.title,s.date,s.version,s.kind,s.url]);
    const record=JSON.stringify({...s,id:''});
    if(s.id&&ids.has(s.id)){if(ids.get(s.id)!==record)throw Error('来源 ID 冲突: '+s.id);continue;}
    if(identities.has(identity)){
      const previous=identities.get(identity);
      if(s.id&&s.id!==previous.id)throw Error('同一资料使用不同 ID，请先合并: '+previous.id+' / '+s.id);
      if(s.locator!==previous.locator)previous.locator=[...new Set([previous.locator,s.locator].filter(Boolean))].join('；');
      continue;
    }
    s.id=s.id||'S'+(out.length+1);
    if(ids.has(s.id))throw Error('自动来源 ID 与现有 ID 冲突，请显式指定: '+s.id);
    ids.set(s.id,record);identities.set(identity,s);out.push(s);
  }
  return out;
}
function references({sources,selectedIds,columns=1,splitAt,note='',page}={}){
  const all=normalizeSources(sources);
  if(![1,2].includes(columns))throw Error('参考资料支持单栏或双栏；复杂布局可直接制作并实测');
  if(selectedIds!==undefined&&(!Array.isArray(selectedIds)||!selectedIds.length||new Set(selectedIds).size!==selectedIds.length))throw Error('selectedIds 必须是非空且不重复的来源 ID 数组');
  if(selectedIds?.some(id=>!all.some(s=>s.id===id)))throw Error('selectedIds 包含未知来源 ID');
  const selected=selectedIds?all.filter(s=>selectedIds.includes(s.id)):all;
  const excerpt=selected.length<all.length;
  const title=excerpt?'主要参考资料（节选）':'参考资料';
  let split=splitAt??Math.ceil(selected.length/2);
  if(columns===2&&(!Number.isInteger(split)||split<1||split>=selected.length))throw Error('双栏 splitAt 必须使两栏均有条目');
  const entry=s=>{
    const title=s.url?`<a class="reference-title" href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">《${escape(s.title)}》</a>`:`<span class="reference-title">《${escape(s.title)}》</span>`;
    const detail=[s.date,s.version,s.kind,s.locator].filter(Boolean).map(escape).join(' · ');
    return `<li class="reference-item" data-reference-id="${escape(s.id)}"><span class="reference-number">[${escape(s.id)}]</span><div class="reference-text">${s.author?escape(s.author)+' · ':''}${title}${detail?`<span class="reference-detail"> · ${detail}</span>`:''}</div></li>`;
  };
  const groups=columns===1?[selected]:[selected.slice(0,split),selected.slice(split)];
  const selection=[excerpt?`本页列示 ${selected.length} 项主要来源（共 ${all.length} 项）。`:'',clean(note)].filter(Boolean).join(' ');
  return `<section class="slide reading" data-page-role="references" data-frame-boundary="line" data-reference-scope="${excerpt?'selected':'all'}" data-reference-total="${all.length}">
  <div class="slide__frame" aria-hidden="true"></div>
  <header class="slide__header"><h1 class="slide__title">${title}</h1></header>
  <div class="slide__body"><div class="reference-columns" data-columns="${columns}">${groups.map(g=>`<ol class="reference-list">${g.map(entry).join('\n')}</ol>`).join('')}</div>${selection?`<p class="reference-selection">${escape(selection)}</p>`:''}</div>
  ${page!==undefined?`<div class="slide__page">${escape(page)}</div>`:''}
</section>`;
}
if(require.main===module){
  const [input,output,kind]=process.argv.slice(2);
  if(!input||!output)throw Error('用法: node scripts/bookends.cjs input.html output.html [report|collection|fragment]');
  if(path.resolve(input)===path.resolve(output))throw Error('请使用新的输出路径，保留输入');
  fs.writeFileSync(output,applyStyles(fs.readFileSync(input,'utf8'),{kind}));
}
module.exports={version,applyStyles,cover:meta=>bookend(meta),backCover:meta=>bookend(meta,{back:true}),references,normalizeSources,escape};
