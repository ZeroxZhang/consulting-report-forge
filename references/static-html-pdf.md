# 静态 HTML/PDF 路线

仅在用户需要离线、浏览器可打开的研究型报告或静态网页翻阅稿时使用本路线。

## 安装与环境探测

在实际技能根目录运行。首次使用、升级依赖或浏览器环境变化时执行探测；探测输出的挑战图必须实际打开查看，再以 `--verify` 记录结论。构建需要 Node 20+（当前锁定的 Playwright/PDF.js 依赖要求）、Chrome、Playwright、Poppler、Python/fontTools 和随包字体资源。

```sh
npm ci
npm run setup-fonts
node scripts/probe_capabilities.cjs /tmp/report-forge-probe
# 查看探测输出的 PNG 后：
node scripts/probe_capabilities.cjs /tmp/report-forge-probe --verify /tmp/report-forge-probe/response.json
```

`response.json` 由查看 `vision-challenge.png` 的审查者填写，结构为 `{"code":"替换为图中六字符","shape_left_to_right":["实际颜色 形状","实际颜色 形状","实际颜色 形状"]}`。填写实际读图结果，不能照抄示例或读取答案文件。返回 `status: ready` 才表示环境与读图验证完成；缺少答案路径会立即报错，不会重新生成挑战。

测试产物集中在任务目录并按用户要求忽略；优先直接调用主技能脚本。确需隔离副本时，入口文件改名为 `SKILL.snapshot.md`，不要留下嵌套 `SKILL.md`：Git忽略规则不会阻止技能扫描器发现它。

`setup-fonts` 不假定系统 `python3` 够用。它按 `FONT_PYTHON` > `python3.13/3.12/3.11/3.10/python3/python` 的顺序挑第一个满足下限的解释器（当前 ≥3.10，来自 `scripts/requirements-fonts.txt` 里 zopfli 的版本 pin）；已有 venv 的解释器够用就复用，版本不足就重建。`FONT_PYTHON` 与 `pack_fonts.cjs`、`probe_capabilities.cjs` 是同一个覆盖口，指一次即可，后续构建沿用同一个解释器。

挑不到时它退出非 0，并列出机器上找到的每个解释器及版本、标出哪个版本不足。这时**不要改脚本去适配本机**——按输出里的两条路自己判断：优先 `FONT_PYTHON=/已有的/解释器 npm run setup-fonts`；确实没有 ≥3.10 的解释器，就先装一个（uv / pyenv / 系统包管理器）再重跑。这一步只影响构建期的字体子集嵌入，不阻断已生成的成稿与交付。

默认调用本地 Chrome。若环境没有 Chrome，可安装 Playwright Chromium，并在所有启动浏览器的命令前设置 `CHROME_CHANNEL=chromium`：

```sh
npx playwright install chromium
CHROME_CHANNEL=chromium node scripts/probe_capabilities.cjs /tmp/report-forge-probe
```

如果无法查看实际 PNG 或最终 PDF，继续制作时将视觉审查状态明确写为未验收，不要用自动 PASS 替代。

## 最小任务合同

先在任务目录创建并校验 `deck-blueprint.json`，再创建与正文页一致的 `task.json` 和 `pages.json`。blueprint 是叙事、标题、主展品、密度和来源计划的唯一设计源；`pages.json` 是静态装配所需的正文页机器合同。分别从 [deck blueprint 模板](../templates/deck-blueprint.json)、[任务模板](../templates/task.json) 与 [页面模板](../templates/pages.json) 开始；不要把模板原样用于实际报告。

```sh
node scripts/deck_blueprint.cjs /任务/deck-blueprint.json --ready
```

蓝图中每一张 `analysis`、`decision`、`action`、`risk` 或 `appendix` 页，必须在 `pages.json` 中有且仅有一个同序的正文页。将 `proves`、主视觉形式和密度配置同步到静态页面合同；封面、章节页、参考资料与封底由报告书册结构管理，不计入该一对一正文映射。

创建 `pages.json` 后、编写 HTML 前运行：

```sh
node scripts/verify_blueprint_pages.cjs /任务/deck-blueprint.json /任务/pages.json
```

该检查拒绝在制作阶段悄然改变页面证明任务、主表达或密度配置；如果结论改变，应先修改 blueprint 并重新做叙事审查。

