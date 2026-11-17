'use strict';
/* Exam-pattern model papers + attempted-question log. Wired up from server.js via ctx. */
const crypto = require('node:crypto');

const SUB = {
  quant: { en: 'Quantitative Aptitude', hi: 'मात्रात्मक योग्यता', t: 'number system, simplification, percentage, ratio and proportion, average, profit and loss, discount, simple and compound interest, time and work, pipes and cisterns, time speed distance, mixtures, algebra, geometry, mensuration, trigonometry, data interpretation' },
  reason: { en: 'Reasoning', hi: 'तर्कशक्ति', t: 'analogy, classification, number and letter series, coding-decoding, blood relations, direction sense, ranking and order, syllogism, venn diagrams, matrix, calendar, clock, inequality, statement and conclusion, dice and cubes described in words' },
  eng: { en: 'English', hi: 'अंग्रेज़ी', lang: 'en', t: 'synonyms, antonyms, one word substitution, idioms and phrases, spelling, error spotting, sentence improvement, fill in the blanks, active-passive, direct-indirect speech, para jumbles, single sentence based questions' },
  hindi: { en: 'Hindi', hi: 'हिंदी', lang: 'hi', t: 'संधि, समास, पर्यायवाची, विलोम, मुहावरे और लोकोक्तियाँ, शब्द शुद्धि, वाक्य शुद्धि, तत्सम-तद्भव, अनेकार्थी शब्द, एक शब्द के लिए अनेक शब्द, काल, कारक, उपसर्ग-प्रत्यय, रस और अलंकार' },
  ga: { en: 'General Awareness', hi: 'सामान्य जागरूकता', t: 'history, polity, geography, economy, general science, static GK, awards, books and authors, sports, important days, national and international organisations, schemes' },
  sci: { en: 'General Science', hi: 'सामान्य विज्ञान', t: 'physics, chemistry, biology, human body, diseases and nutrition, everyday science, units and measurements, metals and non-metals, acids and bases' },
  comp: { en: 'Computer Fundamentals', hi: 'कंप्यूटर की बुनियादी जानकारी', t: 'computer basics, hardware, software, MS Office, internet, networking, shortcuts, number systems, memory, security' },
  hist: { en: 'History and Culture', hi: 'इतिहास एवं संस्कृति', t: 'ancient, medieval, modern India, freedom struggle, art and culture, architecture, religion movements' },
  polity: { en: 'Polity and Governance', hi: 'राजव्यवस्था एवं शासन', t: 'constitution, fundamental rights, DPSP, parliament, president, judiciary, amendments, federalism, local government, constitutional bodies' },
  geo: { en: 'Geography', hi: 'भूगोल', t: 'physical geography, Indian geography, rivers, climate, soils, agriculture, minerals, world geography, maps' },
  eco: { en: 'Economy', hi: 'अर्थव्यवस्था', t: 'basic concepts, banking, RBI, inflation, budget, taxation, planning, poverty, schemes, external sector' },
  env: { en: 'Environment and Ecology', hi: 'पर्यावरण एवं पारिस्थितिकी', t: 'ecosystems, biodiversity, climate change, conventions, protected areas, pollution, species' },
  st: { en: 'Science and Technology', hi: 'विज्ञान एवं प्रौद्योगिकी', t: 'space, defence tech, IT, biotechnology, nuclear, energy, health science, recent technology basics' },
  ca: { en: 'Current Affairs', hi: 'समसामयिकी', t: 'major national and international developments, government schemes, reports and indices, summits, appointments, sports events (prefer well-established facts)' },
  up: { en: 'Uttar Pradesh GK and Current Affairs', hi: 'उत्तर प्रदेश सामान्य ज्ञान एवं समसामयिकी', t: 'UP history, geography, culture, districts, rivers, economy, schemes, personalities, fairs and festivals, government departments' }
};

