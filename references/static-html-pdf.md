# 静态 HTML/PDF 路线

在实际技能根目录执行以下命令。制作路线为蓝图 → 编译页面记录 → 静态 HTML → acceptance PDF → 实际审查 → 打包；字段与绑定详见 [内容制作合同](content-authoring.md)。

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

新任务先用 `node scripts/report.cjs init /任务/新报告 --work-mode analytical` 生成 task、蓝图和执行清单（模式按任务选择 editorial、analytical 或 exploratory），再按 [执行清单协议](execution-checklist.md) 激活计划。[蓝图模板](../templates/deck-blueprint.json) 与 [任务模板](../templates/task.json) 用于查看字段；不要复制任务模板覆盖 init 生成的工作流与计划身份。改写全部合成示例，不把示例当研究证据。

```json
{
  "version": 3,
  "analysisAlgorithm": "semantic-v2",
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
- `complexity`：按实际分析风险填写；不确定时 complex。涉及新模型、多源口径冲突或重大新结论时需要独立复核，简单的单表比较不因使用 analytical 就自动升级。`majorConclusion:true` 也强制独立。
- `mode`：reading / presentation；`kind`：report（封面、正文、参考、封底）、fragment 或 collection。选择 fragment 不降低复核要求。
- `theme`：mckinsey / bcg / accenture；ratio：16x9 / 4x3。
- `blueprint` 与 `pages`：相对 task 路径，装配后自动换算为相对 HTML 路径并绑定文件摘要。改变蓝图后重新编译；不要手改 pages 或摘要蒙混通过。
- `critical`：可额外登记未由内容绑定覆盖的关键限定，使用 `{id,text,target?}` 与 DOM `data-critical-id` 对应。

analytical / exploratory 新稿先按 [前置分析审查](analysis-review.md) 绑定 `task.analysisReview.record/sha256`；它相对 task 文件。editorial 免前置分析审查，但仍须激活执行清单、完成三项规划与最终风险审查。研究阶段不需要生成 pages。完成适用的审查后执行：

```sh
node scripts/deck_blueprint.cjs /任务/deck-blueprint.json --task /任务/task.json --ready
node scripts/compile_blueprint.cjs /任务/deck-blueprint.json /任务/pages.json --task /任务/task.json
node scripts/verify_blueprint_pages.cjs /任务/deck-blueprint.json /任务/pages.json --task /任务/task.json
```

未完成前置审查时，蓝图 ready 校验和编译命令均加 `--preview`；生成的 HTML 明示分析预览，不能正式打包。编辑模式免前置分析审查，但保留最终风险审查。

正文角色 analysis / decision / action / risk / appendix 按顺序映射 pages。封面、章节、参考、封底不计入正文编号。关键内容通过蓝图编译和可见绑定进入页面，不手工制作第二份页面数据模板。

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

密度按证据职责选择：balanced 有主证据与支持/边界；dense 增加不同职责的证据及判断含义；sparse 说明减少信息的必要性。不能为凑数补空话。形式数量、重复与空白检测是待复核诊断，不能仅为消除提示而换图型或拉伸空框；仍须按[整册多样性验收](visual-qa.md#整册多样性验收)落实尽可能多地使用适配图型与布局的默认要求。主图确实太小时，可以扩大真实绘图区并复看；可读性与语义错误仍是阻断项。

## 最终验收与交付

```sh
# 制作期局部检查与整册检查
node scripts/qa_deck.cjs /任务/deck.html /任务/iteration --tier iteration --pages 3
node scripts/qa_deck.cjs /任务/deck.html /任务/smoke --tier smoke

# 最终 HTML/PDF、截图、摘要与 audit
node scripts/qa_deck.cjs /任务/deck.html /任务/renders --tier acceptance

# simple 且无重大结论：实际作者审查后合并
node scripts/aggregate_reviews.cjs /任务/renders/audit.json /任务/renders/review.json \
  /任务/renders/author.json
# complex 或重大结论：实际独立实例审查后合并
node scripts/aggregate_reviews.cjs /任务/renders/audit.json /任务/renders/review.json \
  /任务/renders/author.json /任务/renders/independent.json
node scripts/package_delivery.cjs /任务/deck.html /任务/renders/deck.pdf /任务/delivery 报告名
```

新稿 task3/schema3 的最终审查用 schemaVersion 5，填写 analysisAlgorithm: semantic-v2 与当前 analysisSha256；历史 task2/review4、task1/review3 保持原流程。它们均绑定实际 audit、HTML/PDF 证据 id 与产物摘要。作者须覆盖每页；任务要求独立审查时，独立角色也须覆盖每页。多人分工按同一角色的覆盖并集核对，不要求每位成员重复看全册；analysis/evidence/visual 有具体依据，所有 warnings 经 accepted/fixed 处置，无未解决 major/blocking。独立审查来自实际不同实例，不能脚本生成通过结论。

显式视觉策略还有额外覆盖要求：`evidence-composition-1` 与 `narrative-focus-1` 的最终 `coverage[]` 必须保留实际所审的 `panelRefs/relationRefs`（格式为 `slideId:panelId`、`slideId:relationId`）。`narrative-focus-1` 还要求 `coverage[].layers` 包含 `narrative`，并用 `narrativeReadings:[{slideId,observedTakeaway}]` 记录逐正文页实际读到的收束句（至少6字），不能照抄蓝图代替看图。基础 `checks` 仍是 analysis/evidence/visual，叙事要求落在 coverage；审查包草稿不能代替这些实际覆盖。前置审查使用不同的覆盖字段，见[前置分析审查](analysis-review.md#记录格式结构说明不是可直接签署的成品)。

完成审查后按 [审查快照与复用](review-reuse.md) 冻结证据。修订先保存快照，再覆盖工作稿；工具只准备继承草稿，变化页和全局判断仍须审查。未完成审查仅可用 `package_delivery.cjs --preview`，并明确称预览。

## 缓存与验证

字体缓存按源摘要、实际工具版本和字符集验证，损坏项重建；`FONT_CACHE_DIR` 可指定目录，缓存不免除缺字检查。字体改动用 `.font-venv/bin/python scripts/test_font_cache.py`。`npm test` 是合同与计算回归；`npm run test:render` 做浏览器回归；`npm run test:upgrade-render` 验证内容蓝图、自由/目录布局、实际 HTML/PDF 与内容篡改防护。


## 新任务的制作前置条件（execution-plan-2）

新建任务默认带持久清单，具体命令和记录格式见[执行清单协议](execution-checklist.md)。正式 compile 前完成 `chart-plan`、`layout-plan`、`module-fill-plan`；先做代表页取图观察，再记录制作完成，之后运行 acceptance。新验收同时检查单位/排印。smoke 不覆盖正式验收记录。原始 task 的产物定位由 productionRefs 提供，使用 compile 返回的派生 task 装配与验收。最终质量审查保留独立的 `chart-diversity`、`layout-diversity`、`module-fill`，打包后生成执行归档。历史 `execution-plan-1` 继续按原双约束与任务集核验，不补签新要求。
