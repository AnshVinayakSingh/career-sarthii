// Question engine: hand-written bank + rule-based generators (no AI, instant, always-correct answers)
// + optional real previous year papers from data/pyq/*.json
const fs = require('node:fs');
const path = require('node:path');
const bank = require('./data/bank.js');

const SUBJ = { pct:'quant', tw:'quant', pl:'quant', ratio:'quant', simp:'quant', series:'reason', coding:'reason', analogy:'reason', syl:'reason', syn:'eng', spell:'eng', err:'eng', polity:'ga', hist:'ga', solar:'ga', sci:'ga', geo:'ga' };
const rng = seed => { let a = (seed ^ 0x9e3779b9) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const mk = r => ({ r, int: (a, b) => a + Math.floor(r() * (b - a + 1)), pick: arr => arr[Math.floor(r() * arr.length)], shuffle(arr) { const x = arr.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; } });

// numeric options: correct answer + 3 distinct wrong ones around it
function numOpts(g, ans, step, suf = '', sufHi = suf) {
  const c = []; for (let k = 1; k <= 6; k++) { c.push(ans + k * step, ans - k * step); }
  const wrong = g.shuffle([...new Set(c.filter(v => v > 0 && v !== ans))]).slice(0, 3);
  const all = g.shuffle([ans, ...wrong]);
  return { a: all.indexOf(ans), en: all.map(v => v + suf), hi: all.map(v => v + sufHi) };
}
const B = (en, hi) => ({ en, hi: hi || en });
const q = (c, qq, o, a, x) => ({ s: SUBJ[c], c, q: qq, o: { en: o.en, hi: o.hi }, a, x });
const gcdOK = (n, d) => n % d === 0;

const GEN = {
  pct(g) {
    const t = g.int(0, 2);
    if (t === 0) { let N, p; do { N = g.pick([120,150,200,250,300,360,400,450,500,600,800]); p = g.pick([5,10,12,15,20,25,30,40,60,75]); } while ((N * p) % 100); const ans = N * p / 100, o = numOpts(g, ans, Math.max(2, Math.round(ans / 8)));
      return q('pct', B(`What is ${p}% of ${N}?`, `${N} का ${p}% कितना होता है?`), o, o.a, B(`${p}/100 x ${N} = ${ans}.`, `${p}/100 x ${N} = ${ans}।`)); }
    if (t === 1) { let a, p, b; do { a = g.pick([40,50,60,80,120,200,250,400]); p = g.pick([10,15,20,25,30,40,50]); b = a * (100 + p) / 100; } while (!Number.isInteger(b)); const o = numOpts(g, p, 5, '%');
      return q('pct', B(`A number increases from ${a} to ${b}. What is the percentage increase?`, `एक संख्या ${a} से बढ़कर ${b} हो गई। प्रतिशत वृद्धि कितनी है?`), o, o.a, B(`Increase = ${b - a}. ${b - a}/${a} x 100 = ${p}%.`, `वृद्धि = ${b - a}। ${b - a}/${a} x 100 = ${p}%।`)); }
    let N, p, V; do { N = g.pick([60,80,120,150,200,250,300,400,500,800]); p = g.pick([10,20,25,40,50,60]); V = N * p / 100; } while (!Number.isInteger(V)); const o = numOpts(g, N, Math.max(10, Math.round(N / 8)));
    return q('pct', B(`${p}% of a number is ${V}. What is the number?`, `किसी संख्या का ${p}% ${V} है। वह संख्या क्या है?`), o, o.a, B(`Number = ${V} x 100 / ${p} = ${N}.`, `संख्या = ${V} x 100 / ${p} = ${N}।`));
  },
  tw(g) {
    if (g.int(0, 1) === 0) { const [a, b] = g.pick([[10,15],[12,24],[20,30],[15,30],[6,12],[18,36],[30,60],[9,18],[8,24],[12,36],[20,60],[10,40],[14,35]]); const ans = a * b / (a + b), o = numOpts(g, ans, 1, ' days', ' दिन');
      return q('tw', B(`A can finish a work in ${a} days and B in ${b} days. Working together, in how many days will they finish it?`, `A किसी काम को ${a} दिन में और B ${b} दिन में पूरा कर सकता है। साथ काम करें तो कितने दिन लगेंगे?`), o, o.a, B(`1/${a} + 1/${b} = ${a + b}/${a * b}. So ${ans} days.`, `1/${a} + 1/${b} = ${a + b}/${a * b}। इसलिए ${ans} दिन।`)); }
    const [m, d, m2] = g.pick([[12,10,8],[6,20,8],[15,8,10],[20,9,12],[10,12,8],[8,15,12],[18,10,15],[24,5,10]]); const ans = m * d / m2, o = numOpts(g, ans, 1, ' days', ' दिन');
    return q('tw', B(`${m} men can complete a work in ${d} days. In how many days will ${m2} men complete it?`, `${m} आदमी एक काम ${d} दिन में पूरा करते हैं। ${m2} आदमी कितने दिन में पूरा करेंगे?`), o, o.a, B(`Total work = ${m} x ${d} = ${m * d} man-days. ${m * d} / ${m2} = ${ans} days.`, `कुल काम = ${m} x ${d} = ${m * d} आदमी-दिन। ${m * d} / ${m2} = ${ans} दिन।`));
  },
  pl(g) {
    const t = g.int(0, 3); const CP = g.pick([200,250,400,500,800,1000,1200,1500,2000]);
    if (t === 0 || t === 1) { let p, SP; do { p = g.pick([5,10,15,20,25]); SP = CP * (100 + p) / 100; } while (!Number.isInteger(SP));
      if (t === 0) { const o = numOpts(g, SP, Math.max(10, CP / 20)); return q('pl', B(`An article bought for Rs ${CP} is sold at a profit of ${p}%. Find the selling price.`, `Rs ${CP} में खरीदी वस्तु ${p}% लाभ पर बेची गई। विक्रय मूल्य ज्ञात कीजिए।`), o, o.a, B(`SP = ${CP} x ${100 + p}/100 = Rs ${SP}.`, `SP = ${CP} x ${100 + p}/100 = Rs ${SP}।`)); }
      const o = numOpts(g, p, 5, '%'); return q('pl', B(`An article bought for Rs ${CP} is sold for Rs ${SP}. What is the profit percent?`, `Rs ${CP} में खरीदी वस्तु Rs ${SP} में बेची गई। लाभ प्रतिशत कितना है?`), o, o.a, B(`Profit = ${SP - CP}. ${SP - CP}/${CP} x 100 = ${p}%.`, `लाभ = ${SP - CP}। ${SP - CP}/${CP} x 100 = ${p}%।`)); }
    if (t === 2) { let L, SP; do { L = g.pick([10,20,25,5]); SP = CP * (100 - L) / 100; } while (!Number.isInteger(SP)); const o = numOpts(g, CP, Math.max(20, CP / 10));
      return q('pl', B(`An article is sold for Rs ${SP} at a loss of ${L}%. What is its cost price?`, `एक वस्तु ${L}% हानि पर Rs ${SP} में बेची गई। उसका क्रय मूल्य क्या है?`), o, o.a, B(`CP = ${SP} x 100 / ${100 - L} = Rs ${CP}.`, `CP = ${SP} x 100 / ${100 - L} = Rs ${CP}।`)); }
    let dsc, SP; do { dsc = g.pick([10,20,25,30]); SP = CP * (100 - dsc) / 100; } while (!Number.isInteger(SP)); const o = numOpts(g, SP, Math.max(10, CP / 20));
    return q('pl', B(`The marked price of an article is Rs ${CP}. After a discount of ${dsc}%, what is the selling price?`, `एक वस्तु का अंकित मूल्य Rs ${CP} है। ${dsc}% छूट के बाद विक्रय मूल्य क्या होगा?`), o, o.a, B(`SP = ${CP} x ${100 - dsc}/100 = Rs ${SP}.`, `SP = ${CP} x ${100 - dsc}/100 = Rs ${SP}।`));
  },
  ratio(g) {
    if (g.int(0, 1) === 0) { const [a, b] = g.pick([[2,3],[3,5],[4,5],[1,2],[3,4],[2,5],[5,7]]), k = g.int(6, 40), N = (a + b) * k, ans = Math.max(a, b) * k, o = numOpts(g, ans, Math.max(2, k));
      return q('ratio', B(`Rs ${N} is divided between two people in the ratio ${a} : ${b}. What is the larger share?`, `Rs ${N} दो व्यक्तियों में ${a} : ${b} के अनुपात में बाँटे गए। बड़ा हिस्सा कितना है?`), o, o.a, B(`Total parts = ${a + b}. One part = ${k}. Larger share = ${Math.max(a, b)} x ${k} = ${ans}.`, `कुल भाग = ${a + b}। एक भाग = ${k}। बड़ा हिस्सा = ${Math.max(a, b)} x ${k} = ${ans}।`)); }
    const [a, b] = g.pick([[3,5],[2,7],[4,9],[3,8],[5,6],[2,3]]), k = g.int(2, 9), ans = a * k, d = b * k, o = numOpts(g, ans, 2);
    return q('ratio', B(`Find x: ${a} : ${b} = x : ${d}`, `x ज्ञात कीजिए: ${a} : ${b} = x : ${d}`), o, o.a, B(`x = ${a} x ${d} / ${b} = ${ans}.`, `x = ${a} x ${d} / ${b} = ${ans}।`));
  },
  simp(g) {
    const t = g.int(0, 3); let e, v;
    if (t === 0) { const a = g.int(10, 60), b = g.int(2, 9), c = g.int(2, 9); e = `${a} + ${b} × ${c}`; v = a + b * c; }
    else if (t === 1) { const a = g.int(10, 50), b = g.int(2, 9), c = g.int(2, 9), d = g.int(2, 9); e = `${a * b} ÷ ${b} + ${c} × ${d}`; v = a + c * d; }
    else if (t === 2) { const a = g.int(5, 30), b = g.int(2, 15), c = g.int(2, 9), d = g.int(1, 20); e = `(${a} + ${b}) × ${c} − ${d}`; v = (a + b) * c - d; }
    else { const a = g.int(12, 30), b = g.int(2, 11); e = `${a}² − ${b}²`; v = a * a - b * b; }
    const o = numOpts(g, v, g.pick([2, 3, 5, 10]));
    return q('simp', B(`Simplify: ${e}`, `सरल कीजिए: ${e}`), o, o.a, B(`Using BODMAS, the value is ${v}.`, `BODMAS के अनुसार मान ${v} है।`));
  },
  series(g) {
    const t = g.int(0, 3); let seq, nxt, why;
    if (t === 0) { const s = g.int(2, 30), d = g.int(3, 11); seq = [0,1,2,3,4].map(i => s + d * i); nxt = s + d * 5; why = `Each term increases by ${d}.`; }
    else if (t === 1) { const s = g.pick([2, 3, 4, 5]), k = g.pick([2, 3]); seq = [0,1,2,3,4].map(i => s * k ** i); nxt = s * k ** 5; why = `Each term is multiplied by ${k}.`; }
    else if (t === 2) { const n = g.int(2, 9); seq = [0,1,2,3,4].map(i => (n + i) ** 2); nxt = (n + 5) ** 2; why = `These are squares of ${n}, ${n + 1}, ${n + 2}, ... so next is ${n + 5}² = ${nxt}.`; }
    else { const s = g.int(1, 10), d = g.int(2, 5); let cur = s; seq = [cur]; for (let i = 0; i < 4; i++) { cur += d + 2 * i; seq.push(cur); } nxt = cur + d + 8; why = `Differences are ${d}, ${d + 2}, ${d + 4}, ${d + 6}, so next difference is ${d + 8}.`; }
    const o = numOpts(g, nxt, g.pick([2, 3, 4, 6]));
    return q('series', B(`Find the next number: ${seq.join(', ')}, ?`, `अगली संख्या ज्ञात कीजिए: ${seq.join(', ')}, ?`), o, o.a, B(why, why));
  },
  coding(g) {
    const W = ['CAT','DOG','BOOK','PEN','FAN','MAP','SUN','RAIN','LION','TREE'], sh = (w, k) => [...w].map(c => String.fromCharCode((c.charCodeAt(0) - 65 + k + 26) % 26 + 65)).join('');
    const k = g.pick([1, 2, 3]), [w1, w2] = g.shuffle(W).slice(0, 2), ans = sh(w2, k);
    const wrong = [...new Set([sh(w2, k + 1), sh(w2, k - 1), sh(w2, -k), sh(w2, k + 2)])].filter(x => x !== ans).slice(0, 3), all = g.shuffle([ans, ...wrong]);
    return q('coding', B(`If ${w1} is coded as ${sh(w1, k)}, how is ${w2} coded in the same way?`, `यदि ${w1} को ${sh(w1, k)} लिखा जाता है, तो ${w2} को उसी प्रकार कैसे लिखा जाएगा?`), { en: all, hi: all }, all.indexOf(ans), B(`Each letter moves ${k} step(s) forward in the alphabet, so ${w2} becomes ${ans}.`, `हर अक्षर वर्णमाला में ${k} स्थान आगे बढ़ता है, इसलिए ${w2} का कोड ${ans} है।`));
  }
};

// bank -> question objects
const BANK = bank.map(([c, qq, o, a, x]) => ({ s: SUBJ[c], c, q: { en: qq }, o: { en: o }, a, x: { en: x } }));
const byChapter = {}; BANK.forEach(b => (byChapter[b.c] = byChapter[b.c] || []).push(b));

// optional real PYQ files: data/pyq/*.json -> [{exam, year, c, s, q, o, a, x}]
const wrap = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : { en: v });
let PYQ = [];
function loadPyq() {
  PYQ = []; const dir = path.join(__dirname, 'data', 'pyq');
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    try { const rows = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); for (const r of rows) if (r.exam && r.year && r.q && Array.isArray(r.o ? (r.o.en || r.o) : null) && Number.isInteger(r.a)) PYQ.push({ exam: String(r.exam), year: Number(r.year), s: r.s || SUBJ[r.c] || 'ga', c: r.c || '', q: wrap(r.q), o: wrap(r.o), a: r.a, x: wrap(r.x || 'See the official answer key.') }); }
    catch (e) { console.error('Bad PYQ file', f, e.message); }
  }
}
loadPyq();

