/* SSR 使用交付字体的字形和 tnum 布局；最终仍由浏览器核验字形边界。 */
const fs=require('node:fs'),path=require('node:path'),fontkit=require('fontkit'),type=require('../assets/deck-typography.js');
const cache=new Map();
function measurer(profile){
  const p=type.get(profile),root=path.resolve(__dirname,'../assets/fonts');
  const entries=p.faces.map(id=>({id,...type.faces[id]}));
  function fontFor(entry){if(!cache.has(entry.id))cache.set(entry.id,fontkit.openSync(path.join(root,entry.id+'.woff2')));return cache.get(entry.id);}
  return function measureText(text,font){
    const match=String(font||'14px '+p.body).match(/([\d.]+)px\s+(.+)$/),size=match?+match[1]:14;
    const prefix=String(font).split(/\d+(?:\.\d+)?px/)[0],weight=/\bbold\b/.test(prefix)?600:Number(prefix.match(/\b([1-9]00)\b/)?.[1]||400);
    const families=(match?match[2]:p.body).split(',').map(s=>s.trim().replace(/^['"]|['"]$/g,''));
    const requested=families.some(f=>f.startsWith('Deck '))?families:p.body.split(',').map(s=>s.trim().replace(/^['"]|['"]$/g,''));
    const candidates=requested.flatMap(family=>entries.filter(e=>e.family===family).sort((a,b)=>Math.abs(a.weight-weight)-Math.abs(b.weight-weight)).slice(0,1));
    if(!candidates.length)throw Error('SSR 字体未注册: '+families.join(','));
    let width=0,run='',active=null;
    function flush(){if(!run)return;const f=fontFor(active),layout=f.layout(run,['kern','liga','tnum']);width+=layout.positions.reduce((n,pos)=>n+pos.xAdvance,0)*size/f.unitsPerEm;run='';}
    for(const char of String(text)){
      if(char==='\n'){flush();continue;}
      const entry=candidates.find(e=>fontFor(e).hasGlyphForCodePoint(char.codePointAt(0)));
      if(!entry)throw Error('SSR 缺失字形: '+char);
      if(active!==entry){flush();active=entry;}run+=char;
    }
    flush();return {width};
  };
}
// legacy 明确使用粗略估宽，切换配置也必须重置 API，不能残留上一份报告的字库。
function legacyMeasure(text,font){const size=+(String(font).match(/([\d.]+)px/)?.[1]||14);return {width:[...String(text)].reduce((n,c)=>n+size*(/[\u0020-\u007e]/.test(c)?.6:1),0)};}
function install(echarts,profile){const p=type.get(profile);echarts.setPlatformAPI({measureText:p.faces.length?measurer(p.id):legacyMeasure});return p.faces.length?'fontkit-tnum':'legacy-estimate';}
module.exports={install,measurer};
