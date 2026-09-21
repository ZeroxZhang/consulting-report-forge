# TikTok 全球商业化——统一数据字典

> 整理自 `research_raw_data/research/` 的 82 个原始文件（5 个位置、4 套数据字典、~1000+ 行数据），整合为 12 个去重 CSV + 1 份报告。

---

## 一、文件清单

| # | 文件名 | 内容 | 行数 | 核心用途 |
|---|--------|------|------|---------|
| 01 | `01_bytedance_revenue.csv` | ByteDance 总营收 + TikTok 广告收入时间序列 | 26 | 财务全景 |
| 02 | `02_tiktok_shop_gmv.csv` | TikTok Shop 全球/分区域 GMV + 买家数 + 市场份额 | 35 | 电商核心 |
| 03 | `03_sellers_categories.csv` | 卖家分布 + 品类 GMV + 联盟营销 | 26 | 供给侧 |
| 04 | `04_user_metrics.csv` | MAU/广告可触达/使用时长/年龄性别/下载量 | 40 | 用户资产 |
| 05 | `05_advertising_metrics.csv` | CPM/CPC/CTR + 广告格式占比 + 互动率 + 禁令情景 | 35 | 广告业务 |
| 06 | `06_creator_economy.csv` | 创作者分层 + RPM + 分成 + 生态规模 | 30 | 创作者经济 |
| 07 | `07_regional_breakdown.csv` | 分区域广告收入 + GMV + 广告可触达 | 27 | 区域拆解 |
| 08 | `08_regulatory_risk.csv` | 宕机事件 + 禁令时间线 + DMA | 12 | 监管风险 |
| 09 | `09_competitor_comparison.csv` | TikTok vs YouTube/Instagram/Facebook | 15 | 竞争格局 |
| 10 | `10_live_commerce.csv` | 直播电商市场 + 转化率 + BFCM | 15 | 直播电商 |
| 11 | `11_social_commerce_context.csv` | 全球/美国社交电商市场背景 | 8 | 市场背景 |
| 12 | `TIKTOK_GLOBAL_COMMERCIALIZATION_REPORT.md` | 综合研究报告（9 章） | — | 报告正文 |

---

## 二、字段规范

所有 CSV 统一包含以下通用字段（部分文件有额外字段）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `metric` | string | 指标名称 |
| `year` / `year_or_period` | string | 年份或时期（如 "2025"、"2025 H1"、"2025-07"） |
| `value` | numeric | 数值 |
| `unit` | string | 单位（billion USD / million / pct / minutes 等） |
| `source` | string | 数据来源 |
| `verification_status` | string | `high` = 多来源交叉验证 / 同行评审；`medium` = 单一来源或估算；`failed` = 验证失败不可用 |
| `notes` | string | 口径说明、裁决依据、特殊备注 |

---

## 三、数据来源分级

| 等级 | 来源 | 权重 |
|------|------|------|
| **Tier 1** | eMarketer、PMC/PNAS（同行评审）、Consumer Edge（交易面板数据） | 冲突时优先采用 |
| **Tier 2** | Momentum Works、Business of Apps、DemandSage、Statista | 可靠但需交叉验证 |
| **Tier 3** | Ringly、ContentGrip、Digital in Asia、Shopify | 专项数据可用，全局估算谨慎 |
| **Tier 4** | cropink.com、自媒体博客、TikTok Newsroom 自我声明 | 验证环节多被推翻，仅补充用 |

---

## 四、冲突裁决记录

以下为原始 82 个文件中存在数据冲突的关键指标，以及本整合版本采用的数值和裁决依据。

### 4.1 TikTok Shop 2023 年全球 GMV

| 来源 | 数值 |
|------|------|
| 原始 `tiktok_shop_ecommerce.csv` | $11B (Branvas) |
| `tiktok_data/07` | $16B (ContentGrip) |
| `tiktok_gmv_data.csv` | $13.6B |
| `commercialization_data/02` | $11-16.3B |

**裁决**：采用 **$16B**（ContentGrip）。理由：ContentGrip 引用 Momentum Works 2026 年报告，与 Digital in Asia 的 $16.3B 交叉验证一致；$11B 仅来自 Branvas 单一来源。

### 4.2 TikTok Shop 2024 年美国 GMV

| 来源 | 数值 |
|------|------|
| 原始 `tiktok_shop_ecommerce.csv` | $7.6B (Momentum Works) |
| `tiktok_data/08` | $9.0B (Ringly/ContentGrip) |
| `data/tiktok_shop_gmv_by_country` | $9.0B |