const pyqYears = () => { const m = {}; PYQ.forEach(p => { (m[p.exam] = m[p.exam] || new Set()).add(p.year); }); return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, [...v].sort((a, b) => b - a)])); };
const pyqFor = (exam, year) => PYQ.filter(p => p.exam === exam && p.year === year);

function forChapter(c, n, seed) {
  const g = mk(rng(seed));
  if (GEN[c]) { const out = [], seen = new Set(); for (let i = 0; i < n * 6 && out.length < n; i++) { const x = GEN[c](g); if (!seen.has(x.q.en)) { seen.add(x.q.en); out.push(x); } } return out; }
  return g.shuffle(byChapter[c] || []).slice(0, n);
}
const QUANT = ['pct', 'tw', 'pl', 'ratio', 'simp'], REASON = ['series', 'coding', 'analogy', 'syl'], ENG = ['syn', 'spell', 'err'], GA = ['polity', 'hist', 'solar', 'sci', 'geo'];
function fromPool(pool, n, seed) {
  const g = mk(rng(seed)), per = Math.ceil(n / pool.length), out = [];
  g.shuffle(pool).forEach((c, i) => out.push(...forChapter(c, per, seed + i + 1)));
  const seen = new Set(); return g.shuffle(out.filter(x => (seen.has(x.q.en) ? false : seen.add(x.q.en)))).slice(0, n);
}
const mix = (n, seed) => { const k = Math.max(1, Math.round(n / 4)); const g = mk(rng(seed)); return g.shuffle([...fromPool(QUANT, k, seed), ...fromPool(REASON, k, seed + 11), ...fromPool(ENG, k, seed + 22), ...fromPool(GA, n - 3 * k, seed + 33)]).slice(0, n); };
const paper = (n, seed) => { const a = Math.round(n * .3), b = Math.round(n * .3), c = Math.round(n * .2); const g = mk(rng(seed)); return g.shuffle([...fromPool(QUANT, a, seed), ...fromPool(REASON, b, seed + 11), ...fromPool(ENG, c, seed + 22), ...fromPool(GA, n - a - b - c, seed + 33)]); };
const meta = () => { const chapters = {}; Object.keys(SUBJ).forEach(c => (chapters[c] = GEN[c] ? -1 : (byChapter[c] || []).length)); return { chapters, pyq: pyqYears() }; };

module.exports = { forChapter, mix, paper, meta, pyqFor, loadPyq };
