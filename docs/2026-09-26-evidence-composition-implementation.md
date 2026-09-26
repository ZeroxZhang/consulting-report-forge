# 复合证据升级实施记录

日期：2026-09-26。分支：`feature/1.6.0-evidence-composition`。基线：1.5.0 @ `95e3935`。对应 [升级方案](2026-09-26-evidence-composition-upgrade-plan.md)。

## 已完成

### T2 — 统一组合合同与策略能力

- 新增 `scripts/composition_contract.cjs`：结构校验、依赖提取、兼容投影、期望图示清单、瀑布作用域、量尺检查，集中在纯函数。
- 扩展 `scripts/contract_capabilities.cjs`：视觉策略能力表（`legacy-1` / `structural-lines-1` / `evidence-composition-1`），集中查询替代散落字符串相等判断。`evidence-composition-1` 包含 `structural-lines-1` 全部检查再加逐 panel 检查。
- 字段已冻结：`semantics.composition.{version,anchorPanel,readingOrder,panels,relations,scaleGroups}`，panel 含 `{purpose,claimRefs,form,selection,capacity,data,waterfall,scaleGroup,semanticType,visual,sourceKeys}`。

### T4 — 编译与依赖接入

- `analysis_contract.cjs`：`adopted()` 显式纳入 panel.claimRefs（嵌套引用进已采纳依赖闭包）；`validate` 校验组合与策略一致性。
- `analysis_projection.cjs`：`validate` 调用组合结构校验。
- `content_contract.cjs`：编译时通过 `deriveVisual` 派生旧格式 region.form / page.form / primary / selection / capacity；编译后 panel 数据 `$metric` 解析为真值。
- `report_contract.cjs`：策略合法性改用 `normalizePolicies` 集中查询。

### T5 — Panel 身份与逐图 QA

- `assemble_deck.cjs`：装配时校验 `data-panel-id` 与组合声明一致、审计根不嵌套、每个声明 panel 恰有审计根。
- `page_probe.cjs`：展品收集 panelId（最近 `data-panel-id` 祖先）；瀑布按 panel 分组计数。
- `check_pages.cjs`：逐 panel 形式/容量/漏图/额外展品检查。

### T6 — 瀑布作用域与量尺

- `page_probe.cjs`：`waterfallScope` 由策略能力决定——`evidence-composition-1` 逐 panel（同页两张独立瀑布合法，同 panel 内重复对账仍阻断），旧策略保持页面级 WF-MULTIPLE-AUDIT。
- `composition_contract.cjs`：scaleGroups 声明 shared/independent、auto/manual、basis。

### T7 — 审查身份（条件策略覆盖）

- `analysis_review_contract.cjs`：新策略下要求 review 携带 `policyVersions.visual` 身份与按 slideId 的 panelRefs/relationRefs 覆盖；缺失即拒绝（不能沿用旧签署）。

### T8 — 文档同步

- `SKILL.md`：补充「先组织证据再选图与布局」与复合证据段落。
- `references/consulting-page-system.md`：新增复合证据组织段落，含阅读任务—组织方式—核对关系表。
- `references/visual-qa.md`：区分旧页面级与新 panel 级瀑布作用域。
- `docs/maintainer-contracts.md`：新增复合证据任务行与策略能力集中查询说明。

### T9 — 分层验证

- 新增 `scripts/test_composition_contract.cjs`：68 项断言，覆盖 A（结构/依赖/投影）、B（逐图/瀑布/量尺）、C（版本/审查/兼容）关键用例含篡改反例。
- 已挂入 `npm test`。全量 13 项 PASS，`test:upgrade-r2` / `test:upgrade-r3` PASS。

### T3 — 代表页（完成）

- 新增 `docs/showcase/build-composition-samples.cjs`：两个可编译、可装配的复合证据代表页。
- **三栏互补**（threeColumn）：收入 dumbbell + 成本 text + 利润 KPI，complement 关系，page.form 从 primary panel 派生为 `kit.dumbbell`。
- **总览+细节**（overviewDetail）：利润瀑布桥 + 精确对照表，overview-detail 关系，page.form 派生为 `kit.waterfall`，逐 panel 瀑布对账。
- 两个样例均通过组合校验、编译、装配、panel 身份对账、内容绑定验证与容量标记检查。
- 产物在 `renders/composition-samples/`，含 blueprint.json / pages.json / deck.html / task.json。

### 本轮新增修复

- `deck_blueprint.cjs`：组合策略下 `visual.form` / `visual.primary` 从 panel 派生。
- `analysis_contract.cjs`：`form_contract.validate` 使用派生后的 visual。
- `content_contract.cjs`：组合下瀑布声明逐 panel 体检，不再强制页级 `slide.waterfall`。
- `check_pages.cjs`：瀑布对账按 panel 作用域，有 panel 瀑布时跳过页级检查。
- `assemble_deck.cjs`：panel 身份对账移出浏览器上下文（纯数据比对）。

## 待完成

| 任务 | 内容 | 阻塞原因 |
|---|---|---|
| T1 完整基线冻结 | 1.5.0 真正成稿的输入哈希、摘要、快照复用结果记录 | 需要真实成稿样本 |
| T7 迁移模式 | `migrate_strict_analysis` 扩展组合迁移入口 | 低优先级，显式升级时才需要 |
| T10 切默认 | 切换 `report init` 默认策略 | **需要行为评估**：同题同模型对照显示实际改善 |

### T7 — final-review5 组合覆盖（完成）

- `review_contract.cjs`：新策略下 coverage 须携带 `panelRefs`/`relationRefs`，逐项核对组合关系覆盖；缺覆盖即 fail。
- `review_pack.cjs`：草稿生成时预填 `compositionChecklist`（由合同派生的 panel/relation 待查清单），审查者填写实际所见，工具不生成 PASS。

### T10 — 发布检查（待行为评估）

按计划 §10：「若受控评估未能显示实际改善，保持候选状态，不能只凭测试全绿切默认。」

**发布检查单（全部通过后才能切默认）：**

| 检查项 | 状态 |
|---|---|
| 全部兼容硬断言通过 | ✅ 13 项 + r2/r3 全绿 |
| 代表页无未解决重大问题 | ✅ 两页 QA acceptance PASS |
| 需要复合关系的任务能被独立审稿者看懂 | ⏸ 待行为评估 |
| 单图和定性对照不被强迫加图 | ⏸ 待行为评估 |
| 同题同模型对照显示实际改善 | ⏸ 待行为评估 |

**回退预案：**
1. 撤回「新建任务默认启用」（还原 `templates/task.json` 的 `policyVersions.visual` 为 `structural-lines-1`）
2. 已创建的 `evidence-composition-1` 任务仍由支持该策略的运行时处理，不删标记伪降级
3. 必要时从原基线创建独立旧合同任务重新制作与审查

- 默认模板**未**切换：`report init` 保持 1.5.0 的 `structural-lines-1`，`evidence-composition-1` 仅显式启用。切换需完整验收后执行。
- 未做同题同模型对照实验，不声称创作质量改善。
- 未做真实 HTML/PDF 逐 panel 双媒介验证（需要完整成稿）。
- 性能（1/3/6/9 图页耗时）未测量。
