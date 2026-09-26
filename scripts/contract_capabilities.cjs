/* 显式版本表；未知未来版本一律拒绝，不以 >= 推断语义。 */
'use strict';
const versions=Object.freeze({
  1:Object.freeze({analysis:false,strict:false,analysisReview:null,finalReview:3,algorithm:null}),
  2:Object.freeze({analysis:true,strict:false,analysisReview:1,finalReview:4,algorithm:'legacy-v1'}),
  3:Object.freeze({analysis:true,strict:true,analysisReview:2,finalReview:5,algorithm:'semantic-v2'})
});
function capabilities(task){const version=task&&Object.hasOwn(task,'version')?task.version:1;if(!Number.isInteger(version)||!Object.hasOwn(versions,version))throw Error('不支持的任务合同版本：'+version);return versions[version];}
module.exports={capabilities};
