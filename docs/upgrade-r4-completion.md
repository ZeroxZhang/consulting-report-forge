# 1.5.0 升级完成记录

日期：2026-09-26。本机技能真源已完成本次升级，新任务默认切换到 task3 / semantic-v2。代码、模板、操作文档与验证记录已落盘。此记录描述升级验收范围；后续按用户要求更新 README 与 onepage，并纳入 main。具体提交与远程同步状态以 Git 记录为准。

## 默认入口与兼容边界

新任务执行 `node scripts/report.cjs init /任务/新报告`，自动生成 blueprint3 / task3，前置审查使用 analysis-review2，最终审查使用 final-review5。新模板显式启用 structural-lines-1；研究阶段尚未确定来源时保留 single-page-1，来源确定后通过 referenceBundle 同源生成多页参考资料与 ID 清单。旧 task1/task2、旧快照及省略策略的既有 task3 保持原解释；维护时可显式创建 legacy 任务，不能把已签严格任务降级。

已统一更新 SKILL、两份蓝图模板、task 模板、前置审查示例、制作与复用文档。严格摘要命令现在明确传入 task，避免按旧算法验证新蓝图。用户无需选择 schema 或搬运材料。

## 三类实际验收

| 类型 | 原始材料与本次范围 | 成品页数 | 实际复核与交付 |
|---|---|---:|---|
| 定量研究 | AI 生物制药原报告26页正文，42条完整参考资料分3页 | 31 | 作者与独立实例均看完31张HTML、31张PDF图；正式打包、快照、复用已完成 |
| 定性策略 | TikTok历史报告第5/20/23物理页的机制、竞争矩阵及验证建议，3页正文节选 | 6 | 作者 `/root` 与独立实例 `/root/r4_independent` 均看完6张HTML、6张PDF图；前置审查及最终审查完成，正式打包、快照、复用完成 |
| 已确认内容重排 | 冷链已验收报告第9物理页：先读归纳边界，再读原文依据及泳道关系，2页正文 | 5 | 核对原完整审查与HTML/PDF/audit摘要；作者及独立实例均看完5张HTML、5张PDF图，正式打包、快照、复用完成 |

后两例来自不同的既有真实任务，分别整理为限定范围的策略简报和编辑节选；不是同一定量样稿改名，也不是三份全新市场研究。它们不更新外部事实时点，不证明历史报告全篇都满足新合同。本轮验收的是这些明确范围的制作、合同、阅读与审查链。

前置独立审查发现并修复了两类问题：TikTok 的 GMV/平台收入限定存在歧义，改为分清统计对象并防止 Shop Ads 重复相加；冷链15%的企业口径仅见于旧报告，原始材料未明样本单位，因此保留原文并显式标注引用身份、未新增核实和不可外推。所有限制已进入正文。无未解决 major/blocking。

证据索引（相对技能根目录）：

- `renders/upgrade-r3/biopharma-block/validation-result.json`：31页报告、实际审查、正式交付及77文件快照。
- `renders/upgrade-r4/qualitative/validation-result.json`：6页定性策略的验收、审查、22文件快照、交付及复用。
- `renders/upgrade-r4/editorial/validation-result.json`：5页编辑节选的验收、审查、20文件快照、交付及复用。
- 两例的 `original-manifest.json`、`inputs/`、`independent-analysis-findings.md`、`independent-final-findings.md` 保留原文、哈希及实际意见；原始材料均未改动。

## 局部修订与复用

在定性策略已验收快照之后，仅把第2物理页注解列间距从34改为40像素；蓝图、分析投影与前置签署未变。新 acceptance 后，工具准确输出 `eligiblePages:[1,3,4,5,6]`、`requiresReview:[2]`。准备生成的两份草稿仍为 incomplete、analysisSha256为空；只有原作者与原独立实例实际复看该页HTML/PDF、重判全局适用性并处置告警之后才完成本轮签署。继承记录保留 priorReview 与同身份的 inheritedFrom。

具体证据见 `qualitative/revision-qa-result.json`、`revision-reuse-result.json`、`revision-independent-findings.md` 以及本轮聚合、快照和交付结果。没有凭图像相近或旧 PASS 自动签署。

## 回归与局限

默认切换后以下命令全部退出0，日志保存在 `renders/upgrade-r4/`：

- `npm test`：合同、蓝图、指标、分析、审查、快照、迁移、状态与生命周期。
- `npm run test:render`、`npm run test:upgrade-render`：浏览器及真实 HTML/PDF 生产链。
- `npm run test:upgrade-r2`：严格投影变异、精确数值/附件对账、旧新快照与严格渲染。
- `npm run test:upgrade-r3`：多页参考资料与PDF漏项、14个问题场景×媒介、8个合法对照、并发/中断恢复与未审拦截。

新默认和显式legacy初始化均校验算法一致与研究阶段可用；旧行为夹具仍按旧合同执行。`git diff --check` 通过；dbs-bridge 状态确认各 Agent 入口指向唯一真源，无冗余入口。

阅读测量继续只作影子观测，旋转文字、复杂裁切/路径、位图及视口外遮挡等仍明确不覆盖；不存在“全页零漏检”的承诺。自定义展品精确对账须登记映射，不能自动证明任意绘图代码没有改值。字体 cmap 并集观测不证明每种字重或复杂塑形正确。

本轮后两例各进行一次正文代表页预览、一次正式整册验收；定性例额外进行一次局部修订的整册验收。两例原始告警各9条，按对象和媒介归为7组、6组后由真实审查者处置。实际 acceptance 工具耗时约6.06秒和4.72秒；研究/制作/返工的完整耗时及 token 计数未测量，不报告提速百分比。具体操作时间以各 `*-result.json` 的 startedAt/finishedAt 为准。

## 回滚

已有旧任务继续原合同无需迁移。新任务如需旧入口，可显式 `init --contract legacy`；恢复旧运行时前保留严格任务及其支持环境，不修改严格签署伪装为旧格式。出现历史证据无法读取、错误继承或重大漏检时，暂停对应新策略并保留现场。本次没有改变或覆盖已交付的原报告。