/* [subject id, questions, marks per question, negative per wrong answer, optional display-name override] */
const D = (dur, rows, note) => ({ dur, note, s: rows.map(([id, n, m, neg, o]) => Object.assign({ id, n, m, neg }, o || {})) });
const T = 1 / 3;
const PATTERNS = {
  'ssc-mts': D(90, [['quant', 20, 3, 1, { en: 'Numerical and Mathematical Ability', hi: 'संख्यात्मक एवं गणितीय योग्यता' }], ['reason', 20, 3, 1, { en: 'Reasoning Ability and Problem Solving', hi: 'तर्कशक्ति एवं समस्या समाधान' }], ['eng', 25, 3, 1], ['ga', 25, 3, 1]]),
  'ssc-gd': D(60, [['reason', 20, 2, 0.25, { en: 'General Intelligence and Reasoning', hi: 'सामान्य बुद्धिमत्ता एवं तर्कशक्ति' }], ['ga', 20, 2, 0.25, { en: 'General Knowledge and Awareness', hi: 'सामान्य ज्ञान एवं जागरूकता' }], ['quant', 20, 2, 0.25, { en: 'Elementary Mathematics', hi: 'प्रारंभिक गणित' }], ['eng', 20, 2, 0.25]]),
  'rrb-d': D(90, [['quant', 25, 1, T, { en: 'Mathematics', hi: 'गणित' }], ['reason', 30, 1, T, { en: 'General Intelligence and Reasoning', hi: 'सामान्य बुद्धिमत्ता एवं तर्कशक्ति' }], ['sci', 25, 1, T], ['ga', 20, 1, T, { en: 'General Awareness and Current Affairs', hi: 'सामान्य जागरूकता एवं समसामयिकी' }]]),
  gds: D(40, [['quant', 20, 1, 0.25, { en: 'Mathematics', hi: 'गणित' }], ['eng', 20, 1, 0.25], ['ga', 20, 1, 0.25]], { en: 'India Post GDS has no official written exam (selection is by 10th marks merit). This is a practice paper.', hi: 'इंडिया पोस्ट GDS में कोई लिखित परीक्षा नहीं होती (चयन 10वीं के अंकों की मेरिट से)। यह अभ्यास पेपर है।' }),
  agni: D(60, [['ga', 20, 2, 0.5, { en: 'General Knowledge', hi: 'सामान्य ज्ञान' }], ['sci', 15, 2, 0.5], ['quant', 15, 2, 0.5, { en: 'Mathematics', hi: 'गणित' }]]),
  'ssc-chsl': D(60, [['reason', 25, 2, 0.5, { en: 'General Intelligence', hi: 'सामान्य बुद्धिमत्ता' }], ['eng', 25, 2, 0.5], ['quant', 25, 2, 0.5], ['ga', 25, 2, 0.5]]),
  dp: D(90, [['ga', 50, 1, 0.25, { en: 'General Knowledge and Current Affairs', hi: 'सामान्य ज्ञान एवं समसामयिकी' }], ['reason', 25, 1, 0.25], ['quant', 15, 1, 0.25, { en: 'Numerical Ability', hi: 'संख्यात्मक योग्यता' }], ['comp', 10, 1, 0.25]]),
  'up-police': D(120, [['ga', 38, 2, 0.5, { en: 'General Knowledge', hi: 'सामान्य ज्ञान' }], ['hindi', 37, 2, 0.5], ['quant', 38, 2, 0.5, { en: 'Numerical and Mental Ability', hi: 'संख्यात्मक एवं मानसिक योग्यता' }], ['reason', 37, 2, 0.5, { en: 'Mental Aptitude, IQ and Reasoning', hi: 'मानसिक अभिरुचि, बुद्धिलब्धि एवं तर्कशक्ति' }]]),
  'rrb-ntpc': D(90, [['quant', 30, 1, T, { en: 'Mathematics', hi: 'गणित' }], ['reason', 30, 1, T, { en: 'General Intelligence and Reasoning', hi: 'सामान्य बुद्धिमत्ता एवं तर्कशक्ति' }], ['ga', 40, 1, T, { en: 'General Awareness', hi: 'सामान्य जागरूकता' }]]),
  nda: D(300, [['quant', 120, 2.5, 2.5 / 3, { en: 'Mathematics', hi: 'गणित' }], ['eng', 50, 4, 4 / 3, { en: 'English (GAT)', hi: 'अंग्रेज़ी (GAT)' }], ['ga', 100, 4, 4 / 3, { en: 'General Knowledge (GAT)', hi: 'सामान्य ज्ञान (GAT)' }]]),
  'ssc-cgl': D(60, [['reason', 25, 2, 0.5, { en: 'General Intelligence and Reasoning', hi: 'सामान्य बुद्धिमत्ता एवं तर्कशक्ति' }], ['ga', 25, 2, 0.5, { en: 'General Awareness', hi: 'सामान्य जागरूकता' }], ['quant', 25, 2, 0.5], ['eng', 25, 2, 0.5, { en: 'English Comprehension', hi: 'अंग्रेज़ी बोधन' }]], { en: 'Tier 1 pattern.', hi: 'टियर 1 पैटर्न।' }),
  'ibps-clerk': D(60, [['eng', 30, 1, 0.25, { en: 'English Language', hi: 'अंग्रेज़ी भाषा' }], ['quant', 35, 1, 0.25, { en: 'Numerical Ability', hi: 'संख्यात्मक अभिक्षमता' }], ['reason', 35, 1, 0.25, { en: 'Reasoning Ability', hi: 'तर्कशक्ति' }]], { en: 'Prelims pattern.', hi: 'प्रारंभिक परीक्षा पैटर्न।' }),
  'ibps-po': D(60, [['eng', 30, 1, 0.25, { en: 'English Language', hi: 'अंग्रेज़ी भाषा' }], ['quant', 35, 1, 0.25], ['reason', 35, 1, 0.25, { en: 'Reasoning Ability', hi: 'तर्कशक्ति' }]], { en: 'Prelims pattern.', hi: 'प्रारंभिक परीक्षा पैटर्न।' }),
  'sbi-po': D(60, [['eng', 30, 1, 0.25, { en: 'English Language', hi: 'अंग्रेज़ी भाषा' }], ['quant', 35, 1, 0.25], ['reason', 35, 1, 0.25, { en: 'Reasoning Ability', hi: 'तर्कशक्ति' }]], { en: 'Prelims pattern.', hi: 'प्रारंभिक परीक्षा पैटर्न।' }),
  cds: D(360, [['eng', 120, 100 / 120, 100 / 120 / 3, { en: 'English', hi: 'अंग्रेज़ी' }], ['ga', 120, 100 / 120, 100 / 120 / 3, { en: 'General Knowledge', hi: 'सामान्य ज्ञान' }], ['quant', 100, 1, T, { en: 'Elementary Mathematics', hi: 'प्रारंभिक गणित' }]], { en: 'IMA / INA / AFA pattern (three papers combined).', hi: 'IMA / INA / AFA पैटर्न (तीनों पेपर एक साथ)।' }),
  upsc: D(120, [['hist', 16, 2, 2 / 3], ['geo', 15, 2, 2 / 3], ['polity', 17, 2, 2 / 3], ['eco', 17, 2, 2 / 3], ['env', 15, 2, 2 / 3], ['st', 10, 2, 2 / 3], ['ca', 10, 2, 2 / 3]], { en: 'Prelims General Studies Paper 1 pattern.', hi: 'प्रारंभिक सामान्य अध्ययन पेपर 1 पैटर्न।' }),
  uppsc: D(120, [['hist', 30, 4 / 3, 4 / 9], ['polity', 25, 4 / 3, 4 / 9], ['geo', 25, 4 / 3, 4 / 9], ['eco', 20, 4 / 3, 4 / 9], ['sci', 25, 4 / 3, 4 / 9], ['up', 25, 4 / 3, 4 / 9]], { en: 'Prelims General Studies Paper 1 pattern.', hi: 'प्रारंभिक सामान्य अध्ययन पेपर 1 पैटर्न।' })
};
const DEFAULT = D(60, [['quant', 25, 1, 0.25], ['reason', 25, 1, 0.25], ['eng', 25, 1, 0.25], ['ga', 25, 1, 0.25]]);

