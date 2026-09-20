/* 用完整主题覆盖引擎CSS并内联配方；静态图换主题仍须从数据重建。 */
const fs=require('node:fs'),path=require('node:path'),themes=require('../assets/deck-themes.js');
const argv=process.argv.slice(2),at=argv.indexOf('--contract');let contractFile;
if(at!==-1){contractFile=argv[at+1];if(!contractFile)throw Error('--contract缺少文件');argv.splice(at,2);}
let [input,output,id,profile]=argv;
if(!input||!output)throw Error('用法: node scripts/apply_theme.cjs assets/deck_engine.html output.html [mckinsey|bcg|accenture] [serif-report-bold|serif-report|serif-playfair|sans-presentation|legacy-system]');
const contracts=require('./report_contract.cjs');
const sourceHtml=fs.readFileSync(input,'utf8');
const defaults={kind:sourceHtml.match(/data-deck-kind=["']([^"']+)/)?.[1]||'fragment',mode:/class=["'][^"']*\breading\b/.test(sourceHtml)?'reading':'presentation',theme:id||sourceHtml.match(/data-theme=["']([^"']+)/)?.[1]||'mckinsey',typography:profile||sourceHtml.match(/data-typography=["']([^"']+)/)?.[1]||'serif-report-bold',ratio:sourceHtml.match(/data-ratio=["']([^"']+)/)?.[1]||'16x9'};
const task=contractFile?contracts.load(contractFile,output,defaults):contracts.read(sourceHtml)||contracts.normalize({},defaults);
if(id&&id!==task.theme||profile&&profile!==task.typography)throw Error('主题/字体参数与已有任务合同冲突；有意变更请更新--contract');
id=task.theme;profile=task.typography;
let html=themes.apply(sourceHtml,id);
// 比例是实际引擎参数；显式变更后必须重新QA。媒介仅核对，不擅自改正文排版。
html=html.replace(/<body\b[^>]*>/i, tag=>tag.replace(/\sdata-ratio\s*=\s*(["']).*?\1/i,'').replace(/>$/,' data-ratio="'+task.ratio+'">'));
for(const tag of html.match(/<section\b[^>]*>/gi)||[]){
 const classes=tag.match(/\bclass\s*=\s*(["'])(.*?)\1/i)?.[2]?.split(/\s+/)||[];
 if(task.kind==='collection'||!classes.includes('slide')||/data-page-role=["'](?:cover|references|back-cover|divider)["']/.test(tag))continue;
 if(classes.includes('reading')!==(task.mode==='reading'))throw Error('正文媒介与任务mode冲突；请按目标媒介重新排版');
}

// 初始化一次装好正文必需资源；重复应用主题不会留下旧副本。
for(const [tag,name] of [['deck-layouts','consulting-layouts.css'],['deck-geometry','deck-geometry.css']]){
  html=html.replace(new RegExp('<style\\b[^>]*id="'+tag+'"[^>]*>[\\s\\S]*?<\\/style>','g'),'');
  html=html.replace('</head>',`<style id="${tag}">${fs.readFileSync(path.resolve(__dirname,'../assets',name),'utf8')}</style>\n</head>`);
}
html=contracts.install(html,task);
for(const name of ['echarts-recipes.js','chart-runtime.js']){
  const source=fs.readFileSync(path.resolve(__dirname,'../assets',name),'utf8');
  html=html.replace('<script src="./'+name+'"></script>',()=>`<script>\n${source}\n</script>`);
}
html=require('./pack_fonts.cjs').pack(require('./bookends.cjs').applyStyles(require('./apply_frame.cjs').apply(html)),{profile});
fs.writeFileSync(output,html);
