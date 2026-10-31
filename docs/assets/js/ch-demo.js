/* 카피휴먼 첫 화면 시연: AI 패턴 검출 → 패턴 DB 대조 → 검출된 표현만 사람 말투로 → 같은 기준으로 다시 검사
   예시 화면입니다. 다듬기 전 표시와 수치는 예시 글을 카피휴먼 판별 엔진 DET 1.2(판정 기준 1.2)로 검사하고 인간화 엔진 HUM 1.4로 다듬은 실제 결과입니다(2026.10.31).
     다듬기 전: AI 작성률 100% · 전체 7문장 가운데 AI 패턴 문장 7, 다듬은 뒤: 0% · AI 패턴 문장 0
   다듬은 글은 인간화 엔진의 실제 출력이고, 바뀐 곳은 낱말 단위로 맞춰 보여 줍니다(ch_site_1031b.py 가 만듦).
   움직임은 글자 단위 타자가 아니라 페이드 · 교차 전환으로만 냅니다(문서가 열리듯 글이 나타나고, 읽기 표시가 문장을 훑고, 바뀌는 표현만 흐려졌다가 새 표현이 떠오름).
   화면에 보일 때만 움직이고, 세 번 보여 준 뒤 멈춥니다. 움직임 줄이기를 켠 기기에서는 움직이지 않고 결과만 보여 줍니다. */
