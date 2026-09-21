# 静态 HTML/PDF 路线

在实际技能根目录执行以下命令。新稿采用 blueprint schemaVersion 2 → 编译 pages version 4 → 静态 HTML → acceptance PDF → 实际审查 → 打包；字段与绑定详见 [内容制作合同](content-authoring.md)。

## 安装与环境

构建需要 Node 20+、Chrome、Playwright、Poppler、Python/fontTools 和随包字体。首次使用、依赖或浏览器环境变化时执行：

```sh
npm ci
npm run setup-fonts
node scripts/probe_capabilities.cjs /任务/probe
```

实际打开 `vision-challenge.png`，把所见写到 `response.json`，然后：

```sh
node scripts/probe_capabilities.cjs /任务/probe --verify /任务/probe/response.json
```

响应结构为 `{"code":"图中六字符","shape_left_to_right":["颜色 形状","颜色 形状","颜色 形状"]}`。不能读取答案文件代替看图。已验证且未变化的环境不重复安装。字体环境按 `FONT_PYTHON` 或可用 Python ≥3.10 建立，不修改系统解释器；没有 Chrome 时安装 Playwright Chromium 并设置 `CHROME_CHANNEL=chromium`。

测试产物放任务目录，避免在副本中保留会被扫描器发现的第二份 `SKILL.md`。无法查看实际图像时如实标为未视觉验收。

## 任务和内容

从 [新蓝图模板](../templates/deck-blueprint-v2.json) 与 [任务模板](../templates/task.json) 开始。改写全部合成示例，不把示例当研究证据。

```json
{
  "version": 1,
  "workMode": "analytical",
  "complexity": "complex",
  "majorConclusion": false,
  "mode": "reading",
  "theme": "mckinsey",
  "typography": "serif-report-bold",
  "ratio": "16x9",
  "kind": "report",
  "blueprint": {"record": "deck-blueprint.json"},
  "pages": {"record": "pages.json"},
  "critical": []
}
```

- `workMode`：editorial / analytical / exploratory；已定稿重排保持原意，有新计算或推论使用 analytical。
- `complexity`：不确定时 complex；新模型、多源口径或新结论需要独立复核。`majorConclusion:true` 也强制独立。
- `mode`：reading / presentation；`kind`：report（封面、正文、参考、封底）、fragment 或 collection。选择 fragment 不降低复核要求。
- `theme`：mckinsey / bcg / accenture；ratio：16x9 / 4x3。
- `blueprint` 与 `pages`：相对 task 路径，装配后自动换算为相对 HTML 路径并绑定文件摘要。改变蓝图后重新编译；不要手改 pages 或摘要蒙混通过。
- `critical`：可额外登记未由内容绑定覆盖的关键限定，使用 `{id,text,target?}` 与 DOM `data-critical-id` 对应。

```sh
node scripts/deck_blueprint.cjs /任务/deck-blueprint.json --ready
node scripts/compile_blueprint.cjs /任务/deck-blueprint.json /任务/pages.json
node scripts/verify_blueprint_pages.cjs /任务/deck-blueprint.json /任务/pages.json
```

正文角色 analysis / decision / action / risk / appendix 按顺序映射 pages。封面、章节、参考、封底不计入正文编号。schema 2 的关键内容绑定与计算是正式新稿入口；历史 `templates/deck-blueprint.json` 和 `templates/pages.json` 仅供旧版本兼容。

## 制作与装配

作者编写 `pages.html`、可选 `page.css`。静态片段只接受独立顶层 `section.slide`、内联 SVG 与 data:资源，禁止脚本、canvas、外部图片/样式/字体、事件属性和动态 chart 容器。构建期先将图形渲染为 SVG。

正文 section 用 `data-page-id` 关联蓝图。装配会填入形式、密度、布局等元数据及可见内容；显式元数据冲突会报错。每页仍须声明 `data-frame-boundary="line|integrated|space"`。封面等 bookend 用 `data-page-role` 与对应骨架。

目录布局按目录逐格给 `data-module`，顺序、几何和容量受检；不要自行覆盖其 grid-column/grid-row。`layout:custom` 用自己的 CSS 阅读区域，不受目录网格约束，但仍检查溢出、字号、内容绑定、数据语义和打印。字段与组件类名见 [单页系统](consulting-page-system.md)。

```sh
node scripts/assemble_deck.cjs /任务/pages.html /任务/deck.html \
  --css /任务/page.css --title "报告标题" --contract /任务/task.json
node scripts/preview_page.cjs /任务/deck.html 3
```

先做最能暴露问题的代表页；蓝图和片段应对应完整的当前制作范围。已有整册片段时可以 `assemble_deck.cjs ... --upto 3` 仅装前 3 页正文，产物自动标为制作期切片，不能用于最终验收。它仍需完整 blueprint/pages 记录，不修改权威源来冒充完整报告。

密度按证据职责选择：balanced 有主证据与支持/边界；dense 增加不同职责的证据及判断含义；sparse 说明减少信息的必要性。不能为凑数补空话。v4 的形式数量、重复与空白检测是待复核诊断，不能仅靠换图型、放大主图或拉伸框关闭；可读性与语义错误仍是阻断项。

## 最终验收与交付

```sh
# 制作期局部检查与整册检查
node scripts/qa_deck.cjs /任务/deck.html /任务/iteration --tier iteration --pages 3
node scripts/qa_deck.cjs /任务/deck.html /任务/smoke --tier smoke

# 最终 HTML/PDF、截图、摘要与 audit
node scripts/qa_deck.cjs /任务/deck.html /任务/renders --tier acceptance

# 实际审查完成后合并；simple 且无重大结论可仅给 author.json
node scripts/aggregate_reviews.cjs /任务/renders/audit.json /任务/renders/review.json \
  /任务/renders/author.json /任务/renders/independent.json
node scripts/package_delivery.cjs /任务/deck.html /任务/renders/deck.pdf /任务/delivery 报告名
```

审查用 schemaVersion 3，绑定实际 audit、HTML/PDF 证据 id 与产物摘要。作者及独立审查者都须实际看每页；analysis/evidence/visual 有具体依据，所有 warnings 经 accepted/fixed 处置，无未解决 major/blocking。独立审查来自实际不同实例，不能脚本生成通过结论。

完成审查后按 [审查快照与复用](review-reuse.md) 冻结证据。修订先保存快照，再覆盖工作稿；工具只准备继承草稿，变化页和全局判断仍须审查。未完成审查仅可用 `package_delivery.cjs --preview`，并明确称预览。

## 缓存与验证

字体缓存按源摘要、实际工具版本和字符集验证，损坏项重建；`FONT_CACHE_DIR` 可指定目录，缓存不免除缺字检查。字体改动用 `.font-venv/bin/python scripts/test_font_cache.py`。`npm test` 是合同与计算回归；`npm run test:render` 做历史浏览器回归；`npm run test:upgrade-render` 验证新蓝图、自由/目录布局、实际 HTML/PDF 与内容篡改防护。
