/* 카피휴먼 첫 화면 시연: 글 넣기 → AI 문장 찾기 → 사람 문장으로 다듬기 → 같은 기준으로 다시 검사
   예시 화면입니다. 문장 표시와 수치는 예시 글(다듬기 전 · 다듬은 뒤)을 카피휴먼 판별 엔진 DET 1.0으로 검사한 결과입니다(2026.10.29).
     다듬기 전: AI 작성률 68% · 위험 · 전체 7문장 가운데 높음 3 · 낮음 1
     다듬은 뒤: AI 작성률 0% · 양호
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
  /* 바꾼 문장의 [ ] 안은 새로 들어간 말(민트 표시) */
  var DOC = [
    [{ t: '현대 사회에서 기후 변화는 인류가 직면한 가장 중요한 과제 중 하나라고 할 수 있다.', g: 'hi', to: '기후 변화는 인류가 [함께 풀어야 할] 가장 [큰 숙제다].' },
      { t: '기후 변화는 다양한 분야에 걸쳐 광범위한 영향을 미치고 있으며, 이에 대한 효과적인 대응 방안을 마련하는 것이 필수적이다.', g: 'hi', to: '[영향이 닿지 않는 분야가 거의 없어서 대응을 더 미룰 수 없다].' },
      { t: '또한, 개인의 작은 실천이 모여 사회 전체의 변화를 이끌어낼 수 있다는 점에서 시민 참여의 중요성이 더욱 강조되고 있다.', g: 'hi', to: '[한 사람의 실천은 작지만 여럿이 모이면 사회가 바뀐다]는 점에서 시민 참여의 중요성이 [커지고] 있다.' }],
    [{ t: '나는 지난달부터 학교에 텀블러를 들고 다닌다.', g: 'low' },
      { t: '일주일에 일회용 컵을 열 개쯤 덜 버리는데, 생각보다 귀찮지 않다.' },
      { t: '우리 과 동기 서른 명에게 물어보니 텀블러를 쓰는 사람은 일곱 명뿐이었다.' },
      { t: '다들 씻기가 번거롭다고 했다.' }]
  ];
  var BEFORE = { rate: 68, hi: 3, mid: 0, low: 1, n: 7 }, LV = { hi: '높음', mid: '중간', low: '낮음' };
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var S = [], caret = document.createElement('i'); caret.className = 'dm-caret';
  var tok = 0, vis = false, loops = 0, MAX = 3, started = false, STOP = { stop: 1 };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function parts(s) {   // '가 [나] 다' → [{t:'가 ',m:0},{t:'나',m:1},{t:' 다',m:0}]
    var out = [], re = /\[([^\]]+)\]/g, last = 0, m;
    while ((m = re.exec(s))) { if (m.index > last) out.push({ t: s.slice(last, m.index), m: 0 }); out.push({ t: m[1], m: 1 }); last = re.lastIndex; }
    if (last < s.length) out.push({ t: s.slice(last), m: 0 });
    return out;
  }
  function richHtml(s) { return parts(s).map(function (p) { return p.m ? '<mark>' + esc(p.t) + '</mark>' : esc(p.t); }).join(''); }
  function noSp(s) { return s.replace(/\s+/g, '').length; }

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

  /* 오른쪽 판 */
  function setRate(v) { v = Math.max(0, Math.min(100, v)); rateEl.textContent = Math.round(v); vl.style.strokeDashoffset = (CIRC * (1 - v / 100)).toFixed(2); }
  function setBand(b) {
    ring.classList.remove('unfit', 'safe'); verdict.classList.remove('unfit', 'safe');
    if (b === 'unfit' || b === 'safe') { ring.classList.add(b); verdict.classList.add(b); }
    verdict.textContent = b === 'unfit' ? '위험 · 제출 전 수정' : b === 'safe' ? '양호 · AI 패턴 적음' : b === 'scan' ? '살피는 중' : '검사 대기';
  }
  function setCount(k, v) { var el = q('[data-dm-c="' + k + '"]'); if (el) el.textContent = v; }
  function setPh(ph) {
    var order = ['type', 'scan', 'hum', 're'], at = order.indexOf(ph);
    Array.prototype.forEach.call(box.querySelectorAll('[data-dm-ph]'), function (li, i) {
      li.classList.toggle('on', i === at);
      li.classList.toggle('done', ph === 'end' || (at > -1 && i < at));
    });
  }
  function say(t) { if (st) st.textContent = t; }
  function setTab(t) { Array.prototype.forEach.call(tabs, function (b) { b.classList.toggle('on', b.getAttribute('data-dm-tab') === t); }); }
  function setChars(n) { if (cnt) cnt.textContent = Number(n).toLocaleString('ko-KR') + '자'; }
  function scanOnce() { paper.classList.remove('scanning'); void paper.offsetWidth; paper.classList.add('scanning'); }

  /* 문서 */
  function build() {
    text.innerHTML = ''; S = [];
    DOC.forEach(function (para) {
      var p = document.createElement('p'); text.appendChild(p);
      para.forEach(function (s) {
        var span = document.createElement('span'); span.className = 'dm-s' + (s.g ? ' ' + s.g : ''); p.appendChild(span);
        var tag = null;
        if (s.g) { tag = document.createElement('span'); tag.className = 'dm-tag ' + s.g; tag.textContent = LV[s.g]; tag.hidden = true; p.appendChild(tag); }
        S.push({ s: s, el: span, tag: tag, p: p });
      });
    });
  }
  function beforeHtml(withTags) {
    return DOC.map(function (para) {
      return '<p>' + para.map(function (s) {
        return '<span class="dm-s' + (s.g ? ' ' + s.g + (withTags ? ' on' : '') : '') + '">' + esc(s.t) + '</span>' + (s.g && withTags ? '<span class="dm-tag on ' + s.g + '">' + LV[s.g] + '</span>' : '');
      }).join(' ') + '</p>';
    }).join('');
  }
  function afterHtml() {
    return DOC.map(function (para) { return '<p>' + para.map(function (s) { return '<span class="dm-s">' + (s.to ? richHtml(s.to) : esc(s.t)) + '</span>'; }).join(' ') + '</p>'; }).join('');
  }
  /* 다 쓴 상태의 높이만큼 자리를 미리 잡아 둠(글이 써지는 동안 화면이 밀리지 않게) */
  function fit() {
    var c = paper.cloneNode(true);
    c.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;height:auto;min-height:0;width:' + paper.offsetWidth + 'px';
    c.querySelector('.dm-text').innerHTML = beforeHtml(true);
    paper.parentNode.appendChild(c);
    var h = c.offsetHeight;
    c.parentNode.removeChild(c);
    if (h > 0) paper.style.minHeight = Math.ceil(h) + 'px';
  }

  async function typeInto(host, str, my, step, ms) {
    var node = document.createTextNode(''); host.appendChild(node);
    for (var i = 0; i < str.length;) {
      i = Math.min(str.length, i + step);
      node.data = str.slice(0, i);
      await wait(ms, my);
    }
  }

  async function play(my) {
    /* 1. 글 넣기 */
    build(); setRate(0); setBand(''); counts.classList.remove('stale');
    ['hi', 'mid', 'low'].forEach(function (k) { setCount(k, 0); });
    setPh('type'); setTab('det'); setChars(0); say('검사할 글을 넣는 중');
    paper.classList.remove('fade', 'scanning');
    var typed = 0;
    for (var k = 0; k < S.length; k++) {
      var r = S[k];
      if (k && S[k - 1].p === r.p) r.p.insertBefore(document.createTextNode(' '), r.el);
      r.p.insertBefore(caret, r.el.nextSibling);
      var node = document.createTextNode(''); r.el.appendChild(node);
      for (var i = 0; i < r.s.t.length;) {
        i = Math.min(r.s.t.length, i + 2);
        node.data = r.s.t.slice(0, i);
        say('검사할 글을 넣는 중 · ' + (typed + noSp(node.data)) + '자');
        setChars(typed + noSp(node.data));
        await wait(24, my);
      }
      typed += noSp(r.s.t);
      await wait(k === 2 ? 220 : 90, my);
    }
    if (caret.parentNode) caret.parentNode.removeChild(caret);
    await wait(380, my);

    /* 2. AI 문장 찾기 */
    setPh('scan'); setBand('scan'); say('문장 ' + BEFORE.n + '개로 나눠 문장마다 AI 패턴을 살피는 중');
    scanOnce();
    await wait(1350, my);
    var flagged = S.filter(function (x) { return x.s.g; }), c = { hi: 0, mid: 0, low: 0 };
    var gauge = tween(0, BEFORE.rate, 1500, setRate, my);
    for (var f = 0; f < flagged.length; f++) {
      var x = flagged[f];
      x.el.classList.add('on');
      x.tag.hidden = false; void x.tag.offsetWidth; x.tag.classList.add('on');
      c[x.s.g]++; setCount(x.s.g, c[x.s.g]);
      say('AI 의심 문장 ' + (f + 1) + '개 찾음');
      await wait(330, my);
    }
    await gauge;
    setBand('unfit');
    say('AI 의심 문장 ' + flagged.length + '개 · 높음 ' + BEFORE.hi + ' · 낮음 ' + BEFORE.low + ' · 판정 위험');
    await wait(1900, my);

    /* 3. 사람 문장으로 다듬기 */
    setPh('hum'); setTab('hum'); counts.classList.add('stale');
    var todo = S.filter(function (x) { return x.s.to; });
    for (var h = 0; h < todo.length; h++) {
      var y = todo[h];
      say('의심 문장을 사람 문장으로 바꾸는 중 · ' + (h + 1) + ' / ' + todo.length);
      y.el.classList.add('out');
      await wait(340, my);
      y.el.classList.remove('on', 'out', 'hi', 'low');
      if (y.tag) { y.tag.classList.remove('on'); y.tag.hidden = true; }
      y.el.textContent = '';
      y.p.insertBefore(caret, y.el.nextSibling);
      var ps = parts(y.s.to);
      for (var j = 0; j < ps.length; j++) {
        var host = y.el;
        if (ps[j].m) { host = document.createElement('mark'); y.el.appendChild(host); }
        await typeInto(host, ps[j].t, my, 2, 26);
      }
      setChars(noSp(text.textContent));
      await wait(220, my);
    }
    if (caret.parentNode) caret.parentNode.removeChild(caret);
    await wait(300, my);

    /* 4. 같은 기준으로 다시 검사 */
    setPh('re'); setTab('det'); setBand('scan'); say('같은 기준으로 다시 검사하는 중');
    scanOnce();
    await wait(1000, my);
    S.forEach(function (z) { if (z.el.classList.contains('on')) { z.el.classList.remove('on'); if (z.tag) z.tag.classList.remove('on'); } });
    await tween(BEFORE.rate, 0, 1300, setRate, my);
    ['hi', 'mid', 'low'].forEach(function (k2) { setCount(k2, 0); });
    counts.classList.remove('stale');
    S.forEach(function (z) { if (z.tag) z.tag.hidden = true; });
    setBand('safe'); setPh('end');
    say('다시 검사 결과 AI 작성률 ' + BEFORE.rate + '%에서 0%로 · 판정 양호');
    await wait(4600, my);
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
        await wait(480, my);
      }
      if (my === tok && replay) replay.hidden = false;
    } catch (e) { if (e !== STOP) { staticView(false); } }
  }

  /* 움직이지 않는 화면(움직임 줄이기 · 오류 때) */
  function staticView(showBefore) {
    tok++;
    paper.classList.remove('fade', 'scanning');
    if (showBefore) {
      text.innerHTML = beforeHtml(true);
      setTab('det'); setChars(noSp(text.textContent));
      setRate(BEFORE.rate); setBand('unfit'); setCount('hi', BEFORE.hi); setCount('mid', BEFORE.mid); setCount('low', BEFORE.low); setPh('hum');
      say('다듬기 전 AI 작성률 ' + BEFORE.rate + '% · 판정 위험');
    } else {
      text.innerHTML = afterHtml();
      setTab('hum'); setChars(noSp(text.textContent));
      setRate(0); setBand('safe'); setCount('hi', 0); setCount('mid', 0); setCount('low', 0); setPh('end');
      say('다듬기 전 ' + BEFORE.rate + '%(위험), 다듬은 뒤 0%(양호)');
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
