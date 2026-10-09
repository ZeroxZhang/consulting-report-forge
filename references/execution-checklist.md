# 强制执行清单与恢复协议（execution-plan-2）

## 1. 必须执行的生命周期

所有新报告（editorial / analytical / exploratory、长短报告、纯定性材料）统一从 `report.cjs init` 开始；用 `--work-mode editorial|analytical|exploratory` 选择已确定的模式，默认 analytical。初始化生成 task3、`workflow: "execution-plan-2"` 与独立 `execution-plan.json`，task 仅绑定稳定的 `id/record`。已有历史合同继续按旧版本核验；没有工作流的旧 task3 可显式 `adopt` 到新目录。不要复制旧 task 来跳过新任务的工作流。

需求的目标、范围、交付形式、约束和大致路线足以确定下一步时，**必须激活清单，随后才能实质研究、委派或制作**。不要求所有结论已知；未决事项写入 `intake.openQuestions`，后续分析缺口继续维护在蓝图 `analysis.gaps`。初始骨架可以早于需求明确建立，不能等整篇研究或成稿完成后补清单。

清单是唯一的跨阶段执行记录；宿主原生 todo 仅作可选镜像。主 Agent 每次开始、接收结果、完成阶段、发生返工、交付前都读取并更新它。上下文压缩前保存已知事实和未决项；压缩后先 `resume`，核对根任务、固定要求、待接收结果、失效证据、未知运行状态与 readyQueue，再继续工作。不能只依赖对话摘要。

## 2. 不可豁免的固定约束

- `chart-diversity`：**图表多样性：必须尽可能多地使用不同类型的图表。**
- `layout-diversity`：**版式布局多样性：必须尽可能多地采用不同的版式来组织每一页的内容。**
- `module-fill`：**模块填充：必须逐一检查正文每页的每个模块及每一栏，尤其是文字模块；没有明确设计功能的大块留白必须修复，裁切和溢出必须消除。**

三项始终独立显示，禁止删除、取消、跳过、标记“不适用”或合并进其他项后隐藏。多样性要求主动探索合适的变化机会；“已经清楚”“保持统一”“现成模板方便”不足以结束探索。适配、证据真实和阅读质量限定选择边界，不构成免检理由。无需固定图型/版式种数，不为凑数造数据、堆图、改颜色冒充变化。模块填充按 [模块填充协议](module-fill.md) 检查上下、左右空白及裁切；预留空白必须有位置、功能与依据，不能把放大字距、拉伸背景或重复内容当作修复。

三个检查点均须分别处理这三项：

1. **规划**：完成 `chart-plan`、`layout-plan`、`module-fill-plan`。根据每页要证明的关系考虑不同图型、空间组织和阅读路径；按模块与各栏的真实内容量核对容量、弹性元素、固定锚点和预留空白。权威选型继续写在 blueprint 的 `visual.selection`、`repetitionReason`、`layoutReason` 等既有字段；完成观察记录引用对应页与蓝图文件，说明候选与取舍，不建立第二套图型库存。
2. **代表页**：实际查看图像/PDF，记录是否读得出预期关系、布局是否形成有意义的变化；逐模块与各栏检查内容分布，尤其关注父容器被拉满、文字却只占顶部的情形。代表页观察须覆盖三个 requirementRefs。不能仅以 QA 成功或生成 HTML 当作已看图。
3. **最终整册**：查看当前 HTML 与实际 PDF 每一页；在 `qualityChecks` 中分别填写三项记录。多样性记录实际观察、替代方案、保留重复的原因及证据 ID；`module-fill` 按当前正文模块和各栏逐区域记录检查、缺陷处置及复检，不能仅给每页一句 PASS。自动枚举不保证识别全部未标记子栏，审查者必须对照画面补齐范围。复杂任务 **或** `majorConclusion: true`（即使 simple）均须作者与独立实例分别审查。

程序检查约束存在、记录身份、范围和当前文件版本；是否“尽可能多”、空白是否有用途由真实阅读判断，不能声称数量统计、填充率或探针未报警自动证明视觉质量。历史 `execution-plan-1` 保留原两项固定约束及任务定义；不向历史计划、审查或快照补写新通过记录。

## 3. 状态、更新与证据

每次更新用独立请求 JSON：`operationId` 为唯一操作 ID，`expectedRevision` 来自刚读取的计划。相同请求重试幂等；相同 ID 携带不同内容或过期 revision 都拒绝。成功更新增加 revision，并保留旧版快照。写操作使用共同任务锁；不要直接手改 JSON 来绕过状态转换。

```bash
node scripts/report.cjs init /任务/新报告
node scripts/report.cjs resume /任务/新报告/task.json
node scripts/report.cjs plan-update /任务/新报告/task.json --request /任务/activate.json
```

激活请求示例（按真实需求填写，不照抄内容）：

