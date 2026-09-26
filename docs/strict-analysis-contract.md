# 严格分析合同：semantic-v2

运行时 `1.5.0` 的新任务默认 blueprint3 / task3 / pages4 / analysis-review2 / final-review5。三类实际验收范围见[完成记录](upgrade-r4-completion.md)。`1.4.0` 原读取器会拒绝 task3；新运行时继续按原算法读取 task1/task2。

## 单一权威与摘要

task3 与蓝图均须写 `analysisAlgorithm: "semantic-v2"`。task 归一化默认保留最初的 `policyVersions`：分析算法、reading-shadow-1、旧视觉政策及单页参考资料政策。可显式启用 structural-lines-1 和 reference-block-1，见[生产入口与策略](upgrade-production-entry.md)；省略策略的已有 task3 不自动改变。该值进入 HTML、audit 和现有公共依赖指纹。未知版本、未知策略或严格蓝图配旧 task 均拒绝。

新投影从蓝图派生，覆盖全局分析、主张、来源、附件版本，以及页面标题、proves、aside、exhibit 和其他非排版字段。页面按 ID 排序，非语义页序变化不改变分析摘要；页序与画面变化仍由视觉证据核对。附件 path 仍不进入分析身份，但文件字节必须通过既有 artifact 验证。

未分离语义/样式的 exhibit 整体纳入，工具明确提示可能额外重审。新投影不是语义理解器，不证明自然语言正确、任意图形符合原值或原数据完整。

## 展品引用与分离

新展品可以采用受限的分离结构：

```json
{
  "contract": "semantic-exhibit-v1",
  "semantics": {
    "value": {"$metric": "revenue"},
    "unit": "万元",
    "period": "2025",
    "denominator": "登记的样本边界",
    "encoding": {"blue": "已核实"}
  },
  "style": {"fontSize": 18, "x": 12, "gap": 16}
}
```

`$metric` 必须是只含该键的叶节点；编译器从现有指标引擎解析原值到 `pages[].exhibit`，指标及所属主张自动进入采纳依赖和审查覆盖。外部指标继续使用原 `metrics.external`、JSON pointer、模型血缘和附件摘要，不另抄模型结果。

只有 `fontFamily/fontSize/fontWeight/gap/padding/x/y/width/height` 这些受限样式字段可排除出摘要；颜色编码、比例尺、单位、分母、期间等放在 semantics。其他字段保守进入投影。实际渲染器必须消费派生 exhibit；工具不能证明自定义渲染器没有把样式坐标滥用为数值编码。

对仍保留原始数值的自定义展品，可显式登记精确对账：

```json
"displayBindings": [
  {"pointer": "/exhibit/data/0/value", "metricRef": "revenue"}
]
```

核对未舍入原值；舍入显示相同也不能掩盖模型输出变化。尚未映射的自定义展品仍使用整体保守摘要，不会自动推断单位/分母或声称已完成数据血缘；迁移清单将其列为 `needs_mapping_review`。当前尚未实现任意自定义图表所有显示数值的强制全覆盖映射。

对结构化表格、单位、下界关系和证据编码，可在 slide 上登记 `exhibitBindings:[{pointer:"/exhibit/data",artifactRef:"input-id",sourcePointer:"/records"}]`。综合和生产校验读取已验摘要的 JSON 附件，逐结构精确比较；`null`、文本、单位及关系符同样参与。引用的附件及其血缘进入采纳依赖。该路径不自动推断来源，也不把作者表格输入当作外部事实已核实；语义正确性仍需实际审查。

## 审查与复用

analysis-review2 须包含 `status: complete`、算法身份、当前 `analysisSha256` 和实际审查时的 `analysisProjection`，投影本身须与签名一致。旧投影用于生成逐 JSON pointer 差异，不能拿旧摘要重新标成新覆盖。

每个必需角色除原 claim/issue/option 覆盖外，还须覆盖所有 `coverage.slideRefs`。标题与侧栏的独立论断因而进入实际审查，不只沿用全局主张覆盖。作者/独立身份隔离及未决 major/blocking 拦截不变。editorial 的既有前置豁免保留，最终审查仍必需。

final-review5 绑定严格分析摘要与算法。聚合、快照、复用和打包调用同一能力表；复用草稿始终 incomplete，分析摘要为空，不能自动继承全局 PASS。旧 review4 快照继续使用 legacy-v1。

## 迁移与观察

```sh
node scripts/migrate_strict_analysis.cjs /旧任务/task.json /全新目录
node scripts/compile_blueprint.cjs /全新目录/blueprint.json /全新目录/pages.json \
  --task /全新目录/task.json --preview
node scripts/probe_reading_shadow.cjs /报告/deck.html /全新影子目录
```

迁移使用目标锁、临时目录和原子更名，拒绝覆盖或写进原任务目录；保留原任务、蓝图、pages、审查字节，并复制显式附件到新目录。新记录只写 incomplete，不生成身份、不填写 ready。开始和结束均核对输入摘要，失败清理临时目录。`original/` 用于保存原字节，不声称这些重定位原记录构成可独立运行的旧快照；旧快照仍由 snapshot_review 验证。

模型输出另列 `pendingModels: needs_portability_review`：复制代码不等于代码在迁移目录可执行。须显式修复路径、实际重算并登记新的运行/血缘；不得将旧输出的运行记录绑定到改过的输入。历史代码和结果可留作归档，不能伪称本次已执行。

影子测量接入 task3 的共同 page probe 与 QA 两种媒介，旧 task 默认不运行。单独 probe 可观察旧报告并输出整页/局部图。覆盖普通 HTML 行框、普通 SVG 字符框、来源区实际文字相交、矩形裁切与字符中心不透明遮挡；旋转、复杂路径、clip-path、位图、视口外遮挡与预算截断明确列为未覆盖。输出不参与硬失败、不替代实际读图，不输出全页“无碰撞”。

完整实际结果见 [R2 验证记录](upgrade-r2-validation.md)。
