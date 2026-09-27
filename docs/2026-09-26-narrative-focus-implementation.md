# 叙事主线与单页焦点实施记录

日期：2026-09-26。分支：`feature/1.6.0-evidence-composition`。基线：1.5.0 @ `95e3935`。对应[复合证据升级方案](2026-09-26-evidence-composition-upgrade-plan.md)与[三组行为先导评估结果](2026-09-26-behavior-pilot-results.md)。

## 1. 这一轮解决什么

先导评估暴露的问题不是工程缺陷，是能力缺口：同一笔金额在图、侧栏与结语各出现一次；结语页新增信息有限；比较目标没有稳定落到编码。这些都属于"故事线清不清晰、重点明不明显"，而这两件事此前只写在 `references/consulting-storyline.md` 的散文规则里——没有字段、没有校验、没有审查项。

技能的质量防线有三层：蓝图合同、渲染探针、审查覆盖。故事线与重点感是唯二在这三层里完整缺席的维度，所以规则写多少遍都不会改变行为。这一轮把这两个维度接进同一套机制，不新建第二套系统。

## 2. 已完成的改动

### 2.1 新增视觉策略 `narrative-focus-1`

能力表（`scripts/contract_capabilities.cjs`）里新增一项，包含 `evidence-composition-1` 的全部能力，再加 `narrative` / `pageFocus` / `visualFocus`。包含关系是 `narrative-focus-1 ⊃ evidence-composition-1 ⊃ structural-lines-1`，与既有的 `evidence-composition-1 ⊃ structural-lines-1` 同一模式。既有两个策略的能力值**未改动**，已产出的报告保持原解释。

按能力查询而不是策略名相等的地方：`composition_contract.supportsComposition`、`review_contract.requiredLayers`、`review_contract` 与 `review_pack` 的组合覆盖分支、`analysis_review_contract` 的组合覆盖与叙事覆盖分支、`browser_visual_policy` 的细线检查。这些位置此前有三处写死了策略名相等，换到包含策略时组合检查会整体沉默——正是能力表要防的那类失效，已一并改掉。

### 2.2 叙事主线：一册一条推进的论证

新增 `scripts/narrative_contract.cjs`。只新增两个作者字段，其余全部从既有蓝图派生：

| 检查 | 依据 | 级别 |
|---|---|---|
| `deck.arc` 声明沿哪条弧线推进 | 四条默认弧线 + `other`（须写推理顺序） | 阻断 |
| 弧线对应的收束节拍真的走到 | `slide.storyBeat` | 阻断 |
| 每个正文页写 `adds`：读者比上一页多知道什么 | 作者字段，≥12字 | 阻断 |
| 相邻两页 `adds` 近似重复 | 字符二元组包含度 ≥0.6 | 阻断（可写 `addsOverlapReason` 豁免） |
| `adds` 与另一页标题/`proves` 高度重合 | 包含度 ≥0.75 | 诊断 |
| `synthesis.answerClaimRefs` 被某一正文页的 `claimRefs` 承担 | 既有字段派生 | 阻断 |

逐页要求从综合阶段起生效，研究阶段只要求弧线——与组合合同"研究可无页面、页面规划起才要求完整声明"的边界一致。

### 2.3 单页焦点：一页只讲一件事，且这件事收束

| 检查 | 判定 | 级别 |
|---|---|---|
| 每个正文页恰有一个 `data-reading-role="takeaway"` 节点 | 成稿 DOM，屏幕与打印都核 | 阻断 |
| 标题、副标题、收束句三者两两不复述 | 重合率（除以较长的一段）≥0.85 | 诊断 |
| 声明的 primary 是页面上实际最大的展品 | `page_probe` 采集逐 panel 绘制面积 | 诊断 |
| 正文里没有大于标题的字号 | 采集标题字号与正文最大字号 | 诊断 |

三者用重合率而不是包含度：收束句合理地把标题的判断包含在内（判断 + 行动），真正的复述是"长句里几乎没有新东西"。这条检查上线后立刻在本轮自己的代表页上报了问题——收束句当时直接绑定主张文字，等于把标题重说一遍，已改为作者写的收束句。

判据落在 `narrative_contract` 的纯函数里，`page_probe` 只采事实：新增 `focus` 块采集收束节点数量与实际文字、标题字号、正文最大字号、各 panel 的可见绘制面积。类名只是样式，语义靠 `data-reading-role` 这个显式标记，避免"类名对不上就静默失效"。

三条诊断走现有 warnings → 人工处置链，没有新增展示用的 findings。

### 2.4 审查层

- 最终审查新增 `narrative` 层（`requiredLayers(taskContract)` 按能力派生；旧策略仍是四层，历史稿不追溯）。
- 逐页覆盖要求 `coverage.narrativeReadings`：每页填**实际读到的收束句**，与该页 DOM 上的收束句相似度 <0.6 即判为对不上——抄蓝图声明不算看过这一页。
- 审查者记录的收束句之间也做重复检查（重合率 ≥0.75）：两页写出来几乎一样，说明读者从这两页拿到的就是同一件事。确需并排强调时在 `coverage.repetitionBasis` 写明理由。
- 前置分析审查新增 `coverage.narrativeRefs`（逐页）与 `coverage.arcBasis`（≥12字，说明弧线与逐页新增理解为什么构成一条推进）。
- `review_pack` 派生叙事清单：预填每页声明的 `adds`/`proves`，`observedTakeaway` 留空给审查者。工具不生成 PASS。

