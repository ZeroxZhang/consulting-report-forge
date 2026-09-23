import json, math, hashlib, tempfile
from pathlib import Path
from datetime import datetime, timezone
repo=Path(__file__).resolve().parents[3]
output_dir=Path(tempfile.gettempdir())/'forge-forward-eval'
output_dir.mkdir(parents=True,exist_ok=True)
source=repo/'evals/business-analysis/cases.json'
cases=json.loads(source.read_text())['cases']
byid={c['id']:c for c in cases}
out=[]
def add(id, conclusion, calculations, boundaries, actions, unfinished, **extra):
    out.append(dict(id=id, request=byid[id]['request'], inputs=byid[id]['inputs'], conclusion=conclusion, calculations=calculations, boundaries=boundaries, actionSequence=actions, unfinished=unfinished, actualTools=['exec_command: Python 标准库计算和写结果'], **extra))
i=byid['profit']['inputs']; r0=i['q0']*i['p0']; r1=i['q1']*i['p1']; c0=i['p0']-i['variableUnit0']; c1=i['p1']-i['variableUnit1']; p0=i['q0']*c0-i['fixed0']; p1=i['q1']*c1-i['fixed1']; bridge=[(i['q1']-i['q0'])*c0,i['q1']*(i['p1']-i['p0']),-i['q1']*(i['variableUnit1']-i['variableUnit0']),-(i['fixed1']-i['fixed0'])]; assert p0+sum(bridge)==p1
add('profit','收入增长8%，利润从200降至80，下降60%；单位贡献从4降至2.5。新增销量贡献不足以抵消价格、单位变动成本及固定成本变化。',[
{'formula':'R=q×p','q0':r0,'q1':r1,'growth':r1/r0-1}, {'formula':'利润=q×(p-v)-F','q0':p0,'q1':p1,'delta':p1-p0}, {'formula':'量→价→单位变动成本→固定成本顺序桥：200+20×4+120×(-1)-120×0.5-20=80','components':bridge,'residual':p1-p0-sum(bridge)}, {'formula':'当前静态盈亏平衡量=220/(9-6.5)','value':220/c1}],
['合成输入，同一单品、同币种和完整期间；金额单位未指定。','分解顺序影响交叉项归属；算术贡献不识别降价导致销量增长等因果。','88只是在当前价格、单位成本、固定成本保持不变时的静态门槛，不证明可扩张性。'],
['核对口径并计算收入、单位贡献和利润。','完成闭合桥；价格与成本变化解释80+(-120)+(-60)+(-20)=-120。','优先核对折扣/净价明细和采购或耗用成本，再比较保价、折扣收紧、成本改善方案；补需求弹性及质量影响后决定动作。'],['没有实际经营驱动明细，不能下价格或成本变化的根因结论。'])
i=byid['market']['inputs']; full=i['allAccounts']*i['annualSpend']; eligible=i['eligibleAccounts']*i['annualSpend']; cap=i['teamAnnualCapacity']*i['annualSpend']
add('market','按给定年支出机械估算，适格客户对应年度支出1000万；团队年服务80户对应收入容量上限40万。现有证据不能支持进入决定。',[
{'formula':'全部主体×给定年支出=10000×5000','value':full,'identity':'宽口径机械规模，不能默认全部主体都适用'}, {'formula':'适格主体×给定年支出=2000×5000','value':eligible,'identity':'适格池支出估计，非已签收入'}, {'formula':'80×5000','value':cap,'identity':'在全部容量售出且每户支出均可被本产品获得时的容量上限'}],
['外部8000万包含硬件、属于全部IT支出，与本软件细分不一致，不能平均、相加或据此验证细分规模。','80户不是转化预测；支出不必等于本产品净收入。','年转化、获客/服务成本、进入成本与爬坡未知。'],
['分开全体主体、适格客户及团队交付容量。','记录外部TAM口径冲突，当前题范围仅用输入，因此不给外部规模核验通过。','比较暂不进入、有限试点、全面进入：全面进入缺经济和资源支持；有限试点仍需成本与目标授权。','登记内部转化和进入成本缺口，先请求历史漏斗、可避免成本、启动现金和成功标准，暂停进入推荐。'],['进入方向、试点预算及可获得市场未确定。'])
i=byid['growth']['inputs']; calc=[]
for name in ['A','B']:
    c=i[name]; calc.append({'channel':name,'CAC_formula':'spend/new','CAC':c['spend']/c['new'],'retention_formula':'retained90d/new','retention90d':c['retained90d']/c['new'],'retainedCustomerCost_formula':'spend/retained90d','retainedCustomerCost':c['spend']/c['retained90d']})
