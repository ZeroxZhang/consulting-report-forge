# README 样例素材

本目录只收录公开展示需要的精选图片和可复现演示源。完整本地测试目录与审计底稿未纳入仓库。

## Skill 介绍海报（README 头图）

[skill-poster.png](skill-poster.png) 是独立的 **3:4 海报，2160 × 2880 像素**。采用中文介绍、四项能力和真实报告原页缩略图；原页用于展示，不应在缩略尺寸下读取具体数据。

可编辑源为 [skill-poster.html](skill-poster.html)，复用仓库随包字体及下方三张案例图。安装项目依赖并准备 Chrome 后，在仓库根目录运行：

```sh
node docs/showcase/build-poster.cjs
```

已安装 Playwright Chromium 时可设置 `CHROME_CHANNEL=chromium`。脚本检查画布尺寸、元素越界、图片和字体加载，再导出双倍像素 PNG。HTML 需与仓库相对目录一起使用，PNG 可单独分享。

## 1.4.0 实际报告选页：全球 AI 生物制药前沿研究

来自用户指定的 `0924_mimo_forge_test/codex_retest/report` 执行项目，报告记录的成稿日期为 **2026-09-25**。整册 29 页、26 页正文；目录名称不作为成稿日期。公开图片直接复制 `renders/pNN.png` 最终 HTML 验收截图，未裁切、重绘或修改原文。

| 文件 | 原报告物理页码 | 展示重点 |
|---|---|---|
| [ai-biopharma-market.png](ai-biopharma-market.png) | 4 | 市场规模估计与统计边界 |
| [ai-biopharma-landscape.png](ai-biopharma-landscape.png) | 7 | 参与者证据矩阵 |
| [ai-biopharma-deals.png](ai-biopharma-deals.png) | 14 | 首付与条件里程碑散点；海报主图 |
| [ai-biopharma-finance.png](ai-biopharma-finance.png) | 16 | 收入、亏损与现金的财务比较 |
| [ai-biopharma-cash.png](ai-biopharma-cash.png) | 17 | 现金变动桥 |
| [ai-biopharma-valuation.png](ai-biopharma-valuation.png) | 22 | 条件估值敏感性 |
| [ai-biopharma-diligence.png](ai-biopharma-diligence.png) | 25 | 六项投资尽调门槛 |

本次已核对原目录 `audit.json` 的 acceptance 完成状态与空错误列表，以及 `review.json` 的 complete 状态、作者与独立实例对 29 页 HTML/PDF 的覆盖记录。七张公开图片的 SHA-256 均与审查 evidence 中的 HTML 截图一致；[截图清单](ai-biopharma-screenshots.json) 保留原页映射、图片校验值和审查文件校验值。

这些核对说明图片来自既有验收版本，不替代本次重新审查报告推理或核验所有外部事实。完整报告、数据附件与内部审查底稿未复制入仓库；截图保留原始来源、期间与限制，不代表有关公司背书，不作为当前投资或医疗建议。海报只缩放展示原页，不修改其内容。

## 1.3.0 最新报告选页：MES

来自2026-09-22完成的《中国MES市场：增长结构与交付约束》，整册20页（17页正文），完成HTML/PDF逐页检查、作者与实际独立实例审查。以下PNG直接复制最终acceptance的HTML截图，未裁切、重绘或更改文字。原页中的来源、期间与限制全部保留。

| 文件 | 原报告物理页码 | 展示重点 |
|---|---|---|
| [mes-growth.png](mes-growth.png) | 4 | 行业增长贡献瀑布 |
| [mes-regions.png](mes-regions.png) | 6 | 地区规模与归一化强度 |
| [mes-competition.png](mes-competition.png) | 9 | 厂商规模与增速散点及明细 |
| [mes-penetration.png](mes-penetration.png) | 10 | 两期渗透率哑铃与百分点变化 |
| [mes-scenarios.png](mes-scenarios.png) | 15 | 等待改善的假设敏感性矩阵 |
| [mes-action.png](mes-action.png) | 18 | 三阶段验证与继续／停止条件 |

