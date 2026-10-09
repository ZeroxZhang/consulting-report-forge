/* 发布前完整回归：自动纳入新增测试，再覆盖显式浏览器/策略变体和生成文件。 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const tests=fs.readdirSync(__dirname).filter(name=>/^test_.*\.cjs$/.test(name)).sort();
const steps=tests.map(name=>({args:[path.join(__dirname,name)]}));
for(const name of ['test_report_regressions.cjs','test_layout_policy.cjs','test_form_contract.cjs','test_upgrade_baseline.cjs'])
  steps.push({args:[path.join(__dirname,name),'--browser']});
steps.push({args:[path.join(__dirname,'test_strict_render.cjs')],env:{REFERENCE_BLOCK_TEST:'1'}},
  {args:[path.join(__dirname,'test_execution_render.cjs')],env:{MODULE_FILL_TEST:'1'}});
for(const name of ['build_layout_css.cjs','build_layout_atlas.cjs','sweep_forms.cjs'])
  steps.push({args:[path.join(__dirname,name),'--check']});
steps.push({command:require('./pack_fonts.cjs').fontPython(),args:[path.join(__dirname,'test_font_cache.py')]});
const env={...process.env};delete env.MODULE_FILL_TEST;delete env.REFERENCE_BLOCK_TEST;
for(const [index,step] of steps.entries()){
  console.log(`\n[release ${index+1}/${steps.length}] ${path.basename(step.args[0])} ${step.args.slice(1).join(' ')} ${JSON.stringify(step.env||{})}`);
  const result=spawnSync(step.command||process.execPath,step.args,{cwd:root,env:{...env,...step.env},stdio:'inherit'});
  if(result.error||result.status!==0){
    console.error('FAIL release: '+(result.error?.message||result.signal||'exit '+result.status));
    process.exit(result.status||1);
  }
}
console.log(`PASS release: ${tests.length} Node tests, 6 explicit variants, 3 generated assets, Python font cache (${steps.length} checks)`);