```json
{
  "version": 1,
  "workMode": "analytical",
  "complexity": "complex",
  "majorConclusion": true,
  "mode": "reading",
  "theme": "mckinsey",
  "typography": "serif-report-bold",
  "ratio": "16x9",
  "kind": "report",
  "pages": {"record": "pages.json"},
  "critical": [
    {"id": "scope_2026", "text": "仅覆盖中国大陆市场，期间为 2024–2026 年。"}
  ]
}
```

| 字段 | 取值与规则 |
|---|---|
| `workMode` | `editorial`（重组已确认文稿）、`analytical`（新计算/新推理）、`exploratory`（开放研究）。 |
| `complexity` | `simple` 或 `complex`；未判断时使用 `complex`。出现新计算、方法选择或新结论即为 `complex`。 |
| `majorConclusion` | 重大投资、经营、战略或风险建议设为 `true`。`complex` 或 `true` 均要求独立复核。 |
| `mode` | 深度阅读用 `reading`，现场讲述用 `presentation`。 |
| `theme` | `mckinsey`、`bcg`、`accenture`。 |
| `kind` | `report`（封面、正文、参考资料、封底）、`fragment` 或 `collection`。它不降低风险复核要求。 |
| `critical` | 只登记改变判断的期间、分母、状态、否定条件、关键数字或反证；在 HTML 中用 `data-critical-id` 标到相关对象。 |

`pages.json` 的每个正文页必须按从 1 开始的连续顺序声明 `page`、`proves` 与 `form`。手写或原生 SVG 使用 `form: "svg.custom"` 并加 `visual`；多展品页的 `regions` 必须有且仅有一个 `role: "primary"`，且它与页面 `form` 一致。正文 `<section>` 用相同的 `data-form`；`visual` 存在时同时使用相同 `data-visual`；如果另外写了 `data-proves`，它必须与 `pages.json` 的 `proves` **逐字相同**（不写不报错，但同一句话存在两处，改一处就要同步另一处）。

### 内容密度与留白合同（新稿使用 `pages.version: 2`）

不要以字数、卡片数或填满背景来衡量密度。对每一正文页新增 `density`，先回答“页面需要多少个**不同职责的证据单元**，以及空出来的地方为什么必须空”。装配时，`density.profile` 必须同步写到正文 `<section data-density-profile="…">`；漏写或与 `pages.json` 不一致会阻断装配。

| profile | 使用情形 | 最低结构 | 留白规则 |
|---|---|---|---|
| `dense` | 需要同时比较、解释、限定并导出行动的分析页 | `primary` + 至少两个不同辅助角色，且必须有 `implication` | 只能作为紧凑分组、比较间隙或来源安全区；正文出现大空洞会阻断验收。 |
| `balanced` | 默认的研究、机制、比较或决策页 | `primary` + 至少一个 `support` / `context` / `implication` | 主展品与支持证据必须形成完整阅读路径；正文大空洞会阻断验收。 |
| `sparse` | 确有必要的章节过渡、单个关键判断或读者停顿页 | 一个主证据单元 | 必须写 `sparseReason`，说明为何减少信息比增加证据更有助判断；不能把普通正文页伪装成极简页。 |

```json
{
  "version": 2,
  "pages": [{
    "page": 3,
    "proves": "价格战扩大了量，却压缩了单客毛利。",
    "form": "kit.dumbbell",
    "density": {
      "profile": "dense",
      "evidenceUnits": [
        {"role": "primary", "purpose": "显示各区域价格与毛利的同口径前后差异。"},
        {"role": "context", "purpose": "给出促销强度和样本覆盖，以限定差异解释。"},
        {"role": "implication", "purpose": "把差异转化为停止补贴或重设门槛的判断。"}
      ],
      "spaceIntent": "左侧主图占据主体阅读区；右下角仅保留行动判断及来源安全区，不留无解释的大块空白。"
    }
  }]
}
```

每个 `purpose` 必须是不同的证据职责，而不是“补一段描述”“放三个数字”。优先补入与标题直接相关的比较对象、分母、反例、机制条件、时间维度、敏感性或行动含义；**禁止**为追求饱满添加重复结论、无关图标、拉高表格行或空框。

### 布局绑定合同（新稿使用 `pages.version: 3`）