const r2 = x => Math.round(x * 100) / 100;
function patternFor(exam) {
  const p = PATTERNS[exam] || DEFAULT;
  const subjects = p.s.map(s => ({ id: s.id, en: s.en || SUB[s.id].en, hi: s.hi || SUB[s.id].hi, n: s.n, m: r2(s.m * 1000) / 1000, neg: r2(s.neg * 1000) / 1000, _m: s.m, _neg: s.neg }));
  return { dur: p.dur, note: p.note || null, subjects };
}
const clientPattern = p => ({ dur: p.dur, note: p.note, subjects: p.subjects.map(s => ({ id: s.id, en: s.en, hi: s.hi, n: s.n, m: s.m, neg: s.neg })), q: p.subjects.reduce((a, s) => a + s.n, 0), marks: r2(p.subjects.reduce((a, s) => a + s.n * s._m, 0)) });

const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, '').slice(0, 220);
const fp = s => crypto.createHash('sha1').update(norm(s)).digest('hex');
const pick = (arr, k) => arr.slice().sort(() => Math.random() - 0.5).slice(0, k);
const NOSHUF = /(above|both|none of|all of|neither|उपरोक्त|इनमें से कोई|दोनों|सभी|कोई नहीं)/i;

function parseList(raw) {
  try { return JSON.parse(raw); } catch { const a = raw.indexOf('['), b = raw.lastIndexOf(']'); return JSON.parse(raw.slice(a, b + 1)); }
}
function clean(r) {
  if (!r || typeof r.q !== 'string' || r.q.trim().length < 6 || !Array.isArray(r.o) || r.o.length !== 4) return null;
  const o = r.o.map(x => String(x).trim()); const a = Number(r.a);
  if (o.some(x => !x) || new Set(o.map(norm)).size !== 4 || !Number.isInteger(a) || a < 0 || a > 3) return null;
  let opts = o, ans = a;
  if (!o.some(x => NOSHUF.test(x))) { const idx = [0, 1, 2, 3].sort(() => Math.random() - 0.5); opts = idx.map(i => o[i]); ans = idx.indexOf(a); }
  return { q: r.q.trim(), o: opts, a: ans, x: String(r.x || '').trim(), t: String(r.t || '').trim().slice(0, 40) };
}

