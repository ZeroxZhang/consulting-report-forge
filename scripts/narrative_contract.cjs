/* 叙事主线与单页焦点合同：一册一条推进的论证，一页只新增一件事。
   复合证据合同（composition_contract）管的是"证据怎么共同支持本页判断"；
   这里管的是更上面一层——本页相对上一页新增了什么理解，以及全册是否真的落到了核心答案。

   背景：这两件事此前只写在 references/consulting-storyline.md 的散文规则里，没有任何字段、
   校验或审查项。行为先导评估（renders/behavior-pilot-20260926/）暴露的正是这一类失败：
   同一笔金额在图、侧栏与结语各出现一次，结语页新增信息有限，比较目标没有落到编码。
   规则写得再清楚，没有卡点就不会有行为改变。

   deck.arc 与 slide.adds 是本合同唯一新增的作者字段，其余全部从既有蓝图派生：
   相邻页证明任务重复、核心答案是否被正文页承担、推进弧线是否真的走完，都不需要新写内容。 */
'use strict';
const caps=require('./contract_capabilities.cjs');

const POLICY='narrative-focus-1';

/* 四条默认弧线（见 references/consulting-storyline.md）。other 必须写理由，不能靠留空绕过。 */
const ARCS=Object.freeze(['opportunity-to-choice','problem-to-fix','uncertainty-to-bet','evidence-to-view','other']);
/* 每条弧线必须出现的收束节拍：任选其一满足即可，不规定页型配额。
   弧线是论证分工，不是必填页型清单——所以这里只要求"走到哪"，不要求"每步几页"。 */
const ARC_TERMINAL_BEATS=Object.freeze({
  'opportunity-to-choice':[['choice','action']],
  'problem-to-fix':[['diagnosis','insight'],['choice','action']],
  'uncertainty-to-bet':[['risk','choice','action']],
  'evidence-to-view':[['insight','diagnosis','risk']],
  'other':[]
});
/* 成稿侧的单页焦点约定：正文页恰有一个标记为 takeaway 的收束节点。
   类名本身不是通行证，所以用 data-reading-role 这个显式语义标记，而不是 .takeaway 样式类。 */
const TAKEAWAY_ATTR='data-reading-role="takeaway"';
const TAKEAWAY_ROLE='takeaway';
const MIN_ADD=12;
const MIN_REASON=12;
/* 近似重复的判定阈值。contains 口径（除以较小集合）比 Jaccard 更能抓住"一段是另一段的复述"。 */
const DUPLICATE_ADD=0.6;
const DUPLICATE_OTHER=0.75;
/* 同一页内部的复述阈值。比跨页的高：收束句与标题天然共享关键词，
   只有在"几乎没有新信息"时才值得报，否则这条会变成人人都在处置的噪音。 */
const SAME_PAGE_OVERLAP=0.85;
/* 审查者逐页记录的收束句之间的阈值：两页写出来几乎一模一样，说明读者从这两页拿到的就是同一件事。
   这里必须说清测度的边界：字符二元组相似度是**字面**测度，实测同义改写（
   "名义总额不是现金，首付占比很低" 与 "名义金额不等于现金流入，预付款占比低"）只有 0.09，
   完全落不进任何合理阈值。把阈值调低只会制造噪音，所以它抓的是"逐字或近乎逐字的重复"，
   不是"意思相同"。同义层面的原地踏步没有可用的离线语义测度，只能由审查者判断——
   这条判据的作用是让"审查者自己都没区分开"的那些暴露出来，不是替代判断。 */
const REVIEW_TAKEAWAY_OVERLAP=0.75;

const NARRATIVE_ROLES=new Set(['analysis','decision','action','risk','appendix']);
const list=v=>Array.isArray(v)?v:[];
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const norm=v=>String(v===undefined||v===null?'':v).replace(/\s+/g,' ').trim();
const text=(v,min=1)=>typeof v==='string'&&norm(v).length>=min;

