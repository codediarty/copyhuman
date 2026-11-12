/* 글 꺼내기 13.23 (2026.11.12)
   파일에서 글만 꺼내 검사 칸에 넣고, 휴머나이징한 글을 같은 형식의 파일로 다시 만듭니다.
   - 모두 이 브라우저 안에서 처리합니다. 파일은 서버로 보내지 않습니다(서버에는 검사할 글만 감).
   - 한글: .hwp(5.0, 복합 문서 + 압축 풀기) · .hwpx(묶음 + XML) / 워드: .docx / PDF(pdf.js) / 텍스트: .txt · .md(UTF-8 · UTF-16 · EUC-KR 자동)
   - 문단은 빈 줄(\n\n)로 나눕니다. 붙여 넣은 글과 같은 정리 규칙(canon)을 지나므로 같은 글은 같은 결과가 나옵니다.
   - 머리말 · 꼬리말 · 각주 · 미주 · 숨은 설명 · 지운 글(변경 추적)은 빼고 본문, 표, 글상자 글은 넣습니다.
   - 다시 만들기(13.23: 올린 확장자 그대로): .docx · .hwpx · .hwp 는 원본 파일에서 바뀐 문단의 글만 바꿔 서식 · 표 · 그림 · 각주를 그대로 두고,
     .pdf 는 다듬은 글을 새로 조판한 PDF 로(그림 · 표 배치는 옮기지 못함), .txt · .md 는 같은 텍스트로, 붙여 넣은 글은 새 .docx 로 만듭니다.
     .hwp 는 복합 문서를 풀어 본문 구역의 문단 글 레코드만 새로 쓰고 다시 묶습니다(나머지 바이트는 그대로). */