module.exports = ctx => {
  async function genChunk({ examName, no, sub, n, avoid, samples }) {
    const lang = sub.lang === 'hi' ? 'Write the question, all options and the explanation entirely in Hindi (Devanagari script).' : 'Write in clear English.';
    const prompt = `You are a senior paper-setter for the Indian government exam "${examName}". Create ${n} NEW multiple-choice questions for the section "${sub.en}" of Model Paper ${no}.
Follow the real exam's previous year papers: same difficulty, same question styles and the same topic weightage. Any topic of the subject can be asked, so spread the questions across the whole syllabus, and ask important, frequently repeated topics more often, but always with fresh numbers, data, names or statements.
Syllabus topics: ${sub.t}.
${samples.length ? 'Real previous year questions of this exam, only to copy the style (never copy them):\n- ' + samples.join('\n- ') + '\n' : ''}${avoid.length ? 'Do NOT repeat or paraphrase these questions that were already used:\n- ' + avoid.join('\n- ') + '\n' : ''}${lang}
Rules: each question is fully self-contained text (no figures, no passages longer than 2 sentences), exactly one correct option, 4 distinct options without A/B/C/D labels. Prefer timeless facts for general awareness; avoid news that may be outdated. In "x" give a detailed explanation of 3 to 6 sentences: for maths and reasoning show the full step by step working and formula; for other subjects explain the concept or fact and briefly why the other options are wrong. Work out "x" first, then set "a" so it matches the working.
Return ONLY a JSON array of exactly ${n} objects with keys in this order: {"q": string, "o": [4 strings], "x": string, "a": 0-based index of the correct option, "t": topic in 2-3 words}.`;
    const raw = await ctx.gemini([{ role: 'user', parts: [{ text: prompt }] }], { responseMimeType: 'application/json', maxOutputTokens: 24000 }, null, { timeout: 170000 });
    const list = parseList(raw || '[]');
    return (Array.isArray(list) ? list : []).map(clean).filter(Boolean);
  }

  async function generate(id, userId, exam, examName, no, pat) {
    const col = ctx.modelCol, set = v => col.updateOne({ _id: id }, { $set: v }).catch(console.error);
    try {
      const prev = await col.find({ userId, exam, status: { $ne: 'error' }, _id: { $ne: id } }, { projection: { questions: 1 } }).toArray();
      const seen = new Set(), stems = {};
      prev.forEach(d => (d.questions || []).forEach(q => { const t = (q.q && q.q.en) || ''; seen.add(fp(t)); (stems[q.s] = stems[q.s] || []).push(t.replace(/\s+/g, ' ').slice(0, 90)); }));
      const out = {}; let done = 0;
      const job = async sub => {
        const meta = SUB[sub.id], full = { ...meta, en: sub.en, lang: meta.lang };
        const pyq = await ctx.pyqCol.find({ exam, s: sub.id }, { projection: { q: 1 } }).limit(40).toArray().catch(() => []);
        const samples = pick(pyq.map(p => String((p.q && p.q.en) || '').replace(/\s+/g, ' ').slice(0, 160)).filter(Boolean), 4);
        const avoid = pick(stems[sub.id] || [], 40), got = [];
        let fails = 0;
        while (got.length < sub.n && fails < 4) {
          const ask = Math.min(25, sub.n - got.length + (fails ? 2 : 0));
          try {
            const part = await genChunk({ examName, no, sub: full, n: ask, avoid, samples });
            let added = 0;
            for (const q of part) { const k = fp(q.q); if (seen.has(k) || got.length >= sub.n) continue; seen.add(k); avoid.push(q.q.replace(/\s+/g, ' ').slice(0, 90)); got.push(q); added++; }
            done += added; await col.updateOne({ _id: id }, { $set: { progress: done } }).catch(() => {});
            if (!added) fails++;
          } catch (e) { fails++; if (fails >= 4) throw e; }
        }
        if (got.length < Math.ceil(sub.n * 0.6)) throw new Error(`Could not prepare enough questions for ${sub.en}. Please try again.`);
        out[sub.id] = got;
      };
      const queue = pat.subjects.slice(); const errs = [];
      await Promise.all(Array.from({ length: 4 }, async () => { while (queue.length) { const s = queue.shift(); try { await job(s); } catch (e) { errs.push(e); queue.length = 0; } } }));
      if (errs.length) throw errs[0];
      const questions = []; const subjects = [];
      pat.subjects.forEach(s => {
        const arr = out[s.id] || [];
        subjects.push({ id: s.id, en: s.en, hi: s.hi, n: arr.length, m: s._m, neg: s._neg });
        arr.forEach(q => questions.push({ s: s.id, q: { en: q.q }, o: { en: q.o }, a: q.a, x: { en: q.x }, t: q.t }));
      });
      questions.forEach((q, i) => { q.n = i + 1; });
      await set({ message: 'Translating to Hindi...', progress: questions.length });
      await ensureHi({ _id: id, questions });
      await set({ status: 'ready', questions, subjects, message: '', answers: questions.map(() => null), spent: questions.map(() => 0) });
    } catch (e) { await set({ status: 'error', message: String(e.message || e).slice(0, 300) }); }
  }

  async function translateQs(arr) {
    const skip = new Set(['eng', 'hindi']);
    for (let round = 0; round < 3; round++) {
      const need = []; arr.forEach((q, i) => { if (!skip.has(q.s) && !q.q.hi) need.push(i); });
      if (!need.length) break;
      const res = await ctx.translateItems(need.map(i => ({ q: arr[i].q.en, o: arr[i].o.en, x: arr[i].x.en || '' }))).catch(() => null);
      if (!res) continue;
      need.forEach((i, k) => { const v = res[k]; if (v) { const q = arr[i]; q.q.hi = v.q; q.o.hi = v.o; q.x.hi = v.x; } });
    }
  }
  async function ensureHi(doc) {
    await translateQs(doc.questions);
    await ctx.modelCol.updateOne({ _id: doc._id }, { $set: { questions: doc.questions } }).catch(() => {});
  }

  /* ---------- chapter wise ---------- */
  const slug = (x, i) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'c' + i;
  const subjectOf = (ex, sid) => patternFor(ex).subjects.find(s => s.id === sid);
  async function chapList(ex, examName, sid) {
    const key = ex + '|' + sid, hit = await ctx.chapCol.findOne({ _id: key });
    if (hit && hit.chapters && hit.chapters.length) return hit.chapters;
    const sub = subjectOf(ex, sid); if (!sub) return null;
    const prompt = `List ALL the chapters / topics of the subject "${sub.en}" as they are asked in the Indian government exam "${examName}", in a logical syllabus order (12 to 30 items, each a distinct chapter that questions are actually asked from). Subject areas for reference: ${SUB[sid].t}. Return ONLY a JSON array of {"en": chapter name in English, "hi": the same chapter name in Hindi (Devanagari)}.`;
    const raw = await ctx.gemini([{ role: 'user', parts: [{ text: prompt }] }], { responseMimeType: 'application/json', maxOutputTokens: 6000 }, null, { timeout: 90000 });
    const list = parseList(raw || '[]'), ids = new Set();
    const chapters = (Array.isArray(list) ? list : []).filter(x => x && typeof x.en === 'string' && x.en.trim()).slice(0, 40).map((x, i) => ({ id: slug(x.en, i), en: x.en.trim(), hi: String(x.hi || x.en).trim() })).filter(c => !ids.has(c.id) && ids.add(c.id));
    if (chapters.length < 5) throw new Error('Could not find the chapters. Please try again.');
    await ctx.chapCol.updateOne({ _id: key }, { $set: { chapters, createdAt: new Date() } }, { upsert: true });
    return chapters;
  }
  async function genChapter({ examName, sub, chap, n, avoid, samples }) {
    const lang = sub.lang === 'hi' ? 'Write the question, all options and the explanation entirely in Hindi (Devanagari script).' : 'Write in clear English.';
    const prompt = `You are a senior paper-setter for the Indian government exam "${examName}". Create ${n} NEW multiple-choice questions ONLY from the chapter "${chap.en}" of the subject "${sub.en}".
Write them exactly in the style, difficulty and patterns in which this exam asks (or can ask) questions from this chapter. Cover the different question types and sub-topics of the chapter; important, frequently asked ideas can come again but always with fresh numbers, data, names or statements.
${samples.length ? 'Real previous year questions of this exam (style only, never copy):\n- ' + samples.join('\n- ') + '\n' : ''}${avoid.length ? 'Do NOT repeat or paraphrase these questions already given to the student:\n- ' + avoid.join('\n- ') + '\n' : ''}${lang}
Rules: self-contained text (no figures), exactly one correct option, 4 distinct options without A/B/C/D labels. Prefer timeless facts; avoid news that may be outdated. In "x" give a detailed explanation of 3 to 6 sentences: for maths and reasoning the full step by step working with the formula or trick; for other subjects the concept or fact and briefly why each wrong option is wrong. Work out "x" first, then set "a" to match.
Return ONLY a JSON array of exactly ${n} objects with keys in this order: {"q": string, "o": [4 strings], "x": string, "a": 0-based index of correct option, "t": sub-topic in 2-3 words}.`;
    const raw = await ctx.gemini([{ role: 'user', parts: [{ text: prompt }] }], { responseMimeType: 'application/json', maxOutputTokens: 16000 }, null, { timeout: 120000 });
    const list = parseList(raw || '[]');
    return (Array.isArray(list) ? list : []).map(clean).filter(Boolean);
  }
  async function chapHandle(req, res, url, user, exam) {
    const p = url.pathname, send = ctx.send, q = url.searchParams;
    if (p === '/api/chap/subjects' && req.method === 'GET') {
      const pat = patternFor(exam(q.get('exam')));
      return send(res, 200, { subjects: pat.subjects.map(s => ({ id: s.id, en: s.en, hi: s.hi, n: s.n })) });
    }
    if (p === '/api/chap/list' && req.method === 'GET') {
      if (!ctx.hasKey) return send(res, 503, { error: 'Chapter wise practice needs the Gemini API key. Ask the admin to set GEMINI_API_KEY.' });
      const ex = exam(q.get('exam')), chapters = await chapList(ex, String(q.get('examName') || ex).slice(0, 60), String(q.get('s') || '')).catch(e => ({ err: e.message }));
      if (!chapters) return send(res, 404, { error: 'Subject not found.' });
      if (chapters.err) return send(res, 502, { error: chapters.err });
      return send(res, 200, { chapters });
    }
    if (p === '/api/chap/questions' && req.method === 'POST') {
      if (!ctx.hasKey) return send(res, 503, { error: 'Chapter wise practice needs the Gemini API key.' });
      const b = await ctx.readBody(req), ex = exam(b.exam), examName = String(b.examName || ex).slice(0, 60), sid = String(b.s || ''), sub = subjectOf(ex, sid), n = Math.max(5, Math.min(15, Number(b.n) || 10));
      if (!sub) return send(res, 404, { error: 'Subject not found.' });
      const list = await chapList(ex, examName, sid).catch(() => null), chap = list && list.find(c => c.id === b.cid);
      if (!chap) return send(res, 404, { error: 'Chapter not found.' });
      if (!ctx.isAdmin(user) && (await ctx.chq.countDocuments({ userId: user._id, createdAt: { $gt: new Date(Date.now() - 86400000) } })) >= 400) return send(res, 429, { error: 'Daily limit reached. Please try again tomorrow.' });
      const old = await ctx.chq.find({ userId: user._id, exam: ex, s: sid }, { projection: { fp: 1, q: 1, cid: 1 } }).sort({ _id: -1 }).limit(3000).toArray();
      const seen = new Set(old.map(o => o.fp)), avoid = pick(old.filter(o => o.cid === chap.id).slice(0, 80).map(o => o.q.en.replace(/\s+/g, ' ').slice(0, 90)), 40);
      const pyq = await ctx.pyqCol.find({ exam: ex, s: sid }, { projection: { q: 1 } }).limit(40).toArray().catch(() => []);
      const samples = pick(pyq.map(x => String((x.q && x.q.en) || '').replace(/\s+/g, ' ').slice(0, 160)).filter(Boolean), 4);
      const got = []; let fails = 0, lastErr = null;
      while (got.length < n && fails < 3) {
        try {
          const part = await genChapter({ examName, sub: { ...SUB[sid], en: sub.en, lang: SUB[sid].lang }, chap, n: n - got.length + (fails ? 2 : 0), avoid, samples });
          let added = 0;
          for (const x of part) { const k = fp(x.q); if (seen.has(k) || got.length >= n) continue; seen.add(k); avoid.push(x.q.replace(/\s+/g, ' ').slice(0, 90)); got.push({ ...x, fp: k }); added++; }
          if (!added) fails++;
        } catch (e) { fails++; lastErr = e; }
      }
      if (!got.length) return send(res, 502, { error: 'Question generation failed' + (lastErr ? ': ' + lastErr.message : '') + '. Please try again.' });
      const docs = got.map(x => ({ userId: user._id, exam: ex, s: sid, cid: chap.id, c: chap.en, chi: chap.hi, fp: x.fp, t: x.t, q: { en: x.q }, o: { en: x.o }, x: { en: x.x }, a: x.a, picked: null, createdAt: new Date() }));
      await translateQs(docs.map(d => ({ s: sid, q: d.q, o: d.o, x: d.x, _d: d })));
      await ctx.chq.insertMany(docs);
      return send(res, 200, { questions: docs.map(d => ({ id: String(d._id), s: sid, c: chap.en, q: d.q, o: d.o, a: d.a, x: d.x })) });
    }
    if (p === '/api/chap/answer' && req.method === 'POST') {
      const b = await ctx.readBody(req);
      if (!/^[a-f0-9]{24}$/.test(String(b.id || '')) || !Number.isInteger(b.picked) || b.picked < 0 || b.picked > 3) return send(res, 400, { error: 'Invalid answer.' });
      const d = await ctx.chq.findOne({ _id: new ctx.ObjectId(b.id), userId: user._id });
      if (!d) return send(res, 404, { error: 'Question not found.' });
      await ctx.chq.updateOne({ _id: d._id }, { $set: { picked: b.picked, ok: b.picked === d.a, sec: Math.max(0, Math.min(86400, Number(b.sec) || 0)), answeredAt: new Date() } });
      return send(res, 200, { ok: true });
    }
    if (p === '/api/chap/attempted' && req.method === 'GET') {
      const ex = exam(q.get('exam')), sid = q.get('s'), base = { userId: user._id, exam: ex, picked: { $ne: null } };
      if (sid) {
        const rows = await ctx.chq.find({ ...base, s: sid }).sort({ answeredAt: -1 }).limit(2000).toArray();
        return send(res, 200, { items: rows.map(r => ({ c: r.c, chi: r.chi, q: r.q, o: r.o, a: r.a, x: r.x, picked: r.picked, ok: !!r.ok, sec: r.sec || 0 })) });
      }
      const rows = await ctx.chq.find(base, { projection: { s: 1, ok: 1 } }).limit(20000).toArray(), cnt = {};
      rows.forEach(r => { const e = cnt[r.s] || (cnt[r.s] = { total: 0, ok: 0 }); e.total++; if (r.ok) e.ok++; });
      return send(res, 200, { subjects: patternFor(ex).subjects.filter(s => cnt[s.id]).map(s => ({ id: s.id, en: s.en, hi: s.hi, total: cnt[s.id].total, ok: cnt[s.id].ok })) });
    }
    return send(res, 404, { error: 'API route not found.' });
  }

  function compute(doc, answers, spent) {
    const info = {}; doc.subjects.forEach(s => { info[s.id] = { id: s.id, en: s.en, hi: s.hi, n: 0, att: 0, ok: 0, bad: 0, skip: 0, marks: 0, max: 0, m: s.m, neg: s.neg }; });
    doc.questions.forEach((q, i) => {
      const b = info[q.s], a = answers[i]; b.n++; b.max += b.m;
      if (a === null || a === undefined) { b.skip++; return; }
      b.att++; if (a === q.a) { b.ok++; b.marks += b.m; } else { b.bad++; b.marks -= b.neg; }
    });
    const subjects = Object.values(info).map(b => ({ id: b.id, en: b.en, hi: b.hi, n: b.n, att: b.att, ok: b.ok, bad: b.bad, skip: b.skip, marks: r2(b.marks), max: r2(b.max), acc: b.att ? Math.round(b.ok / b.att * 100) : 0 }));
    const sum = k => subjects.reduce((a, s) => a + s[k], 0), max = r2(sum('max')), score = r2(sum('marks'));
    const used = (spent || []).reduce((a, x) => a + (Number(x) || 0), 0);
    return { score, max, pct: max ? Math.round(score / max * 1000) / 10 : 0, att: sum('att'), ok: sum('ok'), bad: sum('bad'), skip: sum('skip'), n: doc.questions.length, acc: sum('att') ? Math.round(sum('ok') / sum('att') * 100) : 0, sec: Math.round(Math.min(used, doc.dur * 60)), subjects };
  }

  async function finalize(doc, answers, spent) {
    const N = doc.questions.length;
    const a = Array.isArray(answers) && answers.length === N ? answers.map(x => (Number.isInteger(x) && x >= 0 && x <= 3 ? x : null)) : doc.answers;
    const sp = Array.isArray(spent) && spent.length === N ? spent.map(x => Math.max(0, Math.min(86400, Number(x) || 0))) : doc.spent;
    const result = compute(doc, a, sp);
    await ctx.modelCol.updateOne({ _id: doc._id }, { $set: { status: 'done', answers: a, spent: sp, result, submittedAt: new Date() } });
    Object.assign(doc, { status: 'done', answers: a, spent: sp, result });
  }

  const view = (d, reveal) => ({
    id: String(d._id), no: d.no, status: d.status, message: d.message || '', progress: d.progress || 0, total: d.total || 0, dur: d.dur,
    now: Date.now(), startedAt: d.startedAt ? +d.startedAt : null, endsAt: d.endsAt ? +d.endsAt : null,
    subjects: (d.subjects || []).map(s => ({ id: s.id, en: s.en, hi: s.hi, n: s.n, m: r2(s.m * 1000) / 1000, neg: r2(s.neg * 1000) / 1000 })),
    answers: d.answers || [], spent: d.spent || [], result: reveal ? d.result : null,
    questions: (d.questions || []).map(q => reveal ? { s: q.s, q: q.q, o: q.o, a: q.a, x: q.x, t: q.t } : { s: q.s, q: q.q, o: q.o })
  });

  async function load(req, user, id) {
    if (!/^[a-f0-9]{24}$/.test(String(id || ''))) return null;
    const d = await ctx.modelCol.findOne({ _id: new ctx.ObjectId(id), userId: user._id });
    if (d && d.status === 'generating' && Date.now() - +d.createdAt > 20 * 60000) { d.status = 'error'; d.message = 'Paper generation timed out. Please create it again.'; await ctx.modelCol.updateOne({ _id: d._id }, { $set: { status: 'error', message: d.message } }); }
    return d;
  }

  async function handle(req, res, url, user) {
    const p = url.pathname, send = ctx.send, q = url.searchParams;
    const exam = x => (/^[a-z0-9-]{2,20}$/.test(String(x || '')) ? String(x) : user.exam);

    if (p.startsWith('/api/chap/')) return chapHandle(req, res, url, user, exam);

    /* ---------- attempted question log (PYQ) ---------- */
    if (p === '/api/qlog' && req.method === 'POST') {
      const b = await ctx.readBody(req), str = (v, n = 4000) => String(v == null ? '' : v).slice(0, n);
      const lo = o => (o && typeof o === 'object' ? { en: str(o.en), ...(o.hi ? { hi: str(o.hi) } : {}) } : { en: str(o) });
      const lo4 = o => ({ en: (Array.isArray(o && o.en) ? o.en : []).slice(0, 6).map(x => str(x, 500)), ...(Array.isArray(o && o.hi) ? { hi: o.hi.slice(0, 6).map(x => str(x, 500)) } : {}) });
      if (!b.q || !b.o || !Number.isInteger(b.a) || !Number.isInteger(b.picked) || !Number(b.year)) return send(res, 400, { error: 'Invalid attempt.' });
      await ctx.qlog.insertOne({ userId: user._id, exam: exam(b.exam), year: Number(b.year), paper: str(b.paper || 'Paper 1', 40), s: str(b.s, 12), qk: fp((b.q && b.q.en) || ''), q: lo(b.q), o: lo4(b.o), a: b.a, x: b.x ? lo(b.x) : { en: '' }, picked: b.picked, ok: !!b.ok, sec: Math.max(0, Math.min(86400, Number(b.sec) || 0)), ai: !!b.ai, createdAt: new Date() });
      return send(res, 201, { ok: true });
    }
    if (p === '/api/qlog' && req.method === 'GET') {
      const ex = exam(q.get('exam')), year = Number(q.get('year')), paper = q.get('paper');
      const filter = { userId: user._id, exam: ex }; if (year) { filter.year = year; filter.paper = paper || 'Paper 1'; }
      const rows = await ctx.qlog.find(filter).sort({ _id: -1 }).limit(5000).toArray(), seen = new Map();
      rows.forEach(r => { const k = r.year + '|' + r.paper + '|' + r.qk; const e = seen.get(k); if (e) e.times++; else seen.set(k, { ...r, times: 1 }); });
      const list = [...seen.values()];
      if (year) return send(res, 200, { items: list.map(r => ({ s: r.s, q: r.q, o: r.o, a: r.a, x: r.x, picked: r.picked, ok: r.ok, sec: r.sec, ai: r.ai, times: r.times, at: r.createdAt })) });
      const g = new Map(); list.forEach(r => { const k = r.year + '|' + r.paper, e = g.get(k) || { year: r.year, paper: r.paper, total: 0, ok: 0, last: r.createdAt }; e.total++; if (r.ok) e.ok++; g.set(k, e); });
      return send(res, 200, { groups: [...g.values()].sort((a, b) => b.year - a.year || String(a.paper).localeCompare(b.paper)) });
    }

    /* ---------- model papers ---------- */
    if (p === '/api/model/info' && req.method === 'GET') {
      const ex = exam(q.get('exam')), pat = patternFor(ex);
      const docs = await ctx.modelCol.find({ userId: user._id, exam: ex, status: { $ne: 'error' } }, { projection: { no: 1, status: 1, result: 1, createdAt: 1, submittedAt: 1 } }).sort({ no: 1 }).toArray();
      return send(res, 200, { pattern: clientPattern(pat), papers: docs.map(d => ({ id: String(d._id), no: d.no, status: d.status, score: d.result ? d.result.score : null, max: d.result ? d.result.max : null, at: d.submittedAt || d.createdAt })) });
    }
    if (p === '/api/model/create' && req.method === 'POST') {
      if (!ctx.hasKey) return send(res, 503, { error: 'Model papers need the Gemini API key. Ask the admin to set GEMINI_API_KEY.' });
      const b = await ctx.readBody(req), ex = exam(b.exam), examName = String(b.examName || ex).slice(0, 60), pat = patternFor(ex);
      if (await ctx.modelCol.findOne({ userId: user._id, status: 'generating', createdAt: { $gt: new Date(Date.now() - 20 * 60000) } })) return send(res, 409, { error: 'A model paper is already being prepared. Please wait for it to finish.' });
      if (!ctx.isAdmin(user) && (await ctx.modelCol.countDocuments({ userId: user._id, createdAt: { $gt: new Date(Date.now() - 86400000) } })) >= 6) return send(res, 429, { error: 'Daily limit reached (6 model papers per day). Please try again tomorrow.' });
      const last = await ctx.modelCol.find({ userId: user._id, exam: ex, status: { $ne: 'error' } }, { projection: { no: 1 } }).sort({ no: -1 }).limit(1).toArray(), no = (last[0] ? last[0].no : 0) + 1;
      const total = pat.subjects.reduce((a, s) => a + s.n, 0);
      const ins = await ctx.modelCol.insertOne({ userId: user._id, exam: ex, examName, no, status: 'generating', progress: 0, total, dur: pat.dur, subjects: pat.subjects.map(s => ({ id: s.id, en: s.en, hi: s.hi, n: s.n, m: s._m, neg: s._neg })), questions: [], createdAt: new Date() });
      generate(ins.insertedId, user._id, ex, examName, no, pat);
      return send(res, 201, { id: String(ins.insertedId), no });
    }
    if (p === '/api/model/paper' && req.method === 'GET') {
      const d = await load(req, user, q.get('id')); if (!d) return send(res, 404, { error: 'Paper not found.' });
      if (d.status === 'started' && Date.now() > +d.endsAt + 30000) await finalize(d, d.answers, d.spent), d.fresh = true;
      if ((d.status === 'ready' || d.status === 'started') && q.get('lang') === 'hi') await ensureHi(d);
      return send(res, 200, { ...view(d, d.status === 'done'), fresh: !!d.fresh });
    }
    if (p === '/api/model/start' && req.method === 'POST') {
      const b = await ctx.readBody(req), d = await load(req, user, b.id); if (!d) return send(res, 404, { error: 'Paper not found.' });
      if (d.status === 'ready') {
        if (b.lang === 'hi') await ensureHi(d);
        const now = Date.now(); d.status = 'started'; d.startedAt = new Date(now); d.endsAt = new Date(now + d.dur * 60000);
        await ctx.modelCol.updateOne({ _id: d._id, status: 'ready' }, { $set: { status: 'started', startedAt: d.startedAt, endsAt: d.endsAt } });
      }
      return send(res, 200, view(d, d.status === 'done'));
    }
    if (p === '/api/model/save' && req.method === 'POST') {
      const b = await ctx.readBody(req), d = await load(req, user, b.id); if (!d) return send(res, 404, { error: 'Paper not found.' });
      const N = (d.questions || []).length;
      if (d.status === 'started' && Array.isArray(b.answers) && b.answers.length === N && Array.isArray(b.spent) && b.spent.length === N) await ctx.modelCol.updateOne({ _id: d._id }, { $set: { answers: b.answers.map(x => (Number.isInteger(x) && x >= 0 && x <= 3 ? x : null)), spent: b.spent.map(x => Math.max(0, Math.min(86400, Number(x) || 0))) } });
      return send(res, 200, { ok: true });
    }
    if (p === '/api/model/submit' && req.method === 'POST') {
      const b = await ctx.readBody(req), d = await load(req, user, b.id); if (!d) return send(res, 404, { error: 'Paper not found.' });
      let fresh = false;
      if (d.status === 'started') { await finalize(d, b.answers, b.spent); fresh = true; }
      else if (d.status !== 'done') return send(res, 400, { error: 'This paper has not been started.' });
      return send(res, 200, { ...view(d, true), fresh });
    }
    return send(res, 404, { error: 'API route not found.' });
  }

  return { handle, patternFor, compute, PATTERNS, SUB };
};
