/* 自由组合节点、关系与分组；坐标表达布局，业务含义由作者核对。 */
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const themes=require('../assets/deck-themes.js');
const typography=require('../assets/deck-typography.js');
const {measurer}=require('./font_metrics.cjs');
const {layout}=require('./diagram_layout.cjs');
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function number(value,label){if(typeof value!=='number'||!Number.isFinite(value))throw Error(label+'必须为有限数字');return value;}
function render(spec){
  if(spec.layout)spec=layout(spec);
  const width=number(spec.width??1000,'width'),height=number(spec.height??500,'height');
  if(width<=0||height<=0)throw Error('画布尺寸必须为正');
  const type=typography.get(spec.typography_id),palette=themes.palette(spec.theme_id),measure=measurer(type.id);
  if(!type.faces.length)throw Error('图示文字测量需要已注册字体配置，请选择 serif-report、serif-playfair 或 sans-presentation');
  const id=String(spec.id||'diagram-'+createHash('sha256').update(JSON.stringify(spec)).digest('hex').slice(0,12)).replace(/[^a-zA-Z0-9_-]/g,'_');
  const color=(value,fallback)=>{if(!value)return fallback;if(palette[value]&&typeof palette[value]==='string')return palette[value];if(/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value))return value;throw Error('颜色需主题角色或HEX：'+value);};
  function box(item,label){const b={...item};for(const key of ['x','y','w','h'])b[key]=number(item[key],label+'.'+key);if(b.w<=0||b.h<=0||b.x<0||b.y<0||b.x+b.w>width+.1||b.y+b.h>height+.1)throw Error(label+'区域超出画布或尺寸无效');return b;}
  function wrap(text,max,size,weight=400){
    const lines=[];const font=`${weight} ${size}px ${type.body}`;
    for(const paragraph of String(text??'').split('\n')){
      let line='';for(const char of paragraph){if(measure(char,font).width>max)throw Error('文字区不足一个字宽');if(line&&measure(line+char,font).width>max){lines.push(line.trimEnd());line=char;}else line+=char;}if(line||!paragraph)lines.push(line);
    }return lines;
  }
  function label(text,x,y,{size=16,weight=400,fill=palette.ink,anchor='start'}={}){
    number(x,'标签x');number(y,'标签y');number(size,'字号');if(size<=0)throw Error('字号必须为正');
    if(!['start','middle','end'].includes(anchor))throw Error('未知文字锚点');
    if(![400,600].includes(weight))throw Error('文字字重需为已提供的400或600');
    const w=measure(String(text),`${weight} ${size}px ${type.body}`).width;
    const left=x-(anchor==='middle'?w/2:anchor==='end'?w:0);
    if(left<-.5||left+w>width+.5||y-size<-.5||y>height+.5)throw Error('标签超出画布：'+String(text).slice(0,30));
    return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}">${escape(text)}</text>`;
  }
  const groups=(spec.groups||[]).map((g,i)=>{const b=box(g,'group '+i);b.radius=number(g.radius??0,'group radius');if(b.radius<0)throw Error('圆角不得为负');return b;});
  const nodes=(spec.nodes||[]).map((n,i)=>box(n,'node '+(n.id||i))),byId=new Map();
  if(!nodes.length)throw Error('需要至少一个节点');
  for(const n of nodes){if(typeof n.id!=='string'||!n.id.trim()||byId.has(n.id))throw Error('节点id须唯一且非空');if(!String(n.title??n.label??'').trim())throw Error(n.id+'缺少标题');byId.set(n.id,n);}
  const groupSVG=groups.map(g=>`<g><rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="${g.radius??0}" fill="${color(g.fill,palette.surface)}" stroke="${color(g.stroke,palette.grid)}"/>${g.title?label(g.title,g.x+14,g.y+26,{size:18,weight:600}):''}</g>`).join('');
  function anchor(node,other,side){
    let dx=other.x+other.w/2-node.x-node.w/2,dy=other.y+other.h/2-node.y-node.h/2;
    if(side){const vectors={left:[-1,0],right:[1,0],top:[0,-1],bottom:[0,1]};if(!vectors[side])throw Error('未知连接边：'+side);[dx,dy]=vectors[side];}
    if(!dx&&!dy)throw Error('同中心节点请指定连接边与折线');
    const rx=node.w/2,ry=node.h/2,shape=node.shape||'rect';
    const t=shape==='ellipse'?1/Math.sqrt(dx*dx/rx/rx+dy*dy/ry/ry):shape==='diamond'?1/(Math.abs(dx)/rx+Math.abs(dy)/ry):Math.min(dx?rx/Math.abs(dx):Infinity,dy?ry/Math.abs(dy):Infinity);
    return [node.x+rx+dx*t,node.y+ry+dy*t];
  }
  const edgeSVG=(spec.edges||[]).map((e,i)=>{
    const a=byId.get(e.from),b=byId.get(e.to);if(!a||!b)throw Error('边'+i+'引用不存在的节点');
    const points=[anchor(a,b,e.fromSide),...(e.points||[]),anchor(b,a,e.toSide)];
    for(const pt of points){if(!Array.isArray(pt)||pt.length!==2)throw Error('折线点需[x,y]');number(pt[0],'边x');number(pt[1],'边y');if(pt[0]<0||pt[0]>width||pt[1]<0||pt[1]>height)throw Error('边超出画布');}
    const stroke=color(e.color,palette.muted),strokeWidth=number(e.width??1.8,'线宽');if(strokeWidth<=0)throw Error('线宽必须为正');
    const center=points[Math.floor((points.length-1)/2)],next=points[Math.ceil((points.length-1)/2)];
    return `<g data-edge="${escape(e.id||e.from+'--'+e.to)}" data-from="${escape(e.from)}" data-to="${escape(e.to)}"><polyline points="${points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}"${e.dashed?' stroke-dasharray="6 4"':''}${e.arrow===false?'':` marker-end="url(#${id}-arrow)"`}/>${e.labelBox?`<rect x="${e.labelBox.x}" y="${e.labelBox.y}" width="${e.labelBox.w}" height="${e.labelBox.h}" fill="${palette.bg||'#FFFFFF'}"/>`:""}${e.label?label(e.label,e.labelX??(center[0]+next[0])/2,e.labelY??(center[1]+next[1])/2-10,{size:e.fontSize??14,anchor:'middle',fill:stroke}):''}</g>`;
  }).join('');
  const nodeSVG=nodes.map(n=>{
    const shape=n.shape||'rect',fill=color(n.fill,palette.surface),stroke=color(n.stroke,palette.grid);
    const attrs=`fill="${fill}" stroke="${stroke}" stroke-width="1.5"`;
    let geometry;
    if(['rect','round','text'].includes(shape))geometry=shape==='text'?'':`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${shape==='round'?12:0}" ${attrs}/>`;
    else if(shape==='ellipse')geometry=`<ellipse cx="${n.x+n.w/2}" cy="${n.y+n.h/2}" rx="${n.w/2}" ry="${n.h/2}" ${attrs}/>`;
    else if(shape==='diamond')geometry=`<polygon points="${n.x+n.w/2},${n.y} ${n.x+n.w},${n.y+n.h/2} ${n.x+n.w/2},${n.y+n.h} ${n.x},${n.y+n.h/2}" ${attrs}/>`;
    else throw Error('未知节点形状：'+shape);
    const inset=shape==='diamond'?.5:shape==='ellipse'?.68:1,padding=number(n.padding??12,'padding');if(padding<0)throw Error('padding不得为负');
    const innerW=n.w*inset-padding*2,innerH=n.h*inset-padding*2,titleSize=number(n.titleSize??18,'titleSize'),bodySize=number(n.fontSize??16,'fontSize');
    if(innerW<=0||innerH<=0||titleSize<=0||bodySize<=0)throw Error('文字区和字号必须为正');
    if(n.align&&!['left','center'].includes(n.align))throw Error('文字对齐需为left或center');
    const titleLines=wrap(n.title??n.label,innerW,titleSize,600),bodyLines=n.body?wrap(n.body,innerW,bodySize):[];
    const rows=[...titleLines.map(text=>({text,size:titleSize,weight:600})),...bodyLines.map(text=>({text,size:bodySize,weight:400}))];
    const total=rows.reduce((sum,r)=>sum+r.size*1.35,0)+(bodyLines.length?7:0);
    if(total>innerH+.1)throw Error(n.id+'文字装不下；增加节点/换行/布局，不截断内容');
    let y=n.y+(n.h-total)/2;
    const anchorName=n.align==='left'?'start':'middle',x=n.align==='left'?n.x+(n.w-innerW)/2:n.x+n.w/2;
    const texts=rows.map((r,i)=>{if(i===titleLines.length)y+=7;y+=r.size*1.35;return label(r.text,x,y-r.size*.2,{...r,fill:color(n.ink,palette.ink),anchor:anchorName});}).join('');
    return `<g data-node="${escape(n.id)}">${geometry}${texts}</g>`;
  }).join('');
  const annotations=(spec.annotations||[]).map(a=>label(a.text,a.x,a.y,{size:a.fontSize??14,weight:a.weight??400,fill:color(a.color,palette.muted),anchor:a.anchor||'start'})).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${id}-title" data-diagram="${id}" style="font-family:${escape(type.body)};font-synthesis:none;text-rendering:geometricPrecision;font-variant-numeric:tabular-nums"><title id="${id}-title">${escape(spec.title||'关系图')}</title><defs><marker id="${id}-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke"/></marker></defs>${groupSVG}${edgeSVG}${nodeSVG}${annotations}</svg>`;
}
if(require.main===module){
  try{const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('用法: node scripts/render_diagram.cjs input.json output.svg');if(fs.existsSync(output))throw Error('输出已存在，请使用新路径');const svg=render(JSON.parse(fs.readFileSync(input,'utf8')));fs.mkdirSync(path.dirname(path.resolve(output)),{recursive:true});fs.writeFileSync(output,svg);console.log('SVG已生成；需内联字体并检查实际页面：'+output);}catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={render,layout};
