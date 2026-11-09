/* 카피휴먼 검사 도구: ① 글 넣기 → ② AI 작성률 확인(결과확인서) → ③ 휴머나이징
   - 엔진: 카피휴먼 서버(DET · HUM)를 먼저 쓰고, 닿지 않으면 브라우저 안 CH-Lite로 검사합니다.
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
  /* 붙여 넣은 글만 한 번 더 정리(파일에서 읽은 글은 그대로): 같은 문서를 어디서 복사해 넣어도 같은 결과가 나오게
     - 자모가 풀린 한글(NFD, 맥 등에서 복사)을 합침
     - PDF 보기 화면 등에서 복사해 줄마다 끊긴 문단을 한 줄로 이음(줄 대부분이 거의 같은 길이로 꽉 차 있고 문장 끝이 아닌 데서 끊긴 경우만.
       목록 · 제목 · 짧은 줄 · 문장이 끝난 줄 뒤는 그대로) */
  var WRAP_END = /[.?!。…:;]["'”’)\]」』]*$/;
  var WRAP_MARK = /^(?:[-–—•·*●○■□▶▷◆◇※→]|[①-⑳❶-❿]|\d{1,3}[.)]|[가-힣][.)]|\(\d{1,3}\)|[A-Za-z][.)]\s)/;
  function unwrap(s) {
    if (s.indexOf('\n') < 0) return s;
    return s.split('\n\n').map(function (p) {
      var L = p.split('\n'); if (L.length < 3) return p;
      var max = 0; L.forEach(function (x) { if (x.length > max) max = x.length; });
      if (max < 20) return p;
      var full = function (x) { return x.length >= max * 0.8 && !WRAP_END.test(x); };
      var body = L.slice(0, -1);
      if (body.filter(full).length < body.length * 0.6) return p;
      var out = L[0];
      for (var i = 1; i < L.length; i++) out += (full(L[i - 1]) && !WRAP_MARK.test(L[i]) ? ' ' : '\n') + L[i];
      return out;
    }).join('\n\n');
  }
  function pasted(t) { var s = String(t == null ? '' : t); if (s.normalize) s = s.normalize('NFC'); return unwrap(canon(s)); }
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
    if (typeof t !== 'string') return t;
    return t.replace(/AI 의심 문장/g, 'AI 패턴 문장').replace(/AI 검출 문장/g, 'AI 패턴 문장').replace(/의심 문장/g, 'AI 패턴 문장').replace(/검출 문장/g, 'AI 패턴 문장')
      .replace(/AI 의심 구간/g, 'AI 패턴 구간').replace(/AI 검출 구간/g, 'AI 패턴 구간').replace(/의심 구간/g, 'AI 패턴 구간').replace(/검출 구간/g, 'AI 패턴 구간')
      .replace(/\(높음 (\d+) · 중간 (\d+) · 낮음 (\d+)\)/g, function (m, a) { return '(AI 점수 85 이상 ' + a + '개)'; }).replace(/높음 · 중간 문장부터/g, 'AI 점수가 높은 문장부터')
      .replace(/AI 작성 패턴과 비슷한 문장으로 검출되었습니다/g, 'AI 패턴 문장으로 검출되었습니다').replace(/현재 상태로 제출 · 게시하는 것은 권장하지 않습니다\./g, '이 상태로는 제출하지 마세요.');
  }
  function bandOf(b, aiN) {
    var k = (b && b.key) || 'short';
    var T = { unfit: ['부적합', '부적합 · AI 글로 판정됩니다. 이대로 제출하면 안 됩니다'], risk: ['고위험', '고위험 · AI 패턴 문장이 그대로 남습니다. 제출 전에 고치세요'], safe: ['안전', '안전 · AI 패턴이 발견되지 않았습니다'], caution: ['안전', '안전 · AI처럼 읽히는 표현이 있습니다'], short: ['판단 보류', '판단 보류 · 글이 짧아 판정하지 않았습니다'] }[k] || ['판단 보류', '판단 보류'];
    var label = T[1];
    if ((k === 'safe' || k === 'caution') && aiN > 0) label = '안전 · 그래도 AI 패턴 문장 ' + aiN + '개는 고치세요';
    return { key: k === 'caution' ? 'safe' : k, ko: T[0], label: label, why: ((b && b.why) || []).map(CH.bandWord).map(firm) };
  }
  /* 결과확인서의 AI작성률을 카피휴먼 판정 기준(부적합 40% 이상 · 고위험 20% 이상 · 안전 20% 미만)으로 읽음 */
  function bandOfRate(rate, aiN) {
    var k = rate == null ? 'short' : rate >= 40 ? 'unfit' : rate >= 20 ? 'risk' : 'safe';
    var why = rate == null ? [] : [k === 'unfit' ? 'AI작성률 ' + rate + '%(부적합 기준 40% 이상)' : k === 'risk' ? 'AI작성률 ' + rate + '%(고위험 기준 20% 이상)' : 'AI작성률 ' + rate + '%(안전 기준 20% 미만)'];
    return bandOf({ key: k, why: why }, aiN);
  }
  function normalize(r, extra) {
    var a = r.ai || r.aiAfter || {};
    var N = {
      engine: r.engine === 'lite' ? 'lite' : 'server', full: !!r.full, rate: a.rate || 0, n: a.n || 0, chars: a.chars || 0, aiChars: a.aiChars || 0,
      aiN: a.aiN != null ? a.aiN : ((a.lv || {}).hi || 0) + ((a.lv || {}).mid || 0) + ((a.lv || {}).low || 0), lv: a.lv || { hi: 0, mid: 0, low: 0 },
      band: bandOf(a.band, a.aiN != null ? a.aiN : ((a.lv || {}).hi || 0) + ((a.lv || {}).mid || 0) + ((a.lv || {}).low || 0)),
      segN: a.segN || 0, segAi: a.segAi || 0, chat: a.chat || 0, feat: a.feat || [], opinion: (a.opinion || []).map(CH.bandWord).map(firm), cn: a.cn || '',
      sentences: a.sentences || [], segs: a.segs || null, model: a.model || '', ver: a.v || '', critName: a.critName || '', samples: r.samples || [], shown: a.shown, locked: !!a.locked || !r.full,
      autoTone: r.autoTone || '', flagChars: a.flagChars != null ? a.flagChars : (a.aiChars || 0), flagRate: a.flagRate != null ? a.flagRate : (a.rate || 0)
    };
    if (N.engine === 'lite') N.locked = true;
    Object.keys(extra || {}).forEach(function (k) { N[k] = extra[k]; });
    return N;
  }
  function opinionOf(M) {
    var o = [], top = M.feat.slice(0, 2).map(function (f) { return "'" + f.name + "'"; }).join('과 ');
    o.push('검사한 글 ' + CH.n(M.chars) + '자 가운데 AI 패턴 문장은 ' + CH.n(M.flagChars != null ? M.flagChars : M.aiChars) + '자(' + (M.flagRate != null ? M.flagRate : M.rate) + '%)이고, 문장마다 AI 점수를 글자 수만큼 반영한 AI 작성률은 ' + M.rate + '%입니다.');
    o.push(M.segN + '개 구간 가운데 ' + M.segAi + '개 구간에서 AI 패턴이 뚜렷합니다.');
    if (top) o.push('가장 많이 나온 AI 문체 특성은 ' + top + '입니다.');
    o.push('AI 패턴 문장은 ' + M.aiN + '개(AI 점수 85 이상 ' + M.lv.hi + '개)입니다. AI 점수가 높은 문장부터 고치면 AI 작성률이 가장 크게 내려갑니다.');
    o.push('다른 검사기에서는 이보다 높게 나올 수 있습니다. AI 패턴 문장이 남아 있으면 제출 전에 고치세요.');
    return o;
  }
  function merge(rs, full, src) {
    if (rs.length === 1) return normalize(rs[0], { full: full, total: src.length });
    var M = { engine: 'server', full: full, rate: 0, n: 0, chars: 0, aiChars: 0, aiN: 0, lv: { hi: 0, mid: 0, low: 0 }, segN: 0, segAi: 0, chat: 0, feat: [], sentences: [], segs: [], samples: [], cn: '', total: src.length, locked: !full, autoTone: (rs[0] && rs[0].autoTone) || '', flagChars: 0 };
    var poff = 0, soff = 0, F = {};
    rs.forEach(function (r) {
      var a = r.ai || {}, ss = a.sentences || [], maxp = -1;
      ss.forEach(function (s) { var c = Object.assign({}, s); c.para = (s.para || 0) + poff; M.sentences.push(c); if ((s.para || 0) > maxp) maxp = s.para || 0; });
      (a.segs || []).forEach(function (g) { var c = Object.assign({}, g); c.s = g.s + soff; c.e = g.e + soff; M.segs.push(c); });
      poff += maxp + 1; soff += ss.length;
      M.n += a.n || 0; M.chars += a.chars || 0; M.aiChars += a.aiChars || 0; M.flagChars += a.flagChars != null ? a.flagChars : (a.aiChars || 0); M.segN += a.segN || 0; M.segAi += a.segAi || 0; M.chat += a.chat || 0;
      if (a.lv) { M.lv.hi += a.lv.hi || 0; M.lv.mid += a.lv.mid || 0; M.lv.low += a.lv.low || 0; }
      (a.feat || []).forEach(function (f) { var o = F[f.cat] = F[f.cat] || { cat: f.cat, name: f.name, n: 0, segs: 0, tags: [], why: f.why, lock: 0 }; o.n += f.n || 0; o.segs += f.segs || 0; if (f.lock) o.lock = 1; (f.tags || []).forEach(function (t) { if (o.tags.indexOf(t) < 0 && o.tags.length < 4) o.tags.push(t); }); });
      if (r.samples) M.samples = M.samples.concat(r.samples);
      if (!M.cn && a.cn) M.cn = a.cn; M.model = a.model || M.model; M.ver = a.v || M.ver; M.critName = a.critName || M.critName;
    });
    M.aiN = M.lv.hi + M.lv.mid + M.lv.low;
    M.rate = M.chars ? Math.round(M.aiChars * 100 / M.chars) : 0; M.flagRate = M.chars ? Math.round(M.flagChars * 100 / M.chars) : 0;
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
    return '<div class="gauge" aria-hidden="true"><div class="gauge-bar"><i style="width:' + w + '%"></i></div><div class="gauge-bands"><span class="b-ok">0 안전</span><span class="b-mid">20 고위험</span><span class="b-hi">40 부적합<i>100</i></span></div></div>';
  }
  function stat(label, value, cls) { return '<div><dt>' + label + '</dt><dd' + (cls ? ' class="' + cls + '"' : '') + '>' + value + '</dd></div>'; }
  function docHtml(sent, mode) {   // mode: free | full
    var out = [], cur = -1, buf = [];
    function flush() { if (buf.length) out.push('<p>' + buf.join(' ') + '</p>'); buf = []; }
    sent.forEach(function (s) {
      if (s.para !== cur) { flush(); cur = s.para; }
      var t = esc(s.t);
      if (s.ai && !s.lock && s.g) {
        var c = s.g === 3 ? 'hi' : s.g === 2 ? 'mid' : 'low';
        buf.push('<span class="s s-' + c + '" title="AI 패턴 · AI 점수 ' + (s.p != null ? s.p : '') + '">' + t + '<span class="sc">AI' + (s.p != null ? ' ' + s.p : '') + '</span></span>');
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
  function engV(v, d) { var m = /^(\d+)\.(\d+)/.exec(String(v || '')); return m ? m[1] + '.' + m[2] : d; }   // 서버 판 '1.3.0' → '1.3'
  function engineLine(N) {
    return N.engine === 'lite' ? '카피휴먼 간이 엔진 CH-Lite 1.0' : '카피휴먼 판별 엔진 DET ' + engV(N.ver, '1.2') + (N.critName ? ' · ' + esc(N.critName.replace(/^(AIMarker|카피휴먼) 판정 기준/, '판정 기준')) : '');
  }
  function reportHtml(N, ctx) {
    var b = N.band, k = b.key;
    var cutNote = N.cut ? '<div class="lockline">' + ico('lock') + '<span>앞 ' + CH.n(N.checked || FREE_MAX) + '자만 검사했습니다(전체 ' + CH.n(N.total) + '자). 나머지 부분까지 검사하려면 전체 결과를 여세요.</span></div>' : '';
    var lockNote = N.locked && N.aiN > (N.shown || 0) ? '<div class="lockline">' + ico('lock') + '<span>AI 패턴 문장 <b>' + N.aiN + '개</b> 가운데 가장 뚜렷한 <b>' + (N.shown || 0) + '개</b>만 표시했습니다. 나머지 ' + (N.aiN - (N.shown || 0)) + '개는 전체 결과에서 보입니다.</span></div>' : '';
    var liteNote = N.engine === 'lite' ? '<p class="fine">엔진 서버와 연결되지 않아 이 브라우저 안의 간이 엔진으로 검사했습니다. 수치는 간이 엔진 기준이며 서버 엔진 결과와 다를 수 있습니다.</p>' : '';
    return '<article class="rep" aria-label="AI 생성 검사 결과">' +
      '<header class="rep-h"><div><small>카피휴먼 AI 생성 검사</small><h3>상세 결과확인서</h3></div>' +
      '<dl class="rep-meta"><dt>검사번호</dt><dd>' + esc(N.cn || '-') + '</dd><dt>검사일시</dt><dd>' + nowStr() + '</dd><dt>문서</dt><dd>' + esc(ctx.docName || KINDKO[ctx.kind] || '붙여 넣은 글') + '</dd><dt>글자 수</dt><dd>' + CH.n(N.total || N.chars) + '자</dd></dl></header>' +
      '<div class="rep-v is-' + k + '"><div class="verdict"><span class="pill is-' + k + '">' + ico(BICO[k]) + esc(b.ko) + '</span><h4>' + esc(b.label) + '</h4><ul class="why">' + (b.why || []).map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>' +
      '<div><div class="gauge-n"><b data-n="' + N.rate + '" data-suf="%">' + N.rate + '%</b><span>AI 작성률</span></div>' + gauge(N.rate) + '</div></div>' +
      '<div class="rep-sec stats-sec"><h4>분석 정보</h4><dl class="rep-stats is-' + k + '">' + stat('AI 작성률', N.rate + '%', 'rate') + stat('전체 문장', CH.n(N.n)) + stat('AI 패턴 문장', CH.n(N.aiN), N.aiN ? 'warn' : '') + stat('AI 점수 85 이상', CH.n(N.lv.hi)) + stat('AI 패턴 구간', N.segN ? N.segAi + ' / ' + N.segN : '-') + '</dl></div>' +
      '<div class="rep-sec"><h4>종합 의견</h4><ol class="opinion">' + N.opinion.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join('') + '</ol></div>' +
      '<div class="rep-sec"><h4>AI 패턴 문장 <span class="cnt">' + (N.locked ? '일부 표시' : '전체 표시') + '</span></h4>' + cutNote + lockNote +
      '<div class="legend"><span class="l-hi"><i></i>AI 패턴 문장 · 숫자는 AI 점수(0~99), 진할수록 높음</span></div>' +
      '<div class="doc" tabindex="0">' + docHtml(N.sentences, N.locked ? 'free' : 'full') + '</div></div>' +
      '<div class="rep-sec"><h4>AI 문체 특성 <span class="cnt">' + N.feat.length + '종</span></h4>' + featHtml(N.feat) + '</div>' +
      '<div class="rep-sec"><p class="fine">검사 엔진: ' + engineLine(N) + '. AI 작성률은 문장마다 AI 점수를 그 문장의 글자 수만큼 반영한 추정값(판별 모델이 틀릴 수 있는 만큼을 남겨 7~92%)이며 증명이 아닙니다. 다른 검사기의 결과와 다를 수 있고, 같은 글은 언제나 같은 결과가 나옵니다.</p>' + liteNote + '</div>' +
      '</article>';
  }
  /* 목표별 다듬기 계획(붙여 넣은 글): 검출 글자 가운데 얼마나 고쳐야 목표 아래로 내려가는지
     need = 전체 글자 × (지금 AI 작성률 − 목표) × 여유(1.25, 보수적으로), 검출 글자를 넘지 않음. 예상 수치는 고친 문장이 다시 잡히지 않을 때의 산술값 */
  function hourStr(h) { var m = Math.round(h * 2) / 2; if (m < 1) return '약 30분'; return '약 ' + Math.floor(m) + '시간' + (m % 1 ? ' 30분' : ''); }
  /* 2026.11.09 HUM 2.1: AI 작성률이 '문장 AI 점수 × 글자 수(7~92%)'가 되어 목표 다듬기도 같은 셈으로. 다듬을 문장은 AI 패턴 문장부터(그다음 AI 점수 35 이상),
     다듬은 문장에도 AI 몫이 PLAN_Q(18%) 남는다고 보고 목표(여유 25%)까지 고름. 예상 수치는 이 셈의 산술값 */
  var SH = { L: 0.07, U: 0.92 }, PLAN_Q = +CFG.planResid || 0.18;
  function shareOf(x) { return SH.L + (SH.U - SH.L) * Math.max(0, Math.min(100, +x.p || 0)) / 100; }
  function planPick(N, t, target, done) {
    var total = N.chars || noSp(t), M = +CFG.planMargin || 1.25, acc = total * (N.rate || 0) / 100;
    var fl = (N.sentences || []).map(function (x, i) { x._i = i; return x; }).filter(function (x) { return !x.skip && !(done && done[x._i]) && (x.ai || (+x.p || 0) >= 35); })
      .sort(function (a, b) { return ((b.ai ? 1 : 0) - (a.ai ? 1 : 0)) || ((b.g || 0) - (a.g || 0)) || ((b.p || 0) - (a.p || 0)) || (noSp(b.t) - noSp(a.t)); });
    var goal = target ? total * target / 100 / M : -1, sel = [], need = 0;
    for (var i = 0; i < fl.length && acc > goal; i++) { var L = noSp(fl[i].t), gain = Math.max(0, shareOf(fl[i]) - PLAN_Q) * L; if (!target && !fl[i].ai && gain <= 0) continue; sel.push(fl[i]); need += L; acc -= gain; }
    return { sel: sel, need: need, est: total ? Math.max(0, Math.round(acc * 100 / total)) : 0 };
  }
  function planRows(N, t, done) {
    var total = N.chars || noSp(t), rate = N.rate || 0, A = planPick(N, t, 0, done);
    if (!total || !A.sel.length) return [];
    var ratio = noSp(t) ? t.length / noSp(t) : 1.3, H = +CFG.manualHour || 1.5;
    var C = chunk(t), full = !!N.full, unit = full ? 0 : CH.costParts('unit', C.parts);
    var rows = [], used = {};
    [30, 20, 10].forEach(function (target) {
      if (rate < target) return;
      var P = planPick(N, t, target, done);
      if (!P.sel.length || P.est >= target || used[P.sel.length]) return;
      used[P.sel.length] = 1;
      rows.push({ target: target, need: P.need, est: P.est, n: P.sel.length });
    });
    if (!used[A.sel.length]) rows.push({ target: 0, need: A.need, est: A.est, n: A.sel.length });
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
    return '<div class="tbl-wrap plan-wrap"><table class="plan-t"><thead><tr><th scope="col">목표</th><th scope="col">다듬을 분량</th><th scope="col">예상 AI 작성률</th><th scope="col">토큰</th><th scope="col">카피휴먼</th><th scope="col">직접 고치면</th><th scope="col"></th></tr></thead><tbody>' +
      rows.map(function (r, i) {
        var act = opt.act || 'plan', val = opt.val ? opt.val(r) : String(r.target), last = i === rows.length - 1;
        return '<tr' + (last ? ' class="all"' : '') + '><td class="tg" data-th="목표"><b>' + (r.target ? r.target + '% 미만' : (opt.allLabel || 'AI 패턴 문장 모두')) + '</b></td><td data-th="다듬을 분량">' + (opt.amount ? opt.amount(r) : '문장 ' + r.n + '개 · ' + CH.n(r.need) + '자') + '</td><td class="est" data-th="예상 AI 작성률"><b class="' + (r.est >= 40 ? 'c-hi' : r.est >= 20 ? 'c-mid' : 'c-ok') + '">' + r.est + '%</b><small>' + (r.est >= 40 ? '부적합' : r.est >= 20 ? '고위험' : '안전') + '</small></td><td class="n" data-th="토큰"><b>' + CH.tk(r.tok) + '토큰</b>' + (r.unit ? '<small class="muted"> · 전체 결과 포함</small>' : '') + '</td><td data-th="카피휴먼">약 ' + r.min + '분</td><td data-th="직접 고치면">' + r.hour + '</td>' +
          '<td class="act"><button class="btn btn-s ' + (last ? 'btn-p' : 'btn-g') + '" type="button" data-act="' + act + '" data-v="' + esc(val) + '">' + (r.target ? r.target + '% 미만으로' : (opt.allBtn || '모두 다듬기')) + '</button></td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function planNote() {
    return '<p class="fine">예상 수치는 고른 문장을 다듬은 뒤에도 AI 몫이 ' + Math.round(PLAN_Q * 100) + '% 남는다고 본 산술값(여유 ' + Math.round(((+CFG.planMargin || 1.25) - 1) * 100) + '%)이며 다른 검사기를 보장하지 않습니다. 직접 고치는 시간은 1,000자당 ' + hourStr(+CFG.manualHour || 1.5) + '으로 잡은 추정입니다.</p>';
  }

  /* 2026.11.09 HUM 2.0 말투는 글마다 한 번 정함: 서버 검사(am.style check)가 글 전체의 자동 말투(autoTone)를 돌려줌. 'plain'이면 보고서 · 논설문처럼 보이는
     습니다체 글이라 엔진이 '~다'로 낮춤('~습니다'로 끝나는 문장은 판정 기준이 AI 쪽으로 크게 봐서 그대로 두면 잘 내려가지 않음).
     목표 다듬기는 문장 묶음마다 따로 보내서, 말투를 묶음마다 서버가 정하면 고른 묶음만 '~다'로 바뀌어 말투가 섞였음 → 정한 말투를 모든 조각(am.humanize · am.punc)에 똑같이 보냄.
     이용자가 끄면 원래 말투 그대로(keep). 정한 값은 글 앞부분 해시와 함께 sessionStorage(결제하고 돌아와도 같게) */
  function toneKey(t) { return LITE.hash(String(t || '').slice(0, 800)); }
  function toneSaved(t) { var sv = CH.ssget('ch_tone'); return sv && sv.k === toneKey(t) ? sv : null; }
  function toneSet(t, auto, on) { CH.ssset('ch_tone', { k: toneKey(t), auto: auto || '', on: !!on }); }
  function toneInit(t, auto) { var sv = toneSaved(t); if (auto && (!sv || sv.auto !== auto)) toneSet(t, auto, auto === 'plain'); }
  function toneReq(t, part) { var sv = toneSaved(t); if (!sv || !sv.auto) return part ? 'keep' : 'auto'; return sv.auto === 'plain' && sv.on ? 'plain' : 'keep'; }   // part: 문장 묶음만 보내는 다듬기(정한 말투가 없으면 바꾸지 않음)
  function toneHtml(t) {
    var sv = toneSaved(t); if (!sv || sv.auto !== 'plain') return '';
    return '<label class="tone-opt" style="display:flex;gap:10px;align-items:flex-start;margin:0 0 16px;padding:12px 14px;border:1px solid var(--line2);border-radius:12px;background:var(--card);cursor:pointer;line-height:1.55">' +
      '<input type="checkbox" data-tone' + (sv.on ? ' checked' : '') + ' style="margin-top:4px;flex:none;width:18px;height:18px">' +
      '<span><b>말투를 \'~다\'로 바꿔서 다듬기</b> <small class="muted">보고서 · 과제 · 논설문</small><br><small>이 글은 \'~습니다\' 말투입니다. 판정 기준이 \'~습니다\'로 끝나는 문장을 AI 쪽으로 크게 봐서, 말투를 그대로 두면 문장을 바꿔도 AI 작성률이 잘 내려가지 않습니다. 발표문 · 안내문처럼 \'~습니다\'가 꼭 필요하면 끄세요.</small></span></label>';
  }
  function payHtml(N, t) {
    var C = chunk(t), det = CH.costParts('unit', C.parts), hasPass = !!CH.pass.code;
    var risky = N.band.key === 'unfit' || N.band.key === 'risk';
    var rows = planRows(N, t);
    var head = risky ? 'AI 패턴 문장 ' + N.aiN + '개 · 이대로 내면 AI 글로 걸러질 수 있습니다' : N.aiN > 0 ? 'AI 패턴 문장 ' + N.aiN + '개 · 지금 고치면 깨끗해집니다' : '제출 전에 한 번 더 확인하세요';
    var sub = risky ? '목표를 고르면 AI 점수가 높은 문장부터 필요한 만큼만 사람 말투로 바꾸고, 같은 기준으로 다시 검사합니다. 뜻 · 숫자 · 인용은 그대로.' : '다른 검사기에서는 더 높게 나올 수 있습니다. 지금 다듬어 두면 어디서든 여유가 생깁니다.';
    return '<section class="pay" aria-label="다음 단계">' +
      '<div class="pay-h"><span class="eyebrow">목표를 고르면 바로 다듬습니다</span><h3>' + head + '</h3>' +
      '<p>' + sub + ' 이 글 ' + CH.n(t.length) + '자 기준.</p></div>' + toneHtml(t) +
      (rows.length ? planTable(rows) + planNote() : '') +
      '<div class="pay-opts">' +
      '<div class="pay-opt"><h4>전체 결과만 먼저 보기</h4><p class="cost"><b>' + CH.tk(det) + '토큰</b>' + (det > 0 ? '' : ' · 600자 이하는 토큰 없이') + '</p>' +
      '<ul><li>AI 패턴 문장 ' + N.aiN + '개 전부의 위치와 AI 점수</li><li>표현별 AI 패턴과 바꿀 말</li></ul>' +
      '<button class="btn btn-g btn-block" type="button" data-act="full">' + (hasPass ? '전체 결과 열기' : '토큰 충전하고 전체 결과 보기') + '</button></div>' +
      '<div class="pay-opt"><h4>어떻게 바뀌는지 먼저 보기</h4><p class="cost"><b>무료</b> · 첫 문단만</p>' +
      '<ul><li>첫 문단을 사람 말투로 바꾼 모습</li><li>무엇을 왜 바꿨는지는 유료 결과에서</li></ul>' +
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
      var lab = !labeled[g.sp.rg] ? '<span class="lab ' + g.sp.lv + '">AI 패턴</span>' : '';
      labeled[g.sp.rg] = 1;
      return lab + '<span class="s s-' + g.sp.lv + '">' + h + '</span>';
    }).join('');
    var chars = ck.spans.reduce(function (a, s) { return a + s.t.length; }, 0), nreg = regCount(ck.spans);
    var cost = ckCost(ck), band = bandOfRate(S.rate, nreg), k = band.key, hasPass = !!CH.pass.code;
    var plan = ckPlan(ck);
    var planHtml = plan.length ? '<div class="rep-sec"><h4>목표를 고르면 바로 다듬습니다 <span class="cnt">큰 영역부터</span></h4>' +
      planTable(plan, { act: 'ckplan', val: function (r) { return r.sel.join(','); }, amount: function (r) { return r.n + '곳 · ' + CH.n(r.chars) + '자'; }, allLabel: '표시 영역 모두' }) +
      '<p class="fine">예상 수치는 다듬은 영역이 다시 잡히지 않을 때의 산술값이며 카피킬러 재검사를 보장하지 않습니다. 직접 고치는 시간은 1,000자당 ' + hourStr(+CFG.manualHour || 1.5) + '으로 잡은 추정입니다.</p></div>' : '';
    var allCard = plan.length ? '' : '<div class="pay-opt rec"><h4>표시 영역 모두 휴머나이징</h4><p class="cost"><b>' + CH.tk(cost) + '토큰</b></p>' +
      '<ul><li>표시된 ' + nreg + '곳 ' + CH.n(chars) + '자를 사람 말투로</li><li>숫자 · 이름 · 인용은 그대로</li></ul>' +
      '<button class="btn btn-p btn-block" type="button" data-act="ckhum">' + (hasPass ? '표시된 문장 모두 다듬기' : '토큰 충전하고 다듬기') + '</button></div>';
    return '<article class="rep" aria-label="AI생성검사 결과확인서 불러오기">' +
      '<header class="rep-h"><div><small>불러온 카피킬러 결과확인서 · AI생성검사</small><h3>카피킬러 AI작성률 ' + (S.rate != null ? S.rate + '%' : '-') + '</h3></div><dl class="rep-meta"><dt>문서</dt><dd>' + esc(S.docName || '-') + '</dd><dt>검사일자</dt><dd>' + esc(S.date || '-') + '</dd><dt>표시 영역</dt><dd>' + nreg + '곳 · ' + CH.n(chars) + '자</dd></dl></header>' +
      '<div class="rep-v is-' + k + '"><div class="verdict"><span class="pill is-' + k + '">' + ico(BICO[k]) + esc(band.ko) + '</span><h4>' + esc(band.label) + '</h4><ul class="why">' + band.why.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') +
      '<li>표시된 ' + nreg + '곳 · ' + CH.n(chars) + '자가 이 수치를 만듭니다. 이대로 제출하면 AI 글로 걸러질 수 있습니다.</li></ul></div>' +
      '<div><div class="gauge-n"><b data-n="' + (S.rate != null ? S.rate : 0) + '" data-suf="%">' + (S.rate != null ? S.rate : 0) + '%</b><span>결과확인서 AI작성률</span></div>' + gauge(S.rate || 0) + '</div></div>' +
      '<div class="rep-sec stats-sec"><h4>결과확인서에 적힌 분석 정보 <span class="cnt">카피킬러 표기 그대로</span></h4><dl class="rep-stats is-' + k + '">' + stat('AI작성률', S.rate != null ? S.rate + '%' : '-', 'rate') + stat('전체 영역', S.total != null ? S.total : '-') + stat('AI 의심 영역', S.suspect != null ? S.suspect : '-', S.suspect ? 'warn' : '') + stat('높음', S.hi != null ? S.hi : '-') + stat('중간', S.mid != null ? S.mid : '-') + stat('낮음', S.low != null ? S.low : '-') + '</dl></div>' +
      planHtml +
      '<div class="rep-sec"><h4>결과확인서에 표시된 영역 <span class="cnt">' + nreg + '곳 · ' + CH.n(chars) + '자</span></h4>' +
      '<div class="legend"><span class="l-hi"><i></i>결과확인서에 AI 패턴으로 표시된 영역 · 진할수록 결과확인서의 등급이 높음</span></div>' +
      '<div class="doc" tabindex="0"><p>' + html + '</p></div>' +
      '<p class="fine">학번 · 이름 · 이메일은 읽지 않고, 본문과 표시 위치만 이 브라우저 안에서 꺼냈습니다.</p></div></article>' +
      '<section class="pay" aria-label="표시된 문장 다듬기"><div class="pay-h"><span class="eyebrow">먼저 보고 싶다면</span><h3>표시된 ' + CH.n(chars) + '자만 다듬어 토큰을 아낍니다</h3>' +
      '<p>원문과 나란히 보여 드려 한글 파일에 바로 옮길 수 있습니다.</p></div>' +
      '<div class="pay-opts">' + allCard + '<div class="pay-opt"><h4>어떻게 바뀌는지 먼저 보기</h4><p class="cost"><b>무료</b> · 첫 곳만</p><ul><li>표시된 첫 영역을 사람 말투로 바꾼 모습</li></ul><button class="btn btn-g btn-block" type="button" data-act="cktaste">첫 곳 무료로 보기</button></div>' +
      '<div class="pay-opt"><h4>카피휴먼 엔진으로 다시 검사</h4><p class="cost">문장마다 AI 점수</p><ul><li>결과확인서 본문으로 바로 검사</li></ul><button class="btn btn-g btn-block" type="button" data-act="ckcheck">이 본문으로 검사하기</button></div></div>' +
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
    check: ['문장 나누기', 'AI 패턴 DB 89억 개와 문장마다 대조하기', '공개한 판정 기준으로 안전 · 고위험 · 부적합 판정'],
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
          setChip('<div class="file-chip warn">' + ico('alert') + '<b>카피킬러 표절검사 결과확인서 · ' + esc(f.name) + '</b><span class="small">표절률' + (ck.rate != null ? ' ' + ck.rate + '%' : '') + ' · AI작성률 결과가 아님</span><button type="button" aria-label="파일 빼기">빼기</button></div>');
          say('표절검사 결과확인서입니다. 카피킬러 AI생성검사 결과확인서(AI작성률)를 상세보기로 발급해 올려 주세요.');
          if (fileIn) fileIn.value = '';
          return;
        }
        if (ck && !ck.ok && ck.kind === 'copykiller') {
          var s0 = ck.summary || {};
          setChip('<div class="file-chip warn">' + ico('alert') + '<b>카피킬러 결과확인서 · ' + esc(f.name) + '</b><span class="small">' + (s0.rate != null ? 'AI작성률 ' + s0.rate + '% · ' : '') + '표시 문장을 읽지 못함</span><button type="button" aria-label="파일 빼기">빼기</button></div>');
          say('표시된 문장을 읽지 못했습니다. 카피킬러에서 상세보기로 다시 내려받은 PDF를 올리거나, 글을 직접 붙여 넣어 주세요.');
          if (fileIn) fileIn.value = '';
          return;
        }
        if (ck && !ck.ok && ck.kind === 'other') {
          setChip(''); say('카피킬러 AI생성검사 결과확인서가 아닙니다. AI생성검사 상세 결과확인서 PDF를 올려 주세요.'); if (fileIn) fileIn.value = ''; return;
        }
        if (ck && ck.ok) {
          S.ck = ck; S.src = null; S.docName = (ck.summary && ck.summary.docName) || f.name;
          try { var keep = { kind: ck.kind, summary: ck.summary, text: ck.text, spans: ck.spans, regions: ck.regions, ok: true }; if (JSON.stringify(keep).length < 2000000) CH.ssset('ch_ck', keep); } catch (eK) { /* 저장 없이 */ }
          ta.value = ck.text; count();
          var s = ck.summary || {};
          setChip('<div class="file-chip">' + ico('file') + '<b>카피킬러 결과확인서 · ' + esc(S.docName) + '</b><span class="small muted">AI작성률 ' + (s.rate != null ? s.rate + '%' : '-') + ' · 표시 영역 ' + regCount(ck.spans) + '곳</span><button type="button" aria-label="파일 빼기">빼기</button></div>');
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
      var t = S.src || S.ck ? canon(ta.value) : pasted(ta.value);
      if (noSp(t) < 60) { say('60자 이상 넣어 주세요. 문장이 몇 개는 있어야 판정할 수 있습니다.'); ta.focus(); return; }
      if (t.length > PAID_MAX) t = t.slice(0, PAID_MAX);
      say(''); saveDraft(); S.lastT = t; busy(true); setStep(2);
      show(progHtml('AI 작성률 검사 중', 0, 1, '', 'check', t)); if (!opt.stay) toOut();
      var ctx = { kind: kind(), docName: S.docName };
      freeCheck(t).then(function (N) {
        S.res = N; toneInit(t, N.autoTone);
        show((S.ck && opt.keepCk ? ckHtml(S.ck) : '') + reportHtml(N, ctx) + payHtml(N, t)); bindOut();
        if (S.planAfter != null) { var pa = S.planAfter; S.planAfter = null; S.skipAsk = true; setTimeout(function () { planRun(pa); }, 300); }
        if (window.gtag) try { window.gtag('event', 'ai_check', { rate: N.rate, band: N.band.key, engine: N.engine }); } catch (e) { /* 무시 */ }
      }).catch(function (e) { show('<div class="tool-msg">' + esc((e && e.message) || '검사하지 못했어요. 잠시 뒤 다시 시도해 주세요.') + '</div>'); })
        .then(function () { busy(false); });
    }
    /* 같은 글은 같은 결과: 서버 결과를 글 해시로 이 브라우저에 남겨 두고, 서버가 늦거나 끊겼을 때 간이 엔진보다 먼저 씀 */
    function keep(key, r) {
      try {
        if (!r || r.ok === false) return;
        var idx = JSON.parse(CH.sget('ch_r1_idx') || '[]').filter(function (k) { return k !== key; });
        idx.push(key);
        while (idx.length > 8) CH.sset(idx.shift(), '');
        CH.sset(key, JSON.stringify(r)); CH.sset('ch_r1_idx', JSON.stringify(idx));
      } catch (e) { /* 저장 없이 */ }
    }
    function kept(key) { try { var j = JSON.parse(CH.sget(key) || 'null'); return j && j.ok !== false ? j : null; } catch (e) { return null; } }
    function freeCheck(t) {
      var C = chunk(t), first = C.parts[0], key = 'ch_r1_' + LITE.hash(first);
      var ext = { total: t.length, cut: C.parts.length > 1, checked: first.length };
      var lite = function () { var R = LITE.detect(t, { kind: kind() }); return normalize(LITE.freeView(R), { total: t.length }); };
      var fallback = function () { var k = kept(key); return k ? normalize(k, ext) : lite(); };
      var call = function () { return CH.call('am.style', { text: first, mode: 'check', tone: 'auto', pass: '' }, 90000); };
      if (CH.server.state === 'off') return Promise.resolve(fallback());
      return call().catch(function (e) { if (e && e.code === 'SLOW') return call(); throw e; }).then(function (r) {
        keep(key, r);
        return normalize(r, ext);
      }).catch(function (e) { if (e && (e.code === 'OFF' || e.code === 'SLOW')) return fallback(); throw e; });
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
          S.res = N; toneInit(t, N.autoTone); CH.pass.refresh().then(CH.paintChip);
          show(reportHtml(N, { kind: kind(), docName: S.docName }) + afterFullHtml(N, t)); bindOut();
        }).catch(fail).then(function () { busy(false); });
      }, 'full');
    }
    function afterFullHtml(N, t) {
      var rows = planRows(N, t);
      return '<section class="pay"><div class="pay-h"><span class="eyebrow">목표를 고르면 바로 다듬습니다</span><h3>' + (N.aiN ? 'AI 패턴 문장 ' + N.aiN + '개 · 이대로 내면 AI 글로 걸러질 수 있습니다' : 'AI 패턴 문장이 없습니다') + '</h3><p>AI 점수가 높은 문장부터 필요한 만큼만 바꾸고 같은 기준으로 다시 검사합니다. 전체 결과는 열려 있어 다듬는 비용만 빠집니다.</p></div>' + toneHtml(t) +
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
      var name = target ? 'AI 작성률 ' + target + '% 미만으로 다듬기' : 'AI 패턴 문장 모두 다듬기';
      var C = chunk(t);
      gate(row.tok, name, function () {
        busy(true); show(progHtml(name, 0, 1, '', 'check', t)); toOut();
        var p = S.res.full ? Promise.resolve(S.res) : seq(C.parts, function (part, i) {
          return CH.call('am.style', { text: part, mode: 'check', tone: 'auto', pass: CH.pass.code }, 120000).then(function (r) { show(progHtml('문장마다 AI 점수를 매기는 중', i + 1, C.parts.length, '', 'check', t)); return r; });
        }).then(function (rs) { var N = merge(rs, true, t); N.total = t.length; N.locked = false; S.res = N; toneInit(t, N.autoTone); return N; });
        p.then(function (N) {
          var total = N.chars || noSp(t), cur = total * (N.rate || 0) / 100, PK = planPick(N, t, target), sel = PK.sel;   // 2.1 목표표와 같은 셈으로 고름
          var flaggedN = N.sentences.filter(function (x) { return x.ai; }).length;
          if (!sel.length) throw { message: '다듬을 AI 패턴 문장이 없습니다.' };
          sel.sort(function (a, b) { return a._i - b._i; });
          /* 2026.11.09 HUM 1.9: 같은 문단에서 바로 이어진 고른 문장은 한 덩어리로 보냄. 엔진이 두 문장을 '~는데 · ~고 · ~지만'으로 이을 수 있어야
             습니다체(자소서 · 에세이)도 내려감(문장 하나씩 보내면 잇지 못해 엔진 기준 100% 그대로). 덩어리 첫 문장 자리에 결과 전체, 나머지 자리는 비움 */
          var groups = [], gc = null;
          sel.forEach(function (x) { var tt = x.t.replace(/\s*\n+\s*/g, ' ').trim(), pi = x.para || 0; if (gc && gc.para === pi && gc.last === x._i - 1 && (gc.text.length + tt.length + 1) <= 900) { gc.text += ' ' + tt; gc.idx.push(x._i); gc.last = x._i; } else { gc = { para: pi, text: tt, idx: [x._i], last: x._i }; groups.push(gc); } });
          var parts = [], cur = null;
          groups.forEach(function (gg) { if (!cur || (cur.text.length + gg.text.length + 2) > CHUNK) { cur = { text: '', gs: [] }; parts.push(cur); } cur.text += (cur.text ? '\n\n' : '') + gg.text; cur.gs.push(gg); });
          var newT = {}, GS = {}, ac = 0, aa = 0, changed = 0, tp = toneReq(t, true), tn = { conv: 0, miss: 0, note: '' };   // 2.0 정한 말투를 모든 묶음에 똑같이
          show(progHtml('AI 점수 높은 문장부터 사람 말투로 바꾸는 중', 0, parts.length, '숫자 · 이름 · 인용은 그대로 두고, 바꾼 문장마다 뜻이 같은지 확인합니다.', 'hum', sel.map(function (x) { return x.t; }).join(' ')));
          return seq(parts, function (pt, k) {
            return CH.call('am.humanize', { text: pt.text, tone: tp, variant: 0, pass: CH.pass.code }, 150000).then(function (r) {
              var outs = String(r.text || '').split(/\n{2,}/);
              if (r.aiAfter) { ac += r.aiAfter.chars || 0; aa += r.aiAfter.aiChars || 0; }
              changed += (r.stats && r.stats.changed) || (r.applied || []).length || 0;
              if (tp === 'plain') { if (r.tone === 'plain') tn.conv++; else tn.miss++; if (r.toneNote && !tn.note) tn.note = r.toneNote; }
              if (outs.length === pt.gs.length) { pt.gs.forEach(function (gg, j) { gg.out = outs[j].trim(); }); return; }
              return seq(pt.gs, function (gg) { return CH.call('am.humanize', { text: gg.text, tone: tp, variant: 0, pass: CH.pass.code }, 120000).then(function (r2) { gg.out = (r2.text || gg.text).trim(); if (r2.aiAfter) { ac += r2.aiAfter.chars || 0; aa += r2.aiAfter.aiChars || 0; } }); });
            }).then(function () { show(progHtml('AI 점수 높은 문장부터 사람 말투로 바꾸는 중', k + 1, parts.length, '', 'hum', sel.map(function (x) { return x.t; }).join(' '))); });
          }).then(function () {
            groups.forEach(function (gg) { if (gg.out == null || !gg.out) return; newT[gg.idx[0]] = gg.out; gg.idx.slice(1).forEach(function (ix) { newT[ix] = ''; GS[ix] = 1; }); });
            /* 고르지 않은 문장: 대표 수정 규칙 · 쉼표 · 가운뎃점 정리만(am.punc, 토큰 없음). 실패하면 원문 그대로 */
            return puncRest(N, newT, tp);
          }).then(function (RT) {
            /* 글 다시 짜기: 엔진이 나눈 문장 순서대로, 문단은 빈 줄로(덩어리로 다듬은 문장은 첫 자리에 한 번만) */
            var paras = [], pairs = [];
            N.sentences.forEach(function (x, i) { if (RT.skip[i] || GS[i]) return; var pi = x.para || 0; paras[pi] = paras[pi] || []; paras[pi].push(newT[i] != null ? newT[i] : (RT.t[i] != null ? RT.t[i] : x.t)); });
            var text = paras.filter(Boolean).map(function (pp) { return pp.join(' '); }).join('\n\n');
            groups.forEach(function (gg) { if (newT[gg.idx[0]] == null) return; var top = gg.idx.map(function (ix) { return N.sentences[ix]; }).sort(function (a, b) { return ((b.g || 0) - (a.g || 0)) || ((b.p || 0) - (a.p || 0)); })[0]; pairs.push({ lv: top.g === 3 ? 'hi' : top.g === 2 ? 'mid' : 'low', p: top.p, a: gg.idx.map(function (ix) { return N.sentences[ix].t; }).join(' '), b: newT[gg.idx[0]] }); });
            var selChars = sel.reduce(function (a2, x) { return a2 + noSp(x.t); }, 0), selAi = sel.reduce(function (a2, x) { return a2 + shareOf(x) * noSp(x.t); }, 0);
            var redo = ac ? Math.round(aa * selChars / ac) : 0;   // 2.1 다듬은 문장을 다시 잰 AI 몫(글자, 바꾼 분량 기준)
            var afterAi = Math.max(0, cur - selAi) + redo;   // 2.1 안 바꾼 문장의 AI 몫 + 바꾼 문장을 다시 잰 AI 몫
            var rem = tp === 'plain' && RT.parts > 0 && RT.pn === RT.parts;   // 2.0 말투를 바꾸면 고르지 않은 문장도 다시 잰 값(am.punc)
            if (rem) afterAi = redo + RT.pa;
            var afterRate = total ? Math.round(afterAi * 100 / total) : 0;
            var done = {}; sel.forEach(function (x) { done[x._i] = 1; });
            var restN = Math.max(0, flaggedN - sel.filter(function (x) { return x.ai; }).length), restChars = Math.round(afterAi);
            if (rem) { restChars = RT.pa; if (!RT.pa) restN = 0; }
            var tnote = tp === 'plain' ? '보고서 · 논설문 글이라 \'~습니다\'를 \'~다\' 말투로 바꿔 다듬었습니다.' + (tn.miss || RT.miss ? ' 말투를 바꾸지 못한 곳은 원래 말투로 두었습니다' + (tn.note || RT.note ? '(' + (tn.note || RT.note).replace(/[.\s]+$/, '') + ')' : '') + '.' : '') : '';
            S.hum = { src: t, text: text, changed: pairs.filter(function (q) { return q.a !== q.b; }).length, pairs: pairs, before: N.rate, after: afterRate, target: target, restN: restN, restChars: restChars, aiN: N.aiN, redo: redo, rem: rem, toneNote: tnote, done: done };
            setStep(3); CH.pass.refresh().then(CH.paintChip);
            show(planResultHtml(S.hum)); bindOut();
            if (window.gtag) try { window.gtag('event', 'humanize_plan', { target: target, chars: selChars }); } catch (e) { /* 무시 */ }
          });
        }).catch(fail).then(function () { busy(false); });
      }, 'plan');
    }
    /* 2026.11.09 대표 '쉼표 · 가운뎃점도 없애 줘': 목표 다듬기에서 고르지 않은 문장도 문단마다 이어진 묶음으로 am.punc(대표 수정 규칙 + 쉼표 · 가운뎃점 정리, 토큰 없음)에 보냄.
       돌려받은 묶음 수가 같을 때만 반영(묶음의 첫 문장 자리에 묶음 전체, 나머지 자리는 비움) */
    function puncRest(N, newT, tp) {
      var segs = [], cur = null, R = { t: {}, skip: {}, parts: 0, pn: 0, pa: 0, pc: 0, miss: 0, note: '' };
      N.sentences.forEach(function (x, i) {
        var tt = String(x.t || '').replace(/\s*\n+\s*/g, ' ').trim(), pi = x.para || 0;
        if (newT[i] != null || !tt) { cur = null; return; }
        if (!cur || cur.para !== pi) { cur = { para: pi, idx: [], text: '' }; segs.push(cur); }
        cur.idx.push(i); cur.text += (cur.text ? ' ' : '') + tt;
      });
      if (!segs.length || CH.server.state === 'off') return Promise.resolve(R);
      var parts = [], pc = null;
      segs.forEach(function (sg) { if (!pc || (pc.text.length + sg.text.length + 2) > CHUNK) { pc = { text: '', segs: [] }; parts.push(pc); } pc.text += (pc.text ? '\n\n' : '') + sg.text; pc.segs.push(sg); });
      R.parts = parts.length;
      return seq(parts, function (pt) {
        return CH.call('am.punc', { text: pt.text, tone: tp === 'plain' ? 'plain' : '' }, 60000).then(function (r) {
          var outs = String((r && r.text) || '').split(/\n{2,}/);
          if (tp === 'plain' && r) { if (r.tone !== 'plain') { R.miss++; if (r.toneNote && !R.note) R.note = r.toneNote; } }
          if (outs.length !== pt.segs.length) return;
          if (r && r.aiAfter) { R.pn++; R.pa += r.aiAfter.aiChars || 0; R.pc += r.aiAfter.chars || 0; }
          pt.segs.forEach(function (sg, j) { var o = outs[j].trim(); if (!o) return; R.t[sg.idx[0]] = o; sg.idx.slice(1).forEach(function (k) { R.skip[k] = 1; }); });
        }).catch(function () { /* 그 묶음은 원문 그대로 */ });
      }).then(function () { return R; });
    }
    function planResultHtml(res) {
      var LVK = { hi: 'AI 패턴', mid: 'AI 패턴', low: 'AI 패턴' };
      var okTarget = res.target ? res.after < res.target : res.after < 20;   // 2.1 '모두 다듬기'는 안전(20% 미만)이면 맞춤
      var t = S.lastT || '';
      var restHtml = '';
      if (res.restN > 0) {
        var N2 = Object.assign({}, S.res, { full: true, rate: res.after, aiChars: res.restChars, aiN: res.restN });
        var rows = planRows(N2, t, res.done).filter(function (r) { return r.target === 0 || r.target < (res.target || 100); });
        restHtml = '<section class="pay"><div class="pay-h"><span class="eyebrow">남은 AI 패턴 문장</span><h3>아직 ' + res.restN + '개 문장이 AI 패턴으로 남아 있습니다</h3><p>' + (res.target ? '목표 ' + res.target + '% 미만' + (okTarget ? '은 맞췄지만' : '에 아직 못 미쳐') + ', ' : '') + '마저 다듬으면 더 내려갑니다. 다듬는 비용만 빠집니다.</p></div>' + (rows.length ? planTable(rows, { allLabel: '남은 문장 모두', allBtn: '남은 문장 모두 다듬기' }) : '') + '</section>';
      }
      return '<article class="rep"><header class="rep-h"><div><small>' + (res.target ? '목표 ' + res.target + '% 미만 다듬기' : 'AI 패턴 문장 모두 다듬기') + '</small><h3>' + (okTarget ? '목표를 맞췄습니다' : '다듬었지만 목표에 조금 못 미쳤습니다') + '</h3></div><dl class="rep-meta"><dt>처리일시</dt><dd>' + nowStr() + '</dd><dt>바꾼 문장</dt><dd>' + res.changed + ' / ' + res.pairs.length + '</dd></dl></header>' +
        '<div class="rep-sec"><div class="hz-stats"><div class="hz-stat"><span>다듬기 전 AI 작성률</span><b>' + res.before + '%</b></div><div class="hz-stat"><span>다듬은 뒤 AI 작성률</span><b class="down">' + res.after + '%</b></div><div class="hz-stat"><span>다듬은 문장에 남은 AI 몫</span><b>' + CH.n(res.redo) + '자</b></div></div>' +
        (res.toneNote ? '<p class="fine">' + esc(res.toneNote) + '</p>' : '') +
        '<p class="fine">' + (res.rem ? '다듬은 뒤 수치는 바꾼 문장과 말투만 바꾼 나머지 문장을 같은 기준으로 다시 잰 값입니다.' : '다듬은 뒤 수치는 바꾼 문장을 다시 잰 AI 몫에 바꾸지 않은 문장의 AI 몫을 더한 값입니다.') + ' 다른 검사기를 보장하지 않습니다.</p>' +
        '<div class="seg-tabs" role="tablist"><button type="button" role="tab" aria-selected="true" data-tab="pairs">대조표</button><button type="button" role="tab" aria-selected="false" data-tab="full">반영한 전체 글</button></div>' +
        '<div data-pane="pairs" class="pairs">' + res.pairs.map(function (q, i) { return '<div class="pair"><div><small>' + (i + 1) + ' · ' + LVK[q.lv] + (q.p != null ? ' ' + q.p : '') + ' · 원문</small>' + esc(q.a) + '</div><div><small>다듬은 문장</small>' + diffHtml(q.a, q.b) + '</div></div>'; }).join('') + '</div>' +
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
      return need > 0 ? '이 글 ' + esc(name) + ': <b>' + CH.tk(need) + '토큰</b>' : '600자 이하 글의 ' + esc(name) + '는 토큰이 빠지지 않습니다. 토큰 코드만 있으면 바로 열립니다.';
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
      el.innerHTML = '<p><b>' + esc(name) + '에 ' + CH.tk(need) + '토큰이 빠집니다.</b>' + (CH.pass.left() != null ? ' 남은 토큰은 ' + CH.tk(CH.pass.left()) + '개입니다.' : '') + '</p><div class="acts" style="margin-top:10px"><button class="btn btn-p btn-s" type="button" data-yes>' + esc(name) + ' 시작</button><button class="btn btn-g btn-s" type="button" data-no>취소</button></div>';
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
        var tp = toneReq(t, false);   // 2.0 글마다 정한 말투(모르면 서버 자동)
        seq(C.parts, function (part, i) {
          return CH.call('am.humanize', { text: part, tone: tp, variant: 0, pass: CH.pass.code }, 150000).then(function (r) { if (tp === 'auto' && (r.tone === 'plain' || r.tone === 'keep')) tp = r.tone; show(progHtml('AI 문체를 사람 말투로 바꾸는 중', i + 1, C.parts.length, '숫자 · 이름 · 인용은 그대로 두고, 바꾼 문장마다 뜻이 같은지 확인합니다.', 'hum', t)); return r; });
        }).then(function (rs) {
          var text = rs.map(function (r, i) { return (i ? C.seps[i - 1] : '') + (r.text || ''); }).join('');
          var bc = 0, ba = 0, ac = 0, aa = 0, changed = 0;
          rs.forEach(function (r) { if (r.ai) { bc += r.ai.chars || 0; ba += r.ai.aiChars || 0; } if (r.aiAfter) { ac += r.aiAfter.chars || 0; aa += r.aiAfter.aiChars || 0; } changed += (r.stats && r.stats.changed) || (r.applied || []).length || 0; });
          var conv = rs.some(function (r) { return r.tone === 'plain'; });
          var res = { src: t, text: text, changed: changed, before: bc ? Math.round(ba * 100 / bc) : (S.res ? S.res.rate : null), after: ac ? Math.round(aa * 100 / ac) : null, tone: (rs[0] && rs[0].toneNote) || (conv ? '보고서 · 논설문 글이라 \'~습니다\'를 \'~다\' 말투로 바꿔 다듬었습니다.' : '') };
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
      var p = CH.server.state === 'off' ? Promise.resolve(lite()) : CH.call('am.humanize', { text: first, tone: label ? 'keep' : toneReq(t, false) }, 90000).catch(function (e) { if (e && (e.code === 'OFF' || e.code === 'SLOW')) return lite(); throw e; });
      p.then(function (r) {
        var box2 = document.createElement('article'); box2.className = 'rep';
        box2.innerHTML = '<header class="rep-h"><div><small>' + esc(label || '첫 문단 미리보기') + '</small><h3>이렇게 다듬어집니다</h3></div><dl class="rep-meta"><dt>바꾼 곳</dt><dd>' + CH.n(r.changes || 0) + '</dd>' + (r.taste && r.taste.before != null ? '<dt>AI 작성률</dt><dd>' + r.taste.before + '% → ' + r.taste.after + '%</dd>' : '') + '<dt>엔진</dt><dd>' + (r.engine === 'lite' ? 'CH-Lite' : 'HUM ' + engV(r.hum, '1.4')) + '</dd></dl></header>' +
          '<div class="rep-sec"><div class="pairs"><div class="pair"><div><small>원문</small>' + esc(r.src || first) + '</div><div><small>다듬은 문장</small>' + diffHtml(r.src || first, r.text || '') + '</div></div></div>' +
          '<p class="fine">' + (r.engine === 'lite' ? '간이 엔진 미리보기입니다. 실제 휴머나이징은 서버 엔진(HUM)이 글 전체를 문장마다 확인하며 다듬습니다.' : '무료 미리보기는 첫 문단만 다듬어 보여 드립니다.' + (r.taste && r.taste.before != null ? ' 같은 판정 기준으로 다시 재면 이 문단의 AI 작성률이 ' + r.taste.before + '%에서 ' + r.taste.after + '%가 됩니다.' : '') + ' 무엇을 왜 바꿨는지는 전체 결과에서 문장마다 보입니다.') + '</p>' +
          '<div class="acts"><button class="btn btn-p" type="button" data-act="' + (S.ck && label ? 'ckhum' : 'hum') + '">' + (S.ck && label ? '표시된 문장 모두 다듬기 · ' + CH.tk(CH.costParts('pro', spanParts(S.ck.spans).map(function (q) { return q.text; }))) + '토큰' : '글 전체 휴머나이징 · ' + CH.tk(CH.costParts('pro', chunk(t).parts)) + '토큰') + '</button></div></div>';
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
          return CH.call('am.humanize', { text: pt.text, tone: 'keep', variant: 0, pass: CH.pass.code }, 150000).then(function (r) {   // 2.0 표시된 문장만 바꾸므로 말투는 그대로(묶음마다 자동으로 정하면 일부만 '~다'로 바뀜)
            var outs = String(r.text || '').split(/\n{2,}/);
            if (outs.length === pt.idx.length) { pt.idx.forEach(function (k, j) { newT[k] = outs[j].trim(); }); return; }
            return seq(pt.idx, function (k) { return CH.call('am.humanize', { text: spans[k].t, tone: 'keep', variant: 0, pass: CH.pass.code }, 120000).then(function (r2) { newT[k] = (r2.text || spans[k].t).trim(); }); });
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
      var LVK = { hi: 'AI 패턴', mid: 'AI 패턴', low: 'AI 패턴' };
      var restHtml = '';
      if (res.rest && res.rest.length && res.ck) {
        var rs = res.rest.reduce(function (a, r) { return a + r.chars; }, 0), rsel = res.rest.map(function (r) { return r.rg; }), rtok = ckCost(res.ck, rsel);
        var S0 = res.ck.summary || {}, tot = ckRegions(res.ck).reduce(function (a, r) { return a + r.chars; }, 0);
        var est = S0.rate != null && tot ? Math.round(S0.rate * rs / tot) : null;
        restHtml = '<section class="pay"><div class="pay-h"><span class="eyebrow">남은 표시 영역</span><h3>아직 ' + res.rest.length + '곳 · ' + CH.n(rs) + '자가 표시된 채 남아 있습니다</h3><p>' + (est != null ? '남은 영역만으로도 예상 AI작성률은 ' + est + '%입니다. ' : '') + '지금 이어서 다듬으면 ' + CH.tk(rtok) + '토큰이 빠집니다.</p></div>' +
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
      $$('[data-tone]', scope || out).forEach(function (cb) {   // 2.0 말투를 '~다'로 바꿀지(이 글에만, 결제하고 돌아와도 같게)
        if (cb._b) return; cb._b = 1;
        cb.addEventListener('change', function () { toneSet(S.lastT || canon(ta.value), 'plain', cb.checked); });
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
