# 从问题到判断：统一分析流程

分析和探索任务必须读本文件，再读 [方法路由](analysis-methods.md) 中匹配的业务 playbook。编辑任务只做范围、证据身份与实质冲突检查。本文是执行协议；JSON 校验只检查登记内容，不能代替真正检索、提问或分析。

## 1. 建立问题合同

先读全部已提供材料。把读者要做的判断、期间、业务范围、基准、限制、成功标准写进 `analysis.brief`。`purpose` 为 diagnosis / decision / research；它与 task 的工作模式是两个维度。新 task3（及历史 task2）必须显式写 `workMode/complexity/majorConclusion`，拿不准风险用 complex。分析对象、指标与时间口径不清时先解决最可能改变方向的一项；已有答案不重复问。

新任务用 `templates/research-blueprint.json` 起草，可先没有页面、主张与答案。不要为通过检查填虚假结论。

## 2. 分解和优先级

在 `issues` 登记重要问题、父问题、优先级、工作引用和处置；用决策影响与不确定性决定先后。分类可做互斥/覆盖检查，因果网络不能强行拆成互斥树。每个 workItem 说明 method、rationale、issueRefs、inputClaimRefs、artifactRefs、outputClaimRefs 和状态。`issue.workItemRefs` 与 `workItem.issueRefs` 必须双向一致；已回答的父问题会采纳其子问题及子问题已登记的工作，开放子问题须进入 `openIssueRefs` 或明确收窄。少量可判问题不必造复杂树。

假设可选，保存在 `workItems[].hypotheses`；不要强制多条。状态 untested / supported / mixed / refuted / inconclusive。这个状态判断的是解释得到什么支持，不是来源核验状态。完成工作必须记录 `counterEvidence`：实际反证、竞争解释或仍未排除的未知。

## 3. 缺口触发与路由（每一阶段都执行）

材料读取、方法选择、计算、综合、前置审查、最终审查中发现会改变判断的缺口，立即登记 `analysis.gaps`。只登记重要缺口，普通工具瞬时重试无需建台账。

| 缺口 | route | 下一步 |
|---|---|---|
| 公开市场基准、竞争事实、口径、来源冲突 | research | 在用户范围及工具能力内自动启动外部检索，不等待阶段审批；看原始来源，记录实际定位和时间，再更新主张 |
| 内部经营数据、未公开预算、业务目标、用户偏好或取舍 | user | 调用当前宿主实际可用的输入工具，或者明确请求附件 |
| 找不到同口径证据、用户无法提供、超出授权范围 | bounded | 说明影响，缩小结论或保留未知；不得默填零或行业平均。改变任务目标须取得用户同意 |

阶段 research 可以保留缺口；synthesis/ready 检查已采纳依赖闭包。外部检索不能取代内部目标询问；也不能把检索失败当成已解决。

### 用户询问与暂停恢复：必须执行的规则

1. 先区分是否影响整个任务、某一分支、或仅非关键说明，写 `blockingScope: task / branch / none`，用 `affectedRefs` 关联具体 issue/workItem/claim/metric/option/artifact 的 ID。
2. **选真实可调用且当前模式允许的输入能力**。Codex 可用 `request_user_input_async` 时，发出简短卡片，给可区分的选项；仅在 Plan 模式允许的工具不能在普通模式硬调用。其它宿主按工具实际定义用 `ask_question` 等，不杜撰通用 API 名称。
3. 需要上传 CSV/PDF 等文件时，不在只接收文字的卡片里假装支持上传；普通消息清楚写所需文件与字段。没有可用卡片工具时，用普通消息提问并等待，不能因此跳过必要询问。
4. 工具真正发出或消息真正发送后，保存 `request:{channel,locator}`，状态 `waiting_user`。回答未到时，暂停依赖这项信息的计算、结论和交付；宿主允许时继续无依赖工作。同步工具会挂起当前调用；异步工具可继续独立分支。整任务阻塞时保持待答，不编造答案。
5. 无回复、空工具返回、超时、默认选项未提交，都不等于答案或授权。保持 waiting_user，不重复弹同一问题、不自动选择最方便的选项。可以明确列出仍待用户输入的部分。
6. 收到真实回复后，记录 `resolution:{basis,locator,answerLocator}` 并置 resolved。检查回复是否真正解决原问题；只回答一半就保留剩余缺口。更新受影响模型、主张和综合，再重新编译；分析变更使旧分析审查失效。
7. 用户说不知道、没有数据：置 unavailable，写 basis；移除无依据的依赖或改写成有边界主张。只改状态不会自动放行原依赖。分支结论仍依赖缺失数据时，门禁继续阻止。