/* 中日韩文本没有词边界，按字符二元组比较；去掉空白与标点，避免"同一条陈述换个标点"算不同。 */
function bigrams(value){
  const t=norm(value).replace(/[\s\p{P}\p{S}]+/gu,''),out=new Set();
  for(let i=0;i+1<t.length;i++)out.add(t.slice(i,i+2));
  if(!out.size&&t)out.add(t);
  return out;
}
/* 包含度：较短的一段有多少落在较长的一段里。用来抓"一段是另一段的复述"。 */
function similarity(a,b){
  const A=bigrams(a),B=bigrams(b);
  if(!A.size||!B.size)return 0;
  let hit=0;for(const g of A)if(B.has(g))hit++;
  return hit/Math.min(A.size,B.size);
}
/* 重合率：较长的一段有多少是旧信息。用来抓"长句只是把短句重说一遍"——
   这里必须除以较长的一段，否则"标题是收束句的子串"会被误判为重复：
   收束句本来是判断加行动，它合理地把标题包含在内。 */
function overlapRatio(a,b){
  const A=bigrams(a),B=bigrams(b);
  if(!A.size||!B.size)return 0;
  let hit=0;for(const g of A)if(B.has(g))hit++;
  return hit/Math.max(A.size,B.size);
}

/* 能力查询而非字符串相等：将来有策略包含 narrative-focus-1 时，检查不会静默失效。 */
function isNarrativeTask(task){
  try{return caps.visualPolicy(task?.policyVersions?.visual).narrative===true;}catch(_){return false;}
}
function hasNarrativeMarkers(doc){
  if(!object(doc))return false;
  if(doc.deck&&(doc.deck.arc!==undefined||doc.deck.arcReason!==undefined))return true;
  return list(doc.slides).some(s=>object(s)&&(s.adds!==undefined||s.addsOverlapReason!==undefined));
}
/* 组合标记与 task 策略必须成对出现：旧策略输入新的叙事标记时须显式升级任务策略，
   不能把未知内容只纳入签名而跳过检查。反向：新策略下正文页缺 adds 由 validate 明确报出。 */
function policyErrors(task,{present}={}){
  const errors=[],visual=task?.policyVersions?.visual;
  if(present&&visual!==POLICY)errors.push('deck.arc / slide.adds 需要显式视觉策略 '+POLICY
    +'；当前 '+(visual?visual:'任务未声明 policyVersions.visual')+' 不支持叙事主线合同。旧策略输入新的叙事标记时须显式升级任务策略');
  return errors;
}

function validate(doc,{task,stage='research'}={}){
  const errors=[],bad=m=>errors.push(m);
  if(!object(doc))return ['蓝图须为对象'];
  const present=hasNarrativeMarkers(doc);
  if(task)errors.push(...policyErrors(task,{present}));
  if(!isNarrativeTask(task))return [...new Set(errors)];

  const deck=object(doc.deck)?doc.deck:{};
  const slides=list(doc.slides);
  const body=slides.filter(s=>object(s)&&NARRATIVE_ROLES.has(s.pageRole));

  /* 弧线：先声明走哪条，再谈页面顺序。没写弧线的稿子会退化成"概览—分析—建议"。 */
  if(!ARCS.includes(deck.arc))bad('deck.arc 须声明本册沿哪条弧线推进：'+ARCS.join('/')+'（见 references/consulting-storyline.md）');
  else if(deck.arc==='other'&&!text(deck.arcReason,MIN_REASON))bad('deck.arc="other" 须写至少'+MIN_REASON+'字的自定义弧线：推理顺序是什么，为什么四条默认弧线都不适用');
  if(deck.arc!==undefined&&deck.arc!=='other'&&text(deck.arcReason))bad('deck.arcReason 只在 deck.arc="other" 时使用，其余弧线不能双写理由');

  /* 研究阶段可以只有蓝图没有页面，也可能页面还在成型；逐页要求从综合阶段起生效，
     与组合合同"研究可无页面、页面规划起才要求完整声明"的边界一致。 */
  if(body.length&&stage!=='research'){
    for(const slide of body){
      const at='slides['+slides.indexOf(slide)+']';
      if(!text(slide.adds,MIN_ADD))bad(at+' adds 须说明至少'+MIN_ADD+'字：读者读完本页比上一页多知道什么。'
        +'只写结论复述不算新增——本页相对上一页新增的理解，才是故事线推进的单位');
    }
    const arcs=ARC_TERMINAL_BEATS[deck.arc]||[];
    const beats=new Set(body.map(s=>s.storyBeat).filter(Boolean));
    for(const alternatives of arcs){
      if(!alternatives.some(beat=>beats.has(beat)))bad('deck.arc="'+deck.arc+'" 要求正文至少走到 '
        +alternatives.join('/')+' 节拍之一，当前正文节拍只有 '+(beats.size?[...beats].join('/'):'（无）')
        +'；弧线是论证分工，不能停在中途就收尾');
    }
    errors.push(...coverageErrors(doc,body));
    // 只阻断"两页声称同一件新增理解"。与本页无关的轻度重合交给人判断，见 diagnostics()。
    for(const item of duplicateAdds(body,slides).errors)bad(item);
  }
  return [...new Set(errors)];
}

