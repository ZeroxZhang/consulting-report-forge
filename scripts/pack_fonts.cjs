/* 将固定字体按成稿字符子集嵌入；构建时依赖 Python/fonttools，交付无此依赖。 */
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),type=require('../assets/deck-typography.js');
const safeJSON=v=>JSON.stringify(v).replace(/</g,'\\u003c');
// 与 probe_capabilities.cjs 同一套解析顺序：显式 FONT_PYTHON > 随包 .font-venv > 系统 python3。
const fontPython=()=>process.env.FONT_PYTHON||(()=>{const p=path.resolve(__dirname,'../.font-venv/bin/python');return fs.existsSync(p)?p:'python3';})();
function decode(s){return s.replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,k)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '})[k]);}
function collect(html,extra=''){
  // 页内 DOM、SVG 文本和 data-spec/data-opt 共用字符库，包含尚未显示的图表与翻页。
  const specs=[...html.matchAll(/data-(?:spec|opt)=(['"])([\s\S]*?)\1/g)].map(m=>decode(m[2])).join('');
  const visible=html.replace(/<script\b[\s\S]*?<\/script>/gi,'').replace(/<style\b[\s\S]*?<\/style>/gi,'').replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]+>/g,'');
  const ascii=Array.from({length:95},(_,i)=>String.fromCharCode(32+i)).join('');
  return [...new Set(decode(visible)+specs+extra+ascii+'%+−—–/()[]:;￥¥$€£亿元万元年月日%对象期间原值总量起点终点流量节点规模气泡面积与规模成正比最大圆单位未提供缺失')].sort().join('');
}
function pack(html,{profile,extraText='',assetDir}={}){
  const inherited=html.match(/data-typography="([^"]+)"/)?.[1];const p=type.get(profile||inherited);
  for(const id of ['deck-fonts','deck-typography-style','deck-font-manifest','deck-font-license','deck-typography-runtime'])html=html.replace(new RegExp('<(?:style|script)\\b[^>]*id="'+id+'"[^>]*>[\\s\\S]*?<\\/(?:style|script)>','g'),'');
  html=html.replace(/<link\b[^>]*data-deck-fonts[^>]*>/g,'').replace(/<script src="\.\/deck-typography.js"><\/script>/g,'');
  const text=collect(html,extraText);
  let bundle={faces:[],licenses:{}};
  const families=s=>s.split(',').map(s=>s.trim().replace(/^['"]|['"]$/g,''));
  const specs=[...html.matchAll(/data-(?:spec|opt)=(['"])([\s\S]*?)\1/g)].map(m=>decode(m[2])).join('');
  if(p.faces.length)bundle=JSON.parse(execFileSync(fontPython(),[path.join(__dirname,'font_assets.py')],{input:JSON.stringify({faces:p.faces,text,assetDir,html,supportText:collect('',extraText+specs),roleFamilies:{title:families(p.title),body:families(p.body)}}),encoding:'utf8',maxBuffer:30*1024*1024}));
  const fontCSS=type.fontCSS(bundle.faces,f=>'data:font/woff2;base64,'+f.data);
  const manifest={profile:p.id,version:p.version,delivery:'embedded-subset',faces:bundle.faces.map(({data,...f})=>f)};
  const runtime=fs.readFileSync(path.join(__dirname,'../assets/deck-typography.js'),'utf8');
  const tags=`<style id="deck-fonts">${fontCSS}</style>\n<style id="deck-typography-style">${type.css(p.id)}</style>\n<script id="deck-font-manifest" type="application/json">${safeJSON(manifest)}</script>\n<script id="deck-font-license" type="application/json">${safeJSON(bundle.licenses)}</script>\n`;
  html=html.replace(/<html\b[^>]*>/,m=>m.replace(/ data-typography(?:-version)?="[^"]*"/g,'').replace('>',' data-typography="'+p.id+'" data-typography-version="'+p.version+'">'));
  return html.replace('<head>','<head>\n<script id="deck-typography-runtime">'+runtime+'</script>').replace('</head>',tags+'</head>');
}
if(require.main===module){const [input,output,profile]=process.argv.slice(2);if(!input||!output)throw Error('用法: node scripts/pack_fonts.cjs input.html output.html [profile]');if(path.resolve(input)===path.resolve(output))throw Error('请使用新的输出路径，保留输入');fs.writeFileSync(output,pack(fs.readFileSync(input,'utf8'),{profile}));}
module.exports={pack,collect};
