# 商业分析升级 1.4.0 · 实施与验证

日期：2026-09-23。基线：`2c4c0b0`；工作分支：`codex/business-analysis-upgrade-proposal`。本轮未 commit、未发布远端。`.agents/skills/consulting-report-forge` 经 `.claude/skills` 链接到本仓库，无需复制安装。

## 已实施

- 八类业务 playbook、四篇公共方法、逐步加载的分析路由；流程从问题定义、证据/方法、反证到方案和综合。
- 公开信息缺口自动研究；内部数据/取舍用宿主当前可用的询问工具。登记 open/researching/waiting_user/resolved/unavailable；暂停依赖分支，空答不算答案。
- blueprint schema3 全局 claims/metrics；analysis 保存问题、工作、缺口、方案与答案引用。研究阶段可无页面，综合和生产分别校验。
- 跨主张计算闭包与页面显示选择分开；已采纳 pending 输入、未完成工作及关键缺口不能进入生产。
- analysis-review v1 绑定分析摘要、真实实例、覆盖及问题；task v2 是工作模式与风险唯一来源。简单分析作者审查，复杂/重大需要真实独立实例。
- 新内容仍编译 pages v4。显式预览只放宽前置审查，HTML 明示预览，最终 review4/打包不能绕过。历史 blueprint1/2、task1、review3 保持原路。
- 外部结果 JSON pointer 导入，持续核对输出值、文件 SHA、输入与模型/代码血缘、运行记录；不执行外部代码。
- 非覆盖迁移、派生分析视图、包含分析附件的内部审查快照；对外交付默认仍只有 HTML/PDF。

## 实际测试结果

| 验证 | 结果与范围 |
|---|---|
| `npm test` | 原14段回归和新增6组全部通过；分析依赖图追加反例后再次运行 |
| `npm run test:analysis` | stages/global metrics、审查/导入、CLI/反降级、迁移/视图、异常/循环、快照/复用通过 |
| `npm run test:render` | 真实Chrome的页眉、画幅、布局、留白严重度、瀑布绑定及历史兼容通过 |
| `npm run test:upgrade-render` | 原三页HTML/PDF验收通过；标题/数值篡改、打印隐藏、透明/裁切、降级和未重编译等反例按预期被拒绝 |
| 两个 schema3 业务案例 | 利润与市场各1页合成片段，真实HTML/PDF acceptance均0 errors；实际看图、作者前置/最终审查、review4聚合、打包、快照和分析视图均完成 |
| 复杂多页合成案例 | 9页整册、6页正文；task v2 的 `complex` 与 `majorConclusion:true` 实际触发独立分析及最终视觉复核。HTML/PDF acceptance 几何 PASS、0 errors、19 warnings 全部经实际读图处置；review4 聚合 `complete`，正式打包成功 |
| 技能官方 `quick_validate.py` | PASS。临时安装PyYAML以运行校验器，未增加项目运行依赖 |
| `git diff --check` | PASS；许可证及归因保留 |

浏览器最初在沙箱内启动失败，自动审批通过后用同命令在沙箱外运行成功。测试产物保留在 `renders/`，不进入版本库。

### 六组新增合同测试覆盖

1. `test_analysis_contract.cjs`：无页面研究、task版本、全局指标、未使用pending、公式间接pending、等待分支、空答不能resolved、显示选择、布局不改分析摘要。
2. `test_analysis_review.cjs`：角色/实例、覆盖、输入变化、布局复用、审查文件绑定、导入数值与血缘；追加外部值篡改、输出+SHA更新未重导入、已有output无血缘、缺run、错误pointer。
3. `test_analysis_integration.cjs`：真实CLI预览、缺分析审查拒绝、task/HTML标记、手改pages拒绝、task1/review3降级拒绝、审查失效。
4. `test_analysis_tools.cjs`：页内同名指标分离迁移、公式/token改引用、原文件不变、拒绝覆盖、派生数值视图。
5. `test_analysis_edges.cjs`：畸形记录不崩溃、附件/问题循环、决策包含实际比较的基线、旧格式不能带新分析字段。
6. `test_analysis_snapshot.cjs`：新格式本地附件可随快照迁移、原目录删除后可核验、最终review4、分析审查版本不直接使视觉证据全部失效。该组是文件级夹具，不是视觉通过证明。