/* 需要人判断的推进诊断：不阻断编译，但不能被无声丢掉。
   走 report_status 的 limitations 与 review_pack，最终由审查者逐条处置——
   与表达清单、留白度量同一条处置链，不新增一套展示用的 findings。 */
function diagnostics(doc,{task}={}){
  if(!isNarrativeTask(task))return [];
  const slides=list(doc?.slides);
  const body=slides.filter(s=>object(s)&&NARRATIVE_ROLES.has(s.pageRole));
  return duplicateAdds(body,slides).warnings;
}

/* 核心答案必须被正文页承担：synthesis.answerClaimRefs 只被签名、没有任何一页负责证明它，
   整册就会停在"分析了一圈、结论另说"。这条不需要新字段，全部从既有蓝图派生。 */
function coverageErrors(doc,body){
  const errors=[];
  const answers=list(doc.analysis?.synthesis?.answerClaimRefs);
  if(!answers.length)return errors;
  const owned=new Set();
  /* 页内证明分工也可能落在 panel 上，所以取页主张与各 panel 主张的并集。
     只读 slide.claimRefs 会在组合页上误报"核心答案无人承担"。 */
  const composition=require('./composition_contract.cjs');
  for(const slide of body){
    list(slide.claimRefs).forEach(ref=>owned.add(ref));
    composition.claimRefs(slide).forEach(ref=>owned.add(ref));
  }
  const missing=answers.filter(ref=>!owned.has(ref));
  if(missing.length)errors.push('核心答案没有被任何正文页承担：'+(missing.join('、'))
    +' 出现在 synthesis.answerClaimRefs，却没有任何正文页的 claimRefs 引用它。'
    +'整册的落点必须有一页真的负责证明，不能只在综合里声明');
  return errors;
}

/* 近似重复：同一件事被两页分别讲一遍，读者读到的是长度而不是推进。
   adds 与另一页的 adds 近乎相同 → 硬错误（两页声称同一件新增理解，故事线没有前进）；
   adds 与另一页的 title/proves 近乎相同 → 诊断（多半是那一页的证明任务与本页重叠）。 */
function duplicateAdds(body,slides){
  const errors=[],warnings=[];
  const seen=new Set();
  for(let i=0;i<body.length;i++){
    const a=body[i],ia=slides.indexOf(a);
    for(let j=0;j<body.length;j++){
      if(i===j)continue;
      const b=body[j],jb=slides.indexOf(b);
      const pair=[ia,jb].sort((x,y)=>x-y).join('|');
      if(seen.has(pair))continue;
      const againstAdds=similarity(a.adds,b.adds);
      if(againstAdds>=DUPLICATE_ADD){
        seen.add(pair);
        // 任一侧写明理由即视为已解释：两页并排比较才是这条例外的用途。
        if(![a,b].some(s=>text(s.addsOverlapReason,MIN_REASON)))errors.push('slides['+ia+'].adds 与 slides['+jb+'].adds 近似重复（'
          +Math.round(againstAdds*100)+'%）：两页声称同一件新增理解，故事线没有推进。合并页面、改写其中一页的分工，'
          +'或在两页之一的 addsOverlapReason 写至少'+MIN_REASON+'字说明为什么必须分开讲');
        continue;
      }
      for(const [field,label] of [['title','标题'],['proves','证明任务']]){
        const score=similarity(a.adds,b[field]);
        if(score>=DUPLICATE_OTHER)warnings.push('slides['+ia+'].adds 与 slides['+jb+'] 的'+label+' 高度重合（'
          +Math.round(score*100)+'%）：本页新增的理解可能正是另一页要证明的关系，请核对两页的分工是否重叠');
      }
    }
  }
  return {errors:[...new Set(errors)],warnings:[...new Set(warnings.map(message=>({message})))]};
}

