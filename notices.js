'use strict';
/* Government exam notices feed: all exams, not tied to the selected exam.
   Gemini + Google Search finds the latest official notices; the result is cached in MongoDB and merged so nothing disappears. */
const TTL = 4 * 3600 * 1000, KEEP_DAYS = 45, MAX = 500;
const CATS = ['form', 'result', 'admit', 'city', 'exam', 'postponed', 'answerkey', 'other'];
const OFFICIAL = /(\.gov\.in|\.nic\.in|\.ac\.in|\.edu\.in|\.res\.in|^ibps\.in|^sbi\.co\.in|^upsc\.gov\.in|^ssc\.nic\.in|\.indianrailways\.gov\.in|\.cdn\.digitaindia|^rrbcdg\.gov\.in|^indianbank\.in|^rbi\.org\.in|^joinindianarmy\.nic\.in)$/i;
const GROUPS = [
  ['form', 'NEW recruitment notifications and application forms that are open now or opening soon (central and state government jobs: SSC, UPSC, Railways RRB, banks IBPS/SBI/RBI, police, defence, teaching, state PSCs and subordinate boards, UP jobs). Give the official apply link and the last date.'],
  ['result', 'RESULTS declared recently: final results, provisional results, cut-off, merit lists, scorecards of government recruitment and entrance exams.'],
  ['admit', 'ADMIT CARDS released or about to be released, and EXAM CITY / CENTRE ALLOTMENT (city intimation slips) for government exams.'],
  ['exam', 'EXAM DATE announcements, exam calendars and schedules, tentative dates of upcoming government recruitment exams.'],
  ['postponed', 'Government exams POSTPONED, RESCHEDULED, CANCELLED or with a revised date or corrigendum / short notice.'],
  ['answerkey', 'ANSWER KEYS, objection windows, response sheets, document verification, counselling and similar post-exam notices of government exams.']
];
const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 120);
const str = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
function link(u) { try { const x = new URL(String(u || '').trim()); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href.slice(0, 500) : ''; } catch { return ''; } }
function host(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } }
function parseList(raw) { try { return JSON.parse(raw); } catch { const a = raw.indexOf('['), b = raw.lastIndexOf(']'); if (a < 0 || b < a) return []; try { return JSON.parse(raw.slice(a, b + 1)); } catch { return []; } } }
function item(r, defCat) {
  if (!r || typeof r !== 'object') return null;
  const title = str(r.title, 200), lk = link(r.link); if (title.length < 8 || !lk) return null;
  const ap = link(r.applyLink), d = /^\d{4}-\d{2}-\d{2}$/.test(String(r.date || '')) ? r.date : '', ld = /^\d{4}-\d{2}-\d{2}$/.test(String(r.lastDate || '')) ? r.lastDate : '';
  return { title, hi: str(r.titleHi, 220), org: str(r.org, 80), cat: CATS.includes(r.cat) ? r.cat : defCat, date: d, lastDate: ld, sum: str(r.summary, 300), sumHi: str(r.summaryHi, 340), link: lk, apply: ap && ap !== lk ? ap : '', official: OFFICIAL.test(host(lk)) };
}
module.exports = ctx => {
  let inflight = null;
  async function one(cat, what, today) {
    const prompt = `Today is ${today}. Use Google Search to find the LATEST real items (last 30 days, newest first) about Indian government exams: ${what}
Cover many different organisations, not only one exam. Only include items you actually found; the link must be the real page (official website or notice PDF preferred, else a trusted news page). Never invent links or dates.
Return ONLY a JSON array (no markdown) of up to 12 objects: {"title": English headline with exam name, "titleHi": same in Hindi, "org": organisation short name, "cat": "${cat}", "date": "YYYY-MM-DD" of the notice or event or "", "lastDate": "YYYY-MM-DD" last date to apply or "", "summary": one short English line with key facts, "summaryHi": same in Hindi, "link": URL of the notice, "applyLink": direct application URL or ""}.`;
    const raw = await ctx.gemini([{ role: 'user', parts: [{ text: prompt }] }], { maxOutputTokens: 7000 }, null, { timeout: 75000, models: ctx.fastModels, think: 'low', tools: [{ google_search: {} }] });
    return (parseList(raw || '[]') || []).map(r => item(r, cat)).filter(Boolean);
  }
  async function refresh() {
    const today = new Date().toISOString().slice(0, 10);
    const res = await Promise.allSettled(GROUPS.map(([c, w]) => one(c, w, today)));
    const fresh = res.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
    if (!fresh.length) throw new Error((res.find(r => r.status === 'rejected') || {}).reason?.message || 'No notices found');
    const old = await ctx.ncol.findOne({ _id: 'feed' }), map = new Map(), cut = Date.now() - KEEP_DAYS * 86400000;
    [...fresh, ...((old && old.items) || [])].forEach(x => { if (x.date && Date.parse(x.date) < cut) return; const k = norm(x.link) + '|' + x.cat; if (!map.has(k) && !map.has(norm(x.title) + '|' + x.cat)) { map.set(k, x); map.set(norm(x.title) + '|' + x.cat, x); } });
    const items = [...new Set(map.values())].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, MAX);
    const doc = { items, at: new Date() };
    await ctx.ncol.updateOne({ _id: 'feed' }, { $set: doc }, { upsert: true });
    return doc;
  }
  const kick = () => (inflight = inflight || refresh().finally(() => { inflight = null; }));
  async function handle(req, res, url) {
    const send = ctx.send; if (!ctx.hasKey) return send(res, 200, { items: [], noKey: true });
    let doc = await ctx.ncol.findOne({ _id: 'feed' }), age = doc ? Date.now() - +doc.at : Infinity;
    const force = url.searchParams.get('refresh') === '1' && age > 20 * 60000;
    try {
      if (!doc || force) doc = await kick();
      else if (age > TTL) kick().catch(e => console.error('notices', e.message));
    } catch (e) { if (!doc) return send(res, 502, { error: 'Could not load notices right now: ' + String(e.message).slice(0, 150) }); }
    return send(res, 200, { items: doc.items, at: +doc.at, refreshing: !!inflight });
  }
  return { handle };
};
