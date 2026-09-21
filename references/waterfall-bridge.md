# 瀑布数据合同

> 瀑布图的唯一数据权威。渲染器只负责画，不重算语义；口径有争议时以本文件为准。

瀑布的失败几乎从不发生在画面上，而发生在取数：把缺失当零、把不闭合的差额取整整掉、把描述性分解说成因果归因。本文件把这三件事变成工具能判定的规则。

## 一、先判定：该不该用瀑布

| 用 | 条件 |
|---|---|
| 起点 → 有序增减 → 终点 | 增减可加总、方向明确、读者要能逐项对账 |
| 分类贡献拆解 | 各分类的增量之和等于整体净变化 |
| 费率结构化变动 | 两期各分类都有分母/权重（见 §三 rate） |

不用：分类不互斥或范围不完整却声称完整加总的“构成”（堆积图也不能解决互斥性问题，应重定范围、说明剩余项或改为非加总比较）；只有起止总量、没有驱动项（**只有起点和终点做不出贡献拆解**，内核直接阻断并要你补数）；增减之间是相关而非可加。

## 二、三个入口与三种模式

内核是 `assets/waterfall-bridge.js`（UMD，零依赖，浏览器与 node 通用）。对外两个函数：

```js
const W = require('./assets/waterfall-bridge.js');
const report = W.diagnose(payload, { provenance: true });  // 体检 → 推导 → 闭合校验
W.present(report);                                          // 追加预格式化文本
```

**预格式化文本只在这里算一次。** 渲染器另算一遍必然与内核漂移，读者就会看到"正文写 +300、图上画 +299.99"。

两种输入形态走同一套体检：

| 入口 | 形状 | 用途 |
|---|---|---|
| 原始记录 | `{records: [...], config: {...}}` | 从明细推导。`metric`/`unit`/`source` 缺一即阻断；`period_previous`/`period_current` 只在 period 模式强制，`additive` 只对 period 的非 rate 指标强制——bridge 不谈基期本期，也不参与可加总判定 |
| 已算好的节点 | `{items: [{label, type, value}], config}` | 作者手里只有结论数字时的体检与格式化；`metric_type` 未声明时默认 `number`（生效值回显在 `chart.metric_type`，作者看得见被假定了什么） |

`items` 的 `total` 会被翻译成 `start`（第一个）或 `end`（最后一个）；**出现中间的 `total` 直接抛错**——它不是起点也不是终点，内核不替作者猜，请改写为 `subtotal` 或 `start`/`end`。

模式由 `config.mode` 决定，`auto` 时按映射推断：

| 模式 | 语义 | 触发 |
|---|---|---|
| `period` | 两期分类对比 | 默认 |
| `bridge` | 起点与有序增减 | 映射中有 `type` 与 `value` |

`rate` 不是独立模式，是 `metric_type: 'rate'` 的 `period`。

## 三、公式

**period（number / currency）**

```
start = Σ previous_i        end = Σ current_i        net = end − start
delta_i = current_i − previous_i
growth = net / start                （start ≤ 0 时不给增长率，只报绝对变化）
net_share_i      = delta_i / net     （|net| ≤ tolerance 时输出 —）
absolute_share_i = |delta_i| / Σ|delta_j|
```

**period（rate）**——比例不能跨分类求和，两期**都必须有分母**：

```
R0 = Σ(r_i0 × n_i0) / Σ n_i0        R1 = Σ(r_i1 × n_i1) / Σ n_i1
delta_i = r_i1×n_i1/Σn_i1 − r_i0×n_i0/Σn_i0       单位是百分点（pp）
```

这是**加权贡献之差**，组内率变化与结构权重变化都在里面，因此内核固定附一条警告：不声称是因果效应分解。缺任一期的分母即阻断，让你补数或改用已确认的整桥。

**bridge**——有序节点，`running` 逐个累计：

```
start      : running = value
delta      : running ← running + value
subtotal   : 锚定零基线，值 = running（不重复累计）；写了值就与 running 对账
end        : 与 running 对账，不闭合即阻断
```