add('growth','B的拉新成本较低，但90日留存率仅20%，每位90日留存客户获客支出250，高于A的约166.67；不能仅凭新增数翻倍加码B。',calc,
['同一完整90天窗口支持同龄描述比较。','缺贡献毛利、消费强度及后续留存，不算LTV、回本或盈利。','客户构成和渠道归因可能不同，不能断定渠道本身导致低留存；留存客户成本不是利润指标。'],
['计算两渠道CAC、留存率和留存客户获客支出。','保留现状与小范围验证两种方案，暂停大规模增加B预算的推荐。','请求同龄客户贡献、客群构成、退货与服务成本；如可行，用预先定义的增量贡献指标及留存护栏检验预算调整。'],['加码金额与渠道利润排序未确定。'])
i=byid['operations']['inputs']; saved=i['processingDays']*i['automationProcessingReduction']; new=i['cycleDays']-saved
add('operations','在等待与返工不变的顺序流程条件下，自动化使总周期从10天降至9天，仅缩短10%，不能据此承诺减半。',[
{'formula':'处理节省=2×50%','value':saved}, {'formula':'新周期=2×(1-50%)+7+1','value':new}, {'formula':'整体缩短=1/10','value':saved/i['cycleDays']}, {'formula':'目标5天尚需缩短=9-5','value':new-5}],
['固定顺序步骤允许相加；等待与返工固定是条件假设。','排队影响未知，可能放大或抵消处理改善；不能从7天等待直接断言唯一瓶颈。'],
['拆解处理、等待、返工并计算局部改善上限。','登记queueImpact缺口，索取工单事件时间、资源利用和到达波动。','优先检查等待的来源及排程，再以端到端周期与质量验证；自动化只作为可比较方案。'],['真实排队反馈和自动化投入回报未验证。'])
i=byid['portfolio']['inputs']
add('portfolio','预算100不足以同时全额投入A和B，两者还争用唯一团队。没有部分投资收益和目标权重，不能编造最优分配。',[
{'formula':'全额合投需80+60','value':140,'overBudget':40}, {'formula':'单投A剩余100-80','value':20,'standaloneCash':20}, {'formula':'单投B剩余100-60','value':40,'standaloneCash':18}, {'formula':'现金指标/投入（仅描述）','A':20/80,'B':18/60}],
['standaloneCash未给时间、风险及是否为净增量现金，25%和30%不应直接称年化投资回报。','不能把A20+B18相加为可实现组合现金；并行共用团队不可行。','A80+B20或A40+B60等部分分配没有收益函数，不可插值。'],
['列现状、只投A、只投B；合投标记资金和团队不可行。','如目标仅为同周期同风险的独立现金最大且现金口径成立，A20高于B18；如重视资本效率，B可能更优，但这些目标均未确认。','询问目标、现金定义及团队占用时间；顺序投资另需期间与可释放容量证据，不能自行视为可行。'],['预算分配推荐仍待目标与收益口径；未消耗预算不视为浪费。'])
i=byid['organization']['inputs']
add('organization','这8个被挑选的延误案例中，6个等待数据、2个等待经理。信息准备与交接应优先排查，尚无证据支持直接扁平化。',[
{'formula':'样本内等待数据=6/8','value':6/8}, {'formula':'样本内等待经理=2/8','value':2/8}],
['运营负责人选择的延误案例，有选择偏差；75%不是所有审批的总体占比。','计数不是耗时：2个经理等待可能比6个数据等待更长。','三个正式审批层级不证明层级导致慢；人员容量未知。'],
['按案例核对事件时间、所需数据、负责人及返工。','比较保持结构并改善数据准备、明确权限、授权试点等方案。','补完整期间含准时案例的样本，核实审批控制必要性和等待时长，再判断是否调整结构。'],['等待主因、总体耗时贡献及组织调整效果未识别。'])
i=byid['ai']['inputs']; mins=i['oldMinutes']-i['newMinutes']-i['newReviewMinutes']; hours=i['tasks']*mins/60; capacity=hours*i['hourlyCost']
add('ai','净节省约333.33小时，对应按给定小时成本折算的容量价值4万。没有人员或其他现金释放安排，已支持的人工现金节约为0；工具费新增6万，已知现金项净减少6万。',[
{'formula':'每任务净节省分钟=12-7-3','value':mins}, {'formula':'年度小时=10000×2/60','value':hours}, {'formula':'容量价值=333.333…×120','value':capacity}, {'formula':'已支持现金净收益=0-60000','value':-i['annualToolCost']}, {'formula':'容量折算减工具费（非现金ROI）=40000-60000','value':capacity-i['annualToolCost']}],
['不减员不自动等于所有现金节约为0，但本例没有加班、外包合同等减少证据，因此仅报告已支持项目。','新增收入能力使用未确认；不将潜在收入或工时价值计为已实现现金。','默认给定任务量均使用该流程，仍需检验采用、质量、纠错、集成、培训及维护。'],
['将新增复核耗时计入端到端工时。','分开容量价值和现金价值，列新增工具费。','询问可取消的加班/外包/招聘支出及容量去向；先试点测实际复核、异常和采用率，再决定规模化。'],['完整年度现金回报仍缺新增成本和可实现收益证据。'])
i=byid['diligence']['inputs']; b=i['baseReportedRevenue']-i['baseOneOff']; c=i['currentReportedRevenue']-i['currentOneOff']
add('diligence','报告收入增长20%，但剔除给定一次性收入后从100降至90，下降10%；不能仅凭表面增长提高估值。',[
{'formula':'报告增长=(120-100)/100','value':.2}, {'formula':'剔除一次性当前收入=120-30','value':c}, {'formula':'同口径变化=(90-100)/100','value':c/b-1}, {'formula':'收入桥=100-10+30','value':120}, {'formula':'卖方预测相对本期报告收入=180/120-1','value':.5,'identity':'卖方预测隐含增长，非实现结果'}],
['输入为合成卖方报告信息，未独立核实合同、收入确认和一次性分类。','90仅是按已识别一次性项目调整的收入，不直接认定为经常性收入或正常化利润。','回款、净债务、利润、交易条款未知；不输出单点企业/股权估值。'],
['核对报告收入与调整后收入两条桥。','将180标记卖方预测，拆其客户、续约、净价、交付与容量支持。','优先取合同/回款、客户留存及净债务和资本需求，再比较估值和条件交易。'],['提价估值的投资判断未支持，收入质量和现金转化待核实。'])
quotes=byid['qualitative']['inputs']['quotes']
add('qualitative','在6名便利访谈对象中，4名表达价格或预算相关顾虑；这提示继续区分相对价值、支付能力和交付问题，不能推出市场上三分之二客户嫌贵。',[
{'formula':'样本内价格/预算编码频次=4/6','value':4/6,'denominator':'6名便利访谈对象，每名一段引述；非市场比例'},
{'coding':[{'quoteIndex':1,'quote':quotes[0],'code':'价格负担/价值未明'},{'quoteIndex':2,'quote':quotes[1],'code':'相对自建成本'},{'quoteIndex':3,'quote':quotes[2],'code':'价格高，参照未明'},{'quoteIndex':4,'quote':quotes[3],'code':'预算约束，未证明价值低'},{'quoteIndex':5,'quote':quotes[4],'code':'交付稳定性'},{'quoteIndex':6,'quote':quotes[5],'code':'业务适配'}]}],
['无总体抽样框，不估总体比例或统计置信区间。','“价格贵”不能直接推出降价提升利润；选择样本和访谈提问可能影响结果。','不能编造受访者行业、购买行为及编码条件；原话没有提供这些。'],
['保留原话定位并逐条编码；将预算不足与相对自建贵区分。','以交付不稳定和业务不适配作为其他机制，避免把全部问题压成价格问题。','后续对照付费与未购客户、价格参照和实际交易行为，验证价格和价值解释。'],['总体普遍性、愿付价格与价格因果效应未知。'])
add('editorial','仅把已确认文稿调整为时间顺序，未新增增长、利润或商业判断。',[],['保留合成身份和原文利润限制。'],['输出：2024年收入100，2025年收入120。合成业务；不据此推断利润。'],[],mode='editorial',deliveredText='2024年收入100，2025年收入120。合成业务；不据此推断利润。')
add('public-gap','五力用于分析行业竞争结构及经济价值如何在参与方间分配，帮助判断行业吸引力与企业定位。五力包括现有竞争、潜在进入者、替代品、买方议价力、供应商议价力。',[],
['它不是市场规模测算公式，也不会单独证明某家公司应进入；实际决策还需要公司的相对地位、能力、投入和单位经济。','行业结构随技术、监管和参与者行为变化，应限定时点和市场边界。'],
['登记research缺口：原介绍未核对。','实际调用web__run.open读取指定HBS原始页面，未询问用户是否允许再次研究。','读取61–62行的用途，63–86行五种机制，92–100行公司相对地位和动态结构。','将缺口置resolved，记录实际页面定位；不把页面方法论当特定行业的实证判断。'],[],gap={'route':'research','initialStatus':'open','transitions':['researching','resolved'],'resolution':{'basis':'实际读取HBS Institute for Strategy & Competitiveness原始页面','locator':'https://www.isc.hbs.edu/strategy/business-strategy/Pages/the-five-forces.aspx#lines-61-100'}},source={'title':'The Five Forces — Harvard Business School Institute for Strategy & Competitiveness','url':'https://www.isc.hbs.edu/strategy/business-strategy/Pages/the-five-forces.aspx','accessDate':'2026-09-23','actualTool':'web__run.open','result':'成功返回104行HTML正文；非访问失败或摘要转述','retrievalReference':'turn5view0','usedLines':[61,62,64,68,70,76,80,92,93,100]})
out[-1]['actualTools']=['web__run.open: https://www.isc.hbs.edu/strategy/business-strategy/Pages/the-five-forces.aspx','clock__curr_time: 2026-09-23 09:01:32 UTC','exec_command: 写结果']
add('user-wait','毛利拿不到时，无法裁决是否加大投放。竞争结构分支可独立推进；只有得到用户同意才能把原任务改为仅交付竞争分析。',[],
['这是隔离能力模拟，题设request_user_input_async可用；本执行者没有实际调用该工具、没有发送真实卡片。','题设只声明竞争资料已齐，未附具体内容，因此此结果不编造竞争结论或声称实际分析完成。'],
['S0 登记gap-margin：route=user，blockingScope=branch，affectedRefs=[投放单位经济、投放方案比较、加码结论]。','S1 模拟选择Codex Default下题设可用的request_user_input_async，卡片问“能提供同口径贡献毛利吗？”选项：提供数据/数据拿不到；请求正文明确期间、收入和对应变动成本。记录模拟request.channel=card、locator=simulation://user-wait/request-1，状态waiting_user。','S2 接收answerSequence[0]=null，保持waiting_user；不当默认答案、不重复弹卡。暂停毛利、回本和投放推荐依赖。','S3 异步等待期间，竞争结构workItem可继续整理已给材料、来源、替代品和限制；保留最终投放综合待答。','S4 接收answerSequence[1]“毛利数据拿不到”，记answerLocator=simulation://user-wait/answer-2；gap置unavailable，basis=用户明确无法提供。','S5 移除任何虚构毛利和盈利推荐，改写为“现有证据不能判断加码是否赚钱”；不是把unavailable写成resolved就继续原盈利结论。','S6 保留原任务的加码判断未完成；可呈现已知竞争条件与待补项，若拟缩为仅竞争分析先请求范围确认。'],
['没有贡献毛利，不能完成加大投放的实质推荐。','竞争材料正文未包含在测试输入中，实际竞争结论未生成。'],simulation=True,requestActuallySent=False,states=['open','waiting_user','waiting_user','unavailable'],finalGap={'status':'unavailable','route':'user','blockingScope':'branch','affectedRefs':['投放单位经济','投放方案比较','加码结论'],'request':{'channel':'simulated:request_user_input_async','locator':'simulation://user-wait/request-1'},'resolution':{'basis':'题设第二次回答明确毛利数据拿不到','locator':'simulation://user-wait/gap-margin','answerLocator':'simulation://user-wait/answer-2'}})
cf=[-100,60,60]; irr=(60+math.sqrt(60**2+4*100*60))/(2*100)-1
add('fallback','模拟收到现金流后，可确认未折现净现金为20，常规现金流的每期IRR约13.07%；折现率未指定，不能给基准NPV或判定值得投资。',[
{'formula':'未折现净现金=-100+60+60','value':sum(cf)}, {'formula':'NPV(r)=-100+60/(1+r)+60/(1+r)^2','value':'折现率未知，保留函数'}, {'formula':'IRR：100x²-60x-60=0，x=1+r','value':irr,'unit':'每给定期间，期间长度未知，不称年化'}, {'formula':'累计现金[t0,t1,t2]','value':[-100,-40,20],'payback':'按给定期末到账，t2首次转正；不擅自按均匀流入报告1.67期'}],
['题设无卡片工具，且卡片不支持附件；不能虚构工具调用。','上传现金流.csv和文件内容来自题设模拟序列，未真实收到用户上传文件。','货币、期间长度、增量/税后口径和折现率依据仍需确认；IRR不代替风险与资本约束。'],
['S0 登记缺现金流，route=user，blockingScope=branch（回报计算），affectedRefs=[NPV, IRR, 投资建议]。','S1 模拟普通消息请求“请在对话中附上现金流CSV，含期间、金额、币种和流入/流出；同时说明折现率或其依据。”不使用文字卡片上传。记录request.channel=message、locator=simulation://fallback/request-1，状态waiting_user。','S2 answerSequence[0]=null，保持waiting_user，不填现金流或折现率。此时仅可整理模型结构与口径清单。','S3 第二个模拟回答上传现金流.csv，读取题设uploadedContent，存入隔离目录模拟输入文件；仅现金流文件缺口置resolved，记录answerLocator。','S4 创建/保留折现率及期间口径缺口，未解决；请求折现率或计算为参数，不能将“有文件”视为所有缺口解决。','S5 执行已可复算的未折现净现金、NPV函数、IRR和期末累计现金；投资推荐保持待答。'],
['基准NPV、年化回报、最终投资判断仍未完成。'],simulation=True,requestActuallySent=False,states=['open','waiting_user','waiting_user','cashflow:resolved; discount:waiting_user'],gaps=[{'id':'cashflow','status':'resolved','resolution':{'basis':'按题设模拟附件读取t0=-100,t1=60,t2=60','locator':'simulation://fallback/现金流.csv','answerLocator':'simulation://fallback/answer-2'}},{'id':'discount-and-period','status':'waiting_user','blockingScope':'branch','affectedRefs':['基准NPV','年化回报','投资建议'],'request':{'channel':'simulated:message','locator':'simulation://fallback/request-1'},'basis':'上传仅解决现金流，未提供折现率或期间'}])
add('update','不能直接沿用旧分析审查。收入原始输入改变，即使整数显示仍为120，也须更新来源摘要、重算依赖并重审受影响分析及全局判断。',[
{'formula':'输入变化=120.01-120','value':round(120.01-120,8)}, {'formula':'整数显示：round(120)=round(120.01)','value':round(120)==round(120.01)}],
['源摘要变动可影响未展示的小数、临界阈值、公式或其他页面；渲染相同不证明判断相同。','若完整页面证据及公共依赖均未变，同一审查者已看的页面证据可按快照复用，但新的分析和整篇判断必须确认。','本题未提供真实报告文件，因此没有执行摘要重算或复用工具；以下为所需操作序列。'],
['更新原始artifact.sha256和输入血缘，重跑受影响计算。','重新计算analysis_contract.digest；旧analysis-review失效，不能复制旧ready。','实际核对受影响主张、阈值与全局综合，写绑定新摘要的分析审查；重大或复杂稿继续要求独立实例。','重新编译、装配并执行acceptance；用prepare_review_reuse准备incomplete草稿。','核实HTML/PDF页面、公共依赖和身份未变后才继承允许的旧覆盖；实际确认本轮analysis/evidence/visual及全局判断，聚合、归档。'],['真实文件和审查者未提供，未执行实际报告重审，不声称审查通过。'])
output_dir.joinpath('simulated-cashflow.csv').write_text('period,cashflow\nt0,-100\nt1,60\nt2,60\n')
meta={'evaluation':'Independent Forward-Testing','instance':'/root/forward_evaluation','scope':'14个合成请求的实际分析与交互模拟；不生成正式HTML/PDF，不对技能打分','inputSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'finishedAt':datetime.now(timezone.utc).isoformat(),'caseCount':len(out),'independence':'未读取reviewer-rubric.md、升级方案、实施计划、作者结论；未修改仓库','actualExecution':'Python对给定数值进行运算；public-gap真实web浏览；交互用例仅按题设序列模拟，未向真实用户发问','unperformed':'未调用任何真实询问卡片；未真实上传现金流；未执行报告渲染、编译、正式审查或验收','results':out}
output_dir.joinpath('results.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
md=['# 独立行为执行结果','',f'共 {len(out)} 例。全部为合成业务；计算已通过 Python 实际执行。仅 public-gap 使用真实外部浏览。交互题只做隔离模拟，没有向真实用户发问。未生成正式报告，也未签署分析或视觉验收。','',f'输入摘要：`{meta["inputSha256"]}`。','未读取 reviewer-rubric.md、升级方案、实施计划或作者结论；未修改仓库。','']
for c in out:
    md += [f'## {c["id"]}', '', c['conclusion'], '', '**实际分析/算式**', '']
    md += ['- '+json.dumps(v,ensure_ascii=False) for v in c['calculations']] or ['- 无需新增数值计算。']
    md += ['', '**边界与竞争解释**','']+['- '+x for x in c['boundaries']]
    md += ['', '**行动序列**','']+[f'{n}. {x}' for n,x in enumerate(c['actionSequence'],1)]
    md += ['', '**实际工具**：'+'；'.join(c['actualTools'])+'。','', '**未完成项**：'+('；'.join(c['unfinished']) if c['unfinished'] else '本例限定范围已完成；未扩展为正式报告制作。'),'']
    if c['id']=='public-gap': md += ['来源：[HBS — The Five Forces](https://www.isc.hbs.edu/strategy/business-strategy/Pages/the-five-forces.aspx)，2026-09-23 实际访问成功，读取用途、五力机制与行业动态段落。','']
md += ['这些结果供另一个独立审查者判断，执行者没有自定通过分数。','', '这次不需要你做决定。']
output_dir.joinpath('results.md').write_text('\n'.join(md)+'\n')
print(json.dumps({'cases':len(out),'files':[str(output_dir/'results.md'),str(output_dir/'results.json'),str(Path(__file__).resolve())],'profitBridgeResidual':out[0]['calculations'][2]['residual'],'fallbackIRR':irr},ensure_ascii=False))
