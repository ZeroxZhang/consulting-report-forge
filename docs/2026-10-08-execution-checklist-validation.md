# 1.7.0 执行 Checklist 升级验证

日期：2026-10-08。实现起点：`9939db4` / 1.6.0。本文记录升级验证；代码、文档与合成评估材料随 1.7.0 升级提交，Git 历史为发布依据。

## 已实现的范围

- 新建任务默认生成 execution-plan1，需求与路线明确后激活；三种工作模式均保留两个固定多样性要求，editorial 不强加前置分析审查。
- 必需任务、用户要求映射、依赖、提交/接收、attempt、范围修订、CAS、幂等请求、不可变历史与共用锁。
- status/next/resume 只读展示目标、决策、阻塞原因、来源状态、未知实例、待接收项和可推进工作。
- 生产引用明确关联根/派生任务，拒绝失败、旧输入及其他计划产物；原始 task 无需不断重写 pages。
- 正式 ready/compile、acceptance、package 共同检查前置条件；新验收包含绑定当前 HTML 的单位/排印检查。
- chart-diversity/layout-diversity 不可删除、取消或不适用；规划、代表页与最终整册分别留证。qualityChecks 经聚合保留，并核对当前整册双媒介、每位必要角色及该审查者本人的覆盖。
- 冻结 Pn、生成交付、生成独立回执、更新 Pn+1；旧收据不能重绑到新审查。完整执行归档与历史 review-snapshot 分开，支持 checkpoint 和新目录恢复。
- 原四槽默认、旧任务/分析/审查/快照合同保留。新工作流独立于视觉候选策略，不改变既有视觉默认。

## 工程结果

| 验证 | 结果与范围 |
|---|---|
| 升级前 `npm test` | 全部通过，确认基线 |
| 升级后 `npm test` | 全部通过，包含新增 test_execution_plan |
| `test_execution_plan.cjs` | 三种模式、固定约束、防删除/取消、只读恢复、CAS/幂等、证据失效、迟到委派、依赖循环、取消任务不得直接重启、损坏恢复、搬迁 checkpoint、生产归属、防非法策略类型、重大结论双角色 |
| `test_execution_render.cjs` | 实际三页编译、装配、smoke、HTML/PDF acceptance、聚合、打包、收据幂等、完整归档与恢复；验证根 task 的 pages 尚不存在时仍可沿 productionRefs 正确恢复；直接 compile/QA 门禁生效，共用锁无嵌套死锁 |
| CSS 输入变化 | 作者 CSS 修改后旧验收有效状态变为 pending，恢复字节后可核对原链 |
| 旧严格合同真实渲染 | `test_strict_render.cjs` 通过，旧任务无需 live plan |
| 无变化页复用 | 全部页面 eligible / 无 pendingPages 时，两项全册 qualityChecks 仍是 not_reviewed，草稿不能交付 |
| 快照/复用兼容 | `test_review_reuse.cjs`、`test_analysis_snapshot.cjs` 通过 |
| Skill 结构 | skill-creator `quick_validate.py` 通过（临时隔离 PyYAML 环境，未新增项目依赖） |
| Git 文本检查 | `git diff --check` 通过 |
| 技能入口 | dbs-bridge status：公共入口、现有专属入口和 Grok 均指向本真源，无冗余 |

**渲染与审查边界：**真实启动浏览器并生成 HTML、PDF、截图；工程测试的分析和最终审查记录为明确标记的合成夹具。这些测试证明合同链和失败路径，不冒充真实业务判断或人工视觉验收。

实际渲染产物位于本地 `renders/execution-integration-<运行标识>/result.json`，按仓库规则不提交。可运行 `npm run test:execution` 重新生成 HTML/PDF、audit、审查夹具与归档，并核对结果文件；版本化行为材料见下方评估目录。

## 独立检查及修复

两个独立实例实际复现后确认修复：

1. 非字符串 workflow 被属性名转换后绕过 enabled 判断：现显式拒绝数组、对象、null、数字等。
2. 全册质量判断借用同角色其他人的覆盖：现要求该 reviewer+role 自己覆盖全部引用证据。
3. 将失败或别的计划产物登记为当前产物：现检查 published、开始时摘要、生产者及逐操作依赖。
4. 旧打包收据接到新 aggregate：现核对当前 audit/review 摘要，拒绝且 revision 不变。
5. 可解析但结构损坏的计划不能恢复：现先校验结构，保存损坏副本后恢复合法历史。
6. resume 遗漏原目标、决策及阻塞原因：现完整返回，且调用不写文件。
7. cancelled/submitted/running/done 被直接 start 覆盖：现仅 pending 可启动，其他须有理由 reopen。

[独立恢复复验记录](../evals/execution-checklist-20261008/independent-recheck-results.json)保留实际观察与限制。

## 干净上下文行为演练

用三个明确标注的模拟交接点比较基线技能与候选技能。两个独立上下文读取同样的用户请求、task-context 和 resume-output，不给隐藏标准答案，不修改任务或补签。

| 场景 | 基线与候选实际表现 |
|---|---|
| 两页 editorial 定性编辑稿 | 均保留图表/版式要求；不恢复用户取消的研究；区分品牌文件阻塞和可继续的内容整理 |
| analytical，simple + majorConclusion | 均要求独立审查；把旧实例 status_unknown 当作待核实，未直接重复派工；缺产能数据不伪造 |
| exploratory，内部收入 CSV 缺失 | 均保留依赖阻塞，识别可继续的公开基准研究；未知不填零/平均，不重启已取消的投资建议 |

候选明确依据持久计划与 attempt 推进；基线在提供同等交接信息时也作出了合理判断。**没有证据宣称新版比基线更聪明、显著提速或减少某个百分比的返工。**本次验证支持的是强制记录、状态核验与恢复协议可用，而非整体报告质量优越性。

材料与原始观察：[材料清单](../evals/execution-checklist-20261008/materials-manifest.json)、[基线观察](../evals/execution-checklist-20261008/baseline-recovery-observations.md)、[候选观察](../evals/execution-checklist-20261008/candidate-recovery-observations.md)。这些是模拟交接，不是另外制作的三份完整报告。

## 实现边界

- 输入变化采用保守失效；尚不声称能精确调度到单页。原有逐页视觉证据复用仍独立工作。
- 搬迁恢复保留历史审查快照和 plan ID，但增加 scopeRevision、清空当前生产索引，要求重新核实。无需原目录才能读取工作材料，不能据此自动继承过去的完成结论。
- 宿主 todo 与子 Agent 进程查询不在独立运行时内实现。技能要求主 Agent 查验可用宿主；无法核实就保留未知，不虚构在线状态。
- Checklist 能检查声明、文件和依赖，不能证明审查者确实阅读或“尽可能多”的审美判断；这部分仍须真实执行技能。
