/* 浏览器观察与合同判断分离。只对显式角色执行新检查，旧稿保持原验收路径。 */
function inspectPage(slide){
  const role=slide.dataset.pageRole||null;
  const visible=e=>{
    if(!e)return false;const r=e.getBoundingClientRect();if(!r.width||!r.height)return false;
    for(let n=e;n&&n.nodeType===1;n=n.parentElement){const s=getComputedStyle(n);if(s.display==='none'||['hidden','collapse'].includes(s.visibility)||Number(s.opacity)===0)return false;}
    return true;
  };
  const entries=[...slide.querySelectorAll('[data-reference-id]')].map(e=>{
    const body=e.querySelector('.reference-text'),number=e.querySelector('.reference-number');
    return {id:e.dataset.referenceId,text:[number?.textContent,body?.textContent].filter(Boolean).join(' ').trim(),visible:visible(e)&&visible(body)&&!!body.textContent.trim()};
  });
  const clipped=[...slide.querySelectorAll('.reference-columns,.reference-list,.reference-item,.reference-text,.slide__body,.bookend-main')].filter(e=>e.scrollHeight>e.clientHeight+2||e.scrollWidth>e.clientWidth+2).map(e=>e.className);
  const meta={};for(const e of slide.querySelectorAll('[data-report-field]'))if(visible(e))meta[e.dataset.reportField]=e.innerText.trim();
  return {role,scope:slide.dataset.referenceScope,total:Number(slide.dataset.referenceTotal),entries,clipped,meta,
    title:visible(slide.querySelector('.cover-title,.slide__title'))?slide.querySelector('.cover-title,.slide__title').textContent.trim():'',
    note:visible(slide.querySelector('.reference-selection'))?slide.querySelector('.reference-selection').innerText.trim():'',frame:slide.dataset.frame,boundary:slide.dataset.frameBoundary,
    links:[...slide.querySelectorAll('.reference-item a')].map(e=>({text:e.textContent.trim(),href:e.getAttribute('href')}))};
}
function checkDocument(rows,{kind,referencePolicy='single-page-1',expectedIds}={}){
  if(referencePolicy==='reference-block-1'){
    if(!Array.isArray(expectedIds)||!expectedIds.length)return {kind,errors:['参考资料块缺少权威来源 ID 清单'],warnings:[]};
    const result=require('./candidate_reference_block.cjs').inspect(rows,{kind,expectedIds});
    return {...result,kind,candidate:false,policy:'reference-block-1',warnings:result.warnings||[]};
  }
  if(referencePolicy!=='single-page-1')return {kind,errors:['未知参考资料策略'],warnings:[]};
  const errors=[],warnings=[],all=rows.map((r,i)=>({...r.bookends,page:i+1}));
  const byRole=role=>all.filter(r=>r.role===role);
  if(kind!==undefined&&!['report','collection','fragment'].includes(kind))errors.push('未知文档类型: '+kind);
  if(kind==='report'){
    for(const role of ['cover','references','back-cover'])if(byRole(role).length!==1)errors.push('完整报告必须恰有一页 '+role);
    if(all[0]?.role!=='cover')errors.push('完整报告封面必须在第一页');
    if(all.at(-1)?.role!=='back-cover')errors.push('完整报告封底必须在最后一页');
    if(all.at(-2)?.role!=='references')errors.push('参考资料必须紧邻封底且仅占一页');
    if(all.length<4)errors.push('完整报告缺少正文');
    const front=byRole('cover')[0],back=byRole('back-cover')[0];
    if(front&&back)for(const key of ['producer','date','version','project','access','statement'])if((front.meta?.[key]||'')!==(back.meta?.[key]||''))errors.push('封面与封底元信息不一致: '+key);
  }
  for(const row of all){
    if(!row.role)continue;
    if(!['cover','references','back-cover','content','appendix','divider'].includes(row.role)){errors.push('第'+row.page+'页未知页面角色: '+row.role);continue;}
    if(['cover','back-cover','references'].includes(row.role)){
      if(!row.title)errors.push('第'+row.page+'页功能页缺少可读标题');
      if(row.clipped?.length)errors.push('第'+row.page+'页首尾内容超过容器容量: '+row.clipped.join(', '));
    }
    if(['cover','back-cover'].includes(row.role)){
      if(row.frame!=='off')errors.push('第'+row.page+'页首尾页必须关闭正文母版装饰');
      if(!row.meta?.date)errors.push('第'+row.page+'页缺少报告日期');
    }
    if(row.role==='references'){
      if(!['line','integrated','space'].includes(row.boundary))errors.push('参考资料页必须显式声明母版边界');
      if(!row.entries?.length||row.entries.some(e=>!e.visible||!e.text))errors.push('参考资料条目为空或不可见');
      if(new Set(row.entries.map(e=>e.id)).size!==row.entries.length)errors.push('参考资料 ID 重复');
      if(!Number.isInteger(row.total)||row.total<row.entries.length||row.total<1)errors.push('参考资料总数无效');
      if(!['all','selected'].includes(row.scope))errors.push('参考资料未声明完整或节选');
      if(row.scope==='all'&&row.total!==row.entries.length)errors.push('完整参考资料声明与展示数量不一致');
      if(row.scope==='selected'&&(!(row.total>row.entries.length)||!row.title.includes('节选')||!row.note))errors.push('参考资料节选必须有准确数量、节选标题和说明');
      for(const link of row.links||[])if(!/^https?:\/\//i.test(link.href||''))errors.push('参考资料链接不是可用的绝对 http/https 来源: '+link.text);
      warnings.push('第'+row.page+'页参考资料需人工核对来源真实性、去重、摘选与完整底稿去向');
    }
  }
  return {kind:kind||'legacy',errors,warnings};
}
module.exports={inspectPage,checkDocument};