/* 成稿侧：正文页恰有一个 takeaway 收束节点。蓝图声明得再清楚，页面上如果是
   标题一句判断 + lead 一句判断 + 页脚再加一句，读者拿到的仍是三个并列重点。 */
function pageFocusErrors(facts,{page}={}){
  const errors=[],at=page?('第 '+page+' 页'):'本页';
  if(!object(facts))return errors;
  const count=Number.isInteger(facts.takeaways)?facts.takeaways:null;
  if(count===null)return errors;
  if(count===0)errors.push(at+'没有标记为 takeaway 的收束节点：正文页须恰有一个 '
    +TAKEAWAY_ATTR+' 节点，把本页收束成一句话。没有它的页面只是并列了几块内容，读者不知道要记住什么');
  else if(count>1)errors.push(at+'有 '+count+' 个 '+TAKEAWAY_ATTR+' 节点：一页只讲一件事，'
    +'多个收束点等于没有收束点。把只是解释或限定作用的那几个改成普通正文，或拆成相邻两页');
  return errors;
}
/* 同一页的标题、副标题、收束句是三个不同的位置，各干各的活：
   标题给判断，副标题给口径，收束句给读者离开这一页时要记住的那一句。
   三者两两复述，页面看上去认真写了三遍，读者拿到的仍然只有一个信息——
   这正是"每页只讲一件事、重点清晰"的反面：不是讲多了，是同一件事占了三处。

   这里用重合率（除以较长的一段）而不是相似度：收束句合理地把标题的判断包含在内，
   真正的复述是"长句里几乎没有新东西"，不是"短句出现在长句里"。 */
function samePageRepetition(facts,{page}={}){
  if(!object(facts))return [];
  const at=page?('第 '+page+' 页'):'本页';
  const fields=[['title','标题'],['lead','副标题'],['takeawayText','收束句']];
  // 探针给的 title 是 {font,text}，蓝图给的可能是纯字符串；两种形状都要能读。
  const valueOf=key=>{const raw=facts[key];return norm(object(raw)?raw.text:raw);};
  const out=[];
  for(let i=0;i<fields.length;i++)for(let j=i+1;j<fields.length;j++){
    const [ka,la]=fields[i],[kb,lb]=fields[j];
    const a=valueOf(ka),b=valueOf(kb);
    if(a.length<6||b.length<6)continue;
    const score=overlapRatio(a,b);
    if(score<SAME_PAGE_OVERLAP)continue;
    out.push({code:'N-SAME-PAGE-REPEAT',page,fields:[ka,kb],score:Math.round(score*100),
      message:at+la+'与'+lb+' 的重合率 '+Math.round(score*100)+'%：'
        +'两者说的是同一句话。标题给判断、副标题给口径、收束句给要记住的那一句，'
        +'三处复述同一句，页面写了两遍却只传达一个信息'});
  }
  return out;
}

module.exports={POLICY,ARCS,ARC_TERMINAL_BEATS,TAKEAWAY_ATTR,TAKEAWAY_ROLE,
  MIN_ADD,MIN_REASON,DUPLICATE_ADD,DUPLICATE_OTHER,SAME_PAGE_OVERLAP,REVIEW_TAKEAWAY_OVERLAP,NARRATIVE_ROLES,
  similarity,overlapRatio,isNarrativeTask,hasNarrativeMarkers,policyErrors,validate,diagnostics,coverageErrors,duplicateAdds,pageFocusErrors,samePageRepetition};
