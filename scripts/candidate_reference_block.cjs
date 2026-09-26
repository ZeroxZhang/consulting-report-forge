/* 参考资料块共用判据：候选检查与显式 reference-block-1 共用，旧单页路径保持不变。 */
'use strict';

function inspect(rows,{kind='report',expectedIds}={}){
  const refs=rows.map((row,index)=>({row,index})).filter(x=>x.row.bookends?.role==='references');
  if(!refs.length)return {candidate:true,errors:['缺少参考资料块'],coverage:'DOM_ONLY'};
  const errors=[],first=refs[0].row.bookends,entries=refs.flatMap(x=>x.row.bookends.entries||[]);
  if(refs.some((x,i)=>x.index!==refs[0].index+i))errors.push('参考资料块必须连续');
  if(refs.some(x=>x.row.bookends.total!==first.total||x.row.bookends.scope!==first.scope))errors.push('参考资料块的总数/节选声明须一致');
  if(entries.some(e=>typeof e.id!=='string'||!e.id.trim()))errors.push('参考资料 ID 缺失');
  if(expectedIds){
    const ids=entries.map(e=>e.id);
    if(new Set(expectedIds).size!==expectedIds.length)errors.push('权威来源 ID 重复');
    if(ids.some(id=>!expectedIds.includes(id)))errors.push('参考资料存在未登记 ID');
    const selected=expectedIds.filter(id=>ids.includes(id));
    if(JSON.stringify(ids)!==JSON.stringify(first.scope==='all'?expectedIds:selected))errors.push('参考资料存在漏项、重复或来源顺序错误');
    if(first.total!==expectedIds.length)errors.push('参考资料总数与权威来源数量不符');
  }
  // 合并观测后复用旧文档规则：封面/封底、唯一ID、总数、节选、链接及裁切。
  const combined={bookends:{...first,entries,
    clipped:refs.flatMap(x=>x.row.bookends.clipped||[]),
    links:refs.flatMap(x=>x.row.bookends.links||[])}};
  const normalized=rows.flatMap((row,index)=>row.bookends?.role!=='references'?[row]:index===refs[0].index?[combined]:[]);
  errors.push(...require('./check_bookends.cjs').checkDocument(normalized,{kind}).errors);
  for(const {row,index} of refs){
    const b=row.bookends;
    if(!b.title||!['line','integrated','space'].includes(b.boundary))errors.push('第'+(index+1)+'页参考资料标题或母版边界缺失');
    if(!b.entries?.length)errors.push('参考资料块包含空页');
    if(b.scope==='selected'&&(!b.title?.includes('节选')||!b.note))errors.push('节选参考页须有节选标题与说明');
  }
  return {warnings:['参考资料块需人工核对来源真实性、摘选与完整底稿去向'],candidate:true,policy:'reference-block-candidate-1',errors:[...new Set(errors)],coverage:'DOM_ONLY：PDF漏项和长链接可读性仍须实际验收',sourceCoverage:expectedIds?'CHECKED_IDS':'UNKNOWN：未提供权威来源清单'};
}
module.exports={inspect};
