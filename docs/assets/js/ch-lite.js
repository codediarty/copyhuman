/* 카피휴먼 간이 엔진 CH-Lite 1.0
   서버 엔진(AIMarker DET · HUM)에 닿지 못할 때만 쓰는 브라우저 안 엔진입니다.
   - 판정 규칙은 서버 엔진과 같은 틀(문장 점수 → AI 검출 문장 → 구간 → AI 작성률 → 판정)이고, 기준 숫자도 같습니다.
   - 같은 글은 언제나 같은 결과가 나옵니다(무작위 값 없음).
   - 결과는 추정이며 증명이 아닙니다. */
(function (G) {
  'use strict';

  var J = { HI: 85, MID: 65, LOW: 50, SHORT: 60, SEG_AI: 20, UNFIT_RATE: 40, RISK_RATE: 20, UNFIT_SEG: 50 };
  var CAT = { 1: '번역투', 2: '상투적 연결어', 3: '빈말 · 과장 수식', 4: '틀에 박힌 도입 · 마무리', 5: '대화창 복사 흔적', 6: '단조로운 리듬', 7: '딱딱한 어휘' };
  var WHY = {
    1: '영어를 옮긴 듯한 말(~에 있어서, ~을 통해, ~함으로써)이 자주 나옵니다.',
    2: "'또한 · 따라서 · 결론적으로' 같은 연결어가 문장 첫머리에 틀처럼 붙습니다.",
    3: "'다양한 · 효과적으로 · 중요한 역할'처럼 내용 없이 꾸미는 말이 많습니다.",
    4: "'현대 사회에서', '~에 기여할 것이다'처럼 정해진 시작과 마무리가 보입니다.",
    5: "대화창에서 복사한 흔적(굵은 글씨 기호, 목록 기호, '물론입니다')이 남아 있습니다.",
    6: '문장 길이와 끝맺음이 고르게 반복됩니다.',
    7: "'제고 · 도모 · 함양'처럼 일상에서 잘 쓰지 않는 딱딱한 말이 몰려 있습니다."
  };

  /* [정규식, 분류, 가중치, 보여 줄 이름, 문장 첫머리만] */
  var R = [
    /* 번역투 */
    [/에\s?있어(서)?(?![가-힣])/, 1, 1.2, '~에 있어서'],
    [/(을|를)\s?통(해|하여|한)(?![가-힣])/, 1, 0.9, '~을 통해'],
    [/(함|됨|시킴)으로써/, 1, 1.0, '~함으로써'],
    [/에\s?의(해|하여|한)(?![가-힣])/, 1, 0.6, '~에 의해'],
    [/되어지|되어진|되어져/, 1, 1.1, '되어지다'],
    [/에\s?(대한|대해서?|대하여)(?![가-힣])/, 1, 0.3, '~에 대한'],
    [/에\s?관(한|하여|해서?)(?![가-힣])/, 1, 0.4, '~에 관한'],
    [/(을|를)\s?가지고\s?있/, 1, 0.8, '~을 가지고 있다'],
    [/(하는|되는|한)\s?데\s?있어(서)?/, 1, 1.2, '~하는 데 있어'],
    [/에\s?기반(한|하여|해서?)(?![가-힣])/, 1, 0.7, '~에 기반한'],
    [/(을|를)\s?바탕으로/, 1, 0.5, '~을 바탕으로'],
    [/측면에서/, 1, 0.6, '~측면에서'],
    [/(이라고|라고|다고)\s?할\s?수\s?있(다|을)/, 1, 1.3, '~라고 할 수 있다'],
    [/것으로\s?(보인다|판단된다|사료된다|여겨진다)/, 1, 0.7, '~것으로 보인다'],
    [/(하는|되는|한)\s?것이\s?(중요하다|필요하다|바람직하다)/, 1, 1.0, '~하는 것이 중요하다'],
    [/에\s?주목할\s?필요/, 1, 1.0, '~에 주목할 필요'],
    [/(을|를)\s?수행(하|한|할|함)/, 1, 0.5, '수행하다'],
    [/(이|가)\s?요구된다/, 1, 0.6, '~이 요구된다'],
    [/의\s?일환으로/, 7, 0.8, '~의 일환으로'],
    /* 상투적 연결어(첫머리) */
    [/^(또한|따라서|그러므로|결론적으로|뿐만\s?아니라|이와\s?같이|이처럼|이를\s?통해|이에\s?따라|이를\s?바탕으로|나아가|아울러|더불어|요컨대|종합하면|종합적으로|다시\s?말해|무엇보다|결과적으로|이와\s?더불어|궁극적으로|이러한\s?점에서|특히|한편)(?=[\s,])/, 2, 1.0, '', 1],
    [/^(또한|따라서|그러므로|결론적으로|뿐만\s?아니라|이와\s?같이|이처럼|나아가|아울러|더불어|요컨대|종합하면|다시\s?말해|무엇보다|결과적으로|궁극적으로|특히|한편),/, 2, 0.6, '접속어 뒤 쉼표', 1],
    [/^이러한\s/, 2, 0.7, '이러한 ~', 1],
    [/^(첫째|둘째|셋째|넷째|마지막으로)[,\s]/, 2, 0.6, '첫째 · 둘째', 1],
    /* 빈말 · 과장 수식 */
    [/다양한|다양하게/, 3, 0.8, '다양한'],
    [/효과적(으로|인)/, 3, 0.9, '효과적으로'],
    [/효율적(으로|인)/, 3, 0.7, '효율적으로'],
    [/지속적(으로|인)/, 3, 0.8, '지속적으로'],
    [/체계적(으로|인)/, 3, 0.7, '체계적으로'],
    [/핵심적(인|으로)/, 3, 1.0, '핵심적인'],
    [/중요한\s?역할/, 3, 1.2, '중요한 역할'],
    [/(긍정적|부정적)(인|으로)\s?(영향|효과|변화)/, 3, 1.1, '긍정적인 영향'],
    [/혁신적(인|으로)/, 3, 1.0, '혁신적인'],
    [/필수적(인|으로|이)/, 3, 0.9, '필수적인'],
    [/적극적(으로|인)/, 3, 0.6, '적극적으로'],
    [/다각적(으로|인)|다방면/, 3, 0.9, '다각적으로'],
    [/종합적(으로|인)/, 3, 0.6, '종합적으로'],
    [/포괄적(인|으로)/, 3, 0.6, '포괄적인'],
    [/의미\s?있는|큰\s?의미|중요한\s?의미/, 3, 0.8, '의미 있는'],
    [/획기적/, 3, 1.0, '획기적인'],
    [/원활한|원활하게/, 3, 0.6, '원활한'],
    [/극대화|최적화/, 3, 0.6, '극대화'],
    [/시너지/, 3, 0.9, '시너지'],
    [/주목할\s?만한/, 3, 0.8, '주목할 만한'],
    [/새로운\s?(기회|가능성|지평)/, 3, 0.9, '새로운 기회'],
    [/기회와\s?도전|도전과\s?기회/, 3, 1.2, '기회와 도전'],
    [/급변하는|빠르게\s?변화하는|급속(도로|히)/, 3, 0.9, '급변하는'],
    [/4차\s?산업\s?혁명|디지털\s?전환\s?시대/, 3, 0.9, '4차 산업혁명'],
    [/중요성(이|은)\s?(더욱\s?)?(커지|높아지|강조되|부각되)/, 3, 1.1, '중요성이 커지다'],
    [/실질적(인|으로)/, 3, 0.5, '실질적인'],
    [/전반적(인|으로)/, 3, 0.4, '전반적인'],
    [/심도\s?있는|깊이\s?있는/, 3, 0.7, '심도 있는'],
    [/필수\s?불가결|무궁무진/, 3, 1.0, '필수불가결'],
    /* 틀에 박힌 도입 · 마무리 */
    [/^(현대\s?사회(에서|는)|오늘날|21세기|최근\s(들어\s)?)/, 4, 1.0, '현대 사회에서', 1],
    [/(알아보겠습니다|살펴보겠습니다|알아보자|살펴보자)/, 4, 1.3, '~알아보겠습니다'],
    [/(살펴보고자|논의하고자|고찰하고자|제시하고자)\s?한다/, 4, 0.4, '~하고자 한다'],
    [/것으로\s?기대된다|기대할\s?수\s?있다/, 4, 1.1, '~것으로 기대된다'],
    [/기여할\s?(것이다|수\s?있을\s?것|것으로)/, 4, 1.1, '~에 기여할 것이다'],
    [/시사한다|시사점을\s?(제공|제시)한다/, 4, 0.7, '~을 시사한다'],
    [/의의가\s?있다|의미를\s?(지닌다|갖는다|가진다)/, 4, 0.8, '~의미를 지닌다'],
    [/(할|될)\s?필요가\s?있다[.]?$/, 4, 0.6, '~할 필요가 있다'],
    [/(해야|되어야)\s?할\s?것이다/, 4, 1.0, '~해야 할 것이다'],
    /* 대화창 복사 흔적 */
    [/^(물론입니다|좋습니다|알겠습니다|훌륭한\s?질문)/, 5, 3.0, '물론입니다', 1],
    [/\*\*[^*\n]{1,80}\*\*/, 5, 3.0, '굵은 글씨 기호(**)'],
    [/^#{1,4}\s/, 5, 3.0, '제목 기호(#)', 1],
    [/다음과\s?같(습니다|다)\s?[:：]/, 5, 1.5, '다음과 같습니다:'],
    [/도움이\s?되(셨|었)(으면|길)|궁금한\s?점이\s?있으시면|더\s?필요하시면/, 5, 3.0, '대화 마무리 인사'],
    /* 딱딱한 어휘 */
    [/제고|도모|강구|함양|고취|영위/, 7, 0.7, '제고 · 도모'],
    [/증진|촉진|활성화|내실화|고도화|선진화/, 7, 0.4, '증진 · 촉진'],
    [/(을|를)\s?모색/, 7, 0.6, '모색하다'],
    /* 끝맺음 */
    [/(하고|되고)\s?있다[.]?$/, 6, 0.35, '~하고 있다'],
    [/할\s?수\s?있다[.]?$/, 6, 0.35, '~할 수 있다'],
    [/(하며|되며|이며|하고|되고),\s/, 6, 0.3, '~하며, ~하고,']
  ];

  /* 사람 글에서 자주 보이는 신호(점수를 낮춤) */
  var H = [
    [/(^|\s)(나는|내가|나의|나도|저는|제가|저의|우리\s?(팀|반|집|가족|과|학과))/, -0.8, 'self'],
    [/(거든|더라|잖아|는데요|네요|더군요|ㅋ|ㅎㅎ|ㅠ|ㅜ)/, -1.0, 'talk'],
    [/[가-힣](요|죠)[.!?]?$/, -0.4, 'yo'],
    [/\d+(\.\d+)?\s?(명|개|번|회|건|년|월|일|시간|분|초|원|만원|%|퍼센트|살|세|km|kg|쪽|페이지|문항)/, -0.5, 'num'],
    [/[pβrtFχ]\s?[=<>]\s?[-.\d]/, -0.6, 'stat'],
    [/[“"「『][^”"」』]{2,40}[”"」』]/, -0.3, 'quote'],
    [/[?？]$/, -0.4, 'q'],
    [/[!！]$/, -0.4, 'ex']
  ];

  var CC = String.fromCharCode;
  var ZW = new RegExp('[' + CC(0x200B) + '-' + CC(0x200D) + CC(0x2060) + CC(0xFEFF) + CC(0x00AD) + ']', 'g');
  var SP = new RegExp('[' + CC(0x00A0) + CC(0x2002) + '-' + CC(0x200A) + CC(0x202F) + CC(0x205F) + CC(0x3000) + '\\t]', 'g');
  var LS = new RegExp('[' + CC(0x2028) + CC(0x2029) + ']', 'g');
  function canon(t) {
    return String(t == null ? '' : t).replace(/\r\n?/g, '\n').replace(ZW, '').replace(SP, ' ').replace(LS, '\n')
      .replace(/ {2,}/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\s+|\s+$/g, '');
  }

  /* 문장 나누기: 마침표 · 물음표 · 느낌표(소수점 · 약어 · 이니셜은 넘어감), 줄 바꿈 */
  var ABBR = /(et al|e\.g|i\.e|vs|pp|No|Fig|Vol|cf|Dr|Mr|Ms|Prof|Inc|Ltd|ed|eds|ibid)$/i;
  function sentences(par) {
    var out = [], lines = par.split('\n');
    lines.forEach(function (line, li) {
      var s = 0, i, c;
      for (i = 0; i < line.length; i++) {
        c = line.charAt(i);
        if (!/[.?!。？！…]/.test(c)) continue;
        var nx = line.charAt(i + 1);
        if (c === '.' && /\d/.test(line.charAt(i - 1)) && /\d/.test(nx)) continue;   // 3.14
        while (/[.?!。？！…"'”’)\]」』]/.test(line.charAt(i + 1))) i++;               // 닫는 부호까지
        nx = line.charAt(i + 1);
        if (nx && !/\s/.test(nx)) continue;
        var seg = line.slice(s, i + 1);
        var word = seg.replace(/[.?!。？！…"'”’)\]」』]+$/, '').split(/[\s(]/).pop();
        if (c === '.' && (ABBR.test(word) || /^[A-Z]$/.test(word))) continue;   // et al. · J. Kim
        if (seg.trim()) out.push({ t: seg.trim(), nl: li > 0 && s === 0 ? 1 : 0 });
        s = i + 1;
      }
      var rest = line.slice(s).trim();
      if (rest) out.push({ t: rest, nl: li > 0 && s === 0 ? 1 : 0 });
    });
    return out;
  }

  function charsNoSp(t) { return String(t).replace(/\s+/g, '').length; }
  function sig(x) { return 100 / (1 + Math.exp(-(x - 1.6) * 1.45)); }

  function scoreSentence(t, opt) {
    var raw = 0, hits = [], len = charsNoSp(t);
    if (len >= 28 && len <= 150) raw += 1.0; else if (len < 16) raw -= 0.5; else raw += 0.5;
    R.forEach(function (r) {
      var m = r[0].exec(t);
      if (!m) return;
      raw += r[2];
      hits.push({ cat: r[1], w: r[2], name: r[3] || m[0].replace(/[,\s]+$/, ''), m: m[0].replace(/^\s+|[,\s]+$/g, '') });
    });
    var human = 0;
    H.forEach(function (h) {
      if (!h[0].test(t)) return;
      var w = h[1];
      if (h[2] === 'self' && opt.kind === 'resume') w = -0.2;
      if (h[2] === 'yo' && opt.kind === 'resume') w = -0.1;
      human += w;
    });
    raw += Math.max(human, -1.6);
    return { raw: raw, hits: hits };
  }

  /* 같은 글은 같은 번호(검사번호) */
  function hash(s) {
    var h1 = 0x811c9dc5, h2 = 0x1b873593, i, c;
    for (i = 0; i < s.length; i++) { c = s.charCodeAt(i); h1 ^= c; h1 = Math.imul(h1, 16777619) >>> 0; h2 ^= c; h2 = Math.imul(h2, 2654435761) >>> 0; }
    var x = (h1 >>> 0).toString(16).toUpperCase(), y = (h2 >>> 0).toString(16).toUpperCase();
    return ('00000000' + x).slice(-8) + ('00000000' + y).slice(-8);
  }

  function judge(s) {
    var why = [], mk = function (k, w) {
      var B = { unfit: ['위험', '위험 · 제출 전 수정 필요'], risk: ['주의', '주의 · 일부 문장 수정 권장'], safe: ['양호', '양호 · AI 패턴 적음'], short: ['판단 보류', '판단 보류 · 글이 짧음'] }[k];
      return { key: k, ko: B[0], label: B[1], why: w };
    };
    if (s.chars < J.SHORT) return mk('short', ['글자 수 ' + s.chars + '자(' + J.SHORT + '자 미만은 판단하지 않음)']);
    if (s.rate >= J.UNFIT_RATE) why.push('AI 작성률 ' + s.rate + '%(위험 기준 ' + J.UNFIT_RATE + '% 이상)');
    if (s.segN >= 2 && s.segAi * 100 >= s.segN * J.UNFIT_SEG) why.push('AI 검출 구간 ' + s.segAi + '/' + s.segN + '(위험 기준: 전체 구간의 절반 이상)');
    if (s.chat >= 1) why.push('대화창 복사 흔적 ' + s.chat + '곳(위험 기준 1곳 이상)');
    if (why.length) return mk('unfit', why);
    if (s.rate >= J.RISK_RATE) why.push('AI 작성률 ' + s.rate + '%(주의 기준 ' + J.RISK_RATE + '% 이상)');
    if (s.segAi >= 1) why.push('AI 검출 구간 ' + s.segAi + '/' + s.segN + '(주의 기준 1구간 이상)');
    if (s.hi + s.mid >= 1) why.push('AI 점수 ' + J.MID + ' 이상 문장 ' + (s.hi + s.mid) + '개(주의 기준 1개 이상)');
    if (why.length) return mk('risk', why);
    return mk('safe', ['AI 작성률 ' + s.rate + '%(양호 기준 ' + J.RISK_RATE + '% 미만)', 'AI 검출 구간 없음', 'AI 점수 ' + J.MID + ' 이상 문장 없음']);
  }

  /* 검사 */
  function detect(text, opt) {
    opt = opt || {};
    text = canon(text);
    var paras = text.split(/\n{2,}/), S = [], segs = [], pi = 0, buf = null;
    /* 구간: 문단(30자 미만은 다음 문단과 합치고, 1,000자가 넘으면 문장 경계에서 나눔) */
    paras.forEach(function (p) {
      var ss = sentences(p);
      if (!ss.length) return;
      ss.forEach(function (s) { s.para = pi; });
      pi++;
      if (buf && charsNoSp(buf.text) < 30) { buf.list = buf.list.concat(ss); buf.text += '\n\n' + p; }
      else { if (buf) segs.push(buf); buf = { list: ss.slice(), text: p }; }
    });
    if (buf) segs.push(buf);
    var SEG = [];
    segs.forEach(function (g) {
      var cur = [], n = 0;
      g.list.forEach(function (s) { cur.push(s); n += charsNoSp(s.t); if (n > 1000) { SEG.push(cur); cur = []; n = 0; } });
      if (cur.length) SEG.push(cur);
    });
    /* 문장 점수 */
    SEG.forEach(function (list, gi) {
      list.forEach(function (s) { var r = scoreSentence(s.t, opt); s.raw = r.raw; s.hits = r.hits; s.seg = gi; S.push(s); });
      /* 리듬: 문장 4개 이상인 구간에서 길이가 고르면 */
      if (list.length >= 4) {
        var L = list.map(function (s) { return charsNoSp(s.t); }), mean = L.reduce(function (a, b) { return a + b; }, 0) / L.length;
        var sd = Math.sqrt(L.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / L.length), cv = mean ? sd / mean : 1;
        var ends = {}, maxEnd = 0; list.forEach(function (s) { var e = s.t.replace(/[.?!"'”’)\]]+$/, '').slice(-2); ends[e] = (ends[e] || 0) + 1; if (ends[e] > maxEnd) maxEnd = ends[e]; });
        var bump = (cv < 0.2 ? 0.4 : cv < 0.26 ? 0.2 : 0) + (maxEnd / list.length >= 0.8 ? 0.15 : 0);
        if (bump) list.forEach(function (s) { s.raw += bump; s.hits.push({ cat: 6, w: bump, name: '고른 문장 길이 · 끝맺음', m: '' }); });
      }
    });
    S.forEach(function (s) { s.p0 = sig(s.raw); });
    /* 앞뒤 문장과 함께 보기 */
    S.forEach(function (s, i) {
      var nb = [], a = S[i - 1], b = S[i + 1];
      if (a && a.seg === s.seg) nb.push(a.p0); if (b && b.seg === s.seg) nb.push(b.p0);
      var m = nb.length ? nb.reduce(function (x, y) { return x + y; }, 0) / nb.length : s.p0;
      s.p = Math.max(0, Math.min(99, Math.round(0.75 * s.p0 + 0.25 * m)));
      if (charsNoSp(s.t) < 8) s.p = Math.min(s.p, 30);
    });
    /* 판정 */
    var total = 0, aiChars = 0, lv = { hi: 0, mid: 0, low: 0 }, chat = 0, chatM = {};
    S.forEach(function (s) { s.c = charsNoSp(s.t); total += s.c; s.g = s.p >= J.HI ? 3 : s.p >= J.MID ? 2 : 0; s.ai = s.g ? 1 : 0; });
    var SG = SEG.map(function (list, gi) {
      var c = 0, a = 0;
      S.forEach(function (s) { if (s.seg === gi) { c += s.c; if (s.ai) a += s.c; } });
      return { c: c, a: a, ai: c && a * 100 / c >= J.SEG_AI ? 1 : 0 };
    });
    S.forEach(function (s) { if (!s.ai && SG[s.seg].ai && s.p >= J.LOW) { s.ai = 1; s.g = 1; } });   // 검출 구간 안의 50점 이상 문장은 '낮음'
    var segOut = SG.map(function (g, gi) {
      var idx = [], c = 0, a = 0, hi = 0, mid = 0, low = 0, fc = {};
      S.forEach(function (s, i) { if (s.seg !== gi) return; idx.push(i); c += s.c; if (s.ai) { a += s.c; if (s.g === 3) hi++; else if (s.g === 2) mid++; else low++; s.hits.forEach(function (h) { fc[h.cat] = 1; }); } });
      return { s: idx[0], e: idx[idx.length - 1], c: c, a: a, share: c ? Math.round(a * 100 / c) : 0, ai: c && a * 100 / c >= J.SEG_AI ? 1 : 0, hi: hi, mid: mid, low: low, feat: Object.keys(fc).map(Number) };
    });
    S.forEach(function (s) {
      if (s.ai) { aiChars += s.c; if (s.g === 3) lv.hi++; else if (s.g === 2) lv.mid++; else lv.low++; }
      s.hits.forEach(function (h) { if (h.cat === 5) { chat++; chatM[h.name] = (chatM[h.name] || 0) + 1; } });
    });
    var segN = segOut.length, segAi = segOut.filter(function (g) { return g.ai; }).length;
    var rate = total ? Math.round(aiChars * 100 / total) : 0;
    var band = judge({ chars: total, rate: rate, segN: segN, segAi: segAi, chat: chat, hi: lv.hi, mid: lv.mid });
    /* AI 문체 특성 */
    var F = {};
    S.forEach(function (s) {
      s.hits.forEach(function (h) {
        if (h.w < 0.4) return;   // 사람 글에도 흔한 약한 신호는 점수에만 넣고 특성 목록에서는 뺌
        var f = F[h.cat] = F[h.cat] || { cat: h.cat, name: CAT[h.cat], n: 0, segs: {}, tags: [], why: WHY[h.cat] };
        f.n++; if (s.ai) f.segs[s.seg] = 1;
        var tg = h.m || h.name; if (tg && f.tags.indexOf(tg) < 0 && f.tags.length < 4) f.tags.push(tg);
      });
    });
    var feat = Object.keys(F).map(function (k) { var f = F[k]; var sg = Object.keys(f.segs).length; return { cat: f.cat, name: f.name, n: f.n, segs: sg, share: segAi ? Math.round(sg * 100 / segAi) : 0, tags: f.tags, why: f.why }; })
      .sort(function (a, b) { return (b.segs - a.segs) || (b.n - a.n) || (a.cat - b.cat); });
    var cats = feat.map(function (f) { return { cat: f.cat, name: f.name, n: f.n }; });
    var aiN = lv.hi + lv.mid + lv.low;
    var top = feat.slice(0, 2).map(function (f) { return "'" + f.name + "'"; }).join('과 ');
    var opinion = [];
    if (band.key === 'short') opinion.push('글이 짧아(' + total + '자) 판정하지 않았습니다. ' + J.SHORT + '자 이상을 넣어 주세요.');
    else {
      opinion.push('검사한 글 ' + total.toLocaleString('ko-KR') + '자 가운데 ' + aiChars.toLocaleString('ko-KR') + '자(' + rate + '%)가 AI 작성 패턴과 비슷한 문장으로 나왔습니다.');
      opinion.push(segN + '개 구간 가운데 ' + segAi + '개 구간(' + (segN ? Math.round(segAi * 100 / segN) : 0) + '%)에서 AI 작성 패턴이 뚜렷합니다.');
      if (top) opinion.push('가장 많이 나온 AI 문체 특성은 ' + top + '입니다.');
      opinion.push('AI 검출 문장은 ' + aiN + '개(높음 ' + lv.hi + ' · 중간 ' + lv.mid + ' · 낮음 ' + lv.low + ')입니다. 높음 · 중간 문장부터 고치면 AI 작성률이 가장 크게 내려갑니다.');
      opinion.push(band.key === 'unfit' ? '지금 상태로 제출하는 것은 권하지 않습니다. 검출 문장을 고쳐 쓰거나 휴머나이징으로 다듬은 뒤 다시 검사해 보세요.' : band.key === 'risk' ? '일부 문장이 AI 문체로 읽힙니다. 표시된 문장을 먼저 다듬어 보세요.' : 'AI 문체가 적습니다. 그래도 제출 전 표현을 한 번 더 확인해 보세요.');
    }
    return {
      ok: true, engine: 'lite',
      ai: {
        v: '1.0', crit: 'CHJ-1.0', critName: '카피휴먼 판정 기준 1.0', model: 'ch-lite-2026.10',
        rate: rate, band: band, short: total < 150, n: S.length, chars: total, aiChars: aiChars, aiN: aiN, lv: lv,
        segN: segN, segAi: segAi, chat: chat, chatList: Object.keys(chatM).map(function (k) { return { name: k, n: chatM[k] }; }),
        cats: cats, feat: feat, opinion: opinion, cn: 'L-' + hash(text).slice(0, 5) + '-' + hash(text).slice(5, 10),
        sentences: S.map(function (s) { return { t: s.t, p: s.p, g: s.g, ai: s.ai, nl: s.nl, para: s.para, seg: s.seg, hits: s.hits }; }),
        segs: segOut
      },
      text: text
    };
  }

  /* 무료 보기: 가장 뚜렷한 문장 2개만 위치를 보여 주고 나머지는 잠금(서버 엔진과 같은 범위) */
  function freeView(R0, show) {
    show = show == null ? 2 : show;
    var a = JSON.parse(JSON.stringify(R0.ai));
    var order = a.sentences.map(function (s, i) { return { i: i, p: s.ai ? s.p : -1 }; }).filter(function (x) { return x.p >= 0; }).sort(function (x, y) { return y.p - x.p || x.i - y.i; }).slice(0, show).map(function (x) { return x.i; });
    a.sentences = a.sentences.map(function (s, i) { return order.indexOf(i) >= 0 ? s : { t: s.t, nl: s.nl, para: s.para, lock: 1 }; });
    a.feat = a.feat.map(function (f, i) { return i === 0 ? f : { cat: f.cat, name: f.name, n: f.n, segs: f.segs, share: f.share, tags: [], why: f.why, lock: 1 }; });
    a.segLock = 1; delete a.segs; a.shown = order.length; a.locked = true;
    return { ok: true, engine: 'lite', ai: a, full: false };
  }

  /* 미리보기 다듬기(첫 문단): 자주 나오는 AI 말버릇만 바꿔 보여 줍니다 */
  function bat(ch) { var c = ch.charCodeAt(0) - 0xAC00; if (c < 0 || c > 11171) return 0; return c % 28; }   // 받침 번호(0 없음, 8 ㄹ)
  var FIX = [
    [/에\s?있어서/g, '에서'], [/에\s?있어(?![가-힣])/g, '에서'],
    [/([가-힣]+)(을|를)\s?통(해|하여)(?![가-힣])/g, function (m, a) { var b = bat(a.slice(-1)); return a + (b === 0 || b === 8 ? '로' : '으로'); }],
    [/데\s?있어서?(?![가-힣])/g, '데'],
    [/([가-힣]+)함으로써/g, '$1해서'], [/됨으로써/g, '되면서'],
    [/되어지는/g, '되는'], [/되어진/g, '된'], [/되어지/g, '되'],
    [/(^|[.?!]\s+)(또한|따라서|그러므로|뿐만 아니라|아울러|더불어|나아가),\s?/g, '$1$2 '],
    [/(^|[.?!]\s+)결론적으로,?\s?/g, '$1결국 '], [/(^|[.?!]\s+)이러한\s/g, '$1이런 '], [/(^|[.?!]\s+)이와\s?같이,?\s?/g, '$1이처럼 '],
    [/다양한/g, '여러'], [/효과적으로/g, '잘'], [/지속적으로/g, '꾸준히'], [/핵심적인/g, '핵심'], [/필수적으로/g, '반드시'],
    [/체계적으로/g, '꼼꼼히'], [/다각적으로/g, '여러 면에서'], [/적극적으로/g, '적극'],
    [/중요한\s?역할을\s?(수행)?한다/g, '중요하다'], [/중요한\s?역할을\s?(수행)?하고\s?있다/g, '중요하다'],
    [/긍정적인\s?영향을\s?미칠\s?것으로\s?기대된다/g, '도움이 될 것이다'], [/긍정적인\s?영향을\s?(미친다|준다)/g, '도움이 된다'], [/긍정적인\s?영향을\s?미치고\s?있다/g, '도움이 되고 있다'],
    [/(이라고|라고)\s?할\s?수\s?있다/g, '이다'], [/([가-힣])다고\s?할\s?수\s?있다/g, '$1다'],
    [/할\s?필요가\s?있다/g, '해야 한다'], [/것으로\s?기대된다/g, '것이다'],
    [/을\s?가지고\s?있다/g, '이 있다'], [/를\s?가지고\s?있다/g, '가 있다']
  ];
  function preview(text) {
    text = canon(text);
    var first = text.split(/\n{2,}/)[0] || '', out = first, changes = [];
    FIX.forEach(function (f) {
      out = out.replace(f[0], function () {
        var args = Array.prototype.slice.call(arguments), m = args[0], rep = typeof f[1] === 'function' ? f[1].apply(null, args) : m.replace(new RegExp(f[0].source, f[0].flags.replace('g', '')), f[1]);
        if (rep !== m) changes.push({ from: m.replace(/^[.?!]\s*/, '').trim(), to: rep.replace(/^[.?!]\s*/, '').trim() });
        return rep;
      });
    });
    return { ok: true, engine: 'lite', preview: true, src: first, text: out, changes: changes.length, samples: changes.slice(0, 6), cut: text.length > first.length, total: text.length, shown: first.length };
  }

  var API = { J: J, CAT: CAT, WHY: WHY, canon: canon, sentences: sentences, detect: detect, freeView: freeView, preview: preview, judge: judge, hash: hash };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else G.CHLite = API;
})(typeof window !== 'undefined' ? window : this);
