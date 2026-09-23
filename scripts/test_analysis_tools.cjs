'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const legacy=structuredClone(require('../tests/fixtures/analysis-legacy.json'));
legacy.slides.push({...structuredClone(legacy.slides[1]),id:'summary',sequence:3});
assert.ok(fs.existsSync(path.join(__dirname,'migrate_blueprint.cjs')),'迁移工具必须实现');
const migrate=require('./migrate_blueprint.cjs'),views=require('./export_analysis_views.cjs');
const {blueprint,mapping}=migrate.migrate(legacy);assert.equal(blueprint.schemaVersion,3);assert.equal(legacy.schemaVersion,2);assert.equal(new Set(blueprint.claims.flatMap(c=>c.metrics.map(m=>m.id))).size,10);assert.equal(blueprint.claims[0].metrics[2].formula.args[0],'revenue-current');assert.ok(blueprint.claims[0].statement.includes('{{metric:revenue-base}}'));assert.equal(mapping.metrics['summary:base'],'summary-base');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'analysis-tools-'));const input=path.join(dir,'old.json'),output=path.join(dir,'new.json'),mp=path.join(dir,'mapping.json');fs.writeFileSync(input,JSON.stringify(legacy));const original=fs.readFileSync(input,'utf8');migrate.run([input,output,mp]);assert.equal(fs.readFileSync(input,'utf8'),original);assert.throws(()=>migrate.run([input,output,mp]),/覆盖|存在/);assert.throws(()=>migrate.run([input,input,mp]),/覆盖|存在/);
const {fixture}=require('../tests/fixtures/analysis_fixture.cjs');const md=views.render(fixture());assert.ok(md.includes('20.0%'));assert.ok(md.includes('revenue-change'));assert.ok(md.includes('收入变化'));fs.rmSync(dir,{recursive:true,force:true});console.log('PASS analysis tools: scoped IDs, formula/token migration, nonoverwrite, canonical views');
