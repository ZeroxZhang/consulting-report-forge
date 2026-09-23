'use strict';
const legacy=require('./analysis-legacy.json');
const copy=v=>JSON.parse(JSON.stringify(v));
const task={version:2,workMode:'analytical',complexity:'simple',majorConclusion:false};
function fixture(){const d=copy(legacy);d.schemaVersion=3;delete d.deck.governingThought;d.claims=d.slides[1].sourcePlan.claims;delete d.slides[1].sourcePlan;d.slides[1].claimRefs=d.claims.map(c=>c.id);d.slides[1].metricRefs=['growth-rate'];d.slides[1].visual.selection={relationship:'comparison',reason:'两期收入在同一量尺上逐项比较，便于读者辨别增量与方向。'};d.slides[1].visual.capacity={items:1};d.artifacts=[];d.analysis={brief:{question:'收入增长能否证明利润改善？',purpose:'diagnosis',scope:'合成业务',period:'2024–2025',baseline:'2024同口径收入',constraints:'缺成本',successCriteria:'区分已知变化与利润未知'},issues:[{id:'revenue-issue',question:'收入变动多少？',priority:'high',disposition:'answered',workItemRefs:['revenue-work']}],gaps:[],workItems:[{id:'revenue-work',issueRefs:['revenue-issue'],method:'period-comparison',rationale:'同口径比较',status:'complete',inputClaimRefs:[],artifactRefs:[],outputClaimRefs:d.claims.map(c=>c.id),counterEvidence:'没有利润数据，不能推出利润增长。'}],options:[],synthesis:{answerClaimRefs:['revenue-change'],openIssueRefs:[],basis:'只报告同口径收入变化'}};return d;}

module.exports={fixture,task};