(function (G) {
  'use strict';
  var ROOT = (document.body && document.body.getAttribute('data-root')) || '/';
  var VER = (function () { var s = document.querySelector('script[src*="textin.js"]'); var m = s && /[?&]v=([\w.-]+)/.exec(s.getAttribute('src') || ''); return m ? m[1] : ''; })();
  var MAXB = 30 * 1024 * 1024, MAXC = 50000, MAXPDF = 300;
  var ACCEPT = '.hwp,.hwpx,.docx,.pdf,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  var W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  var MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
  var XMLNS = 'http://www.w3.org/XML/1998/namespace';

  function err(msg, code) { var e = new Error(msg); e.code = code || 'FILE'; return e; }

  /* ---------- 같은 규칙으로 정리(붙여 넣은 글 · 파일 글 공통) ---------- */
  function canon(t) {
    return String(t == null ? '' : t)
      .replace(/\r\n?/g, '\n')
      .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '')                  // 폭 없는 글자 · 줄 끝 하이픈
      .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000\t]/g, ' ')        // 여러 빈칸 · 탭 → 빈칸
      .replace(/[\u2028\u2029]/g, '\n')
      .replace(/ {2,}/g, ' ')                                           // 빈칸 여럿 → 하나
      .replace(/ *\n */g, '\n')                                         // 줄 앞뒤 빈칸
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+|\s+$/g, '');
  }
  var paraText = canon;   // 문단 하나도 같은 규칙

  /* ---------- 도구 불러오기 ---------- */
  var loaded = {};
  var VCFG = window.CH_CFG || {};
  var PDFJS = VCFG.pdfjs || '';   // 배포본: pdf.js CDN 주소(끝에 /). 비어 있으면 사이트 안 assets/vendor/pdfjs/
  function pdfUrl(name) { return PDFJS ? PDFJS + (name === 'cmaps/' ? '' : 'build/') + name : ROOT + 'assets/vendor/pdfjs/' + name; }
  function script(src, test, sri) {
    if (test()) return Promise.resolve(test());
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (ok, no) {
      var abs = /^https:\/\//.test(src);
      var s = document.createElement('script'); s.src = abs ? src : ROOT + src + (VER ? '?v=' + VER : ''); s.async = true;
      if (abs) { s.crossOrigin = 'anonymous'; if (sri) s.integrity = sri; }
      s.onload = function () { var v = test(); if (v) ok(v); else no(err('파일을 여는 도구를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'LOAD')); };
      s.onerror = function () { loaded[src] = null; no(err('파일을 여는 도구를 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.', 'LOAD')); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  function jszip() { return script('assets/vendor/jszip.min.js', function () { return window.JSZip; }); }
  function pdfjs() {
    return script(PDFJS ? pdfUrl('pdf.min.js') : 'assets/vendor/pdfjs/pdf.min.js', function () { return window.pdfjsLib; }, VCFG.pdfjsSri).then(function (L) {
      L.GlobalWorkerOptions.workerSrc = pdfUrl('pdf.worker.min.js') + (!PDFJS && VER ? '?v=' + VER : '');
      return L;
    });
  }
  function fflate() { return script(VCFG.fflate || 'assets/vendor/fflate.min.js', function () { return window.fflate; }, VCFG.fflateSri); }

  /* ---------- 파일 종류(이름보다 내용으로) ---------- */
  function head(u8, s) { for (var i = 0; i < s.length; i++) if (u8[i] !== s[i]) return false; return true; }
  function sniff(u8, name) {
    var ext = (/\.([a-z0-9]+)$/i.exec(name || '') || [])[1]; ext = ext ? ext.toLowerCase() : '';
    if (head(u8, [0x50, 0x4B, 0x03, 0x04])) return ext === 'hwpx' ? 'hwpx' : ext === 'docx' ? 'docx' : 'zip';
    if (head(u8, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])) return 'cfb';
    if (head(u8, [0x25, 0x50, 0x44, 0x46, 0x2D])) return 'pdf';
    if (asc(u8, 0, 17) === 'HWP Document File') return 'hwp3';
    if (asc(u8, 0, 5) === '{\\rtf') return 'rtf';
    if (/^(txt|md|markdown|text|csv)$/.test(ext)) return 'txt';
    if (/^(hwp|hwpx|docx|pdf)$/.test(ext)) return 'bad';   // 이름은 그런데 내용이 다름
    if (/^(doc|ppt|pptx|xls|xlsx|odt|pages|key|jpg|jpeg|png|gif|heic|webp|zip|hwt|show|cell)$/.test(ext)) return ext;
    return looksText(u8) ? 'txt' : 'unknown';
  }
  function asc(u8, a, b) { var s = ''; for (var i = a; i < b && i < u8.length; i++) s += String.fromCharCode(u8[i]); return s; }
  function looksText(u8) { var n = Math.min(u8.length, 4096), bad = 0; for (var i = 0; i < n; i++) { var c = u8[i]; if (c === 0 && !(i % 2)) { /* UTF-16 일 수 있음 */ } else if (c < 9 || (c > 13 && c < 32 && c !== 27)) bad++; } return bad < n * 0.02; }

  /* ---------- 텍스트(인코딩 자동) ---------- */
  function decodeText(u8) {
    if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) return new TextDecoder('utf-8').decode(u8.subarray(3));
    if (u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder('utf-16le').decode(u8.subarray(2));
    if (u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder('utf-16be').decode(u8.subarray(2));
    var z0 = 0, z1 = 0, n = Math.min(u8.length, 2000); for (var i = 0; i < n; i++) { if (!u8[i]) { if (i % 2) z1++; else z0++; } }
    if (z1 > n / 8 && z0 < n / 50) return new TextDecoder('utf-16le').decode(u8);
    if (z0 > n / 8 && z1 < n / 50) return new TextDecoder('utf-16be').decode(u8);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { /* UTF-8 이 아니면 */ }
    try { return new TextDecoder('euc-kr').decode(u8); } catch (e2) { return new TextDecoder('utf-8').decode(u8); }
  }

  /* ---------- 문단 목록 → 글 ---------- */
  function joinParas(list) {   // list: [{text}] → 빈 문단을 빼고 빈 줄로 이음. 각 문단에 글 속 위치(at)
    var out = [], keep = [];
    list.forEach(function (p) { var t = paraText(p.text); p.clean = t; if (t) { keep.push(p); out.push(t); } });
    return { text: out.join('\n\n'), paras: keep };
  }

  /* ---------- 워드 .docx ---------- */
  function isIn(el, ns, name, stop) { for (var p = el.parentNode; p && p !== stop; p = p.parentNode) if (p.localName === name && (!ns || p.namespaceURI === ns)) return true; return false; }
  function docxRunsText(p) {   // 이 문단의 글(안에 든 다른 문단 · 지운 글 · 대체 그림 속 글은 뺌)
    var s = '';
    (function walk(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType !== 1) continue;
        var ln = c.localName, ns = c.namespaceURI;
        if (ns === W && ln === 'p') continue;                          // 글상자 속 문단은 따로
        if (ns === MC && ln === 'Fallback') continue;                  // 같은 내용의 예전 모양
        if (ns === W && (ln === 'del' || ln === 'moveFrom' || ln === 'delText' || ln === 'instrText' || ln === 'rPr' || ln === 'pPr' || ln === 'footnoteReference' || ln === 'endnoteReference' || ln === 'commentReference')) continue;
        if (ns === W && ln === 't') { s += c.textContent; continue; }
        if (ns === W && ln === 'tab') { s += ' '; continue; }
        if (ns === W && (ln === 'br' || ln === 'cr')) { var ty = c.getAttributeNS(W, 'type') || c.getAttribute('w:type'); s += ty === 'page' || ty === 'column' ? ' ' : '\n'; continue; }
        if (ns === W && ln === 'noBreakHyphen') { s += '-'; continue; }
        if (ns === W && ln === 'sym') continue;
        walk(c);
      }
    })(p);
    return s;
  }
  function docxRead(u8) {
    return jszip().then(function (Z) { return Z.loadAsync(u8); }).then(function (z) {
      var f = z.file('word/document.xml'); if (!f) throw err('워드 문서에서 본문을 찾지 못했어요. 파일이 손상되지 않았는지 확인해 주세요.');
      return f.async('string').then(function (xml) {
        var dom = new DOMParser().parseFromString(xml, 'application/xml');
        if (dom.getElementsByTagName('parsererror').length) throw err('워드 문서를 읽지 못했어요. 파일이 손상되지 않았는지 확인해 주세요.');
        var body = dom.getElementsByTagNameNS(W, 'body')[0]; if (!body) throw err('워드 문서에서 본문을 찾지 못했어요.');
        var ps = body.getElementsByTagNameNS(W, 'p'), list = [];
        for (var i = 0; i < ps.length; i++) { var p = ps[i]; if (isIn(p, MC, 'Fallback', body) || isIn(p, W, 'del', body)) continue; list.push({ el: p, text: docxRunsText(p) }); }
        var J = joinParas(list);
        return { text: J.text, doc: { kind: 'docx', zip: z, path: 'word/document.xml', dom: dom, paras: J.paras } };
      });
    });
  }

  /* ---------- 한글 .hwpx ---------- */
  var HWPX_SKIP = { header: 1, footer: 1, footNote: 1, endNote: 1, hiddenComment: 1, memo: 1, masterPage: 1 };
  function hwpxSkip(el, stop) { for (var p = el.parentNode; p && p !== stop; p = p.parentNode) if (HWPX_SKIP[p.localName]) return true; return false; }
  function hwpxOwnTs(p) {   // 이 문단(hp:p)에 바로 든 hp:t 들(표 · 글상자 속 문단은 그 문단 몫)
    var out = [], all = p.getElementsByTagNameNS('*', 't');
    for (var i = 0; i < all.length; i++) {
      var t = all[i], q = t.parentNode;
      while (q && q !== p && q.localName !== 'p') q = q.parentNode;
      if (q === p && t.parentNode && t.parentNode.localName === 'run') out.push(t);
    }
    return out;
  }
  function hwpxTText(t, st) {   // st.del: 변경 추적의 지운 글 안인지(문단을 넘어 이어짐)
    var s = '';
    for (var c = t.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3 || c.nodeType === 4) { if (!st.del) s += c.nodeValue; continue; }
      if (c.nodeType !== 1) continue;
      var ln = c.localName;
      if (ln === 'deleteBegin') { st.del = true; continue; }
      if (ln === 'deleteEnd') { st.del = false; continue; }
      if (st.del) continue;
      if (ln === 'tab' || ln === 'fwSpace' || ln === 'nbSpace') s += ' ';
      else if (ln === 'lineBreak') s += '\n';
      else if (ln === 'hyphen') s += '-';
      // titleMark · markpen · insertBegin/End · metaTag 등은 글이 아님
    }
    return s;
  }
  function hwpxRead(u8) {
    return jszip().then(function (Z) { return Z.loadAsync(u8); }).then(function (z) {
      var fs = z.file(/^Contents\/section\d+\.xml$/i).sort(function (a, b) { return (+(/(\d+)\.xml$/i.exec(a.name) || [])[1]) - (+(/(\d+)\.xml$/i.exec(b.name) || [])[1]); });
      if (!fs.length) throw err('한글 문서에서 본문을 찾지 못했어요. 파일이 손상되지 않았는지 확인해 주세요.');
      return Promise.all(fs.map(function (f) { return f.async('string'); })).then(function (xs) {
        var list = [], doms = [], st = { del: false };
        xs.forEach(function (xml, k) {
          var dom = new DOMParser().parseFromString(xml, 'application/xml');
          if (dom.getElementsByTagName('parsererror').length) throw err('한글 문서를 읽지 못했어요. 파일이 손상되지 않았는지 확인해 주세요.');
          doms.push({ path: fs[k].name, dom: dom });
          var ps = dom.getElementsByTagNameNS('*', 'p'), root = dom.documentElement;
          for (var i = 0; i < ps.length; i++) {
            var p = ps[i]; if (hwpxSkip(p, root)) continue;
            var ts = hwpxOwnTs(p), s = '';
            ts.forEach(function (t) { s += hwpxTText(t, st); });
            list.push({ el: p, sec: k, text: s });
          }
        });
        var J = joinParas(list);
        return { text: J.text, doc: { kind: 'hwpx', zip: z, doms: doms, paras: J.paras } };
      });
    });
  }

  /* ---------- 한글 .hwp(5.0): 복합 문서(CFB) ---------- */
  function cfb(u8) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var u16 = function (o) { return dv.getUint16(o, true); }, u32 = function (o) { return dv.getUint32(o, true); };
    var ss = 1 << u16(30), mss = 1 << u16(32), nFat = u32(44), dir0 = u32(48), cut = u32(56), mf0 = u32(60), nMf = u32(64), dif0 = u32(68), nDif = u32(72);
    if (ss !== 512 && ss !== 4096) throw err('한글 파일 구조를 읽지 못했어요.');
    var nSec = Math.floor((u8.length - ss) / ss) + 1;
    var sec = function (n) { var o = (n + 1) * ss; if (o + ss > u8.length + ss || o >= u8.length) throw err('한글 파일이 잘렸거나 손상됐어요.'); return u8.subarray(o, Math.min(o + ss, u8.length)); };
    var difat = [], i, j;
    for (i = 0; i < 109 && difat.length < nFat; i++) difat.push(u32(76 + i * 4));
    var d = dif0, guard = 0;
    while (difat.length < nFat && d < 0xFFFFFFFA && guard++ < nSec) {
      var b = sec(d), bv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      for (j = 0; j < ss / 4 - 1 && difat.length < nFat; j++) difat.push(bv.getUint32(j * 4, true));
      d = bv.getUint32(ss - 4, true);
    }
    var fat = new Uint32Array(nFat * ss / 4);
    difat.forEach(function (s, k) { var b = sec(s); for (var q = 0; q < ss / 4; q++) fat[k * ss / 4 + q] = (b[q * 4] | (b[q * 4 + 1] << 8) | (b[q * 4 + 2] << 16) | (b[q * 4 + 3] << 24)) >>> 0; });
    function chain(start, table, limit) { var out = [], n = start, g = 0; while (n < 0xFFFFFFFA && g++ < limit) { out.push(n); n = table[n]; if (n === undefined) break; } return out; }
    function readBig(start, size) {
      var ch = chain(start, fat, nSec + 1), out = new Uint8Array(size || ch.length * ss), o = 0;
      for (var k = 0; k < ch.length && o < out.length; k++) { var b = sec(ch[k]), take = Math.min(b.length, out.length - o); out.set(b.subarray(0, take), o); o += take; }
      return o < out.length ? out.subarray(0, o) : out;
    }
    var dirB = readBig(dir0, 0), ents = [];
    for (i = 0; i + 128 <= dirB.length; i += 128) {
      var e = new DataView(dirB.buffer, dirB.byteOffset + i, 128), nl = e.getUint16(64, true), nm = '';
      for (j = 0; j + 1 < nl - 2 && j < 64; j += 2) nm += String.fromCharCode(e.getUint16(j, true));
      ents.push({ i: ents.length, name: nm, type: e.getUint8(66), l: e.getUint32(68, true), r: e.getUint32(72, true), c: e.getUint32(76, true), start: e.getUint32(116, true), size: e.getUint32(120, true) });
    }
    var root = ents[0]; if (!root || root.type !== 5) throw err('한글 파일 구조를 읽지 못했어요.');
    var miniFat = new Uint32Array(0), mini = new Uint8Array(0);
    if (nMf && mf0 < 0xFFFFFFFA) { var mfB = readBig(mf0, 0); miniFat = new Uint32Array(mfB.length / 4); for (i = 0; i < miniFat.length; i++) miniFat[i] = (mfB[i * 4] | (mfB[i * 4 + 1] << 8) | (mfB[i * 4 + 2] << 16) | (mfB[i * 4 + 3] << 24)) >>> 0; }
    if (root.start < 0xFFFFFFFA) mini = readBig(root.start, root.size);
    function readMini(start, size) { var ch = chain(start, miniFat, miniFat.length + 1), out = new Uint8Array(size), o = 0; for (var k = 0; k < ch.length && o < size; k++) { var a = ch[k] * mss, take = Math.min(mss, size - o); out.set(mini.subarray(a, a + take), o); o += take; } return o < size ? out.subarray(0, o) : out; }
    var paths = {};
    (function walk(id, pre, depth) {   // 형제(왼쪽 · 오른쪽)와 아래(자식)를 따라 전체 경로
      if (id >= ents.length || id === 0xFFFFFFFF || depth > 64) return;
      var e = ents[id]; if (!e || e.seen) return; e.seen = 1;
      walk(e.l, pre, depth + 1);
      var p = pre + e.name; paths[p] = e; e.path = p;
      if (e.type === 1) walk(e.c, p + '/', depth + 1);
      walk(e.r, pre, depth + 1);
    })(root.c, '', 0);
    return {
      has: function (p) { return !!paths[p]; },
      list: function (re) { return Object.keys(paths).filter(function (p) { return re.test(p) && paths[p].type === 2; }); },
      read: function (p) { var e = paths[p]; if (!e || e.type !== 2) return null; return e.size < cut ? readMini(e.start, e.size) : readBig(e.start, e.size); },
      _w: { u8: u8, ss: ss, mss: mss, cut: cut, dirB: dirB, ents: ents }   // 다시 묶을 때(cfbWrite)
    };
  }
  function inflateRaw(u8) {
    if (typeof DecompressionStream === 'function') {
      try {
        var ds = new DecompressionStream('deflate-raw');
        return new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer().then(function (b) { return new Uint8Array(b); })
          .catch(function () { return fflate().then(function (F) { return F.inflateSync(u8); }); });
      } catch (e) { /* deflate-raw 를 모르는 브라우저 */ }
    }
    return fflate().then(function (F) { return F.inflateSync(u8); });
  }
  var HWP_SKIP = { 'head': 1, 'foot': 1, 'fn  ': 1, 'en  ': 1, 'tcmt': 1 };   // 머리말 · 꼬리말 · 각주 · 미주 · 숨은 설명
  function hwpParas(u8, list, sec) {   // 레코드: 꼬리표 10비트 · 단계 10비트 · 크기 12비트. 문단마다 머리 레코드 자리(at)와 구역 번호(sec)
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), o = 0, skipLv = -1, cur = null;
    while (o + 4 <= u8.length) {
      var r0 = o, h = dv.getUint32(o, true), tag = h & 0x3FF, lv = (h >>> 10) & 0x3FF, size = (h >>> 20) & 0xFFF; o += 4;
      if (size === 0xFFF) { if (o + 4 > u8.length) break; size = dv.getUint32(o, true); o += 4; }
      if (o + size > u8.length) break;
      if (skipLv >= 0) { if (lv > skipLv) { o += size; continue; } skipLv = -1; }
      if (tag === 71 && size >= 4) {   // CTRL_HEADER
        var id = dv.getUint32(o, true), cid = String.fromCharCode((id >>> 24) & 255, (id >>> 16) & 255, (id >>> 8) & 255, id & 255);
        if (HWP_SKIP[cid]) skipLv = lv;
      } else if (tag === 66) {          // PARA_HEADER: 새 문단
        cur = { text: '', at: r0, sec: sec || 0 }; list.push(cur);
      } else if (tag === 67 && cur) {   // PARA_TEXT
        var s = '', n = size >> 1;
        for (var i = 0; i < n; i++) {
          var c = dv.getUint16(o + i * 2, true);
          if (c >= 32) { s += String.fromCharCode(c); continue; }
          if (c === 9) { s += ' '; i += 7; }                   // 탭(8칸 차지)
          else if (c === 10) s += '\n';                        // 줄 바꿈
          else if (c === 24) s += '-';
          else if (c === 30 || c === 31) s += ' ';             // 묶음 빈칸 · 고정폭 빈칸
          else if (c === 0 || c === 13 || (c >= 25 && c <= 29)) { /* 글자 하나짜리 조종 문자 */ }
          else i += 7;                                         // 그 밖의 조종 문자(표 · 그림 · 필드 등)는 8칸
        }
        cur.text += s.replace(/\uF53A/g, '\uD55C');   // 한글 프로그램의 '한' 글꼴 기호
      }
      o += size;
    }
  }
  function hwpRead(u8) {
    var C = cfb(u8);
    var fh = C.read('FileHeader');
    if (!fh || asc(fh, 0, 17) !== 'HWP Document File') throw err('한글 파일 머리를 읽지 못했어요. 파일이 손상되지 않았는지 확인해 주세요.');
    var prop = fh[36] | (fh[37] << 8) | (fh[38] << 16) | (fh[39] << 24);
    if (prop & 2) throw err('암호가 걸린 한글 파일은 열 수 없어요. 한글에서 암호를 풀고 저장한 뒤 다시 올려 주세요.', 'LOCKED');
    if (prop & 4) throw err('배포용(읽기 전용) 한글 문서는 글을 꺼낼 수 없어요. 글을 복사해 붙여 넣어 주세요.', 'LOCKED');
    var secs = C.list(/^BodyText\/Section\d+$/).sort(function (a, b) { return (+a.replace(/\D/g, '')) - (+b.replace(/\D/g, '')); });
    if (!secs.length) throw err('한글 파일에서 본문을 찾지 못했어요.');
    var zip = !!(prop & 1), list = [], bufs = [];
    return secs.reduce(function (p, name, k) {
      return p.then(function () { var raw = C.read(name); return zip ? inflateRaw(raw) : raw; }).then(function (b) { bufs.push({ name: name, buf: b }); hwpParas(b, list, k); });
    }, Promise.resolve()).then(function () {
      var J = joinParas(list);
      return { text: J.text, doc: { kind: 'hwp', C: C, u8: u8, zip: zip, secs: bufs, paras: J.paras } };
    }, function (e) { throw e && e.code ? e : err('한글 파일의 압축을 풀지 못했어요. 파일이 손상되지 않았는지 확인해 주세요.'); });
  }

  /* ---------- PDF(글자가 든 PDF) ---------- */
  var END_RE = /[.!?。？！…:;)\]"'”’」』]$/;
  function pdfRead(u8) {
    return pdfjs().then(function (L) {
      return L.getDocument({ data: u8, cMapUrl: pdfUrl('cmaps/'), cMapPacked: true, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false }).promise;
    }).catch(function (e) {
      if (e && e.name === 'PasswordException') throw err('암호가 걸린 PDF는 열 수 없어요. 암호를 푼 PDF나 원본 파일을 올려 주세요.', 'LOCKED');
      throw e && e.code ? e : err('PDF를 열지 못했어요. 파일이 손상되지 않았는지 확인해 주세요.');
    }).then(function (pdf) {
      var N = Math.min(pdf.numPages, MAXPDF), pages = [], total = 0, FONT = pdfFont();
      var next = function (k) {
        if (k > N || total > MAXC * 1.2) return Promise.resolve();
        return pdf.getPage(k).then(function (pg) { return pg.getTextContent(); }).then(function (tc) { var lines = pdfLines(tc.items, FONT); pages.push(lines); lines.forEach(function (l) { total += l.t.length; }); return next(k + 1); });
      };
      return next(1).then(function () { var t = pdfParas(pages); try { pdf.destroy(); } catch (e) { /* 그대로 */ } return t; });
    }).then(function (text) {
      var plain = text.replace(/\s+/g, '');
      if (plain.length < 20) throw err('이 PDF에는 꺼낼 글자가 없어요(스캔한 문서이거나 그림으로 된 PDF). 원본 파일(한글 · 워드)을 올리거나 글을 붙여 넣어 주세요.', 'EMPTY');
      var bad = (plain.match(/[\uE000-\uF8FF\uFFFD]/g) || []).length;
      if (bad > plain.length * 0.05) throw err('이 PDF는 글꼴 정보가 없어 글자를 바르게 꺼낼 수 없어요. 원본 파일(한글 · 워드)을 올리거나 글을 붙여 넣어 주세요.', 'GARBLED');
      return { text: text, doc: null };
    });
  }
  var HAN = /[가-힣ㄱ-ㆎ]/, LAT = /[A-Za-z0-9%]/, MK = String.fromCharCode(1), MKG = new RegExp(MK, 'g');
  var CLOSE = /[,.!?;:)\]}」』”’…]/;
  var PAGENUM = /^[-\u2013\u2014\s(]*\d{1,4}\s*(\/\s*\d{1,4})?[-\u2013\u2014\s)]*$/;
  var LIST_RE = /^([0-9]{1,2}[.)]\s|[가-하][.)]\s|[①-⑳]|[-•·▪■□○●◦※*]\s)/;
  function fsOf(it) { var tr = it.transform || [1, 0, 0, 1, 0, 0]; return Math.abs(tr[3]) || Math.abs(tr[0]) || it.height || 10; }
  function pct(a, p) { if (!a || !a.length) return null; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.min(b.length - 1, Math.floor(b.length * p))]; }
  function pdfFont() { return { hp: {}, an: {}, rs: [] }; }
  function itemSp(F, it, fs) {   // 한글과 빈칸만 든 조각에서 빈칸 하나의 너비(em, 양쪽 정렬로 늘어난 만큼까지)
    var s = it.str, a = F.an[it.fontName];
    if (!a || !(it.width > 0) || !/^[가-힣 ]+$/.test(s) || / {2}/.test(s)) return null;
    var nS = s.split(' ').length - 1, nH = s.length - nS;
    if (!nS || nH < 2) return null;
    var v = (it.width / fs - nH * a) / nS;
    return v > 0.1 && v < 1.5 ? v : null;
  }   // 문서 전체: 한글 한 글자 너비(글꼴마다, 늘어나지 않은 값) · 한글 쪽 빈칸 너비(em)
  function pdfLines(items, F) {   // 글 조각 → 줄(같은 높이끼리). 줄마다 왼쪽 · 오른쪽 위치, 글자 크기, 넓은 틈(표 칸 · 탭) 수
    F = F || pdfFont();
    items.forEach(function (it) {   // 한글만 든 조각으로 한글 한 글자 너비. 양쪽 정렬로 늘어난 줄도 있으니 아래쪽 10%를 제 너비로
      var s = it && it.str;
      if (typeof s !== 'string' || !(it.width > 0) || !/^[가-힣]{2,}$/.test(s)) return;
      var h = F.hp[it.fontName] = F.hp[it.fontName] || []; if (h.length < 3000) h.push(it.width / s.length / fsOf(it));
    });
    Object.keys(F.hp).forEach(function (k) { F.an[k] = pct(F.hp[k], 0.1); });
    var lines = [], cur = null, pend = null;   // pend: 아직 넣지 않은 빈칸(다음 글자를 보고 정함)
    var close = function () {
      if (!cur) return;
      var ec = cur.ec.length ? Math.max(0, pct(cur.ec, 0.5)) : 0;   // 이 줄에서 글자마다 늘어난 너비(양쪽 정렬)
      cur.gp.forEach(function (q) { var g = q.em - ec; if (!q.hl && g >= 0.16 && g < 1.2 && F.rs.length < 3000) F.rs.push(g); });
      if (cur.gp.length) {
        // 잰 틈마다 빈칸인지 정함(양쪽 정렬로 글자마다 늘어난 만큼은 뺌). 0.15em보다 좁으면 빈칸이 아님(글자 사이를 벌린 것).
        // 한글과 영문 · 숫자 사이가 0.2em 안팎이면 글자 사이 자동 간격(빈칸이 아님): 2026 년 → 2026년, 실제로 2026 은 그대로.
        // 이 문서의 빈칸이 원래 0.215em보다 좁으면(좁은 글꼴) 자동 간격과 구별할 수 없어 빈칸으로 둠
        // 이 줄의 빈칸 너비(rl): 한글과 빈칸만 든 조각에서 재거나, 한글 쪽 잰 빈칸으로. 양쪽 정렬로 빈칸이 늘면 자동 간격도 조금(약 0.45배) 늘어남
        if (F.rs.length >= 3 && F.rs.length !== F.rsN) { F.rn = pct(F.rs, 0.1); F.rsN = F.rs.length; }   // 문서의 원래 빈칸 너비(새 값이 생길 때만 다시 셈)
        var rn = F.rs.length >= 3 ? F.rn : null, auto = rn == null || rn >= 0.215, base = rn != null ? rn : 0.222, k = 0;
        var rl = cur.sp.length ? pct(cur.sp, 0.5) : null;
        if (rl == null) { var o = cur.gp.filter(function (q) { return !q.hl && q.em - ec >= 0.16; }).map(function (q) { return q.em - ec; }); if (o.length) rl = pct(o, 0.5); }
        if (rl == null || rl < base) rl = base;
        var thr = 0.2 + 0.25 * (rl - base) + Math.min(0.03, Math.max(0.008, (base - 0.2) / 2));   // 시험 문서 121곳에서 맞춘 값(여유 0.009em)
        cur.t = cur.t.replace(MKG, function () { var q = cur.gp[k++], g = q.em - ec; return g < 0.16 || (q.hl && auto && g < thr) ? '' : ' '; });
      }
      lines.push(cur); cur = null; pend = null;
    };
    var push = function (s) {
      if (pend) {
        var a = cur.t.slice(-1), b = s.charAt(0), em = pend.w / cur.fs;
        if (pend.real) cur.t += ' ';   // 조각 안에 든 빈칸
        else if (CLOSE.test(b) && em < 0.5) { /* 닫는 문장 부호 앞 좁은 틈은 빈칸이 아님(양쪽 정렬로 벌어진 것) */ }
        else { cur.t += MK; cur.gp.push({ em: em, hl: (HAN.test(a) && LAT.test(b)) || (LAT.test(a) && HAN.test(b)) }); }   // 잰 틈: 줄 끝에서 정함
        if (em > 1.8) cur.tab++;
        pend = null;
      }
      cur.t += s;
    };
    items.forEach(function (it) {
      if (!it || typeof it.str !== 'string') return;
      var tr = it.transform || [1, 0, 0, 1, 0, 0], x = tr[4], y = tr[5], fs = fsOf(it), s = it.str, w = it.width || s.length * fs * 0.5;
      if (!s && !it.hasEOL) return;
      if (cur && (Math.abs(y - cur.y) > fs * 0.5 || x < cur.x1 - fs * 4)) close();
      if (!cur) cur = { t: '', x0: x, x1: x, y: y, fs: fs, ec: [], sp: [], gp: [], tab: 0 };
      if (s) {
        if (!s.trim()) { if (cur.t) pend = { w: Math.max(w, x - cur.x1 + w) }; cur.x1 = Math.max(cur.x1, x + w); }
        else {
          var gap = x - cur.x1, lead = /^\s/.test(s), an = F.an[it.fontName];
          if (an && it.width > 0 && /^[가-힣]+$/.test(s)) cur.ec.push(it.width / s.length / fs - an);
          var v = itemSp(F, it, fs); if (v != null) cur.sp.push(v);
          if (cur.t && !pend && !lead && !/\s$/.test(cur.t) && gap > fs * 0.15) pend = { w: gap };
          if (lead && cur.t) { pend = pend || { w: fs * 0.3, real: true }; s = s.replace(/^\s+/, ''); }
          if (cur.t) push(s);
          else { cur.t = s.replace(/^\s+/, ''); cur.x0 = x; cur.y = y; }   // 줄 앞 빈칸 조각은 왼쪽 끝으로 치지 않음(들여쓰기를 빈칸으로 한 글)
          if (/\s$/.test(cur.t)) { cur.t = cur.t.replace(/\s+$/, ''); pend = { w: fs * 0.3, real: true }; }
          cur.x1 = Math.max(cur.x1, x + w); cur.fs = Math.max(cur.fs, fs);
        }
      }
      if (it.hasEOL) close();
    });
    close();
    return lines.map(function (l) { l.t = l.t.replace(/\s+/g, ' ').trim(); return l; }).filter(function (l) { return l.t; });
  }
  function pdfCols(L) {   // 쪽 안의 단: 왼쪽 끝이 크게 떨어져 있고 앞 단과 겹치지 않는 줄 묶음(줄이 셋 넘게)
    var xs = L.map(function (l) { return l.x0; }).sort(function (a, b) { return a - b; });
    var W = Math.max.apply(null, L.map(function (l) { return l.x1; })) - xs[0], st = [xs[0]], ok = [xs[0]];
    for (var i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > W * 0.15) st.push(xs[i]);
    var colOf = function (l, S) { var k = 0; for (var j = 0; j < S.length; j++) if (l.x0 >= S[j] - 0.5) k = j; return k; };
    for (var j = 1; j < st.length; j++) {
      var lo = st[j], hi = j + 1 < st.length ? st[j + 1] : Infinity;
      var mine = L.filter(function (l) { return l.x0 >= lo - 0.5 && l.x0 < hi - 0.5; });
      var prev = L.filter(function (l) { return l.x0 < lo - 0.5 && colOf(l, ok) === ok.length - 1; });
      var pr = pct(prev.map(function (l) { return l.x1; }), 0.8);
      if (mine.length >= 3 && pr != null && pr <= lo + 1) ok.push(lo);
    }
    L.forEach(function (l) { l.col = colOf(l, ok); });
    return ok.map(function (s, k) {
      var mine = L.filter(function (l) { return l.col === k; });
      return { left: Math.min.apply(null, mine.map(function (l) { return l.x0; })), right: pct(mine.map(function (l) { return l.x1; }), 0.9), n: mine.length };
    });
  }
  var PCL = '은는이가을를의에로와과도만며고서요다게지';   // 낱말 끝에 자주 붙는 글자(줄 첫 글자면 앞 줄에 붙여 씀)
  function pdfParas(pages) {
    var np = pages.length, rep = {};   // 쪽마다 같은 자리(위 · 아래 두 줄)에 되풀이되는 머리 · 꼬리 줄
    if (np >= 2) pages.forEach(function (L) { var seen = {}; L.slice(0, 2).concat(L.slice(-2)).forEach(function (l) { var k = l.t.replace(/\d+/g, '#'); if (!seen[k]) { seen[k] = 1; rep[k] = (rep[k] || 0) + 1; } }); });
    var isRep = function (l) { var n = rep[l.t.replace(/\d+/g, '#')] || 0; return np >= 3 ? n > np / 2 : n === 2; };
    pages = pages.map(function (L) { return L.filter(function (l, i) { return !PAGENUM.test(l.t) && !((i < 2 || i >= L.length - 2) && isRep(l)); }); });
    var corpus = '\n' + pages.map(function (L) { return L.map(function (l) { return l.t; }).join('\n'); }).join('\n') + '\n';
    var count = function (s) { var n = 0, i = corpus.indexOf(s); while (i >= 0 && n < 50) { n++; i = corpus.indexOf(s, i + 1); } return n; };
    /* 줄 바꿈 자리 띄어쓰기: 같은 문서 안에서 붙어 나온 적(AB)과 따로 나온 적( B)을 견줌 */
    var J = [];   // 판단 근거가 있던 이음매(글자 단위 줄 나눔인지 알아보기)
    var cntW = function (s) { var n = 0, i = corpus.indexOf(s); while (i >= 0 && n < 50) { if (/^[\s.,!?;:)\]}」』"'”’…]?$/.test(corpus.charAt(i + s.length))) n++; i = corpus.indexOf(s, i + 1); } return n; };   // s 뒤가 낱말 끝인 것만
    function evid(a, b) {
      var A = a.split(' ').pop(), B = b.split(' ')[0]; if (!A || !B) return 0;
      var ab = cntW(A + B), sb = cntW(' ' + B) + cntW('\n' + B) - 1;
      if (ab > 0 && ab >= sb) return -1;   // 붙여 씀
      if (sb > 0 && !ab) return 1;          // 띄어 씀
      return 0;
    }
    pages.forEach(function (L) { L.forEach(function (l, i) { if (i && HAN.test(L[i - 1].t.slice(-1)) && HAN.test(l.t.charAt(0))) { var e = evid(L[i - 1].t, l.t); if (e) J.push(e); } }); });
    var charWrap = J.length ? J.filter(function (e) { return e < 0; }).length / J.length >= 0.25 : true;
    var openAtt = (corpus.match(/[가-힣A-Za-z0-9]\(/g) || []).length >= (corpus.match(/ \(/g) || []).length;   // 여는 괄호를 앞말에 붙여 쓰는 문서
    function fits(pv, l, right) {   // l 의 첫 낱말(글자 단위로 줄을 나누는 글이면 첫 글자)이 앞 줄 끝 빈자리에 들어갈 수 있었나 → 일부러 줄을 바꾼 것(문단 끝 · 제목 · 목록)
      var room = right - pv.x1; if (room <= l.fs * 0.8) return false;
      var w0 = l.t.split(' ')[0], need = 0;
      if (charWrap && HAN.test(w0.charAt(0))) need = l.fs;
      else for (var i = 0; i < w0.length; i++) need += HAN.test(w0.charAt(i)) ? l.fs : l.fs * 0.62;
      return room > need + l.fs * 0.55;
    }
    function join(buf, pv, l, right) {
      var a = buf.slice(-1), b = l.t.charAt(0);
      if (/[A-Za-z]-$/.test(buf) && /^[a-z]/.test(l.t)) return buf.slice(0, -1) + l.t;   // 영어 줄 끝 하이픈
      var filled = pv && right - pv.x1 < pv.fs * 1.2;
      if (CLOSE.test(b)) return buf + l.t;                                            // 줄 첫 글자가 닫는 문장 부호
      if (b === '(' && /[가-힣A-Za-z0-9]/.test(a)) return filled && openAtt ? buf + l.t : buf + ' ' + l.t;   // 이 문서에서 '이름(설명)'처럼 붙여 쓰면
      if ((HAN.test(a) && LAT.test(b)) || (LAT.test(a) && HAN.test(b))) {               // 한글과 영문 · 숫자 사이(2026 | 년, 7 | 천, 실제로 | 2026)
        var e1 = evid(buf, l.t);
        if (e1) return e1 < 0 ? buf + l.t : buf + ' ' + l.t;
        return filled && charWrap && LAT.test(a) ? buf + l.t : buf + ' ' + l.t;
      }
      if (!(HAN.test(a) && HAN.test(b))) return buf + ' ' + l.t;
      var e = evid(buf, l.t);
      if (e < 0) return buf + l.t;
      if (e > 0) return buf + ' ' + l.t;
      if (!filled) return buf + ' ' + l.t;                       // 줄 끝이 비어 있으면 낱말에서 넘어감
      if (PCL.indexOf(b) >= 0 && l.t.split(' ')[0].length <= 2) return buf + l.t;
      return charWrap ? buf + l.t : buf + ' ' + l.t;
    }
    var paras = [], buf = '', lastEnd = true, prev = null, prevRight = 0, RD = {};
    var flush = function () { if (buf.trim()) paras.push(buf.trim()); buf = ''; };
    pages.forEach(function (L) {
      if (!L.length) return;
      var CS = pdfCols(L);
      CS.forEach(function (c) {   // 줄이 적은 단(마지막 쪽 등)은 문서에서 본 같은 자리 단의 오른쪽 끝을 씀
        var key = Math.round(c.left / 8);
        if (c.n >= 5) RD[key] = Math.max(RD[key] || 0, c.right);
        else if (RD[key]) c.right = Math.max(c.right, RD[key]);
      });
      L.forEach(function (l, i) { l.tbl = !!(l.tab && ((i && L[i - 1].tab) || (L[i + 1] && L[i + 1].tab))); });   // 넓은 틈이 있는 줄이 이어지면 표
      var BR = {};   // 같은 단 · 같은 왼쪽 끝 줄 묶음의 오른쪽 끝(양쪽을 들여 쓴 인용 문단 등)
      L.forEach(function (l) { var k = l.col + ':' + Math.round(l.x0); (BR[k] = BR[k] || []).push(l.x1); });
      L.forEach(function (l) { var b = BR[l.col + ':' + Math.round(l.x0)], c = CS[l.col]; l.rr = b.length >= 2 ? Math.min(c.right, Math.max.apply(null, b)) : c.right; });
      var lgs = [], gs = [], i, g;   // 문단 안 줄 간격: 앞 줄이 꽉 차서 넘어간 곳의 간격
      for (i = 1; i < L.length; i++) {
        var a = L[i - 1], b = L[i]; g = a.y - b.y;
        if (a.col !== b.col || g <= 0) continue;
        gs.push(g);
        if (!a.tbl && !b.tbl && Math.abs(a.fs - b.fs) < 0.5 && !fits(a, b, a.rr)) lgs.push(g);
      }
      var lg = lgs.length ? pct(lgs, 0.5) : pct(gs, 0.25);
      L.forEach(function (l, i) {
        var c = CS[l.col], pv = i ? L[i - 1] : prev, newPara = false, ind = l.x0 - c.left > l.fs * 0.8, right = pv && i && pv.col === l.col ? pv.rr : c.right;
        if (!pv) newPara = true;
        else if (!i || pv.col !== l.col) {   // 쪽이나 단이 바뀜: 앞 줄에서 문장이 끝났고, 앞 줄이 비어서 끝났거나 이 줄을 들여 썼으면 새 문단
          right = i ? pv.rr : prevRight;
          newPara = (lastEnd && (fits(pv, l, right) || ind)) || l.tbl || !!pv.tbl;
        }
        else {
          var g = pv.y - l.y;
          if (g <= 0 || (lg && g > lg + Math.max(1.5, l.fs * 0.2))) newPara = true;          // 줄 사이가 더 벌어짐(문단 간격)
          else if (Math.abs(pv.fs - l.fs) > Math.max(1, l.fs * 0.12)) newPara = true;      // 글자 크기가 다르면(제목 · 본문)
          else if (l.tbl || pv.tbl) newPara = true;                                         // 표 줄
          else if (fits(pv, l, right)) newPara = true;                                      // 다음 낱말이 들어갈 자리가 있는데 줄을 바꿈
          else if (ind && END_RE.test(pv.t)) newPara = true;                                // 첫 줄 들여쓰기
          else if (LIST_RE.test(l.t) && (END_RE.test(pv.t) || right - pv.x1 > l.fs * 2)) newPara = true;   // 목록 줄
        }
        if (newPara) flush();
        buf = buf ? join(buf, pv, l, right) : l.t;
        lastEnd = END_RE.test(l.t);
      });
      prev = L[L.length - 1]; prevRight = prev.rr;
    });
    flush();
    return paras.join('\n\n');
  }

  /* ---------- 읽기(하나의 입구) ---------- */
  var KIND = { hwp: '한글', hwpx: '한글', docx: '워드', pdf: 'PDF', txt: '텍스트', md: '텍스트' };
  function read(file) {
    if (!file) return Promise.reject(err('파일을 고르지 않았어요.'));
    if (file.size > MAXB) return Promise.reject(err('30MB보다 큰 파일은 열지 않아요. 글을 복사해 붙여 넣어 주세요.', 'BIG'));
    if (!file.size) return Promise.reject(err('빈 파일이에요.', 'EMPTY'));
    var name = String(file.name || '파일');
    return (file.arrayBuffer ? file.arrayBuffer() : new Response(file).arrayBuffer()).then(function (ab) {
      var u8 = new Uint8Array(ab), k = sniff(u8, name), p;
      if (k === 'zip') {   // 이름이 달라도 속을 보고
        return jszip().then(function (Z) { return Z.loadAsync(u8); }).then(function (z) { return z.file('word/document.xml') ? docxRead(u8).then(tag('docx')) : z.file(/^Contents\/section\d+\.xml$/i).length ? hwpxRead(u8).then(tag('hwpx')) : Promise.reject(err('압축 파일 속에서 한글 · 워드 문서를 찾지 못했어요.')); });
      }
      if (k === 'docx') p = docxRead(u8).then(tag('docx'));
      else if (k === 'hwpx') p = hwpxRead(u8).then(tag('hwpx'));
      else if (k === 'cfb') {
        var C; try { C = cfb(u8); } catch (e) { return Promise.reject(e); }
        if (C.has('FileHeader')) p = hwpRead(u8).then(tag('hwp'));
        else if (C.has('WordDocument')) return Promise.reject(err('예전 워드 파일(.doc)은 바로 열지 못해요. 워드에서 .docx로 저장해 올리거나 글을 붙여 넣어 주세요.', 'TYPE'));
        else return Promise.reject(err('이 파일 형식은 열지 못해요. 한글(HWP, HWPX), 워드(DOCX), PDF, 텍스트 파일을 올려 주세요.', 'TYPE'));
      }
      else if (k === 'pdf') p = pdfRead(u8).then(tag('pdf'));
      else if (k === 'txt') p = Promise.resolve({ text: decodeText(u8), doc: null }).then(tag(/\.md$/i.test(name) ? 'md' : 'txt'));   // 붙여 넣은 글과 똑같이
      else if (k === 'hwp3') return Promise.reject(err('한글 97 이전 형식(.hwp 3.0)은 열지 못해요. 한글에서 다시 저장해 올려 주세요.', 'TYPE'));
      else if (k === 'doc') return Promise.reject(err('예전 워드 파일(.doc)은 바로 열지 못해요. 워드에서 .docx로 저장해 올리거나 글을 붙여 넣어 주세요.', 'TYPE'));
      else if (/^(jpg|jpeg|png|gif|heic|webp)$/.test(k)) return Promise.reject(err('사진 속 글은 꺼내지 않아요(이미지는 서버로 보내지 않습니다). 글을 붙여 넣거나 한글 · 워드 · PDF 파일을 올려 주세요.', 'TYPE'));
      else if (k === 'bad') return Promise.reject(err('파일 이름과 내용이 맞지 않아요. 파일이 손상되지 않았는지 확인해 주세요.', 'TYPE'));
      else return Promise.reject(err('이 파일 형식은 열지 못해요. 한글(HWP, HWPX), 워드(DOCX), PDF, 텍스트 파일을 올려 주세요.', 'TYPE'));
      return p;
      function tag(kind) { return function (r) { r.kind = kind; r.kindKo = KIND[kind] || ''; r.name = name; r.text = canon(r.text); if (!r.text.replace(/\s+/g, '')) throw err('파일에서 글을 찾지 못했어요. 글이 그림으로 들어 있지 않은지 확인해 주세요.', 'EMPTY'); r.chars = r.text.length; return r; }; }
    });
  }

  /* ---------- 다시 만들기: 바뀐 문단만 갈아 끼우기 ---------- */
  function bigrams(s) { var m = {}, ks = [], t = String(s).replace(/\s+/g, ''); for (var i = 0; i < t.length - 1; i++) { var k = t.substr(i, 2); if (m[k]) m[k]++; else { m[k] = 1; ks.push(k); } } return { m: m, k: ks, n: Math.max(0, t.length - 1) }; }
  function simB(A, B) { if (!A.n || !B.n) return 0; var s = A, l = B, hit = 0; if (A.k.length > B.k.length) { s = B; l = A; } for (var q = 0; q < s.k.length; q++) { var v = l.m[s.k[q]]; if (v) hit += Math.min(s.m[s.k[q]], v); } return 2 * hit / (A.n + B.n); }
  function sim(a, b) { if (a === b) return 1; return simB(bigrams(a), bigrams(b)); }
  function align(olds, news) {   // 문단 맞추기: 개수가 같으면 1:1, 다르면 비슷한 것끼리(빠진 문단은 지움). 13.23: 대각선 둘레만 보고 글자 쌍은 한 번만 세어 빠르게
    var n = olds.length, m = news.length, i, j;
    if (n === m) return olds.map(function (o, k) { return [k, k]; });
    var band = Math.abs(n - m) + 60, Wd = 2 * band + 1;
    if ((n + 1) * Wd > 6000000) return null;
    var bo = olds.map(bigrams), bn = news.map(bigrams), S = new Float64Array((n + 1) * Wd), Bk = new Uint8Array((n + 1) * Wd);
    var lo = function (r) { return Math.max(0, Math.round(r * m / Math.max(1, n)) - band); };   // 이 줄에서 보는 첫 칸(그 밖은 0)
    var get = function (r, c) { var q = c - lo(r); return q >= 0 && q < Wd ? S[r * Wd + q] : 0; };
    var sm = function (a, b) { if (olds[a] === news[b]) return 1; var A = bo[a], B = bn[b]; if (2 * Math.min(A.n, B.n) < 0.3 * (A.n + B.n)) return 0; return simB(A, B); };
    for (i = 1; i <= n; i++) {
      var l0 = lo(i), j1 = Math.min(m, l0 + Wd - 1);
      for (j = Math.max(1, l0); j <= j1; j++) {
        var d = get(i - 1, j - 1) + sm(i - 1, j - 1) - 0.3, u = get(i - 1, j), l = get(i, j - 1), q = i * Wd + (j - l0);
        if (d >= u && d >= l) { S[q] = d; Bk[q] = 1; } else if (u >= l) { S[q] = u; Bk[q] = 2; } else { S[q] = l; Bk[q] = 3; }
      }
    }
    var out = []; i = n; j = m;
    while (i > 0 && j > 0) { var qq = j - lo(i), b = qq >= 0 && qq < Wd ? Bk[i * Wd + qq] : 0; if (b === 1) { out.push([i - 1, j - 1]); i--; j--; } else if (b === 2) { out.push([i - 1, -1]); i--; } else { out.push([-1, j - 1]); j--; } }
    while (i > 0) { out.push([i - 1, -1]); i--; } while (j > 0) { out.push([-1, j - 1]); j--; }
    return out.reverse();
  }
  function plan(doc, newText) {   // [{p: 문단, text: 새 글 | ''(지움)}]. 13.23: 문단 안에 빈 줄이 든 문단은 조각으로 나눠 맞춘 뒤 다시 합침(문단 수가 어긋나지 않게)
    var units = [], owner = [];
    doc.paras.forEach(function (p, i) { p.clean.split(/\n{2,}/).forEach(function (u) { units.push(u); owner.push(i); }); });
    var news = canon(newText).split(/\n{2,}/).map(function (s) { return s.trim(); }).filter(Boolean);
    var A = align(units, news); if (!A) return null;
    var acc = doc.paras.map(function () { return null; }), cur = -1, pre = '';
    A.forEach(function (x) {
      if (x[0] >= 0) {
        var i = owner[x[0]], t = x[1] >= 0 ? news[x[1]] : '';
        if (acc[i] == null) acc[i] = t; else if (t) acc[i] += (acc[i] ? '\n\n' : '') + t;
        cur = i;
      } else if (cur >= 0) acc[cur] += (acc[cur] ? '\n' : '') + news[x[1]];   // 새로 생긴 문단은 앞 문단 끝에
      else pre += (pre ? '\n' : '') + news[x[1]];
    });
    if (pre && acc.length) acc[0] = pre + (acc[0] ? '\n' + acc[0] : '');
    var res = [];
    doc.paras.forEach(function (p, i) { var t = acc[i] == null ? '' : acc[i]; if (t !== p.clean) res.push({ p: p, text: t }); });
    return res;
  }
  /* 바뀐 문단에 새 글 넣기(12.1): 각주 번호 · 그림 · 쪽 나눔처럼 글이 없는 자리와, 링크 · 필드(인용 · 누름틀) 글은 그대로 두고
     그 사이 글만 바꿈. 자리는 낱말 단위로 맞춰 옮기고, 링크 · 필드 글이 새 글에 그대로 없으면 그 문단은 원래 글로 둠(false) */
  function docxToks(p) {
    var T = [], depth = 0, res = [];
    (function walk(n, prot) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType !== 1) continue;
        var ln = c.localName, ns = c.namespaceURI;
        if (ns === W && ln === 'p') continue;                                   // 글상자 속 문단은 그 문단 몫
        if (ns === MC && ln === 'Fallback') continue;
        if (ns === W && (ln === 'del' || ln === 'moveFrom' || ln === 'rPr' || ln === 'pPr')) continue;
        if (ns !== W) { walk(c, prot); continue; }
        if (ln === 'fldChar') {
          var ft = c.getAttributeNS(W, 'fldCharType') || c.getAttribute('w:fldCharType');
          if (ft === 'begin') { depth++; res[depth] = false; } else if (ft === 'separate') res[depth] = true; else if (ft === 'end' && depth > 0) depth--;
          T.push({ k: 'a', el: c }); continue;
        }
        var pr = prot || (depth > 0 && res[depth]);                             // 링크 · 필드 결과(인용 등)의 글은 지킴
        if (ln === 't') { T.push({ k: pr ? 's' : 't', el: c, s: c.textContent }); continue; }
        if (ln === 'tab') { T.push(pr ? { k: 's', el: c, s: ' ' } : { k: 'a', el: c, w: ' ' }); continue; }   // 탭은 자리로 지킴(글에서는 빈칸 하나)
        if (ln === 'br' || ln === 'cr') { var ty = c.getAttributeNS(W, 'type') || c.getAttribute('w:type'); T.push(ty === 'page' || ty === 'column' ? { k: 'a', el: c } : { k: pr ? 's' : 't', el: c, s: '\n' }); continue; }
        if (ln === 'noBreakHyphen') { T.push({ k: pr ? 's' : 't', el: c, s: '-' }); continue; }
        if (ln === 'hyperlink' || ln === 'fldSimple') { walk(c, true); continue; }
        if (ln === 'instrText' || ln === 'delText' || ln === 'lastRenderedPageBreak' || ln === 'softHyphen' || ln === 'proofErr' || ln === 'bookmarkStart' || ln === 'bookmarkEnd' || ln === 'commentRangeStart' || ln === 'commentRangeEnd' || ln === 'permStart' || ln === 'permEnd') continue;
        if (/^(footnoteReference|endnoteReference|commentReference|annotationRef|footnoteRef|endnoteRef|drawing|pict|object|sym|ptab|separator|continuationSeparator|ruby|fldData)$/.test(ln)) { T.push({ k: 'a', el: c }); continue; }
        walk(c, prot);                                                          // r · ins · smartTag · sdt · customXml · moveTo …
      }
    })(p, false);
    return T;
  }
  function hwpxToks(p) {
    var T = [], fld = 0;
    for (var r = p.firstChild; r; r = r.nextSibling) {
      if (r.nodeType !== 1) continue;
      if (r.localName !== 'run') { if (r.localName !== 'linesegarray') T.push({ k: 'a', el: r }); continue; }
      for (var c = r.firstChild; c; c = c.nextSibling) {
        if (c.nodeType !== 1) continue;
        if (c.localName === 't') {
          for (var m = c.firstChild; m; m = m.nextSibling) if (m.nodeType === 1 && /^(insertBegin|insertEnd|deleteBegin|deleteEnd)$/.test(m.localName)) T.unsafe = true;   // 변경 추적 표시가 든 문단은 손대지 않음
          T.push({ k: fld > 0 ? 's' : 't', el: c, s: hwpxTText(c, { del: false }) }); continue;
        }
        if (c.localName === 'ctrl') for (var d = c.firstChild; d; d = d.nextSibling) { if (d.nodeType !== 1) continue; if (d.localName === 'fieldBegin') fld++; else if (d.localName === 'fieldEnd' && fld > 0) fld--; }
        T.push({ k: 'a', el: c });                                              // 각주 · 필드 표시 · 표 · 그림 · 도형 · 수식 · 덧말 · 구역 설정 …
      }
    }
    return T;
  }
  function wdiff(a, b) {   // 낱말 · 빈칸 단위로 맞춤 → [[같음 '=' · 지움 '-' · 넣음 '+', 길이]]
    var A = a.match(/\s+|[^\s]+/g) || [], B = b.match(/\s+|[^\s]+/g) || [], n = A.length, m = B.length, ops = [], i, j;
    if (!n || !m) { if (n) ops.push(['-', a.length]); if (m) ops.push(['+', b.length]); return ops; }
    if (n * m > 4000000) return wdiffBig(A, B);   // 긴 문단(13.23): 예전에는 손대지 않았음
    var w = m + 1, dp = new Uint16Array((n + 1) * w);
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) dp[i * w + j] = A[i] === B[j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
    i = 0; j = 0;
    while (i < n && j < m) { if (A[i] === B[j]) { ops.push(['=', A[i].length]); i++; j++; } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) ops.push(['-', A[i++].length]); else ops.push(['+', B[j++].length]); }
    while (i < n) ops.push(['-', A[i++].length]); while (j < m) ops.push(['+', B[j++].length]);
    return ops;
  }
  function wdiffBig(A, B) {   // 긴 문단: 반씩 나눠 맞춤(히르시버그). 메모리는 한 줄만 쓰고, 작은 조각은 위와 같은 방식으로
    var n = A.length, m = B.length, i;
    if (n * m > 400000000) return null;
    var ids = Object.create(null), nid = 0, ia = new Int32Array(n), ib = new Int32Array(m), ops = [];
    for (i = 0; i < n; i++) ia[i] = ids[A[i]] !== undefined ? ids[A[i]] : (ids[A[i]] = nid++);
    for (i = 0; i < m; i++) ib[i] = ids[B[i]] !== undefined ? ids[B[i]] : (ids[B[i]] = nid++);
    function leaf(a0, a1, b0, b1) {
      var nn = a1 - a0, mm = b1 - b0, w = mm + 1, dp = new Uint16Array((nn + 1) * w), i, j;
      for (i = nn - 1; i >= 0; i--) for (j = mm - 1; j >= 0; j--) dp[i * w + j] = ia[a0 + i] === ib[b0 + j] ? dp[(i + 1) * w + j + 1] + 1 : Math.max(dp[(i + 1) * w + j], dp[i * w + j + 1]);
      i = 0; j = 0;
      while (i < nn && j < mm) { if (ia[a0 + i] === ib[b0 + j]) { ops.push(['=', A[a0 + i].length]); i++; j++; } else if (dp[(i + 1) * w + j] >= dp[i * w + j + 1]) ops.push(['-', A[a0 + i++].length]); else ops.push(['+', B[b0 + j++].length]); }
      while (i < nn) ops.push(['-', A[a0 + i++].length]); while (j < mm) ops.push(['+', B[b0 + j++].length]);
    }
    function row(a0, a1, b0, b1, rev) {   // 같은 낱말 수(LCS) 한 줄
      var mm = b1 - b0, prev = new Int32Array(mm + 1), cur = new Int32Array(mm + 1), i, j, t;
      for (i = a0; i < a1; i++) {
        var x = rev ? ia[a1 - 1 - (i - a0)] : ia[i];
        for (j = 1; j <= mm; j++) cur[j] = x === (rev ? ib[b1 - j] : ib[b0 + j - 1]) ? prev[j - 1] + 1 : (prev[j] >= cur[j - 1] ? prev[j] : cur[j - 1]);
        t = prev; prev = cur; cur = t;
      }
      return prev;
    }
    (function go(a0, a1, b0, b1) {
      var nn = a1 - a0, mm = b1 - b0, i;
      if (!nn) { for (i = b0; i < b1; i++) ops.push(['+', B[i].length]); return; }
      if (!mm) { for (i = a0; i < a1; i++) ops.push(['-', A[i].length]); return; }
      if (nn * mm <= 4000000) return leaf(a0, a1, b0, b1);
      var mid = (a0 + a1) >> 1, L = row(a0, mid, b0, b1, false), R = row(mid, a1, b0, b1, true), best = -1, bk = 0;
      for (i = 0; i <= mm; i++) { var v = L[i] + R[mm - i]; if (v > best) { best = v; bk = i; } }
      go(a0, mid, b0, b0 + bk); go(mid, a1, b0 + bk, b1);
    })(0, n, 0, m);
    return ops;
  }
  function mapAfter(ops, r, O, N) {   // 원래 글 r 자리(앞 글자에 붙은 자리)를 새 글 자리로. 바뀐 말 안이면 같은 앞 · 뒷부분으로 맞추고, 아니면 바꾼 말 뒤로
    if (r <= 0) return 0;
    var oP = 0, nP = 0;
    for (var k = 0; k < ops.length; k++) {
      var o = ops[k];
      if (o[0] === '+') { nP += o[1]; continue; }
      if (r - 1 < oP + o[1]) {
        if (o[0] === '=') return nP + (r - oP);
        var nx = ops[k + 1], nx2 = ops[k + 2];
        if (nx && nx[0] === '+' && (!nx2 || nx2[0] === '=')) {   // 낱말 하나를 바꾼 곳: 홈런[각주]. → 홈런포[각주].
          var D = O.substr(oP, o[1]), I = N.substr(nP, nx[1]), d = r - oP, cp = 0, cs = 0;
          while (cp < D.length && cp < I.length && D[cp] === I[cp]) cp++;
          while (cs < D.length - cp && cs < I.length - cp && D[D.length - 1 - cs] === I[I.length - 1 - cs]) cs++;
          if (D.length - d <= cs) return nP + I.length - (D.length - d);   // 뒷부분이 같으면(홈런[각주]. → 홈런포[각주].) 바뀐 말 뒤에
          if (d <= cp) return nP + d;                                      // 앞부분이 같으면(연구[각주]에서 → 연구[각주]에서는)
          return nP + I.length;
        }
        for (var q = k + 1; q < ops.length && ops[q][0] !== '='; q++) if (ops[q][0] === '+') nP += ops[q][1];
        return nP;
      }
      oP += o[1]; if (o[0] === '=') nP += o[1];
    }
    return N.length;
  }
  function mapExact(ops, a) {   // 원래 글 a 글자가 새 글에 그대로 있으면 그 자리, 없으면 -1
    var oP = 0, nP = 0;
    for (var k = 0; k < ops.length; k++) {
      var o = ops[k];
      if (o[0] === '+') { nP += o[1]; continue; }
      if (a < oP + o[1]) return o[0] === '=' ? nP + (a - oP) : -1;
      oP += o[1]; if (o[0] === '=') nP += o[1];
    }
    return -1;
  }
  function anc(el, kind) { for (var q = el; q && q.parentNode; q = q.parentNode) { if (kind === 'docx' ? q.localName === 'r' && q.namespaceURI === W : q.localName === 'run') return q; } return null; }
  function putText(kind, t0, text) {   // 글 칸 하나에 글(줄 바꿈은 docx w:br · hwpx hp:lineBreak)
    var dom = t0.ownerDocument, bits = String(text).split('\n');
    if (kind === 'docx') {
      var run = t0.parentNode, ref = t0;
      t0.textContent = bits[0]; t0.setAttributeNS(XMLNS, 'xml:space', 'preserve');
      for (var k = 1; k < bits.length; k++) { var br = dom.createElementNS(W, 'w:br'), t = dom.createElementNS(W, 'w:t'); t.setAttributeNS(XMLNS, 'xml:space', 'preserve'); t.textContent = bits[k]; run.insertBefore(br, ref.nextSibling); run.insertBefore(t, br.nextSibling); ref = t; }
      return;
    }
    var NS = t0.namespaceURI;
    while (t0.firstChild) t0.removeChild(t0.firstChild);
    bits.forEach(function (b, k) { if (k) t0.appendChild(dom.createElementNS(NS, 'hp:lineBreak')); if (b) t0.appendChild(dom.createTextNode(b)); });
  }
  function newSlotT(kind, p, prevB, nextB, tmplRun) {   // 글 칸이 없던 자리에 글 칸을 만듦(앞뒤 자리 사이)
    var dom = p.ownerDocument, NS = p.namespaceURI;
    if (kind === 'hwpx') {
      var t = dom.createElementNS(NS, 'hp:t');
      if (nextB && nextB.el.parentNode && nextB.el.parentNode.localName === 'run') nextB.el.parentNode.insertBefore(t, nextB.el);
      else if (prevB && prevB.el.parentNode && prevB.el.parentNode.localName === 'run') prevB.el.parentNode.insertBefore(t, prevB.el.nextSibling);
      else { var run = dom.createElementNS(NS, 'hp:run'); run.setAttribute('charPrIDRef', tmplRun ? tmplRun.getAttribute('charPrIDRef') || '0' : '0'); run.appendChild(t); var at = nextB ? nextB.el : null; while (at && at.parentNode !== p) at = at.parentNode; p.insertBefore(run, at || null); }
      return t;
    }
    var r = dom.createElementNS(W, 'w:r'), tt = dom.createElementNS(W, 'w:t');
    var rp = tmplRun && tmplRun.getElementsByTagNameNS(W, 'rPr')[0]; if (rp) r.appendChild(rp.cloneNode(true));
    r.appendChild(tt);
    var nr = nextB && anc(nextB.el, 'docx'), pr = prevB && anc(prevB.el, 'docx');
    if (nr && nr.parentNode) nr.parentNode.insertBefore(r, nr);
    else if (pr && pr.parentNode) pr.parentNode.insertBefore(r, pr.nextSibling);
    else p.appendChild(r);
    return tt;
  }
  function rewritePara(el, kind, text) {
    var T = kind === 'docx' ? docxToks(el) : hwpxToks(el), N = String(text), O = '';
    if (T.unsafe) return false;
    T.forEach(function (t) { t.a = O.length; if (t.k !== 'a') O += t.s; else if (t.w) O += t.w; t.b = O.length; });
    var B = T.filter(function (t) { return t.k !== 't'; });                      // 자리(글 없는 것 · 지킬 글)
    var cuts = [];   // 자리마다 새 글 위치 [시작, 끝]
    if (B.length) {
      var ops = wdiff(O, N); if (!ops) return false;
      for (var i = 0; i < T.length; i++) {
        var t = T[i];
        if (t.k === 'a') {
          if (t.w) { var xw = mapExact(ops, t.a); if (xw >= 0 && /\s/.test(N.charAt(xw))) { cuts.push({ tok: t, s: xw, e: xw + 1 }); continue; } }   // 탭 자리의 빈칸은 탭이 대신함
          var x = mapAfter(ops, t.a, O, N); cuts.push({ tok: t, s: x, e: x }); continue;
        }
        if (t.k === 's') {   // 지킬 글: 새 글에 그대로 있어야 함(빈칸뿐인 것은 자리만 맞춤)
          if (!t.s.replace(/\s+/g, '')) { var z = mapAfter(ops, t.a, O, N), w = (/^\s*/.exec(N.slice(z, z + t.s.length)) || [''])[0].length; cuts.push({ tok: t, s: z, e: z + w }); continue; }
          var y = mapExact(ops, t.a);
          if (y < 0 || N.substr(y, t.s.length) !== t.s) return false;
          cuts.push({ tok: t, s: y, e: y + t.s.length });
        }
      }
      for (var k = 1; k < cuts.length; k++) if (cuts[k].s < cuts[k - 1].e) return false;   // 순서가 꼬이면 손대지 않음
    }
    // 자리 사이 글 칸 묶음(slot)과 그 자리에 들어갈 새 글 조각
    var slots = [[]], tmpl = null;
    T.forEach(function (t) { if (t.k === 't') { slots[slots.length - 1].push(t); if (!tmpl && t.el.localName === 't') tmpl = anc(t.el, kind); } else slots.push([]); });
    var pieces = [], from = 0, WS = /\s/;
    cuts.forEach(function (c) { pieces.push(N.slice(from, c.s)); from = c.e; });
    pieces.push(N.slice(from));
    cuts.forEach(function (c, k) {   // 글 없는 자리 앞뒤에 있던 빈칸은 그대로(새 글은 빈칸을 하나로 줄였으므로)
      if (c.tok.k !== 'a' || c.tok.w) return;
      if (c.tok.a > 0 && WS.test(O.charAt(c.tok.a - 1)) && pieces[k] && !WS.test(pieces[k].slice(-1))) pieces[k] += ' ';
      if (WS.test(O.charAt(c.tok.a)) && pieces[k + 1] && !WS.test(pieces[k + 1].charAt(0))) pieces[k + 1] = ' ' + pieces[k + 1];
    });
    slots.forEach(function (sl, k) {
      var txt = pieces[k] || '', t0 = null;
      sl.forEach(function (t) { if (!t0 && t.el.localName === 't') t0 = t; else if (t.el.parentNode) t.el.parentNode.removeChild(t.el); });
      if (t0) { putText(kind, t0.el, txt); return; }
      if (!txt) return;
      putText(kind, newSlotT(kind, el, k ? B[k - 1] : null, B[k] || null, tmpl), txt);
    });
    if (kind === 'hwpx') for (var q = el.firstChild; q; q = q.nextSibling) if (q.nodeType === 1 && q.localName === 'linesegarray') { el.removeChild(q); break; }   // 줄 배치 기억은 한글이 다시 셈
    return true;
  }
  function setDocxPara(p, text) { return rewritePara(p, 'docx', text); }
  function setHwpxPara(p, text) { return rewritePara(p, 'hwpx', text); }
  var KEEP = { drawing: 1, pict: 1, object: 1, sectPr: 1, secPr: 1, tbl: 1, txbxContent: 1, p: 1, pic: 1, ctrl: 1, container: 1, rect: 1, ellipse: 1, line: 1, polygon: 1, curve: 1, arc: 1, equation: 1, ole: 1, chart: 1, video: 1, fldChar: 1 };
  function plainPara(el) { var all = el.getElementsByTagName('*'); for (var i = 0; i < all.length; i++) if (KEEP[all[i].localName]) return false; return true; }
  function dropPara(p, kind) {   // 빠진 문단: 글만 있는 문단이면 지우고, 표 · 그림 · 구역 설정이 든 문단이나 칸의 하나뿐인 문단이면 글만 비움
    var el = p.el, par = el.parentNode, sib = 0;
    for (var c = par.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && c.localName === 'p') sib++;
    if (sib <= 1 || !plainPara(el)) { if (kind === 'docx') setDocxPara(el, ''); else setHwpxPara(el, ''); return; }
    par.removeChild(el);
  }
  /* ---------- 한글 .hwp 다시 만들기(13.23): 원본 파일에서 바뀐 문단의 글만 ----------
     복합 문서(CFB)를 풀어 본문 구역(BodyText/SectionN)의 문단 글 레코드만 새로 쓰고 다시 묶습니다.
     표 · 그림 · 각주 · 머리말 · 글자 모양 · 문단 모양은 원래 바이트 그대로 둡니다. 줄 배치 기억(PARA_LINE_SEG)은 지워 한글이 다시 셉니다. */
  function cfbWrite(C, repl) {   // 폴더 구조(디렉터리 항목)는 그대로 두고 흐름의 자리 · 크기만 새로
    var Wd = C._w, ss = Wd.ss, mss = Wd.mss, cut = Wd.cut, ents = Wd.ents, EOC = 0xFFFFFFFE, FREE = 0xFFFFFFFF;
    var bigs = [], minis = [], nBig = 0, nMini = 0, i, j;
    ents.forEach(function (e) {
      e._d = null;
      if (e.type !== 2 || e.path == null) return;
      var d = (repl && repl[e.path]) || C.read(e.path);
      if (!d || !d.length) return;
      e._d = d;
      if (d.length < cut) { e._s = nMini; nMini += Math.ceil(d.length / mss); minis.push(e); }
      else { e._s = nBig; nBig += Math.ceil(d.length / ss); bigs.push(e); }
    });
    var nMiniSec = Math.ceil(nMini * mss / ss), nMfSec = Math.ceil(nMini * 4 / ss), dirLen = Math.ceil(Wd.dirB.length / ss) * ss, nDirSec = dirLen / ss;
    var nData = nBig + nMiniSec + nMfSec + nDirSec, epf = ss / 4, nFat = 0, nDif = 0;
    for (;;) { var f = Math.ceil((nData + nFat + nDif) / epf), d2 = f > 109 ? Math.ceil((f - 109) / (epf - 1)) : 0; if (f === nFat && d2 === nDif) break; nFat = f; nDif = d2; }
    var total = nData + nFat + nDif, out = new Uint8Array((total + 1) * ss), dv = new DataView(out.buffer);
    var sMini = nBig, sMf = sMini + nMiniSec, sDir = sMf + nMfSec, sFat = sDir + nDirSec, sDif = sFat + nFat;
    var at = function (sec) { return (sec + 1) * ss; };
    var chainTo = function (tbl, s, n) { for (var k = 0; k < n; k++) tbl[s + k] = k + 1 < n ? s + k + 1 : EOC; };
    var fat = new Uint32Array(nFat * epf), mf = new Uint32Array(nMfSec * epf);
    for (i = 0; i < fat.length; i++) fat[i] = FREE;
    for (i = 0; i < mf.length; i++) mf[i] = FREE;
    bigs.forEach(function (e) { out.set(e._d, at(e._s)); chainTo(fat, e._s, Math.ceil(e._d.length / ss)); });
    minis.forEach(function (e) { out.set(e._d, at(sMini) + e._s * mss); chainTo(mf, e._s, Math.ceil(e._d.length / mss)); });
    chainTo(fat, sMini, nMiniSec); chainTo(fat, sMf, nMfSec); chainTo(fat, sDir, nDirSec);
    for (i = 0; i < nFat; i++) fat[sFat + i] = 0xFFFFFFFD;
    for (i = 0; i < nDif; i++) fat[sDif + i] = 0xFFFFFFFC;
    for (i = 0; i < mf.length; i++) dv.setUint32(at(sMf) + i * 4, mf[i], true);
    for (i = 0; i < fat.length; i++) dv.setUint32(at(sFat) + i * 4, fat[i], true);
    var dir = new Uint8Array(dirLen), ddv = new DataView(dir.buffer);
    dir.set(Wd.dirB);
    for (i = Wd.dirB.length; i < dirLen; i += 128) { ddv.setUint32(i + 68, FREE, true); ddv.setUint32(i + 72, FREE, true); ddv.setUint32(i + 76, FREE, true); }
    ents.forEach(function (e, k) {
      var o = k * 128;
      if (e.type === 5) { ddv.setUint32(o + 116, nMiniSec ? sMini : EOC, true); ddv.setUint32(o + 120, nMini * mss, true); ddv.setUint32(o + 124, 0, true); }
      else if (e.type === 2) { ddv.setUint32(o + 116, e._d ? e._s : EOC, true); ddv.setUint32(o + 120, e._d ? e._d.length : 0, true); ddv.setUint32(o + 124, 0, true); }
      e._d = null;
    });
    out.set(dir, at(sDir));
    out.set(Wd.u8.subarray(0, 76));
    dv.setUint32(40, ss === 4096 ? nDirSec : 0, true); dv.setUint32(44, nFat, true); dv.setUint32(48, sDir, true);
    dv.setUint32(60, nMfSec ? sMf : EOC, true); dv.setUint32(64, nMfSec, true); dv.setUint32(68, nDif ? sDif : EOC, true); dv.setUint32(72, nDif, true);
    for (i = 0; i < 109; i++) dv.setUint32(76 + i * 4, i < nFat ? sFat + i : FREE, true);
    for (i = 0; i < nDif; i++) {
      var base = at(sDif + i);
      for (j = 0; j < epf - 1; j++) { var q = 109 + i * (epf - 1) + j; dv.setUint32(base + j * 4, q < nFat ? sFat + q : FREE, true); }
      dv.setUint32(base + (epf - 1) * 4, i + 1 < nDif ? sDif + i + 1 : EOC, true);
    }
    return out;
  }
  function hwpRecAt(dv, o, len) {   // 레코드 하나의 머리
    if (o + 4 > len) return null;
    var h = dv.getUint32(o, true), size = (h >>> 20) & 0xFFF, b = o + 4;
    if (size === 0xFFF) { if (b + 4 > len) return null; size = dv.getUint32(b, true); b += 4; }
    if (b + size > len) return null;
    return { tag: h & 0x3FF, lv: (h >>> 10) & 0x3FF, size: size, body: b, end: b + size };
  }
  function hwpRec(tag, lv, body) {
    var n = body.length, big = n >= 0xFFF, out = new Uint8Array(4 + (big ? 4 : 0) + n), dv = new DataView(out.buffer);
    dv.setUint32(0, (tag | (lv << 10) | ((big ? 0xFFF : n) << 20)) >>> 0, true);
    if (big) dv.setUint32(4, n, true);
    out.set(body, big ? 8 : 4);
    return out;
  }
  function hwpParaRecs(buf, at) {   // 문단 머리와 바로 뒤의 글(67) · 글자 모양(68) · 줄 배치(69) · 영역 표시(70)
    var dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), H = hwpRecAt(dv, at, buf.length);
    if (!H || H.tag !== 66 || H.size < 18) return null;
    var R = { dv: dv, H: H, text: null, cs: null, ls: null, rt: null, headEnd: H.end, end: H.end, ctrls: 0 }, o = H.end, r, head = true;
    while ((r = hwpRecAt(dv, o, buf.length)) && r.lv > H.lv) {
      if (r.lv === H.lv + 1 && r.tag >= 67 && r.tag <= 70) {
        var key = r.tag === 67 ? 'text' : r.tag === 68 ? 'cs' : r.tag === 69 ? 'ls' : 'rt';
        if (!head || R[key]) return null;      // 순서가 예상과 다른 문단은 손대지 않음
        R[key] = r; R.headEnd = r.end;
      } else { head = false; if (r.lv === H.lv + 1 && r.tag === 71) R.ctrls++; }
      o = r.end;
    }
    R.end = o; R.next = r;
    return R;
  }
  var HWP_FLD_OPEN = { '%%me': 1, '%bmk': 1 };   // 메모 · 블록 책갈피 안의 글은 본문 글(고칠 수 있음). 링크 · 계산식 같은 필드 글은 지킴
  function hwpNewUnits(U, text) {   // 문단 글(16비트 칸 배열)에 새 글을 넣음: 조종 문자(표 · 그림 · 각주 자리 등 8칸)와 필드 글은 그대로
    var n = U.length, T = [], fld = 0, stack = [], i = 0, c, j, k, q;
    if (!n || U[n - 1] !== 13) return null;
    while (i < n - 1) {
      c = U[i];
      if (c >= 32 || c === 10 || c === 24 || c === 30 || c === 31) { T.push({ k: fld > 0 ? 's' : 't', u: i, n: 1, s: c >= 32 ? (c === 0xF53A ? '한' : String.fromCharCode(c)) : c === 10 ? '\n' : c === 24 ? '-' : ' ' }); i++; continue; }
      if (c === 13) return null;
      if (c === 0 || (c >= 25 && c <= 29)) { T.push({ k: 'a', u: i, n: 1 }); i++; continue; }
      if (i + 8 > n - 1 || U[i + 7] !== c) return null;
      if (c === 9) T.push(fld > 0 ? { k: 's', u: i, n: 8, s: ' ' } : { k: 'a', u: i, n: 8, w: ' ' });
      else {
        if (c === 3) { var open = !!HWP_FLD_OPEN[String.fromCharCode(U[i + 2] >> 8, U[i + 2] & 255, U[i + 1] >> 8, U[i + 1] & 255)]; stack.push(open); if (!open) fld++; }
        else if (c === 4 && stack.length) { if (!stack.pop()) fld--; }
        T.push({ k: 'a', u: i, n: 8 });
      }
      i += 8;
    }
    var O = '', oU = [], oC = [], B = [], last = null;
    T.forEach(function (t) {
      t.a = O.length;
      if (t.k === 'a') { if (t.w) { O += t.w; oU.push(t.u); oC.push(0); } B.push(t); last = t; return; }
      for (var z = 0; z < t.s.length; z++) { oU.push(t.u); oC.push(t.n === 1 ? 1 : 0); }
      O += t.s;
      if (t.k === 's') { if (last && last.k === 's') { last.s += t.s; last.n += t.n; } else { B.push(t); last = t; } }
      else last = t;
    });
    var N = String(text).replace(/[\u0000-\u0009\u000B-\u001F]/g, ' ');
    var lead = (/^\s*/.exec(O) || [''])[0], trail = lead.length < O.length ? (/\s*$/.exec(O) || [''])[0] : '';
    if (N) N = lead + N + trail;   // 문단 앞뒤 빈칸(들여쓰기)은 그대로
    var ops = wdiff(O, N); if (!ops) return null;
    var cuts = [];
    for (i = 0; i < B.length; i++) {
      var t = B[i];
      if (t.k === 'a') {
        if (t.w) { var xw = mapExact(ops, t.a); if (xw >= 0 && /\s/.test(N.charAt(xw))) { cuts.push({ tok: t, s: xw, e: xw + 1 }); continue; } }
        var x = mapAfter(ops, t.a, O, N); cuts.push({ tok: t, s: x, e: x }); continue;
      }
      if (!t.s.replace(/\s+/g, '')) { var z0 = mapAfter(ops, t.a, O, N), w0 = (/^\s*/.exec(N.slice(z0, z0 + t.s.length)) || [''])[0].length; cuts.push({ tok: t, s: z0, e: z0 + w0 }); continue; }
      var y = mapExact(ops, t.a);
      if (y < 0 || N.substr(y, t.s.length) !== t.s) return null;   // 필드 글이 바뀌었으면 이 문단은 원래 글 그대로
      cuts.push({ tok: t, s: y, e: y + t.s.length });
    }
    for (k = 1; k < cuts.length; k++) if (cuts[k].s < cuts[k - 1].e) return null;
    // 새 글 글자마다 원래 글자(같은 글자면 그 칸을 그대로, 새로 쓴 글자면 글자 모양만 따옴)
    var src = new Int32Array(N.length), shp = new Int32Array(N.length), oP = 0, nP = 0;
    for (i = 0; i < N.length; i++) { src[i] = -1; shp[i] = -1; }
    k = 0;
    while (k < ops.length) {
      if (ops[k][0] === '=') { for (j = 0; j < ops[k][1]; j++) src[nP + j] = oP + j; oP += ops[k][1]; nP += ops[k][1]; k++; continue; }
      var dl = 0, il = 0;
      while (k < ops.length && ops[k][0] !== '=') { if (ops[k][0] === '-') dl += ops[k][1]; else il += ops[k][1]; k++; }
      var cp = 0, cs = 0;
      while (cp < dl && cp < il && O.charCodeAt(oP + cp) === N.charCodeAt(nP + cp)) cp++;
      while (cs < dl - cp && cs < il - cp && O.charCodeAt(oP + dl - 1 - cs) === N.charCodeAt(nP + il - 1 - cs)) cs++;
      for (j = 0; j < cp; j++) src[nP + j] = oP + j;
      for (j = 0; j < cs; j++) src[nP + il - 1 - j] = oP + dl - 1 - j;
      var rf = cp < dl - cs ? oP + cp : oP + cp > 0 ? oP + cp - 1 : oP + dl < O.length ? oP + dl : -1;
      for (j = cp; j < il - cs; j++) shp[nP + j] = rf;
      oP += dl; nP += il;
    }
    var out = [], ref = [], ex = [], WS = /\s/, from = 0, prevRef = T.length ? T[0].u : n - 1;
    var put = function (code, r, e) { out.push(code); ref.push(r); ex.push(e); prevRef = r; };
    var textRange = function (a, b) {
      for (var p = a; p < b; p++) {
        var so = src[p], ch = N.charCodeAt(p);
        if (so >= 0 && oC[so]) { put(U[oU[so]], oU[so], oU[so]); continue; }
        var r = so >= 0 ? oU[so] : shp[p] >= 0 ? oU[shp[p]] : prevRef;
        put(ch === 10 ? 10 : ch < 32 ? 32 : ch, r, -1);
      }
    };
    for (k = 0; k <= cuts.length; k++) {
      var cA = k ? cuts[k - 1] : null, cB = k < cuts.length ? cuts[k] : null, a0 = from, b0 = cB ? cB.s : N.length, has = b0 > a0;
      // 글 없는 자리(각주 · 그림) 앞뒤에 있던 빈칸은 그대로(새 글은 빈칸을 하나로 줄였으므로)
      if (cA && cA.tok.k === 'a' && !cA.tok.w && has && WS.test(O.charAt(cA.tok.a)) && !WS.test(N.charAt(a0))) put(32, prevRef, -1);
      textRange(a0, b0);
      if (cB && cB.tok.k === 'a' && !cB.tok.w && has && cB.tok.a > 0 && WS.test(O.charAt(cB.tok.a - 1)) && !WS.test(N.charAt(b0 - 1))) put(32, prevRef, -1);
      if (cB) { for (q = 0; q < cB.tok.n; q++) put(U[cB.tok.u + q], cB.tok.u + q, cB.tok.u + q); from = cB.e; }
    }
    put(13, n - 1, n - 1);
    return { units: out, ref: ref, ex: ex };
  }
  function hwpEditPara(buf, at, text) {   // → {from, to, bytes}: 이 문단의 머리 묶음을 갈아 끼울 바이트. 못 바꾸면 null
    var R = hwpParaRecs(buf, at); if (!R || !R.cs) return null;
    var dv = R.dv, H = R.H, n0 = dv.getUint32(H.body, true), nOld = n0 & 0x7FFFFFFF, U, i;
    if (R.text) { if (R.text.size !== nOld * 2) return null; U = new Uint16Array(nOld); for (i = 0; i < nOld; i++) U[i] = dv.getUint16(R.text.body + i * 2, true); }
    else { if (nOld !== 1) return null; U = new Uint16Array([13]); }
    var nCs = R.cs.size >> 3, cs = [];
    for (i = 0; i < nCs; i++) cs.push([dv.getUint32(R.cs.body + i * 8, true), dv.getUint32(R.cs.body + i * 8 + 4, true)]);
    if (!nCs || cs[0][0] !== 0) return null;
    var X = hwpNewUnits(U, text); if (!X) return null;
    var nu = X.units, nNew = nu.length, oldShape = new Int32Array(nOld), ci = 0;
    for (i = 0; i < nOld; i++) { while (ci + 1 < nCs && cs[ci + 1][0] <= i) ci++; oldShape[i] = cs[ci][1]; }
    var ncs = [], lastId = -1, mask = 0;
    for (i = 0; i < nNew; i++) { var id = oldShape[X.ref[i]]; if (!i || id !== lastId) { ncs.push(i, id); lastId = id; } }
    if (ncs.length / 2 > 0xFFFF) return null;
    for (i = 0; i < nNew; i++) { var c = nu[i]; if (c < 32) { if (c !== 13) mask |= (1 << c); if (!(c === 0 || c === 10 || c === 13 || (c >= 24 && c <= 31))) i += 7; } }
    var lv = H.lv + 1, parts = [], hb = new Uint8Array(buf.subarray(at, H.end)), hdv = new DataView(hb.buffer), h0 = H.body - at;
    hdv.setUint32(h0, ((n0 & 0x80000000) | nNew) >>> 0, true); hdv.setUint32(h0 + 4, mask >>> 0, true); hdv.setUint16(h0 + 12, ncs.length / 2, true); hdv.setUint16(h0 + 16, 0, true);
    parts.push(hb);
    if (nNew > 1) { var tb = new Uint8Array(nNew * 2), tdv = new DataView(tb.buffer); for (i = 0; i < nNew; i++) tdv.setUint16(i * 2, nu[i], true); parts.push(hwpRec(67, lv, tb)); }
    var cb = new Uint8Array(ncs.length * 4), cdv = new DataView(cb.buffer);
    for (i = 0; i < ncs.length; i++) cdv.setUint32(i * 4, ncs[i], true);
    parts.push(hwpRec(68, lv, cb));
    if (R.rt) {   // 영역 표시(형광펜 등)의 자리도 새 글에 맞춤
      var o2n = new Int32Array(nOld + 1), rb = new Uint8Array(buf.subarray(R.rt.body, R.rt.end)), rdv = new DataView(rb.buffer), nRt = (rb.length / 12) | 0;
      for (i = 0; i <= nOld; i++) o2n[i] = -1;
      for (i = 0; i < nNew; i++) if (X.ex[i] >= 0 && o2n[X.ex[i]] < 0) o2n[X.ex[i]] = i;
      o2n[nOld] = nNew;
      for (i = nOld - 1; i >= 0; i--) if (o2n[i] < 0) o2n[i] = o2n[i + 1];
      for (i = 0; i < nRt; i++) { var s0 = Math.min(nOld, rdv.getUint32(i * 12, true)), e0 = Math.min(nOld, rdv.getUint32(i * 12 + 4, true)); rdv.setUint32(i * 12, o2n[s0], true); rdv.setUint32(i * 12 + 4, Math.max(o2n[s0], o2n[e0]), true); }
      parts.push(hwpRec(70, lv, rb));
    }
    var len = 0; parts.forEach(function (p) { len += p.length; });
    var bytes = new Uint8Array(len), w = 0; parts.forEach(function (p) { bytes.set(p, w); w += p.length; });
    return { from: at, to: R.headEnd, bytes: bytes };
  }
  function hwpDropPara(buf, at) {   // 빠진 문단: 글만 있는 본문 문단이면 지우고, 표 · 그림이 들었거나 칸 · 구역의 끝 문단이면 글만 비움
    var R = hwpParaRecs(buf, at); if (!R) return null;
    var dv = R.dv, H = R.H, n0 = dv.getUint32(H.body, true), mask = dv.getUint32(H.body + 4, true), div = dv.getUint8(H.body + 11);
    var charOnly = !(mask & ~((1 << 0) | (1 << 9) | (1 << 10) | (1 << 24) | (1 << 25) | (1 << 26) | (1 << 27) | (1 << 28) | (1 << 29) | (1 << 30) | (1 << 31)));
    if (H.lv === 0 && at > 0 && !(n0 >>> 31) && charOnly && !div && !R.ctrls && R.next && R.next.tag === 66 && R.next.lv === 0) return { from: at, to: R.end, bytes: new Uint8Array(0) };
    return hwpEditPara(buf, at, '');
  }
  function hwpExport(doc, P) {
    var bySec = {}, kept = 0;
    P.forEach(function (x) { (bySec[x.p.sec] = bySec[x.p.sec] || []).push(x); });
    return fflate().then(function (F) {
      var repl = {}, any = false;
      Object.keys(bySec).forEach(function (k) {
        var S = doc.secs[k], buf = S.buf, eds = [];
        bySec[k].forEach(function (x) { var e = x.text ? hwpEditPara(buf, x.p.at, x.text) : hwpDropPara(buf, x.p.at); if (e) eds.push(e); else kept++; });
        if (!eds.length) return;
        eds.sort(function (a, b) { return a.from - b.from; });
        var len = buf.length, i;
        for (i = 0; i < eds.length; i++) { if (i && eds[i].from < eds[i - 1].to) throw err('한글 파일의 문단 자리를 맞추지 못했어요.'); len += eds[i].bytes.length - (eds[i].to - eds[i].from); }
        var nb = new Uint8Array(len), w = 0, r = 0;
        for (i = 0; i < eds.length; i++) { nb.set(buf.subarray(r, eds[i].from), w); w += eds[i].from - r; nb.set(eds[i].bytes, w); w += eds[i].bytes.length; r = eds[i].to; }
        nb.set(buf.subarray(r), w);
        repl[S.name] = doc.zip ? F.deflateSync(nb, { level: 6 }) : nb; any = true;
      });
      var bytes = any ? cfbWrite(doc.C, repl) : doc.u8;
      return { blob: new Blob([bytes], { type: 'application/x-hwp' }), ext: 'hwp', changed: P.length - kept, kept: kept, bytes: bytes };
    });
  }
  var SER = function (dom) { return new XMLSerializer().serializeToString(dom).replace(/^(<\?xml[^>]*\?>)?/, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'); };
  function exportSame(src, newText, opt) {   // 원본(.docx · .hwpx · .hwp)에서 바뀐 문단만. opt.cutAt: 5만 자에서 잘라 넣은 글이면 뒤쪽은 원래 글 그대로
    var doc = src && src.doc; if (!doc) return Promise.resolve(null);
    newText = canon(newText);
    if (opt && opt.cutAt > 0 && opt.cutAt < src.text.length) newText = newText + src.text.slice(opt.cutAt);
    var P = plan(doc, newText); if (!P) return Promise.resolve(null);
    if (doc.kind === 'hwp') return hwpExport(doc, P);
    var kept = 0;
    P.forEach(function (x) {
      if (!x.text) return dropPara(x.p, doc.kind);
      if (!rewritePara(x.p.el, doc.kind, x.text)) kept++;   // 링크 · 필드 글이 바뀌었거나 변경 추적이 든 문단은 원래 글 그대로
    });
    var z = doc.zip;
    if (doc.kind === 'docx') {
      z.file(doc.path, SER(doc.dom));
      return z.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }).then(function (b) { return { blob: b, ext: 'docx', changed: P.length - kept, kept: kept }; });
    }
    doc.doms.forEach(function (d) { z.file(d.path, SER(d.dom)); });
    if (z.file('Preview/PrvText.txt')) z.file('Preview/PrvText.txt', canon(newText).slice(0, 1000));
    if (z.file('mimetype')) z.file('mimetype', 'application/hwp+zip', { compression: 'STORE' });
    return z.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/hwp+zip' }).then(function (b) { return { blob: b, ext: 'hwpx', changed: P.length - kept, kept: kept }; });
  }
  function xesc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function newDocx(text, title) {   // 새 워드 문서(맑은 고딕 11pt, 문단마다 아래 간격)
    return jszip().then(function (Z) {
      var z = new Z(), ps = canon(text).split(/\n{2,}/).map(function (p) {
        return '<w:p><w:r><w:t xml:space="preserve">' + p.split('\n').map(xesc).join('</w:t></w:r><w:r><w:br/><w:t xml:space="preserve">') + '</w:t></w:r></w:p>';
      }).join('');
      z.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
      z.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
      z.file('word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
      z.file('word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="' + W + '"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:eastAsia="Malgun Gothic" w:hAnsi="Malgun Gothic" w:cs="Malgun Gothic"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="ko-KR" w:eastAsia="ko-KR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>');
      z.file('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + xesc(title || '') + '</dc:title><dc:creator></dc:creator></cp:coreProperties>');
      z.file('word/document.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="' + W + '"><w:body>' + ps + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1440" w:bottom="1440" w:left="1440" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr></w:body></w:document>');
      return z.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    });
  }
  /* ---------- 새 PDF(13.23): 다듬은 글을 A4에 새로 조판 ----------
     PDF는 글자 자리가 고정된 형식이라 원본의 그림 · 표 배치는 옮기지 못합니다. 글만 새로 조판합니다(프리텐다드, 한자 등은 Noto Sans KR 보충 글꼴).
     글꼴은 쓰인 글자만 넣으므로 파일이 작고, 다른 프로그램에서 글을 그대로 뽑을 수 있습니다. */
  function pdflib() {
    return script('assets/vendor/pdf-lib.min.js', function () { return window.PDFLib; }).then(function (L) {
      return script('assets/vendor/fontkit.umd.min.js', function () { return window.fontkit; }).then(function (fk) { return { L: L, fk: fk }; });
    });
  }
  var fontMemo = {};
  function fontBytes(name) {
    if (!fontMemo[name]) fontMemo[name] = fetch(ROOT + 'assets/vendor/fonts/' + name + (VER ? '?v=' + VER : '')).then(function (r) { if (!r.ok) throw err('글꼴을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.', 'LOAD'); return r.arrayBuffer(); }).then(function (b) { return new Uint8Array(b); })
      .catch(function (e) { fontMemo[name] = null; throw e && e.code ? e : err('글꼴을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.', 'LOAD'); });
    return fontMemo[name];
  }
  function fkSafe(fk) {   // fontkit 보정: 글꼴을 줄일 때 글리프 길이가 홀수면 한 칸 채움(자리표가 짧은 형식이 되면 글리프가 깨지던 문제)
    return { create: function (bytes, name) {
      var f = fk.create(bytes, name), cs = f.createSubset;
      f.createSubset = function () {
        var s = cs.apply(f, arguments), add = s._addGlyph;
        if (typeof add === 'function') s._addGlyph = function (gid) {
          var r = add.call(s, gid), g = s.glyf, b = g && g[g.length - 1];
          if (b && (b.length & 1)) { var nb = new b.constructor(b.length + 1); nb.set(b); g[g.length - 1] = nb; s.offset += 1; }
          return r;
        };
        return s;
      };
      return f;
    } };
  }
  function buildPdf(L, fk, f1, getF2, text, title) {
    var pad = function (b) { var u = new Uint8Array(b.byteLength + 64); u.set(new Uint8Array(b.buffer || b, b.byteOffset || 0, b.byteLength)); return u; };   // 글꼴 끝의 빈 글리프를 읽다 넘치지 않게
    var setOf = function (font) { var h = {}, cs = font.getCharacterSet(); for (var i = 0; i < cs.length; i++) h[cs[i]] = 1; return h; };
    var src = String(text);
    return L.PDFDocument.create().then(function (pdf) {
      pdf.registerFontkit(fkSafe(fk));
      if (title) pdf.setTitle(String(title));
      return pdf.embedFont(pad(f1), { subset: true }).then(function (font) {
        var has = setOf(font), need = false, k, c;
        for (k = 0; k < src.length; k++) { c = src.codePointAt(k); if (c > 0xFFFF) k++; if (c > 32 && !has[c] && !/\s/.test(String.fromCodePoint(c))) { need = true; break; } }
        if (!need || !getF2) return [font, has, null, {}];
        return getF2().then(function (b) { return pdf.embedFont(pad(b), { subset: true }); }).then(function (font2) { return [font, has, font2, setOf(font2)]; }, function () { return [font, has, null, {}]; });
      }).then(function (F) {
        var font = F[0], has = F[1], font2 = F[2], has2 = F[3];
        var PW = 595.28, PH = 841.89, MX = 72, MT = 76, MB = 76, SIZE = 10.5, LEAD = 17.6, GAP = 7, maxW = PW - MX * 2;
        var sub = has[0x25A1] ? '\u25A1' : '?', wc = {}, i, ALT = { '\u223C': '~', '\u2981': '\u2022', '\u2219': '\u00B7', '\u22C5': '\u00B7', '\u2010': '-', '\u2011': '-', '\u2012': '-' };
        var chars = function (s) { var o = [], c; for (var k = 0; k < s.length; k++) { c = s.codePointAt(k); if (c > 0xFFFF) k++; o.push(String.fromCodePoint(c)); } return o; };
        var fid = function (ch) { var c = ch.codePointAt(0); return has[c] ? 0 : has2[c] ? 1 : -1; };
        var clean = function (s) { return chars(s).map(function (ch) { return ch === ' ' || fid(ch) >= 0 ? ch : /\s/.test(ch) ? ' ' : ALT[ch] && fid(ALT[ch]) >= 0 ? ALT[ch] : sub; }).join(''); };
        var cw = function (ch) { if (wc[ch] === undefined) wc[ch] = (fid(ch) === 1 ? font2 : font).widthOfTextAtSize(ch, SIZE); return wc[ch]; };
        var wOf = function (s) { var w = 0, a = chars(s); for (var k = 0; k < a.length; k++) w += cw(a[k]); return w; };
        var spW = cw(' '), lines = [];   // {words: [{t, w}], w, last, gap}
        src.split(/\n{2,}/).forEach(function (para) {
          para.split('\n').forEach(function (ln) {
            var words = clean(ln).split(/ +/).filter(Boolean), cur = [], lw = 0;
            var flush = function (last) { lines.push({ words: cur, w: lw, last: last, gap: 0 }); cur = []; lw = 0; };
            words.forEach(function (t) {
              var w = wOf(t);
              while (w > maxW) {   // 한 줄보다 긴 낱말은 글자에서 끊음
                if (cur.length) flush(false);
                var a = chars(t), n = 0, acc = 0; while (n < a.length && acc + cw(a[n]) <= maxW) { acc += cw(a[n]); n++; }
                n = Math.max(1, n); cur = [{ t: a.slice(0, n).join(''), w: acc }]; lw = acc; flush(false); t = a.slice(n).join(''); w = wOf(t);
              }
              if (!t) return;
              if (cur.length && lw + spW + w > maxW) flush(false);
              lw += (cur.length ? spW : 0) + w; cur.push({ t: t, w: w });
            });
            flush(true);
          });
          lines[lines.length - 1].gap = GAP;   // 문단 사이
        });
        var page = null, y = 0, no = 0;
        var draw = function (t, x, yy, size, color) {   // 글꼴이 섞인 낱말은 글꼴별로 나눠
          var a = font2 ? chars(t) : null, o = { x: x, y: yy, size: size, font: font };
          if (color) o.color = color;
          if (!a) { page.drawText(t, o); return; }
          var run = '', rf = 0, flushRun = function () { if (!run) return; o.x = x; o.font = rf === 1 ? font2 : font; page.drawText(run, o); x += o.font.widthOfTextAtSize(run, size); run = ''; };
          for (var k = 0; k < a.length; k++) { var f = fid(a[k]) === 1 ? 1 : 0; if (f !== rf) { flushRun(); rf = f; } run += a[k]; }
          flushRun();
        };
        var newPage = function () { page = pdf.addPage([PW, PH]); no++; y = PH - MT; var s = '- ' + no + ' -'; draw(s, (PW - font.widthOfTextAtSize(s, 9)) / 2, 40, 9, L.rgb(0.4, 0.4, 0.4)); };
        newPage();
        lines.forEach(function (ln) {
          if (y - SIZE < MB) newPage();
          var n = ln.words.length, extra = 0, x = MX;
          if (!ln.last && n > 1) { extra = (maxW - ln.w) / (n - 1); if (extra > spW * 2.2) extra = 0; }   // 양쪽 맞춤(너무 벌어지면 왼쪽 맞춤)
          if (extra < 0.01 && n) draw(ln.words.map(function (w) { return w.t; }).join(' '), x, y - SIZE, SIZE);
          else ln.words.forEach(function (w) { draw(w.t, x, y - SIZE, SIZE); x += w.w + spW + extra; });
          y -= LEAD + ln.gap;
        });
        return pdf.save();
      });
    });
  }
  function newPdf(text, title) {
    return Promise.all([pdflib(), fontBytes('Pretendard-Regular.ttf')]).then(function (R) {
      return buildPdf(R[0].L, R[0].fk, R[1], function () { return fontBytes('NotoSansKR-Hanja.ttf'); }, canon(text), title);
    }).then(function (bytes) { return new Blob([bytes], { type: 'application/pdf' }); });
  }
  function save(blob, name) {   // 내려받기(이 브라우저에서 만든 파일)
    var a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 4000);
  }

  G.AMTextIn = { ACCEPT: ACCEPT, canon: canon, read: read, exportSame: exportSame, newDocx: newDocx, newPdf: newPdf, save: save, sim: sim, _t: { sniff: sniff, decodeText: decodeText, cfb: cfb, hwpParas: hwpParas, pdfLines: pdfLines, pdfParas: pdfParas, align: align, plan: plan, sim: sim, docxToks: docxToks, hwpxToks: hwpxToks, rewritePara: rewritePara, buildPdf: buildPdf, cfbWrite: cfbWrite, hwpNewUnits: hwpNewUnits, hwpEditPara: hwpEditPara, hwpExport: hwpExport, wdiff: wdiff } };
})(window);