没有 `end` 节点时，用"起点 + 全部增减"补一个计算终点，并在 `derived` 里记明。逐行容差允许单项小偏差，但**整体仍须闭合**：`net` 与 `Σ delta` 的差超过 tolerance 一样阻断——容差不是平账工具。

## 四、红线（1–6、9 由内核强制，不可配置关闭；7–8 由渲染器强制，见各条注）

1. **缺失 ≠ 0**。`''` `--` `—` `null` `none` `nan` `n/a` `待补` `未知` 解析为缺失。某个分类基期/本期/增量三项里少于两项有值即阻断，不按零代入。
2. **不自动平账**。超容差报 `not_reconciled`，差额原文写进消息（`不自动平账`），不取整、不塞进最后一根柱子掩盖。
3. **残差只在你承认它存在时才画**：`residual: 'explicit'`（仅 bridge）、只在 `end` 节点、且此前无任何其它问题时，才产出一个独立的"未解释差额"节点并附警告。**永不自动配平。**
4. **汇总行与重复类别阻断**。`总计/合计/小计/total/subtotal` 出现在 period 数据里即报 `summary_row`；重复分类报 `duplicate_category`——擅自求和会重复计数。
5. **零绝不印成零**。选定精度下非零但四舍五入为零的值印 `<0.005` 这类形式，不替读者做减法。占比分母趋零时输出 `—`，不是 `0`。
6. **不推断**。指标类型、单位、期间、可加总、数据来源不根据数值大小或列名猜；未声明即阻断或警告。缺截止日不自动填今天。
7. **不画破轴**（渲染器强制）。起点 + 增量 = 终点必须肉眼可核对；破轴的桥接图无法核对，属禁用。
   `precision.waterfall` 收到 `axisBreaks` 直接抛错。**这是唯一一处有意的行为变更**：破轴的瀑布以前画得出来，
   本轮起画不出来——它本来就核对不了，属纠正性修复，不是新增限制。
8. **节点 ≤ 18**（渲染器强制，不是内核强制）。上限比的是 `chart.bars.length`，而 bars 里必然含起点与终点，
   所以**实际可用贡献项是 16 个**（有残差柱时 15 个，每个小计再占一格）。超出请归并贡献项，**绝不静默截断**：
   两个渲染器都直接抛错，CLI 退 2。内核本身不设这个上限，`diagnose` 对 20 个节点照样返回 `ready`。
9. **不声称因果**。描述性分解在文案里也不能写成归因。

## 五、config 字段

`config` 出现未列出的键会报 `unsupported_config`——**不能静默忽略**。

| 键 | 取值 | 说明 |
|---|---|---|
| `mode` | `auto` / `period` / `bridge` | 默认 `auto` |
| `mapping` | 角色 → 列名 | 角色见下 |
| `metric_type` | `number` / `currency` / `rate` | 必填（`items` 入口默认 `number`） |
| `metric` / `unit` | 文本 | 指标名与统一单位 |
| `rate_scale` | `fraction` / `percent` | 仅 rate；percent 输入时容差同量纲缩到 1/100 |
| `additive` | `true` | period 非 rate 需显式确认分类互斥、范围完整、可加总 |
| `source` / `supplement_source` | 文本 | 数据来源；补齐来源用于把缺口请求转给 agent |
| `period_previous` / `period_current` | 文本 | 两期名称，也是首尾柱的标签 |
| `as_of` | 文本 | 截止日 |
| `order` | `input` / `absolute_desc` | 仅 period 可排序；bridge 拒绝重排 |
| `residual` | `block` / `explicit` | period 只接受 `block` |
| `tolerance` | 数字，`0 < t ≤ 0.01` | **以原始输入单位表达**，默认 `1e-6` |
| `endpoint_style` | `solid` / `stacked` | stacked 仅限非负可加总的 period |
| `decimals` | `0–4` 整数 | 覆盖自动精度 |
| `display_divisor` | 正数 | 如按"万元"展示时填 `10000`；rate 仅支持 `1` |
| `end_label` / `title` / `subtitle` / `filters` | 文本 | — |

映射角色：`label`（必需）、`previous`、`current`、`delta`、`type`、`value`、`previous_denominator`、`current_denominator`。每个角色都有中英文别名（`维度`/`分类`/`同比差值`/`上期分母` 等），命中唯一列时自动映射；多列命中报 `ambiguous_mapping` 要求你明确，一列兼两角色报 `duplicate_mapping`。