```json
{
  "operationId": "intake-20261008-01",
  "expectedRevision": 0,
  "ops": [{
    "action": "activate",
    "intake": {
      "goal": "这份报告要帮助读者回答的问题",
      "scope": "对象、期间、材料与不处理的边界",
      "deliverables": "自包含 HTML 与同版 PDF",
      "constraints": "用户指定的内容、品牌，以及图表多样性、版式多样性、正文模块填充三项固定要求",
      "approach": "拟采取的分析路线与报告组织方法",
      "nextStep": "接下来可独立完成的具体工作",
      "openQuestions": []
    }
  }]
}
```

固定任务覆盖分析、三项规划、分析审查（适用模式）、代表页、制作、验收、最终审查、三项固定要求的全册审查、打包、归档、交付。可用 `add` 增补研究/页面/返工任务，须写 `id/title/phase/criterion/completionCriteria/dependsOn/requirementRefs`；`criterion` 为 `files/planning/visual/production/delivery`。输入材料路径写 `inputRefs`（相对计划目录），页范围写 `pageRefs`。新增用户要求用 `requirement`，写 `id/text/sourceQuote`，再分配到具体任务；未关联的要求会阻止打包。

新增任务示例（注意 `item` 嵌套）：

```json
{"operationId":"add-research-01","expectedRevision":1,"ops":[{"action":"add","id":"research-pricing","item":{"title":"核实定价口径","phase":"analysis","criterion":"files","completionCriteria":"记录可核查来源、期间与限制","dependsOn":[],"requirementRefs":[],"inputRefs":["source.csv"]}}]}
```

依次发送 `{"action":"delegate","id":"research-pricing","owner":"研究实例名"}`、`{"action":"submit","id":"research-pricing","attemptId":"当前attempt的id","evidence":"observation.json"}`、`{"action":"accept","id":"research-pricing","reviewer":"主笔身份","basis":"核实结果及范围的具体依据"}`；每轮都包在带当前 revision 与独立 operationId 的请求中。处于运行、提交、完成、阻塞或取消状态时，先 `reopen` 并说明原因，不能直接覆盖旧 attempt。

人工任务状态：`pending → in_progress → submitted → done`；另有 `blocked/cancelled`。`start` 或 `delegate` 创建唯一 attempt；`submit` 必须带当前 `attemptId` 与 `evidence` 路径；`accept` 必须由主 Agent 核对文件后写 `reviewer/basis`。子 Agent 的“完成”仅是提交，不能替代接收。

`block/reopen/cancel` 须记录 reason。固定任务与要求关联任务不能取消。`scope` 记录范围变化原因并增加 scopeRevision；`decision` 留下具体决策。重新启动、范围变化或输入变化后，旧 attempt 结果不能作为新任务完成凭据。

完成观察 JSON 至少包括：

```json
{
  "kind": "planning",
  "reviewer": "实际检查者身份",
  "basis": "基于实际文件的具体判断",
  "requirementRefs": ["chart-diversity"],
  "alternatives": [{"pageId": "page-a", "considered": "考虑了什么其他合适表达", "decision": "采用或保留的具体原因，指向蓝图选型"}],
  "files": [{"record": "deck-blueprint.json", "sha256": "实际文件的SHA256"}]
}
```

文件路径相对观察文件；提交的观察路径相对计划。`visual` 须含实际图像/PDF，并用 `audit: {record,sha256}` 绑定本轮 smoke/iteration/acceptance 记录；图像须存在于该 audit，且其 HTML 必须是当前装配产物；`production` 须含成稿 HTML；`delivery` 须额外有实际 `destination/deliveredAt`，如未实际交付不能填 done。观察文件变更或任一输入/附件变更会要求重新核实。

`module-fill-plan` 的 planning 观察另含 `modulePlans`，逐正文页提供实际模块/栏规划，不用单句“填充检查通过”代替内容安排：

```json
{
  "modulePlans": [{
    "pageId": "page-a",
    "regions": [{
      "id": "right-text/column-2",
      "content": "该栏的真实材料、信息组与预计内容量",
      "layout": "采用的组织方式及其与内容宽高形状的适配依据",
      "whitespace": "具体预留位置、阅读功能及依据；无预留则明确写无预留"
    }]
  }]
}
```

代表页的 visual 观察另含 `moduleObservations: [{pageId, regionId, observed, decision}]`；`regionId` 对应当前 audit 的 `moduleFill` 区域标识，覆盖所看代表页已枚举的全部区域，并补充实际发现的遗漏模块/栏。这里记录真实所见与修复/保留判断，最终实际 PDF 的检查仍须在最终审查中完成。

来源任务（分析、分析审查、工程验收、最终审查、打包等）没有独立可写 state。蓝图 workItems/gaps 在状态输出中直接显示，不能用修改清单伪造它们的完成。人工 done 与实际有效状态分开：文件、依赖或输入变动显示 `needs_revalidation`。恢复时未核实的运行实例显示 `status_unknown`，不声称仍在运行或已失败。

