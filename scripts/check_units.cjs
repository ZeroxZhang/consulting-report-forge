/* 成稿的机械排印守卫。
   指标 token 装配后已经把值与单位（连同它的身份括注）印在页面上：`36.0 十亿美元`、`62.4%（估计）`、
   `5 级（估计）`、`0.88 相关系数（估计）`。作者在正文、标题、主张或限定里再写一遍单位，
   就会印出「36.0 亿美元（预测） 亿美元」「99 笔 笔交易」「62.4%（估计）%」这样的句子；
   把带标签的 HTML 写进会被转义的字段时，页面上还会直接出现 `<span data-content-key=…>` 这类文字。

   这两类错在装配、溢出、字号、图例、绑定检查里全是绿的——只有印出来才看得见，所以单独扫一遍成稿纯文本。
   单位词不写死在脚本里：直接从成稿自己的指标元素里取，任务换了、口径换了都不用改这里。

   用法：node scripts/check_units.cjs <deck.html>
   退出码：0 通过；1 有命中（逐条打印页码、类型与上下文）。 */
'use strict';
const fs = require('node:fs');
const {CLAIM_LABELS} = require('./content_contract.cjs');

const B = '\u0001';   /* 元素边界 */
const OPEN = '\u0002'; /* 指标 token 起点 */
const CLOSE = '\u0003'; /* 指标 token 终点 */
const IDENTITY = Object.values(CLAIM_LABELS).filter(Boolean);
const esc = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const CJK = '\\u4e00-\\u9fa5';

/* 指标元素：key 可以是单个 metric:*，也可以是 ["metric:a","claim:b"] 这类数组写法。 */
function markMetrics(html) {
  const units = new Set(), rendered = new Map();
  const marked = html.replace(/<([a-z]+)([^>]*?)data-content-key="([^"]*metric:[^"]*)"([^>]*?)>([\s\S]*?)<\/\1>/g,
    (match, tag, pre, key, post, inner) => {
      const text = String(inner).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      const unit = unitOf(text);
      if (unit) units.add(unit);
      rendered.set(text, unit);
      return OPEN + text + CLOSE;
    });
  return {marked, units, rendered};
}

/* 指标渲染文字末尾的单位词：先去掉身份括注，再取结尾的连续中文或 %。 */
function unitOf(text) {
  const bare = String(text).replace(/（[^）]*）\s*$/, '').trim();
  const match = bare.match(new RegExp('([' + CJK + '%]+)$'));
  if (!match) return null;
  return match[1].length >= 1 ? match[1] : null;
}

/* 一个单位词本身与它的尾部子串：「十亿美元」要能认出正文里再写的「亿美元」「美元」。
   单字单位（个/件/笔/级/%）不参与子串拆分——「元数据」这类词会被「元」误伤。 */
function suffixesOf(unit) {
  const out = new Set([unit]);
  for (let start = 1; start <= unit.length - 2; start++) out.add(unit.slice(start));
  return out;
}

function plain(marked) {
  return marked.replace(/<[^>]+>/g, B).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, ' ');
}