tolerance 用**原始单位**是个刻意的选择：`0.01` 在"万元"表里是 100 元，在"元"表里是 1 分。容差写在工作量纲上，读者才有办法核对它是否合理。

## 六、输出

```js
{ status: 'ready' | 'blocked', mode, metric_type, mapping,
  issues: [{code, message, fields, owner}], derived: [串], warnings: [串],
  requests: [{owner, code, need: [串], source, constraints}],
  chart: { ... } | null }
```

`blocked` 时 `chart` 为 `null`——**没有图可画**，把 `requests` 变成追问话术，不要带着缺口出图。

`chart`：`mode` `metric_type` `metric` `unit` `source` `as_of` `title` `subtitle` `start` `end` `net` `growth` `reconciliation` `residual` `tolerance` `bars` `details` `config` `display_divisor`（`present()` 另追加 `netText` `growthText` 等预格式化文本）。

- **`bars[]`**：`{label, type, value, from, to}`，`type ∈ start | delta | subtotal | end | residual`。`from`/`to` 是几何起止（`start`/`subtotal`/`end` 锚定零基线，`delta` 浮在累计线上）。
- **`details[]`**：`{label, delta, row, previous, current, growth, net_share, absolute_share}`，rate 模式另带两期分母。
- **审计量是字符串**：`reconciliation`（净变化与逐项之和的差）与 `residual` 保留未取整原文，可审计性来自"没有被取整藏起来"。
- 内部做加、减与闭合判定用的是按指数对齐的精确十进制，**BigInt 绝不外泄**（`JSON.stringify` 遇到它直接 TypeError，而报错点会离瀑布图很远）。几何量一律是 number。

`present()` 追加的文本：`startText` `endText` `netText` `growthText`，逐柱 `valueText`，逐项 `netShareText` `absoluteShareText` `growthText`。**渲染器只贴这些文本，不重新格式化。**

`requests` 把缺口按 `code + owner` 合并，`owner` 区分 `user`（要你确认口径）、`data`（要补数据）、`agent`（可代查，此时带 `supplement_source`）。这是"先问再做"的落地形式：一次给出可执行的补数清单，而不是为每个空格子单独发问。

## 七、展示语法

| 场景 | 输出 |
|---|---|
| 净变化 | `+300` / `−20`，画在预留带上；增长率另起一段，用 ` / ` 分隔（实际串是 `净变化 +50 / +25.0%`）。bridge 模式没有增长率，只有净变化。**恰好为零的净变化不带正号**（印 `0`） |
| 比例 | 占比带符号：`+35.3%`（net share 与 absolute share 都带）；变化量 `+2.2 pp`（**不是 %**） |
| 缺失 | `—` |
| 精度下非零 | `<0.005`，绝不印成 `0` |
| 残差节点 | 独立类型，用主题的 `residual` 令牌，可辨于普通增减 |
| 负增量标签 | 落到浮条下方，不压住柱子 |
| 中文标签 | `labelLines(text, limit)` 按 CJK ≈1em、拉丁 ≈0.55em 折算折行，按字符数折会截断 |

## 八、完整示例

原始记录入口（bridge，含小计，跨零）：

```json
{
  "records": [
    {"label": "营业收入", "type": "start", "value": 1000},
    {"label": "营业成本", "type": "delta", "value": -580},
    {"label": "毛利", "type": "subtotal", "value": 420},
    {"label": "销售管理费用", "type": "delta", "value": -260},
    {"label": "研发费用", "type": "delta", "value": -220},
    {"label": "营业利润", "type": "subtotal", "value": -60},
    {"label": "其他收益", "type": "delta", "value": 100},
    {"label": "税前利润", "type": "end", "value": 40}
  ],
  "config": {
    "mode": "bridge", "metric": "损益", "metric_type": "currency", "unit": "万元",
    "source": "管理层报表 2025H1", "as_of": "2025-06-30", "tolerance": 0.01
  }
}
```

