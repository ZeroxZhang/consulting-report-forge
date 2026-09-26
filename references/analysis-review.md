# 前置分析审查与版本绑定

此记录在画页前检查问题、方法、证据、计算、替代解释和方案是否站得住。最终 HTML/PDF 读图仍按视觉验收执行。

## 实际审查顺序

1. 主笔完成 synthesis，提供原目标、原始资料、蓝图、模型输入和结果，不给审查者预设“应该通过”的答案。
2. 简单分析由实际作者审查；complex 或 majorConclusion 必须有未参与写作的实际独立实例，返回问题与依据。不能用同一 agent 换角色名称。
3. 解决 blocking/major 问题；条件收束须把限制写入对应的已采纳主张。更新分析后再审当前版本。
4. 写 `analysis-review.json`，绑定 `analysis_contract.digest(doc, task)`；然后在 task 写 `analysisReview:{record,sha256}`。sha256 是记录文件字节摘要。绝不由脚本预填 ready。

## 记录格式（结构说明，不是可直接签署的成品）

```json
{
  "schemaVersion": 2,
  "status": "complete",
  "analysisAlgorithm": "semantic-v2",
  "analysisProjection": "实际审查时 analysis_projection.project(doc).projection 对象，不填此占位字符串",
  "analysisSha256": "实际分析摘要",
  "reviews": [{
    "reviewer": "真实审查者标识",
    "instanceId": "真实实例或人工身份标识",
    "role": "author",
    "conclusion": "ready",
    "basis": "实际核对了哪些原始来源、关键算式、反证与决策边界",
    "coverage": {"claimRefs": [], "issueRefs": [], "optionRefs": [], "slideRefs": []}
  }],
  "issues": []
}
```

role 为 author / independent，必要时分别登记。conclusion 为 ready / conditional / revise；revise 不允许进入正式生产。conditional 须加非空 `limitationClaimRefs`，指向已采纳主张。问题记录 `{description,severity:minor|major|blocking,status:open|resolved,resolution}`；解决项须解释如何解决。coverage 须覆盖实际采纳依赖，不能只看摘要页。

## 签署与绑定步骤

先完成综合校验。以下命令在技能根目录运行，参数指向任务文件；摘要只供实际审查者核对当前版本，不代表自动审查通过。

```sh
node scripts/deck_blueprint.cjs /任务/deck-blueprint.json --task /任务/task.json --stage synthesis
node -e 'const fs=require("node:fs"),c=require("./scripts/analysis_contract.cjs");console.log(c.digest(JSON.parse(fs.readFileSync(process.argv[1],"utf8")),JSON.parse(fs.readFileSync(process.argv[2],"utf8"))))' /任务/deck-blueprint.json /任务/task.json
```

审查者实际检查原始输入、算式、反证及结论边界后，手写 `/任务/analysis-review.json`：把上一步摘要填入 `analysisSha256`，按已检查的 ID 填 `coverage`，记录身份、依据和问题。simple 且非重大任务至少有真实作者记录；complex 或重大任务再加一条来自不同实例的 `independent` 记录。上方 JSON 仅说明字段，不能原样当成审查结论。

计算**已完成记录文件的字节摘要**，将结果写入 `/任务/task.json` 的 `analysisReview.sha256`；`record` 填相对 task 的路径。修改审查记录后须重新计算。

```sh
node -e 'const fs=require("node:fs"),crypto=require("node:crypto");console.log(crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"))' /任务/analysis-review.json
```

task 中的绑定形如 `"analysisReview":{"record":"analysis-review.json","sha256":"上一步得到的64位摘要"}`。然后运行 `deck_blueprint.cjs ... --ready` 和 `compile_blueprint.cjs ... --task /任务/task.json`；门禁会重算分析摘要、文件摘要和角色覆盖。审查尚未完成时，两个命令均显式加 `--preview`，产物只能称预览。

运行时核对：分析摘要、附件文件摘要、必要角色及实例不重叠、覆盖范围、问题处置。字段不能证明审查真实发生；主笔必须保留实际审查过程与返回记录。

## 变更与复用

semantic-v2 分析摘要覆盖 analysis、claims、sources、artifacts 的身份/摘要/血缘，以及所有页面标题、proves、aside、exhibit 和其他非排版字段。仅排除合同明确的纯排版字段、审查记录本身及本地 artifact 路径，避免循环；未分离样式的 custom 展品整体参与。原始输入变动，即便显示舍入后数字相同也失效；应更新 artifact sha256、重算并重新审查。远程 URL 不会由校验器自动刷新，时效核验需真正重新访问。

只有投影不变的纯布局变化可以保留前置分析审查；标题、侧栏、展品或页面结论变化须重新核对前置投影与最终成品。更换已采纳主张、模型、假设或来源后，深看受影响部分并重新做全局综合判断。旧分析通过不能自动继承到新摘要。

新稿 schema3 配 task3，前置 analysis-review2 保存完整可审投影且各角色覆盖全部 slideRefs；最终 review5 绑定 `analysisAlgorithm` 与 `analysisSha256`。旧稿 task2/analysis-review1/review4 和 task1/review3 保留原流程。`prepare_review_reuse` 只生成 incomplete 草稿，新分析摘要须实际确认后填写，不自动通过。

内部 `snapshot_review` 会保存复核需要的分析审查和已登记附件，保持相对路径。它是内部档案，可能包含敏感经营材料。对外交付仍默认只有 HTML/PDF，不自动附带内部原始数据。`export_analysis_views.cjs` 生成可读派生视图，也不复制原始附件。
