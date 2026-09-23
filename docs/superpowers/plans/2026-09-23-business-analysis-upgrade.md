# 商业分析升级 Implementation Plan

> 历史实施计划，已执行。下文的阶段约束记录当时做法；当前行为以 `SKILL.md`、代码和 `docs/business-analysis-validation.md` 为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 把商业分析、缺口处理和前置审查接入单一蓝图及现有 HTML/PDF 交付链。

**Architecture:** schema 3 以全局 claims 和 metrics 作为真源，analysis 保存问题、工作、缺口与决策引用。编译适配层复用 schema 2 的算术、布局和 pages v4；任务 v2 与审查记录绑定分析及本地附件摘要。研究、综合、生产分别验证，保留历史版本。

**Tech Stack:** Node CommonJS、JSON、现有 Playwright/PDF 工具链。

**Spec:** docs/superpowers/specs/2026-09-23-business-analysis-upgrade-design.md

## Global Constraints

- blueprint 唯一内容真源；pages v4 由编译器生成。
- 保留 editorial / analytical / exploratory；分析不足可有条件收束。
- 不新增图型数量门禁，不自动写审查通过，不以无回复代替答案。
- 保留历史 schema 1/2、task v1、review v3；新格式不可降级绕过。
- 八类业务 playbook 全部交付。用户已批准实施，不重复阶段审批。
- 不提交 Git；所有变更保留在 codex/business-analysis-upgrade-proposal 分支。

## Review Focus

- 间接公式引用的未核实输入不能绕过生产门禁（任务 1）。
- 私有问题无回答、无卡片能力时不能伪造完成，分支仍可独立推进（任务 1、5）。
- 上游附件变化但显示数值未变，分析审查也须失效（任务 2）。
- 预览、旧版本或手改 pages 不能绕过新审查（任务 3）。
- 快照迁移路径后仍可核验，而输入不会自动进入对外交付（任务 3、4）。

## Task 1: 分阶段分析合同与统一计算

**Files:** 新增 scripts/analysis_contract.cjs、scripts/test_analysis_contract.cjs、tests/fixtures/analysis-blueprint.json；修改 deck_blueprint.cjs、content_contract.cjs、compile_blueprint.cjs、verify_blueprint_pages.cjs、report_contract.cjs。
**Interfaces:** `analysis.validate(doc,{task,stage,baseDir}) -> errors[]`；`analysis.materialize(doc) -> schema2`；`analysis.compile(doc,options) -> pages4`；`analysis.digest(doc) -> sha256`；`analysis.adopted(doc) -> {claimRefs,metricRefs,workItemRefs,issueRefs,optionRefs,artifactRefs}`。

- [x] 编写真实输入反例：research 无 slides 通过；task1 搭配 schema3 失败；选用 formula 跨主张计算 20%，未用 pending 不阻止生产，间接用 pending 阻止；waiting_user 挡依赖分支而不挡无关分支。
```js
assert.equal(blueprint.validate(draft,{task,stage:'research'}).status,'PASS');
assert.equal(content.compile(doc,{task,preview:true}).pages[0].content.metrics.find(m=>m.id==='growth-rate').value,20);
```
- [x] 运行 `node scripts/test_analysis_contract.cjs`，确认失败因缺新合同。
- [x] 实现登记、引用图与阶段裁决；以全局指标求值，再仅投影选中主张/指标进入页面；CLI 传递 task 与 stage。
- [x] 运行新测试及 `npm test`，预期全部 PASS。

## Task 2: 前置审查、模型输入与结果导入

**Files:** 新增 scripts/analysis_review_contract.cjs、scripts/import_analysis_results.cjs、scripts/test_analysis_review.cjs。
**Interfaces:** `review.validate(record,doc,{task,baseDir}) -> errors[]`；`review.check(doc,{task,baseDir}) -> errors[]`；`analysis.artifactErrors(doc,baseDir) -> errors[]`；`importResults(doc,result,{baseDir}) -> newDoc`。

- [x] 测试实际临时输入文件：审查覆盖/角色不足失败，原始输入变化失败，版面变化摘要不变，重复导入 ID/缺计算血缘失败。
```js
assert.notEqual(analysis.digest(changedClaim),analysis.digest(original));
assert.equal(analysis.digest(layoutOnly),analysis.digest(original));
```
- [x] 运行 `node scripts/test_analysis_review.cjs`，确认缺能力时失败。
- [x] 实现 analysis-review v1，绑定 digest、实际文件 sha、覆盖及真实 reviewer instance；外部结果为声明数据，不执行外部代码；不预填通过。
- [x] 运行两个新增测试及 `npm test`，预期 PASS。

## Task 3: 全链路防绕过与审查复用