**裁决**：采用 **$9.0B**（Ringly/ContentGrip）。理由：Ringly 使用确认交易数据（confirmed transaction），Momentum Works 的 $7.6B 可能使用不同口径（含/不含退货）。eMarketer 2025 年 GMV $15.82B 反推 2024 约 $7.6B（+108%），但 Ringly 的 $9.0B 有独立数据支撑。保留两值并标注差异。

### 4.3 TikTok 全球 MAU (2024-2025)

| 来源 | 数值 | 时间 |
|------|------|------|
| `tiktok_user_metrics.csv` (原始) | 1.92B | 2024 |
| `tiktok_data/13` | 1.59B | Feb 2025 |
| `data/tiktok_competitor_comparison` | 1.99B | 2025 |

**裁决**：采用 **1.59B**（Statista, Feb 2025）作为最新时点数据。理由：Statista 明确标注时间为 Feb 2025，为最精确时点。1.92B (BoA 2024) 和 1.99B 可能含不同口径（广告可触达 vs MAU）。notes 中注明差异。

### 4.4 美妆品类 GMV 占比

| 来源 | 数值 | 口径 |
|------|------|------|
| `tiktok_category_data.csv` | 42% | 国际市场（含东南亚） |
| `data/tiktok_shop_categories` | 22% (US) / 25% (Global) | 美国 / 全球 |
| `commercialization_data/10` | 22%+ (US) | 美国 |

**裁决**：**非冲突，是口径差异**。42% 为国际市场（东南亚为主），22% 为美国市场。两者同时保留，notes 标注口径。

### 4.5 TikTok 2024 年全球广告收入

| 来源 | 数值 |
|------|------|
| 原始 `tiktok_global_financials.csv` | $23.58B |
| `tiktok_advertising_data.csv` | $18.2B |
| `data/tiktok_revenue_by_year` | ~$23B |

**裁决**：采用 **$23.58B**（Business of Apps / DemandSage）。理由：多个 Tier 2 来源交叉验证；$18.2B 来自一个大部分 N/A 的低质量文件（`tiktok_advertising_data.csv`），不可靠。

---

## 五、被删除/合并的原始文件

### 完全删除（空文件 / 重复 / 不可靠）

| 原始文件 | 删除原因 |
|---------|---------|
| `tiktok_advertising_data.csv` | 6 行中 5 行全 N/A，空文件 |
| `tiktok_user_data.csv` | 仅 4 行，已合并入 `04_user_metrics.csv` |
| `tiktok_ad_metrics.csv` | 仅 4 行（宕机事件），已合并入 `05_advertising_metrics.csv` |
| `tiktok_ad_metrics_2025.csv` | 仅 6 行成本基准，已合并入 `05_advertising_metrics.csv` |
| `tiktok_market_comparison.csv` | 仅 4 行禁令情景，已合并入 `05` + `08` |
| `tiktok_marketing_budget_data.csv` | 仅 6 行，已合并入 `05_advertising_metrics.csv` |
| `tiktok_platform_revenue_comparison.csv` | 仅 5 行对比，已合并入 `09_competitor_comparison.csv` |
| `tiktok_shop_gmv_trend.csv` | 仅 4 行美国序列，已合并入 `02_tiktok_shop_gmv.csv` |
| `tiktok_gmv_data.csv` | 16 行早期估算，数值偏低，已被 `02` 替代 |
| `tiktok_category_data.csv` | 仅 7 行且口径不清，已被 `03_sellers_categories.csv` 替代 |
| `tiktok_age_demographics.csv` | 仅 6 行，已合并入 `04_user_metrics.csv` |
| `tiktok_seller_data.csv` | 30 行但与其他文件高度重复，已合并入 `03` |
| `数据说明文档.csv` | CSV 格式的数据字典，功能已被本文件替代 |

### 合并入整合文件