`version: 3` 在 v2 之上加了**布局绑定**：页面结构不再由作者临场决定，而是引用布局目录里的一条骨架。**先约束，后填充**——选完布局，每一格能装什么、装得下几行就已经定死；作者的自由落在“每一格放哪种表达”。

选布局用 [布局图谱](../assets/layout-atlas.html)，数据源是 `assets/layout-atlas/catalog.json`（唯一权威）。

每页新增三个字段：

| 字段 | 规则 |
|---|---|
| `layout` | 布局编号，形如 `L09`。必须在目录里存在。确实没有合适骨架时写 `layoutExemptReason`（≥12 字）。 |
| `regions` | **按序**对应布局的每一格，一项不多一项不少。每项写 `form`，手绘 SVG 另写 `visual`。 |
| `layoutReason` | 同一布局第 3 次使用时必填，说明为什么这里还是它。 |

`regions` 里**不要写 `c/r/w/h`**：几何由 `layout` 决定，写了会与目录漂移，校验直接拒绝。`slot` 与 `role` 可以写，但必须与目录一致。主展品那一格的 `form` 必须等于页面 `form`。

选型时可运行 `node -e 'console.log(JSON.stringify(require("./scripts/layout_contract.cjs").measure("L10", "16x9"), null, 2))'` 查看逐格可用尺寸及形式排除项。

蓝图 `deck.ratio` 与页面合同顶层 `ratio` 可声明 `16x9`/`4x3`，省略默认16x9；装配和QA按实际任务画幅检查。主展品的 `visual.sizing` 与对应 `regions[].sizing` 必须同步，例如 `{"stages":4,"titled":true,"unit":false}`。`stages` 当前用于 `kit.processFlow`；标题与单位行从槽位内区扣除。未声明sizing只按无标题的最低尺寸检查。L10的16x9主槽位内高296px，小于processFlow最低324px，会在蓝图阶段拒绝；4x3与其他布局按各自几何计算。图谱展示尺寸排除项，未登记最小尺寸的形式仍需按实际内容预览，不能把“未被排除”当成一定放得下。

```json
{
  "version": 3,
  "pages": [{
    "page": 3,
    "proves": "价格战扩大了量，却压缩了单客毛利。",
    "form": "kit.dumbbell",
    "layout": "L01",
    "regions": [
      {"form": "kit.dumbbell"},
      {"form": "html.text"}
    ],
    "density": {"profile": "balanced", "evidenceUnits": ["…"]}
  }]
}
```

整册还有两条布局下限：正文超过 10 页须至少 6 种布局，超过 20 页须至少 10 种；不足时写 `pages.layoutDiversityReason`（≥12 字）。这两个数与"同一布局第 3 次使用须写 `layoutReason`"同源：不写理由时每条布局最多用两次，N 页天然上限是 N/2，下限各留一条复用口子。

## 制作与装配

只编写 `pages.html` 与可选的 `page.css`。每个顶层正文页使用 `<section class="slide reading|presentation">`，并显式给出 `data-frame-boundary="line|integrated|space"`。新稿使用 `pages.version: 2` 时，同步给出与 manifest 一致的 `data-density-profile="dense|balanced|sparse"`。封面或全出血页加 `data-frame="off"` 和 `data-frame-boundary="space"`。

`pages.version: 3` 时还要**把布局落到 DOM 上**：正文 `<section>` 加 `data-layout="L09"`，并按布局逐格给模块元素加 `data-module="<槽位>"`。

```html
<section class="slide reading" data-layout="L01" data-form="kit.dumbbell" data-frame-boundary="line" data-density-profile="balanced">
  <header class="slide__header"><h1 class="slide__title">价格战扩大了量，却压缩了单客毛利</h1></header>
  <div class="slide__body">
    <div class="exhibit" data-module="chart">…</div>
    <div class="annotation" data-module="annotation">…</div>
  </div>
  <div class="source">来源：…</div>
</section>
```

**不要写 `grid-column` / `grid-row`。** 几何由 `.slide.reading[data-layout="…"] .slide__body > :nth-child(n of [data-module])` 一组规则给出，那组规则由 `scripts/build_layout_css.cjs` 从布局目录生成、写在 `assets/consulting-layouts.css` 末尾，`npm test` 会在漂移时报错。作者只负责**按布局目录的格子顺序**给出模块——DOM 顺序就是阅读顺序，顺序错了就是顺序错了，不是风格差异。