得到 `start 1000 → end 40`、`net −960`、四个贡献项、两个锚定零基线的小计（毛利 420、营业利润 −60）、`reconciliation '0'`。列名可换中文——`分类`/`维度`/`同比差值`/`上期分母` 等别名会自动映射。

把最后一行的 `40` 改成 `41`，立刻得到 `not_reconciled`，消息里写着差额 `1`，且 `chart` 为 `null`——**它不会替你把 1 藏进任何一根柱子。**

已算好的节点入口：

```json
{"items": [
  {"label": "期初", "type": "total", "value": 1200},
  {"label": "存量客户", "type": "delta", "value": 210},
  {"label": "新签", "type": "delta", "value": 160},
  {"label": "流失", "type": "delta", "value": -90},
  {"label": "期末", "type": "total", "value": 1480}
], "config": {"metric_type": "number", "unit": "家", "tolerance": 0.01}}
```

## 九、与 aeolus-period-waterfall 的关系

本内核的判据来自 `aeolus-period-waterfall` 的 `diagnose()` 决策逻辑（Python），**是端口而非依赖**：本仓库不引入 Python、不读取该目录、不在数据路径上耦合任何本地路径。三模式、加权费率与百分点贡献、容差用原始单位、"缺失≠0 / 不自动平账 / 残差不自动配平"、缺口清单按责任方分组，都来自那里。

刻意的分歧：

| 项 | 本仓库 | 原因 |
|---|---|---|
| 数值层 | 按指数对齐的精确十进制 | aeolus 用 `Decimal`；本仓库要求同一套数学只有一份权威。**加减与闭合判定不经过浮点**；rate 模式的加权量本身是除法结果（`Σr·n / Σn`），那一步只能用浮点——噪声在 1e-17 量级，默认容差 1e-6 下不会误伤，这也正是容差不接受 0 的原因之一 |
| 颜色 | 只采用 aeolus 的**色彩语义**（方向编码 + 残差独立可辨），**不采用其十六进制值** | 主题令牌与灰度/打印可读性是本仓库红线 |
| `items` 入口 | 新增，`metric_type` 默认 `number` | 作者已有结论数字时的体检入口 |

**与 aeolus 冲突时以本文件为准**：本仓库的渲染器、门禁与验收都读这份合同。两边同一处数学出现分歧时，改 aeolus 的端口，不改这里的规则。

## 十、当前入口

```bash
node -e "
const W=require('./assets/waterfall-bridge.js');
const r=W.diagnose(require('./spec.json'));
W.present(r);
console.log(JSON.stringify(r,null,2));
"
```

自检：`node scripts/test_waterfall_bridge.cjs`（含三个标准 fixture 的黄金几何，已与 aeolus 原实现逐字段比对一致）。它已挂在 `npm test` 链上。

### 命令行（瀑布专用体检与出图入口）

`kit.waterfall` 没有别的 CLI——瀑布是最需要"先体检、后出图"的形式，所以它的入口直接叫合同：

```bash
node scripts/waterfall_contract.cjs diagnose spec.json          # 只体检，不出图
node scripts/waterfall_contract.cjs render   spec.json out.svg  # 体检通过才写文件
```

`spec.json` 就是内核的输入加渲染参数：

```json
{
  "renderer": "kit", "width": 940, "height": 460, "title": "税前利润桥",
  "records": [{"label": "期初", "type": "start", "value": 1000},
              {"label": "流失", "type": "delta", "value": -580},
              {"label": "期末", "type": "end", "value": 421}],
  "config": {"mode": "bridge", "metric": "税前利润", "metric_type": "currency", "unit": "万元",
             "source": "合并报表", "residual": "explicit"}
}
```

退出码是这台工具的主要回话方式：

| 退出码 | 含义 | 会不会写文件 |
|---|---|---|
| 0 | 通过 | `render` 写出 SVG，stdout 回一行 `{written, mode, nodes, reconciliation, residual, tolerance}` |
| 1 | 用法错误／目标文件已存在 | **不写**。已有输出一概拒绝覆盖，要重出就自己先删 |
| 2 | **图没能出来**：体检未通过（不闭合、缺分母、重复类别……），或体检通过但渲染器拒绝（节点超 18、破轴、节点类型未知） | **不写**。原因原样打到 stderr |