## 独立审查与修复

[修复前独立审查](business-analysis-code-review.md) 发现0 Critical、2 Important、1 Minor。两个Important具有共同根因：外部结果约束只放在导入入口，没有成为整个生产链持续检查的不变量。

已新增 `analysis_artifacts.cjs` 统一输出文件/数值/血缘核对，导入、综合、生产与分析审查复用。先运行真实反例观察失败，再修复并通过新反例及完整 `npm test`。没有让审查者再次读取已被覆盖的同一差异来重复确认。

**暂缓的小问题**：CLI 把导入后的新蓝图写到另一目录时，不自动重定位 artifact.path。同目录导入正常；目前须同目录输出，或作者重定位路径后再校验，缺失附件会阻断后续生产。使用说明已明确该边界。

## 独立行为评估

原始题见 [cases.json](../evals/business-analysis/cases.json)，预期依据单独放 [reviewer-rubric.md](../evals/business-analysis/reviewer-rubric.md)。执行者使用干净上下文，未读评分规则、方案或作者结论；评分由另一个独立实例完成。

[原始执行结果](../evals/business-analysis/results/2026-09-23.md) / [结构化结果](../evals/business-analysis/results/2026-09-23.json) / [复算脚本](../evals/business-analysis/results/2026-09-23-calculations.py)。

- **13例在声明范围内通过，1例部分通过**。利润例的核心算术和推断边界正确，遗漏评分依据要求显式列出的总贡献及另一收入桥；没有把它写成全部通过。
- public-gap 实际访问 HBS 指定原始页面，执行者记录调用与定位；保存结果没有原始浏览响应归档，审查者未把再次访问冒充原调用。
- user-wait/fallback 是隔离能力模拟：没有向真实用户弹卡片或请求上传。验证了工具选择、null保持等待、独立分支、无法提供、部分答案恢复的逻辑；**没有验证原生卡片UI及真实上传/等待恢复的端到端行为**。
- update 为规则演练；真实文件变化与快照迁移由上述合同测试及实际样例快照另外验证。
- 本次每例一次，未跑同模型旧新各三轮配对，不据此宣称统计优势、固定提速或成本下降。

## 两个可复现业务样例

生成器：[build-business-analysis.cjs](showcase/build-business-analysis.cjs)。它不会生成任何通过审查记录；无前置审查时只生成标记预览。

```sh
node docs/showcase/build-business-analysis.cjs --prepare
# 实际核对原输入、计算、边界后，作者按 analysis-review 协议写记录。
node docs/showcase/build-business-analysis.cjs --render
node scripts/qa_deck.cjs renders/business-analysis/profit/deck.html renders/business-analysis/profit/qa --tier acceptance
node scripts/qa_deck.cjs renders/business-analysis/market/deck.html renders/business-analysis/market/qa --tier acceptance
```

可附加 `profit` 或 `market` 只处理一个样例。重跑prepare会更新这套明确的合成输入/蓝图/task，审查摘要变化后旧记录自然失效。

- 利润：收入1000→1080、贡献400→300、利润200→80，差额−120。只作算术诊断，不声明价格导致销量变化。
- 市场：2000适用账户×5000年支出=1000万；80户容量×5000=40万，后者假定全部赢单，未当作销售预测或进入推荐。
- 利润2条、市场4条 warnings 已逐条实际处置：单页表格的形式/布局数量诊断，及市场稀疏页的正文剩余空间。市场原先过大的内部间隔已调整，未为填空造内容。
- 这两稿都是 simple、非重大的一页合成片段，只需作者审查；复杂多页链另见下节。它们均不构成真实经营结论。
- 本地交付位于 `renders/business-analysis/{profit,market}/delivery/`；内部快照位于各自 `snapshot/`。输入没有随交付HTML/PDF自动公开。

