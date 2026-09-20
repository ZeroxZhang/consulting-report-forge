---
name: consulting-report-forge
description: >-
  Build top-tier consulting-style, evidence-led decision materials from research, data, interviews, financials, or operating evidence. Use for strategy and operating reviews, market/industry research, investment theses, board narratives, and rigorous Chinese or bilingual reports that require a governing storyline, conclusion-led pages, high-density visual evidence, precise layouts, and strict but lightweight QA. Produces a self-contained HTML report plus a matching PDF through this skill's own Node/HTML/PDF toolchain, with chart and exhibit selection made by this skill itself. Do not use for a single chart, poster, pure copyediting, or mechanical existing-file format conversion.
---

# 咨询级材料锻造 · Consulting Deck Forge

> 目标不是“好看的一组页”，而是**顶级咨询公司水准的、可供决策的视觉论证**：每一页有结论、证据、限制和行动含义；整套页有可连读的故事线、严格的图表编码和稳定的版式系统。

默认使用中文、16:9与高对比度阅读设计。用户明确指定语言、品牌、画幅、页数或媒介时覆盖默认值。

## 不可妥协的五项标准

1. **决策优先**：先写读者要做的具体选择，再组织信息；没有决策问题的“行业概览”不能直接进入制作。
2. **证据优先**：事实、估计、假设、预测和建议分开；数值有来源、期间、分母、单位和状态；反证与未知不被静默删除。
3. **标题即论证**：标题连读应构成一段可成立的判断；每个强词都要在本页主展品中找到对应证据或限定。
4. **视觉即推理**：关系由位置、长度、共同基线、直接标签、机制结构或精确表格表达；不要用装饰、色块或演讲稿替代证据。
5. **密度而不拥挤**：每页根据证明任务配置主展品、支持证据和含义；不接受普通分析页的大面积无解释留白，也不接受用卡片、图标或微字伪造饱满。

## 先选路线

| 用户要的成品 | 路线 | 实际制作工具 | 最终交付 |
|---|---|---|---|
| 可离线阅读、研究型长报告、决策材料、网页翻阅稿 | **静态报告路线** | 本技能随包 Node / HTML / PDF 工具链 | 自包含 HTML + 同版 PDF |
| 单张图、海报、纯文案、PPT/PPTX、机械转格式 | 不触发本技能 | 使用图表、设计、写作或演示文稿能力 | 按具体任务 |

本技能只产出静态报告：先生成一份**咨询 deck blueprint**，再进入制作，使用本技能的 `task.json`、`pages.json` 和 QA 脚本。它不产出 PPT/PPTX，也不把静态工具链冒充演示文稿生产。

## 统一生产闭环

### 1. 定义决策合同

提取并记录：读者及其决策权、决策问题、范围/期间、必须回答的问题、可用证据、已知限制、交付媒介、页数与品牌要求。用户已经说明的内容直接执行；仅在缺失会改变结论、范围、权限或外部行动时追问。

将每项重要主张标记为**事实、估计、假设、预测或建议**。把会改变判断的口径、期间、分母、反例、阈值和未知列为必须保留的信息，而不是放入泛化免责声明。

### 2. 先分析，不先压缩

从原始材料中提炼关系：对象比较、时间变化、构成、分布、贡献、机制、条件、权衡和行动门槛。完成必要计算与口径核验；不要把相关性写成因果、把样本写成市场、把不同统计身份的数据并成一个总数。

研究型任务先建立来源清单和主张—证据映射，再写正文。任何媒介都不是在证据不足时逃避研究的捷径。

### 3. 写总判断与叙事弧线

先写一句 `governingThought`：对象、方向和条件/取舍必须明确。再选择符合问题的叙事弧线，例如“机会到取舍”“问题到修复”“不确定性到下注”或“证据到观点”。完整方法见 [咨询叙事与决策架构](references/consulting-storyline.md)。

将所有页面标题连读。若它仍像“市场概览—竞争分析—建议”，停下来重写；应形成“为什么现在要做这个决定 → 证据显示什么 → 有什么边界/选项 → 推荐什么并如何验证”的连续推理。

### 4. 先写并校验 deck blueprint

新任务从 [deck blueprint 模板](templates/deck-blueprint.json) 创建一个蓝图。每页必须写清：

- 页面角色与故事节拍；
- 结论型标题、可选副标题、角标和讲述意图；
- `proves`：读者必须看出的一个关系；
- `visual`：主展品、图表/信息图形式、版式和阅读路径；
- `density`：`dense` / `balanced` / `sparse`，以及不同职责的证据单元和留白用途；
- `sourcePlan`：已核实、待核实，或为何不需外部来源。