**Files:** 修改 report_contract、assemble_deck、review_contract、aggregate_reviews、snapshot_review、prepare_review_reuse、package_delivery；新增 scripts/test_analysis_integration.cjs。
**Interfaces:** schema3 编译结果带 `blueprintSchemaVersion:3`、`analysisSha256`、`preview:boolean`；task2 绑定 analysisReview；final review4 绑定 analysisSha256；旧格式不变。

- [x] 编写 CLI/装配反例：缺审查只允许显式 preview；preview 不能正式打包；task1/review3 不能用于新分析；依赖变更使最终核验失败。
- [x] 运行 `node scripts/test_analysis_integration.cjs`，确认失败。
- [x] 扩展记录解析及最终校验，快照保存必要分析记录/附件、重定位路径后核验，复用草稿永远 incomplete。
- [x] 运行 `npm test`、`npm run test:render`、`npm run test:upgrade-render`，预期 PASS；浏览器受权限阻断时用同一命令请求提权。

## Task 4: 迁移、派生视图与模板

**Files:** 新增 migrate_blueprint.cjs、export_analysis_views.cjs、test_analysis_tools.cjs；更新模板、保留 schema2 夹具。
**Interfaces:** `migrate(doc) -> {blueprint,mapping}`；CLI 输入/输出/映射三个路径不得相同，不覆盖；views 输出 Markdown 来自 canonical claims，附件不默认打包。

- [x] 测试重复同名页内 metric 按页前缀迁移、tokens/formulas 更新、原文件不动、目标已有则拒绝。
- [x] 运行 `node scripts/test_analysis_tools.cjs`，确认失败。
- [x] 实现迁移与导出，模板提供研究起点和完整合成示例；分析数值不双写。
- [x] 运行新增工具测试与 `npm test`，预期 PASS。

## Task 5: 八类方法与交互执行协议

**Files:** 更新 SKILL.md、README.md、references 中相关流程；新增 analysis-workflow、analysis-review、playbooks/ 八篇、methods/ 公共方法、evals/ 原始题与隔离评分依据。
**Interfaces:** 文档使用实现后的精确字段/CLI；输入工具按宿主能力选择，不固定伪 API；问答状态以实际回复为准。

- [x] 编写十二个以上原始业务/交互输入，将预期判断单独放 reviewer rubric。
- [x] 更新分析流程和八场景输入/步骤/输出/反证；研究触发贯穿问题、分析、审查阶段。
- [x] 在干净上下文执行代表业务与交互任务，检查实际调用/暂停行为，记录失败并修正文档。
- [x] 用实际数据生成利润与市场两类 HTML/PDF 示例，实际看图并记录验证范围。

## Task 6: 回归与发布说明

**Files:** package.json、package-lock.json、docs/business-analysis-validation.md、本计划进度。

- [x] 版本升级至 1.4.0；添加新增回归命令；旧测试不得删减。
- [x] 完成全套测试及干净上下文独立分支审查；核对输入、产物、限制，不宣称未运行的效果比较。
- [x] 汇总实现范围、实际测试与已知限制；保留工作区供用户检查，不 commit。

## 执行记录

- 起点：2c4c0b0；实现前仅新增升级方案文档。
- 采用本会话连续实施；按用户要求不进行 Git 提交，因此以工作区 diff 和验证日志替代提交范围。

### 最终执行记录（2026-09-23）

- 任务 1–4：六组新增合同/工具/快照回归通过；保留原14段测试。研究草稿、全局引用、缺口分支、前置审查、review4、历史兼容、迁移均接通。
- 任务 5：八篇业务手册与四篇公共方法完成；14例由干净上下文执行，独立评分13例按声明范围通过、利润例部分通过。询问/附件题隔离模拟，未打扰真实用户。
- 任务 5 的两个合成案例完成真实HTML/PDF acceptance、作者前置和最终看图审查、正式打包；均为 simple、非重大结论的一页片段，不冒充长报告或复杂投资项目实测。
- 任务 6：原浏览器回归、原升级渲染回归、技能校验器通过；独立代码审查发现两项 Important，已统一修复 external数值/附件血缘校验链并以新反例验证。
- Final: fixed 导入值漂移/旧输出绕血缘 — test_analysis_review 的篡改、更新摘要未重导入、已有输出无血缘及缺run反例 RED→GREEN；npm test 14+6组通过。
- Final: minor (deferred): 跨目录导入不重定位附件路径；同目录使用正常，文档说明了限制。
- Ruling: 用户已批准方案并要求执行，直接持续实施，不再请求方法/阶段批准；不执行skill建议的自动commit，遵守项目要求。代价：需用户自行审阅未提交工作区。
- Ruling: 不向真实用户发送测试卡片；交互采用隔离模拟，并保留实际合同回归。代价：原生卡片UI、真实等待/附件恢复仍未端到端测试。
- Ruling: 未做旧新同模型各三轮配对实验；不宣称量化质量或效率提升。代价：当前评估只能证明本次观察到的行为，不能估计统计优势。
