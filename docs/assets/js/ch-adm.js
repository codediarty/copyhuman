/* 카피휴먼 토큰 관리(/admin/pass/?t=…) 2026.10.31: 서버 요청(카피휴먼 서버, 주소는 ch-config.js) · 크레딧 ↔ 토큰 바꾸기.
   AIMarker 사이트의 관리 화면과 같은 틀이지만 카피휴먼 서버로만 요청함 */
(function () {
  'use strict';
  var CFG = window.CH_CFG || {}, AM = window.AM = window.AM || {};
  AM.API = CFG.api; AM.MAIL = 'token@copyhuman.kr';
  AM.root = document.body.getAttribute('data-root') || '';
  AM.call = function (action, data, timeoutMs) {
    var body = Object.assign({ action: action, _o: location.hostname }, data || {});
    var ctl = 'AbortController' in window ? new AbortController() : null;
    var t = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs || 20000) : 0;
    return fetch(AM.API, { method: 'POST', body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined, redirect: 'follow' })
      .then(function (r) { return r.json(); })
      .then(function (j) { return tokOf(action, j, data); })
      .finally(function () { if (t) clearTimeout(t); });
  };
  /* 13.1 이름 '크레딧' → '토큰', 13.2 단위 1토큰 = 100원.
     서버(PASS 1.2)는 아직 '크레딧'(1크레딧 = 10원)이라, 화면에 보이기 전에 이름과 숫자를 토큰으로 바꿈(10크레딧 = 1토큰).
     숫자: 충전 상품(cr · base), 단가(credit.cost), 토큰 코드(pass: cr · left · total · used · log), 충전 결과, 관리 화면 충전 · 차감 결과.
     글: 결제 · 충전 · 코드 응답은 전체를, 그 밖의 응답은 오류 문구와 pass 정보만(이용자가 넣은 글은 건드리지 않음).
     오류 응답의 left(남은 크레딧)는 토큰 코드인지 알 수 있는 곳(humanize.js)에서 AM.toTok 으로 바꿈 */
  var TOK_ALL = { 'am.pass': 1, 'am.passinfo': 1, 'am.buy': 1, 'am.payok': 1, 'am.adm': 1, 'am.lead': 1 };
  AM.TOK_WON = 100; AM.CR_WON = 10;   // 사이트 1토큰 = 100원, 서버 1크레딧 = 10원(am.passinfo credit.won 이 오면 그 값)
  function toTok(cr) { return typeof cr === 'number' && isFinite(cr) ? Math.round(cr * AM.CR_WON / AM.TOK_WON * 10) / 10 : cr; }
  function toCr(tk) { return Math.round((+tk || 0) * AM.TOK_WON / AM.CR_WON); }
  function fmtTok(x) { return (Math.round((+x || 0) * 10) / 10).toLocaleString('ko-KR', { maximumFractionDigits: 1 }); }
  AM.toTok = toTok; AM.toCr = toCr; AM.fmtTok = fmtTok;
  function numOf(s) { return +String(s).replace(/,/g, ''); }
  function tokS(v) {
    if (typeof v !== 'string' || v.indexOf('크레딧') < 0) return v;
    var N = '(\\d{1,3}(?:,\\d{3})+|\\d+)';   // 1,100 · 120 (뒤의 쉼표는 숫자가 아님)
    return v.replace(new RegExp(N + '\\s?크레딧', 'g'), function (m, n) { return fmtTok(toTok(numOf(n))) + '토큰'; })
      .replace(new RegExp('크레딧(\\s?)' + N, 'g'), function (m, sp, n) { return '토큰' + sp + fmtTok(toTok(numOf(n))); })
      .replace(/크레딧/g, '토큰');
  }
  function tokDeep(o, d) {
    if (o == null || d > 8) return o;
    if (typeof o === 'string') return tokS(o);
    if (Array.isArray(o)) return o.map(function (x) { return tokDeep(x, d + 1); });
    if (typeof o === 'object') { var r = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = tokDeep(o[k], d + 1); return r; }
    return o;
  }
  function numTok(o, keys) { keys.forEach(function (k) { if (typeof o[k] === 'number') o[k] = toTok(o[k]); }); }
  function convPass(p) {   // 토큰 코드(예전 이용권은 횟수라 그대로)
    if (!p || typeof p !== 'object' || !p.credit) return;
    numTok(p, ['cr', 'left', 'total', 'used', 'added', 'taken', 'spent']);
    if (Array.isArray(p.log)) p.log.forEach(function (g) { if (g && typeof g === 'object') numTok(g, ['cr']); });
  }
  function tokOf(action, j, data) {
    if (!j || typeof j !== 'object') return j;
    if (action === 'am.passinfo' && j.credit && typeof j.credit === 'object' && !j.credit.tok) {
      if (+j.credit.won > 0) AM.CR_WON = +j.credit.won;
      var C = j.credit.cost || {};
      Object.keys(C).forEach(function (k) { if (C[k] && typeof C[k] === 'object') numTok(C[k], ['cr', 'min']); });
      j.credit.crWon = AM.CR_WON; j.credit.won = AM.TOK_WON; j.credit.tok = 1;
    }
    if (TOK_ALL[action]) {
      ['products', 'biz'].forEach(function (k) { if (Array.isArray(j[k])) j[k].forEach(function (p) { if (p && typeof p === 'object') numTok(p, ['cr', 'base']); }); });
      if (Array.isArray(j.passes)) j.passes.forEach(convPass);
      if (action === 'am.payok' && j.topup) numTok(j, ['added', 'left']);
      if (action === 'am.adm' && data && (data.op === 'topup' || data.op === 'deduct')) numTok(j, ['added', 'taken', 'left', 'total']);
    }
    if (j.pass && typeof j.pass === 'object') convPass(j.pass);
    if (TOK_ALL[action]) return tokDeep(j, 0);
    if (typeof j.message === 'string') j.message = tokS(j.message);
    if (j.pass && typeof j.pass === 'object') j.pass = tokDeep(j.pass, 0);
    return j;
  }
  AM.tok = tokS;
})();
/* 카피휴먼 토큰 관리(/admin/pass/?t=…): 운영자 메일로 받은 서명 링크로만 열림. 주문 확인 · 토큰 보내기 · 충전 · 차감 · 직접 만들기 · 중지(예전 이용권도 함께) */
(function () {
  'use strict';
  var AM = window.AM || {}, $ = function (s) { return document.querySelector(s); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n2(n) { return Number(n || 0).toLocaleString('ko-KR'); }
  /* 13.2 1토큰 = 100원: 서버(1크레딧 = 10원) 숫자는 am.js 가 토큰으로 바꿔 주고, 보낼 때는 AM.toCr 로 크레딧으로 */
  function tn(x) { return (Math.round((+x || 0) * 10) / 10).toLocaleString('ko-KR', { maximumFractionDigits: 1 }); }
  function toCr(t) { return AM.toCr ? AM.toCr(t) : Math.round((+t || 0) * 10); }
  function sget(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function sset(k, v) { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch (e) { /* 이 창에서만 */ } }
  function say(el, text, kind) { if (!el) return; el.textContent = text || ''; el.className = 'msg' + (text ? ' on ' + (kind || 'err') : ''); }
  function toast(m) { var t = $('#admToast'); if (!t) return; t.textContent = m; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(function () { t.classList.remove('on'); }, 3600); }
  function call(op, data) {
    return AM.call('am.adm', Object.assign({ op: op, t: T }, data || {}), 45000).then(function (r) { if (!r || !r.ok) throw r || {}; return r; });
  }

  /* 관리 링크: 주소의 t는 이 창에만 기억하고 주소에서 지움(화면 공유 · 방문 기록에 남지 않게) */
  var q = new URLSearchParams(location.search), T = q.get('t') || sget('am_adm_t'), ORDER = (q.get('order') || '').toUpperCase().replace(/[^A-Z0-9\-]/g, '');
  if (q.get('t')) { sset('am_adm_t', q.get('t')); try { history.replaceState(null, '', location.pathname + (ORDER ? '?order=' + encodeURIComponent(ORDER) : '')); } catch (e) { /* 주소 그대로 */ } }
  var D = null, PROD = {};

  function gate(why) {
    T = ''; sset('am_adm_t', '');
    $('#admMain').hidden = true; $('#admGate').hidden = false; $('#admExp').textContent = '';
    say($('#admGateMsg'), why || '', 'err');
  }
  $('#admLink').addEventListener('click', function () {
    var b = this; b.disabled = true; say($('#admGateMsg'), '보내는 중…', 'ok');
    AM.call('am.adm', { op: 'link' }, 30000).then(function (r) {
      if (!r || !r.ok) throw r || {};
      say($('#admGateMsg'), '운영자 메일로 관리 링크를 보냈습니다. 메일의 단추를 눌러 들어오세요(스팸함도 확인해 주세요).', 'ok');
    }).catch(function (e) { say($('#admGateMsg'), (e && e.message) || '보내지 못했습니다. 잠시 뒤 다시 눌러 주세요.'); })
      .then(function () { setTimeout(function () { b.disabled = false; }, 4000); });
  });

  /* 두 번 눌러 확인(브라우저 확인 창 대신) */
  function twice(btn, label) {
    if (btn.getAttribute('data-arm') === '1') { clearTimeout(btn._t); btn.removeAttribute('data-arm'); btn.classList.remove('arm'); btn.textContent = btn._old || btn.textContent; return true; }
    btn._old = btn.textContent; btn.setAttribute('data-arm', '1'); btn.classList.add('arm'); btn.textContent = label || '한 번 더 누르면 실행';
    clearTimeout(btn._t); btn._t = setTimeout(function () { btn.removeAttribute('data-arm'); btn.classList.remove('arm'); btn.textContent = btn._old; }, 4000);
    return false;
  }

  function load() {
    if (!T) return gate('');
    $('#admGate').hidden = true; $('#admMain').hidden = false;
    var m = /^(\d{4})-(\d{2})-(\d{2})\./.exec(T); $('#admExp').textContent = m ? '관리 링크 ' + m[1] + '.' + m[2] + '.' + m[3] + '까지' : '';
    return call('list').then(function (r) { D = r; PROD = {}; (r.products || []).forEach(function (p) { PROD[p.name] = p; PROD[p.id] = p; }); render(); })
      .catch(function (e) { if (e && e.code === 'ADMIN') gate(e.message); else toast((e && e.message) || '목록을 불러오지 못했습니다. 새로 고침을 눌러 주세요.'); });
  }

  function badge(st) {
    var k = /보냄|사용/.test(st) ? 'ok' : /대기|만듦|열림/.test(st) ? 'wait' : /중지|취소|환불|실패|확인 필요/.test(st) ? 'off' : '';
    return '<span class="adm-b ' + k + '">' + esc(st === '사용' ? '쓸 수 있음' : (st || '-')) + '</span>';
  }
  function render() {
    var ords = D.orders || [], ps = D.passes || [];
    $('#ordN').textContent = ords.length ? n2(ords.length) + '건' : '';
    $('#ordList').innerHTML = ords.length ? ords.map(function (o) {
      var sent = /보냄|충전함/.test(o.st), p = PROD[o.plan] || PROD[String(o.plan || '').replace(/ 충전$/, '')], toss = /pk [A-Za-z0-9_\-=.]{8,}/.test(o.memo || ''), paidNow = toss && /^결제 완료/.test(o.st), noSend = /^(결제창 열림|결제 실패|환불)/.test(o.st), cr = p && p.cr;
      return '<div class="adm-it' + (o.id === ORDER ? ' hit' : '') + '" id="o-' + esc(o.id) + '"><div class="adm-m"><b>' + esc(o.id) + '</b>' + badge(o.st) + '<span>' + esc(o.plan) + (p ? ' · ' + n2(p.price) + '원' : '') + (toss ? ' · 바로 결제' : '') + '</span></div>' +
        '<div class="adm-s"><span>' + esc(o.at) + '</span><span>' + esc(o.contact) + '</span>' + (o.memo ? '<span>' + esc(o.memo.replace(/ · pk [A-Za-z0-9_\-=.]+/, '')) + '</span>' : '') + (/^결제창 열림/.test(o.st) ? '<span class="adm-mute">결제 창을 연 뒤 아직 끝나지 않음(결제가 끝나면 자동으로 나갑니다)</span>' : '') + (o.top ? '<span>충전할 코드 ' + esc(o.top) + '</span>' : '') + '</div>' +
        '<div class="adm-a">' + (p && !noSend && o.top ? '<button class="btn ' + (sent ? 'btn-g' : 'btn-p') + ' btn-s" type="button" data-top="' + esc(o.top) + '" data-prod="' + esc(p.id) + '" data-order="' + esc(o.id) + '" data-to="' + esc(o.contact) + '">' + (sent ? '한 번 더 충전' : esc(o.top) + ' 에 충전하기') + '</button>' : '') +
          (p && !noSend && !o.top ? '<button class="btn ' + (sent ? 'btn-g' : 'btn-p') + ' btn-s" type="button" data-send="' + esc(o.id) + '" data-prod="' + esc(p.id) + '">' + (sent ? '새 코드 보내기' : cr ? '토큰 보내기' : '이용권 보내기') + '</button>' : '') + (paidNow ? '<button class="btn btn-g btn-s" type="button" data-refund="' + esc(o.id) + '">환불(결제 취소)</button>' : '') + '</div></div>';
    }).join('') : '<p class="adm-empty">아직 주문이 없습니다.</p>';
    var grp = function (list, lab) { return list.length ? '<optgroup label="' + esc(lab) + '">' + list.map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + ' · ' + n2(p.price) + '원' + (p.biz ? '(부가세 별도)' : '') + '</option>'; }).join('') + '</optgroup>' : ''; };
    var PR = D.products || [], cP = PR.filter(function (p) { return p.cr && !p.biz && !p.legacy; }), cB = PR.filter(function (p) { return p.cr && p.biz; }), cL = PR.filter(function (p) { return !p.cr || p.legacy; });
    var sel = $('#isProd'); if (!sel.options.length) sel.innerHTML = grp(cP, '개인 토큰') + grp(cB, '기업 토큰') + grp(cL, '예전 이용권(판매 중지)');
    var tsel = $('#tpProd'); if (tsel && !tsel.options.length) tsel.innerHTML = '<option value="">상품 없이 토큰 수만</option>' + grp(cP, '개인 토큰') + grp(cB, '기업 토큰');
    $('#psN').textContent = ps.length ? n2(ps.length) + '개' : '';
    passes();
    var links = D.links || {}, lk = (D.products || []).filter(function (p) { return !p.legacy; }).map(function (p) { return '<dt>' + esc(p.name) + ' 결제 링크</dt><dd>' + (links[p.id] ? '<a href="' + esc(links[p.id]) + '" target="_blank" rel="noopener">' + esc(links[p.id]) + '</a>' : '<span class="adm-mute">없음(사이트 SHOP_IDX 가 있으면 그 주소, 없으면 주문 뒤 메일로 결제 안내)</span>') + '</dd>'; }).join('');
    var pay = D.pay || {};
    $('#payBox').innerHTML = '<dt>바로 결제</dt><dd>' + (pay.ready ? '<b>켜짐</b> · ' + (pay.mode === 'widget' ? '결제위젯' : '결제창') + (pay.test ? ' · <b>시험 키</b>(실제 돈이 나가지 않음)' : ' · 실제 결제') + ' · 결제가 승인되면 토큰이 자동으로 나가고 매출 알림 메일이 옵니다' : '<span class="adm-mute">꺼짐: 토큰 결제는 성균관컨설팅 결제 페이지(결제 링크) 또는 결제 안내 메일 → 결제 확인 뒤 토큰 보내기 · 충전하기</span>') + '</dd>' + '<dt>결제 안내 글</dt><dd>' + (D.payGuide ? esc(D.payGuide) : '<span class="adm-mute">비어 있음: 기본 안내(담당자가 메일로 결제 방법을 알려 드림)가 나갑니다.</span>') + '</dd>' + lk;
    if (ORDER) { var h = document.getElementById('o-' + ORDER); if (h) { h.scrollIntoView({ block: 'center' }); ORDER = ''; } }
  }
  function passes() {
    var w = ($('#psQ').value || '').trim().toLowerCase(), ps = (D.passes || []).filter(function (p) { return !w || [p.id, p.order, p.to, p.memo, p.name].join(' ').toLowerCase().indexOf(w) >= 0; });
    $('#psList').innerHTML = ps.length ? ps.slice(0, 200).map(function (p) {
      var on = p.st === '사용';
      var KL = { t: '충전', d: '차감', r: '환불' }, log = p.credit && (p.log || []).length ? '<div class="adm-log">' + p.log.slice(-6).reverse().map(function (g) { var d = new Date(g.at || 0); return '<span>' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + (KL[g.k] || g.k) + ' ' + (g.k === 't' ? '+' : '-') + tn(g.cr) + (g.o ? ' · ' + esc(g.o) : '') + (g.m ? ' · ' + esc(g.m) : '') + '</span>'; }).join('') + '</div>' : '';
      var info = p.credit ? '<span class="adm-cr">남은 <b>' + tn(p.left) + '</b> / ' + tn(p.total) + '토큰(' + n2(Math.round((+p.left || 0) * 100)) + '원어치) · 쓴 ' + tn(p.used) + ' · ' + n2(p.runs) + '번</span><span>유효기간 ' + esc((p.end || '').slice(0, 10)) + '까지</span>'
        : '<span>' + (p.start ? '시작 ' + esc(p.start.slice(0, 16)) + ' · 끝 ' + esc(p.end.slice(0, 16)) : '아직 안 씀') + '</span><span>쓴 횟수 ' + n2(p.used) + (p.pro ? ' · 고급 ' + n2(p.pro) : '') + ' · 남은 ' + n2(p.left) + '</span>';
      return '<div class="adm-it"><div class="adm-m"><b>' + esc(p.id) + '</b>' + badge(p.st) + '<span>' + esc(p.name) + (p.biz ? ' · 기업' : '') + '</span></div>' +
        '<div class="adm-s"><span>만든 ' + esc(p.at) + '</span>' + (p.order ? '<span>주문 ' + esc(p.order) + '</span>' : '') + (p.to ? '<span>' + esc(p.to) + '</span>' : '') + info + (p.memo ? '<span>' + esc(p.memo) + '</span>' : '') + log + '</div>' +
        '<div class="adm-a">' + (on && p.credit ? '<button class="btn btn-g btn-s" type="button" data-fill="top" data-id="' + esc(p.id) + '">충전</button><button class="btn btn-g btn-s" type="button" data-fill="ded" data-id="' + esc(p.id) + '">차감</button>' : '') + (on ? '<button class="btn btn-g btn-s" type="button" data-stop="' + esc(p.id) + '">중지</button>' : '') + '</div></div>';
    }).join('') : '<p class="adm-empty">' + (w ? '찾는 코드가 없습니다.' : '아직 만든 코드가 없습니다.') + '</p>';
  }
  $('#psQ').addEventListener('input', function () { if (D) passes(); });

  function codesHtml(r, note) {
    return '<div class="adm-codes"><p><b>' + esc(r.name) + ' ' + n2((r.items || []).length) + '개</b> · ' + esc(note) + '</p>' + (r.items || []).map(function (x) {
      return '<div class="adm-code"><code>' + esc(x.code) + '</code><span>' + esc(x.id) + '</span><button class="btn btn-g btn-s" type="button" data-copy="' + esc(x.code) + '">복사</button></div>';
    }).join('') + '</div>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || b.disabled) return;
    if (b.hasAttribute('data-reload')) { load(); return; }
    if (b.hasAttribute('data-copy')) {
      var v = b.getAttribute('data-copy');
      (navigator.clipboard ? navigator.clipboard.writeText(v) : Promise.reject()).then(function () { toast('복사했습니다: ' + v); }).catch(function () { toast('복사하지 못했습니다. 코드를 직접 골라 복사해 주세요.'); });
      return;
    }
    if (b.hasAttribute('data-fill')) {   // 코드 목록의 충전 · 차감 → 아래 칸에 코드 ID 채우고 그리로
      var fid = b.getAttribute('data-id'), top = b.getAttribute('data-fill') === 'top', inp = $(top ? '#tpId' : '#ddId');
      if (inp) { inp.value = fid; document.getElementById('topup').scrollIntoView({ block: 'start' }); setTimeout(function () { var nx = $(top ? '#tpProd' : '#ddCr'); if (nx) nx.focus(); }, 300); }
      return;
    }
    if (b.hasAttribute('data-top')) {   // 충전 주문: 결제 확인 뒤 그 코드에 상품만큼 더함
      if (!twice(b, '한 번 더 누르면 충전')) return;
      b.disabled = true; b.textContent = '충전하는 중…';
      call('topup', { id: b.getAttribute('data-top'), product: b.getAttribute('data-prod'), order: b.getAttribute('data-order'), to: b.getAttribute('data-to') || '', memo: '결제 확인 뒤 충전' }).then(function (r) {
        toast(r.id + ' 에 ' + tn(r.added) + '토큰을 더했습니다(남은 ' + tn(r.left) + ')' + (r.mailed ? ' · 알림 메일 보냄' : '') + '.'); return load();
      }).catch(function (e7) { toast((e7 && e7.message) || '충전하지 못했습니다.'); if (e7 && e7.code === 'ADMIN') gate(e7.message); b.disabled = false; b.textContent = b._old || '충전하기'; });
      return;
    }
    if (b.hasAttribute('data-send')) {
      if (!twice(b, '한 번 더 누르면 보냄')) return;
      b.disabled = true; b.textContent = '보내는 중…';
      call('issue', { order: b.getAttribute('data-send'), product: b.getAttribute('data-prod') }).then(function (r) {
        if (r.mailed) toast('코드를 보냈습니다(' + (r.to || '주문 메일') + ').');
        else { $('#issueOut').innerHTML = codesHtml(r, r.mailErr || '메일을 보내지 못했습니다. 코드를 직접 전해 주세요.'); location.hash = 'issue'; }
        return load();
      }).catch(function (e2) { toast((e2 && e2.message) || '보내지 못했습니다.'); if (e2 && e2.code === 'ADMIN') gate(e2.message); b.disabled = false; b.textContent = b._old || '토큰 보내기'; });
      return;
    }
    if (b.hasAttribute('data-refund')) {   // 1.27.0 약관 제7조의3 기준 금액을 먼저 보고, 두 번째 누름에 환불(대상이 아니면 '전액 환불(예외)')
      var oid = b.getAttribute('data-refund');
      if (b.getAttribute('data-arm') !== '1') {
        b.disabled = true;
        call('quote', { order: oid }).then(function (q) {
          b.disabled = false; b._mode = q.amount > 0 ? 'auto' : 'full';
          toast(q.why + (q.amount > 0 ? ' → ' + n2(q.amount) + '원' : ' → 약관상 환불 대상이 아닙니다. 예외로 전액 환불하려면 한 번 더 누르세요.'));
          twice(b, q.amount > 0 ? '한 번 더 누르면 ' + n2(q.amount) + '원 환불' + (q.amount < q.price ? '(부분 취소)' : '') : '한 번 더 누르면 전액 환불(예외)');
        }).catch(function (e6) { b.disabled = false; toast((e6 && e6.message) || '환불 금액을 확인하지 못했습니다.'); if (e6 && e6.code === 'ADMIN') gate(e6.message); });
        return;
      }
      twice(b); b.disabled = true; b.textContent = '환불하는 중…';
      call('refund', { order: oid, mode: b._mode || 'auto', reason: b._mode === 'full' ? '예외 전액 환불' : '' }).then(function (r) { toast(r.id + (r.already ? ' 은 이미 환불한 주문입니다.' : ' ' + n2(r.amount) + '원을 ' + (r.partial ? '부분 취소' : '결제 취소') + '했습니다' + (r.pass ? '(' + r.pass + ': 토큰은 그 충전분만큼 빼고, 예전 이용권은 멈춤)' : '') + '.')); return load(); })
        .catch(function (e5) { toast((e5 && e5.message) || '환불하지 못했습니다.'); if (e5 && e5.code === 'ADMIN') gate(e5.message); b.disabled = false; b.textContent = '환불(결제 취소)'; });
      return;
    }
    if (b.hasAttribute('data-stop')) {
      if (!twice(b, '한 번 더 누르면 중지')) return;
      b.disabled = true;
      call('stop', { id: b.getAttribute('data-stop') }).then(function (r) { toast(r.id + ' 코드를 멈췄습니다.'); return load(); })
        .catch(function (e3) { toast((e3 && e3.message) || '멈추지 못했습니다.'); if (e3 && e3.code === 'ADMIN') gate(e3.message); b.disabled = false; });
      return;
    }
    if (b.id === 'admRotate') {
      if (!twice(b, '한 번 더 누르면 모두 끊음')) return;
      b.disabled = true;
      call('rotate').then(function () { gate(''); say($('#admGateMsg'), '모든 관리 링크를 끊었습니다. 새 관리 링크를 운영자 메일로 보냈습니다.', 'ok'); })
        .catch(function (e4) { say($('#rotMsg'), (e4 && e4.message) || '처리하지 못했습니다.'); b.disabled = false; });
    }
  });
  $('#issueForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, msg = f.querySelector('.msg'), btn = f.querySelector('button[type="submit"]'), to = f.to.value.trim();
    if (to && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { say(msg, '받는 메일 주소를 확인해 주세요.'); return; }
    btn.disabled = true; say(msg, '만드는 중…', 'ok');
    call('issue', { product: f.product.value, to: to, n: to ? 1 : Math.max(1, Math.min(20, +f.n.value || 1)), memo: f.memo.value.trim() }).then(function (r) {
      if (r.mailed) { say(msg, '코드를 만들어 ' + (r.to || to) + ' 로 보냈습니다.', 'ok'); $('#issueOut').innerHTML = ''; }
      else { say(msg, r.mailErr || '코드를 만들었습니다. 아래 코드는 다시 볼 수 없으니 지금 복사해 두세요.', r.mailErr ? 'err' : 'ok'); $('#issueOut').innerHTML = codesHtml(r, '이 화면을 닫으면 다시 볼 수 없습니다'); }
      f.reset(); return load();
    }).catch(function (e2) { say(msg, (e2 && e2.message) || '만들지 못했습니다.'); if (e2 && e2.code === 'ADMIN') gate(e2.message); }).then(function () { btn.disabled = false; });
  });

  /* 충전 · 차감 */
  function idOk(v) { return /^PS\d{6}-[0-9A-F]{8}$/.test(v); }
  $('#topForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, msg = f.querySelector('.msg'), btn = f.querySelector('button[type="submit"]'), id = f.querySelector('[name="id"]').value.trim().toUpperCase(), pr = f.product.value, cr = Math.round((+f.cr.value || 0) * 10) / 10, to = f.to.value.trim();
    if (!idOk(id)) { say(msg, '코드 ID(PS261021-XXXXXXXX)를 확인해 주세요. 코드 자체가 아니라 목록의 ID입니다.'); return; }
    if (!pr && !(cr > 0)) { say(msg, '충전할 상품을 고르거나 토큰 수를 넣어 주세요.'); return; }
    if (to && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) { say(msg, '알림 메일 주소를 확인해 주세요.'); return; }
    if (!twice(btn, '한 번 더 누르면 충전')) return;
    btn.disabled = true; say(msg, '충전하는 중…', 'ok');
    call('topup', { id: id, product: pr, cr: pr ? 0 : toCr(cr), order: f.order.value.trim(), to: to, memo: f.memo.value.trim() }).then(function (r) {
      say(msg, r.id + ' 에 ' + tn(r.added) + '토큰을 더했습니다. 남은 ' + tn(r.left) + ' / ' + tn(r.total) + ' · 유효기간 ' + String(r.end || '').slice(0, 10) + '까지' + (r.mailed ? ' · 알림 메일 보냄' : ''), 'ok'); f.reset(); return load();
    }).catch(function (e8) { say(msg, (e8 && e8.message) || '충전하지 못했습니다.'); if (e8 && e8.code === 'ADMIN') gate(e8.message); }).then(function () { btn.disabled = false; });
  });
  $('#dedForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, msg = f.querySelector('.msg'), btn = f.querySelector('button[type="submit"]'), id = f.querySelector('[name="id"]').value.trim().toUpperCase(), cr = Math.round((+f.cr.value || 0) * 10) / 10, memo = f.memo.value.trim();
    if (!idOk(id)) { say(msg, '코드 ID(PS261021-XXXXXXXX)를 확인해 주세요.'); return; }
    if (!(cr > 0)) { say(msg, '뺄 토큰 수를 넣어 주세요.'); return; }
    if (!memo) { say(msg, '무엇에 쓴 토큰인지 메모를 적어 주세요.'); return; }
    if (!twice(btn, '한 번 더 누르면 ' + tn(cr) + '토큰 차감')) return;
    btn.disabled = true; say(msg, '차감하는 중…', 'ok');
    call('deduct', { id: id, cr: toCr(cr), memo: memo }).then(function (r) {
      say(msg, r.id + ' 에서 ' + tn(r.taken) + '토큰을 뺐습니다. 남은 ' + tn(r.left) + ' / ' + tn(r.total), 'ok'); f.reset(); return load();
    }).catch(function (e9) { say(msg, (e9 && e9.message) || '차감하지 못했습니다.'); if (e9 && e9.code === 'ADMIN') gate(e9.message); }).then(function () { btn.disabled = false; });
  });

  load();
})();
