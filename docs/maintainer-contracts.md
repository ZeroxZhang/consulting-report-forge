# 维护边界：执行规则与兼容实现

此文件供维护者使用，不是制稿时需要选择的执行分支。

## 单一产品入口

`SKILL.md`、`references/` 和 `templates/` 描述当前制作流程。新任务使用 blueprint schema3 / task3 / pages4 / analysis-review2 / final-review5。任务可从 `templates/research-blueprint.json` 或 `templates/deck-blueprint.json` 开始，综合与前置审查完成后编译生成页面记录；Agent 无须在多个流程之间选择。

## 实际合同组合与维护入口

当前运行时为 1.5.0；新任务使用严格合同，旧任务保持原合同。以下是代码实际存在的路径，不表示任意版本可自由混搭。

| 路径 | 合同组合 | 产生与校验 |
|---|---|---|
| 历史分析任务 | blueprint3 / task2 / pages4（blueprintSchemaVersion=3）/ analysis-review1 / final-review4 | analysis_contract、analysis_review_contract、compile_blueprint、report_contract.verifyPlan、review_contract；editorial 按现有规则豁免前置分析审查 |
| 历史内容绑定任务 | blueprint2 / task1 / pages4 / final-review3，无前置分析合同 | content_contract.compile、verify_blueprint_pages、report_contract、review_contract |
| 历史页面记录 | pages1/2/3 按各自布局/密度规则读取；不是当前编译器输出 | check_pages、layout_contract、density_contract、richness_contract；blueprint1 通过历史逐页对账路径，不能编译为内容绑定 pages4 |
| 更早的审查记录 | 旧 audit 走 aggregate_reviews 的历史 schema2 分支 | 仅用于对应历史输入；不能视为当前 review3/4 的替代品 |
| 审查快照 | snapshot manifest1，内含原合同、原字节及审查链 | snapshot_review、prepare_review_reuse、review_contract、package_delivery；manifest1 不代表内部 task1 |
| 已有迁移工具 | blueprint2 → blueprint3 待分析草稿与 ID 映射 | migrate_blueprint；不覆盖输入，不迁移签署，schema1 需先整理内容 |
| 当前新任务 | blueprint3 / task3 / pages4 / analysis-review2 / final-review5 | semantic-v2 已接入编译/装配/审查/快照/复用/打包；migrate_strict_analysis 创建未签草稿；新任务默认启用，见 [严格合同](strict-analysis-contract.md) |

只读操作见 [R1 实施记录](upgrade-r1-validation.md)。参考资料块和细线检查已接入 task3 的显式策略，不能据此放行旧合同。字体诊断新增分类仅影响新运行的输出；历史 audit 不补字段、不重算、不改签名。归并摘要不替换历史 warningReview 字符串与处置身份。

兼容输入的代码分支继续保留，避免已有报告失效。历史模板移入 `tests/fixtures/legacy-deck-blueprint.json` 和 `legacy-pages.json`，只用于维护测试，不作为制作入口。历史蓝图的叙事角色配额、页面的类型及布局数量门槛，不应用于当前任务；回归测试负责覆盖边界。

## 不混用三类约束

1. 数据与交付底线：来源身份、数值含义、对账、可读性、最终媒介与实际审查不能用更换名称绕过。
2. 实现约定：组件容量、特定HTML结构、静态输出支持范围须如实说明；没有专用组件不等于禁止自定义表达。
3. 分析与设计建议：是否使用某个图型、框架、布局或文字组织，由实际任务与证据决定，不把偏好变成配额。

目前真实工程边界仍包括两种画幅、静态HTML/PDF、自定义表达的作者验证责任，以及瀑布页的单一对账声明与节点上限。此次检查没有宣称消除了这些实现限制，也没有新增箱线、地图等专用渲染器。

审查复用中的“上一轮”“历史记录”表示同一报告的修订证据，不是技能产品版本。独立审查是否必需由任务风险决定；简单且无重大结论的任务可只保留作者审查。