`metric`、`unit`、`source` 是溯源三件套，**bridge 也必须写**，缺一即 `blocked`——示例里省掉它们只会得到一个 2 号退出码。

`renderer` 取 `kit`（默认）或 `precision`；取 `precision` 时 `spec` 还接受 `theme` / `typography_id` 等 `render_precision_exhibit.cjs` 的既有参数。带残差通过体检时，stderr 会多一句提醒：在蓝图的 `slide.waterfall.residualReason` 写明残差依据并重新编译——否则作者要到校验那一步才发现。

自检：`node scripts/test_waterfall_contract.cjs`（已挂在 `npm test` 链上）。

### 渲染侧接入（已实现）

两个渲染器都接受一个 **opt-in 开关 `spec.waterfall`，值就是内核报告本身**：

```js
const W=require('./assets/waterfall-bridge.js');
const report=W.present(W.diagnose({records:rows,config:cfg}));   // status === 'ready' 才继续
const svg=require('./assets/exhibit-kit.js').waterfall({palette,typography_id:'serif-report-bold',
  width:940,height:460,title:'税前利润桥',waterfall:report});      // 不写 items
```

开关打开时，**几何（`bars[].from/to/value`）与文本（`valueText`）都来自内核**，渲染器不重算、不重排、不二次判闭合——同一笔账只有一个裁决者（现状里内核用 1e-6 绝对容差、渲染器用 1e-9 相对容差，两套判据会给出两个结论）。

| 行为 | `kit.waterfall` | `precision.waterfall` |
|---|---|---|
| 未声明 `waterfall` | 走原有快速路径，输出逐字节不变 | 同左 |
| 同时声明 `items` | 抛错：`不要同时声明 items 与 waterfall：几何与文本都来自内核，重复声明必然漂移` | 同左 |
| `status !== 'ready'` | 抛错：`瀑布数据未通过体检，不能出图：<issue 代码>` | 同左 |
| 节点 > 18 | 抛错：`瀑布节点 N 个，超过 18：请归并驱动项，不静默截断` | 同左（`spec.axisBreaks` 另有硬拒，见 §四） |
| 零轴线 | `data-role="reconciliation" data-residual data-tolerance data-nodes` | 同左，另带 `data-axis-value="0"` |
| 方向 | 增量与残差柱自带 `+`／`−` 符号；负值标签落到柱下沿之下 | 增量与残差柱自带符号；负值标签落到柱下沿之下 |
| 净变化括线 | 有：`净变化 <netText><growthText>` 画在预留带上（与 `comparison` 括线同带，两者都要时抛错，须显式二选一） | 由 `comparison` 承担，不额外画 |
| 残差节点 | 用主题的 `residual` 色（**不是** `caution`／`warn`：三个预设的 caution 都太接近 `delta-negative`，用它们等于让"说不清的差额"和"下降"长成同一个颜色） | 同左 |

**对账结论不做成可见文字**，只挂在已有的零轴线上做属性：`−0.0000004` 这种串既超宽又没人要读，而 `page_probe` 会把 `<text>` 收进 `labels`／`tinyText`。可读的对账由 §七 的预格式化文本与图注承担。`data-nodes` 是唯一为"可核对"而加的属性：`pages.json` 里写了 `nodes`，成稿上就得有个能核对的现场，否则那个数字没人验得了。

## 十一、逐页声明与门禁

### 编译后的对账声明

在蓝图的 `slide.waterfall.input` 提供输入，编译器生成下列页面声明，不手填对账数或直接改 pages。字段表用于理解编译结果。

```json
{ "page": 7, "form": "kit.waterfall", "...": "…",
  "waterfall": {"status": "verified", "reconciliation": "0", "tolerance": "0.000001",
                "nodes": 8, "residual": null} }
```

