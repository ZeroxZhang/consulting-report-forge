# 第三方组件与素材说明

项目采用 Apache-2.0，不覆盖下列组件或素材原有的许可证与权利。根目录 [LICENSE](LICENSE) 和 [NOTICE](NOTICE) 保留已有归因；本文件说明当前随包资源与主要构建依赖，不能代替依赖包中的完整许可证。

## 运行时来源

随包运行时基于 Zerox Zhang 的 [consulting_deck_skill_concise](https://github.com/ZeroxZhang/consultancy_charts_concise/tree/main/consulting_deck_skill_concise) 重组和修改。继承许可证中已有的 Microsoft、Google 归因保持不变。

瀑布图数据判据端口自 `aeolus-period-waterfall` 的 `diagnose()` 决策逻辑；端口说明见 [SKILL.md](SKILL.md#归因)。该模块不是本项目的外部运行依赖。

## 随包字体

所有字体均保留对应的 SIL Open Font License 文本。字体来源、版本、文件哈希见 [manifest.json](assets/fonts/manifest.json)。

| 字体族 | 许可证与上游版权声明 |
|---|---|
| Noto Serif SC | [notoserifsc-OFL.txt](assets/fonts/notoserifsc-OFL.txt) |
| Noto Sans SC | [notosanssc-OFL.txt](assets/fonts/notosanssc-OFL.txt) |
| Inter | [inter-OFL.txt](assets/fonts/inter-OFL.txt) |
| DM Serif Text | [dmseriftext-OFL.txt](assets/fonts/dmseriftext-OFL.txt) |
| Playfair Display | [playfairdisplay-OFL.txt](assets/fonts/playfairdisplay-OFL.txt) |

## 主要 Node.js 依赖

依赖通过 npm 安装，不将 `node_modules/` 纳入源码仓库。实际版本以 [package-lock.json](package-lock.json) 为准；打包或分发依赖时须保留各包要求的许可证与归因，包括其传递依赖。

| 依赖 | 用途 | 许可证 |
|---|---|---|
| Apache ECharts | 图表构建与 SVG 渲染 | Apache-2.0 |
| Playwright | 浏览器预览与 PDF 导出 | Apache-2.0 |
| PDF.js（pdfjs-dist） | PDF 渲染与检查 | Apache-2.0 |
| fontkit | 字形测量 | MIT |
| @napi-rs/canvas | 画布支持 | MIT |

Python 字体依赖由 [requirements-fonts.txt](scripts/requirements-fonts.txt) 指定并在本地虚拟环境安装；Chrome/Chromium、Poppler 等外部工具也保留各自许可证。

## 研究材料、报告图与演示数据

- `research/` 是被 Git 忽略的本地研究目录，不随仓库分发。用户自行放入的第三方资料、数据和商标不因本项目采用 Apache-2.0 而被重新授权。
- README 的真实报告截图来自本项目本地生成的报告，截图中的第三方事实与来源继续保留其原有身份；这些截图不代表相关公司认可本项目。
- `docs/showcase/chart-*.png` 是本项目原创的虚构数据演示；其生成入口和数据一并提供，适用项目许可证。
- 本次 README 没有复制旧仓库的报告图片。逐图来源见 [样例说明](docs/showcase/README.md)。

主题名称用于描述视觉适配，不代表 McKinsey、BCG 或 Accenture 的官方模板、授权或背书。
