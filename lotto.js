/* 로또 6/45 계산 모듈 (화면과 분리 — node 테스트에서도 그대로 불러온다)
 * rows: [회차, 날짜, n1..n6, 보너스]  (public/data/draws.json 의 rows)
 * 이 앱의 "추천"은 번호를 고르는 방식을 다르게 한 것일 뿐, 당첨 확률은 어떤 조합이든 같다(1/8,145,060).
 */
(function (root) {
  'use strict';

  var BALL_COLORS = [[10, '#fbc400'], [20, '#69c8f2'], [30, '#ff7272'], [40, '#aaaaaa'], [45, '#b0d840']];
  function ballColor(n) { for (var i = 0; i < BALL_COLORS.length; i++) if (n <= BALL_COLORS[i][0]) return BALL_COLORS[i][1]; return '#aaa'; }
  function zone(n) { return Math.min(4, Math.floor((n - 1) / 10)); }          // 0:1~10 … 4:41~45
  var ZONE_NAMES = ['1~10', '11~20', '21~30', '31~40', '41~45'];

  // ---- 난수: 암호학적 난수(crypto) 사용, 없으면 Math.random ----
  function rand() {
    var c = root.crypto || (typeof require === 'function' ? (function () { try { return require('node:crypto').webcrypto; } catch (e) { return null; } })() : null);
    if (c && c.getRandomValues) { var a = new Uint32Array(1); c.getRandomValues(a); return a[0] / 4294967296; }
    return Math.random();
  }

  // ---- 한 회차 정보 ----
  function draw(r) { return { round: r[0], date: r[1], nums: r.slice(2, 8), bonus: r[8] }; }
  function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
  function oddCount(a) { var c = 0; for (var i = 0; i < a.length; i++) if (a[i] % 2) c++; return c; }
  function consecutivePairs(a) { var s = a.slice().sort(function (x, y) { return x - y; }), c = 0; for (var i = 1; i < s.length; i++) if (s[i] - s[i - 1] === 1) c++; return c; }
  function zonesUsed(a) { var z = {}; a.forEach(function (n) { z[zone(n)] = 1; }); return Object.keys(z).length; }

  // ---- 통계 ----
  // rows 구간(from~to 회차)의 번호별 출현·보너스·미출현 기간과 분포를 계산한다.
  function stats(rows, from, to, withBonus) {
    var cut = rows.filter(function (r) { return r[0] >= from && r[0] <= to; });
    var freq = new Array(46).fill(0), bfreq = new Array(46).fill(0), last = new Array(46).fill(0);
    var oddDist = new Array(7).fill(0), zoneTotal = new Array(5).fill(0), sumHist = {}, consec = 0, consecRows = 0;
    var maxRound = cut.length ? cut[cut.length - 1][0] : 0;
    cut.forEach(function (r) {
      var nums = r.slice(2, 8);
      nums.forEach(function (n) { freq[n]++; last[n] = r[0]; zoneTotal[zone(n)]++; });
      bfreq[r[8]]++; if (withBonus) freq[r[8]]++; if (withBonus) last[r[8]] = Math.max(last[r[8]], r[0]);
      oddDist[oddCount(nums)]++;
      var b = Math.floor(sum(nums) / 20) * 20; sumHist[b] = (sumHist[b] || 0) + 1;
      var cp = consecutivePairs(nums); if (cp) consecRows++; consec += cp;
    });
    var gap = new Array(46).fill(0);
    for (var n = 1; n <= 45; n++) gap[n] = last[n] ? maxRound - last[n] : (cut.length ? cut.length : 0);
    return { count: cut.length, from: cut.length ? cut[0][0] : 0, to: maxRound, freq: freq, bfreq: bfreq, gap: gap, last: last,
      oddDist: oddDist, zoneTotal: zoneTotal, sumHist: sumHist, consecRows: consecRows, rows: cut };
  }

  // 번호 순위(내림차순): freq 가 같으면 번호가 작은 쪽 먼저
  function ranked(arr) {
    var out = []; for (var n = 1; n <= 45; n++) out.push({ n: n, v: arr[n] });
    return out.sort(function (a, b) { return b.v - a.v || a.n - b.n; });
  }

  // 한 번호의 상세: 출현 횟수, 마지막 회차, 평균 간격, 위치별 횟수
  function numberDetail(rows, n) {
    var hits = [], pos = [0, 0, 0, 0, 0, 0], bonus = 0;
    rows.forEach(function (r) {
      for (var i = 2; i < 8; i++) if (r[i] === n) { hits.push(r[0]); pos[i - 2]++; }
      if (r[8] === n) bonus++;
    });
    var gaps = []; for (var i = 1; i < hits.length; i++) gaps.push(hits[i] - hits[i - 1]);
    var avg = gaps.length ? sum(gaps) / gaps.length : 0;
    var latest = rows.length ? rows[rows.length - 1][0] : 0;
    return { n: n, count: hits.length, last: hits.length ? hits[hits.length - 1] : 0, since: hits.length ? latest - hits[hits.length - 1] : latest,
      avgGap: avg, maxGap: gaps.length ? Math.max.apply(null, gaps) : 0, pos: pos, bonus: bonus };
  }

  // ---- 균형 기준: 지금까지의 당첨 조합 중 몇 %가 이 조건에 들어오는지 계산해서 보여준다 ----
  var BALANCE = { oddMin: 2, oddMax: 4, sumMin: 100, sumMax: 175, zonesMin: 3, consecMax: 1 };
  function balanced(nums) {
    var o = oddCount(nums), s = sum(nums);
    return o >= BALANCE.oddMin && o <= BALANCE.oddMax && s >= BALANCE.sumMin && s <= BALANCE.sumMax &&
      zonesUsed(nums) >= BALANCE.zonesMin && consecutivePairs(nums) <= BALANCE.consecMax;
  }
  function balanceShare(rows) {
    if (!rows.length) return 0;
    var c = 0; rows.forEach(function (r) { if (balanced(r.slice(2, 8))) c++; });
    return c / rows.length;
  }

  // ---- 추천 ----
  // 가중치 맵 w[1..45] 에서 중복 없이 k개 뽑기
  function pickWeighted(w, k, pool) {
    var picked = [], cand = pool.slice(), ws = cand.map(function (n) { return w[n]; });
    while (picked.length < k && cand.length) {
      var tot = sum(ws), r = rand() * tot, i = 0;
      for (; i < cand.length - 1; i++) { r -= ws[i]; if (r < 0) break; }
      picked.push(cand[i]); cand.splice(i, 1); ws.splice(i, 1);
    }
    return picked;
  }

  var MODES = {
    random: { name: '순수 랜덤', desc: '1~45에서 완전히 무작위로 뽑아요.' },
    balance: { name: '균형형', desc: '홀짝·합계·구간이 역대 당첨 조합처럼 고르게 퍼지는 조합만 골라요.' },
    hot: { name: '많이 나온 번호', desc: '최근 회차에서 자주 나온 번호에 가중치를 줘요.' },
    cold: { name: '오래 안 나온 번호', desc: '한동안 나오지 않은 번호에 가중치를 줘요.' },
    mix: { name: '통계 혼합', desc: '자주 나온 번호와 쉬어간 번호를 섞고 균형 조건까지 맞춰요.' }
  };

  /* opts: { mode, fixed:[], exclude:[], window:30 (최근 몇 회 기준), prev:[직전 회차 번호] }
   * 반환: { nums:[6개 오름차순], relaxed:bool (균형 조건을 못 맞춰 완화했는지) } */
  function recommendOne(rows, opts) {
    opts = opts || {};
    var mode = opts.mode || 'balance';
    var fixed = (opts.fixed || []).slice(0, 6), exclude = opts.exclude || [];
    var pool = []; for (var n = 1; n <= 45; n++) if (exclude.indexOf(n) < 0 && fixed.indexOf(n) < 0) pool.push(n);
    var need = 6 - fixed.length;
    if (need < 0 || pool.length < need) return { nums: [], relaxed: false, error: '고정·제외 번호 때문에 6개를 만들 수 없어요.' };

    var w = new Array(46).fill(1);
    if (mode === 'hot' || mode === 'cold' || mode === 'mix') {
      var win = opts.window || 30, to = rows.length ? rows[rows.length - 1][0] : 0;
      var st = stats(rows, to - win + 1, to, false);
      var avgF = st.count * 6 / 45, avgG = 45 / 6;
      for (var m = 1; m <= 45; m++) {
        var hotW = 0.4 + st.freq[m] / Math.max(avgF, 0.0001);                // 평균 출현이면 1.4
        var coldW = 0.4 + st.gap[m] / avgG;                                   // 평균 간격이면 1.4
        w[m] = mode === 'hot' ? hotW : mode === 'cold' ? coldW : (hotW + coldW) / 2;
      }
    }
    var useFilter = mode === 'balance' || mode === 'mix';
    var prev = opts.prev || [];
    for (var t = 0; t < 4000; t++) {
      var nums = fixed.concat(pickWeighted(w, need, pool)).sort(function (a, b) { return a - b; });
      if (!useFilter) return { nums: nums, relaxed: false };
      if (balanced(nums) && prev.filter(function (p) { return nums.indexOf(p) >= 0; }).length <= 2) return { nums: nums, relaxed: false };
    }
    // 고정수가 많아 균형 조건을 못 맞추면 조건 없이 뽑고 알려 준다
    return { nums: fixed.concat(pickWeighted(w, need, pool)).sort(function (a, b) { return a - b; }), relaxed: true };
  }

  // 여러 게임: 서로 같은 조합이 나오지 않게 한다
  function recommend(rows, opts, games) {
    var out = [], seen = {}, tries = 0;
    while (out.length < games && tries < 200) {
      tries++;
      var r = recommendOne(rows, opts);
      if (r.error) return { error: r.error, games: [] };
      var key = r.nums.join(',');
      if (seen[key]) continue;
      seen[key] = 1; out.push(r);
    }
    return { games: out };
  }

  // ---- 조합 설명(번호 하나하나가 아니라 "이 조합의 모양") ----
  function describe(rows, nums) {
    var s = sum(nums), o = oddCount(nums);
    var best = 0, bestRound = 0;                       // 과거 당첨 조합과 겹친 최대 개수(같으면 가장 최근 회차)
    rows.forEach(function (r) {
      var m = 0; for (var i = 2; i < 8; i++) if (nums.indexOf(r[i]) >= 0) m++;
      if (m >= best && m > 0) { best = m; bestRound = r[0]; }
    });
    return { sum: s, odd: o, even: 6 - o, zones: zonesUsed(nums), consec: consecutivePairs(nums), balanced: balanced(nums), bestMatch: best, bestRound: bestRound };
  }

  // ---- 당첨 확인 ----
  function check(nums, d) {
    var m = 0; nums.forEach(function (n) { if (d.nums.indexOf(n) >= 0) m++; });
    var b = nums.indexOf(d.bonus) >= 0;
    var rank = m === 6 ? 1 : (m === 5 && b) ? 2 : m === 5 ? 3 : m === 4 ? 4 : m === 3 ? 5 : 0;
    return { match: m, bonus: b, rank: rank, hit: nums.filter(function (n) { return d.nums.indexOf(n) >= 0; }) };
  }

  // ---- 다음 추첨: 매주 토요일 20:35 (KST) ----
  function nextDraw(now) {
    now = now || new Date();
    var kst = new Date(now.getTime() + 9 * 3600e3);                  // UTC 필드를 KST 로 읽기 위해 9시간 더함
    var dow = kst.getUTCDay(), add = (6 - dow + 7) % 7;
    var t = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + add, 20, 35) - 9 * 3600e3;
    if (t <= now.getTime() - 40 * 60e3) t += 7 * 864e5;               // 추첨 40분 뒤까지는 "추첨 중"으로 두고 그 뒤는 다음 주
    return new Date(t);
  }
  // 날짜로 회차 번호를 계산(1회 = 2002-12-07)
  function roundOfDate(d) { return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(2002, 11, 7)) / (7 * 864e5)) + 1; }

  var api = { ballColor: ballColor, zone: zone, ZONE_NAMES: ZONE_NAMES, rand: rand, draw: draw, sum: sum, oddCount: oddCount,
    consecutivePairs: consecutivePairs, zonesUsed: zonesUsed, stats: stats, ranked: ranked, numberDetail: numberDetail,
    BALANCE: BALANCE, balanced: balanced, balanceShare: balanceShare, MODES: MODES, recommendOne: recommendOne, recommend: recommend,
    describe: describe, check: check, nextDraw: nextDraw, roundOfDate: roundOfDate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Lotto = api;
})(typeof window !== 'undefined' ? window : globalThis);