在制作前运行：

```sh
node scripts/deck_blueprint.cjs /任务/deck-blueprint.json
```

校验失败时先修蓝图，不要直接在画布中堆内容。研究完成、进入实际画页前，再运行 `node scripts/deck_blueprint.cjs /任务/deck-blueprint.json --ready`；它会拒绝仍处于 `to_verify` 的主张。`dense` 页必须有主证据、背景/限制与行动/判断；`balanced` 页必须有主证据和一个不同职责的支持单元；`sparse` 页必须解释为何留白有助于决策。共享字段、模板与规则见 [页面密度合同](templates/deck-blueprint.json)。

### 5. 选择视觉表达和版式

先问“读者必须看出什么关系”，再选图型。表达选择、编码底线与禁忌见 [表达选型](references/expression-guide.md)；主辅比例、信息图严谨性、排印、对齐、色彩和高密度布局见 [咨询级单页系统](references/consulting-page-system.md)。

默认页面阅读顺序为：**结论标题 → 主展品 → 支持证据/限制 → 含义或行动 → 来源**。可以使用不对称、总览+局部、机制+量化锚点、比较表+标注、优先级矩阵等布局；不要默认左图右文、三栏卡片、金字塔、色条或大图标。

### 6. 执行生产路线

阅读 [静态 HTML/PDF 路线](references/static-html-pdf.md)。使用 `task.json` 与 `pages.json v2`，并将每页的 `data-density-profile` 与页面合同一致。首次使用或浏览器环境变化时先探测能力；每完成一页即装配、预览和返工，而不是整册完成后才发现版式问题。

### 7. 用轻量但严格的门禁收口

不要用冗长的重复检查替代判断。只执行下面四道门：

1. **蓝图门**：`deck_blueprint.cjs` 通过；标题链、页面角色、故事节拍、密度、来源计划和图形形式完整。
2. **逐页门**：实际预览中检查主证据、支持证据、标题—图形匹配、留白、来源安全区、对齐、文字对比和图表编码。
3. **最坏页门**：重看每种风险最高的一页：最密、最大留白、图表最复杂、来源最多、行动最强。复杂/重大材料由未参与制作者复核这些页和标题链。
4. **交付门**：acceptance audit、真实审查记录和打包校验。未看预览、未核实关键数字或未导出最终媒介，一律不称完成。

## 单页硬规则

- 标题必须表达判断；“驱动、导致、主要、最优、显著、唯一”等词必须有证据或改为条件性表述。
- 主图承担第一页视线；支持证据不能只是重复数字，而应提供基准、分母、异常、反例、机制条件、敏感性、风险或行动含义。
- 大于约五分之一正文高度的空白必须能解释为分组、聚焦、比较间隙或来源安全区；否则补强真实证据或重排版式。
- 用位置、长度、共同基线、直接标签和冗余编码表达比较；颜色只辅助语义，不能成为唯一含义。
- 实际、预测、目标、缺失、零值、百分比和百分点必须分开；构成图仅用于互斥可加的部分。
- 机制图中箭头必须说明流向、条件、责任或证据状态；箭头和等宽节点本身不证明因果、规模或时长。
- 文字、表格、脚注和来源必须有足够对比度与安全区；不以浅字配浅底、深字配深底，也不把决定判断的信息压成微字。
- 禁止伪3D定量图、装饰性色条、顶部色条数字卡、无意义图标阵列、未说明量尺、依赖悬停的关键信息和“内容不足时的极简伪装”。

## 按需读取

| 需要解决的问题 | 打开文件 |
|---|---|
| 形成总判断、标题链、页面角色、反证和行动门槛 | [咨询叙事与决策架构](references/consulting-storyline.md) |
| 选择图表、表格、机制图、流程或复合表达 | [表达选型](references/expression-guide.md) |
| 设计高密度页面、信息图、排印、留白与色彩 | [咨询级单页系统](references/consulting-page-system.md) |
| 生成离线 HTML/PDF、理解 task/pages/review 合同 | [静态 HTML/PDF 路线](references/static-html-pdf.md) |
| 执行逐页视觉、证据和交付验收 | [视觉与证据验收](references/visual-qa.md) |

## 归因

随包运行时基于 **Zerox Zhang 的 `consulting_deck_skill_concise`** 重组，遵循 Apache-2.0。保留随包 [LICENSE](LICENSE)；对外再分发时保留原许可证及适用归因。