装配期核对 `data-layout` / `data-module` 与 `pages.json`；QA 期再逐格量实际矩形，模块没落在 12×6 的格线上会报出偏了几像素（`scripts/check_layout_grid.cjs` 是同一判据的目录级定点核对，改布局 CSS 后跑一次）。

静态装配只接受内联 SVG 与 `data:` 资源。先将 ECharts 渲染为 SVG；禁止 `script`、`canvas`、外部图片/样式/字体、`@import`、事件属性、嵌套 slide 或动态 chart 容器。静态读者不能悬停，所以直接显示关键值和说明。

```sh
node scripts/assemble_deck.cjs /任务/pages.html /任务/deck.html \
  --css /任务/page.css --title "报告标题" --contract /任务/task.json

# 每完成一页即装配到该页并看图
node scripts/assemble_deck.cjs /任务/pages.html /任务/deck.html \
  --css /任务/page.css --title "报告标题" --contract /任务/task.json --upto 3
node scripts/preview_page.cjs /任务/deck.html 3
```

页面图型先由关系决定，而非由现成组件决定。可查询已封装实现与容量，但没有组件时保留表达并使用原生 SVG 或构建期渲染：

```sh
node scripts/sweep_forms.cjs
```

## 验收、审查与打包

`preview_page` 和迭代档只用于制作期，不能代替最终 PDF 验收。整册完成后执行验收档；它生成 PDF、逐页证据清单和 `audit.json`。逐页实际查看 HTML 截图与 PDF 页面，然后编写真实的 `author.json`；不允许脚本预填“通过”。复杂或重大结论需要由未参与制作的一方额外提交 `independent.json`。对 `dense` 和 `balanced` 页面，`V-UNDERFILLED-PAGE` 是阻断错误：先补强真实支持证据、注释或解释，再收紧布局；不能仅以放大主图、拉伸容器或改配色关闭。

```sh
# 制作期：指定页的快速自查
node scripts/qa_deck.cjs /任务/deck.html /任务/renders-iter --tier iteration --pages 3

# 交付前：唯一可打包的验收档
node scripts/qa_deck.cjs /任务/deck.html /任务/renders
node scripts/aggregate_reviews.cjs /任务/renders/audit.json /任务/renders/review.json /任务/renders/author.json
# complex 或 majorConclusion=true 时追加 independent.json
node scripts/aggregate_reviews.cjs /任务/renders/audit.json /任务/renders/review.json /任务/renders/author.json /任务/renders/independent.json
node scripts/package_delivery.cjs /任务/deck.html /任务/renders/deck.pdf /任务/delivery 报告名
```

每份审查都使用 schemaVersion 3，并绑定本次 audit 内的 HTML/PDF 证据 id、产物 SHA-256 与审查范围。最终 `review.status` 为 `complete`，`analysis`、`evidence`、`visual` 均有实际依据；所有 `audit.warnings` 均在 `warningReview` 中以 `accepted` 或 `fixed` 处置；不存在未解决的 `major` 或 `blocking` 问题。只有 `tier: acceptance`、几何 PASS、无 errors、审查完整且打包校验通过，才称正式交付。

未完成审查时仅使用 `package_delivery.cjs --preview`，并明确将结果称为预览。

## 字体制作期缓存与计时

字体缓存按源文件摘要与实际fontTools版本保存完整解码结果和字符子集，写入原子化且读取校验摘要；损坏项自动重建。`FONT_CACHE_DIR`可指定缓存目录，默认使用系统临时目录。每次仍验证原字体摘要、全稿字形及标题/正文字体链覆盖，不会因缓存命中跳过缺字检查。`font_assets.py`返回JSON中的`timing`包含逐字体解码/子集耗时及命中状态，可区分冷启动和新增字符成本。完整解码缓存会占用比压缩字体更多的磁盘；删除缓存只影响下次构建速度，不影响已交付报告。

修改字体处理后，先运行 `npm run setup-fonts`（已有合格环境可跳过），再运行 `.font-venv/bin/python scripts/test_font_cache.py` 验证缓存失效、损坏恢复与缺字门禁。`npm test`覆盖纯合同回归；`npm run test:render`另在真实Chrome检查结构线和装饰反例。
