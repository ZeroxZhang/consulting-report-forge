# 从同一内容真源制作页面

新稿使用 `schemaVersion: 2` 蓝图：正文主张、来源、派生数值和页面关系只在蓝图维护，`pages.json` 由编译器生成。图形仍由作者构思，内容绑定不会自动产生一份完整报告，也不证明来源真实或推理成立。

## 来源与指标

蓝图顶层 `sources` 是来源索引，键映射到 `{label, locator}`。每页 `sourcePlan.keys` 和每条 `claims[].sourceKeys` 引用这些键；`locator` 写实际可复查的文件/行号或来源网址及定位。每页正文必须有关键主张，原有 `kind`、期间、分母、推论及限制字段继续使用，见[证据身份](evidence-ledger.md)。

每条主张可加 `metrics`。同页指标 id 唯一，引用可跨本页不同主张，不能跨页；只在一处给数，图、标签和注释复用计算结果。

```json
{"sources":{"S1":{"label":"合成销售输入","locator":"inputs/synthetic.csv:L2-L3"}}}
```

下面是某条主张的 `metrics` 示例，全部是合成数据；省略的主张字段仍须按蓝图填写：

```json
{"metrics":[
  {"id":"base","unit":"万元","decimals":0,"value":100},
  {"id":"current","unit":"万元","decimals":0,"value":120},
  {"id":"growth","unit":"%","decimals":1,
   "formula":{"op":"percent_change","args":["current","base"]}}
]}
```

`value` 与 `formula` 必须二选一；`value` 只能是有限数字，`decimals` 为0–6。计算保留未舍入值，显示时才按位数格式化，使用十进制半入（halfExpand，中点远离零）并消除显示负零；例如 0.725 显示为 0.73、2.175 显示为 2.18。指标继承所属主张的身份：预测、估计、假设或建议会出现在 `text` 的数值后（例如 `132 万元（预测）`），图中标签不能省去。运算仅支持：

| op | 参数与结果 |
|---|---|
| `sum` / `multiply` | 一个或多个指标的和／积 |
| `subtract` / `divide` | 两个指标，前项减／除以后项 |
| `percent_change` | `[本期, 基期]`，结果为 `(本期/基期−1)×100`；基期须为正 |
| `share` | `[部分, 总量]`，结果为 `部分/总量×100` |

循环、缺引用、零除、非有限结果或任意代码都被拒绝。不自动换算单位，也不证明不同分母可以比较。图形需用数值时读取编译后 `page.content.metrics` 中的 `value`；可见标签使用对应 `text`，不要另算一份。

身份沿公式依赖传递：`fact` 不能引用任何非事实指标；`estimate` 不能引用预测、假设或建议。其他输出身份仍由作者明确选择，编译器保留不同的上游身份，例如 `132 万元（预测；含假设输入）`，不自动把主张升级为事实。`provided`、`source_checked` 等核验状态也不会改变证据身份。

在标题、`proves` 和主张文本字段（如 `statement/denominator/calculation/inference/limitation`）复用关键数字时，必须引用 `{{metric:id}}`，不要重复手填。例如 `"title":"收入增长{{metric:growth}}，利润变化仍待核对"` 会编译成 `收入增长20.0%，利润变化仍待核对`。数字、单位和身份使用同一份 `metric.text`；改基数后标题、主张及图中标签一同更新。未知或不完整 token 被拒绝，不支持任意表达式。代码不会猜测自然语言里的数字，未使用 token 的手写文字仍需作者和独立审查核对。需要比较原蓝图文字与编译结果时，用 `resolveText(slide, text)` 解析，勿把带 token 的原文与成稿直接比较。

瀑布在 `slide.waterfall.input` 保存唯一输入 `{items或records, config, options?}`，编译时调用现有内核体检并派生对账结果；作者只可另给有依据的 `residualReason`，不能手填零残差或节点数。渲染同样使用这一输入的内核报告。输入也计入内容摘要，改变桥接数据会使旧审查失效。具体数据前提见[瀑布合同](waterfall-bridge.md)。

## 编译并填充叶节点

```sh
node scripts/compile_blueprint.cjs /任务/deck-blueprint.json /任务/pages.json --snippets /任务/content-snippets.html
```

先通过蓝图 `ready` 校验，再生成 `pages.version: 4`。编译器拒绝覆盖输入蓝图；再次运行可替换此前生成的 pages。snippets只写新文件或带编译器生成标头的旧文件，不覆盖作者片段；它只是可放入页面的绑定示例，不能当成已完成页面。

目录布局的槽位和角色由目录派生：主区用 `visual.form`；支持区只有在允许文字时才默认 `html.text`。其他模块在 `visual.regions` 按目录顺序明确形式，不手填网格坐标。自定义布局写 `visual.layout: "custom"` 及自己的 `visual.regions`。自定义SVG另写 `visual.semanticType`：`comparison/trend/composition/flow/waterfall/scenario/table/qualitative`，使数据语义不因换实现而丢失。

正文容器声明 `data-page-id`，值与蓝图 slide.id一致。标题使用 `.slide__title` 和 `data-content-key="title"`。把绑定放在**不含子元素的叶节点**；不要在包裹图表或整页的容器上绑定，以免填充文字时清掉展品。关键文字不得处于 clip/clip-path/mask 裁切层或使用透明文字；图形需要裁切时，把关键标签放在未裁切的文字层。

```html
<section class="slide" data-page-id="revenue" data-frame-boundary="line">
  <header class="slide__header"><h1 class="slide__title" data-content-key="title"></h1></header>
  <!-- 正文放入实际布局与展品，以下只示范叶节点。 -->
  <span data-content-key="claim:revenue-change"></span>
  <span data-content-key="metric:growth"></span>
  <p data-content-key="limitation:revenue-change"></p>
  <span data-content-key="source:S1"></span>
</section>
```

装配器按正文 id核对页面，并补缺少的 `data-form/data-visual/data-proves/data-density-profile/data-layout/data-semantic-type/data-content-hash/data-page-plan-hash`；显式声明与编译结果冲突时拒绝。内容摘要追踪内容变化，页面计划摘要同时追踪区域、密度等制作意图变化，避免看似相同的页面沿用已失效的审查。更改内容先改蓝图再编译，不在最终HTML里改掉预测身份、数字或限定。

`content_contract.bindings(page)` 返回所有应显示的键及标准文本：

- `title`：本页标题；`claim:<id>`：主张，预测／估计／假设／建议自动带中文身份。
- `limitation:<id>`：期间、对象、单位、分母与限制合并显示；把有共同职责的限定放一起，不为每个字段造一块小字。
- `metric:<id>`：计算后的显示文本；`source:<key>`：来源标签与定位。

每个键至少有一次真实可见、文本一致的绑定，可在多个位置复用；多次出现的每个实例都须一致且可见。多条来源可以同放一个叶节点，将 `data-content-key` 写成JSON数组，标准文本按数组顺序用“；”连接。可用helper避免转义错误：

```js
const content = require('/实际技能目录/scripts/content_contract.cjs');
content.html(page, 'title', {tag: 'h1', className: 'slide__title'});
content.html(page, ['source:S1', 'source:S2']);
```

浏览器取实际 `{key, text, visible}` 后由 `verifyBindings(page, facts)`核对；`key`既可为单键，也可为JSON数组字符串。未知键、遗漏、隐藏或偏离文本都会报错。完整 `verify({title, bindings}, page)`还核对实际 `.slide__title`。hash绑定只确认内容归属，不替代看图、计算前提与独立论证审查。