function inspect(html) {
  const findings = [];
  const sections = String(html).split(/(?=<section)/);
  let page = 0;
  for (const section of sections) {
    const pageId = (section.match(/data-page-id="([^"]+)"/) || [])[1] || null;
    const role = (section.match(/data-page-role="([^"]+)"/) || [])[1] || null;
    if (/^<section/.test(section)) page += 1;
    if (!page) continue;
    const where = {pages: [page], pageId, role};
    const seen = new Set();
    const record = (kind, position, text) => {
      const context = text.slice(Math.max(0, position - 26), position + 60).replace(/[\u0001\u0002\u0003]/g, '·').trim();
      const key = kind + '|' + context;
      if (seen.has(key)) return;
      seen.add(key);
      findings.push({kind, ...where, context});
    };
    const {marked, units} = markMetrics(section);
    const text = plain(marked);

    /* 1) 指标 token 紧后（中间没有元素边界）又写了一遍单位。
       判据不要求逐字相同：token 写「36.0 十亿美元」、正文再写「亿美元」也是重复——
       读者看到的是两个单位。只要后写的单位是本 token 单位的后缀就算。 */
    const afterHits = new Map();
    for (const unit of units) {
      for (const other of suffixesOf(unit)) {
        const re = new RegExp(esc(CLOSE) + '\\s*(' + esc(other) + ')', 'g');
        for (const match of text.matchAll(re)) {
          const previous = afterHits.get(match.index);
          if (!previous || other.length > previous.other.length) afterHits.set(match.index, {other, unit});
        }
      }
    }
    /* 同一处只报最长的那个单位词：「相关系数」不该再拆出「关系数」「系数」两条噪声。 */
    for (const [index, hit] of afterHits) {
      const label = hit.other === hit.unit ? hit.other : hit.other + '（指标上写的是 ' + hit.unit + '）';
      record('指标后重复单位 ' + label, index, text);
    }
    /* 2) 指标 token 紧前又写了一遍单位（token 自带单位，句子不必再写） */
    const beforeHits = new Map();
    for (const unit of units) {
      for (const other of suffixesOf(unit)) {
        const re = new RegExp('(' + esc(other) + ')[ ]*' + esc(OPEN), 'g');
        for (const match of text.matchAll(re)) {
          /* 按命中的收尾位置归并：不同长度的后缀起点不同，起点归并会漏掉重复项。 */
          const end = match.index + match[0].length;
          const previous = beforeHits.get(end);
          if (!previous || other.length > previous.other.length) beforeHits.set(end, {other, unit, index: match.index});
        }
      }
    }
    for (const hit of beforeHits.values()) record('指标前重复单位 ' + hit.other, hit.index, text);
    /* 3) 身份括注之后又跟单位：「62.4%（估计）%」 */
    for (const unit of units) {
      const re = new RegExp('（(?:' + IDENTITY.join('|') + ')）\\s*' + esc(unit), 'g');
      for (const match of text.matchAll(re)) record('身份括注后重复单位 ' + unit, match.index, text);
    }
    /* 4) 两个单位紧挨（同一单位写两遍） */
    for (const unit of units) {
      if (unit.length < 1) continue;
      const re = new RegExp(esc(unit) + '\\s*' + esc(unit), 'g');
      for (const match of text.matchAll(re)) record('单位连写 ' + unit, match.index, text);
    }
    /* 5) 括注嵌套：「（5 级（估计））」——外括注紧贴着身份括注收尾才算。
       放宽到「任意嵌套括注」会误伤合法写法：「（5 分（估计）/5）」「（当前 12.5 年（预测）→ 4 年（预测））」都没问题，
       真正的毛病是作者又给已经自带身份标注的指标套了一层括号。
       这一条要去掉指标标记再看：括号外面那句里，指标元素正好夹在内层括注与外层括注之间。 */
    const flat = text.replace(new RegExp('[' + OPEN + CLOSE + ']', 'g'), '');
    for (const match of flat.matchAll(new RegExp('（[^（）' + B + ']{1,16}（(?:' + IDENTITY.join('|') + ')））', 'g'))) {
      record('括注嵌套', match.index, flat);
    }
    /* 6) 标记被印成文字：作者把 HTML 写进了会被转义的字段 */
    for (const match of text.matchAll(/(<\/?[a-z]+[^>]{0,80}>|data-content-key=|&lt;[a-z/])/g)) {
      record('标记被印成文字', match.index, text);
    }
    /* 7) 指标 token 与紧跟的中文之间夹了空格：同稿其他页不这么写，读数与句子之间会忽松忽紧 */
    for (const match of text.matchAll(new RegExp(esc(CLOSE) + ' ([' + CJK + '（「])', 'g'))) {
      record('token 后多余空格', match.index, text);
    }
    /* 8) 中文标点前多余空格 */
    for (const match of text.matchAll(new RegExp('([' + CJK + '%]) ([，。；：、）])', 'g'))) {
      record('标点前空格', match.index, text);
    }
  }
  return findings;
}

function describe(findings) {
  return findings.map(item => {
    const at = [item.pageId || null, item.role || null, '第 ' + item.pages[0] + ' 页'].filter(Boolean).join('/');
    return '[' + item.kind + '] ' + at + '：…' + item.context + '…';
  });
}

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error('用法：node scripts/check_units.cjs <deck.html>');
    process.exitCode = 1;
  } else {
    const findings = inspect(fs.readFileSync(file, 'utf8'));
    if (findings.length) {
      console.error('单位/排印守卫未通过，共 ' + findings.length + ' 处：');
      for (const line of describe(findings)) console.error('  ' + line);
      process.exitCode = 1;
    } else {
      console.log('单位/排印守卫通过：无重复单位、无嵌套括注、无标点前空格、无标记被印成文字');
    }
  }
}
module.exports = {inspect, describe, unitOf};