原始证据是用户提供的市场数据与访谈整理稿，未逐项外部核验。截图用于展示制稿效果，不代表外部市场事实认证或相关公司背书。完整报告、原始材料与审查截图目录未公开；公开PNG与原验收产物的SHA-256关联见[截图清单](mes-screenshots.json)，具体观察见[MES验证记录](../mes-full-evaluation.md)。清单用于核对文件版本，不替代独立获取原始证据。

这些是固定的实际成稿快照，其他展示生成脚本不会覆盖它们。

## 历史真实报告选页：TikTok

来自《TikTok 全球商业化：市场与渠道投入优先级》的 15 页运行测试。原始报告已走完交付验收；这里选用 2026-09-21 技能优化后的回归渲染截图，渲染基于提交 `b11b260` 对应的运行时。图片保留来源、统计期间和限制，不作为当前市场数据承诺。

| 文件 | 原报告物理页码 | 内容 |
|---|---|---|
| [report-priority.png](report-priority.png) | 3 | 区域份额与进入优先级 |
| [report-ranges.png](report-ranges.png) | 7 | CPM/CPC 区间与不可直接比较的口径 |
| [report-sensitivity.png](report-sensitivity.png) | 10 | 每 100 美元 GMV 的获客前贡献敏感性 |
| [report-action.png](report-action.png) | 13 | 阶段试验、指标与投入门槛 |
| [report-overview.png](report-overview.png) | 上述四页 | 四张原页的展示总览 |

这四张原页 PNG 是固定的展示快照；总览可从它们重新生成。原报告本地底稿在被忽略的测试目录内，不是公开样例构建的依赖。旧仓库 README 仅作为产品介绍的参考，未复制其图片。

## 图表能力演示

六张 `chart-*.png` 使用本项目的实际渲染器生成，数据完全虚构，标注直接写在每页上。这些是组件能力演示，**未作为完整报告走整册验收流程**。

| 文件 | 实际调用 | 展示重点 |
|---|---|---|
| [chart-sankey.png](chart-sankey.png) | `recipe.sankey` | 收入去向与中间节点守恒 |
| [chart-waterfall.png](chart-waterfall.png) | `kit.waterfall` + `waterfall-bridge` | 起点、增减和终点闭合，内核对账差额为 0 |
| [chart-mekko.png](chart-mekko.png) | `kit.mekko` | 列宽、份额和面积的不同含义 |
| [chart-heatmap.png](chart-heatmap.png) | `kit.heatmap` | 显式公式、固定色阶和条件变化 |
| [chart-dumbbell.png](chart-dumbbell.png) | `kit.dumbbell` | 同口径两期比较 |
| [chart-bullet.png](chart-bullet.png) | `kit.bullet` | 实际值、目标和共同量尺 |

在仓库根目录执行：

```sh
npm ci
node docs/showcase/build.cjs
```

需要本地 Chrome；已安装 Playwright Chromium 时可设置 `CHROME_CHANNEL=chromium`。命令会更新本目录六张图表 PNG 和一张总览 PNG，不覆盖四张真实报告原页。中间 HTML 保存在被 Git 忽略的 `renders/readme/`，需要时可打开查看。

所有演示数据和标题都在 [build.cjs](build.cjs) 中，可直接修改并重新生成。截图使用随包字体；真实报告图片与虚构演示的版权范围见根目录 [第三方说明](../../THIRD_PARTY_NOTICES.md)。

## 布局图谱演示

三张 `layout-*.png` 来自本项目已有的 Layout Atlas，不包含业务数据。

| 文件 | 内容与来源 |
|---|---|
| [layout-featured.png](layout-featured.png) | L09、L14、L24、L26 四种代表布局；直接复用图谱线框，并在真实矩形内放置目录中的模块名称 |
| [layout-overview.png](layout-overview.png) | 目录中全部 30 套 `analysis` 正文布局，沿用图谱缩略线框 |
| [layout-atlas-workbench.png](layout-atlas-workbench.png) | 实际 `assets/layout-atlas.html` 界面截图，选中 L26 与容量视图 |

在仓库根目录运行：

```sh
node docs/showcase/build-layouts.cjs
```

环境要求与前面的图表演示相同。脚本首先检查图谱与目录是否一致，再调用实际图谱的线框生成器，避免维护另一套布局几何。中间 HTML 和检查记录保存在被忽略的 `renders/readme/`；只更新上述三张 PNG，不修改技能布局或图谱本身。
