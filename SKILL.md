---
name: consulting-report-forge
description: >-
  Create evidence-led consulting reports for strategy, market research, operating reviews, investment analysis, and qualitative research. Combine business analysis, a coherent argument, precise visual exhibits, and reading-oriented layouts. Use for Chinese or bilingual decision reports and thoughtful restructuring of approved content. Produce self-contained HTML plus matching PDF with the bundled toolchain. Do not use for a single chart, poster, pure copyediting, PPTX, or mechanical format conversion.
---

# 咨询报告制作

目标是可核查、可阅读、能支持判断的报告。默认中文、16:9、阅读模式、自包含 HTML + 同版 PDF；用户指定的语言、画幅、品牌、页数和范围优先。不要承诺“完美”或把检查通过等同于咨询质量。

## 工作方式

主笔负责总判断、方法选择、整篇标题链和最终成稿。仅在研究、计算、领域知识出现明确缺口时启用相应专家；复杂或重大材料另需实际独立实例审查。分工、输入输出和隔离要求见 [协作协议](references/collaboration.md)。没有可用的独立实例时，继续完成可做的工作并如实报告未独立验收，不能以换角色提示词冒充。

开始时简要说明目标、材料缺口、预计页数范围及验收方式，然后直接工作。已知信息不重复问，阶段节点不要求用户批准。只在答案会改变任务方向且无法从材料确定时提问。**必须按 [缺口与询问协议](references/analysis-workflow.md#3-缺口触发与路由每一阶段都执行) 登记缺口、调用当前可用的输入工具并等待实际答案；暂停依赖分支，同时推进无依赖工作。空回复、超时与默认选项未提交都不能当成答案。**记录主要阶段实际耗时、返工原因及可得的资源消耗；未测量不承诺固定用时。长报告先做代表页，不要求每完成一页都重建整册。

## 1. 确定问题与证据边界

确认读者、用途、核心问题、期间、对象、可用证据及限制。三种工作模式：

- `editorial`：已确认内容的组织与重排，保留原意，不擅自增加新结论。
- `analytical`：需要计算、比较、建模或判断，先校验方法及口径。
- `exploratory`：开放研究，允许以有限发现、未知和下一步验证收束，不强造投资建议或行动页。

用户材料先核对原文；本地材料已提供不等于外部事实已核实。公开信息出现重要缺口时，在用户范围内自动启动外部调研；内部数据、目标或取舍缺口向用户询问，机制贯穿研究、分析与审查。把影响判断的主张区分为事实、估计、预测、假设、建议，记录来源、期间、对象、分母、单位、计算与限制。未知不填零，样本不当市场，相关性不当因果。

## 2. 选方法，完成分析

分析与探索先读 [统一分析流程](references/analysis-workflow.md)，在蓝图登记 brief、issues、workItems、gaps。按业务问题读取 [分析方法路由](references/analysis-methods.md)，选择解决当前问题的最少方法组合。需要的产物是可检验的关系及其边界，不是框架名称。经营拆解、规模与强度、单位经济、情景敏感性、竞争选择和定性机制各有不同前提。

审查特别注意：成本占比不能证明成本随规模的变化；人均收入不能直接证明生产率或盈利；作者设定的阈值只能触发核查，不能自动证明因果；预测及情景不能悄然写成历史事实。必要计算用可复算数据完成，不在正文里心算。

## 3. 形成标题链与统一蓝图

先把有条件的核心答案写在全局 claims，并以 `analysis.synthesis.answerClaimRefs` 引用；schema3 的 `governingThought` 由它派生。再按 [叙事方法](references/consulting-storyline.md) 形成“问题—证据—判断—边界”的推进。标题连读应有完整论证；每页 `proves` 对应画面能证明的关系。证据不够就缩小结论，不用强词弥补。

新任务统一用 `node scripts/report.cjs init /任务/新报告` 创建，采用 schema3 / task3 / semantic-v2；研究可从无页面的 [研究模板](templates/research-blueprint.json) 起步。使用[蓝图模板](templates/deck-blueprint.json)与[内容制作合同](references/content-authoring.md)。蓝图是标题、关键主张、来源、计算、密度和页面意图的权威源；`pages.json` 由编译器生成，不手工维护第二套内容。

新稿按[严格合同](docs/strict-analysis-contract.md)执行，前置审查 v2、最终审查 v5。旧稿继续原合同，不自动改算法、补签或转换版本。统一入口、任务锁、多页参考资料和审查包见[生产入口](docs/upgrade-production-entry.md)。

先校验综合，再按[签署步骤](references/analysis-review.md)完成前置审查并绑定 task，最后运行正式生产门：

```sh
node scripts/deck_blueprint.cjs /任务/deck-blueprint.json --task /任务/task.json --stage synthesis
# 实际完成前置分析审查并绑定 task.analysisReview 后：
node scripts/deck_blueprint.cjs /任务/deck-blueprint.json --task /任务/task.json --ready
node scripts/compile_blueprint.cjs /任务/deck-blueprint.json /任务/pages.json --task /任务/task.json
```

正文页必须有关键主张登记。已登记标题、主张身份、口径限制、来源和指标用可见 `data-content-key` 节点进入成稿；装配自动填值，最终 QA 重新验证。analytical/exploratory 按 [前置分析审查](references/analysis-review.md) 完成并绑定 analysis-review.json；复杂或重大材料必须实际独立实例复核。缺审查只可在蓝图 ready 校验与编译命令均显式加 `--preview`，解决会推翻整篇的错误后再正式生产。这不是用户审批，也不替代最终审查。

## 4. 从证据关系选择表达与布局

先确定比较、变化、构成、机制、条件或取舍，再选图形和可承载的布局；容量不足时重新组织，两者迭代。不要先选格子再凑证据。

schema 3 正文页在 `visual.selection` 写 `relationship` 和具体的 `reason`，解释主张需要读出的关系及该形式的编码；有实质备选时再写 `alternative` 与 `tradeoff`。有已登记容量规则的形式同时写 `visual.capacity` 的计划计数。`ready` 拦截关系与形式明显不匹配、缺计数或超过硬上限；`pages.json` 保留这两项，最终 QA 将已登记渲染器的实际图示容量与蓝图计划对账。选型理由是否成立仍由审稿者按证据和最终图判断。

- 目录布局是经过测量的原型：按需读 `assets/layout-atlas/catalog.json`，用 `layout_contract.measure()` 检查尺寸；选择后保留其模块和几何合同。
- `visual.layout: "custom"` 是正常路线：声明阅读区域，自己写 CSS，接受相同的可读性、溢出、证据和打印检查。
- 自绘 SVG 必须说明实际语义。瀑布统一从权威原始输入经内核诊断，起点、增量、终点必须闭合；示意图也不能出现错误加减关系。
- 使用 `diagram.*` 时按 [图示语义合同](references/diagram-semantics.md) 声明节点、边和角色；渲染器按形式拒绝不相符的结构，输出携带可核对的形式与语义标记。
- 同类分面、连续同型图和表格可帮助比较。报告不因图型/布局种数、重复次数或空白像素直接失败；相关诊断仍须结合画面解释或修复。

具体表达见 [表达指南](references/expression-guide.md)与[自动生成的形式容量目录](references/form-capacity.md)，区域、密度与组件类名见 [单页系统](references/consulting-page-system.md)。需要组件时运行 `node scripts/sweep_forms.cjs` 查询，原生 SVG 与 HTML 表格同样是有效表达。未封装图型可自绘或通过原生配置生成静态 SVG；登记表和分析方法表不是能力白名单，组件上限不应外推为全局禁令。禁止伪 3D、无意义色条、未说明截轴、只靠颜色、悬停才可读的关键内容与以微字塞满页面。

## 5. 代表页收敛后批量生产

先做 2–3 张能够暴露不同风险的代表页：核心定量页、最密或最复杂页、定性/行动页。少于此规模时直接做全部。实际预览确认主图、支持证据、口径、字号、留白与来源安全区，再扩展全篇；保留合理重复的视觉语言。

依 [静态 HTML/PDF 路线](references/static-html-pdf.md) 创建 `task.json`，绑定 blueprint 与 pages。首次环境运行或依赖变化时完成字体与能力探测；可复用已验证环境。制作期只预览受影响页，整册成形后做 smoke；不为每页导出一遍完整 PDF。

## 6. 验收和修订

工程验证与判断审查各有边界，二者都要完成：

1. **分析**：标题是否被支持，方法前提、分母、身份、边界与反证是否正确。字段齐全不能证明结论成立。
2. **视觉**：实际查看最终 HTML/PDF 每页；读者能否看清关系、关键限定与来源。重点重看最密、最大空白、最复杂图、来源最多与最强结论页。
3. **工程**：`qa_deck.cjs --tier acceptance` 核对绑定、布局、溢出、字体、打印、离线和最终证据；自动检查不替代读图。
4. **交付**：作者记录实际所见；复杂或重大材料另由独立实例记录审查，简单且无重大结论的任务可仅作者审查。处置 warnings；合并 review 后打包。未解决 major/blocking 问题不称完成，需要独立审查但未完成时不冒充正式交付。

具体命令与记录格式见 [静态路线](references/static-html-pdf.md) 和 [视觉验收](references/visual-qa.md)。首次完成审查后，使用 [审查快照与复用](references/review-reuse.md) 冻结原稿、证据与审查链。局部修订可准备继承草稿；变化页和全局判断仍须真实复核，工具不会预填 PASS。

完成时给出 HTML/PDF、主要结论或变更、验证范围与尚存限制。没有做同题同模型对照实验，不声称未经测量的提速比例或总体优势。

## 按需参考

| 任务 | 文件 |
|---|---|
| 分阶段分析与询问暂停恢复 | [analysis-workflow](references/analysis-workflow.md) |
| 前置审查与版本绑定 | [analysis-review](references/analysis-review.md) |
| 业务方法与适用边界 | [analysis-methods](references/analysis-methods.md) |
| 专家分工与独立审查 | [collaboration](references/collaboration.md) |
| 总判断、标题链、有限结论 | [consulting-storyline](references/consulting-storyline.md) |
| 蓝图、计算、可见内容绑定 | [content-authoring](references/content-authoring.md) |
| 来源与主张身份 | [evidence-ledger](references/evidence-ledger.md) |
| 瀑布数据与诊断 | [waterfall-bridge](references/waterfall-bridge.md) |

## 归因

运行时基于 Zerox Zhang 的 `consulting_deck_skill_concise` 重组，遵循 Apache-2.0，保留 [LICENSE](LICENSE)。瀑布数据判据端口自 `aeolus-period-waterfall` 的诊断逻辑；是规则移植，不依赖其目录。