## 复杂多页合成验收

生成器：[build-release-e2e.cjs](showcase/build-release-e2e.cjs)。它只准备合成输入、蓝图、任务和页面，**不会生成审查通过记录**。本次实际制作 9 页：封面、收入/成本/利润/情景/决策/行动六页正文、参考资料、封底。任务合同设为 `complex` 且 `majorConclusion:true`。

```sh
node docs/showcase/build-release-e2e.cjs --prepare
node scripts/deck_blueprint.cjs renders/release-e2e/blueprint.json --task renders/release-e2e/task.json --stage synthesis
# 作者与独立实例实际复核输入、公式、方案后，按 analysis-review.md 写入并绑定 analysis-review.json。
node docs/showcase/build-release-e2e.cjs --render
node scripts/verify_blueprint_pages.cjs renders/release-e2e/blueprint.json renders/release-e2e/pages.json --task renders/release-e2e/task.json
node scripts/qa_deck.cjs renders/release-e2e/deck.html renders/release-e2e/qa --tier acceptance
# 实际逐页查看两种媒介，由作者与独立实例分别完成审查记录，再聚合和打包。
node scripts/aggregate_reviews.cjs renders/release-e2e/qa/audit.json renders/release-e2e/qa/review.json renders/release-e2e/qa/author.json renders/release-e2e/qa/independent.json
node scripts/package_delivery.cjs renders/release-e2e/deck.html renders/release-e2e/qa/deck.pdf renders/release-e2e/delivery 合成经营决策报告
```

本次复算收入 1000→1080、贡献 400→300、利润 200→80；假设下一期无试点利润 80，节省额 20/30/60 扣 30 投入后净效果为 −10/0/+30。独立分析审查结论是 **conditional**：只可用于标明合成数据的流程演示。独立视觉审查首次找出第 5、6 页重复展品和第 7 页漏掉试点实施；修订后实际查看 HTML/PDF 各 9 页，确认第 6 页门槛表与第 7 页四步流程，最终结论为 PASS（限合成流程验收）。这两项问题在最终审查中作为 resolved major 留痕。

最终验收记录位于 `renders/release-e2e/qa/`（运行产物，不进入 Git）：HTML/PDF 两种媒介的几何、字号、离线字体及内容一致性通过，`errors=[]`；19 条警告涵盖有用途的留白、单条合成来源页、布局与表达数量诊断，均有逐条处置。`review.json` 为 `complete` 且无聚合错误，正式交付包位于 `renders/release-e2e/delivery/`。这验证了复杂任务的**流程与门禁**；合成数据不验证真实外部来源、原生提问/上传交互、真实业务判断质量或 20 页以上长报告的生产效率。

## 执行边界与取舍

用户已批准完整方案并要求实施，因此未再要求逐阶段批准；按项目要求未自动commit，工作区供用户检查。交互测试采用隔离模拟以免打扰真实用户；原生UI仍是未测边界。未做旧新配对研究，不将功能覆盖等同于效果提升。

机器能约束已登记的结构、引用、数值和版本，不能证明agent识别了每一个缺口、确实发过问题、来源真实或判断正确。技能现在把这些行为写成明确执行协议，行为质量仍需要真实使用与独立复核。

本轮复核还确认三项既有表达工具边界仍在：`expression-guide.md` 的图表选型属于作者方法约束，代码只校验形式已登记，不机器判断选型是否适合主张；`render_diagram.cjs` 按节点、连线与分组渲染，没有按 `diagram.mechanism` / `diagram.process` 分派语义；`deck-forms.js` 的部分 `capacity` 文字与选型指南分开维护，也没有通用容量拦截器。这些不影响本次合成表格报告的门禁结论，但使用相关图示时仍须实际读图核对，不能把形式登记或容量文案当成语义验收。

> **2026-09-23 后续状态**：上段是本次后续修复前的审计记录。三项对应的机器合同、渲染检查与文档同步已实施，新的验证范围见 [选型与容量合同验证](form-contract-validation.md)。机器检查仍不能替代对证据和最终画面的人工判断。