当前实现对蓝图与公共分析输入采用保守失效：局部变更可能要求重新核实更多任务。进度更新本身不影响分析/视觉摘要；只有真实输入变化才触发重新核实。

## 4. 委派与接收

主 Agent 是共享计划/蓝图的唯一写者。委派前先登记任务与 attempt，然后把下面信息交给子 Agent：plan ID、scopeRevision、任务 ID、attempt ID、输入摘要、输入文件、页/结论范围、固定 requirementRefs、明确输出文件与完成标准。子 Agent 写独立输出和观察记录，不直接修改共享清单。

主 Agent 收到结果后比对 attempt、scopeRevision、输入摘要与当前证据。迟到结果可留作历史参考，但不能覆盖新一轮结果；重开任务生成新 attempt。子 Agent 失联时先核实宿主状态，无法核实就保留未知、继续无依赖工作。工具不会自动查询或假装恢复宿主 Agent。

## 5. 制作、验收与产物定位

继续用统一入口执行 compile / assemble / qa / aggregate / package。每次成功操作将准确的派生 task、HTML、audit、聚合 review 记录进 `productionRefs`。原始 task 无需随每次运行重写 pages 路径。失败运行保留现场但不替换成功索引；smoke/iteration 不覆盖正式验收。不得扫描“最新文件”推断当前版本。

门禁位于真实生产边界：正式 ready/compile 需要已激活计划与三项规划，acceptance 需要代表页及制作证据，package 需要全部前置任务和三项当前整册审查。直接调用相关 CLI 仍检查门禁。preview/smoke 用于取证和迭代，不能作为正式交付完成。历史工作流按其原任务集检查门禁。

新 workflow 的 acceptance 同步执行 `check_units`；其结果绑定当前 HTML。`review-pack` 按工作流生成固定要求的未审草稿，不填通过；`aggregate` 保留并验证 qualityChecks。`execution-plan-2` 的模块填充审查结合 screen/print 区域记录与当前 HTML/PDF 证据，度量帮助定位，最终判断仍须真实查看。历史 review-snapshot 的检查不依赖后来修改的 live plan。

## 6. 打包、中断与归档

打包先冻结 Pn，再生成 HTML/PDF，最后写独立收据，绑定 Pn、验收、审查和交付文件。Pn+1 仅引用收据，避免循环摘要。输出已成功但更新中断时，核对收据后执行：

```bash
node scripts/report.cjs reconcile-package /任务/task.json --receipt /任务/.forge/receipts/package-receipt-ID.json
node scripts/report.cjs archive /任务/task.json
```

完整 archive 在打包之后生成，独立 `execution-bundle` 保存计划、委派记录、工作文件和可迁移的 review-snapshot。完成之前也可做 checkpoint：

```bash
node scripts/report.cjs checkpoint /任务/task.json --output /备份/checkpoint-01
node scripts/report.cjs restore-bundle /备份/checkpoint-01 --output /任务/恢复副本
node scripts/report.cjs resume /任务/恢复副本/task.json
```

恢复不会修改原归档：创建新工作目录、保留 plan ID 与历史声明、重建本地引用、增加 scopeRevision。生产索引清空并明确要求重新编译/取证；已完成的历史审查仍从 `reviewed` 快照独立核验。恢复不是替用户补签过去没有的判断。材料缺失时保持未完成。

损坏的计划可通过 `plan-restore --history` 从明确指定的历史文件恢复同一身份，保留损坏文件；不要自动创建新 ID。进程中断留下锁时先确认进程已退出，使用 `recover-lock`；不接受跨主机锁的自动清除。

## 7. 兼容与范围

旧 task1/2/3、旧四槽 policyVersions、旧审查和快照语义不变。新工作流是 task3 的可选第五槽；`DEFAULT_POLICIES` 不变，新建入口额外启用 workflow。旧 runtime 不认识第五槽会明确拒绝，不能静默跳过。

`execution-plan-1` 的双约束定义冻结；`execution-plan-2` 新增 `module-fill-plan` 与 `module-fill`。不要直接修改旧任务的策略字符串来升级，否则会破坏原计划身份和证据链。新要求用于新建任务，历史记录按其声明版本核验。

已绑定 `execution-plan-1` 的旧任务若要采用新流程，在新目录重新 `init` 并显式重新规划，保留旧档案；不复用旧完成状态，不自动迁移或补签。`adopt` 只接入尚无执行计划的旧 task3。

旧 task3 显式接入：`report.cjs adopt old-task.json --output 新目录`。旧 task1/2 先走既有严格合同迁移。接入只建立草稿，不把历史进度补成已完成。视觉候选策略仍按原显式选择，不随工作流升级切换。
