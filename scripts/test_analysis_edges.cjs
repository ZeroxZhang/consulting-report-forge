'use strict';
const assert=require('node:assert/strict'),{fixture,task}=require('../tests/fixtures/analysis_fixture.cjs');
const api=require('./deck_blueprint.cjs');const check=d=>api.validate(d,{task,stage:'research',preview:true});
const nulls=fixture();nulls.analysis.workItems=[null];assert.doesNotThrow(()=>check(nulls));assert.equal(check(nulls).status,'FAIL');
const cyc=fixture();cyc.artifacts=[{id:'cycle-a',kind:'input',path:'a.csv',sha256:'a'.repeat(64),dependsOn:['cycle-b']},{id:'cycle-b',kind:'output',path:'b.json',sha256:'b'.repeat(64),dependsOn:['cycle-a']}];assert.equal(check(cyc).status,'FAIL','附件血缘循环必须拒绝');
const issue=fixture();issue.analysis.issues[0].parentRef=issue.analysis.issues[0].id;assert.equal(check(issue).status,'FAIL','问题树不能自循环');
const decision=fixture();decision.analysis.brief.purpose='decision';decision.analysis.options=[{id:'baseline',label:'现状',baseline:true,claimRefs:['revenue-change'],metricRefs:[],constraints:'合成',dependencies:'合成',validation:'合成'},{id:'enter',label:'进入',baseline:false,claimRefs:['next-year'],metricRefs:[],constraints:'合成',dependencies:'合成',validation:'合成'}];decision.analysis.synthesis.optionRefs=['enter'];assert.equal(api.validate(decision,{task,stage:'synthesis'}).status,'FAIL','实际比较须包含基线');
const legacy=structuredClone(require('../tests/fixtures/analysis-legacy.json'));legacy.analysis=fixture().analysis;assert.equal(api.validate(legacy).status,'FAIL','改版本号不能隐藏新分析字段');
console.log('PASS analysis edges: malformed records, dependency cycles, compared baseline, schema downgrade');
