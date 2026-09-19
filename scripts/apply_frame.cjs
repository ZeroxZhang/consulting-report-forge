/* 注入可独立打印的母版 CSS；不猜测标题或正文结构，不改数据与展品。 */
const fs=require('node:fs'),path=require('node:path');
const version='1.0.0';
const markup='<div class="slide__frame" aria-hidden="true"></div>';
function apply(html,{style}={}){
  if(!/<html\b/i.test(html)||!/<\/head\s*>/i.test(html))throw Error('母版需要完整 HTML 文档');
  const inheritedMatch=html.match(/<html\b[^>]*\sdata-frame\s*=\s*(?:(["'])(.*?)\1|([^\s>]+))/i);
  const inherited=inheritedMatch?.[2]??inheritedMatch?.[3];
  const selected=style??inherited??'quiet';
  if(!['quiet','off'].includes(selected))throw Error('data-frame 仅支持 quiet / off；自定义视觉请覆盖 CSS token');
  const css=fs.readFileSync(path.join(__dirname,'../assets/deck-frame.css'),'utf8');
  const tag='<style id="deck-frame">\n'+css+'</style>';
  const existing=/<style\b[^>]*\bid\s*=\s*(["'])deck-frame\1[^>]*>[\s\S]*?<\/style>/gi;
  let found=false;
  html=html.replace(existing,()=>{if(found)return '';found=true;return tag;});
  if(!found)html=html.replace(/<\/head\s*>/i,()=>tag+'\n</head>');
  return html.replace(/<html\b[^>]*>/i,m=>m.replace(/\sdata-frame(?:-version)?\s*=\s*(?:(["']).*?\1|[^\s>]+)/gi,'').replace(/>$/,` data-frame="${selected}" data-frame-version="${version}">`));
}
if(require.main===module){
  const [input,output,style]=process.argv.slice(2);
  if(!input||!output)throw Error('用法: node scripts/apply_frame.cjs input.html output.html [quiet|off]');
  if(path.resolve(input)===path.resolve(output))throw Error('请使用新的输出路径，保留输入');
  fs.writeFileSync(output,apply(fs.readFileSync(input,'utf8'),{style}));
}
module.exports={apply,markup,version};
