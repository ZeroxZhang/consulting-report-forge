# 1.6.0 逐展品校验修复

日期：2026-09-26。对应真实 AI 生物制药报告试运行后的代码复核。未合并、未提交，默认视觉策略保持不变。

## 根因与修复

组合合同已引入 panel 身份，但部分渲染验证仍使用页级作用域；量尺自动检查仅有声明，没有实际测量链路。

- 组合页 SVG、KPI、finding 的容量独立核对，不再把主图计划用于次图。非组合页保留原有检查路径。
- 每张瀑布必须提供自己的输入；探针逐 panel 采集可见对账轴、模型、节点数、容差、残差和柱节点。最终验证将各自权威输入与各自渲染结果对账，屏幕与打印均执行。旧策略仍拒绝一页多条对账轴。
- 自动量尺当前仅支持 kit.dumbbell 线性轴。声明中的 domain/unit/scaleType 必须完整、一致；渲染器输出最终解析的量尺，探针验证实际数据点坐标与绘图区像素跨度。未支持的形式不能声明 auto，通过 manual 路径登记实际审查。
- 人工量尺项进入 audit warnings，并保留组、panel 与媒介身份。漏掉打印媒介的处置记录会被最终审查合同拒绝。
- 删除必然通过的测试断言，新增真实浏览器反例，并将新脚本接入 test:render。

## 实际验证

以下命令已通过：

- `npm test`
- `npm run test:render`
- `npm run test:upgrade-render`
- `npm run test:upgrade-r2`
- `npm run test:upgrade-r3`
- 最后补充断言后单独重跑 `node scripts/test_composition_contract.cjs`：76项。
- 最后补充反例后单独重跑 `node scripts/test_composition_render.cjs`：67项，覆盖两个瀑布渲染器、屏幕／打印、实际PDF输出及独立容量。
- `node scripts/test_review_reuse.cjs`：62项，含人工量尺分媒介处置缺失的拒绝。
- 原25页AI生物制药成稿使用当前运行时执行全册 smoke：geometry PASS、errors为空。原交付文件与原审查快照未改写；本轮 smoke 不冒称重新完成独立成稿审查。
- `git diff --check` 无错误。

浏览器测试首次扩展 finding 夹具时因依据少于既有硬下限3而失败；修正夹具为合法3/4项后通过，未放松产品规则。

运行日志保留在 `renders/composition-fix-validation/`（本机验证产物，不作为源代码提交）。真实报告复验位于 `/Volumes/Out/临时任务/0924_mimo_forge_test/codex_v160_report/validation-v160-fix/`。

## 发布边界

本轮修复三个已复现的校验问题及无效测试；不代表所有图型均有自动量尺适配器，也不替代版本计划中的受控行为评估、真实旧稿基线与性能测量。默认策略未切换，不声称新版创作质量或速度已经通过对照实验验证。
