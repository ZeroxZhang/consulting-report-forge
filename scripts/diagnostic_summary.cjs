/* 只读展示层：保留原始观测和历史 warning 身份，不参与签署或豁免。 */
'use strict';
const {hash,stable}=require('./report_contract.cjs');
function summarize(audit){
  const groups=new Map();
  for(const row of audit.rows||[])for(const [medium,key] of [['html','visualPolicy'],['print','printVisualPolicy'],['html','readingShadow'],['print','printReadingShadow']]){
    for(const severity of key.includes('Shadow')?['observations']:['errors','warnings','findings'])for(const item of row[key]?.[severity]||[]){
      // 无定位的覆盖说明不能冒充同一个可处置问题。
      const identity={page:row.page,pageId:row.pageId,code:item.code,selector:item.selector,otherSelector:item.otherSelector,pseudo:item.pseudo,sides:item.sides,severity};
      if(!item.selector)identity.message=item.message;
      const id=hash(stable(identity));
      if(!groups.has(id))groups.set(id,{id,...identity,observations:[]});
      groups.get(id).observations.push({medium,...item,screenshot:medium==='html'?row.screenshot:undefined});
    }
  }
  const issues=[...groups.values()];
  return {version:1,scope:'visual-policy-and-reading-shadow-display-only',issues,issueCount:issues.length,
    observationCount:issues.reduce((n,i)=>n+i.observations.length,0),
    legacyWarnings:audit.warnings||[],legacyErrors:audit.errors||[],
    limitation:'归并仅服务阅读；原始 warning 处置、审查身份与判据不变，print 坐标不是 PDF 坐标。'};
}
module.exports={summarize};
