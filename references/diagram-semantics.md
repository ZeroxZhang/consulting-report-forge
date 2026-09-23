# 图示语义合同

新报告使用 `scripts/render_diagram.cjs` 时必须声明 `form`。五种 `diagram.*` 共用几何绘制，但各自的数据合同不同；渲染前先校验，输出 SVG 带 `data-form`、节点角色和边关系。旧版无 `form` 的独立图示输入仍可重渲染，但不具备语义合同，也不能通过新蓝图的最终形式对账。字段齐全不能证明业务因果或概率正确，仍须检查证据和最终画面。

| form | 必须声明 | 会拒绝 |
|---|---|---|
| `diagram.mechanism` | 每条边的作用 `label`、`evidenceStatus`（`supported` / `hypothesis` / `unknown`）；回路边 `feedback:true` | 未标证据状态、未标反馈的循环 |
| `diagram.process` | 节点 `stage`；边 `role`（`sequence` / `transfer`）和交接 `label` | 手填 `width` 暗示未经核对的量流；定量流可用桑基等形式 |
| `diagram.swimlane` | `"layout":{"laneBands":true}`（标题不可关闭）、节点 `lane` 与 `stage`，至少两个主体和两个阶段；跨主体边 `handoff`，同主体边 `sequence` | 声明泳道却没有画出轨道标题和泳道带，或边的交接角色与主体变化不符 |
| `diagram.hierarchy` | 边 `relation`（`contains` / `depends_on` / `requires`），有且只有一个包含根 | 把依赖冒充包含、多个包含上级、包含环 |
| `diagram.condition` | 节点 `role`（`decision` / `outcome`），每个决策至少两个带 `condition` 的分支；填写概率时覆盖该节点全部分支，合计为 1 | 结果再分支、循环、无依据或不闭合的 `probability` |

例如机制图的关键数据可写为：

```json
{
  "form": "diagram.mechanism",
  "nodes": [{"id":"demand","title":"需求"},{"id":"capacity","title":"产能"}],
  "edges": [{"from":"demand","to":"capacity","label":"触发扩容评估","evidenceStatus":"hypothesis"}]
}
```

实际渲染还需画布尺寸、交付字体配置与节点坐标，或设置 `layout` 让布局器排布。`diagram.condition` 会把决策节点画成菱形、结果画成圆角框，直接显示分支条件；登记概率时连同依据写在边标签里。`diagram.mechanism` 会把反馈或未证实的边画成虚线，并显示“假设”或“未核实”。`diagram.hierarchy` 将包含边画成无箭头实线，依赖和必要条件画成带文字的虚线。变更形式时重新核对节点与边，不能只改 `form` 字符串。

最终 QA 从浏览器中的可见 SVG 读取节点、连线、标题、泳道带、线型和概率文字，再按 form 复核。隐藏或透明的语义图元不计入。这能发现导致形式结构不完整的误删，以及已登记语义文字和样式的错配；蓝图未逐条登记预期关系，删去后仍结构完整的边仍需人工对照原始证据。这些标记不是来源认证，业务关系与证据仍需独立审查。
