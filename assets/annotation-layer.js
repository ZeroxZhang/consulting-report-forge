/* 跨图型通用标注层：统一锚点契约、候选放置、碰撞避让、引线路由与审计。
   纯几何，不依赖 DOM；测量函数由调用方注入（Node 用 fontkit，浏览器用保守估宽）。 */
(function (root, factory) {
  var G = (typeof module === 'object' && module.exports) ? require('./exhibit-geometry.js') : (root && root.ExhibitGeometry);
  var api = factory(G);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AnnotationLayer = api;
})(typeof window !== 'undefined' ? window : null, function (G) {
  'use strict';
  if (!G) throw new Error('AnnotationLayer 需要 ExhibitGeometry');

  var OPPOSITE = { right: 'left', left: 'right', top: 'bottom', bottom: 'top' };
  var STACK_AXIS = { right: 'v', left: 'v', top: 'h', bottom: 'h' };
  var ATTR_KEYS = ['anchor-id', 'anchor-x', 'anchor-y', 'anchor-side', 'anchor-box', 'anchor-label'];

  /* 保守估宽：只用于无法取得真实字形时的候选选择，不声称取代浏览器测量。 */
  function estimateMeasure(text, options) {
    var size = (options && options.size) || 14;
    var width = Array.from(String(text)).reduce(function (n, ch) {
      return n + size * (/[\u0000-\u007f]/.test(ch) ? 0.62 : 1);
    }, 0);
    return { width: width };
  }

  function createScene(options) {
    var o = options || {};
    var width = G.finite(o.width === undefined ? 960 : o.width, 'scene.width');
    var height = G.finite(o.height === undefined ? 500 : o.height, 'scene.height');
    return {
      version: '1.0.0',
      width: width,
      height: height,
      fontSize: G.finite(o.fontSize === undefined ? 14 : o.fontSize, 'scene.fontSize'),
      measure: typeof o.measure === 'function' ? o.measure : estimateMeasure,
      canvas: o.canvas || { x: 8, y: 4, width: width - 16, height: height - 8 },
      plot: o.plot || null,
      labels: [],
      obstacles: [],
      routes: [],
      anchors: {}
    };
  }

  function rectOf(x, y, width, height) {
    [x, y, width, height].forEach(function (v, i) { G.finite(v, 'rect[' + i + ']'); });
    if (width < 0 || height < 0) throw new Error('矩形宽高不可为负');
    return { x: x, y: y, width: width, height: height };
  }

  /* 锚点 id 是拿图形标签拼出来的（point:<期号>|<系列>），作者在 pages.json 里手写时多一个空格、
     改一次全半角，整条标注就落空——而"改显示文案顺手拆掉标注"是最难自查的一类回归。
     所以精确匹配优先，退一步按"去掉全部空白"再比一次；只在唯一命中时才认，
     两个 id 归一化后撞车仍按未命中处理，避免悄悄指到另一条数据上。
     每次现扫 scene.anchors，不另建索引：锚点既可能来自 addAnchor，也可能整份来自 collect，
     维护第二份索引迟早会和它漂移。单图锚点是几十条量级，这点开销不值得换一份可能错的状态。 */
  function normAnchorId(id) { return String(id).replace(/\s+/g, ''); }

  function lookupAnchor(scene, id) {
    if (id === undefined || id === null) return null;
    var anchors = scene.anchors || {};
    if (anchors[id]) return anchors[id];
    var key = normAnchorId(id), hits = [];
    Object.keys(anchors).forEach(function (k) { if (normAnchorId(k) === key) hits.push(k); });
    return hits.length === 1 ? anchors[hits[0]] : null;
  }

  /* 未命中时补一句：是"根本没有"还是"归一化后撞车"。后者按未知报会让作者去查一个确实存在的 id。 */
  function anchorMissNote(scene, id) {
    var key = normAnchorId(id), clashes = Object.keys(scene.anchors || {}).filter(function (k) { return normAnchorId(k) === key; });
    return clashes.length > 1 ? '——去掉空白后同时匹配 ' + clashes.join('、') + '，无法确定用哪一个' : '';
  }

  function addAnchor(scene, anchor) {
    if (!anchor || typeof anchor.id !== 'string' || !anchor.id.trim()) throw new Error('锚点需要非空 id');
    if (scene.anchors[anchor.id]) throw new Error('锚点 id 重复: ' + anchor.id);
    G.finite(anchor.x, 'anchor.x'); G.finite(anchor.y, 'anchor.y');
    if (anchor.side !== undefined && !OPPOSITE[anchor.side]) throw new Error('锚点 side 应为 left/right/top/bottom');
    if (anchor.value !== undefined && anchor.value !== null) G.finite(anchor.value, 'anchor.value');
    var stored = Object.assign({}, anchor);
    if (anchor.box) stored.box = rectOf(anchor.box.x, anchor.box.y, anchor.box.width, anchor.box.height);
    scene.anchors[anchor.id] = stored;
    return stored;
  }

  function addObstacle(scene, obstacle) {
    if (!obstacle || !obstacle.box) throw new Error('障碍需要 box');
    var stored = { id: obstacle.id === undefined ? ('obstacle-' + scene.obstacles.length) : String(obstacle.id), box: rectOf(obstacle.box.x, obstacle.box.y, obstacle.box.width, obstacle.box.height), anchor: obstacle.anchor };
    scene.obstacles.push(stored);
    return stored;
  }

  function addRoute(scene, route) {
    if (!route || !Array.isArray(route.points) || route.points.length < 2) throw new Error('路线需要至少两个点');
    var stored = Object.assign({ id: route.id === undefined ? ('route-' + scene.routes.length) : route.id }, route);
    scene.routes.push(stored);
    return stored;
  }

  function addLabel(scene, label) {
    if (!label || !label.box) throw new Error('文字需要 box');
    var stored = Object.assign({}, label, { box: rectOf(label.box.x, label.box.y, label.box.width, label.box.height) });
    scene.labels.push(stored);
    return stored;
  }

  function setCanvas(scene, canvas) {
    scene.canvas = rectOf(canvas.x, canvas.y, canvas.width, canvas.height);
    return scene.canvas;
  }

  /* 标注是事务性的：整批失败不留半成品，调用方可以扩容后原样重试同一场景。 */
  function snapshot(scene) {
    return { labels: scene.labels.length, routes: scene.routes.length };
  }

  function restore(scene, mark) {
    if (!mark) return scene;
    scene.labels.length = Math.min(scene.labels.length, mark.labels);
    scene.routes.length = Math.min(scene.routes.length, mark.routes);
    return scene;
  }

  function sizeOf(scene, text, options) {
    var o = options || {};
    var size = G.finite(o.size === undefined ? scene.fontSize : o.size, 'size');
    var weight = o.weight === undefined ? 400 : o.weight;
    var value = String(text);
    if (!value.trim()) throw new Error('标注文字不能为空');
    var measured = scene.measure(value, { size: size, weight: weight });
    var width = G.finite(measured && measured.width, 'measure.width');
    return { text: value, size: size, weight: weight, width: width, height: size * 1.448, ascent: size * 1.16, descent: size * 0.288, lineHeight: size * 1.55 };
  }

  /* 锚点的参考点是图元中心；引线接在图元边界上，标注框也贴边界外排。 */
  function edgesOf(anchor) {
    var b = anchor.box;
    if (!b) return { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
    return { left: b.x, right: b.x + b.width, top: b.y, bottom: b.y + b.height };
  }

  function attachFor(anchor, side, edges) {
    if (anchor.attach && anchor.attach.side === side) return { x: anchor.attach.x, y: anchor.attach.y };
    if (side === 'right') return { x: edges.right, y: anchor.y };
    if (side === 'left') return { x: edges.left, y: anchor.y };
    if (side === 'top') return { x: anchor.x, y: edges.top };
    return { x: anchor.x, y: edges.bottom };
  }

  function candidates(scene, anchor, text, options) {
    var o = options || {};
    var size = sizeOf(scene, text, o);
    var gap = G.finite(o.gap === undefined ? 16 : o.gap, 'gap');
    var step = G.finite(o.step === undefined ? size.height + 7 : o.step, 'step');
    var rings = o.rings === undefined ? 8 : o.rings;
    var edges = edgesOf(anchor), out = [];
    if (o.inside !== false && anchor.box && anchor.box.width >= size.width + 12 && anchor.box.height >= size.height + 8) {
      out.push({ placement: 'inside', side: null, noLeader: true, anchorPt: { x: anchor.x, y: anchor.y }, box: { x: anchor.x - size.width / 2, y: anchor.y - size.height / 2, width: size.width, height: size.height } });
    }
    var sides = [];
    [anchor.side, anchor.side ? OPPOSITE[anchor.side] : null, 'right', 'left', 'top', 'bottom'].forEach(function (side) {
      if (side && sides.indexOf(side) < 0) sides.push(side);
    });
    if (Array.isArray(o.sides)) sides = o.sides.concat(sides.filter(function (s) { return o.sides.indexOf(s) < 0; }));
    sides.forEach(function (side) {
      var anchorPt = attachFor(anchor, side, edges);
      for (var d = 0; d <= rings; d++) {
        var signs = d === 0 ? [1] : [1, -1];
        for (var k = 0; k < signs.length; k++) {
          var sign = signs[k], box;
          if (STACK_AXIS[side] === 'v') {
            box = {
              x: side === 'right' ? edges.right + gap : edges.left - gap - size.width,
              y: anchor.y - size.height / 2 + d * sign * step,
              width: size.width, height: size.height
            };
          } else {
            box = {
              x: anchor.x - size.width / 2 + d * sign * (size.width + 12),
              y: side === 'bottom' ? edges.bottom + gap : edges.top - gap - size.height,
              width: size.width, height: size.height
            };
          }
          out.push({ placement: 'outside', side: side, box: box, anchorPt: anchorPt });
        }
      }
    });
    return { size: size, list: out, edges: edges };
  }

  /* 返回 true 或 {ok:false, reason}：拒绝原因要能指导作者改规格。 */
  function accepted(scene, candidate, options) {
    var o = options || {}, box = candidate.box;
    var pad = o.pad === undefined ? 4 : o.pad;
    if (scene.canvas && !G.contains(scene.canvas, box)) return { ok: false, reason: 'canvas' };
    var plot = o.plot === undefined ? scene.plot : o.plot;
    if (plot && plot.top !== undefined && plot.bottom !== undefined) {
      var slackTop = o.plotSlackTop === undefined ? 20 : o.plotSlackTop;
      var slackBottom = o.plotSlackBottom === undefined ? 5 : o.plotSlackBottom;
      if (box.y < plot.top - slackTop || box.y + box.height > plot.bottom + slackBottom) return { ok: false, reason: 'plot' };
    }
    var hitLabel = scene.labels.find(function (l) { return l.id !== o.owner && G.intersects(box, l.box, pad); });
    if (hitLabel) return { ok: false, reason: 'label', against: hitLabel.id, text: hitLabel.text };
    var own = o.ownObstacles || [];
    var obstaclePad = o.obstaclePad === undefined ? 3 : o.obstaclePad;
    var hitMark = scene.obstacles.find(function (ob) { return own.indexOf(ob.id) < 0 && G.intersects(box, ob.box, obstaclePad); });
    if (hitMark) return { ok: false, reason: 'mark', against: hitMark.id };
    if (candidate.placement === 'inside') {
      var container = scene.obstacles.filter(function (ob) { return own.indexOf(ob.id) >= 0 && G.contains(ob.box, box, 2); });
      if (!container.length) return { ok: false, reason: 'inside-container' };
    }
    var routePad = o.routePad === undefined ? 3 : o.routePad;
    var hitRoute = scene.routes.find(function (r) {
      return r.owner !== o.owner && r.points && r.points.slice(1).some(function (p, i) { return G.lineHitsRect(r.points[i], p, box, routePad); });
    });
    if (hitRoute) return { ok: false, reason: 'route', against: hitRoute.id };
    return true;
  }

  function destinationFor(box, side) {
    if (side === 'right') return { x: box.x, y: box.y + box.height / 2 };
    if (side === 'left') return { x: box.x + box.width, y: box.y + box.height / 2 };
    if (side === 'bottom') return { x: box.x + box.width / 2, y: box.y };
    return { x: box.x + box.width / 2, y: box.y + box.height };
  }

  function leader(scene, candidate, options) {
    var o = options || {};
    if (candidate.placement === 'inside' || candidate.noLeader || o.leader === false) return null;
    var side = candidate.side || 'right', box = candidate.box, a = candidate.anchorPt;
    var dest = destinationFor(box, side);
    var offsets = o.offsets || [6, 9, 12];
    var allow = o.allowObstacle || [];
    for (var i = 0; i < offsets.length; i++) {
      var off = offsets[i], points;
      if (STACK_AXIS[side] === 'v') {
        var elbowX = a.x + (side === 'right' ? off : -off);
        points = [a, { x: elbowX, y: a.y }, { x: elbowX, y: dest.y }, dest];
      } else {
        var elbowY = a.y + (side === 'bottom' ? off : -off);
        points = [a, { x: a.x, y: elbowY }, { x: dest.x, y: elbowY }, dest];
      }
      if (routeClear(scene, points, o, allow)) return { points: points, side: side };
    }
    return false;
  }

  function routeClear(scene, points, options, allow) {
    var o = options || {}, allowList = allow || o.allowObstacle || [];
    var labelPad = o.leaderLabelPad === undefined ? 2 : o.leaderLabelPad;
    var obstaclePad = o.leaderObstaclePad === undefined ? 0 : o.leaderObstaclePad;
    for (var i = 1; i < points.length; i++) {
      var p0 = points[i - 1], p1 = points[i];
      if (scene.labels.some(function (l) { return l.id !== o.owner && G.lineHitsRect(p0, p1, l.box, labelPad); })) return false;
      if (scene.obstacles.some(function (ob) { return allowList.indexOf(ob.id) < 0 && G.lineHitsRect(p0, p1, ob.box, obstaclePad); })) return false;
      if (scene.routes.some(function (r) { return r.owner !== o.owner && r.points && r.points.slice(1).some(function (p, k) { return G.lineHitsRect(p0, p1, { x: Math.min(r.points[k].x, p.x), y: Math.min(r.points[k].y, p.y), width: Math.abs(p.x - r.points[k].x), height: Math.abs(p.y - r.points[k].y) }, 0); }); })) return false;
    }
    return true;
  }

  function template(text, values) {
    return String(text).replace(/\{(\w+)\}/g, function (m, key) {
      return values[key] === undefined || values[key] === null ? m : String(values[key]);
    });
  }

  function resolveText(scene, request, options) {
    var o = options || {}, kind = request.kind || 'value';
    var fmt = Object.assign({}, o.format || {}, request.format || {});
    var need = function (id) { var v = lookupAnchor(scene, id); if (!v) throw new Error('未知标注端点: ' + id + anchorMissNote(scene, id)); return v; };
    var self = need(request.on), derived = null, value;
    if (kind === 'note') {
      if (!request.text) throw new Error('note 标注需要 text');
      if (request.from === undefined) return template(request.text, { label: self.label, value: self.value === undefined || self.value === null ? '' : G.semanticFormat(self.value, Object.assign({}, fmt, { kind: 'value' })) });
      var noteFrom = need(request.from), noteTo = need(request.to === undefined ? request.on : request.to);
      var noteChange = G.change(noteFrom.value, noteTo.value, Object.assign({}, fmt, { kind: 'delta' }));
      return template(request.text, { label: self.label, value: G.semanticFormat(self.value, Object.assign({}, fmt, { kind: 'value' })), delta: noteChange.deltaLabel, rate: noteChange.rateLabel, start: noteChange.start, end: noteChange.end });
    }
    if (request.from === undefined && ['delta', 'rate', 'pp', 'multiple', 'value'].indexOf(kind) >= 0) {
      // 自身语义：本锚点原值按声明的数值语义格式化，不需要第二端点。
      value = G.semanticFormat(self.value, Object.assign({}, fmt, { kind: kind === 'value' ? 'value' : kind }));
      if (request.text !== undefined) return template(request.text, { label: self.label, value: value });
      return [request.prefix, value, request.suffix].filter(function (v) { return v !== undefined && v !== null && v !== ''; }).join(' ');
    }
    if (request.from === undefined && kind === 'bracket') throw new Error('bracket 标注需要 from');
    if (kind === 'delta' || kind === 'rate' || kind === 'pp' || kind === 'multiple' || kind === 'bracket') {
      var from = need(request.from), to = need(request.to === undefined ? request.on : request.to);
      derived = G.change(from.value, to.value, Object.assign({}, fmt, { kind: kind === 'pp' ? 'pp' : 'delta' }));
      if (kind === 'rate') value = derived.rateLabel;
      else if (kind === 'pp') value = derived.deltaLabel;
      else if (kind === 'multiple') value = G.semanticFormat(to.value / from.value, Object.assign({}, fmt, { kind: 'multiple' }));
      else value = derived.deltaLabel;
    } else if (kind === 'share') {
      var total = request.of === undefined
        ? Object.keys(scene.anchors).reduce(function (s, id) { var a = scene.anchors[id]; return a.group !== undefined && a.group === self.group ? s + a.value : s; }, 0)
        : need(request.of).value;
      if (!total) throw new Error('份额标注缺少有效分母');
      value = G.semanticFormat(self.value / total, Object.assign({}, fmt, { kind: 'rate', decimals: fmt.shareDecimals === undefined ? 0 : fmt.shareDecimals }));
    } else if (kind === 'rank') {
      var group = Object.keys(scene.anchors).map(function (id) { return scene.anchors[id]; })
        .filter(function (a) { return self.group === undefined ? a.value !== undefined : a.group === self.group && a.group !== undefined; })
        .sort(function (a, b) { return b.value - a.value; });
      var rank = group.findIndex(function (a) { return a.id === self.id; }) + 1;
      if (!rank) throw new Error('排名标注需要可比较的同组锚点');
      value = '第 ' + rank + ' 位';
    } else {
      value = G.semanticFormat(self.value, Object.assign({}, fmt, { kind: 'value' }));
    }
    if (request.text !== undefined) {
      return template(request.text, Object.assign({ label: self.label, value: value, delta: derived && derived.deltaLabel, rate: derived && derived.rateLabel, start: derived && derived.start, end: derived && derived.end }));
    }
    return [request.prefix, value, request.suffix].filter(function (v) { return v !== undefined && v !== null && v !== ''; }).join(' ');
  }

  function place(scene, request, options) {
    var o = options || {};
    if (!request || !request.on) throw new Error('标注需要 on');
    var anchor = lookupAnchor(scene, request.on);
    if (!anchor) throw new Error('未知标注锚点: ' + request.on + anchorMissNote(scene, request.on));
    var text = request.resolvedText === undefined ? resolveText(scene, request, o) : request.resolvedText;
    var id = request.id === undefined ? ('annotation-' + scene.labels.length) : String(request.id);
    var placeOptions = Object.assign({}, o, request.place || {}, { owner: id });
    var built = candidates(scene, anchor, text, placeOptions);
    var own = [anchor.markId, anchor.id].filter(Boolean);
    var rejected = [];
    for (var i = 0; i < built.list.length; i++) {
      var cand = built.list[i];
      var verdict = accepted(scene, cand, Object.assign({}, placeOptions, { ownObstacles: own }));
      if (verdict !== true) { rejected.push(verdict); continue; }
      var route = leader(scene, cand, Object.assign({}, placeOptions, { allowObstacle: own }));
      if (route === false) { rejected.push({ ok: false, reason: 'leader-route', side: cand.side }); continue; }
      var item = {
        id: id, kind: request.kind || 'value', anchor: anchor.id, text: text,
        placement: cand.placement, side: cand.side, box: cand.box,
        baseline: cand.box.y + built.size.ascent, anchorMode: cand.placement === 'inside' ? 'middle' : (cand.side === 'left' ? 'end' : 'start'),
        role: request.role || 'annotation', size: built.size, anchorPt: cand.anchorPt,
        leader: route ? route.points : null, leaderSide: route ? route.side : null,
        color: request.color, weight: request.weight === undefined ? 400 : request.weight,
        target: request.target === undefined ? null : request.target,
        from: request.from === undefined ? null : request.from,
        to: request.to === undefined ? null : request.to
      };
      addLabel(scene, item);
      if (route) addRoute(scene, { id: 'leader-' + id, role: 'leader', owner: id, points: route.points, color: request.leaderColor });
      return item;
    }
    var tally = {};
    rejected.forEach(function (v) { tally[v.reason] = (tally[v.reason] || 0) + 1; });
    var why = Object.keys(tally).sort(function (a, b) { return tally[b] - tally[a]; }).map(function (k) { return k + '×' + tally[k]; }).join('、');
    var first = rejected.find(function (v) { return v.text || v.against; });
    var detail = first ? '（首要冲突：' + [first.reason, first.against, first.text].filter(Boolean).join(' / ') + '）' : '';
    throw new Error('无法无碰撞放置标注 ' + request.on + '（' + text + '）：' + built.list.length + ' 个候选全部被拒 [' + why + ']' + detail + '。增加画布、减少标注或分面');
  }

  function annotate(scene, requests, options) {
    var o = options || {};
    if (requests === undefined) return { items: [], issues: [] };
    if (!Array.isArray(requests)) throw new Error('annotations 须为数组');
    var prepared = requests.map(function (r, i) {
      var anchor = lookupAnchor(scene, r.on);
      var area = anchor && anchor.box ? anchor.box.width * anchor.box.height : 0;
      return { request: r, index: i, area: area };
    });
    // 小目标先占位：大目标的宽松候选会挤掉小目标唯一出路。
    prepared.sort(function (a, b) { return a.area - b.area || a.index - b.index; });
    var items = [], issues = [], mark = snapshot(scene);
    try {
      prepared.forEach(function (entry) {
        try {
          items.push(place(scene, entry.request, o));
        } catch (error) {
          if (o.onFailure === 'report') issues.push({ code: 'annotation-placement', annotation: entry.request.id || entry.request.on, message: error.message });
          else throw error;
        }
      });
    } catch (error) {
      restore(scene, mark);
      throw error;
    }
    return { items: items, issues: issues };
  }

  function audit(scene, options) {
    var o = options || {};
    var items = scene.labels.filter(function (l) { return l.kind !== undefined && l.kind !== 'text' && l.anchor; });
    var issues = [];
    items.forEach(function (item, i) {
      if (scene.canvas && !G.contains(scene.canvas, item.box)) issues.push({ code: 'annotation-outside', annotation: item.id });
      for (var j = i + 1; j < items.length; j++) {
        if (G.intersects(item.box, items[j].box, 1)) issues.push({ code: 'annotation-collision', annotations: [item.id, items[j].id] });
      }
      scene.obstacles.forEach(function (ob) {
        if (item.placement !== 'inside' && G.intersects(ob.box, item.box, 2)) issues.push({ code: 'annotation-mark-collision', annotation: item.id, mark: ob.id });
      });
      if (item.leader) {
        var a = item.leader[0], b = item.leader[1];
        if (Math.abs(a.x - item.anchorPt.x) > 0.001 || Math.abs(a.y - item.anchorPt.y) > 0.001) issues.push({ code: 'leader-unbound', annotation: item.id });
        var dest = destinationFor(item.box, item.leaderSide);
        var last = item.leader[item.leader.length - 1];
        if (Math.abs(last.x - dest.x) > 0.001 || Math.abs(last.y - dest.y) > 0.001) issues.push({ code: 'leader-endpoint', annotation: item.id });
        void b;
      }
    });
    return { ok: issues.length === 0, issues: issues, count: items.length, scope: o.scope || 'placement, collision, leader binding' };
  }

  function anchorAttrs(anchor) {
    if (!anchor || anchor.id === undefined || anchor.id === null || String(anchor.id).trim() === '') throw new Error('锚点需要非空 id');
    G.finite(anchor.x, 'anchor.x'); G.finite(anchor.y, 'anchor.y');
    var parts = ['data-anchor-id="' + String(anchor.id).replace(/"/g, '&quot;') + '"',
      'data-anchor-x="' + anchor.x + '"', 'data-anchor-y="' + anchor.y + '"'];
    if (anchor.side) parts.push('data-anchor-side="' + anchor.side + '"');
    if (anchor.value !== undefined && anchor.value !== null && Number.isFinite(anchor.value)) parts.push('data-anchor-value="' + anchor.value + '"');
    if (anchor.group !== undefined) parts.push('data-anchor-group="' + String(anchor.group).replace(/"/g, '&quot;') + '"');
    if (anchor.reference) parts.push('data-anchor-reference="true"');
    if (anchor.box) parts.push('data-anchor-box="' + [anchor.box.x, anchor.box.y, anchor.box.width, anchor.box.height].join(',') + '"');
    if (anchor.label) parts.push('data-anchor-label="' + String(anchor.label).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }) + '"');
    return parts.join(' ');
  }

  /* 从任意已生成 SVG 收集锚点：只读显式声明，不推断几何。 */
  function collect(svg) {
    var anchors = {};
    var tagPattern = /<(rect|circle|line|path|polygon|text|g)\b([^>]*)>/g, match;
    while ((match = tagPattern.exec(String(svg)))) {
      var attrs = {}, attrPattern = /([a-zA-Z-]+)="([^"]*)"/g, a;
      while ((a = attrPattern.exec(match[2]))) attrs[a[1]] = a[2];
      if (!attrs['data-anchor-id']) continue;
      var id = attrs['data-anchor-id'];
      if (anchors[id]) throw new Error('SVG 内锚点 id 重复: ' + id);
      var box = attrs['data-anchor-box'] ? attrs['data-anchor-box'].split(',').map(Number) : null;
      anchors[id] = {
        id: id,
        x: Number(attrs['data-anchor-x']), y: Number(attrs['data-anchor-y']),
        side: attrs['data-anchor-side'], label: attrs['data-anchor-label'],
        group: attrs['data-anchor-group'], reference: attrs['data-anchor-reference'] === 'true',
        // 锚点自带原值优先；没有才退回图元上的 data-value（不是每个图元都恰好带着它）。
        value: attrs['data-anchor-value'] !== undefined ? Number(attrs['data-anchor-value'])
          : attrs['data-value'] === undefined ? undefined : Number(attrs['data-value']),
        box: box && box.length === 4 && box.every(Number.isFinite) ? { x: box[0], y: box[1], width: box[2], height: box[3] } : null
      };
      if (!Number.isFinite(anchors[id].x) || !Number.isFinite(anchors[id].y)) throw new Error('锚点缺少显式坐标: ' + id);
    }
    return anchors;
  }

  function esc(value) { return String(value).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }

  /* 默认序列化：引线 + 文字。调用方可用 serialize 覆盖成自己的约定。 */
  function serialize(scene, items, options) {
    var o = options || {}, out = [];
    items.forEach(function (item) {
      if (item.leader) {
        var d = item.leader.map(function (p, i) { return (i ? 'L' : 'M') + ' ' + p.x + ' ' + p.y; }).join(' ');
        out.push('<path d="' + d + '" fill="none" stroke="' + esc(item.leaderColor || o.leaderColor || '#50606E') + '" stroke-width="1"' + attr('data-role', 'leader') + attr('data-annotation-id', item.id) + attr('data-anchor-ref', item.anchor) + attr('data-leader-side', item.leaderSide) + '/>');
        var a = item.leader[0];
        out.push('<circle cx="' + a.x + '" cy="' + a.y + '" r="1.7" fill="' + esc(item.leaderColor || o.leaderColor || '#50606E') + '"' + attr('data-role', 'leader-anchor') + '/>');
      }
      var color = item.color || (item.placement === 'inside' ? o.insideColor || '#FFFFFF' : o.color || '#172C3B');
      // text-anchor 决定绘制原点：start 用左缘，middle 用中心，end 用右缘；声明框始终是左缘起算的矩形。
      var anchorX = item.anchorMode === 'middle' ? item.box.x + item.box.width / 2 : item.anchorMode === 'end' ? item.box.x + item.box.width : item.box.x;
      out.push('<text x="' + anchorX + '" y="' + item.baseline + '"' + attr('text-anchor', item.anchorMode) + ' fill="' + esc(color) + '" font-size="' + item.size.size + '" font-weight="' + (item.weight >= 600 ? 600 : 400) + '"' + attr('data-role', item.role) + attr('data-annotation-id', item.id) + attr('data-anchor-ref', item.anchor) + attr('data-placement', item.placement) + attr('data-label-box', [item.box.x, item.box.y, item.box.width, item.box.height].join(',')) + attr('data-target', item.target) + attr('data-from-key', item.from) + attr('data-to-key', item.to) + '>' + esc(item.text) + '</text>');
    });
    return out.join('');
  }

  function attr(name, value) { return value === undefined || value === null ? '' : ' ' + name + '="' + esc(value) + '"'; }

  /* 自动旁注候选：只从锚点的真实原值派生，不引入外部数字，也不替作者决定采纳。
     每条都带 derived（怎么算的）与 evidence（引用哪些锚点），供作者复核后写进 pages.json。 */
  function propose(scene, options) {
    var o = options || {};
    var rules = o.rules || ['paired', 'target', 'extremes', 'gap', 'share', 'outlier'];
    var isReference = function (a) { return a.reference === true || (typeof a.id === 'string' && a.id.indexOf('target:') === 0); };
    var anchors = Object.keys(scene.anchors).map(function (id) { return scene.anchors[id]; })
      .filter(function (a) { return typeof a.value === 'number' && isFinite(a.value); });
    // 参照锚点（目标线等）不是同类数据点，只参与成对比较，不进极值／差距／份额／离群分组。
    var dataAnchors = anchors.filter(function (a) { return !isReference(a); });
    if (dataAnchors.length < 2 && anchors.length < 2) return [];
    var byId = scene.anchors, out = [], seen = new Set();
    var push = (item, weight) => {
      var key = item.on + '|' + item.kind + '|' + (item.from || '');
      if (!item.on || seen.has(key)) return;
      if (!byId[item.on]) return;
      seen.add(key);
      out.push(Object.assign({ id: 'p-' + item.kind + '-' + item.on, priority: weight }, item));
    };
    if (rules.indexOf('target') >= 0) {
      anchors.forEach(function (anchor) {
        if (typeof anchor.id !== 'string' || anchor.id.indexOf('value:') !== 0) return;
        var target = byId['target:' + anchor.id.slice(6)];
        if (!target || typeof target.value !== 'number' || !isFinite(target.value)) return;
        if (G.close(target.value, anchor.value)) return;
        push({ on: anchor.id, kind: 'delta', from: target.id, to: anchor.id, text: '缺口 {delta}（{rate}）',
          reason: '实际值与目标成对出现，差距应当直接标在指标旁而不是留给读者去减',
          derived: { start: target.value, end: anchor.value, delta: anchor.value - target.value }, evidence: [target.id, anchor.id] }, 0);
      });
    }
    // 配对锚点（start:/end:、两期同实体）最大的变化量，通常是这一页真正要说的事。
    if (rules.indexOf('paired') >= 0) {
      dataAnchors.filter(function (a) { return typeof a.id === 'string' && a.id.indexOf('start:') === 0; }).forEach(function (start) {
        var label = start.id.slice(6), end = byId['end:' + label];
        if (!end || typeof end.value !== 'number' || !isFinite(end.value) || !isFinite(start.value)) return;
        if (G.close(start.value, end.value)) return;
        var delta = end.value - start.value;
        push({ on: end.id, kind: 'delta', from: start.id, to: end.id, text: '{label} {delta}（{rate}）',
          reason: '配对锚点的变化量：两期对比里读者要的是"谁变了多少"，而不是两个时点各自的排名',
          derived: { start: start.value, end: end.value, delta: delta, rate: start.value > 0 ? delta / start.value : null },
          evidence: [start.id, end.id] }, 0.5);
      });
    }
    var groups = {};
    dataAnchors.forEach(function (anchor) { var key = anchor.group === undefined ? '__all__' : String(anchor.group); (groups[key] = groups[key] || []).push(anchor); });
    Object.keys(groups).forEach(function (key) {
      var list = groups[key];
      if (list.length < 2) return;
      var sorted = list.slice().sort(function (a, b) { return b.value - a.value; });
      var top = sorted[0], bottom = sorted[sorted.length - 1], total = list.reduce(function (s, a) { return s + a.value; }, 0);
      if (rules.indexOf('extremes') >= 0) {
        push({ on: top.id, kind: 'value', text: '最高 {value}', reason: '同组最大值：读者第一眼要找的对象',
          derived: { value: top.value, rank: 1 }, evidence: sorted.map(function (a) { return a.id; }) }, 1);
        if (bottom.id !== top.id) push({ on: bottom.id, kind: 'value', text: '最低 {value}', reason: '同组最小值：给最大值一个对照',
          derived: { value: bottom.value, rank: sorted.length }, evidence: sorted.map(function (a) { return a.id; }) }, 3);
      }
      if (rules.indexOf('gap') >= 0 && sorted.length >= 2 && sorted[1].value > 0) {
        push({ on: top.id, kind: 'delta', from: sorted[1].id, to: top.id, text: '领先 {delta}（{rate}）', reason: '第一名与第二名的真实差距',
          derived: { start: sorted[1].value, end: top.value, delta: top.value - sorted[1].value, rate: (top.value - sorted[1].value) / sorted[1].value }, evidence: [top.id, sorted[1].id] }, 2);
      }
      if (rules.indexOf('share') >= 0 && list.length >= 3 && total > 0) {
        push({ on: top.id, kind: 'share', text: '{label} 占本组 {value}', reason: '同组总量已知，最大值应当同时给出份额',
          derived: { value: top.value, total: total, share: top.value / total }, evidence: sorted.map(function (a) { return a.id; }) }, 4);
      }
      if (rules.indexOf('outlier') >= 0 && list.length >= 4) {
        var values = list.map(function (a) { return a.value; }).sort(function (a, b) { return a - b; });
        var mid = values.length % 2 ? values[(values.length - 1) / 2] : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
        var mad = values.map(function (v) { return Math.abs(v - mid); }).sort(function (a, b) { return a - b; })[Math.floor(values.length / 2)];
        if (mad > 0) {
          var far = list.slice().sort(function (a, b) { return Math.abs(b.value - mid) - Math.abs(a.value - mid); })[0];
          if (Math.abs(far.value - mid) / mad > 3.5) push({ on: far.id, kind: 'value', text: '{label} {value}，偏离中位数 {reasonValue} 倍 MAD',
            reason: '同组里偏离中位数超过 3.5 倍 MAD，值得核实口径或成因',
            derived: { value: far.value, median: mid, mad: mad, deviations: Math.abs(far.value - mid) / mad }, evidence: sorted.map(function (a) { return a.id; }) }, 5);
        }
      }
    });
    var max = o.max === undefined ? 6 : o.max;
    // 变化量大的配对优先于变化量小的：同一条规则内部按影响排序。
    return out.sort(function (a, b) {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return Math.abs((b.derived && b.derived.delta) || 0) - Math.abs((a.derived && a.derived.delta) || 0);
    }).slice(0, max).map(function (item) {
      delete item.priority;
      return item;
    });
  }

  /* 标注语义的封闭枚举：kind → 需要的字段。resolveText 与页面合同共用这一份。 */
  var KINDS = {
    value: {}, delta: {}, rate: {}, pp: {}, multiple: {}, share: {}, rank: {},
    note: { requiresText: true },
    bracket: { requiresFrom: true }
  };

  return {
    version: '1.0.0',
    kinds: KINDS,
    kindList: Object.keys(KINDS),
    attrKeys: ATTR_KEYS.slice(),
    estimateMeasure: estimateMeasure,
    createScene: createScene,
    lookupAnchor: lookupAnchor,
    addAnchor: addAnchor,
    addObstacle: addObstacle,
    addRoute: addRoute,
    addLabel: addLabel,
    setCanvas: setCanvas,
    snapshot: snapshot,
    restore: restore,
    sizeOf: sizeOf,
    candidates: candidates,
    accepted: accepted,
    leader: leader,
    place: place,
    annotate: annotate,
    propose: propose,
    resolveText: resolveText,
    audit: audit,
    anchorAttrs: anchorAttrs,
    collect: collect,
    serialize: serialize,
    destinationFor: destinationFor
  };
});