(function () {
  'use strict';
  var box = document.querySelector('[data-demo]');
  if (!box || !window.Promise) return;
  function q(s) { return box.querySelector(s); }
  var paper = q('.demo-paper'), text = q('.dm-text'), ring = q('.dm-ring'), vl = q('.dm-ring .vl'), rateEl = q('[data-dm-rate]'),
    verdict = q('[data-dm-verdict]'), counts = q('.dm-counts'), st = q('[data-dm-st]'), replay = q('[data-dm-replay]'),
    tabs = box.querySelectorAll('[data-dm-tab]'), cnt = q('[data-dm-count]');
  if (!paper || !text || !vl) return;
  var CIRC = 326.73;
  /* 문장 = 조각 목록. [원문] 은 그대로 두는 말, [원문, 다듬은 말] 은 바꾸는 말('' 은 지우기 · 새로 넣기) */
  var DOC = [[{"g": "hi", "seg": [["현대 사회에서", "오늘날"], [" 기후 변화는 인류가 "], ["직면한", "마주한"], [" 가장 중요한 과제 "], ["중", "가운데"], [" 하나라고 "], ["할", "볼"], [" 수 있다."]]}, {"g": "hi", "seg": [["기후 변화는 "], ["다양한", "여러"], [" 분야에 걸쳐 "], ["광범위한", "폭넓은"], [" 영향을 "], ["미치고", "주고"], [" "], ["있으며,", "있고"], [" 이에 "], ["대한", "관한"], [" "], ["효과적인", "효과 있는"], [" 대응 방안을 마련하는 것이 "], ["필수적이다.", "꼭 필요하다."]]}, {"g": "hi", "seg": [["또한,", "아울러"], [" 개인의 작은 실천이 모여 사회 전체의 변화를 이끌어낼 수 있다는 점에서 시민 참여의 중요성이 "], ["더욱", "더"], [" "], ["강조되고 있다.", "강조된다."]]}], [{"g": "hi", "seg": [["나는 지난달부터 학교에 텀블러를 들고 다닌다."]]}, {"g": "hi", "seg": [["일주일에 일회용 컵을 열 개쯤 덜 "], ["버리는데,", "버리는데"], [" 생각보다 귀찮지 않다."]]}, {"g": "hi", "seg": [["우리 과 동기 서른 명에게 물어보니 텀블러를 쓰는 사람은 일곱 명뿐이었다."]]}, {"g": "hi", "seg": [["다들 씻기가 번거롭다고 했다."]]}]];
  var BEFORE = {"rate": 100, "hi": 7, "mid": 0, "low": 0, "n": 7, "ai": 7};
  var AFTER = {"rate": 0, "hi": 0, "mid": 0, "low": 0, "ai": 0, "n": 7, "band": "safe"};   // 다시 검사 결과(문장별 남은 표시는 문장의 ga)
  var LV = { hi: 'AI 패턴', mid: 'AI 패턴', low: 'AI 패턴' };   // 표시 이름은 한 가지, 색 진하기로 정도를 보임
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var S = [];
  var tok = 0, vis = false, loops = 0, MAX = 3, started = false, STOP = { stop: 1 };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function noSp(s) { return String(s).replace(/\s+/g, '').length; }
  function changed(g) { return g.length > 1; }
  function beforeText() { return DOC.map(function (p) { return p.map(function (s) { return s.seg.map(function (g) { return g[0]; }).join(''); }).join(' '); }).join('\n\n'); }
  function afterText() { return DOC.map(function (p) { return p.map(function (s) { return s.seg.map(function (g) { return changed(g) ? g[1] : g[0]; }).join(''); }).join(' '); }).join('\n\n'); }

  /* 기다리기: 화면에 보이는 동안만 시간이 흐름 */
  function wait(ms, my) {
    return new Promise(function (ok, no) {
      var left = ms, last = Date.now();
      (function tick() {
        if (my !== tok) { no(STOP); return; }
        var now = Date.now();
        if (vis && !document.hidden) left -= now - last;
        last = now;
        if (left <= 0) ok(); else setTimeout(tick, Math.max(12, Math.min(48, left)));
      })();
    });
  }
  function tween(from, to, ms, fn, my) {
    return new Promise(function (ok, no) {
      var t0 = null;
      function f(ts) {
        if (my !== tok) { no(STOP); return; }
        if (t0 === null) t0 = ts;
        var p = Math.min(1, (ts - t0) / ms), e = 1 - Math.pow(1 - p, 3);
        fn(from + (to - from) * e);
        if (p < 1) requestAnimationFrame(f); else ok();
      }
      requestAnimationFrame(f);
    });
  }
  function frame() { return new Promise(function (ok) { requestAnimationFrame(function () { requestAnimationFrame(ok); }); }); }

  /* 오른쪽 판 · 위쪽 표시 */
  function setRate(v) { v = Math.max(0, Math.min(100, v)); rateEl.textContent = Math.round(v); vl.style.strokeDashoffset = (CIRC * (1 - v / 100)).toFixed(2); }
  function busy(on) { ring.classList.toggle('busy', !!on); if (on) { rateEl.textContent = '0'; vl.style.strokeDashoffset = (CIRC * 0.8).toFixed(2); } }
  function setBand(b) {
    ring.classList.remove('unfit', 'risk', 'safe'); verdict.classList.remove('unfit', 'risk', 'safe', 'scan');
    if (b === 'unfit' || b === 'risk' || b === 'safe') ring.classList.add(b);
    if (b) verdict.classList.add(b);
    verdict.textContent = b === 'unfit' ? '부적합 · AI 글로 판정' : b === 'risk' ? '고위험 · AI 패턴 남음' : b === 'safe' ? '안전 · AI 패턴 없음' : b === 'scan' ? 'AI 패턴 검출 중' : '검사 대기';
  }
  function setCount(k, v) { var el = q('[data-dm-c="' + k + '"]'); if (el) el.textContent = v; }
  function setCounts(o) { setCount('ai', o.ai); setCount('n', o.n); }
  function setPh(ph) {
    var order = ['type', 'scan', 'hum', 're'], at = order.indexOf(ph);
    Array.prototype.forEach.call(box.querySelectorAll('[data-dm-ph]'), function (li, i) {
      li.classList.toggle('on', i === at);
      li.classList.toggle('done', ph === 'end' || (at > -1 && i < at));
    });
  }
  function setTab(t) { Array.prototype.forEach.call(tabs, function (b) { b.classList.toggle('on', b.getAttribute('data-dm-tab') === t); }); }
  function setChars(n) { if (cnt) cnt.textContent = Math.round(n).toLocaleString('ko-KR') + '자'; }
  function say(t) { if (st) st.textContent = t; }
  function scanOnce() { paper.classList.remove('scanning'); void paper.offsetWidth; paper.classList.add('scanning'); }

  /* 문서: 처음부터 글 전체를 넣고(문서를 연 상태), 문장과 조각은 클래스로만 바꿈 */
  function build() {
    text.innerHTML = ''; S = [];
    DOC.forEach(function (para) {
      var p = document.createElement('p'); text.appendChild(p);
      para.forEach(function (s, i) {
        if (i) p.appendChild(document.createTextNode(' '));
        var span = document.createElement('span'); span.className = 'dm-s' + (s.g ? ' ' + s.g : ''); p.appendChild(span);
        var segs = s.seg.map(function (g) { var e = document.createElement('span'); e.className = 'dm-g'; e.textContent = g[0]; span.appendChild(e); return { g: g, el: e }; });
        var tag = null;
        if (s.g) { tag = document.createElement('span'); tag.className = 'dm-tag ' + s.g; tag.textContent = LV[s.g]; tag.hidden = true; p.appendChild(tag); }
        S.push({ s: s, el: span, segs: segs, tag: tag });
      });
    });
  }
  function beforeHtml(withTags) {
    return DOC.map(function (para) {
      return '<p>' + para.map(function (s) {
        var inner = s.seg.map(function (g) { return '<span class="dm-g">' + esc(g[0]) + '</span>'; }).join('');
        return '<span class="dm-s' + (s.g ? ' ' + s.g + (withTags ? ' on' : '') : '') + '">' + inner + '</span>' + (s.g && withTags ? '<span class="dm-tag on ' + s.g + '">' + LV[s.g] + '</span>' : '');
      }).join(' ') + '</p>';
    }).join('');
  }
  function afterHtml() {
    return DOC.map(function (para) {
      return '<p>' + para.map(function (s) {
        var inner = s.seg.map(function (g) { return '<span class="dm-g">' + (changed(g) ? (g[1] ? '<mark>' + esc(g[1]) + '</mark>' : '') : esc(g[0])) + '</span>'; }).join('');
        return '<span class="dm-s' + (s.ga ? ' ' + s.ga + ' on' : '') + '">' + inner + '</span>' + (s.ga ? '<span class="dm-tag on ' + s.ga + '">' + LV[s.ga] + '</span>' : '');
      }).join(' ') + '</p>';
    }).join('');
  }
  /* 가장 긴 상태의 높이만큼 자리를 미리 잡아 둠(화면이 밀리지 않게) */
  function fit() {
    var h = 0;
    [beforeHtml(true), afterHtml()].forEach(function (html) {
      var c = paper.cloneNode(true);
      c.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;height:auto;min-height:0;width:' + paper.offsetWidth + 'px';
      c.querySelector('.dm-text').innerHTML = html;
      paper.parentNode.appendChild(c);
      h = Math.max(h, c.offsetHeight);
      c.parentNode.removeChild(c);
    });
    if (h > 0) paper.style.minHeight = Math.ceil(h) + 'px';
  }

  /* 조각 하나 바꾸기: 원문이 흐려지며 줄이 그이고 → 새 표현이 떠오름 */
  async function swapSeg(sg, my) {
    var had = !!sg.g[0];
    if (had) { sg.el.classList.add('cut'); await wait(460, my); }
    sg.el.classList.remove('cut');
    sg.el.textContent = '';
    if (sg.g[1]) {
      var mk = document.createElement('mark'); mk.className = 'in'; mk.textContent = sg.g[1]; sg.el.appendChild(mk);
      await frame(); mk.classList.remove('in');
      await wait(380, my);
    }
  }

  async function play(my) {
    /* 1. AI 패턴 검출: 문서가 열리고, 읽기 표시가 문장을 차례로 훑음 */
    build(); busy(true); setBand('scan'); counts.classList.remove('stale'); setCounts({ ai: 0, n: 0 });
    setPh('type'); setTab('det'); setChars(0); say('문서를 여는 중');
    paper.classList.remove('fade', 'scanning'); text.classList.add('open');
    await frame(); text.classList.remove('open');
    await wait(520, my);
    var total = noSp(beforeText()), done = 0;
    for (var k = 0; k < S.length; k++) {
      var r = S[k], n = noSp(r.s.seg.map(function (g) { return g[0]; }).join(''));
      r.el.classList.add('rd');
      say('AI 패턴 검출 중 · 문장 ' + (k + 1) + ' / ' + BEFORE.n);
      await tween(done, done + n, 300, setChars, my);
      done += n;
      r.el.classList.remove('rd'); r.el.classList.add('seen'); setCount('n', k + 1);
      await wait(60, my);
    }
    setChars(total);
    await wait(260, my);

    /* 2. AI 패턴 DB 대조 */
    setPh('scan'); say('AI 패턴 DB 89억 개와 문장 ' + BEFORE.n + '개를 대조하는 중');
    scanOnce();
    await wait(1450, my);
    S.forEach(function (x) { x.el.classList.remove('seen'); });
    busy(false); setRate(0); ring.classList.add('risk');
    var flagged = S.filter(function (x) { return x.s.g; });
    var gauge = tween(0, BEFORE.rate, 1500, function (v) { setRate(v); if (v >= 40) { ring.classList.remove('risk'); ring.classList.add('unfit'); } }, my);
    for (var f = 0; f < flagged.length; f++) {
      var x = flagged[f];
      x.el.classList.add('on'); x.tag.hidden = false; void x.tag.offsetWidth; x.tag.classList.add('on');
      setCount('ai', f + 1);
      say('AI 패턴 문장 ' + (f + 1) + '개 발견');
      await wait(330, my);
    }
    await gauge;
    setBand('unfit');
    say('AI 패턴 문장 ' + flagged.length + '개 · 전체 ' + BEFORE.n + '문장 · 판정 부적합');
    await wait(2100, my);

    /* 3. 검출된 표현만 사람 말투로: 문장 뼈대는 그대로 */
    setPh('hum'); setTab('hum'); counts.classList.add('stale');
    var todo = S.filter(function (x) { return x.s.seg.some(changed); });
    for (var h = 0; h < todo.length; h++) {
      var y = todo[h];
      say('검출된 표현만 사람 말투로 바꾸는 중 · ' + (h + 1) + ' / ' + todo.length);
      y.el.classList.add('work'); y.el.classList.remove('on'); if (y.tag) y.tag.classList.remove('on');
      await wait(300, my);
      for (var m = 0; m < y.segs.length; m++) {
        if (!changed(y.segs[m].g)) continue;
        await swapSeg(y.segs[m], my);
        setChars(noSp(text.textContent));
      }
      y.el.classList.remove('work', 'hi', 'low', 'mid');
      if (y.tag) y.tag.hidden = true;
      await wait(260, my);
    }

    /* 4. 같은 기준으로 다시 검사 */
    setPh('re'); setTab('det'); setBand('scan'); say('같은 기준으로 다시 검사하는 중');
    scanOnce();
    await wait(1100, my);
    S.forEach(function (z) { if (z.el.classList.contains('on')) { z.el.classList.remove('on'); if (z.tag) z.tag.classList.remove('on'); } });
    await tween(BEFORE.rate, AFTER.rate, 1300, setRate, my);
    S.forEach(function (z) {
      if (z.tag && !z.s.ga) z.tag.hidden = true;
      if (z.s.ga) {
        z.el.classList.remove('hi', 'mid', 'low'); z.el.classList.add(z.s.ga, 'on');
        if (z.tag) { z.tag.className = 'dm-tag ' + z.s.ga; z.tag.textContent = LV[z.s.ga]; z.tag.hidden = false; void z.tag.offsetWidth; z.tag.classList.add('on'); }
      }
    });
    setCounts(AFTER); counts.classList.remove('stale');
    setBand(AFTER.band); setPh('end');
    say('다시 검사 결과 AI 작성률 ' + BEFORE.rate + '%에서 ' + AFTER.rate + '%로 · 판정 ' + (AFTER.band === 'safe' ? '안전' : AFTER.band === 'risk' ? '고위험' : '부적합'));
    await wait(5000, my);
  }

  async function run() {
    var my = ++tok;
    if (replay) replay.hidden = true;
    try {
      while (my === tok) {
        await play(my);
        loops++;
        if (loops >= MAX) break;
        paper.classList.add('fade');
        await wait(520, my);
      }
      if (my === tok && replay) replay.hidden = false;
    } catch (e) { if (e !== STOP) { staticView(false); } }
  }

  /* 움직이지 않는 화면(움직임 줄이기 · 오류 때) */
  function staticView(showBefore) {
    tok++;
    busy(false);
    paper.classList.remove('fade', 'scanning');
    if (showBefore) {
      text.innerHTML = beforeHtml(true);
      setTab('det'); setChars(noSp(beforeText()));
      setRate(BEFORE.rate); setBand('unfit'); setCounts(BEFORE); setPh('hum');
      say('다듬기 전 AI 작성률 ' + BEFORE.rate + '% · AI 패턴 문장 ' + BEFORE.ai + '개 · 판정 부적합');
    } else {
      text.innerHTML = afterHtml();
      setTab('hum'); setChars(noSp(afterText()));
      setRate(AFTER.rate); setBand(AFTER.band); setCounts(AFTER); setPh('end');
      say('다듬기 전 ' + BEFORE.rate + '%(부적합), 다듬은 뒤 ' + AFTER.rate + '%(' + (AFTER.band === 'safe' ? '안전' : AFTER.band === 'risk' ? '고위험' : '부적합') + ')');
    }
    counts.classList.remove('stale');
    if (replay) {
      replay.hidden = false;
      replay.querySelector('span').textContent = showBefore ? '다듬은 뒤 보기' : '다듬기 전 보기';
      replay.setAttribute('data-view', showBefore ? 'before' : 'after');
    }
  }

  fit();
  var rt = 0;
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(fit, 200); }, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);

  if (replay) replay.addEventListener('click', function () {
    if (reduce) { staticView(replay.getAttribute('data-view') === 'after'); return; }
    loops = MAX - 1; paper.classList.add('fade');
    setTimeout(run, 300);
  });

  if (reduce) { staticView(true); return; }
  /* 화면에 보이는지: IntersectionObserver를 쓰고, 그 신호가 오지 않는 브라우저에서는 스크롤 위치로 직접 잼 */
  var ioSeen = false;
  function inView() { var r = box.getBoundingClientRect(), h = window.innerHeight || document.documentElement.clientHeight; return r.bottom > h * 0.2 && r.top < h * 0.8; }
  function manual() { if (ioSeen) return; vis = inView(); if (vis && !started) { started = true; run(); } }
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      ioSeen = true;
      es.forEach(function (en) {
        vis = en.isIntersecting;
        if (vis && !started) { started = true; run(); }
      });
    }, { threshold: 0.25 }).observe(box);
  }
  window.addEventListener('scroll', manual, { passive: true });
  setTimeout(manual, 2000);
})();
