# 关键主张的证据身份

仅记录会改变判断的主张，放在蓝图已有的 `sourcePlan.claims`；不另建重复台账。正文、关键限定和来源索引引用同一份记录。内容编译器还编译关键值并核对可见内容绑定；机器检查字段、引用、计算及待核实状态，来源真假、口径是否可比及推理是否成立仍由作者与独立复核判断。

```json
{
  "status": "verified",
  "keys": ["research/sales.csv:L2-L3"],
  "scope": "只核对用户材料与算术，未查外部原始来源。",
  "claims": [{
    "id": "sales-growth",
    "statement": "材料估计2025年销售额较2024年增长20%。",
    "kind": "estimate",
    "verification": "provided",
    "sourceKeys": ["research/sales.csv:L2-L3"],
    "period": "2024全年与2025全年",
    "population": "材料覆盖的同一市场与渠道",
    "unit": "增长率%",
    "denominator": "2024年销售额100万元",
    "calculation": "120 / 100 - 1 = 20%",
    "inference": "作为增长线索，进入单位订单利润验证。",
    "limitation": "材料估计，未外部核验；销售额增长不证明利润增长。"
  }]
}
```

- `kind`：`fact`事实、`estimate`估计、`forecast`预测、`assumption`作者假设、`recommendation`建议。外部核查不会把预测变成实际。
- `verification`：`provided`仅核对输入材料；`source_checked`已查看被引用原始来源；`pending`仍待核实；`not_applicable`仅适用于不引入外部事实的假设或建议。
- `sourceKeys`：必须引用本页 `sourcePlan.keys`；在顶层 sources 中把键解析为来源名称与 URL/文件定位；事实、估计和预测不可为空。
- 期间、覆盖对象、单位、分母、计算、允许推论、限制都显式填写；没有分母或计算的定性主张写“不适用”并说明原因。

`sourcePlan.status: verified`表示这页已完成证据裁决，可以在记录的限制内使用，**不表示每项主张都得到外部认证**。无新增研究授权时，可将材料限定为`provided`并收窄主张，不能伪写`source_checked`。来源冲突需保留裁决与未采用原因；不能只改正文数值而保留旧证据身份。

正文必须登记 claims，详见[内容制作合同](content-authoring.md)。一旦登记，蓝图校验会检查结构和引用，`--ready`拒绝残留的pending。重大报告画页前的独立复核检查：跨源拼接、分母、预测/假设身份、研究样本外推、条件树分支；最终仍审查实际HTML/PDF，前置复核不能预填最终PASS。
