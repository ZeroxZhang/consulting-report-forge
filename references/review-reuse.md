# 审查快照与增量复用

复用的是**同一审查者已经看过、且本轮未变的页面证据**。整篇分析、证据适用性和视觉判断仍须本轮重新确认；准备工具不会生成新的 `PASS`。

## 先归档，再修改

在本轮 acceptance 验收和作者/独立复核全部完成后，将完整汇总 `review.json` 归档到一个全新目录：

```sh
node scripts/snapshot_review.cjs /任务/renders/audit.json /任务/renders/review.json /任务/snapshots/baseline
```

命令会核对真实 HTML、PDF、所有页面截图、任务来源记录、告警处置及双媒介覆盖。复杂或重大报告必须保留作者与独立复核者两种身份。未完成复核、未解决的重大/阻塞问题、未处置告警或文件已变更时，拒绝归档。

快照包含：

- 原字节的 HTML、PDF、HTML/PDF 页面图像；
- `task.pages`、`task.blueprint`、`task.analysisReview` 引用的原始记录，以及 schema3 登记的本地输入/模型附件（存在时）；
- 重写为相对路径并重新计算关联摘要的 audit 和 review；
- 被继承的历史审查及其全部验证依赖，递归复制到 `history/`；
- 记录每个文件摘要的 `snapshot.json`。

已存在的目录一律不覆盖。它是一次写入并校验摘要的归档，不是操作系统级不可修改介质；文件被修改后，复用工具会拒绝。快照整个目录可以移动，也可以删除原生产目录和更早快照而不破坏其验证链。

HTML 内嵌任务合同及文件字节保持不变。工具按原相对引用位置复制 pages/blueprint；包含 `../` 的引用由更深的快照子目录容纳。**绝对 `record` 无法在可迁移快照中原样兑现，因此明确拒绝**；正常装配会将它转换为相对 HTML 的路径。改了源记录、只改 audit 摘要而没有重新装配时，内嵌合同对账会失败。

快照用于复核溯源，不是新的正式交付目录，也不替代原研究材料或可编辑制作底稿。最终打包仍针对本轮生产目录的 HTML/PDF/audit/review 执行。

## 准备下一轮复核

修改页面后重新装配并执行完整 acceptance 验收，再运行：

```sh
node scripts/prepare_review_reuse.cjs /任务/renders/audit.json /任务/snapshots/baseline /任务/review-update
```

输出 `reuse-plan.json` 及按原审查身份分开的 `author-1.json`、`independent-1.json` 等草稿。准备目录同样必须是新目录。

每个页面必须同时满足以下条件，才会标记 `eligible`：

| 核对项 | 改变后的处理 |
|---|---|
| 页身份和页序 | 重审该页，避免旧页码指向新页面 |
| 页面内容与页级样式摘要 | 重审受影响页 |
| 字体、全局样式、脚本、画幅等公共依赖 | 重审全部受影响页 |
| HTML 与 PDF 两种媒介的图像字节 | 任一变化，重审该页两种媒介 |
| 页级样式等必要摘要缺失 | 视为不可判，要求重审 |

`task.pages` 和 `task.blueprint` 的整文件摘要不用于整册失效；它们仍与 HTML 合同及实际来源文件核对。每页 `data-content-hash` 随内容变化进入页面摘要。**这不意味着其他页的商业结论一定仍成立**：总判断、决策条件或跨页推理的变化必须在本轮全局复核中检查。

草稿只写入可继承的 `coverage` 与真实旧审查引用，保留旧未决小问题。它的 `status` 固定为 `incomplete`，`analysis/evidence/visual` 三项均为 `not_reviewed`，不代填告警处置。没有旧独立审查者时会生成身份待填写的空草稿，不能把作者改名冒充独立角色。

草稿另用顶层 `priorReview` 关联上一轮完整审查，即使所有页面都改变、没有任何可继承覆盖，也必须继续追踪旧未决问题。问题优先沿用已有 `id`；没有 id 时按位置、严重度和描述识别，同文不同页不能互相抵消。修复后保留问题身份并标记 `resolved`，不能直接删除。该引用只记录历史，不增加页面覆盖；聚合与快照会保留并验证它。

审查者需要实际查看待重审页的 HTML/PDF，将本轮真实覆盖追加到草稿的 `coverage`，重新填写三项检查的依据，处理当前告警与遗留问题，最后才设为 `complete`。`pendingPages` 是该份草稿尚未覆盖的页；多人分工时按角色覆盖的并集完成，不要求每个人都看全册。更换审查者时，不能沿用另一人的继承记录。

```sh
node scripts/aggregate_reviews.cjs /任务/renders/audit.json /任务/renders/review.json /任务/review-update/author-1.json /任务/review-update/independent-1.json
node scripts/snapshot_review.cjs /任务/renders/audit.json /任务/renders/review.json /任务/snapshots/revised
```

聚合仍强制作者对整册 HTML/PDF 的覆盖；任务需要独立审查时再强制独立角色的整册覆盖，不因复用降低标准。没有看过的新页、只覆盖一种媒介、当前文件摘要不同、遗漏旧未决问题，都不能成为完成的审查。

## 分批审查与边界

推荐以完整快照的汇总 review 作为来源，工具已按原身份自动选取覆盖。引用单人或分批结果时，可在对应 `inheritedFrom` 显式写 `reviewScope: "partial"`：递归验证仅按该原始审查者的身份及覆盖范围核验；默认仍是 `complete`。这不放宽当前整册覆盖，也不允许将单人文件直接归档成完整快照。

快照会把这些 partial 历史依赖一同复制并重新绑定。循环、超过 12 层的来源链、无效摘要、目录外依赖及篡改都会被拒绝。新一轮快照不会静默删除历史引用来伪装成直接审查。

`node scripts/test_review_reuse.cjs` 使用文件级两轮验收夹具，覆盖原位置覆写、单页复用、样式/图像失效、身份与双媒介范围、历史 partial、目录迁移、来源合同不一致与篡改拒绝。它测试复用机制，不替代实际报告的视觉和分析验收。

新分析使用最终 review4；复用草稿的 analysisSha256 初始为空，须实际确认本轮分析后填写。分析审查摘要不直接进入视觉公共依赖，但其真实性和当前分析适用性仍由前置及最终合同核对。快照可能含内部数据，不能默认当对外材料发送。