| 原始文件组 | 合并目标 |
|-----------|---------|
| `tiktok_global_financials.csv` + `tiktok_revenue_data.csv` + `tiktok_advertising_revenue.csv` + `tiktok_regional_revenue.csv` + `data/tiktok_revenue_by_year.csv` + `data/tiktok_quarterly_revenue.csv` + `data/bytedance_financials.csv` + `data/tiktok_ad_revenue_by_region.csv` + `tiktok_data/01` + `tiktok_data/02` + `commercialization_data/01` | → `01_bytedance_revenue.csv` |
| `tiktok_shop_ecommerce.csv` + `data/tiktok_shop_gmv_by_year.csv` + `data/tiktok_shop_gmv_by_country.csv` + `data/tiktok_shop_us_quarterly.csv` + `tiktok_data/07` + `tiktok_data/08` + `commercialization_data/02` | → `02_tiktok_shop_gmv.csv` |
| `data/tiktok_shop_seller_metrics.csv` + `tiktok_data/09` + `commercialization_data/09` + `commercialization_data/11` + `data/tiktok_shop_categories.csv` + `tiktok_data/10` + `commercialization_data/10` | → `03_sellers_categories.csv` |
| `tiktok_user_metrics.csv` + `data/tiktok_users_by_country.csv` + `data/tiktok_users_by_region.csv` + `data/tiktok_users_growth_quarterly.csv` + `data/tiktok_user_demographics_age_gender.csv` + `tiktok_data/03` + `tiktok_data/04` + `tiktok_data/05` + `tiktok_data/06` + `tiktok_data/13` + `commercialization_data/03` + `commercialization_data/04` + `commercialization_data/06` | → `04_user_metrics.csv` |
| `tiktok_advertising.csv` + `data/tiktok_advertising_costs.csv` + `tiktok_data/04` + `tiktok_data/11` + `commercialization_data/05` | → `05_advertising_metrics.csv` |
| `tiktok_creator_economy.csv` + `tiktok_data/12` + `commercialization_data/07` | → `06_creator_economy.csv` |
| `tiktok_regional_breakdown.csv` + `tiktok_regional_revenue.csv` + `data/tiktok_users_by_region.csv` | → `07_regional_breakdown.csv` |
| `tiktok_regulatory_risk.csv` + `commercialization_data/12` | → `08_regulatory_risk.csv` |
| `data/tiktok_competitor_comparison.csv` + `commercialization_data/13` | → `09_competitor_comparison.csv` |
| `data/tiktok_live_commerce.csv` + `commercialization_data/08` | → `10_live_commerce.csv` |
| `data/social_commerce_market_context.csv` | → `11_social_commerce_context.csv` |

### 文档文件处理

| 原始文件 | 处理 |
|---------|------|
| `DATA_DICTIONARY.md`（顶层，我写的） | 被本文件替代 |
| `DATA_USAGE_GUIDE.md` | 内容已合并入本文件 |
| `数据说明文档.md` | 内容已合并入本文件 |
| `数据说明文档.csv` | 删除（CSV 格式字典不实用） |
| `tiktok_data_documentation.md` | 内容已合并入本文件 |
| `TikTok全球商业化调研摘要.md` | 删除（完整版报告已保留） |
| `data/DATA_DICTIONARY.md` | 被本文件替代 |
| `tiktok_data/README_数据说明.md` | 被本文件替代 |
| `tiktok_global_commercialization_data/DATA_DICTIONARY.md` | 被本文件替代 |
| `commercialization_data/00_data_dictionary.csv` | 被本文件替代 |
| `TIKTOK_GLOBAL_COMMERCIALIZATION_REPORT.md` | **保留**，复制到 `research/` |

---

## 六、核心不确定性（保留）

1. **中国市场缺失**：抖音独立数据（电商 GMV、广告收入、用户规模）完全缺失。抖音 2024 年电商 GMV 估计超 2 万亿人民币（~2800 亿美元），缺失将严重低估 ByteDance 整体规模。
2. **GMV ≠ Revenue**：GMV 为商品交易总额，含退货/取消/补贴。TikTok 实际变现率约 5-8%。
3. **MAU vs Ad Reachable Audience**：两个指标口径不同（后者排除 18 岁以下），差约 10%。
4. **2025+ 数据多为预测**：实际值可能因禁令、关税、竞争等因素偏离。
5. **来源间差异**：即使 Tier 1 来源，eMarketer 与 Momentum Works 的同一指标也可能差 10-20%（方法论差异）。

---

## 七、使用建议

1. **对比时注意口径**：广告收入含抖音（亚太 51%），GMV 不含抖音（东南亚 71%）。
2. **预测值标注**：所有 `year` 含 "E" 或 notes 含 "预测值" 的数据为预测。
3. **验证状态**：`verification_status = high` 的数据可直接引用；`medium` 需注明来源；`failed` 不可用。
4. **季度数据**：季度数据存在于 `01`（收入）和 `02`（GMV）中，其余文件为年度。
5. **引用格式**：`TikTok 全球商业化调研数据 [文件名], [source] 列标注的原始来源, 数据截止 2026 H1.`

---

## 八、整理统计

| 维度 | 原始 | 整合后 |
|------|------|--------|
| 文件总数 | 82 | 12 (11 CSV + 1 报告) |
| 数据字典 | 5 套（互相矛盾） | 1 套统一 |
| 数据行数 | ~1000+ | ~279 |
| 重复文件 | ~60 | 0 |
| 冲突指标 | 5 组 | 已裁决并记录 |
| 空/垃圾文件 | 3 | 0 |

---

*整理日期：2026-09-21*  
*原始数据位置：`research_raw_data/research/`（保留原始文件供溯源）*  
*整合数据位置：`research/`*
