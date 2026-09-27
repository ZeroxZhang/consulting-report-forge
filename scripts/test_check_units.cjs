'use strict';
/* 单位与排印守卫的判据测试：每条规则都要有正例与反例。
   反例比正例重要——把合法写法当成错，作者会为了过检查改坏句子。 */
const assert = require('node:assert/strict');
const units = require('./check_units.cjs');
let checks = 0;
const equal = (a, b) => { assert.deepEqual(a, b); checks++; };

/* 最小成稿：一页正文，指标元素就是装配后带 data-content-key 的节点。 */
const deck = body => '<section class="slide reading" data-page-id="demo">' +
  '<h1 class="slide__title">' + body + '</h1></section>';
const kinds = html => units.inspect(html).map(item => item.kind);

/* —— 单位词从成稿自己的指标元素里取 —— */
equal(units.unitOf('36.0 十亿美元（预测）'), '十亿美元');
equal(units.unitOf('62.4%（估计）'), '%');
equal(units.unitOf('5 级（估计）'), '级');
equal(units.unitOf('0.88 相关系数（估计）'), '相关系数');
equal(units.unitOf('1600 件'), '件');

/* —— 正例：这些都要被拦下 —— */
/* 指标元素之后又写一遍单位：既报「后重复」，也报「token 后多余空格」。 */
equal(kinds(deck('<span data-content-key="metric:a">36.0 亿美元（预测）</span> 亿美元的合作')), ['指标后重复单位 亿美元', 'token 后多余空格']);
/* 身份括注写在正文里（不在指标元素内）时，由「身份括注后重复单位」兜住。
   单位词表来自本页的指标元素，所以这一页要先有一个带 % 的指标。 */
equal(kinds(deck('<span data-content-key="metric:a">62.4%（估计）</span>，软件占 62.4%（估计）%')), ['身份括注后重复单位 %']);
equal(kinds(deck('<span data-content-key="metric:a">99 笔</span> 笔交易')), ['指标后重复单位 笔', 'token 后多余空格']);
equal(kinds(deck('<span data-content-key="metric:a">75 个</span> 个分子')), ['指标后重复单位 个', 'token 后多余空格']);
/* 正文里两处单位连写（不靠指标元素）：同一段文字里把单位写了两遍。 */
equal(kinds(deck('<span data-content-key="metric:a">1000 百万美元</span>；上限 1000 百万美元 百万美元，相差 1000 倍')), ['单位连写 百万美元']);
equal(kinds(deck('皮尔逊相关系数 <span data-content-key="metric:a">0.88 相关系数（估计）</span>')), ['指标前重复单位 相关系数']);
equal(kinds(deck('<span data-content-key="metric:a">1600 件</span> 件（2026 年 9 月）')), ['指标后重复单位 件', 'token 后多余空格']);
equal(kinds(deck('成熟度最高的是蛋白质结构预测（<span data-content-key="metric:a">5 级（估计）</span>）')), ['括注嵌套']);
equal(kinds(deck('公告名义额 <span data-content-key="metric:a">36.0 十亿美元</span>里')), []);
equal(kinds(deck('公告名义额 &lt;span data-content-key="metric:a"&gt;&lt;/span&gt; 里')), ['标记被印成文字', '标记被印成文字']);
equal(kinds(deck('<span data-content-key="metric:a">75 个</span> 分子进入临床')), ['token 后多余空格']);

/* —— 反例：这些是合法写法，不能被误伤 —— */
/* 单位出现在另一个元素里（副标题「单位：亿美元」+ 图形坐标轴），中间隔着元素边界。 */
equal(kinds('<section class="slide reading" data-page-id="demo"><p class="slide__lead">单位：亿美元</p>' +
  '<div class="region"><svg><text>亿美元</text></svg></div></section>'), []);
/* 合法嵌套：外括注不是紧贴身份括注收尾。 */
equal(kinds(deck('严重度评分最高（<span data-content-key="metric:a">5 分（估计）</span>/5）')), []);
equal(kinds(deck('（当前 <span data-content-key="metric:a">12.5 年（预测）</span> → 4 年）')), []);
/* 指标后面直接跟中文（本稿的统一写法）。 */
equal(kinds(deck('<span data-content-key="metric:a">75 个</span>分子进入临床')), []);
/* 指标后面跟标点或另一个指标。 */
equal(kinds(deck('<span data-content-key="metric:a">36.0 十亿美元</span>，前期付款只有 ' +
  '<span data-content-key="metric:b">0.777 十亿美元</span>；按公告额定')), []);
/* 数组写法的 key 同样认：命中与单键写法一致，干净写法同样干净。 */
equal(kinds(deck('<span data-content-key="[&quot;metric:a&quot;,&quot;claim:b&quot;]">36.0 亿美元</span> 亿美元')),
  ['指标后重复单位 亿美元', 'token 后多余空格']);
equal(kinds(deck('<span data-content-key="[&quot;metric:a&quot;,&quot;claim:b&quot;]">36.0 亿美元</span>的合作')), []);
/* 没有指标元素时没有任何单位词表，也就不该报「单位重复」。 */
equal(kinds(deck('这一行里有 亿美元 亿美元 两个词，但没有指标元素')), []);
/* 页码与页 id 跟着命中一起返回，审查者能直接定位。 */
const located = units.inspect(deck('<span data-content-key="metric:a">99 笔</span> 笔交易'))[0];
equal([located.pageId, located.pages, located.role], ['demo', [1], null]);

console.log('PASS check units: ' + checks + ' assertions — 单位词取自成稿、后重复/前重复/连写/嵌套/标记泄露/空格，以及元素边界与合法嵌套反例');
