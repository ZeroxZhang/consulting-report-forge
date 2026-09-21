# README 样例素材

本目录只收录公开展示需要的精选图片和可复现演示源。完整本地测试目录与审计底稿未纳入仓库。

## 真实报告选页

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