| 字段 | 规矩 |
|---|---|
| `status` | 只有 `verified` 与 `not_applicable` 两个值 |
| `reconciliation` / `tolerance` / `residual` | **原样字符串**，从内核 `chart.*` 抄，不许自己算、不许取整 |
| `nodes` | 正整数，≤ 18，等于内核 `chart.bars.length` |
| `residualReason` | **残差非 0 时必填**，≥ 12 字。`residual` 写 `null` 或整个键省略表示"这一页没有差额"；写 `"0"` 等同于没有差额，**不会**因此豁免 `reconciliation` 与 `tolerance` 的量级比较 |
| `residual` 的实际取值 | 只能是内核 `chart.residual` 的**原样字符串**（未取整，可能是负号开头）或 `null`。空串 `""` 会被拒绝：`Number("")` 不是数，门禁无法判断你到底想说什么 |

资金流向示意应声明实际 `flow` 语义；真正的瀑布语义不能以 `not_applicable` 豁免。

### 判据

- **瀑布必须对账。** 瀑布形式或 `semanticType:waterfall` 必须从权威输入派生 verified 对账，不能通过省略声明跳过检查。
- **声明了就必须自洽。** `check_pages.cjs` 只做结构校验：三个数是不是数、`nodes` 在不在范围内、超容差时有没有承认残差并写够理由。
- **成稿与声明两处逐字对账。** `qa_deck.cjs` 拿 `page_probe.cjs` 在现场量到的 `data-residual`／`data-tolerance`／`data-nodes`，与声明逐字比。同一件事存在两处，逐字相同才认（同 `proves`／`form`／`layout`／`density` 那一组）。
- **分派依据是零轴线上的 `data-role="reconciliation"`**，加上页面自己的 `data-form` 是不是"必须能对账的形式"。这份清单不在探针里硬编码，而是从 `assets/deck-forms.js` 的 `limits.reconciles` 派生——加第三个瀑布形式时，探针和形式目录不会各说各话。**不能按 `data-from`／`data-to` 分派**——precision 的柱图与堆积图同样会发这两个属性，那样等于把不是瀑布的图也当瀑布判。

### 探针给出的三条结论

| 代码 | 档位 | 什么时候出现 |
|---|---|---|
| `WF-NOT-RECONCILED` | 探针提示，须结合合同检查 | 图上缺少内核对账零轴。核查声明与实际SVG；完整验收还会检查权威输入、verified状态及现场对账标记，不能把单条提示当作通过 |
| `WF-MULTIPLE-AUDIT` | 阻塞 | 一页上有两条以上对账零轴：一次体检只能有一个结论，声明也只能写一个 |
| `WF-RESIDUAL` | 提醒 | 图上有非 0 差额：不是错，但这一页必须写 `residualReason`，且要目视确认差额是独立节点、不是被并进最后一根柱子 |

判据落在 `page_probe.cjs` 里而不是只落在 `qa_deck.cjs`，所以 `preview_page.cjs` 单页自查与整册验收看到的是同一套结论，不会有两份实现漂移。

自检：`node scripts/test_waterfall_contract.cjs`。

## 十二、旁注候选

`scripts/propose_annotations.cjs` 从展品规格直接提旁注候选。**瀑布这一支不跑通用的"同组排名"规则**——瀑布的柱子是贡献项，把 −580 和 +100 放进同一张榜排"最高/最低"，会让读者把一笔拖累读成一次排名；小计柱还会跟起止柱互比，而那几根柱根本不在同一段账上。

改成从内核的 `chart.details` 里取驱动项：候选只取 |delta| 最大的那一项，措辞按那一根柱子自己的符号给「最大拖累」或「最大拉动」。**名次是本脚本排的，不是内核给的**——内核的 `details` 是输入顺序（period 默认 `order: 'input'`，bridge 直接拒绝重排）；内核给的是 `absolute_share`，候选把那个数原样带进 `derived` 作为依据。

缺内核报告的瀑布（老 `items` 路径）**一条候选都不提**，并说明为什么：没有内核报告，这些柱子就只是一串作者自算的数，谁大谁小无从核对，宁可不说。

```bash
node scripts/propose_annotations.cjs spec.json          # 人读
node scripts/propose_annotations.cjs spec.json --json   # 机器读
```

自检：`node scripts/test_propose_annotations.cjs`。

仍然成立的边界：**没声明 `waterfall` 的图，数字与对账由作者负责，本内核的体检结论只对走了它的路径生效。**
