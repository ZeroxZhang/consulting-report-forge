/* 同行比较：每行文字共享首行基线，数值共享右缘，数据条按零基线映射。 */
const G=require('../assets/exhibit-geometry.js');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(spec){
  const {rows,columns}=spec;
  if(!Array.isArray(rows)||!rows.length||!Array.isArray(columns)||!columns.length)throw Error('需要rows与columns');
  const id=spec.id||'comparison';
  if(!/^[a-zA-Z][\w-]*$/.test(id))throw Error('id需要唯一安全标识');
  const values=rows.map(r=>r.value);
  if(values.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('value需要有限数值，未知值不能填零');
  let [lo,hi]=spec.domain||[Math.min(0,...values),Math.max(0,...values)];
  if(!spec.domain&&lo===0&&hi===0)hi=1;
  if(!Number.isFinite(lo)||!Number.isFinite(hi)||lo>0||hi<0||lo>=hi||values.some(v=>v<lo||v>hi))throw Error('domain必须含零与全部数据');
  const percent=v=>(v-lo)/(hi-lo)*100;
  const head=columns.map(c=>`<span class="precision-cell ${c.key==='value'?'precision-number':''}">${esc(c.label)}</span>`).join('');
  const body=rows.map((r,i)=>`<div class="precision-row" data-geo-row="${id}-${i}">${columns.map(c=>{
    if(c.key==='bar')return `<div class="precision-bar-track" data-geo-row-center="${id}-${i}"><i class="precision-bar-zero" style="left:${percent(0)}%"></i><i class="precision-bar" data-geo-bar="${r.value}" data-geo-domain="${lo},${hi}" style="margin-left:${Math.min(percent(0),percent(r.value))}%;width:${Math.abs(r.value)/(hi-lo)*100}%"></i></div>`;
    const number=c.key==='value',value=number?G.semanticFormat(r.value,{kind:'value',decimals:spec.decimals}):r[c.key];
    if(value===undefined||value===null)throw Error('字段缺失：'+c.key);
    return `<span class="precision-cell ${number?'precision-number':''}" data-geo-baseline="${id}-${i}"${number?` data-geo-right="${id}-numbers"`:''}>${esc(value).replace(/\n/g,'<br>')}</span>`;
  }).join('')}</div>`).join('');
  return `<div class="precision-table" data-comparison="${id}"><div class="precision-row head">${head}</div>${body}</div>`;
}
module.exports={render};
