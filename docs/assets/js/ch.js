/* 카피휴먼 공통 스크립트: 엔진 연결 · 토큰 코드 · 충전 창 · 메뉴 · 계산기 */
(function () {
  'use strict';
  var CFG = window.CH_CFG || {};
  var CH = window.CH = window.CH || {};
  var root = document.body.getAttribute('data-root') || '';
  CH.root = root;

  /* ---------- 작은 도구 ---------- */
  var $ = CH.$ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = CH.$$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  CH.esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  CH.n = function (x) { return Number(x || 0).toLocaleString('ko-KR'); };
  CH.tk = function (x) { return (Math.round((+x || 0) * 10) / 10).toLocaleString('ko-KR', { maximumFractionDigits: 1 }); };
  CH.won = function (tok) { return CH.n(Math.round((+tok || 0) * (CFG.tokWon || 100))) + '원'; };
  CH.sget = function (k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  CH.sset = function (k, v) { try { if (v == null || v === '') localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* 저장 없이 */ } };
  CH.ssget = function (k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  CH.ssset = function (k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 없이 */ } };
  CH.ico = function (n) {
    var P = {
      lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
      check: '<path d="M20 6 9 17l-5-5"/>', alert: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>',
      tri: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
      file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
      up: '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M20 21H4"/>', arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
      ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
      copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
      down: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M20 21H4"/>', spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
      refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>', key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.7 12.3 9.3-9.3M17 6l3 3M14 9l2 2"/>'
    };
    return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + (P[n] || '') + '</svg>';
  };
  CH.toast = function (t) {
    var el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); el.textContent = t;
    document.body.appendChild(el); setTimeout(function () { el.remove(); }, 2600);
  };
  CH.copy = function (text) {
    function fb() { var ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; } ta.remove(); CH.toast(ok ? '복사했습니다' : '복사하지 못했어요. 글을 직접 선택해 복사해 주세요.'); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { CH.toast('복사했습니다'); }, fb); else fb();
  };
  CH.cid = function () {
    var c = CH.sget('ch_cid');
    if (!c) { c = 'ch' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10); CH.sset('ch_cid', c); }
    return c;
  };

  /* ---------- 토큰 단가 ---------- */
  CH.cost = function (kind, chars) {
    var R = (CFG.rate || {})[kind] || { per: 100, cr: 0.2, min: 1, free: 0 };
    if (R.free && chars <= R.free) return 0;
    var units = Math.ceil(Math.max(1, chars) / R.per);
    return Math.max(R.min, Math.round(units * R.cr * 10) / 10);
  };
  CH.costParts = function (kind, parts) { return Math.round(parts.reduce(function (a, p) { return a + CH.cost(kind, p.length); }, 0) * 10) / 10; };

  /* ---------- 엔진 서버(카피휴먼 서버) ---------- */
  var server = CH.server = { state: 'unknown', why: '' };   // unknown | ok | off
  var CR_WON = 10;   // 서버 단위(크레딧) 1 = 10원, 사이트 1토큰 = 100원
  function toTok(cr) { return typeof cr === 'number' && isFinite(cr) ? Math.round(cr * CR_WON / (CFG.tokWon || 100) * 10) / 10 : cr; }
  function tokS(v) {
    if (typeof v !== 'string' || v.indexOf('크레딧') < 0) return v;
    var N = '(\\d{1,3}(?:,\\d{3})+|\\d+)';
    return v.replace(new RegExp(N + '\\s?크레딧', 'g'), function (m, n) { return CH.tk(toTok(+String(n).replace(/,/g, ''))) + '토큰'; }).replace(/크레딧/g, '토큰');
  }
  function convPass(p) {
    if (!p || typeof p !== 'object' || !p.credit) return p;
    ['cr', 'left', 'total', 'used', 'added', 'taken', 'spent'].forEach(function (k) { if (typeof p[k] === 'number') p[k] = toTok(p[k]); });
    return p;
  }
  function bandWord(s) { return s; }   /* 엔진의 판정 말(안전 · 고위험 · 부적합)을 그대로 씀 */
  CH.bandWord = bandWord;
  CH.call = function (action, data, ms) {
    if (server.state === 'off') return Promise.reject({ code: 'OFF', message: '엔진 서버와 연결되지 않았습니다.' });
    var body = Object.assign({ action: action, _o: CFG.origin || location.hostname, cid: CH.cid() }, data || {});
    var ctl = 'AbortController' in window ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, ms || 60000) : 0;
    return fetch(CFG.api, { method: 'POST', body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined, redirect: 'follow' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.code === 'ORIGIN') { server.state = 'off'; server.why = 'origin'; throw { code: 'OFF', message: j.message }; }
        server.state = 'ok';
        if (action === 'am.passinfo' && j && j.credit && +j.credit.won > 0 && !j.credit.tok) CR_WON = +j.credit.won;
        if (j && j.pass) convPass(j.pass);
        if (j && typeof j.message === 'string') j.message = tokS(j.message);
        if (j && j.ok === false) throw j;
        return j;
      }, function (e) {
        if (e && e.name === 'TypeError') { server.state = 'off'; server.why = 'net'; throw { code: 'OFF', message: '엔진 서버에 연결하지 못했습니다.' }; }
        if (e && e.name === 'AbortError') throw { code: 'SLOW', message: '서버 응답이 늦어 결과를 받지 못했습니다. 넣은 글은 그대로 있으니 다시 시도해 주세요.' };
        throw e;
      })
      .finally(function () { if (t) clearTimeout(t); });
  };

  /* ---------- 토큰 코드 ---------- */
  var P = CH.pass = {
    code: CH.sget('ch_pass'), info: null,
    norm: function (c) { return String(c || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); },
    fmt: function (c) { return P.norm(c).replace(/(.{4})(?=.)/g, '$1-'); },
    left: function () { return P.info && typeof P.info.cr === 'number' ? P.info.cr : (P.info && typeof P.info.left === 'number' ? P.info.left : null); },
    set: function (code, info) { P.code = P.fmt(code); P.info = info || null; CH.sset('ch_pass', P.code); paintChip(); },
    clear: function () { P.code = ''; P.info = null; CH.sset('ch_pass', ''); paintChip(); },
    check: function (code) {
      code = P.fmt(code);
      if (P.norm(code).length !== 16) return Promise.reject({ code: 'FORMAT', message: '토큰 코드는 16자리입니다. 메일에서 받은 코드를 그대로 넣어 주세요.' });
      return CH.call('am.pass', { pass: code }, 20000).then(function (r) {
        if (!r.pass) throw { code: 'PASS', message: '토큰 코드를 확인하지 못했습니다.' };
        P.set(code, r.pass); return r.pass;
      });
    },
    refresh: function () { if (!P.code) return Promise.resolve(null); return P.check(P.code).catch(function (e) { if (e && e.code === 'PASS') P.clear(); return null; }); }
  };
  function paintChip() {
    $$('[data-tok-chip]').forEach(function (b) {
      var l = P.left();
      b.innerHTML = CH.ico('key') + (P.code ? (l != null ? '토큰 <b>' + CH.tk(l) + '</b>' : '코드 등록됨') : '토큰 코드');
    });
  }
  CH.paintChip = paintChip;

  /* ---------- 서버 정보(결제 준비 · 상품) ---------- */
  CH.info = CH.ssget('ch_info');
  if (CH.info && Date.now() - (CH.info._at || 0) > 30 * 60 * 1000) CH.info = null;
  CH.infoP = CH.info ? Promise.resolve(CH.info) : CH.call('am.passinfo', {}, 20000).then(function (r) {
    if (r && Array.isArray(r.products)) r.products.forEach(function (p) { if (p && typeof p === 'object' && !(r.credit && r.credit.tok)) { p.cr = toTok(p.cr); p.base = toTok(p.base); } });
    r._at = Date.now(); CH.info = r; CH.ssset('ch_info', r); return r;
  }).catch(function () { return null; });
  CH.payReady = function () { var p = CH.info && CH.info.pay; return !!(p && p.ready && p.clientKey && server.state !== 'off'); };
  /* 엔진 서버에서 바로 결제가 켜져 있으면 '메일로 코드 받기' 안내를 '결제 즉시 코드 열림'으로 바꿈 */
  function payCopy() {
    if (!CH.payReady()) return;
    $$('[data-pv]').forEach(function (el) { el.hidden = el.getAttribute('data-pv') !== 'd'; });
  }
  CH.infoP.then(payCopy);

  /* ---------- 충전 창 ---------- */
  var PK = CFG.packs || [];
  function packs() {   // 바로 결제(서버 발급)일 때는 서버가 실제로 발급하는 토큰 수를 보여 줌
    if (!CH.payReady() || !Array.isArray(CH.info.products)) return PK;
    return PK.map(function (p) { var s = CH.info.products.filter(function (x) { return x.id === p.id; })[0]; return s ? Object.assign({}, p, { tok: +s.cr || p.tok, base: +s.base || p.base, price: +s.price || p.price }) : p; });
  }
  function shopUrl(p) { return String(CFG.shop || '').replace('%s', encodeURIComponent(p.idx)) + (CFG.utm ? '&' + CFG.utm : ''); }
  CH.shopUrl = shopUrl;
  function recPack(need, list) {
    list = list || packs();
    if (!need) return list.filter(function (p) { return p.best; })[0] || list[0];
    var fit = list.filter(function (p) { return p.tok >= need * 1.15; });
    return fit[0] || list[list.length - 1];
  }
  CH.recPack = recPack;
  var MAIL_RE = /^[^\s@]{1,64}@[A-Za-z0-9.\-]{1,120}\.[A-Za-z]{2,}$/;
  function tossSdk() {
    if (window.TossPayments) return Promise.resolve(window.TossPayments);
    return new Promise(function (ok, no) {
      var s = document.createElement('script'); s.src = 'https://js.tosspayments.com/v2/standard';
      s.onload = function () { if (window.TossPayments) ok(window.TossPayments); else no(new Error('결제 창을 불러오지 못했습니다.')); };
      s.onerror = function () { no(new Error('결제 창을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.')); };
      document.head.appendChild(s);
    });
  }
  function payErr(e) { var c = e && e.code; if (c === 'USER_CANCEL' || c === 'PAY_PROCESS_CANCELED') return '결제를 취소했습니다. 결제는 되지 않았습니다.'; return (e && e.message) || '결제 창을 열지 못했습니다. 잠시 뒤 다시 시도해 주세요.'; }
  var box = null, lastFocus = null, onDone = null;
  function close() { if (!box) return; box.remove(); box = null; document.body.style.overflow = ''; document.removeEventListener('keydown', onKey, true); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  function onKey(e) {
    if (!box) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    var f = $$('a[href], button:not([disabled]), input:not([disabled])', box).filter(function (el) { return el.offsetParent !== null; });
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
  var REFUND = '토큰 유효기간은 충전일부터 5년입니다. 코드 발송 전에는 전액 취소되고, 발송 뒤에는 쓴 토큰 · 받은 결과 · 보너스 토큰은 환불되지 않습니다(쓰지 않은 유료 토큰은 이용약관 기준).';
  /* opt: { need, recNeed, needText, title, focusCode, pick, intent, done(pass) } */
  CH.buy = function (opt) {
    opt = opt || {};
    close();
    lastFocus = document.activeElement; onDone = opt.done || null;
    var direct = CH.payReady(), list = packs(), t0 = Date.now();
    var rec = (opt.pick && list.filter(function (x) { return x.id === opt.pick; })[0]) || recPack(opt.recNeed || opt.need || 0, list);
    var mail0 = CH.sget('ch_mail'), tail = P.code ? P.norm(P.code).slice(-4) : '';
    box = document.createElement('div');
    box.className = 'modal'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'buyT');
    var offNote = server.state === 'off' ? '<p class="fine">지금은 엔진 서버와 연결되지 않아 이 화면에서 코드를 확인할 수 없습니다. 잠시 뒤 다시 열어 주세요.</p>' : '';
    var payPart = direct ?
      '<div class="pay-form">' +
        '<label class="fld"><span>코드를 받을 이메일</span><input id="payMail" type="email" inputmode="email" autocomplete="email" spellcheck="false" maxlength="120" placeholder="name@example.com" value="' + CH.esc(mail0) + '"></label>' +
        (P.code ? '<label class="chk"><input id="payTop" type="checkbox" checked><span>지금 쓰는 코드(끝 ' + CH.esc(tail) + ')에 토큰 더하기</span></label>' : '') +
        '<label class="chk"><input id="payAgree" type="checkbox"><span><b>(필수)</b> 상품과 결제 금액을 확인했고, <a href="' + CH.url('terms') + '#refund" target="_blank" rel="noopener">이용약관</a>(코드 발송 뒤 쓴 토큰 · 받은 결과는 환불 불가)에 동의합니다.</span></label>' +
        '<input id="payHp" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">' +
        '<button class="btn btn-p btn-lg btn-block" type="button" data-pay></button>' +
        '<p class="code-msg" data-pay-msg role="status"></p>' +
        '<div class="flow2">' + CH.ico('lock') + '<b>성균관컨설팅 안전결제</b><span>토스페이먼츠 · 카드 · 간편결제</span></div>' +
        '<p class="fine">결제가 끝나면 이 화면으로 돌아와 <b>토큰 코드가 바로 열리고</b>, 넣어 둔 글로 하던 일을 이어서 합니다. 코드는 적어 주신 이메일로도 보내 드립니다. 영수증과 카드 명세서에는 성균관컨설팅으로 표시되며, 카피휴먼은 카드 번호 같은 결제 정보를 받지 않습니다.</p>' +
        '<p class="fine"><a href="#" data-shop target="_blank" rel="noopener">성균관컨설팅 결제 페이지에서 결제하기</a>(계좌이체 · 세금계산서도 됩니다. 결제가 확인되면 바로 메일로 코드가 갑니다)</p>' +
      '</div>' :
      '<a class="btn btn-p btn-lg btn-block" data-go target="_blank" rel="noopener" href="#"></a>' +
      '<div class="flow2">' + CH.ico('lock') + '<b>성균관컨설팅 안전결제</b><span>회원가입 없이 · 카드 · 토스페이 · 계좌이체</span></div>' +
      '<p class="fine">결제는 카피휴먼 운영사 <b>성균관컨설팅</b>의 결제 페이지에서 합니다. 결제가 확인되면 바로(보통 5분 안) 주문서의 이메일로 <b>16자리 토큰 코드</b>가 갑니다(보내는 이름 ‘카피휴먼’). 메일이 안 보이면 스팸함도 확인해 주세요. 영수증과 카드 명세서에는 운영사 성균관컨설팅으로 표시됩니다.</p>';
    box.innerHTML = '<div class="modal-in"><button class="modal-x" type="button" aria-label="닫기">×</button>' +
      '<div class="stack"><span class="eyebrow">토큰 충전</span><h2 id="buyT">' + CH.esc(opt.title || '필요한 만큼만 충전하세요') + '</h2>' +
      '<p class="muted small">1토큰 = ' + CH.n(CFG.tokWon || 100) + '원 · 쓴 만큼만 빠지고 남은 토큰은 5년 동안 이어서 씁니다.</p></div>' +
      (opt.needText ? '<div class="need">' + opt.needText + '</div>' : '') +
      '<fieldset class="packs" style="border:0;padding:0;margin:0"><legend class="sr">충전할 토큰</legend>' + list.map(function (p) {
        return '<label class="pk"><input type="radio" name="pk" value="' + p.id + '"' + (p.id === rec.id ? ' checked' : '') + '>' +
          '<span class="pk-top"><b>' + CH.esc(p.name) + '</b>' + (p.id === rec.id ? '<span class="badge">' + (opt.pick ? '고른 묶음' : opt.need != null || opt.recNeed ? '이 글에 맞음' : '추천') + '</span>' : p.best ? '<span class="badge soft">많이 고름</span>' : '') + '</span>' +
          '<span class="pk-tok">' + CH.n(p.tok) + '토큰' + (p.tok > p.base ? '<small>+' + CH.n(p.tok - p.base) + ' 더</small>' : '') + '</span>' +
          '<span class="pk-price">' + CH.n(p.price) + '원</span><span class="pk-who">' + CH.esc(p.who) + '</span></label>';
      }).join('') + '</fieldset>' + payPart +
      '<div class="code-box"><label for="codeIn"><b>받은 토큰 코드 넣기</b></label><div class="code-row"><input id="codeIn" type="text" inputmode="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="24" placeholder="XXXX-XXXX-XXXX-XXXX" value="' + CH.esc(P.code) + '"><button class="btn btn-d" type="button" data-code>코드 넣기</button></div>' +
      '<p class="code-msg" data-code-msg role="status">' + (P.code ? '이 브라우저에 저장된 코드가 있습니다. 남은 토큰을 확인하려면 코드 넣기를 누르세요.' : '코드는 이 브라우저에만 저장됩니다. 다른 기기에서는 코드를 다시 넣어 주세요.') + '</p></div>' + offNote +
      '<p class="fine">' + REFUND + ' 처리하지 못한 요청은 토큰이 빠지지 않습니다. <a href="' + CH.url('terms') + '#refund">이용약관</a> · 문의 ' + CH.esc(CFG.mail || '') + '</p></div>';
    document.body.appendChild(box);
    document.body.style.overflow = 'hidden';
    var ci = $('#codeIn', box), cm = $('[data-code-msg]', box);
    function cur() { var v = ($('input[name=pk]:checked', box) || {}).value; return list.filter(function (x) { return x.id === v; })[0] || rec; }
    function paint() {
      var p = cur(), go = $('[data-go]', box), pay = $('[data-pay]', box), sh = $('[data-shop]', box);
      if (go) { go.href = shopUrl(p); go.innerHTML = CH.ico('lock') + '<span>성균관컨설팅에서 ' + CH.n(p.price) + '원 결제하기</span>'; }
      if (pay) pay.innerHTML = '<span>' + CH.n(p.price) + '원 결제하고 바로 코드 받기</span>';
      if (sh) sh.href = shopUrl(p);
    }
    paint();
    box.addEventListener('change', function (e) { if (e.target.name === 'pk') paint(); });
    var go = $('[data-go]', box);
    if (go) go.addEventListener('click', function () {
      var v = cur().id;
      CH.ssset('ch_buy', { pack: v, at: Date.now(), intent: opt.intent || '' });
      if (window.gtag) try { window.gtag('event', 'begin_checkout', { items: [{ item_id: v }] }); } catch (e) { /* 무시 */ }
      setTimeout(function () { cm.className = 'code-msg'; cm.textContent = '결제를 마치면 메일로 받은 16자리 코드를 여기에 넣어 주세요. 넣어 둔 글로 바로 이어서 진행합니다.'; ci.focus(); }, 400);
    });
    var payB = $('[data-pay]', box);
    if (payB) payB.addEventListener('click', function () {
      var pm = $('[data-pay-msg]', box), mail = String(($('#payMail', box) || {}).value || '').trim(), p = cur();
      function say(t, ok) { pm.className = 'code-msg' + (ok ? ' ok' : ' bad'); pm.textContent = t; }
      if (!MAIL_RE.test(mail)) { say('코드를 받을 이메일을 확인해 주세요.'); $('#payMail', box).focus(); return; }
      if (!$('#payAgree', box).checked) { say('결제 전 확인 항목에 동의해 주세요.'); $('#payAgree', box).focus(); return; }
      CH.sset('ch_mail', mail); payB.disabled = true; say('결제 창을 준비하는 중…', true);
      var top = $('#payTop', box), to = top && top.checked ? P.code : '', hold = Math.max(0, 2800 - (Date.now() - t0));
      if (window.gtag) try { window.gtag('event', 'begin_checkout', { items: [{ item_id: p.id }], method: 'direct' }); } catch (e) { /* 무시 */ }
      new Promise(function (ok) { setTimeout(ok, hold); }).then(function () {
        return CH.call('am.buy', { product: p.id, to: to, contact: mail, agree: 1, pay: 1, hp: ($('#payHp', box) || {}).value || '', ms: Date.now() - t0, src: location.pathname }, 30000);
      }).then(function (r) {
        if (!r || !r.pay || !r.pay.payOrderId) throw { message: '결제 창을 열지 못했습니다. 아래 성균관컨설팅 결제 페이지에서 결제해 주세요.' };
        CH.ssset('ch_pay', { oid: r.pay.payOrderId, id: r.id, prod: p.id, intent: opt.intent || '', topup: !!r.topup, at: Date.now() });
        var base = location.origin + location.pathname, req = { orderId: r.pay.payOrderId, orderName: r.pay.orderName, successUrl: base + '?pay=ok', failUrl: base + '?pay=fail', customerEmail: mail };
        return tossSdk().then(function (TP) {
          var tp = TP(CH.info.pay.clientKey);
          if (CH.info.pay.mode === 'widget') {
            var w = tp.widgets({ customerKey: TP.ANONYMOUS }), wrap = $('.pay-form', box);
            wrap.innerHTML = '<div id="payMethods"></div><div id="payAgreeW"></div><button class="btn btn-p btn-lg btn-block" type="button" id="payGo">' + CH.n(r.pay.amount) + '원 결제하기</button><p class="code-msg" role="status"></p>';
            return w.setAmount({ currency: 'KRW', value: r.pay.amount }).then(function () { return Promise.all([w.renderPaymentMethods({ selector: '#payMethods', variantKey: 'DEFAULT' }), w.renderAgreement({ selector: '#payAgreeW', variantKey: 'AGREEMENT' })]); }).then(function () {
              var g = $('#payGo', box), m2 = $('.pay-form .code-msg', box);
              g.addEventListener('click', function () { g.disabled = true; Promise.resolve(w.requestPayment(req)).catch(function (e) { g.disabled = false; m2.className = 'code-msg bad'; m2.textContent = payErr(e); }); });
            });
          }
          var pay = tp.payment({ customerKey: 'ch_' + CH.cid().replace(/[^A-Za-z0-9]/g, '').slice(0, 30) });
          return pay.requestPayment(Object.assign({ method: 'CARD', amount: { currency: 'KRW', value: r.pay.amount }, card: { useEscrow: false, flowMode: 'DEFAULT', useCardPoint: false, useAppCardOnly: false } }, req));
        });
      }).catch(function (e) { payB.disabled = false; say(payErr(e)); });
    });
    function submitCode() {
      var b = $('[data-code]', box); b.disabled = true; cm.className = 'code-msg'; cm.textContent = '코드를 확인하는 중…';
      P.check(ci.value).then(function (info) {
        var l = P.left();
        cm.className = 'code-msg ok'; cm.textContent = '코드를 넣었습니다.' + (l != null ? ' 남은 토큰 ' + CH.tk(l) + '개.' : '');
        var cb = onDone; setTimeout(function () { close(); if (cb) cb(info); }, 700);
      }).catch(function (e) {
        cm.className = 'code-msg bad';
        cm.textContent = e && e.code === 'OFF' ? '지금은 엔진 서버와 연결되지 않아 코드를 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.' : (e && e.message) || '토큰 코드를 확인해 주세요.';
      }).then(function () { b.disabled = false; });
    }
    $('[data-code]', box).addEventListener('click', submitCode);
    ci.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submitCode(); } });
    ci.addEventListener('input', function () { var v = P.fmt(ci.value); if (v !== ci.value) ci.value = v; });
    $('.modal-x', box).addEventListener('click', close);
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    document.addEventListener('keydown', onKey, true);
    setTimeout(function () { if (opt.focusCode) ci.focus(); else { var c = $('input[name=pk]:checked', box); if (c) c.focus(); } }, 60);
  };
  CH.closeBuy = close;

  /* ---------- 결제하고 돌아왔을 때(바로 결제) ---------- */
  var Q = {}; try { new URLSearchParams(location.search).forEach(function (v, k) { Q[k] = v; }); } catch (e) { Q = {}; }
  function cleanUrl() { try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* 그대로 */ } }
  function banner(html, kind) {
    var el = document.getElementById('payBanner');
    if (!el) { el = document.createElement('div'); el.id = 'payBanner'; el.className = 'pay-banner'; el.setAttribute('role', 'status'); var m = document.getElementById('main'); (m || document.body).insertBefore(el, (m || document.body).firstChild); }
    el.className = 'pay-banner' + (kind ? ' ' + kind : ''); el.innerHTML = '<div class="wrap">' + html + '</div>';
    return el;
  }
  CH.payResult = null;
  if (Q.pay === 'ok' && Q.paymentKey && Q.orderId) {
    var pend = CH.ssget('ch_pay') || {};
    banner('<b>결제를 확인하는 중입니다</b><span>토스페이먼츠 승인 결과를 확인한 뒤 토큰 코드를 바로 열어 드립니다. 이 화면을 닫지 마세요.</span>', 'wait');
    CH.payResult = CH.call('am.payok', { paymentKey: Q.paymentKey, orderId: Q.orderId, amount: Q.amount }, 60000).then(function (r) {
      cleanUrl(); CH.ssset('ch_pay', null);
      if (r.waiting) { banner('<b>입금을 기다리고 있습니다</b><span>' + CH.esc(r.name || '') + ' · ' + CH.n(r.price) + '원 · 계좌 ' + CH.esc(r.account || '') + (r.due ? ' · ' + CH.esc(r.due) + '까지' : '') + '. 입금이 확인되면 ' + (r.topup ? '지금 코드에 토큰을 더해 드립니다.' : '토큰 코드를 메일로 보내 드립니다.') + '</span>', 'wait'); return { ok: false }; }
      if (r.topup) return P.refresh().then(function () { banner('<b>충전이 끝났습니다</b><span>지금 코드에 토큰을 더했습니다.' + (P.left() != null ? ' 남은 토큰 ' + CH.tk(P.left()) + '개.' : '') + '</span>', 'ok'); return { ok: true, intent: pend.intent }; });
      if (!r.code) { banner('<b>이미 결제가 끝난 주문입니다</b><span>' + CH.esc(r.message || '토큰 코드는 주문할 때 적은 이메일로 보냈습니다.') + '</span>', 'ok'); return { ok: false }; }
      P.set(r.code);
      banner('<b>결제가 끝났습니다. 토큰 코드가 열렸습니다</b><span class="mono">' + CH.esc(P.code) + '</span><button class="btn btn-g btn-s" type="button" data-copy-code>코드 복사</button><span>' + (r.mailed ? '적어 주신 이메일' + (r.to ? '(' + CH.esc(r.to) + ')' : '') + '로도 보냈습니다. ' : '') + '이 브라우저에 저장했으니 바로 이어서 쓰세요.</span>', 'ok');
      var cb = document.querySelector('[data-copy-code]'); if (cb) cb.addEventListener('click', function () { CH.copy(P.code); });
      if (window.gtag) try { window.gtag('event', 'purchase', { transaction_id: Q.orderId, value: +Q.amount || 0, currency: 'KRW' }); } catch (e) { /* 무시 */ }
      return P.refresh().then(function () { return { ok: true, intent: pend.intent, code: r.code }; });
    }).catch(function (e) {
      cleanUrl();
      banner('<b>결제를 확인하지 못했어요</b><span>' + CH.esc((e && e.message) || '잠시 뒤 다시 시도해 주세요.') + ' 결제가 되었는데 코드가 열리지 않으면 주문 번호(' + CH.esc(String(Q.orderId || '').slice(0, 12)) + ')와 함께 ' + CH.esc(CFG.mail || '') + '로 알려 주세요.</span>', 'bad');
      return { ok: false };
    });
  } else if (Q.pay === 'fail') {
    cleanUrl();
    banner('<b>' + (Q.code === 'PAY_PROCESS_CANCELED' || Q.code === 'USER_CANCEL' ? '결제를 취소했습니다' : '결제가 끝나지 않았습니다') + '</b><span>결제는 되지 않았습니다. 넣어 둔 글은 그대로 있으니 다시 시도해 주세요.</span>', 'bad');
  }

  /* 주소 */
  CH.url = function (key) { var map = CFG.urls || {}; return root + (map[key] != null ? map[key] : key + '/'); };

  /* ---------- 머리 · 메뉴 ---------- */
  var mb = $('#menuBtn'), mn = $('#mnav'), hd = $('.hd');
  if (mb && mn) {
    mb.addEventListener('click', function () {
      var on = !mn.classList.contains('on');
      if (on && hd) document.documentElement.style.setProperty('--hd-bottom', Math.round(hd.getBoundingClientRect().bottom) + 'px');
      mn.classList.toggle('on', on); mb.setAttribute('aria-expanded', on ? 'true' : 'false');
      document.body.style.overflow = on ? 'hidden' : '';
    });
    mn.addEventListener('click', function (e) { if (e.target.closest('a')) { mn.classList.remove('on'); mb.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; } });
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-tok-chip], [data-open-buy]');
    if (!t) return;
    e.preventDefault();
    CH.buy({ focusCode: t.hasAttribute('data-tok-chip'), title: t.hasAttribute('data-tok-chip') ? '토큰 코드와 충전' : null, pick: t.getAttribute('data-pack') || null });
  });
  paintChip();
  if (P.code && document.querySelector('[data-tool]')) P.refresh();

  /* ---------- 패턴 예시 바꾸기 ---------- */
  $$('[data-pat]').forEach(function (el) {
    var ex = $('.pat-ex', el), bs = $$('.switch button', el);
    bs.forEach(function (b) {
      b.addEventListener('click', function () {
        bs.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        ex.innerHTML = el.querySelector('template[data-v="' + b.getAttribute('data-v') + '"]').innerHTML;
        ex.classList.remove('swap'); void ex.offsetWidth; ex.classList.add('swap');
      });
    });
  });

  /* ---------- 토큰 계산기 ---------- */
  $$('[data-calc]').forEach(function (el) {
    var r = $('input[type=range]', el), cd = $('#calcDet', el), ch = $('#calcHum', el), o = $('.calc-out', el), lab = $('[data-chars]', el);
    function paint() {
      var n = +r.value, d = cd.checked ? CH.cost('unit', n) : 0, h = ch.checked ? CH.cost('pro', n) : 0, s = Math.round((d + h) * 10) / 10, p = recPack(s);
      lab.textContent = CH.n(n) + '자';
      o.innerHTML = '<div class="row"><span>AI 작성률 전체 결과</span><b>' + (cd.checked ? CH.tk(d) + '토큰' : '빼기') + '</b></div>' +
        '<div class="row"><span>AI 휴머나이징</span><b>' + (ch.checked ? CH.tk(h) + '토큰' : '빼기') + '</b></div>' +
        '<div class="row sum"><span>합계</span><b>' + CH.tk(s) + '토큰 · ' + CH.won(s) + '</b></div>' +
        '<div class="row"><span>맞는 충전</span><b>' + CH.esc(p.name) + ' ' + CH.n(p.tok) + '토큰(' + CH.n(p.price) + '원)</b></div>';
    }
    [r, cd, ch].forEach(function (x) { x.addEventListener('input', paint); x.addEventListener('change', paint); });
    $$('.presets button', el).forEach(function (b) { b.addEventListener('click', function () { r.value = b.getAttribute('data-n'); paint(); }); });
    paint();
  });

  /* ---------- 움직임: 스크롤하면 나타나기 · 숫자 올리기 · 형광펜 표시 ---------- */
  var RM = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var IO = 'IntersectionObserver' in window;
  CH.reduced = RM;
  CH.countUp = function (el, to, dec, ms) {   // 0에서 to까지(소수 dec자리)
    if (RM || !window.requestAnimationFrame) { el.textContent = to.toFixed(dec); return; }
    var t0 = null; ms = ms || 1100;
    function f(ts) { if (t0 === null) t0 = ts; var p = Math.min(1, (ts - t0) / ms), e = 1 - Math.pow(1 - p, 3); el.textContent = (to * e).toFixed(dec); if (p < 1) requestAnimationFrame(f); }
    requestAnimationFrame(f);
  };
  CH.sweep = function (scope, delay) {   // 표시된 문장을 형광펜이 지나가듯 차례로 칠함
    var ss = $$('.s-hi, .s-mid, .s-low, .s-new', scope);
    if (!ss.length || RM) return;
    scope.classList.add('sweep');
    var step = Math.max(35, Math.min(160, 2400 / ss.length));
    ss.forEach(function (s, k) { setTimeout(function () { s.classList.add('on'); }, (delay || 250) + k * step); });
  };
  if (IO && !RM) {
    var revealSel = '.sec .sec-h, .stats .stat, .steps > li, .pats .pat, .plans .plan, .grid3 > .card, .grid4 > .card, .grid2 > .card, .feature .txt, .feature .sheet, .faq, .expert, .calc, .cta-band .wrap > *, .statement .wrap > :not(.spec), .spec li, .hero-strip li';
    var rioSeen = false;
    var rio = new IntersectionObserver(function (es) {
      rioSeen = true;
      es.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); rio.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    setTimeout(function () { if (!rioSeen) $$('.rv').forEach(function (el) { el.classList.add('in'); }); }, 2500);   // 그리기를 멈춘 화면(미리보기 · 일부 앱)에서도 내용이 보이게
    $$(revealSel).forEach(function (el) {
      if ((el.closest('.hero') && !el.closest('.hero-strip')) || el.closest('.out-wrap')) return;
      var sib = el.parentNode ? Array.prototype.indexOf.call(el.parentNode.children, el) : 0;
      el.style.setProperty('--d', Math.min(sib, 5) * 70 + 'ms');
      el.classList.add('rv'); rio.observe(el);
    });
    var cio = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (!en.isIntersecting) return;
        cio.unobserve(en.target);
        var el = en.target;
        if (el.hasAttribute('data-count')) CH.countUp(el, parseFloat(el.getAttribute('data-count')), +(el.getAttribute('data-dec') || 0), 1300);
        if (el.hasAttribute('data-hl')) CH.sweep(el, 300);
      });
    }, { threshold: 0.35 });
    /* 숫자가 적힌 통계만 셈(검사 칸 글자 수 표시 data-count는 값이 비어 있어 건드리지 않음) */
    $$('[data-count]:not([data-count=""])').forEach(function (el) { el.textContent = (0).toFixed(+(el.getAttribute('data-dec') || 0)); cio.observe(el); });
    $$('[data-hl]').forEach(function (el) { if ($$('.s-hi, .s-mid, .s-low, .s-new', el).length) { el.classList.add('sweep'); cio.observe(el); } });
  }

  /* 같은 쪽 검사 칸(#check)으로 가는 단추: 부드럽게 내려가고, 넓은 화면에서는 글 칸에 바로 쓸 수 있게 */
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href="#check"]');
    var t = document.getElementById('check');
    if (!a || !t) return;
    e.preventDefault();
    var y = t.getBoundingClientRect().top + window.scrollY - 84;
    window.scrollTo({ top: Math.max(0, y), behavior: RM ? 'auto' : 'smooth' });
    try { history.replaceState(null, '', '#check'); } catch (e2) { /* 그대로 */ }
    var ta = $('textarea', t);
    if (ta && window.matchMedia && window.matchMedia('(pointer: fine)').matches) setTimeout(function () { ta.focus({ preventScroll: true }); }, RM ? 0 : 650);
  });

  /* ---------- 아래 고정 단추 ---------- */
  var dock = $('.dock'), tool = $('[data-tool]');
  if (dock && tool && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { es.forEach(function (en) { dock.classList.toggle('on', !en.isIntersecting && window.scrollY > 300); }); }, { threshold: 0 }).observe(tool);
  } else if (dock) {
    var onScroll = function () { dock.classList.toggle('on', window.scrollY > 420); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  }
})();
