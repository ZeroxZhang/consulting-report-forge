# 1.8.0 发布前深度检查

日期：2026-10-09。基线：`578812a`。本记录对应本轮工作区修订，未创建提交、更新版本号或执行发布。

## 范围与方法

检查 skill 入口与使用文档、分析与内容合同、任务状态与恢复、HTML/PDF 渲染、审查聚合与继承、字体及打包。三个独立实例分别检查生命周期、渲染与审查、真实使用流程；主实例验证复现、整合修复并运行完整发布回归。渲染修复另经交叉审查，修正新发现的双媒介分段与 CSS 无盒元素边界。

现有测试最初全部通过，但新反例仍发现以下缺陷。因此结论限于已检查的行为及所列回归，不把测试通过解释为穷尽所有输入。

## 已修复的缺陷

| 问题 | 根因与修复 | 主要回归 |
|---|---|---|
| 单页正文片段无法编译 | schema3 转换后丢失 task 类型，结构校验无条件要求封面；传递归一化 task，task3 的 fragment/collection 可无封面，report 与历史合同保留封面要求 | `test_strict_analysis`、独立单页试用 |
| 合同、旁解读、来源说明和下载文件名被改写 | 动态字符串传入 `String.replace` 的 replacement 参数，`$&`、`$$` 等被展开；统一使用回调保留原文 | `test_report_regressions`、`test_report_lifecycle` |
| 分析预览提示重复或残留 | 装配和换主题重复安装合同；安装前移除自身旧预览标记，按当前状态生成一份 | `test_report_regressions` |
| 环境失败仍返回成功退出码 | 随机图像答案通过覆盖了环境失败状态；验证命令按最终环境状态返回非零退出码 | `test_report_regressions` |
| 任意旧 HTML 可被当作制作完成 | 制作记录只检查文件扩展名；改为核对当前装配生产记录及 HTML 摘要 | `test_execution_plan`、`test_execution_render` |
| 审查快照重新打包失败 | 相对产物路径按工作目录解析；改为相对 audit 文件目录解析 | `test_report_lifecycle` |
| 带符号链接的任务归档后无法恢复 | 归档按 realpath 去重，恢复却按原 locator 查找；保留别名映射且只复制一份真实文件，验证归档引用不越界 | `test_execution_plan`、`test_execution_render` |
| 复合证据可漏掉逐展品/关系审查 | 校验器与审查包读取 audit 中不存在的计划字段，得到空清单；统一从已绑定且摘要有效的 pages 文件派生清单 | `test_render_review` |
| 合法分段叙事审查误拒或复用丢记录 | 原来每份 coverage 都要求全册；现按证据作用域核验，再按规范化审查身份检查跨页重复。复用保留层、组合引用、逐页观察及仍有效的跨片段理由；同页双媒介措辞差异不误判为重复页 | `test_render_review`、`test_review_reuse`、`test_narrative_contract` |
| 空理由可放行重复叙事 | repetitionBasis 只检查两个 ID；现要求两个不同的已看正文页及非空理由。页面变化后不能继承旧的跨页理由 | `test_render_review` |
| 非末页或仅打印时的网格错误漏检 | 隐藏页面产生 0/0 与 NaN，比较结果未触发失败；现逐页激活、拒绝不可测尺寸，并单独核对打印布局 | `test_render_review`、`test_strict_render` 的屏幕/打印反例 |
| 模块填充错误识别可见文字 | 混用父元素盒与真实文字行框；现处理 display:contents、透明滤镜、visibility 恢复，以及无盒祖先不生效的透明度/裁切 | `test_module_fill_browser` |
| 合法围栏 JSON 无法聚合 | 聚合时再次解析未去围栏的原文，丢失分析摘要；复用已经解析的输入 | `test_render_review`、`test_strict_render` |

## 冗余与文档修正

- `SKILL.md` 相对基线从 **17,857 bytes 减至 15,708 bytes，减少 12.0%**。三项固定前置约束原文保留；组合/叙事的详细字段收回已有按需参考，保留能力、启用命令、审查及迁移路由。
- 修正仍写 execution-plan-1 / 两项规划的当前生产文档；明确新任务是 execution-plan-2 / 三项规划，历史合同继续按原版本解释。
- 统一 init 后沿用任务与计划身份，避免再次复制模板覆盖；集中说明 editorial 的前置审查边界，并提供关系枚举查询命令。
- 合并组合审查清单来源、复用已解析审查数据、共用字体 Python 解析入口，删除一段永不执行的测试代码。没有为减少文件数删除历史兼容路径、字体、图表能力或验证证据。
- 新增 `npm run test:release`，自动纳入所有 `test_*.cjs`，再运行必要变体与生成资产/Python 检查；新增渲染审查反例同时纳入 `test:render`。

## 最终验证

运行环境为本机 macOS / Node.js v22.22.2 / Python 3.14.7，使用真实 Chrome、随包字体和实际 PDF 导出/栅格化。

| 验证 | 结果 |
|---|---|
| `npm run test:release` | **50/50 通过**：40 个 Node 测试、6 个显式浏览器/策略变体、3 项生成资产一致性、1 项 Python 字体缓存测试 |
| `skill-creator/scripts/quick_validate.py` | 通过；使用临时 uv 环境提供 PyYAML，未增加项目依赖 |
| 当前入口、参考及活文档的本地文件链接 | 33 份 Markdown，无缺失目标文件 |
| 模板 JSON | 可解析 |
| `npm audit --omit=dev` | 0 项已报告漏洞；依赖版本与 lockfile 未修改 |
| `git diff --check` | 通过 |

自动化中的审查数据明确标为合成夹具；它们证明状态、绑定、失败路径与继承行为，不冒充人工商业分析或视觉签署。阅读影子检测、未标记的自定义模块和专业判断仍保留原来的人工审查边界。本轮未进行跨操作系统矩阵或同题同模型效率比较。

## 独立使用试验

从空目录用默认 execution-plan-2 制作一页 editorial 报告，仅重排三个试点项目的已批准说明，不增加业务事实。真实试用复现并复测了 fragment 封面缺陷，随后根据实际读图移除重复内容并调整布局。

作者分别实际查看最终 HTML 截图与 PDF 栅格，完成作者审查、聚合、正式打包与完整归档；主实例再查看两份最终图像。验收 0 errors，4 条诊断逐项处置：两媒介的页缘留白用于限定行长与聚焦短文，单页布局及 0 图型是材料对应的统计，没有通过虚构内容或重复信息填白。无未解决 Major/Blocking。HTML 内嵌 PDF 与独立 PDF 字节一致。

该试验使用真实作者身份，不冒充独立业务审查；没有外部发送，delivery 保持 pending。完整归档移至证据目录后，在原临时路径不可访问时再次验证通过，随后删除临时工作目录。

本机证据位于 [release-audit-20261009](../renders/release-audit-20261009/)：`release.log` 保留完整 50 项回归输出，`verification.json` 记录代码与日志摘要，`editorial-trial/index.json` 索引最终 HTML/PDF、截图、操作记录及可迁移归档。这些生成证据位于已忽略的 renders 目录，不进入发布包。

本轮未遗留已知发布阻断；不将此结论扩大为所有输入、业务题材或运行环境均无缺陷。
