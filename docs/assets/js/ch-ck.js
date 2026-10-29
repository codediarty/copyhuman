/* 카피휴먼 카피킬러 결과확인서 읽기 1.0
   카피킬러 AI생성검사 '상세 결과확인서' PDF에서 요약 수치(AI작성률 · 전체 영역 · AI 의심 영역 · 높음 · 중간 · 낮음)와
   본문, 그리고 결과확인서에 표시된 의심 영역(굵은 글씨 구간)과 등급을 꺼냅니다.
   - 모두 이 브라우저 안에서 처리합니다. 학번 · 이름 · 이메일 · 소속 같은 머리 정보는 읽지 않습니다.
   - 결과확인서 양식이 바뀌면 의심 영역은 비우고 본문만 돌려줍니다. */
(function (G) {
  'use strict';

  var LV = { '높음': 'hi', '중간': 'mid', '낮음': 'low' };

  function isCK(firstPageText) {
    var t = String(firstPageText || '').replace(/\s+/g, '');
    return /카피킬러/.test(t) && /AI생성검사/.test(t) && /AI작성률/.test(t) && /(전체영역|AI의심영역)/.test(t);
  }
  /* 결과확인서 종류: ai(AI생성검사) · plag(표절검사) · other(그 밖의 카피킬러 문서) · ''(카피킬러 문서가 아님) */
  function kindOf(firstPageText) {
    var t = String(firstPageText || '').replace(/\s+/g, '');
    if (!/카피킬러/.test(t)) return '';
    if (/AI생성검사/.test(t) && /AI작성률/.test(t)) return 'ai';
    if (/표절검사|표절률/.test(t)) return 'plag';
    return 'other';
  }
  function plagRate(firstPageText) {
    var m = /표절률\s*(\d+(?:\.\d+)?)%/.exec(String(firstPageText || '').replace(/\s+/g, ''));
    return m ? parseFloat(m[1]) : null;
  }

  function lineGroups(items) {   // 같은 높이끼리 한 줄(위에서 아래로, 왼쪽에서 오른쪽으로)
    var L = [];
    items.forEach(function (it) {
      if (!it || typeof it.str !== 'string' || !it.str.length) return;
      var x = it.transform[4], y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10;
      var line = null;
      for (var i = 0; i < L.length; i++) if (Math.abs(L[i].y - y) < h * 0.45) { line = L[i]; break; }
      if (!line) { line = { y: y, h: h, items: [] }; L.push(line); }
      line.items.push({ x: x, w: it.width || 0, s: it.str, f: it.fontName, h: h });
    });
    L.forEach(function (l) { l.items.sort(function (a, b) { return a.x - b.x; }); });
    L.sort(function (a, b) { return b.y - a.y; });
    return L;
  }

  function lineText(l) { return l.items.map(function (i) { return i.s; }).join(''); }

  /* 첫 쪽: 요약 수치와 문서 정보(개인정보 칸은 읽지 않음) */
  function summary(L) {
    var out = { rate: null, total: null, suspect: null, hi: null, mid: null, low: null, docName: '', date: '' };
    for (var i = 0; i < L.length; i++) {
      var t = lineText(L[i]).replace(/\s+/g, '');
      if (/AI작성률/.test(t) && /전체영역/.test(t) && /높음/.test(t)) {
        for (var j = i + 1; j < L.length && j < i + 4; j++) {
          var nums = lineText(L[j]).match(/\d+(?:\.\d+)?%?/g) || [];
          if (nums.length >= 6) {
            out.rate = parseFloat(nums[0]); out.total = +nums[1]; out.suspect = +nums[2]; out.hi = +nums[3]; out.mid = +nums[4]; out.low = +nums[5];
            break;
          }
        }
      }
      var raw = lineText(L[i]);
      var dm = /문서명\s*(.+)$/.exec(raw); if (dm && !out.docName) out.docName = dm[1].trim();
      var dd = /검사일자\s*(\d{4}\.\d{1,2}\.\d{1,2}(?:\s+\d{1,2}:\d{2})?)/.exec(raw); if (dd && !out.date) out.date = dd[1];
    }
    if (out.rate == null) {   // 줄이 다르게 묶인 경우: 첫 쪽 글에서 순서대로
      var all = L.map(lineText).join(' ').replace(/\s+/g, ' ');
      var m = /분석\s?정보.*?AI\s?작성률.*?낮음\s+(\d+(?:\.\d+)?)%\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/.exec(all);
      if (m) { out.rate = parseFloat(m[1]); out.total = +m[2]; out.suspect = +m[3]; out.hi = +m[4]; out.mid = +m[5]; out.low = +m[6]; }
    }
    return out;
  }

  /* 굵은 글씨(의심 영역) 글꼴과 보통 글꼴: 첫 쪽 제목 글꼴과 칸 이름 글꼴로 정함 */
  function fonts(L1) {
    var bold = '', reg = '';
    L1.forEach(function (l) {
      l.items.forEach(function (it) {
        var s = it.s.replace(/\s+/g, '');
        if (!bold && /(결과확인서|AI생성검사)$/.test(s)) bold = it.f;
        if (!reg && /^(검사번호|문서명|검사유형|발급일자|검사일자)$/.test(s)) reg = it.f;
      });
    });
    return { bold: bold, reg: reg };
  }

  function parse(pages) {   // pages: [{ items, height }] 쪽마다 pdf.js 글 조각
    var P = pages.map(function (pg) { return { L: lineGroups(pg.items), H: pg.height || 842 }; });
    if (!P.length) return null;
    var S = summary(P[0].L), F = fonts(P[0].L);
    /* 본문 범위: 'AI 의심 결과' 제목 아래, 쪽 아래 안내문 위 */
    var text = '', spans = [], cur = null, started = false, prevY = null, gaps = [], label = null, region = 0, lastFlag = false;
    var bodyX = null;
    P.forEach(function (pg, pi) {
      var L = pg.L, startIdx = 0, endIdx = L.length;
      for (var i = 0; i < L.length; i++) {
        var lt = lineText(L[i]).replace(/\s+/g, '');
        if (/^AI의심결과$/.test(lt)) { startIdx = i + 1; started = true; }
        if (/^본결과확인서는/.test(lt) || /CopyrightsⓒMUHAYU/i.test(lt)) { endIdx = Math.min(endIdx, i); }
      }
      if (!started) return;
      var lines = L.slice(startIdx, endIdx);
      /* 등급 표시(왼쪽 여백의 높음 · 중간 · 낮음)와 본문 줄을 나눔 */
      var labels = [], body = [];
      lines.forEach(function (l) {
        var rest = [];
        l.items.forEach(function (it) { var s = it.s.trim(); if (LV[s] && (bodyX == null || it.x < bodyX - 12)) labels.push({ y: l.y, lv: LV[s] }); else rest.push(it); });
        if (rest.length) body.push({ y: l.y, h: l.h, items: rest });
      });
      if (bodyX == null) { var xs = body.map(function (l) { return l.items[0].x; }).sort(function (a, b) { return a - b; }); bodyX = xs.length ? xs[Math.floor(xs.length / 2)] : 70; }
      if (pi > 0 && prevY != null) { prevY = null; if (/[.?!)]$/.test(text)) text += ' '; }   // 쪽이 바뀌면 줄 간격 비교를 새로(문장이 끝났으면 띄움)
      body.forEach(function (l) {
        var lab = null;
        labels.forEach(function (b) { if (Math.abs(b.y - l.y) < l.h * 0.6) lab = b.lv; });
        if (lab) { label = lab; region++; }
        /* 문단 나눔: 앞 줄과 사이가 보통 줄 간격의 1.5배보다 넓으면 */
        if (prevY != null) {
          var g = prevY - l.y; gaps.push(g);
          var med = gaps.slice().sort(function (a, b) { return a - b; })[Math.floor(gaps.length / 2)];
          if (g > med * 1.5 && text && !/\n\n$/.test(text)) { text = text.replace(/\s+$/, '') + '\n\n'; }
        }
        prevY = l.y;
        var prevEnd = null;
        l.items.forEach(function (it) {
          var s = it.s;
          if (prevEnd != null && it.x > prevEnd + it.h * 0.25 && !/\s$/.test(text) && !/^\s/.test(s)) text += ' ';
          var flag = F.bold && it.f === F.bold && (!F.reg || F.bold !== F.reg);
          var a = text.length; text += s; var b = text.length;
          if (flag && s.trim()) {
            var newBlock = !cur || !lastFlag || cur.rg !== region;
            if (newBlock) { cur = { s: a, e: b, lv: label || 'low', rg: region }; spans.push(cur); }
            else cur.e = b;
            lastFlag = true;
          } else if (s.trim()) { lastFlag = false; }
          prevEnd = it.x + it.w;
        });
      });
    });
    /* 앞뒤 빈칸 정리 */
    spans.forEach(function (sp) {
      while (sp.s < sp.e && /\s/.test(text.charAt(sp.s))) sp.s++;
      while (sp.e > sp.s && /\s/.test(text.charAt(sp.e - 1))) sp.e--;
      sp.t = text.slice(sp.s, sp.e);
    });
    spans = spans.filter(function (sp) { return sp.e > sp.s; });
    text = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
    return { kind: 'copykiller', summary: S, text: text, spans: spans, regions: region, fonts: F, ok: !!(started && text.replace(/\s+/g, '').length > 20) };
  }

  /* 브라우저: 파일 → pdf.js → parse */
  /* pdf.js 위치: 배포본은 CH_CFG.pdfjs(CDN, 끝에 /), 미리보기는 사이트 안 assets/vendor/pdfjs/ */
  function pdfUrl(root, name) { var c = G.CH_CFG || {}; return c.pdfjs ? c.pdfjs + (name === 'cmaps/' ? '' : 'build/') + name : root + 'assets/vendor/pdfjs/' + name; }
  function loadPdfjs(root) {
    if (G.pdfjsLib) return Promise.resolve(G.pdfjsLib);
    var c = G.CH_CFG || {};
    return new Promise(function (ok, no) {
      var s = document.createElement('script'); s.src = pdfUrl(root, 'pdf.min.js'); s.async = true;
      if (c.pdfjs) { s.crossOrigin = 'anonymous'; if (c.pdfjsSri) s.integrity = c.pdfjsSri; }
      s.onload = function () { if (G.pdfjsLib) { G.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfUrl(root, 'pdf.worker.min.js'); ok(G.pdfjsLib); } else no(new Error('PDF 도구를 불러오지 못했어요.')); };
      s.onerror = function () { no(new Error('PDF 도구를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.')); };
      document.head.appendChild(s);
    });
  }
  function fromFile(file, root) {
    return file.arrayBuffer().then(function (ab) {
      return loadPdfjs(root).then(function (L) {
        if (!L.GlobalWorkerOptions.workerSrc) L.GlobalWorkerOptions.workerSrc = pdfUrl(root, 'pdf.worker.min.js');
        return L.getDocument({ data: new Uint8Array(ab), cMapUrl: pdfUrl(root, 'cmaps/'), cMapPacked: true, isEvalSupported: false, disableFontFace: true }).promise;
      });
    }).then(function (pdf) {
      return pdf.getPage(1).then(function (p1) { return p1.getTextContent(); }).then(function (tc1) {
        var first = tc1.items.map(function (i) { return i.str; }).join(' ');
        var kind = kindOf(first);
        if (kind !== 'ai') {
          try { pdf.destroy(); } catch (e) { /* 그대로 */ }
          if (kind === 'plag') return { kind: 'plagiarism', ok: false, rate: plagRate(first) };
          if (kind === 'other') return { kind: 'other', ok: false };
          return null;
        }
        var pages = [], N = Math.min(pdf.numPages, 400);
        var next = function (k) {
          if (k > N) return Promise.resolve();
          return pdf.getPage(k).then(function (pg) { var vp = pg.getViewport({ scale: 1 }); return pg.getTextContent().then(function (tc) { pages.push({ items: tc.items, height: vp.height }); return next(k + 1); }); });
        };
        return next(1).then(function () { try { pdf.destroy(); } catch (e) { /* 그대로 */ } return parse(pages); });
      });
    });
  }

  var API = { isCK: isCK, kindOf: kindOf, parse: parse, fromFile: fromFile };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.CHCK = API;
})(typeof window !== 'undefined' ? window : this);