**例子**：估值缺内部毛利，先询问，暂停估值推荐；同时可检索竞争结构。用户没有数据时可交付“已知竞争条件与估值待补项”，不能给虚构估值。范围改变需要用户确认。

状态集合：open / researching / waiting_user / resolved / unavailable。研究解决也需要 `resolution.basis/locator`；用户解决额外需要 answerLocator。工具是否真的被调用须看真实调用/对话记录，脚本不能认证这件事。

## 4. 执行方法与裁决

按 playbook 获取同粒度输入，检查完整性、单位、期间、分母、重复与异常。模型只使用可追溯输入。简单声明公式直接进入全局 metrics；复杂计算使用脚本/工作表，登记 inputs/code/model/output 的文件、摘要和血缘，按结果映射导入。每个事实、估计、预测、假设、建议沿用证据身份字段。

方法产出在 claims 中维护，workItems 只引用 outputClaimRefs。已采纳工作的所有登记产出都属于其核实范围；未采纳工作可保留待核实主张。禁止另存一套可手工修改的“综合答案数值”。未完成的工作保持 planned/running，不能只因为出现数字就置 complete。

## 5. 方案、综合与前置审查

- diagnosis：解释已观察变化，明确因果未识别的部分；不强造行动投资模型。
- decision：比较现状基线和真实可行备选，在 options 中引用收益/成本/现金/风险主张与指标，写 constraints/dependencies/validation；synthesis.optionRefs 指向实际比较的方案。
- research：允许有限发现与明确未知；把重要未决问题放 openIssueRefs。不能只有搜索清单而没有已知与未知的综合。

`analysis.synthesis.answerClaimRefs` 指向核心答案，basis 写采纳/收窄理由。schema3 不手填 governingThought，它从这些主张派生。high 优先级问题必须 answered、bounded、out_of_scope，或进入 openIssueRefs；缩小/排除须有 basis。

先运行 synthesis 校验，再做 [前置分析审查](analysis-review.md)。审查不是用户审批。复杂或重大分析必须实际独立实例复核；完成前可显式预览，但不得正式交付。分析审查结束后再组织标题链和页面。

## 6. 三道门与返回路径

```sh
node scripts/deck_blueprint.cjs /任务/deck-blueprint.json --task /任务/task.json --stage research
node scripts/deck_blueprint.cjs /任务/deck-blueprint.json --task /任务/task.json --stage synthesis
node scripts/deck_blueprint.cjs /任务/deck-blueprint.json --task /任务/task.json --ready
node scripts/compile_blueprint.cjs /任务/deck-blueprint.json /任务/pages.json --task /任务/task.json
```

research 不要求页面；synthesis 不要求排版；ready 要求完整页面合同及必要分析审查。`--preview` 只豁免前置审查，不豁免已采纳未核实主张、阻塞缺口、算术、布局、来源和可见绑定。

最终看图发现表达失真就修页面；发现推理失真就回到工作/主张/综合；出现新缺口按第 3 节再次取证或询问，不要求无关研究全部重做。需要实施交接时，写真实责任角色、依赖、基准、验证/停止条件；未确认的预算和日期写待定。
