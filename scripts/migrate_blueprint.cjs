/* 历史 schema2 无损迁移成待分析 schema3；不自动认定旧结论已完成新审查。 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
function migrate(doc){
  if(doc?.schemaVersion!==2)throw Error('仅支持 schema2 显式迁移；schema1 须先整理来源与内容');
  const checked=require('./deck_blueprint.cjs').validate(doc);if(checked.errors.length)throw Error(checked.errors.join('；'));
  const d=structuredClone(doc),mapping={claims:{},metrics:{},originalGoverningThought:d.deck.governingThought};
  d.schemaVersion=3;delete d.deck.governingThought;d.claims=[];d.artifacts=[];
  const issues=[],workItems=[];
  for(const s of d.slides){
    if(!require('./content_contract.cjs').CONTENT_ROLES.has(s.pageRole))continue;
    const cs=s.sourcePlan.claims,ms=new Map(cs.flatMap(c=>(c.metrics||[]).map(m=>[m.id,s.id+'-'+m.id])));
    const rewrite=v=>typeof v==='string'?v.replace(/\{\{metric:([a-z][a-z0-9-]*)\}\}/g,(_,id)=>'{{metric:'+ms.get(id)+'}}'):v;
    s.claimRefs=[];s.metricRefs=[];
    for(const c of cs){const old=c.id;c.id=s.id+'-'+old;mapping.claims[s.id+':'+old]=c.id;s.claimRefs.push(c.id);
      for(const k of Object.keys(c))if(typeof c[k]==='string')c[k]=rewrite(c[k]);
      for(const m of c.metrics||[]){const old=m.id;m.id=ms.get(old);mapping.metrics[s.id+':'+old]=m.id;s.metricRefs.push(m.id);if(m.formula)m.formula.args=m.formula.args.map(id=>ms.get(id));}
      d.claims.push(c);
    }
    s.title=rewrite(s.title);s.proves=rewrite(s.proves);delete s.sourcePlan;
    const issue=s.id+'-migration-issue',work=s.id+'-migration-work';
    issues.push({id:issue,question:s.proves,priority:'high',disposition:'open',workItemRefs:[work]});
    workItems.push({id:work,issueRefs:[issue],method:'migration-review',rationale:'迁移只保留原内容，须重新核对分析前提与来源。',status:'planned',inputClaimRefs:s.claimRefs,outputClaimRefs:s.claimRefs,artifactRefs:[]});
  }
  d.analysis={brief:{question:doc.deck.decision,purpose:'research',scope:'待确认原任务范围',period:'待确认原任务期间',baseline:'待核对原始基准',constraints:'历史迁移，尚未完成新增分析审查',successCriteria:'核对原结论是否被证据支持'},issues,gaps:[],workItems,options:[],synthesis:{answerClaimRefs:[],openIssueRefs:issues.map(i=>i.id),basis:''}};
  return {blueprint:d,mapping};
}
function run(args){const [input,output,mapFile]=args;if(!mapFile||args.length!==3)throw Error('用法：node scripts/migrate_blueprint.cjs old.json new.json mapping.json');const paths=[input,output,mapFile].map(p=>path.resolve(p));if(new Set(paths).size!==3||fs.existsSync(output)||fs.existsSync(mapFile))throw Error('拒绝覆盖输入或已有输出');const result=migrate(JSON.parse(fs.readFileSync(input,'utf8')));fs.writeFileSync(output,JSON.stringify(result.blueprint,null,2)+'\n',{flag:'wx'});fs.writeFileSync(mapFile,JSON.stringify(result.mapping,null,2)+'\n',{flag:'wx'});return {status:'migrated-draft',output,mapFile};}
if(require.main===module){try{console.log(JSON.stringify(run(process.argv.slice(2))));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={migrate,run};
