> 此为修复前的独立审查原始记录。两项 Important 已通过失败反例→修复→完整测试关闭；最新结论见 [验证记录](business-analysis-validation.md)。跨目录导入路径项暂缓，文档明确同目录用法。

# 商业分析升级：独立代码审查与行为评分

审查日期：2026-09-23。审查范围：当前工作区 diff、新增 analysis 合同/导入/迁移/导出/测试、审查与快照复用链。已读 AGENTS.md、升级设计和实施计划。未修改仓库、未启动浏览器、未生成或签署正式业务/视觉审查记录。

## 总体结论

未发现 Critical。发现 **2 个 Important（P1）问题**，均来自外部结果校验只放在导入入口、未成为后续分析合同不变量；应整体修复再验收。另有 1 个 Minor（P2）路径问题。

本次实际运行六组新增 analysis 测试和最新 `npm test`（含原有 14 段及新增 6 组），全部通过；`git diff --check` 通过。测试通过没有覆盖下面的反例。

独立复现脚本：`node /tmp/forge-review-probe.cjs`。脚本只在系统临时目录写合成夹具，使用当前仓库模块，不修改仓库。

## Important 1：导入值与输出文件失去持续一致性校验

- 位置：`scripts/analysis_contract.cjs:34–41`、`:107–108`；写入点 `scripts/import_analysis_results.cjs:20–24`。
- 触发：正常导入输出 `{ "margin": 2 }`。导入后的 metric 同时保留 `external:{artifactRef:'model-result',pointer:'/margin'}` 与 `value:2`。随后把蓝图 value 误改为 999，输出文件保持 2；或者将输出文件更新为 3、更新该 artifact 的 SHA，但忘记重新导入（value 仍为 2）。
- 实际：两种情况下 `analysis.validate(...,{stage:'ready',preview:true})` 都返回 `[]`；编译分别输出 999 和 2。没有任何数值与登记输出不符的错误。显式预览只应豁免前置审查，不能豁免此类计算一致性。
- 最小复现核心：

```js
const n = importResults(doc, resultMap, {baseDir, task});
n.slides[1].claimRefs.push('imported-margin');
n.slides[1].metricRefs.push('margin');
n.claims.at(-1).metrics[0].value = 999; // 实际 output.json 的 /margin 仍为 2
analysis.validate(n, {task, baseDir, stage:'ready', preview:true}); // []
analysis.compile(n, {task, baseDir, preview:true})
  .pages[0].content.metrics.find(m => m.id === 'margin').value; // 999
```

- 影响：违反设计 §8.1 明确承诺的“导入值与登记结果不符可可靠阻断”；产生看似有附件血缘、实际与模型结果不一致的报告。更新分析审查摘要也不能检测该不一致，只会批准新错误值。
- 建议：把 external 结构、输出 artifact 引用、JSON pointer、有限值和原始未舍入值相等检查集中到 canonical analysis 校验；在 synthesis/ready 和最终审查所调用的同一条链上执行。实际值与文件需双向核对，不依赖作者重新调用 import。

## Important 2：复用已登记输出可跳过计算血缘校验

- 位置：`scripts/import_analysis_results.cjs:16`、`:22–23`；缺少兜底的是 `scripts/analysis_contract.cjs:80–85`。
- 触发：蓝图已登记一个真实 output artifact，但 `dependsOn:[]` 且无运行记录。第二次导入只提供新 claim，`result.artifacts=[]`，metric.external 指向这个已有 output。
- 实际：导入成功，读出数值 2。第 16 行只遍历本次新增的 result.artifacts，因此从已有 output 映射时从未核查输入与代码/模型血缘；analysis.validate 只检查引用存在和无环，并未检查输出的必要祖先。
- 最小复现核心：

```js
doc.artifacts = [{id:'model-result',kind:'output',path:'output.json',
  sha256:fileHash(outputFile),dependsOn:[]}];
const result = {run:{id:'run-1',command:'node model.cjs',
  executedAt:'2026-09-23T00:00:00Z'}, artifacts:[], claims:[externalClaim]};
importResults(doc,result,{baseDir,task}); // 成功；既无 input 也无 code/model 祖先
```

- 影响：用户把输出先登记、再映射指标这一正常分步流程能绕过“输出必须包含实际输入和代码/模型”的约束；已有但不完整的输出可以进入被采纳主张，无法复算。
- 建议：对所有本次被 external 引用的 output（包括已登记对象）校验血缘，在分析合同中复用同一校验函数；不要仅校验新增 artifact 数组。与 Important 1 统一设计，但保留两类独立反例。

## Minor：导入到不同目录时未重定位附件路径

- 位置：`scripts/import_analysis_results.cjs:30`。
- `import_analysis_results.cjs /tmp/task/blueprint.json /tmp/task/result-map.json /tmp/task/sub/new-blueprint.json /tmp/task/task.json` 会报告 imported，但仍原样保存 input.csv/model.cjs/output.json。按新蓝图目录运行 synthesis 后三项均“分析附件缺失”。
- 建议：输出前把 artifact.path 从输入蓝图目录重定位到输出蓝图目录，或明确拒绝跨目录输出。现有同目录示例可正常使用，因此未列为 Important。

## 已核对而未发现新阻断问题的部分

