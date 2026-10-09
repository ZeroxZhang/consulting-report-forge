# 维护边界：执行规则与兼容实现

此文件供维护者使用，不是制稿时需要选择的执行分支。

## 单一产品入口

`SKILL.md`、`references/` 和 `templates/` 描述当前制作流程。新任务使用 blueprint schema3 / task3 / pages4 / analysis-review2 / final-review5。任务可从 `templates/research-blueprint.json` 或 `templates/deck-blueprint.json` 开始，综合与前置审查完成后编译生成页面记录；Agent 无须在多个流程之间选择。

## 实际合同组合与维护入口

当前运行时为 1.8.0；新任务使用严格合同，旧任务保持原合同。以下是代码实际存在的路径，不表示任意版本可自由混搭。

| 路径 | 合同组合 | 产生与校验 |
|---|---|---|
| 历史分析任务 | blueprint3 / task2 / pages4（blueprintSchemaVersion=3）/ analysis-review1 / final-review4 | analysis_contract、analysis_review_contract、compile_blueprint、report_contract.verifyPlan、review_contract；editorial 按现有规则豁免前置分析审查 |
| 历史内容绑定任务 | blueprint2 / task1 / pages4 / final-review3，无前置分析合同 | content_contract.compile、verify_blueprint_pages、report_contract、review_contract |
| 历史页面记录 | pages1/2/3 按各自布局/密度规则读取；不是当前编译器输出 | check_pages、layout_contract、density_contract、richness_contract；blueprint1 通过历史逐页对账路径，不能编译为内容绑定 pages4 |
| 更早的审查记录 | 旧 audit 走 aggregate_reviews 的历史 schema2 分支 | 仅用于对应历史输入；不能视为当前 review3/4 的替代品 |
| 审查快照 | snapshot manifest1，内含原合同、原字节及审查链 | snapshot_review、prepare_review_reuse、review_contract、package_delivery；manifest1 不代表内部 task1 |
| 已有迁移工具 | blueprint2 → blueprint3 待分析草稿与 ID 映射 | migrate_blueprint；不覆盖输入，不迁移签署，schema1 需先整理内容 |
| 当前新任务 | blueprint3 / task3 / pages4 / analysis-review2 / final-review5 | semantic-v2 已接入编译/装配/审查/快照/复用/打包；migrate_strict_analysis 创建未签草稿；新任务默认启用，见 [严格合同](strict-analysis-contract.md) |
| 复合证据任务 | blueprint3 / task3 + visual=evidence-composition-1 / pages4 / analysis-review2 / final-review5 | composition_contract 结构校验与派生；逐 panel 形式/容量/瀑布体检；策略审查身份与组合覆盖；首次启用使整册视觉复用失效（task.policyVersions 进 dependenciesSha256） |
| 叙事视角任务（候选） | blueprint3 / task3 + visual=narrative-focus-1 / pages4 / analysis-review2 / final-review5 | 在复合证据全部检查之上加 narrative_contract：`deck.arc`、逐页 `adds`、核心答案被正文承担、相邻页新增理解重复；成稿侧逐页 `data-reading-role="takeaway"` 唯一性与重点感实测（page_probe `focus` + check_pages）；最终审查新增 narrative 层与逐页 `observedTakeaway` 覆盖。**默认未启用**，须 `report.cjs init --visual narrative-focus-1` 或 `migrate_strict_analysis --to-policy` |

策略能力集中在 `scripts/contract_capabilities.cjs` 查询，不再散落字符串相等判断。包含关系是 `narrative-focus-1 ⊃ evidence-composition-1 ⊃ structural-lines-1`；组合与叙事检查都按能力查询启用，换策略值不会让既有检查静默失效或误报。未知策略一律拒绝，不以 `>=` 推断语义。能力值一旦存在就不原地改语义——已产出的 `evidence-composition-1` 报告保持原解释。

**候选状态。** `narrative-focus-1` 通过全部工程测试与代表页验收，但尚未完成同题同模型的行为对照，因此 `templates/task.json` 仍是 `structural-lines-1`。切换新建默认须先按升级方案的发布底线完成复测；回退只需撤回"新建任务默认启用"，已创建的新策略任务保留支持该策略的运行时，不把其 visual 改回旧值以消除报错。

只读操作见 [R1 实施记录](upgrade-r1-validation.md)。参考资料块和细线检查已接入 task3 的显式策略，不能据此放行旧合同。字体诊断新增分类仅影响新运行的输出；历史 audit 不补字段、不重算、不改签名。归并摘要不替换历史 warningReview 字符串与处置身份。

兼容输入的代码分支继续保留，避免已有报告失效。历史模板移入 `tests/fixtures/legacy-deck-blueprint.json` 和 `legacy-pages.json`，只用于维护测试，不作为制作入口。历史蓝图的叙事角色配额、页面的类型及布局数量门槛，不应用于当前任务；回归测试负责覆盖边界。

## 不混用三类约束

