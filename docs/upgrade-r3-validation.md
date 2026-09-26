# 第三批集成与实际验收记录

后续状态：本记录保留当时的候选状态；另外两类实际案例及默认切换已在 [最终完成记录](upgrade-r4-completion.md) 完成。

日期：2026-09-26。这里的“第三批”是生产能力集成，**不是规划中 R3 默认切换已发布**。运行时仍为 1.5.0-rc.1；新任务默认 task2，严格合同须显式启用。阶段4另外两类真实任务材料尚缺，不能宣布全部升级发布完成。

## 本批完成

- 多页参考资料：task3 显式 reference-block-1、权威来源 ID 顺序、生成器、DOM 验证、实际 PDF 条目提取及最终交付已接通。旧 single-page-1 行为保留。完整/节选、重复、漏项、错误总数、非连续、顺序、标题裁切及 PDF 隐藏条目均有负向验证。
- 浅色细线：显式 structural-lines-1 在屏幕和打印共用测量，允许符合条件的低对比水平细线，彩色装饰边条继续失败。已有 task3 不写策略时仍用 legacy-1，公共依赖指纹记录策略差异。
- 字体：实际嵌入字体 cmap 观测报告缺字符与未知范围；已加载自定义字体、角色不符、系统回退、字重与加载状态保持区分。cmap 是字重并集观测，不改变旧字体失败条件，也不证明复杂字形塑形。
- 统一入口：init/status/next/compile/assemble/qa/review-pack/dispositions/reuse/aggregate/snapshot/package。产物在独立运行目录保持稳定路径，成功后原子发布索引；任务与派生 task 共用锁。失败与进程中断不替换旧结果；确认死进程后才能恢复锁。所有旧 CLI 保留。
- 审查：风险页优先顺序、全页两媒介证据路径、诊断归组及 incomplete 草稿已接入。每组理由可展开为原始 warningReview，保留逐条身份及历史验证器，不自动填写审查身份或通过结论。

用法与边界见[生产入口](upgrade-production-entry.md)。生成器容量仍须实测，来源 ID 对齐不证明来源内容真实，诊断优先页不减少全页阅读范围。

## 固定标注场景

`test_reading_matrix.cjs` 在真实 Chrome 屏幕/打印分别执行四类密表来源冲突、极坐标标签重叠、负号遮挡、SVG 裁切，以及行内强调、嵌套、柱内标签、分离旋转文字对照。

14个有问题的“场景×媒介”均检出指定问题；8个合法场景没有新增观测。结果和逐例耗时：`renders/upgrade-r3/reading-matrix.json`。这不是对象级 precision/recall，更不能外推为真实报告零漏检；旋转文字、复杂裁切与路径等继续明确未覆盖。阅读检测继续 shadow，没有升级为硬失败。

## 31页真实报告

副本目录：`renders/upgrade-r3/biopharma-block/`。原26页正文语义投影与前轮完全相同，完整42项来源按每页14项排为3页，含封面/封底共31页。原始用户材料12份摘要再次核对未变。

- 正式验收：31 HTML + 31 PDF，工程 errors=0，当前 screen/print 阅读观测=0，三页 PDF 各14项来源没有遗漏。
- 作者 `/root` 与独立实例 `/root/independent_analysis` 均实际打开本轮全部62张图；没有以机器通过代替读图。重看年份、下界、置信区间、来源区、密表末行与单位；无未解决 major/blocking。
- 原始11条告警归为8组，作者实际填写每组理由后展开到全部11条；独立审查另有逐条处置。参考页留白维持统一的字号及分页，未遮挡或丢失来源。
- 已经由统一入口完成正式聚合、HTML/PDF打包、77文件快照；新快照 review5 完整加载，用户原29页 review4 快照也仍加载成功。
- 复用准备：31页证据符合继承条件，但两份草稿仍是 incomplete，analysisSha256=null；没有替新一轮签署。
- 统一 compile 生成的 pages 与当前已验收 pages 内容完全一致，派生 task 单独绑定输出，原 task 不改写。

正式产物地址、摘要、审查及快照/复用结果汇总于 `biopharma-block/validation-result.json`；各操作 `*-result.json` 记录稳定输出路径和真实时间戳。实际装配约2.66秒、acceptance约17.69秒，仅代表本机本轮执行，不是与旧版的效率对照。未完整测量研究/制作/返工总耗时，token未知。

## 回归

以下命令实际退出0，日志保留在 `renders/upgrade-r3/`：

- `npm test`：unit-tests.log。
- `npm run test:render`：render-tests.log。
- `npm run test:upgrade-render`：upgrade-render.log。
- `npm run test:upgrade-r2`：strict-tests.log。
- `npm run test:upgrade-r3`：production-tests.log。
- `test_upgrade_baseline.cjs --browser`：baseline-tests.log。

生命周期额外验证实际杀死正在运行的测试进程，留下锁后确认进程死亡并恢复；旧成功索引字节保持不变。合成端到端审查身份明确标为测试夹具，与真实报告记录分开。`git diff --check` 通过。

## 尚待发布验收

已检索用户提供目录与 `/Volumes/Out/临时任务` 的任务合同，找到的任务均为 analytical；没有把同一量化报告换名称充作“定性策略”和“已确认内容重排”两个独立真实案例。已向用户请求对应路径或确认本次以候选版收尾；未收到实际选择前，不缩减规划的发布门槛。

因此：候选版功能集成及现有真实案例验收完成；另外两类真实案例验收、新任务默认切换仍未完成。无 Git commit、push、merge 或正式发布。新运行时对旧报告继续按旧合同验证，回滚时保留严格任务和支持它的运行时，不把严格任务降版伪装成旧签署。
