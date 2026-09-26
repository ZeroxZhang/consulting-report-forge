# 生产入口

`node scripts/report.cjs` 统一调用既有编译、装配、QA、聚合、快照、复用及打包器。所有旧 CLI 保留。新建任务默认 task3 / semantic-v2；历史维护可显式 `init --contract legacy` 创建 task2。现有任务按自身版本读取，不自动迁移。

```sh
node scripts/report.cjs init /任务/新报告
node scripts/report.cjs status /任务/新报告/task.json
node scripts/report.cjs next /任务/新报告/task.json
node scripts/report.cjs compile /任务/新报告/task.json
# compile 返回派生 taskFile：原配置不变，派生任务绑定本轮 pages。
node scripts/report.cjs assemble /编译结果/task.json --pages /任务/pages.html --css /任务/page.css
node scripts/report.cjs qa /编译结果/task.json --html /装配结果/deck.html --tier acceptance
node scripts/report.cjs review-pack /编译结果/task.json --audit /验收结果/qa/audit.json
# 实际完成作者/独立审查之后：
node scripts/report.cjs aggregate /编译结果/task.json --audit /验收结果/qa/audit.json --reviews '["/审查/author.json","/审查/independent.json"]'
node scripts/report.cjs snapshot /编译结果/task.json --audit /验收结果/qa/audit.json --review /聚合结果/review.json
node scripts/report.cjs reuse /编译结果/task.json --audit /新验收/qa/audit.json --snapshot /旧快照/snapshot
node scripts/report.cjs package /编译结果/task.json --audit /验收结果/qa/audit.json --review /聚合结果/review.json --name 报告
```

正文片段的制作仍由作者完成；入口不会根据草稿自动生成业务结论。制作期可用 `compile --preview true` 或 `qa --tier iteration --pages 2,5`，两者都不能作为正式交付依据。路径按调用时工作目录解析，task 内绑定仍相对 task 文件。

## 产物与恢复

每轮写入任务目录的 `.forge/runs/<唯一ID>/`，路径保持稳定，避免移动后破坏审计中的绝对路径。整个操作成功才原子替换 `.forge/latest-<操作>.json` 指针；它只是便利索引，状态仍由真实记录与摘要校验。未发布运行中可能保留部分产物和 failure.json，不能当作有效验收。上一轮有效产物、task.json、蓝图与作者审查均不覆盖。编译生成的派生 task 与原任务共用同一任务锁。

并发操作遇锁明确失败。进程异常退出留下锁时，`recover-lock task.json` 只在本机确认原 PID 已不存在后移除锁；无法确定身份、仍有活进程、跨主机的锁均不自动解除。重新运行会生成新目录，保留前次失败诊断。所有运行目录应保留到完成快照归档；不要只搬 latest 索引。

## 审查包与一次处置

`review-pack` 输出全部 HTML/PDF 证据路径、按发现排序的优先页、诊断摘要和作者/独立审查草稿。优先页只是阅读顺序建议，不减少全页实际审查范围；没有明确风险的页不会因此被证明安全。所有草稿保持 `incomplete`，身份、覆盖和通过依据为空。

`warning-decisions.json` 把同页、同对象、同代码的屏幕/打印视觉告警归组，保留原始文字。实际审查者填写每组 `status: accepted|fixed` 与 `note` 后运行：

```sh
node scripts/report.cjs dispositions /任务/task.json --audit /验收/audit.json --decisions /审查/warning-decisions.json --review /审查/author.json
```

工具核对 audit 摘要并把一次处置展开为旧合同要求的逐条 warningReview，输出新的 review.json；不改变原始草稿和审查完成状态。未填、未知 ID、重复 ID 或过期处置会拒绝。聚合与打包仍检查完整覆盖、独立身份和未决重大问题。

## 显式策略

新任务默认 semantic-v2、reading-shadow-1、structural-lines-1；研究骨架未有来源清单时保留 single-page-1。正文来源确定后，用下述 referenceBundle 一次派生参考块 HTML、referenceIds 和对应策略，再装配及验收。严格任务可声明以下策略；省略 policyVersions 的已有 task3 保持最初候选行为，不自动变更指纹：

```json
{
  "policyVersions": {
    "analysis": "semantic-v2",
    "reading": "reading-shadow-1",
    "visual": "structural-lines-1",
    "references": "reference-block-1"
  },
  "referenceIds": ["S1", "S2", "S3"]
}
```

- `visual: legacy-1` 继续原判据；`structural-lines-1` 仅允许符合测量条件的浅色、低对比、水平细线。高饱和彩色装饰线、粗线、竖线仍按原规则检查；结构用途仍须实际查看。
- `references: single-page-1` 保持单页；`reference-block-1` 要求有序、唯一的完整 referenceIds 清单。该清单属于已签任务合同，不能仅靠页面自报总数。它核对 ID 完整性，不自动证明来源真假。
- 来源清单只维护一份：优先使用 `bookends.referenceBundle({sources,pageSize,columns,selectedIds,note})`，将返回的 `referenceIds` 写入派生 task、`html` 写入片段。两者同源生成，不手工抄写第二份 ID 清单。
- `bookends.referencesBlock({sources,pageSize,columns,selectedIds,note})` 由完整来源生成连续页面，节选数量按整块计。pageSize 由作者明确选择，不自动缩字；每页 DOM 裁切和实际 PDF 条目提取继续验收。
- 字体 cmap 诊断读取实际嵌入字体，报告缺字符与未覆盖范围；字体身份仍由 CDP 判断。cmap 并集不能证明每种字重、变体与复杂字形塑形正确。
- 阅读检测继续只记录，不自动升级为硬失败；固定测试集通过不能外推为真实任务零漏检。
