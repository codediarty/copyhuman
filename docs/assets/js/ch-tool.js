/* 카피휴먼 검사 도구: ① 글 넣기 → ② AI 작성률 확인(결과확인서) → ③ 휴머나이징
   - 엔진: AIMarker 엔진 서버(DET · HUM)를 먼저 쓰고, 닿지 않으면 브라우저 안 CH-Lite로 검사합니다.
   - 카피킬러 AI생성검사 결과확인서(PDF)를 올리면 표시된 영역을 그대로 불러와 그 문장만 다듬을 수 있습니다.
   - 결과의 모든 수치는 엔진이 낸 실제 값입니다. 고정값이나 부풀린 값은 쓰지 않습니다. */
(function () {
  'use strict';
  var CH = window.CH, CFG = window.CH_CFG || {}, LITE = window.CHLite, CKP = window.CHCK;
  if (!CH || !LITE) return;
  var $ = CH.$, $$ = CH.$$, esc = CH.esc, ico = CH.ico;
  var FREE_MAX = CFG.freeMax || 6000, PAID_MAX = CFG.paidMax || 50000, CHUNK = CFG.chunk || 6000;
  var KINDKO = { thesis: '논문', report: '레포트 · 과제', resume: '자기소개서', etc: '기타' };

  function TI() { return window.AMTextIn; }
  function canon(t) { return TI() ? TI().canon(t) : LITE.canon(t); }
  function noSp(t) { return String(t || '').replace(/\s+/g, '').length; }
  function nowStr() { var d = new Date(), p = function (x) { return ('0' + x).slice(-2); }; return d.getFullYear() + '.' + p(d.getMonth() + 1) + '.' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function seq(list, fn) { var out = []; return list.reduce(function (p, x, i) { return p.then(function () { return fn(x, i); }).then(function (r) { out.push(r); }); }, Promise.resolve()).then(function () { return out; }); }

  /* 글 나누기: 문단 단위로 CHUNK자 이하, 긴 문단은 문장 끝에서 */
  function chunk(text, size) {
    size = size || CHUNK;
    var t = String(text), parts = [], seps = [];
    if (t.length <= size) return { parts: [t], seps: [] };
    var ps = t.split(/(\n{2,})/), cur = '', curSep = '';
    function push(s) { if (s) { parts.push(s); } }
    for (var i = 0; i < ps.length; i += 2) {
      var p = ps[i], sep = ps[i + 1] || '';
      if (p.length > size) {
        if (cur) { push(cur); seps.push(curSep || '\n\n'); cur = ''; }
        var ss = p.match(/[^.?!。]+[.?!。]+["'”’)]*\s*|[^.?!。]+$/g) || [p], b = '';
        ss.forEach(function (s) { if ((b + s).length > size && b) { push(b.replace(/\s+$/, '')); seps.push(' '); b = ''; } b += s; });
        cur = b.replace(/\s+$/, ''); curSep = sep;
        continue;
      }
      if (cur && (cur + curSep + p).length > size) { push(cur); seps.push(curSep || '\n\n'); cur = p; }
      else cur = cur ? cur + curSep + p : p;
      curSep = sep;
    }
    if (cur) push(cur);
    while (seps.length > parts.length - 1) seps.pop();
    return { parts: parts, seps: seps };
  }

  /* 서버 · 간이 엔진 결과를 같은 꼴로 */
  /* 엔진이 보낸 문구를 사이트의 확정적인 말로: 의심 → 검출 */
  function firm(t) {
    return typeof t === 'string' ? t.replace(/AI 의심 문장/g, 'AI 검출 문장').replace(/의심 문장/g, '검출 문장').replace(/AI 의심 구간/g, 'AI 검출 구간').replace(/의심 구간/g, '검출 구간')
      .replace(/AI 작성 패턴과 비슷한 문장으로 검출되었습니다/g, 'AI 작성 패턴으로 검출되었습니다').replace(/현재 상태로 제출 · 게시하는 것은 권장하지 않습니다\./g, '이 상태로는 제출하지 마세요.') : t;
  }
  function bandOf(b, aiN) {
    var k = (b && b.key) || 'short';
    var T = { unfit: ['위험', '위험 · AI 글로 판정됩니다. 이대로 제출하면 안 됩니다'], risk: ['주의', '주의 · AI 검출 문장이 그대로 남습니다. 제출 전에 고치세요'], safe: ['양호', '양호 · AI 패턴이 검출되지 않았습니다'], caution: ['양호', '양호 · AI처럼 읽히는 표현이 있습니다'], short: ['판단 보류', '판단 보류 · 글이 짧아 판정하지 않았습니다'] }[k] || ['판단 보류', '판단 보류'];
    var label = T[1];
    if ((k === 'safe' || k === 'caution') && aiN > 0) label = '양호 · 그래도 AI 검출 문장 ' + aiN + '개는 고치세요';
    return { key: k === 'caution' ? 'safe' : k, ko: T[0], label: label, why: ((b && b.why) || []).map(CH.bandWord).map(firm) };
  }
  /* 결과확인서의 AI작성률을 카피휴먼 판정 기준(위험 40% 이상 · 주의 20% 이상)으로 읽음 */
  function bandOfRate(rate, aiN) {
    var k = rate == null ? 'short' : rate >= 40 ? 'unfit' : rate >= 20 ? 'risk' : 'safe';
    var why = rate == null ? [] : [k === 'unfit' ? 'AI작성률 ' + rate + '%(위험 기준 40% 이상)' : k === 'risk' ? 'AI작성률 ' + rate + '%(주의 기준 20% 이상)' : 'AI작성률 ' + rate + '%(주의 기준 20% 미만)'];
    return bandOf({ key: k, why: why }, aiN);
  }
  function normalize(r, extra) {
    var a = r.ai || r.aiAfter || {};
    var N = {
      engine: r.engine === 'lite' ? 'lite' : 'server', full: !!r.full, rate: a.rate || 0, n: a.n || 0, chars: a.chars || 0, aiChars: a.aiChars || 0,
      aiN: a.aiN != null ? a.aiN : ((a.lv || {}).hi || 0) + ((a.lv || {}).mid || 0) + ((a.lv || {}).low || 0), lv: a.lv || { hi: 0, mid: 0, low: 0 },
      band: bandOf(a.band, a.aiN != null ? a.aiN : ((a.lv || {}).hi || 0) + ((a.lv || {}).mid || 0) + ((a.lv || {}).low || 0)),
      segN: a.segN || 0, segAi: a.segAi || 0, chat: a.chat || 0, feat: a.feat || [], opinion: (a.opinion || []).map(CH.bandWord).map(firm), cn: a.cn || '',
      sentences: a.sentences || [], segs: a.segs || null, model: a.model || '', critName: a.critName || '', samples: r.samples || [], shown: a.shown, locked: !!a.locked || !r.full
    };
    if (N.engine === 'lite') N.locked = true;
    Object.keys(extra || {}).forEach(function (k) { N[k] = extra[k]; });
    return N;
  }
  function opinionOf(M) {
    var o = [], top = M.feat.slice(0, 2).map(function (f) { return "'" + f.name + "'"; }).join('과 ');
    o.push('검사한 글 ' + CH.n(M.chars) + '자 가운데 ' + CH.n(M.aiChars) + '자(' + M.rate + '%)가 AI 작성 패턴과 비슷한 문장으로 나왔습니다.');
    o.push(M.segN + '개 구간 가운데 ' + M.segAi + '개 구간에서 AI 작성 패턴이 뚜렷합니다.');
    if (top) o.push('가장 많이 나온 AI 문체 특성은 ' + top + '입니다.');
    o.push('AI 검출 문장은 ' + M.aiN + '개(높음 ' + M.lv.hi + ' · 중간 ' + M.lv.mid + ' · 낮음 ' + M.lv.low + ')입니다. 높음 · 중간 문장부터 고치면 AI 작성률이 가장 크게 내려갑니다.');
    o.push('검사기마다 기준이 달라 카피킬러 · GPT킬러 같은 다른 검사기에서는 이보다 높게 나올 수 있습니다. 검출 문장이 남아 있으면 제출 전에 고치세요.');
    return o;
  }
  function merge(rs, full, src) {
    if (rs.length === 1) return normalize(rs[0], { full: full, total: src.length });
    var M = { engine: 'server', full: full, rate: 0, n: 0, chars: 0, aiChars: 0, aiN: 0, lv: { hi: 0, mid: 0, low: 0 }, segN: 0, segAi: 0, chat: 0, feat: [], sentences: [], segs: [], samples: [], cn: '', total: src.length, locked: !full };
    var poff = 0, soff = 0, F = {};
    rs.forEach(function (r) {
      var a = r.ai || {}, ss = a.sentences || [], maxp = -1;
      ss.forEach(function (s) { var c = Object.assign({}, s); c.para = (s.para || 0) + poff; M.sentences.push(c); if ((s.para || 0) > maxp) maxp = s.para || 0; });
      (a.segs || []).forEach(function (g) { var c = Object.assign({}, g); c.s = g.s + soff; c.e = g.e + soff; M.segs.push(c); });
      poff += maxp + 1; soff += ss.length;
      M.n += a.n || 0; M.chars += a.chars || 0; M.aiChars += a.aiChars || 0; M.segN += a.segN || 0; M.segAi += a.segAi || 0; M.chat += a.chat || 0;
      if (a.lv) { M.lv.hi += a.lv.hi || 0; M.lv.mid += a.lv.mid || 0; M.lv.low += a.lv.low || 0; }
      (a.feat || []).forEach(function (f) { var o = F[f.cat] = F[f.cat] || { cat: f.cat, name: f.name, n: 0, segs: 0, tags: [], why: f.why, lock: 0 }; o.n += f.n || 0; o.segs += f.segs || 0; if (f.lock) o.lock = 1; (f.tags || []).forEach(function (t) { if (o.tags.indexOf(t) < 0 && o.tags.length < 4) o.tags.push(t); }); });
      if (r.samples) M.samples = M.samples.concat(r.samples);
      if (!M.cn && a.cn) M.cn = a.cn; M.model = a.model || M.model; M.critName = a.critName || M.critName;
    });
    M.aiN = M.lv.hi + M.lv.mid + M.lv.low;
    M.rate = M.chars ? Math.round(M.aiChars * 100 / M.chars) : 0;
    M.feat = Object.keys(F).map(function (k) { var f = F[k]; f.share = M.segAi ? Math.round(f.segs * 100 / M.segAi) : 0; return f; }).sort(function (a, b) { return (b.segs - a.segs) || (b.n - a.n); });
    M.band = bandOf(LITE.judge({ chars: M.chars, rate: M.rate, segN: M.segN, segAi: M.segAi, chat: M.chat, hi: M.lv.hi, mid: M.lv.mid }), M.aiN);
    M.opinion = opinionOf(M).map(firm);
    if (!full) M.segs = null;
    return M;
  }

  /* ---------- 그리기 ---------- */
  var BICO = { unfit: 'alert', risk: 'tri', safe: 'check', short: 'alert' };
  function gauge(rate) {
    var w = Math.max(1.5, Math.min(100, rate));
    return '<div class="gauge" aria-hidden="true"><div class="gauge-bar"><i style="width:' + w + '%"></i></div><div class="gauge-ticks"><span style="left:0;transform:none">0</span><span style="left:20%">20</span><span style="left:40%">40</span><span style="left:100%;transform:translateX(-100%)">100</span></div></div>';
  }
  function docHtml(sent, mode) {   // mode: free | full
    var out = [], cur = -1, buf = [];
    function flush() { if (buf.length) out.push('<p>' + buf.join(' ') + '</p>'); buf = []; }
    sent.forEach(function (s) {
      if (s.para !== cur) { flush(); cur = s.para; }
      var t = esc(s.t);
      if (s.ai && !s.lock && s.g) {
        var c = s.g === 3 ? 'hi' : s.g === 2 ? 'mid' : 'low';
        buf.push('<span class="s s-' + c + '" title="AI 점수 ' + (s.p != null ? s.p : '') + '">' + t + (s.p != null ? '<span class="sc">' + s.p + '</span>' : '') + '</span>');
      } else buf.push('<span class="s">' + t + '</span>');
    });
    flush();
    return out.join('');
  }
  function featHtml(feat) {
    if (!feat.length) return '<p class="muted small">뚜렷한 AI 문체 특성이 나오지 않았습니다.</p>';
    return '<div class="feats">' + feat.slice(0, 8).map(function (f) {
      var lock = !!f.lock;
      var tags = lock ? '<span>잠긴 예시</span><span>바꿀 표현</span>' : (f.tags || []).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('');
      return '<div class="feat' + (lock ? ' lock' : '') + '"><div class="feat-h"><b>' + esc(f.name) + '</b><span>' + CH.n(f.n) + '곳' + (f.segs ? ' · ' + f.segs + '구간' : '') + '</span></div><p>' + esc(f.why || '') + '</p>' + (tags ? '<div class="tags"' + (lock ? ' aria-hidden="true"' : '') + '>' + tags + '</div>' : '') + (lock ? '<p class="small muted">' + ico('lock') + ' 표현별 위치와 바꿀 말은 전체 결과에서 보입니다.</p>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function engineLine(N) {
    return N.engine === 'lite' ? '카피휴먼 간이 엔진 CH-Lite 1.0' : 'AIMarker 판별 엔진 DET 1.0' + (N.critName ? ' · ' + esc(N.critName.replace('AIMarker 판정 기준', '판정 기준')) : '');
  }
  function reportHtml(N, ctx) {
    var b = N.band, k = b.key;
    var cutNote = N.cut ? '<div class="lockline">' + ico('lock') + '<span>앞 ' + CH.n(N.checked || FREE_MAX) + '자만 검사했습니다(전체 ' + CH.n(N.total) + '자). 나머지 부분까지 검사하려면 전체 결과를 여세요.</span></div>' : '';
    var lockNote = N.locked && N.aiN > (N.shown || 0) ? '<div class="lockline">' + ico('lock') + '<span>AI 검출 문장 <b>' + N.aiN + '개</b> 가운데 가장 뚜렷한 <b>' + (N.shown || 0) + '개</b>만 표시했습니다. 나머지 ' + (N.aiN - (N.shown || 0)) + '개의 위치와 AI 점수는 전체 결과에서 보입니다.</span></div>' : '';
    var liteNote = N.engine === 'lite' ? '<p class="fine">엔진 서버와 연결되지 않아 이 브라우저 안의 간이 엔진으로 검사했습니다. 수치는 간이 엔진 기준이며 서버 엔진 결과와 다를 수 있습니다.</p>' : '';
    return '<article class="rep" aria-label="AI 생성 검사 결과">' +
      '<header class="rep-h"><div><small>카피휴먼 AI 생성 검사</small><h3>상세 결과확인서</h3></div>' +
      '<dl class="rep-meta"><dt>검사번호</dt><dd>' + esc(N.cn || '-') + '</dd><dt>검사일시</dt><dd>' + nowStr() + '</dd><dt>문서</dt><dd>' + esc(ctx.docName || KINDKO[ctx.kind] || '붙여 넣은 글') + '</dd><dt>글자 수</dt><dd>' + CH.n(N.total || N.chars) + '자</dd></dl></header>' +
      '<div class="rep-v is-' + k + '"><div class="verdict"><span class="pill is-' + k + '">' + ico(BICO[k]) + esc(b.ko) + '</span><h4>' + esc(b.label) + '</h4><ul class="why">' + (b.why || []).map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>' +
      '<div><div class="gauge-n"><b data-n="' + N.rate + '" data-suf="%">' + N.rate + '%</b><span>AI 작성률</span></div>' + gauge(N.rate) + '</div></div>' +
      '<div class="rep-grid-wrap"><table class="rep-grid"><caption>분석 정보</caption><thead><tr><th scope="col">AI 작성률</th><th scope="col">전체 문장</th><th scope="col">AI 검출 문장</th><th scope="col">높음</th><th scope="col">중간</th><th scope="col">낮음</th></tr></thead>' +
      '<tbody><tr><td class="rate">' + N.rate + '%</td><td>' + CH.n(N.n) + '</td><td>' + CH.n(N.aiN) + '</td><td class="c-hi">' + N.lv.hi + '</td><td class="c-mid">' + N.lv.mid + '</td><td class="c-low">' + N.lv.low + '</td></tr></tbody></table></div>' +
      '<div class="rep-sec"><h4>종합 의견</h4><ol class="opinion">' + N.opinion.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join('') + '</ol></div>' +
      '<div class="rep-sec"><h4>AI 검출 결과 <span class="cnt">' + (N.locked ? '일부 표시' : '전체 표시') + '</span></h4>' + cutNote + lockNote +
      '<div class="legend"><span class="l-hi"><i></i>높음(AI 점수 85 이상)</span><span class="l-mid"><i></i>중간(65 이상)</span><span class="l-low"><i></i>낮음(검출 구간 안 50 이상)</span></div>' +
      '<div class="doc" tabindex="0">' + docHtml(N.sentences, N.locked ? 'free' : 'full') + '</div></div>' +
      '<div class="rep-sec"><h4>AI 문체 특성 <span class="cnt">' + N.feat.length + '종</span></h4>' + featHtml(N.feat) + '</div>' +
      '<div class="rep-sec"><p class="fine">검사 엔진: ' + engineLine(N) + '. AI 작성률은 AI 검출 문장의 글자 수를 전체 글자 수(빈칸 제외)로 나눈 추정값입니다. 사람이 쓴 글도 높게, AI가 쓴 글도 낮게 나올 수 있으므로 증명으로 쓰지 마세요. 카피킬러 · GPT킬러 등 다른 검사기의 결과와 다를 수 있습니다. 같은 글은 언제나 같은 결과가 나옵니다.</p>' + liteNote + '</div>' +
      '</article>';
  }
  /* 목표별 다듬기 계획(붙여 넣은 글): 검출 글자 가운데 얼마나 고쳐야 목표 아래로 내려가는지
     need = 전체 글자 × (지금 AI 작성률 − 목표) × 여유(1.25, 보수적으로), 검출 글자를 넘지 않음. 예상 수치는 고친 문장이 다시 잡히지 않을 때의 산술값 */
  function hourStr(h) { var m = Math.round(h * 2) / 2; if (m < 1) return '약 30분'; return '약 ' + Math.floor(m) + '시간' + (m % 1 ? ' 30분' : ''); }
  function planRows(N, t) {
    var total = N.chars || noSp(t), ai = N.aiChars || 0, rate = N.rate || 0, aiN = N.aiN || 0;
    if (!total || !ai || !aiN) return [];
    var ratio = noSp(t) ? t.length / noSp(t) : 1.3, M = +CFG.planMargin || 1.25, H = +CFG.manualHour || 1.5;
    var C = chunk(t), full = !!N.full, unit = full ? 0 : CH.costParts('unit', C.parts);
    var rows = [], used = {};
    [30, 20, 10].forEach(function (target) {
      if (rate < target) return;
      var need = Math.min(ai, Math.ceil(total * (rate - target) / 100 * M));
      if (need <= 0) return;
      var est = Math.max(0, Math.round((ai - need) * 100 / total));
      if (est >= target) return;
      var n = Math.max(1, Math.min(aiN, Math.round(aiN * need / ai)));
      if (used[n]) return; used[n] = 1;
      rows.push({ target: target, need: need, est: est, n: n });
    });
    if (!used[aiN]) rows.push({ target: 0, need: ai, est: 0, n: aiN });
    rows.forEach(function (r) {
      var withSp = Math.round(r.need * ratio);
      r.pro = CH.cost('pro', withSp); r.tok = Math.round((r.pro + unit) * 10) / 10; r.unit = unit;
      r.min = Math.max(1, Math.ceil(withSp / 1200)); r.hour = hourStr(withSp / 1000 * H);
    });
    return rows;
  }
  function planTable(rows, opt) {
    opt = opt || {};
    if (!rows.length) return '';
    return '<div class="tbl-wrap plan-wrap"><table class="plan-t"><thead><tr><th scope="col">목표</th><th scope="col">다듬을 분량</th><th scope="col">예상 AI 작성률</th><th scope="col">토큰 · 비용</th><th scope="col">카피휴먼</th><th scope="col">직접 고치면</th><th scope="col"></th></tr></thead><tbody>' +
      rows.map(function (r, i) {
        var act = opt.act || 'plan', val = opt.val ? opt.val(r) : String(r.target), last = i === rows.length - 1;
        return '<tr' + (last ? ' class="all"' : '') + '><td class="tg" data-th="목표"><b>' + (r.target ? r.target + '% 미만' : (opt.allLabel || '검출 문장 모두')) + '</b></td><td data-th="다듬을 분량">' + (opt.amount ? opt.amount(r) : '문장 ' + r.n + '개 · ' + CH.n(r.need) + '자') + '</td><td class="est" data-th="예상 AI 작성률"><b>' + r.est + '%</b></td><td class="n" data-th="토큰 · 비용"><b>' + CH.tk(r.tok) + '토큰</b> · ' + CH.won(r.tok) + (r.unit ? '<small class="muted"> · 전체 결과 포함</small>' : '') + '</td><td data-th="카피휴먼">약 ' + r.min + '분</td><td data-th="직접 고치면">' + r.hour + '</td>' +
          '<td class="act"><button class="btn btn-s ' + (last ? 'btn-p' : 'btn-g') + '" type="button" data-act="' + act + '" data-v="' + esc(val) + '">' + (r.target ? r.target + '% 미만으로' : (opt.allBtn || '모두 다듬기')) + '</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function planNote() {
    return '<p class="fine">예상 AI 작성률은 다듬은 문장이 다시 검사에서 잡히지 않을 때의 산술값이며, 여유를 두고 ' + Math.round(((+CFG.planMargin || 1.25) - 1) * 100) + '% 더 다듬도록 잡았습니다. 다른 검사기의 결과를 보장하지 않습니다. 직접 고치는 시간은 1,000자를 고쳐 쓰고 다시 검사하는 데 ' + hourStr(+CFG.manualHour || 1.5) + '으로 잡은 추정입니다.</p>';
  }
  function payHtml(N, t) {
    var C = chunk(t), det = CH.costParts('unit', C.parts), hasPass = !!CH.pass.code;
    var risky = N.band.key === 'unfit' || N.band.key === 'risk';
    var rows = planRows(N, t);
    var head = risky ? 'AI 검출 문장 ' + N.aiN + '개 · 이대로 내면 AI 글로 걸러질 수 있습니다' : N.aiN > 0 ? 'AI 검출 문장 ' + N.aiN + '개 · 지금 고치면 깨끗해집니다' : '제출 전에 한 번 더 확인하세요';
    var sub = risky ? '검출된 문장은 고치기 전까지 어느 검사에서든 다시 잡힙니다. 목표를 고르면 AI 점수가 높은 문장부터 필요한 만큼만 사람 말투로 바꾸고, 바꾼 문장을 같은 기준으로 다시 검사해 전후를 보여 드립니다. 뜻 · 숫자 · 인용은 그대로 둡니다.' : '검사기마다 기준이 달라 다른 검사기에서는 더 높게 나올 수 있습니다. 검출 문장을 다듬어 두면 어느 검사기에서든 여유가 생깁니다.';
    return '<section class="pay" aria-label="다음 단계">' +
      '<div class="pay-h"><span class="eyebrow">목표를 고르면 바로 다듬습니다</span><h3>' + head + '</h3>' +
      '<p>' + sub + ' 이 글 ' + CH.n(t.length) + '자 기준이며, 1토큰은 100원이고 쓴 만큼만 빠집니다.</p></div>' +
      (rows.length ? planTable(rows) + planNote() : '') +
      '<div class="pay-opts">' +
      '<div class="pay-opt"><h4>전체 결과만 먼저 보기</h4><p class="cost"><b>' + CH.tk(det) + '토큰</b> · ' + (det > 0 ? CH.won(det) : '600자 이하는 토큰 없이') + '</p>' +
      '<ul><li>AI 검출 문장 ' + N.aiN + '개 전부의 위치와 AI 점수</li><li>표현별 AI 패턴과 바꿀 말</li><li>구간(문단)별 AI 비중</li></ul>' +
      '<button class="btn btn-g btn-block" type="button" data-act="full">' + (hasPass ? '전체 결과 열기' : '토큰 충전하고 전체 결과 보기') + '</button></div>' +
      '<div class="pay-opt"><h4>어떻게 바뀌는지 먼저 보기</h4><p class="cost"><b>무료</b> · 첫 문단만</p>' +
      '<ul><li>첫 문단의 검출 표현을 사람 말투로 바꾼 모습</li><li>무엇을 왜 바꿨는지는 유료 결과에서</li></ul>' +
      '<button class="btn btn-g btn-block" type="button" data-act="taste">첫 문단 무료로 보기</button></div></div>' +
      '<div class="pay-foot"><span>토큰 코드가 있으신가요? <button class="btn btn-t btn-s" type="button" data-act="code">코드 넣기</button></span><span>논문 전체를 맡기려면 <a href="' + CH.url('expert') + '">전문가 휴머나이징</a></span></div></section>';
  }
  /* 결과확인서의 표시 영역: 영역(rg)별 글자 수, 큰 곳부터 */
  function ckRegions(ck) {
    var R = {}, order = [];
    ck.spans.forEach(function (sp) { if (!R[sp.rg]) { R[sp.rg] = { rg: sp.rg, lv: sp.lv, chars: 0, spans: [] }; order.push(R[sp.rg]); } R[sp.rg].chars += sp.t.length; R[sp.rg].spans.push(sp); });
    return order.sort(function (a, b) { return b.chars - a.chars; });
  }
  function ckSpansOf(ck, sel) {   // sel: 영역 번호 목록(없으면 전부)
    if (!sel || !sel.length) return ck.spans;
    var ok = {}; sel.forEach(function (r) { ok[r] = 1; });
    return ck.spans.filter(function (sp) { return ok[sp.rg]; });
  }
  function ckCost(ck, sel) { return CH.costParts('pro', spanParts(ckSpansOf(ck, sel)).map(function (p) { return p.text; })); }
  /* 목표별 계획: 결과확인서 AI작성률 × (남는 표시 글자 ÷ 표시 글자 전체). 큰 영역부터 다듬는 순서로 */
  function ckPlan(ck) {
    var S = ck.summary || {}, rate = S.rate, regs = ckRegions(ck), total = regs.reduce(function (a, r) { return a + r.chars; }, 0);
    if (rate == null || !regs.length || !total) return [];
    var rows = [], used = {};
    [30, 20, 10].forEach(function (target) {
      if (rate < target) return;
      var fixed = 0, pick = [];
      for (var i = 0; i < regs.length; i++) {
        pick.push(regs[i].rg); fixed += regs[i].chars;
        if (rate * (1 - fixed / total) < target) break;
      }
      var est = Math.round(rate * (1 - fixed / total));
      if (est >= target || used[pick.length]) return;
      used[pick.length] = 1;
      rows.push({ target: target, sel: pick, chars: fixed, est: est, n: pick.length });
    });
    if (!used[regs.length]) rows.push({ target: 0, sel: regs.map(function (r) { return r.rg; }), chars: total, est: 0, n: regs.length });
    var H = +CFG.manualHour || 1.5;   // 직접 고쳐 다시 검사하는 데 1,000자당 걸리는 시간(시간)
    rows.forEach(function (r) {
      r.tok = ckCost(ck, r.sel); r.min = Math.max(1, Math.ceil(r.chars / 1200)); r.hour = hourStr(r.chars / 1000 * H);
    });
    return rows;
  }
  function ckHtml(ck, sel) {
    var S = ck.summary || {}, regions = {}, rows = [];
    var segs = [], pos = 0, text = ck.text, labeled = {};
    ck.spans.forEach(function (sp) { if (sp.s > pos) segs.push({ t: text.slice(pos, sp.s) }); segs.push({ t: text.slice(sp.s, sp.e), sp: sp }); pos = sp.e; });
    if (pos < text.length) segs.push({ t: text.slice(pos) });
    var html = segs.map(function (g) {
      var h = esc(g.t).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
      if (!g.sp) return h;
      var lab = !labeled[g.sp.rg] ? '<span class="lab ' + g.sp.lv + '">' + { hi: '높음', mid: '중간', low: '낮음' }[g.sp.lv] + '</span>' : '';
      labeled[g.sp.rg] = 1;
      return lab + '<span class="s s-' + g.sp.lv + '">' + h + '</span>';
    }).join('');
    var chars = ck.spans.reduce(function (a, s) { return a + s.t.length; }, 0), nreg = regCount(ck.spans);
    var cost = ckCost(ck), band = bandOfRate(S.rate, nreg), k = band.key, hasPass = !!CH.pass.code;
    var plan = ckPlan(ck);
    var planHtml = plan.length ? '<div class="rep-sec"><h4>목표를 고르면 바로 다듬습니다 <span class="cnt">큰 영역부터</span></h4>' +
      planTable(plan, { act: 'ckplan', val: function (r) { return r.sel.join(','); }, amount: function (r) { return r.n + '곳 · ' + CH.n(r.chars) + '자'; }, allLabel: '표시 영역 모두' }) +
      '<p class="fine">예상 AI작성률은 다듬은 영역이 다시 검사에서 잡히지 않을 때의 산술값(결과확인서 수치 × 남는 표시 글자 비율)이며, 카피킬러 재검사 결과를 보장하지 않습니다. 직접 고치는 시간은 1,000자를 고쳐 쓰고 다시 검사하는 데 ' + hourStr(+CFG.manualHour || 1.5) + '으로 잡은 추정입니다.</p></div>' : '';
    return '<article class="rep" aria-label="AI생성검사 결과확인서 불러오기">' +
      '<header class="rep-h"><div><small>불러온 결과확인서 · 카피킬러 AI생성검사</small><h3>결과확인서 AI작성률 ' + (S.rate != null ? S.rate + '%' : '-') + '</h3></div><dl class="rep-meta"><dt>문서</dt><dd>' + esc(S.docName || '-') + '</dd><dt>검사일자</dt><dd>' + esc(S.date || '-') + '</dd><dt>표시 영역</dt><dd>' + nreg + '곳 · ' + CH.n(chars) + '자</dd></dl></header>' +
      '<div class="rep-v is-' + k + '"><div class="verdict"><span class="pill is-' + k + '">' + ico(BICO[k]) + esc(band.ko) + '</span><h4>' + esc(band.label) + '</h4><ul class="why">' + band.why.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') +
      '<li>표시된 ' + nreg + '곳 · ' + CH.n(chars) + '자가 이 AI작성률을 만듭니다. 이 결과확인서 그대로 제출하면 AI 글로 걸러질 수 있습니다.</li></ul></div>' +
      '<div><div class="gauge-n"><b data-n="' + (S.rate != null ? S.rate : 0) + '" data-suf="%">' + (S.rate != null ? S.rate : 0) + '%</b><span>결과확인서 AI작성률</span></div>' + gauge(S.rate || 0) + '</div></div>' +
      '<div class="rep-grid-wrap"><table class="rep-grid"><caption>결과확인서의 분석 정보(그대로)</caption><thead><tr><th scope="col">AI작성률</th><th scope="col">전체 영역</th><th scope="col">AI 의심 영역</th><th scope="col">높음</th><th scope="col">중간</th><th scope="col">낮음</th></tr></thead>' +
      '<tbody><tr><td class="rate">' + (S.rate != null ? S.rate + '%' : '-') + '</td><td>' + (S.total != null ? S.total : '-') + '</td><td>' + (S.suspect != null ? S.suspect : '-') + '</td><td class="c-hi">' + (S.hi != null ? S.hi : '-') + '</td><td class="c-mid">' + (S.mid != null ? S.mid : '-') + '</td><td class="c-low">' + (S.low != null ? S.low : '-') + '</td></tr></tbody></table></div>' +
      planHtml +
      '<div class="rep-sec"><h4>결과확인서에 표시된 영역 <span class="cnt">' + nreg + '곳 · ' + CH.n(chars) + '자</span></h4>' +
      '<div class="legend"><span class="l-hi"><i></i>높음</span><span class="l-mid"><i></i>중간</span><span class="l-low"><i></i>낮음</span></div>' +
      '<div class="doc" tabindex="0"><p>' + html + '</p></div>' +
      '<p class="fine">결과확인서의 학번 · 이름 · 이메일 같은 머리 정보는 읽지 않고, 본문과 표시 위치만 이 브라우저 안에서 꺼냈습니다. 결과확인서 양식에 따라 표시 위치가 일부 다를 수 있습니다.</p></div></article>' +
      '<section class="pay" aria-label="표시된 문장 다듬기"><div class="pay-h"><span class="eyebrow">표시된 문장만 다듬기</span><h3>표시된 영역 ' + nreg + '곳만 골라 휴머나이징</h3>' +
      '<p>글 전체가 아니라 결과확인서에 표시된 ' + CH.n(chars) + '자만 다듬어 토큰을 아낍니다. 다듬은 문장은 원문과 나란히 보여 드려 한글 파일에 바로 옮길 수 있고, 다듬은 글은 같은 기준으로 다시 검사해 전후를 비교합니다.</p></div>' +
      '<div class="pay-opts"><div class="pay-opt rec"><h4>표시 영역 모두 휴머나이징 <span class="badge">추천</span></h4><p class="cost"><b>' + CH.tk(cost) + '토큰</b> · ' + CH.won(cost) + '</p>' +
      '<ul><li>표시된 ' + nreg + '곳 ' + CH.n(chars) + '자를 사람 말투로</li><li>숫자 · 이름 · 인용 · 각주 자리는 그대로</li><li>원문 · 다듬은 문장 대조표와 반영한 워드 파일</li></ul>' +
      '<button class="btn btn-p btn-block" type="button" data-act="ckhum">' + (hasPass ? '표시된 문장 모두 다듬기' : '토큰 충전하고 다듬기') + '</button><button class="btn btn-t btn-s" type="button" data-act="cktaste">첫 곳은 무료로 먼저 보기</button></div>' +
      '<div class="pay-opt"><h4>카피휴먼 엔진으로 다시 검사</h4><p class="cost">문장마다 AI 점수를 다시 매겨 봅니다.</p><ul><li>결과확인서 본문으로 바로 검사</li><li>AI 문체 특성과 구간 비중</li></ul><button class="btn btn-g btn-block" type="button" data-act="ckcheck">이 본문으로 검사하기</button></div></div>' +
      '<div class="pay-foot"><span>토큰 코드가 있으신가요? <button class="btn btn-t btn-s" type="button" data-act="code">코드 넣기</button></span><span>논문 전체를 맡기려면 <a href="' + CH.url('expert') + '">전문가 휴머나이징</a></span></div></section>';
  }
  function regCount(spans) { var o = {}; spans.forEach(function (s) { o[s.rg] = 1; }); return Object.keys(o).length; }
  function spanParts(spans) {   // 표시 구간을 CHUNK자 이하 묶음으로(묶음 안은 빈 줄로 구분)
    var parts = [], cur = null;
    spans.forEach(function (sp, i) {
      var t = sp.t.replace(/\s*\n+\s*/g, ' ').trim();
      if (!cur || (cur.text.length + t.length + 2) > CHUNK) { cur = { text: '', idx: [] }; parts.push(cur); }
      cur.text += (cur.text ? '\n\n' : '') + t; cur.idx.push(i);
    });
    return parts;
  }
  /* 검사 중 화면: 넣은 글 위로 훑는 선이 지나가고, 엔진이 하는 일을 차례로 표시(단계는 시간에 맞춰 넘어가며 마지막 단계에서 결과를 기다림) */
  var STEPS = {
    check: ['문장 나누기', 'AI 패턴 DB 89억 개와 문장마다 대조하기', '공개한 판정 기준으로 위험 · 주의 · 양호 판정'],
    hum: ['AI 문체로 읽히는 표현 찾기', '같은 뜻의 사람 말투로 바꾸기', '숫자 · 이름 · 인용 · 말투가 그대로인지 확인']
  };
  function progHtml(label, i, n, note, kind, src) {
    var pct = n ? Math.round(i / n * 100) : 0, steps = STEPS[kind || 'check'], el = Date.now() - (progHtml.t0 || Date.now());
    var at = el > 3600 ? 2 : el > 1300 ? 1 : 0;
    var snippet = String(src || '').slice(0, 420);
    return '<div class="scan" role="status" data-prog="' + (kind || 'check') + '">' +
      '<div class="scan-h"><span class="spin" aria-hidden="true"></span><b>' + esc(label) + '</b>' + (n > 1 ? '<span class="scan-n">' + i + ' / ' + n + '</span>' : '') + '</div>' +
      (snippet ? '<div class="scan-doc" aria-hidden="true"><p>' + esc(snippet) + '</p><i class="scan-line"></i></div>' : '') +
      '<ol class="scan-steps">' + steps.map(function (t, k) { return '<li class="' + (k < at ? 'done' : k === at ? 'on' : '') + '">' + esc(t) + '</li>'; }).join('') + '</ol>' +
      '<div class="bar" aria-hidden="true"><i style="width:' + Math.max(8, n > 1 ? pct : Math.min(92, 18 + at * 30)) + '%"></i></div>' +
      '<p>' + esc(note || '같은 글은 언제나 같은 결과가 나옵니다. 글은 처리한 뒤 저장하지 않습니다.') + '</p></div>';
  }
  var progTimer = 0;
  function progTick(box) {   // 단계 표시만 시간에 맞춰 넘김
    clearInterval(progTimer);
    progTimer = setInterval(function () {
      var sc = box.querySelector('.scan');
      if (!sc) { clearInterval(progTimer); return; }
      var el = Date.now() - (progHtml.t0 || Date.now()), at = el > 3600 ? 2 : el > 1300 ? 1 : 0;
      Array.prototype.forEach.call(sc.querySelectorAll('.scan-steps li'), function (li, k) { li.className = k < at ? 'done' : k === at ? 'on' : ''; });
      var bar = sc.querySelector('.bar i'), sn = sc.querySelector('.scan-n');
      if (bar && !sn) bar.style.width = Math.min(92, 18 + at * 30 + Math.min(10, el / 2000)) + '%';
    }, 400);
  }
  /* 결과가 나타날 때: 판이 떠오르고, 숫자가 올라가고, 표시 문장이 형광펜처럼 칠해짐 */
  function revealOut(scope) {
    $$('.rep, .pay', scope).forEach(function (el) { el.classList.add('pop'); });
    if (CH.reduced) return;
    $$('.gauge-bar i', scope).forEach(function (i) {
      var w = i.style.width; i.style.width = '0%';
      requestAnimationFrame(function () { requestAnimationFrame(function () { i.style.width = w; }); });
    });
    $$('[data-n]', scope).forEach(function (b) {
      var to = +b.getAttribute('data-n'), suf = b.getAttribute('data-suf') || '', t0 = null;
      function f(ts) { if (t0 === null) t0 = ts; var p = Math.min(1, (ts - t0) / 1150), e = 1 - Math.pow(1 - p, 3); b.textContent = Math.round(to * e) + suf; if (p < 1) requestAnimationFrame(f); }
      b.textContent = '0' + suf; requestAnimationFrame(f);
    });
    $$('.doc', scope).forEach(function (d) { if (CH.sweep) CH.sweep(d, 500); });
  }
  function diffHtml(src, out) {   // 바뀐 문장을 초록으로
    var have = {};
    LITE.sentences(src.replace(/\n{2,}/g, '\n')).forEach(function (s) { have[s.t] = 1; });
    return out.split(/\n{2,}/).map(function (p) {
      return '<p>' + LITE.sentences(p).map(function (s) { return have[s.t] ? '<span class="s">' + esc(s.t) + '</span>' : '<span class="s s-new">' + esc(s.t) + '</span>'; }).join(' ') + '</p>';
    }).join('');
  }

  /* ---------- 도구 하나 ---------- */
  function init(box) {
    var ta = $('textarea', box), fileIn = $('input[type=file]', box), runB = $('[data-run]', box), cnt = $('[data-count]', box), chip = $('[data-file]', box), msg = $('[data-msg]', box), drop = $('.drop', box), over = $('.drop-over', box);
    var steps = $$('.tool-steps li', box), outSec = document.getElementById(box.getAttribute('data-out') || 'out'), out = outSec ? $('[data-out-in]', outSec) : null;
    var S = { src: null, ck: null, res: null, busy: false, kind: box.getAttribute('data-kind') || 'thesis', docName: '', lastT: '' };
    if (!ta || !out) return;
    TI() && fileIn && fileIn.setAttribute('accept', TI().ACCEPT + ',.pdf');

    function setStep(n) { steps.forEach(function (li, i) { li.classList.toggle('on', i === n - 1); li.classList.toggle('done', i < n - 1); }); }
    function say(t, info) { if (!msg) return; msg.hidden = !t; msg.className = 'tool-msg' + (info ? ' info' : ''); msg.textContent = t || ''; }
    function count() { var n = ta.value.length; if (cnt) cnt.innerHTML = '<b>' + CH.n(n) + '</b> / ' + CH.n(PAID_MAX) + '자'; }
    function busy(on) { S.busy = on; runB.disabled = on; $$('[data-act]', out).forEach(function (b) { b.disabled = on; }); }
    function show(html) {
      var prog = /class="scan"/.test(html.slice(0, 80));
      if (prog && !out.querySelector('.scan')) progHtml.t0 = Date.now();
      outSec.hidden = false; out.innerHTML = html;
      if (prog) progTick(out); else { clearInterval(progTimer); revealOut(out); }
    }
    function toOut() { var y = outSec.getBoundingClientRect().top + window.scrollY - 80; window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); }
    function kind() { var r = $('input[name=kind]:checked', box); return r ? r.value : S.kind; }
    function setChip(html) { if (!chip) return; chip.hidden = !html; chip.innerHTML = html || ''; var x = $('button', chip); if (x) x.addEventListener('click', clearFile); }
    function clearFile() { S.src = null; S.ck = null; S.docName = ''; setChip(''); if (fileIn) fileIn.value = ''; }
    function saveDraft() { CH.ssset('ch_draft', { text: ta.value.slice(0, PAID_MAX), kind: kind(), at: Date.now(), doc: S.docName }); }

    ta.addEventListener('input', count);
    count();
    $$('input[name=kind]', box).forEach(function (r) { r.addEventListener('change', function () { S.kind = r.value; }); });
    var smp = $('[data-sample]', box);
    if (smp) smp.addEventListener('click', function () { ta.value = (CFG.samples || {})[kind()] || (CFG.samples || {}).thesis || ''; clearFile(); count(); say(''); ta.focus(); });

    /* 이전에 넣어 둔 글(결제하고 돌아온 경우) */
    var dr = CH.ssget('ch_draft');
    if (dr && dr.text && !ta.value && Date.now() - dr.at < 6 * 3600 * 1000) { ta.value = dr.text; count(); S.docName = dr.doc || ''; say('넣어 두었던 글을 다시 불러왔습니다. 이어서 검사하거나 다듬을 수 있습니다.', true); }
    /* 주소로 받은 코드(?code=) */
    try {
      var q = new URLSearchParams(location.search), qc = q.get('code') || q.get('pass');
      if (qc) { CH.pass.set(qc); history.replaceState(null, '', location.pathname + location.hash); CH.pass.refresh(); }
    } catch (e) { /* 그대로 */ }

    /* 파일 */
    function readFile(f) {
      if (!f) return;
      say(''); setChip('<div class="file-chip">' + ico('file') + '<b>' + esc(f.name) + '</b><span class="small muted">여는 중…</span></div>');
      var isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
      var p = isPdf && CKP ? CKP.fromFile(f, CH.root).catch(function () { return null; }) : Promise.resolve(null);
      p.then(function (ck) {
        if (ck && !ck.ok && ck.kind === 'plagiarism') {
          setChip('<div class="file-chip warn">' + ico('alert') + '<b>표절검사 결과확인서 · ' + esc(f.name) + '</b><span class="small">표절률' + (ck.rate != null ? ' ' + ck.rate + '%' : '') + ' · AI작성률 결과가 아님</span><button type="button" aria-label="파일 빼기">빼기</button></div>');
          say('표절검사 결과확인서입니다. 카피휴먼은 AI생성검사 결과확인서의 AI작성률과 표시 문장을 읽습니다. 카피킬러에서 AI생성검사 결과를 상세보기로 발급한 PDF를 올려 주세요.');
          if (fileIn) fileIn.value = '';
          return;
        }
        if (ck && !ck.ok && ck.kind === 'copykiller') {
          var s0 = ck.summary || {};
          setChip('<div class="file-chip warn">' + ico('alert') + '<b>AI생성검사 결과확인서 · ' + esc(f.name) + '</b><span class="small">' + (s0.rate != null ? 'AI작성률 ' + s0.rate + '% · ' : '') + '표시 문장을 읽지 못함</span><button type="button" aria-label="파일 빼기">빼기</button></div>');
          say('AI생성검사 결과확인서지만 표시된 문장을 읽지 못했습니다. 발급형태를 상세보기로 해서 다시 내려받은 PDF를 올리거나, 글을 직접 붙여 넣어 주세요.');
          if (fileIn) fileIn.value = '';
          return;
        }
        if (ck && !ck.ok && ck.kind === 'other') {
          setChip(''); say('카피킬러 문서지만 AI생성검사 결과확인서가 아닙니다. AI생성검사 상세 결과확인서 PDF를 올려 주세요.'); if (fileIn) fileIn.value = ''; return;
        }
        if (ck && ck.ok) {
          S.ck = ck; S.src = null; S.docName = (ck.summary && ck.summary.docName) || f.name;
          try { var keep = { kind: ck.kind, summary: ck.summary, text: ck.text, spans: ck.spans, regions: ck.regions, ok: true }; if (JSON.stringify(keep).length < 2000000) CH.ssset('ch_ck', keep); } catch (eK) { /* 저장 없이 */ }
          ta.value = ck.text; count();
          var s = ck.summary || {};
          setChip('<div class="file-chip">' + ico('file') + '<b>AI생성검사 결과확인서 · ' + esc(S.docName) + '</b><span class="small muted">AI작성률 ' + (s.rate != null ? s.rate + '%' : '-') + ' · 표시 영역 ' + regCount(ck.spans) + '곳</span><button type="button" aria-label="파일 빼기">빼기</button></div>');
          setStep(2); show(ckHtml(ck)); bindOut(); toOut();
          return;
        }
        if (!TI()) throw new Error('파일을 여는 도구를 불러오지 못했어요. 글을 붙여 넣어 주세요.');
        return TI().read(f).then(function (r) {
          S.src = r; S.ck = null; S.docName = f.name;
          ta.value = r.text.length > PAID_MAX ? r.text.slice(0, PAID_MAX) : r.text; count();
          setChip('<div class="file-chip">' + ico('file') + '<b>' + esc(f.name) + '</b><span class="small muted">' + esc(r.kindKo || '') + ' · ' + CH.n(r.chars) + '자</span><button type="button" aria-label="파일 빼기">빼기</button></div>');
          if (r.text.length > PAID_MAX) say('한 번에 ' + CH.n(PAID_MAX) + '자까지 검사합니다. 앞 ' + CH.n(PAID_MAX) + '자를 넣었습니다.', true);
          run();
        });
      }).catch(function (e) { setChip(''); say((e && e.message) || '파일을 열지 못했어요. 글을 붙여 넣어 주세요.'); if (window.console && e && e.stack) console.error(e.stack); });
    }
    if (fileIn) fileIn.addEventListener('change', function () { readFile(fileIn.files && fileIn.files[0]); });
    if (drop) {
      ['dragenter', 'dragover'].forEach(function (ev) { drop.addEventListener(ev, function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) { e.preventDefault(); drop.classList.add('over'); if (over) over.hidden = false; } }); });
      ['dragleave', 'drop'].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove('over'); if (over) over.hidden = true; }); });
      drop.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) { e.preventDefault(); readFile(f); } });
    }

    /* ② 검사(결제 없이 보는 범위) */
    function run(opt) {
      opt = opt || {};
      if (S.busy) return;
      var t = canon(ta.value);
      if (noSp(t) < 60) { say('60자 이상 넣어 주세요. 문장이 몇 개는 있어야 판정할 수 있습니다.'); ta.focus(); return; }
      if (t.length > PAID_MAX) t = t.slice(0, PAID_MAX);
      say(''); saveDraft(); S.lastT = t; busy(true); setStep(2);
      show(progHtml('AI 작성률 검사 중', 0, 1, '', 'check', t)); if (!opt.stay) toOut();
      var ctx = { kind: kind(), docName: S.docName };
      freeCheck(t).then(function (N) {
        S.res = N;
        show((S.ck && opt.keepCk ? ckHtml(S.ck) : '') + reportHtml(N, ctx) + payHtml(N, t)); bindOut();
        if (S.planAfter != null) { var pa = S.planAfter; S.planAfter = null; S.skipAsk = true; setTimeout(function () { planRun(pa); }, 300); }
        if (window.gtag) try { window.gtag('event', 'ai_check', { rate: N.rate, band: N.band.key, engine: N.engine }); } catch (e) { /* 무시 */ }
      }).catch(function (e) { show('<div class="tool-msg">' + esc((e && e.message) || '검사하지 못했어요. 잠시 뒤 다시 시도해 주세요.') + '</div>'); })
        .then(function () { busy(false); });
    }
    function freeCheck(t) {
      var C = chunk(t), first = C.parts[0];
      var lite = function () { var R = LITE.detect(t, { kind: kind() }); return normalize(LITE.freeView(R), { total: t.length }); };
      if (CH.server.state === 'off') return Promise.resolve(lite());
      return CH.call('am.style', { text: first, mode: 'check', tone: 'auto', pass: '' }, 90000).then(function (r) {
        return normalize(r, { total: t.length, cut: C.parts.length > 1, checked: first.length });
      }).catch(function (e) { if (e && (e.code === 'OFF' || e.code === 'SLOW')) return lite(); throw e; });
    }
    /* 전체 결과(토큰) */
    function fullCheck() {
      var t = S.lastT || canon(ta.value); if (!t) return;
      var C = chunk(t), need = CH.costParts('unit', C.parts);
      gate(need, '전체 결과', function () {
        busy(true); show(progHtml('전체 결과 만드는 중', 0, C.parts.length, '', 'check', t)); toOut();
        seq(C.parts, function (part, i) {
          return CH.call('am.style', { text: part, mode: 'check', tone: 'auto', pass: CH.pass.code }, 120000).then(function (r) { show(progHtml('전체 결과 만드는 중', i + 1, C.parts.length, '', 'check', t)); return r; });
        }).then(function (rs) {
          var N = merge(rs, true, t); N.total = t.length; N.locked = false;
          S.res = N; CH.pass.refresh().then(CH.paintChip);
          show(reportHtml(N, { kind: kind(), docName: S.docName }) + afterFullHtml(N, t)); bindOut();
        }).catch(fail).then(function () { busy(false); });
      }, 'full');
    }
    function afterFullHtml(N, t) {
      var rows = planRows(N, t);
      return '<section class="pay"><div class="pay-h"><span class="eyebrow">목표를 고르면 바로 다듬습니다</span><h3>' + (N.aiN ? 'AI 검출 문장 ' + N.aiN + '개 · 이대로 내면 AI 글로 걸러질 수 있습니다' : 'AI 검출 문장이 없습니다') + '</h3><p>AI 점수가 높은 문장부터 필요한 만큼만 사람 말투로 바꾸고, 바꾼 문장을 같은 기준으로 다시 검사해 전후를 보여 드립니다. 전체 결과는 이미 열려 있어 다듬는 비용만 빠집니다.</p></div>' +
        (rows.length ? planTable(rows) + planNote() : '') +
        '<div class="acts"><button class="btn btn-g" type="button" data-act="taste">첫 문단 무료로 먼저 보기</button></div></section>';
    }
    /* 목표별 다듬기: (전체 결과가 없으면 먼저 열고) AI 점수 높은 문장부터 필요한 만큼 골라 사람 말투로 바꾼 뒤, 바꾼 문장을 같은 기준으로 다시 검사 */
    function planRun(target) {
      var t = S.lastT || canon(ta.value); if (!t || !S.res) return;
      var rows = planRows(S.res, t), row = null;
      rows.forEach(function (r) { if (r.target === target) row = r; });
      if (!row) { row = rows[rows.length - 1]; if (!row) return; target = row.target; }
      S.plan = { target: target }; CH.ssset('ch_plan', S.plan);
      var name = target ? 'AI 작성률 ' + target + '% 미만으로 다듬기' : '검출 문장 모두 다듬기';
      var C = chunk(t);
      gate(row.tok, name, function () {
        busy(true); show(progHtml(name, 0, 1, '', 'check', t)); toOut();
        var p = S.res.full ? Promise.resolve(S.res) : seq(C.parts, function (part, i) {
          return CH.call('am.style', { text: part, mode: 'check', tone: 'auto', pass: CH.pass.code }, 120000).then(function (r) { show(progHtml('문장마다 AI 점수를 매기는 중', i + 1, C.parts.length, '', 'check', t)); return r; });
        }).then(function (rs) { var N = merge(rs, true, t); N.total = t.length; N.locked = false; S.res = N; return N; });
        p.then(function (N) {
          var M = +CFG.planMargin || 1.25, total = N.chars || noSp(t), ai = N.aiChars || 0;
          var need = target ? Math.min(ai, Math.ceil(total * (N.rate - target) / 100 * M)) : ai;
          var flagged = N.sentences.map(function (x, i) { x._i = i; return x; }).filter(function (x) { return x.ai; })
            .sort(function (a, b) { return ((b.g || 0) - (a.g || 0)) || ((b.p || 0) - (a.p || 0)) || (noSp(b.t) - noSp(a.t)); });
          var sel = [], got = 0;
          for (var i = 0; i < flagged.length && (got < need || !target); i++) { sel.push(flagged[i]); got += noSp(flagged[i].t); }
          if (!sel.length) throw { message: '다듬을 검출 문장이 없습니다.' };
          sel.sort(function (a, b) { return a._i - b._i; });
          var parts = [], cur = null;
          sel.forEach(function (x) { var tt = x.t.replace(/\s*\n+\s*/g, ' ').trim(); if (!cur || (cur.text.length + tt.length + 2) > CHUNK) { cur = { text: '', idx: [] }; parts.push(cur); } cur.text += (cur.text ? '\n\n' : '') + tt; cur.idx.push(x._i); });
          var newT = {}, ac = 0, aa = 0, changed = 0;
          show(progHtml('AI 점수 높은 문장부터 사람 말투로 바꾸는 중', 0, parts.length, '숫자 · 이름 · 인용은 그대로 두고, 바꾼 문장마다 뜻이 같은지 확인합니다.', 'hum', sel.map(function (x) { return x.t; }).join(' ')));
          return seq(parts, function (pt, k) {
            return CH.call('am.humanize', { text: pt.text, tone: 'auto', variant: 0, pass: CH.pass.code }, 150000).then(function (r) {
              var outs = String(r.text || '').split(/\n{2,}/);
              if (r.aiAfter) { ac += r.aiAfter.chars || 0; aa += r.aiAfter.aiChars || 0; }
              changed += (r.stats && r.stats.changed) || (r.applied || []).length || 0;
              if (outs.length === pt.idx.length) { pt.idx.forEach(function (ix, j) { newT[ix] = outs[j].trim(); }); return; }
              return seq(pt.idx, function (ix) { return CH.call('am.humanize', { text: N.sentences[ix].t, tone: 'auto', variant: 0, pass: CH.pass.code }, 120000).then(function (r2) { newT[ix] = (r2.text || N.sentences[ix].t).trim(); if (r2.aiAfter) { ac += r2.aiAfter.chars || 0; aa += r2.aiAfter.aiChars || 0; } }); });
            }).then(function () { show(progHtml('AI 점수 높은 문장부터 사람 말투로 바꾸는 중', k + 1, parts.length, '', 'hum', sel.map(function (x) { return x.t; }).join(' '))); });
          }).then(function () {
            /* 글 다시 짜기: 엔진이 나눈 문장 순서대로, 문단은 빈 줄로 */
            var paras = [], pairs = [];
            N.sentences.forEach(function (x, i) { var pi = x.para || 0; paras[pi] = paras[pi] || []; paras[pi].push(newT[i] != null ? newT[i] : x.t); });
            var text = paras.filter(Boolean).map(function (pp) { return pp.join(' '); }).join('\n\n');
            sel.forEach(function (x) { if (newT[x._i] != null) pairs.push({ lv: x.g === 3 ? 'hi' : x.g === 2 ? 'mid' : 'low', p: x.p, a: x.t, b: newT[x._i] }); });
            var selChars = sel.reduce(function (a2, x) { return a2 + noSp(x.t); }, 0);
            var redo = ac ? Math.round(aa * selChars / ac) : 0;   // 바꾼 문장을 다시 검사했을 때 그래도 잡힌 글자(바꾼 분량 기준)
            var afterAi = Math.max(0, ai - selChars) + redo;   // 안 바꾼 검출 문장 + 바꾼 문장의 재검사 결과
            var afterRate = total ? Math.round(afterAi * 100 / total) : 0;
            var restN = flagged.length - sel.length, restChars = ai - selChars;
            S.hum = { src: t, text: text, changed: pairs.filter(function (q) { return q.a !== q.b; }).length, pairs: pairs, before: N.rate, after: afterRate, target: target, restN: restN, restChars: restChars, aiN: N.aiN, redo: redo };
            setStep(3); CH.pass.refresh().then(CH.paintChip);
            show(planResultHtml(S.hum)); bindOut();
            if (window.gtag) try { window.gtag('event', 'humanize_plan', { target: target, chars: selChars }); } catch (e) { /* 무시 */ }
          });
        }).catch(fail).then(function () { busy(false); });
      }, 'plan');
    }
    function planResultHtml(res) {
      var LVK = { hi: '높음', mid: '중간', low: '낮음' };
      var okTarget = res.target ? res.after < res.target : res.after === 0;
      var t = S.lastT || '';
      var restHtml = '';
      if (res.restN > 0) {
        var N2 = Object.assign({}, S.res, { full: true, rate: res.after, aiChars: res.restChars, aiN: res.restN });
        var rows = planRows(N2, t).filter(function (r) { return r.target === 0 || r.target < (res.target || 100); });
        restHtml = '<section class="pay"><div class="pay-h"><span class="eyebrow">남은 검출 문장</span><h3>아직 ' + res.restN + '개 문장이 검출된 채 남아 있습니다</h3><p>' + (res.target ? '목표 ' + res.target + '% 미만' + (okTarget ? '은 맞췄지만' : '에 아직 못 미쳐') + ', ' : '') + '남은 문장을 마저 다듬으면 더 내려갑니다. 전체 결과는 열려 있어 다듬는 비용만 빠집니다.</p></div>' + (rows.length ? planTable(rows, { allLabel: '남은 문장 모두', allBtn: '남은 문장 모두 다듬기' }) : '') + '</section>';
      }
      return '<article class="rep"><header class="rep-h"><div><small>' + (res.target ? '목표 ' + res.target + '% 미만 다듬기' : '검출 문장 모두 다듬기') + '</small><h3>' + (okTarget ? '목표를 맞췄습니다' : '다듬었지만 목표에 조금 못 미쳤습니다') + '</h3></div><dl class="rep-meta"><dt>처리일시</dt><dd>' + nowStr() + '</dd><dt>바꾼 문장</dt><dd>' + res.changed + ' / ' + res.pairs.length + '</dd></dl></header>' +
        '<div class="rep-sec"><div class="hz-stats"><div class="hz-stat"><span>다듬기 전 AI 작성률</span><b>' + res.before + '%</b></div><div class="hz-stat"><span>다듬은 뒤 AI 작성률</span><b class="down">' + res.after + '%</b></div><div class="hz-stat"><span>바꾼 문장이 다시 잡힌 글자</span><b>' + CH.n(res.redo) + '자</b></div></div>' +
        '<p class="fine">다듬은 뒤 수치는 바꾼 문장을 같은 기준으로 다시 검사한 결과와 바꾸지 않은 검출 문장을 더한 값입니다. 다른 검사기의 결과를 보장하지 않습니다.</p>' +
        '<div class="seg-tabs" role="tablist"><button type="button" role="tab" aria-selected="true" data-tab="pairs">대조표</button><button type="button" role="tab" aria-selected="false" data-tab="full">반영한 전체 글</button></div>' +
        '<div data-pane="pairs" class="pairs">' + res.pairs.map(function (q, i) { return '<div class="pair"><div><small>' + (i + 1) + ' · ' + LVK[q.lv] + (q.p != null ? ' · AI 점수 ' + q.p : '') + ' · 원문</small>' + esc(q.a) + '</div><div><small>다듬은 문장</small>' + diffHtml(q.a, q.b) + '</div></div>'; }).join('') + '</div>' +
        '<div data-pane="full" hidden><div class="doc" tabindex="0">' + diffHtml(res.src, res.text) + '</div></div>' +
        '<div class="acts"><button class="btn btn-p" type="button" data-act="copy">다듬은 글 복사</button><button class="btn btn-g" type="button" data-act="copypairs">대조표 복사</button><button class="btn btn-g" type="button" data-act="docx">' + ico('down') + (S.src && S.src.doc ? '원래 형식(.' + S.src.kind + ')으로 받기' : '워드 파일로 받기') + '</button><button class="btn btn-g" type="button" data-act="again">다듬은 글로 다시 검사</button></div>' +
        '<p class="fine">제출 전에 뜻 · 수치 · 인용이 원문과 같은지 꼭 읽어 보세요. 한글(HWP) 원본에는 대조표를 보며 같은 문장을 바꿔 넣으면 됩니다.</p></div></article>' + restHtml;
    }

    /* 토큰이 필요한 일: 코드가 없거나 모자라면 충전 창, 10토큰 넘으면 한 번 묻기 */
    function journey() {   // 이 글을 검사 · 다듬기 · 다시 검사까지 하는 데 드는 토큰(충전 추천용)
      var t = S.lastT || canon(ta.value), C = chunk(t);
      return CH.costParts('unit', C.parts) * 2 + CH.costParts('pro', C.parts);
    }
    function needLine(need, name) {
      return need > 0 ? '이 글 ' + esc(name) + ': <b>' + CH.tk(need) + '토큰</b> · ' + CH.won(need) : '600자 이하 글의 ' + esc(name) + '는 토큰이 빠지지 않습니다. 토큰 코드만 있으면 바로 열립니다.';
    }
    function gate(need, name, go, intent) {
      var rn = Math.max(need, journey());
      if (CH.server.state === 'off') {
        saveDraft();
        CH.buy({ need: need, recNeed: rn, needText: needLine(need, name), title: '토큰으로 ' + name + ' 이어서 하기', intent: intent });
        return;
      }
      if (!CH.pass.code) {
        saveDraft();
        CH.buy({ need: need, recNeed: rn, needText: needLine(need, name), title: name + '에 쓸 토큰 충전', intent: intent, done: function () { askGo(need, name, go); } });
        return;
      }
      var l = CH.pass.left();
      if (l != null && l < need) {
        CH.buy({ need: need - l, recNeed: Math.max(need - l, rn - l), needText: '남은 토큰 <b>' + CH.tk(l) + '</b> · 필요한 토큰 <b>' + CH.tk(need) + '</b> · 모자란 토큰 <b>' + CH.tk(need - l) + '</b>', title: '토큰이 조금 모자라요', intent: intent, done: function () { askGo(need, name, go); } });
        return;
      }
      askGo(need, name, go);
    }
    function askGo(need, name, go) {
      if (need < 10 || S.skipAsk) { S.skipAsk = false; go(); return; }
      var el = document.createElement('div'); el.className = 'notice'; el.setAttribute('role', 'alertdialog');
      el.innerHTML = '<p><b>' + esc(name) + '에 ' + CH.tk(need) + '토큰(' + CH.won(need) + ')이 빠집니다.</b>' + (CH.pass.left() != null ? ' 남은 토큰은 ' + CH.tk(CH.pass.left()) + '개입니다.' : '') + '</p><div class="acts" style="margin-top:10px"><button class="btn btn-p btn-s" type="button" data-yes>' + esc(name) + ' 시작</button><button class="btn btn-g btn-s" type="button" data-no>취소</button></div>';
      out.insertBefore(el, out.firstChild); el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      $('[data-yes]', el).addEventListener('click', function () { el.remove(); go(); });
      $('[data-no]', el).addEventListener('click', function () { el.remove(); });
      $('[data-yes]', el).focus();
    }
    function fail(e) {
      var m = (e && e.message) || '지금은 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.';
      if (e && e.code === 'PASS') { CH.pass.clear(); m = '토큰 코드를 확인하지 못했습니다. 코드를 다시 넣어 주세요.'; }
      if (e && /PASS_USED|LOW|NEED/.test(e.code || '')) m = '토큰이 모자랍니다. 같은 코드에 충전한 뒤 다시 시도해 주세요.';
      show('<div class="tool-msg">' + esc(m) + '</div><div class="acts" style="margin-top:12px"><button class="btn btn-g btn-s" type="button" data-act="recheck">다시 검사</button><button class="btn btn-t btn-s" type="button" data-act="code">토큰 코드</button></div>'); bindOut();
    }

    /* ③ 휴머나이징(토큰) */
    function humanize() {
      var t = S.lastT || canon(ta.value); if (!t) return;
      var C = chunk(t), need = CH.costParts('pro', C.parts);
      gate(need, 'AI 휴머나이징', function () {
        busy(true); show(progHtml('AI 문체를 사람 말투로 바꾸는 중', 0, C.parts.length, '숫자 · 이름 · 인용은 그대로 두고, 바꾼 문장마다 뜻이 같은지 확인합니다.', 'hum', t)); toOut();
        seq(C.parts, function (part, i) {
          return CH.call('am.humanize', { text: part, tone: 'auto', variant: 0, pass: CH.pass.code }, 150000).then(function (r) { show(progHtml('AI 문체를 사람 말투로 바꾸는 중', i + 1, C.parts.length, '숫자 · 이름 · 인용은 그대로 두고, 바꾼 문장마다 뜻이 같은지 확인합니다.', 'hum', t)); return r; });
        }).then(function (rs) {
          var text = rs.map(function (r, i) { return (i ? C.seps[i - 1] : '') + (r.text || ''); }).join('');
          var bc = 0, ba = 0, ac = 0, aa = 0, changed = 0;
          rs.forEach(function (r) { if (r.ai) { bc += r.ai.chars || 0; ba += r.ai.aiChars || 0; } if (r.aiAfter) { ac += r.aiAfter.chars || 0; aa += r.aiAfter.aiChars || 0; } changed += (r.stats && r.stats.changed) || (r.applied || []).length || 0; });
          var res = { src: t, text: text, changed: changed, before: bc ? Math.round(ba * 100 / bc) : (S.res ? S.res.rate : null), after: ac ? Math.round(aa * 100 / ac) : null, tone: rs[0] && rs[0].toneNote };
          S.hum = res; setStep(3); CH.pass.refresh().then(CH.paintChip);
          show(humHtml(res)); bindOut();
          if (window.gtag) try { window.gtag('event', 'humanize', { chars: t.length }); } catch (e) { /* 무시 */ }
        }).catch(fail).then(function () { busy(false); });
      }, 'hum');
    }
    function humHtml(res) {
      var down = res.before != null && res.after != null;
      return '<article class="rep"><header class="rep-h"><div><small>카피휴먼 AI 휴머나이징</small><h3>다듬은 글</h3></div><dl class="rep-meta"><dt>처리일시</dt><dd>' + nowStr() + '</dd><dt>글자 수</dt><dd>' + CH.n(res.text.length) + '자</dd></dl></header>' +
        '<div class="rep-sec"><div class="hz-stats">' + (down ? '<div class="hz-stat"><span>다듬기 전 AI 작성률</span><b>' + res.before + '%</b></div><div class="hz-stat"><span>다듬은 뒤 AI 작성률</span><b class="down">' + res.after + '%</b></div>' : '') + '<div class="hz-stat"><span>바꾼 곳</span><b>' + CH.n(res.changed) + '</b></div></div>' +
        (res.tone ? '<p class="fine">' + esc(res.tone) + '</p>' : '') +
        '<div class="legend"><span class="l-new"><i></i>바뀐 문장</span></div><div class="doc" tabindex="0">' + diffHtml(res.src, res.text) + '</div>' +
        '<div class="acts"><button class="btn btn-p" type="button" data-act="copy">다듬은 글 복사</button><button class="btn btn-g" type="button" data-act="docx">' + ico('down') + (S.src && S.src.doc ? '원래 형식(.' + S.src.kind + ')으로 받기' : '워드 파일로 받기') + '</button><button class="btn btn-g" type="button" data-act="again">다듬은 글로 다시 검사</button></div>' +
        '<p class="fine">다듬은 결과는 엔진 기준의 추정이며 다른 검사기의 결과를 보장하지 않습니다. 제출 전에 뜻 · 수치 · 인용이 원문과 같은지 꼭 읽어 보세요.</p></div></article>';
    }
    /* 맛보기(첫 문단) */
    function taste(text, label) {
      var t = text || S.lastT || canon(ta.value); if (!t) return;
      var first = t.split(/\n{2,}/)[0].slice(0, 1200);
      busy(true);
      var lite = function () { return LITE.preview(first); };
      var p = CH.server.state === 'off' ? Promise.resolve(lite()) : CH.call('am.humanize', { text: first, tone: 'auto' }, 90000).catch(function (e) { if (e && (e.code === 'OFF' || e.code === 'SLOW')) return lite(); throw e; });
      p.then(function (r) {
        var box2 = document.createElement('article'); box2.className = 'rep';
        box2.innerHTML = '<header class="rep-h"><div><small>' + esc(label || '첫 문단 미리보기') + '</small><h3>이렇게 다듬어집니다</h3></div><dl class="rep-meta"><dt>바꾼 곳</dt><dd>' + CH.n(r.changes || 0) + '</dd><dt>엔진</dt><dd>' + (r.engine === 'lite' ? 'CH-Lite' : 'HUM 1.1') + '</dd></dl></header>' +
          '<div class="rep-sec"><div class="pairs"><div class="pair"><div><small>원문</small>' + esc(r.src || first) + '</div><div><small>다듬은 문장</small>' + diffHtml(r.src || first, r.text || '') + '</div></div></div>' +
          '<p class="fine">' + (r.engine === 'lite' ? '간이 엔진 미리보기입니다. 실제 휴머나이징은 서버 엔진(HUM)이 글 전체를 문장마다 확인하며 다듬습니다.' : '무료 미리보기는 첫 문단만 다듬어 보여 드립니다. 무엇을 왜 바꿨는지는 전체 결과에서 문장마다 보입니다.') + '</p>' +
          '<div class="acts"><button class="btn btn-p" type="button" data-act="' + (S.ck && label ? 'ckhum' : 'hum') + '">' + (S.ck && label ? '표시된 문장 모두 다듬기 · ' + CH.tk(CH.costParts('pro', spanParts(S.ck.spans).map(function (q) { return q.text; }))) + '토큰' : '글 전체 휴머나이징 · ' + CH.tk(CH.costParts('pro', chunk(t).parts)) + '토큰(' + CH.won(CH.costParts('pro', chunk(t).parts)) + ')') + '</button></div></div>';
        var anchor = $('.pay', out);
        if (anchor) out.insertBefore(box2, anchor); else out.appendChild(box2);
        bindOut(box2); box2.classList.add('pop'); if (CH.sweep) $$('.s-new', box2).length && $$('.pair > div:last-child', box2).forEach(function (d) { CH.sweep(d, 450); }); box2.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }).catch(fail).then(function () { busy(false); });
    }
    /* 결과확인서에 표시된 문장만(토큰) */
    function ckHumanize(sel) {
      var ck = S.ck; if (!ck || !ck.spans.length) return;
      sel = sel && sel.length ? sel : null;
      var spans = ckSpansOf(ck, sel), parts = spanParts(spans), need = CH.costParts('pro', parts.map(function (p) { return p.text; }));
      S.ckSel = sel; CH.ssset('ch_cksel', sel);
      var label = sel ? '표시 영역 ' + regCount(spans) + '곳 휴머나이징' : '표시 문장 휴머나이징';
      gate(need, label, function () {
        busy(true); show(progHtml('표시된 문장 다듬는 중', 0, parts.length, '결과확인서에 표시된 문장만 사람 말투로 바꿉니다. 숫자 · 이름 · 인용은 그대로 둡니다.', 'hum', spans.map(function (sp) { return sp.t; }).join(' '))); toOut();
          var newT = spans.map(function (sp) { return sp.t; });
        seq(parts, function (pt, i) {
          return CH.call('am.humanize', { text: pt.text, tone: 'auto', variant: 0, pass: CH.pass.code }, 150000).then(function (r) {
            var outs = String(r.text || '').split(/\n{2,}/);
            if (outs.length === pt.idx.length) { pt.idx.forEach(function (k, j) { newT[k] = outs[j].trim(); }); return; }
            return seq(pt.idx, function (k) { return CH.call('am.humanize', { text: spans[k].t, tone: 'auto', variant: 0, pass: CH.pass.code }, 120000).then(function (r2) { newT[k] = (r2.text || spans[k].t).trim(); }); });
          }).then(function () { show(progHtml('표시된 문장 다듬는 중', i + 1, parts.length, '', 'hum', spans.map(function (sp) { return sp.t; }).join(' '))); });
        }).then(function () {
          var text = ck.text, pairs = [];
          for (var k = spans.length - 1; k >= 0; k--) { var sp = spans[k]; text = text.slice(0, sp.s) + newT[k] + text.slice(sp.e); }
          spans.forEach(function (sp, k) { pairs.push({ lv: sp.lv, a: sp.t, b: newT[k], rg: sp.rg }); });
          var done = {}; spans.forEach(function (sp) { done[sp.rg] = 1; });
          var rest = ckRegions(ck).filter(function (r) { return !done[r.rg]; });
          S.hum = { src: ck.text, text: text, changed: pairs.filter(function (p) { return p.a !== p.b; }).length, pairs: pairs, rest: rest, ck: ck };
          setStep(3); CH.pass.refresh().then(CH.paintChip);
          show(ckHumHtml(S.hum)); bindOut();
        }).catch(fail).then(function () { busy(false); });
      }, 'ckhum');
    }
    function ckHumHtml(res) {
      var LVK = { hi: '높음', mid: '중간', low: '낮음' };
      var restHtml = '';
      if (res.rest && res.rest.length && res.ck) {
        var rs = res.rest.reduce(function (a, r) { return a + r.chars; }, 0), rsel = res.rest.map(function (r) { return r.rg; }), rtok = ckCost(res.ck, rsel);
        var S0 = res.ck.summary || {}, tot = ckRegions(res.ck).reduce(function (a, r) { return a + r.chars; }, 0);
        var est = S0.rate != null && tot ? Math.round(S0.rate * rs / tot) : null;
        restHtml = '<section class="pay"><div class="pay-h"><span class="eyebrow">남은 표시 영역</span><h3>아직 ' + res.rest.length + '곳 · ' + CH.n(rs) + '자가 표시된 채 남아 있습니다</h3><p>' + (est != null ? '남은 영역만으로도 예상 AI작성률은 ' + est + '%입니다. ' : '') + '지금 이어서 다듬으면 ' + CH.tk(rtok) + '토큰(' + CH.won(rtok) + ')이 빠집니다.</p></div>' +
          '<div class="acts"><button class="btn btn-p" type="button" data-act="ckplan" data-rg="' + rsel.join(',') + '">남은 ' + res.rest.length + '곳 마저 다듬기</button></div></section>';
      }
      return '<article class="rep"><header class="rep-h"><div><small>표시된 문장 휴머나이징</small><h3>원문 · 다듬은 문장 대조표</h3></div><dl class="rep-meta"><dt>다듬은 영역</dt><dd>' + regCount(res.pairs) + '곳</dd><dt>바꾼 곳</dt><dd>' + res.changed + '곳</dd></dl></header>' +
        '<div class="rep-sec"><div class="seg-tabs" role="tablist"><button type="button" role="tab" aria-selected="true" data-tab="pairs">대조표</button><button type="button" role="tab" aria-selected="false" data-tab="full">반영한 전체 글</button></div>' +
        '<div data-pane="pairs" class="pairs">' + res.pairs.map(function (p, i) { return '<div class="pair"><div><small>' + (i + 1) + ' · ' + LVK[p.lv] + ' · 원문</small>' + esc(p.a) + '</div><div><small>다듬은 문장</small>' + diffHtml(p.a, p.b) + '</div></div>'; }).join('') + '</div>' +
        '<div data-pane="full" hidden><div class="doc" tabindex="0">' + diffHtml(res.src, res.text) + '</div></div>' +
        '<div class="acts"><button class="btn btn-p" type="button" data-act="copypairs">대조표 복사</button><button class="btn btn-g" type="button" data-act="copy">전체 글 복사</button><button class="btn btn-g" type="button" data-act="docx">' + ico('down') + '워드 파일로 받기</button><button class="btn btn-g" type="button" data-act="again">다듬은 글로 다시 검사</button></div>' +
        '<p class="fine">한글(HWP) 원본에는 대조표를 보며 같은 문장을 바꿔 넣으세요. 다듬은 결과는 엔진 기준의 추정이며 카피킬러 등 다른 검사기의 결과를 보장하지 않습니다.</p></div></article>' + restHtml;
    }

    /* 결과 영역의 단추 */
    function bindOut(scope) {
      $$('[data-act]', scope || out).forEach(function (b) {
        if (b._b) return; b._b = 1;
        b.addEventListener('click', function () {
          var a = b.getAttribute('data-act');
          if (a === 'full') fullCheck();
          else if (a === 'hum') humanize();
          else if (a === 'taste') taste();
          else if (a === 'code') CH.buy({ focusCode: true, title: '토큰 코드 넣기' });
          else if (a === 'recheck') run();
          else if (a === 'ckhum') ckHumanize();
          else if (a === 'ckplan') ckHumanize(String(b.getAttribute('data-rg') || b.getAttribute('data-v') || '').split(',').filter(Boolean).map(Number));
          else if (a === 'plan') planRun(+b.getAttribute('data-v'));
          else if (a === 'cktaste') { if (S.ck && S.ck.spans.length) taste(S.ck.spans[0].t, '표시된 첫 곳 미리보기'); }
          else if (a === 'ckcheck') run({ keepCk: true });
          else if (a === 'copy') { if (S.hum) CH.copy(S.hum.text); }
          else if (a === 'copypairs') { if (S.hum && S.hum.pairs) CH.copy(S.hum.pairs.map(function (p, i) { return '[' + (i + 1) + '] 원문\n' + p.a + '\n[' + (i + 1) + '] 다듬은 문장\n' + p.b; }).join('\n\n')); }
          else if (a === 'docx') download();
          else if (a === 'again') { if (S.hum) { ta.value = S.hum.text; count(); S.ck = null; setChip(''); run(); } }
        });
      });
      $$('[data-tab]', scope || out).forEach(function (b) {
        if (b._b) return; b._b = 1;
        b.addEventListener('click', function () {
          var wrap = b.closest('.rep-sec');
          $$('[data-tab]', wrap).forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
          $$('[data-pane]', wrap).forEach(function (p) { p.hidden = p.getAttribute('data-pane') !== b.getAttribute('data-tab'); });
        });
      });
    }
    function download() {
      if (!S.hum || !TI()) return;
      var base = (S.docName || '카피휴먼').replace(/\.[a-z0-9]+$/i, '');
      var p = S.src && S.src.doc ? TI().exportSame(S.src, S.hum.text) : Promise.resolve(null);
      p.then(function (r) {
        if (r && r.blob) { TI().save(r.blob, base + '_다듬은글.' + r.ext); return; }
        return TI().newDocx(S.hum.text, base).then(function (b) { TI().save(b, base + '_다듬은글.docx'); });
      }).catch(function () { CH.toast('파일을 만들지 못했어요. 복사해서 붙여 넣어 주세요.'); });
    }

    /* 바로 결제하고 돌아왔으면 하려던 일을 이어서 */
    if (CH.payResult) CH.payResult.then(function (res) {
      if (!res || !res.ok || !res.intent) return;
      if (res.intent === 'ckhum' && !S.ck) { var ck = CH.ssget('ch_ck'); if (ck && ck.spans && ck.spans.length) { S.ck = ck; S.docName = (ck.summary && ck.summary.docName) || S.docName; ta.value = ck.text; count(); setStep(2); } }
      S.skipAsk = true;
      if (res.intent === 'full') fullCheck(); else if (res.intent === 'hum') humanize(); else if (res.intent === 'ckhum' && S.ck) ckHumanize(CH.ssget('ch_cksel'));
      else if (res.intent === 'plan') { var pl = CH.ssget('ch_plan'); if (S.res) planRun(pl ? +pl.target : 0); else { S.skipAsk = false; S.planAfter = pl ? +pl.target : 0; run(); } }
      else S.skipAsk = false;
    });
    runB.addEventListener('click', function () { run(); });
    ta.addEventListener('keydown', function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); } });
  }

  $$('[data-tool]').forEach(init);
})();