- 公式间接依赖 pending：现有反例会拒绝；未采用 pending 可以保留。
- waiting_user、null 回答、unavailable：缺口与所采纳依赖相连时 synthesis/ready 阻断；未相连分支可继续；resolved 必须有实际答案/证据定位字段。代码不能判断定位是否真实、不能证明是否发出卡片，文档也明确该边界。
- 范围改变：文档明确需要用户确认；当前合同没有状态历史，因此不能机器证明作者是否篡改 affectedRefs/blockingScope。未把这项已声明的语义/执行边界冒充已实现的自动防护。
- research 无页面/无主张合法；synthesis 可无页面；ready 需要完整页面。额外实际探针验证 synthesis 无 slides 为 PASS。
- task2 明确模式，schema3 与 task1 不兼容；编辑模式不强制前置分析审查。额外实际探针验证 editorial ready 无分析审查为 PASS。
- preview 带编译与内嵌合同标记，正式审查拒绝；手改 pages 与 blueprint 编译不一致会失败；仅换版本号仍留新字段会失败。
- review4 重新读取真实 blueprint/pages/analysisReview，并沿 verifyPlan 核验。auditErrors 核对真实 HTML/PDF/截图/附件 hash。
- snapshot/reuse 新格式夹具能在原工作目录删除后从快照核验；复用草稿保持 incomplete，analysisSha256 不自动填通过，视觉依赖与分析审查版本分开。
- 迁移保持输入不变，按页面前缀隔离历史指标，拒绝覆盖；export 由 canonical claims 派生，不复制附件。

## 14 个行为案例独立评分

依据 `evals/business-analysis/reviewer-rubric.md`、原始 `cases.json`、`/tmp/forge-forward-eval/results.md`、`results.json`、实际计算脚本 `run.py`。评分无自创平均分：以每例是否满足给定观察点标记。

| 案例 | 结果 | 核对依据与范围 |
|---|---|---|
| profit | 部分通过，Minor 遗漏 | 收入 1000→1080、利润 200→80、贡献单位 4→2.5、利润桥 +80−120−60−20=−120 全部正确，明确非因果。未显式给 rubric 要求的总贡献 400→300 和收入桥 −100/+180；不构成严重分析错误，但不能称全部观察点通过。 |
| market | 通过 | 适格年度支出 1000 万、容量上限 40 万，8000 万口径不同不混用；拒绝直接进入/预测 SOM。 |
| growth | 通过 | CAC 100/50；90 日留存客户成本 166.67/250；不补毛利、不虚构 LTV、不仅凭低 CAC 加码。 |
| operations | 通过 | 10→9 天、缩短 10%，把等待与返工不变作为条件，未把等待时间直接称为可消除瓶颈。 |
| portfolio | 通过 | 140 超预算 40 且唯一团队冲突；无部分投资收益时不线性插值；保留目标、现金口径与时序未知。 |
| organization | 通过 | 区分便利延误样本与总体，区分案例数与耗时，核查信息准备而非直接砍层级。 |
| ai | 通过 | 净省 2 分钟、333.33 小时、容量 4 万；已支持人工现金节约 0、工具现金流 −6 万，不把工时等同现金。 |
| diligence | 通过 | 剔一次性后 90 对 100 降 10%；180 是预测，不冒充已审计利润、不输出缺依据估值。 |
| qualitative | 通过 | 限定 4/6 便利受访者；预算/相对自建价格/交付/适配分别编码，保留反例，不外推总体。 |
| editorial | 通过 | 仅时间顺序重排，原值、合成身份与利润限制保留，没有扩大范围。 |
| public-gap | 内容通过；浏览执行证据需区分 | 五力用途与限制正确且给出 HBS 原始链接；执行者记录实际 web.open 和 turn5view0。保存材料没有原始工具响应，当前审查可核对其记录但不能独立重放证明原调用；不将我再访问网页冒充执行者行为证据。 |
| user-wait | 模拟通过 | 正确选择题设 async 能力；null 保持 waiting_user；独立分支继续；无法提供改 unavailable，原投放推荐仍未完成，缩范围须确认。未实际调用卡片、竞争正文未给，未实际完成竞争分析。 |
| fallback | 模拟通过 | 无工具用普通消息请求附件；null 不作答；模拟上传后算未折现 20 和每期 IRR≈13.07%，保留折现率/期间缺口。没有真实用户上传或原生附件流程。 |
| update | 规则演练通过 | 明确输入摘要变化使前置分析审查失效，重算及全局综合不可继承；视觉证据复用有条件。未给真实报告文件，因此没有实际执行重审链。 |

归纳口径：**13 例在各自声明范围内通过（public-gap 的工具记录边界见表），1 例部分通过；未发现严重业务推断失败。** 其中 user-wait/fallback 为模拟、update 为规则演练，不能写成“14 个真实端到端业务任务/原生交互全部通过”。也没有相同模型多轮旧新版本配对实验，不能据此量化能力提升或成本降低。

实际调用、原生卡片、上传、停住后恢复和真实报告更新未被该套结果全部覆盖。现有独立代码测试可支持合同状态判定，不能替代宿主交互验证。

这次不需要你做决定；建议作者先修复上述两个 Important 后交回复验。