1. 数据与交付底线：来源身份、数值含义、对账、可读性、最终媒介与实际审查不能用更换名称绕过。
2. 实现约定：组件容量、特定HTML结构、静态输出支持范围须如实说明；没有专用组件不等于禁止自定义表达。
3. 分析与设计要求：具体图型、框架、布局或文字组织由实际任务与证据决定；新制作流程必须在适配范围内尽可能多地使用不同图型与布局，通过整册规划和实际审查落实，不转化为统一数量配额。重复理由复用 `visual.repetitionReason/layoutReason`，无需新增 schema 或恢复历史种数门槛。

图型实现清单与有效多样性不能混用：`richness_contract` 当前按实现 ID（自绘按描述）统计，人工视觉审查按实际图型归并不同实现；布局诊断按声明结构提示，最终以画面判断。此次前置规则优化不改变既有机器计数、策略版本或历史审查记录，也不宣称机器已自动验证“尽可能多”。审查口径见 [整册多样性验收](../references/visual-qa.md#整册多样性验收)。

目前真实工程边界仍包括两种画幅、静态HTML/PDF、自定义表达的作者验证责任，以及瀑布对账声明的作用域与对应渲染器的节点上限。旧视觉策略按页面核对单一对账声明，组合与叙事策略按 panel 核对，允许同页多张独立瀑布；同一作用域仍须恰有一个对账声明。没有新增箱线、地图等专用渲染器。

审查复用中的“上一轮”“历史记录”表示同一报告的修订证据，不是技能产品版本。独立审查是否必需由任务风险决定；简单且无重大结论的任务可只保留作者审查。


## execution-plan-1 / execution-plan-2：进度与报告语义分离

新建入口增加可选第五槽 `policyVersions.workflow` 与仅含 `id/record` 的 executionPlan；全局四槽 DEFAULT_POLICIES 不改。新增计划 schema1、执行归档 schema1、打包收据 schema1，均独立于 blueprint3、task3、pages4、analysis-review2、final-review5 和 review-snapshot1。固定要求目录为 `execution_requirements.cjs`，所有正式入口复用 `execution_plan.assertGate`。

计划动态字段不进入 analysis_projection，也不加入 review_contract.taskRecords。audit_evidence 仅纳入 plan ID，不纳入 locator/revision；首次启用 workflow 仍会改变公共依赖，不能复用旧全册判断。qualityChecks 按 workflow 条件校验且经 aggregate 原样收集，各项分别覆盖所有必要角色与该审查者本人的当前双媒介证据。

根任务与派生任务、QA 和打包共享 task_store 锁；内部上下文由进程内 WeakSet 识别，不提供 CLI 绕锁参数。QA 被统一入口直接调用，避免父进程占锁后子进程再次抢锁。生产记录核对 published、开始时输入摘要、生产者计划身份和当前依赖，不能把任意旧文件在接收时盖成当前版本。

当前失效采用保守范围：输入文件/蓝图/公共分析变更会要求重新核实相关计划任务；不宣称已实现精确到单页的执行调度。现有视觉证据逐页复用机制保持独立。移动恢复保留历史快照，但重建当前生产链，不自动继承已完成状态。运行 `npm run test:execution` 验证状态与真实渲染流程；审查夹具均明确为合成数据。

### 模块填充增量与冻结边界

`execution-plan-1` 继续使用原双约束和原固定任务定义；`execution-plan-2` 通过 `execution_requirements.fixed(task)` 增加 `module-fill`、`module-fill-plan` 及代表页依赖。`report init` 和无计划 task3 的 `report adopt` 使用新策略。既有活动计划不原地改版本，归档、恢复和旧审查依旧按原策略读取；要在旧任务采用新能力，保留旧档案并在新任务目录重新规划、制作、审查。本次不提供旧计划自动升级或补签。

`browser_module_fill.inspectSlide` 由共享 `page_probe.collect` 在单页预览与 QA 屏幕阶段调用，QA 打印阶段再采集一份。测量用实际文字行框与媒体整体矩形，避免满高父框或脚注把中部空洞掩盖；不把 SVG 内坐标域当成文字模块空洞。`measuredVerticalCoverage` 等是成稿投影指标，`baselineFillRatio` 不可从它们推算。探针不生成通过结论，也不能证明所有未标记自定义子模块都被识别。

`module_fill_review` 检查当前审查中每个正文页、每个自动枚举区域及 HTML/PDF 两种媒介的观察和诊断处置。打印 DOM 只提供 PDF 审查定位线索，实际 PDF 页面仍须由同一审查者查看。审查者另须确认枚举完整并补录遗漏区域。D3 裁切诊断不能作为设计留白放行；误报须写明实际证据，真缺陷须修复并重跑当前验收。细则见 [模块填充检查](../references/module-fill.md)。

`npm run test:module-fill` 覆盖审查缺项拒绝、真实浏览器留白/裁切定位和新策略 HTML/PDF 生产链；`npm run test:execution` 保留旧策略生产链。生产链的人工审查记录为明确标记的合成测试数据，不证明实际美学质量提升。