### 2.5 遗留收口

- **迁移入口**：`migrate_strict_analysis.cjs ... --to-policy narrative-focus-1`。复用"新目录、锁、原字节归档、失败清理"机制；不搬运任何签署，`arc`/`adds`/逐页收束句全部留成 pending，草稿固定 incomplete；pages 不继承，须在补齐后重新编译。
- **显式启用入口**：`report.cjs init <目录> --visual narrative-focus-1`。未登记策略在这里就被拒绝。默认模板仍是 `structural-lines-1`。
- **量尺自动核查覆盖面**：新增 `kit.slope` 适配器（值映射到纵轴），探针按适配器表分派并在适配器声明的那一维上比较坐标；轴声明与适配器不符会被拦下。`kit.bullet` 等其余形式仍明确走 manual 人工路径。
- **版本口径**：`docs/maintainer-contracts.md` 的运行时版本、`README.md` 版本徽章与 1.6.0 说明段已同步。

### 2.6 代表页

`docs/showcase/build-focus-samples.cjs` 生成 `renders/focus-samples/narrative-focus/`：两页推进（诊断 → 行动）的合成小册，`problem-to-fix` 弧线，每页一个收束节点，副标题写口径。可编译、可装配、可跑 acceptance。合成输入，不生成任何通过记录。

## 3. 实际验证

以下命令已通过：

- `npm test`：含新增 `scripts/test_narrative_contract.cjs`（55 项）。
- `npm run test:render`：含新增 `scripts/test_narrative_render.cjs`（18 项，真实浏览器）。
- `scripts/test_composition_render.cjs`：75 项，含新增的 slope 适配器正例与两类反例。
- `scripts/test_composition_contract.cjs`：82 项，含包含策略的能力查询反例。

代表页 acceptance：`errors=[]`、`geometry=PASS`、`acceptance=true`。反例验证（在代表页上注入错误后重跑）：

| 注入 | 结果 |
|---|---|
| 删除收束节点 | 第 2 页被拦：没有标记为 takeaway 的收束节点 |
| 增加第二个收束节点 | 第 2 页被拦：有 2 个 takeaway 节点 |
| 正文注入 40px 大字 | 诊断：正文里有 40px 的文字大于标题的 32px |
| 副标题改成复述标题 | 诊断：重合度 100% |
| 第二展品大于声明的 primary | 诊断：主展品与第一眼的落点不一致 |

叙事合同的反例同样逐条验证：缺弧线、弧线未走到收束节拍、缺 `adds`、只改标点仍算重复、核心答案无人承担、旧策略输入新标记被拒、研究阶段不逐个要求 `adds`。

## 4. 未完成与边界

| 项目 | 状态 |
|---|---|
| 同题同模型的行为对照复测 | **未做**。按发布底线，`templates/task.json` 保持 `structural-lines-1`，未切新建默认 |
| 自动量尺覆盖面 | 只覆盖 `kit.dumbbell` 与 `kit.slope`；其余形式明确记为人工项，不宣称全自动数值几何验证 |
| 迁移内容猜测 | 迁移不生成弧线、不生成 `adds`、不生成页面收束句；无法确定的一律 pending |
| 相似度阈值 | 0.6 / 0.75 / 0.85 由合成用例与代表页校准，尚未在真实长稿上校准；豁免字段与诊断处置是兜底 |
| **同义改写抓不到** | 见下节。这是本轮最重要的已知边界 |

### 字面测度的边界（实测）

"相邻页在讲同一件事"这一条，只能覆盖它最表面的形态。字符二元组是**字面**测度：

| 用例 | 相似度 | 是否被抓 |
|---|---:|---|
| 逐字复述 | 1.00 | 是 |
| 只改标点 | ≥0.9 | 是 |
| **同义改写**（"名义总额不是现金，首付占比很低" 与 "名义金额不等于现金流入，预付款占比低"） | **0.09** | **否** |

把阈值降到 0.5 甚至 0.2 也抓不到同义改写，只会让任意两句同主题的中文互相误报。同义层面的原地踏步没有可用的离线语义测度，只能由审查者判断；`coverage.repetitionBasis` 与审查层的逐页记录是这条判断的落点，机器只负责暴露"审查者自己都没区分开"的那些。

在真实素材上的实测：取 15 页 AI 生物制药成稿，按其 `proves` 逐页补写诚实的 `adds` 后运行，阻断 0 项、诊断 0 项——规则在真实内容上**可以满足，不会卡死**；但其中两页（情景分岔条件页与触发器页）在人工阅读下仍属同一件事，字面测度没有识别出来。这条边界决定了：本轮的价值集中在**结构与几何**层面（收束节点唯一性、字号次序、主展品失焦、三者复述），不在"两页是否同义"这个判断上。
| 整册视觉复用 | 首次启用新策略使整册视觉复用失效，须重新生成 acceptance 并完成整册 HTML/PDF 审查 |

默认策略未切换，不声称新版创作质量或速度已经通过对照实验验证。
