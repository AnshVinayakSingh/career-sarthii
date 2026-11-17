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
/* ---------- RSS / Atom sources (no AI, no quota) ---------- */
const FEEDS = [
  ['Sarkari Job Find', 'https://sarkarijobfind.com/feed/'],
  ['Adda247 Jobs', 'https://www.adda247.com/jobs/feed/'],
  ['Sarkari Naukri Blog', 'https://www.sarkarinaukriblog.com/feeds/posts/default?alt=rss&max-results=60'],
  ['FreeJobAlert', 'https://www.freejobalert.com/feed/']
];
const extra = (process.env.NOTICE_FEEDS || '').split(',').map(x => x.trim()).filter(Boolean).map(x => { const i = x.indexOf('|'); return i > 0 ? [x.slice(0, i).trim(), x.slice(i + 1).trim()] : [host(x), x]; });
const SOURCES = [...FEEDS, ...extra];
const ent = s => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&#8217;/g, '’').replace(/&#8211;/g, '–').replace(/&amp;/g, '&');
const tag = (x, n) => { const m = x.match(new RegExp('<' + n + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + n + '>', 'i')); return m ? m[1] : ''; };
const text = h => ent(ent(h).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const CAT_RULES = [['postponed', /postpone|re-?schedul|cancel|deferred|revised (exam )?date|corrigendum/i], ['city', /city (intimation|slip|allot)|exam city|cent(re|er) allot/i], ['admit', /admit card|hall ticket|call letter|e-?admit/i], ['answerkey', /answer key|response sheet|objection|provisional key/i], ['result', /result|merit list|cut-?off|score ?card|final selection|selected candidates/i], ['exam', /exam date|time ?table|exam schedule|calendar|exam pattern|syllabus/i], ['form', /recruitment|vacanc|apply|online form|notification|bharti|bhartee|\bjobs?\b|posts?\b/i]];
const catOf = t => (CAT_RULES.find(([, r]) => r.test(t)) || ['other'])[0];
function parseFeed(xml, src) {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [], out = [];
  for (const b of blocks.slice(0, 70)) {
    const title = text(tag(b, 'title'));
    let lk = text(tag(b, 'link')); if (!/^https?:/.test(lk)) { const m = b.match(/<link[^>]+rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || b.match(/<link[^>]+href=["']([^"']+)["']/i); lk = m ? ent(m[1]) : lk; }
    lk = link(lk); if (title.length < 8 || !lk) continue;
    const html = ent(tag(b, 'content:encoded') || tag(b, 'content') || tag(b, 'description') || tag(b, 'summary'));
    const t = Date.parse(text(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date'))), d = isNaN(t) ? '' : new Date(t).toISOString().slice(0, 10);
    let apply = '', off = ''; const sh = host(lk);
    for (const m of html.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const u = link(ent(m[1])), at = text(m[2]); if (!u || host(u) === sh) continue;
      if (!apply && /apply|online form|registration|click here to apply/i.test(at)) apply = u;
      if (!off && OFFICIAL.test(host(u))) off = u;
    }
    out.push({ title, hi: '', org: '', cat: catOf(title), date: d, lastDate: '', sum: text(html).slice(0, 260), sumHi: '', link: lk, apply, off, src, official: OFFICIAL.test(sh) });
  }
  return out;
}
async function pull([name, u]) {
  const r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; CareerSarthiiBot/1.0)', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' }, signal: AbortSignal.timeout(15000), redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const items = parseFeed(await r.text(), name); if (!items.length) throw new Error('no items');
  return items;
}
module.exports = ctx => {
  let inflight = null;
  /* optional AI layer: only when NOTICES_AI=1 (uses Gemini quota) */
  async function one(cat, what, today) {
    const prompt = `Today is ${today}. Use Google Search to find the LATEST real items (last 30 days, newest first) about Indian government exams: ${what}
Only include items you actually found with a real link. Return ONLY a JSON array of up to 10 objects: {"title","titleHi","org","cat":"${cat}","date":"YYYY-MM-DD or empty","lastDate":"YYYY-MM-DD or empty","summary","summaryHi","link","applyLink"}.`;
    const raw = await ctx.gemini([{ role: 'user', parts: [{ text: prompt }] }], { maxOutputTokens: 6000 }, null, { timeout: 75000, models: ctx.fastModels.slice(0, 2), think: 'low', tools: [{ google_search: {} }] });
    return (parseList(raw || '[]') || []).map(r => item(r, cat)).filter(Boolean);
  }
  async function refresh() {
    const today = new Date().toISOString().slice(0, 10), status = [], fresh = [];
    const res = await Promise.allSettled(SOURCES.map(pull));
    res.forEach((r, i) => { const nm = SOURCES[i][0]; if (r.status === 'fulfilled') { fresh.push(...r.value); status.push({ name: nm, ok: true, n: r.value.length }); } else status.push({ name: nm, ok: false, err: String(r.reason && r.reason.message || r.reason).slice(0, 80) }); });
    if (process.env.NOTICES_AI === '1' && ctx.hasKey) { const g = await Promise.allSettled(GROUPS.slice(0, 3).map(([c, w]) => one(c, w, today))); g.forEach(r => { if (r.status === 'fulfilled') { r.value.forEach(x => { x.src = x.src || 'Google Search'; }); fresh.push(...r.value); } }); }
    if (!fresh.length) throw new Error('No source answered (' + status.map(s => s.name + ': ' + (s.err || 'empty')).join(', ') + ')');
    const old = await ctx.ncol.findOne({ _id: 'feed' }), map = new Map(), cut = Date.now() - KEEP_DAYS * 86400000;
    [...fresh, ...((old && old.items) || [])].forEach(x => { if (x.date && Date.parse(x.date) < cut) return; const k1 = norm(x.link), k2 = norm(x.title); if (!map.has(k1) && !map.has(k2)) { map.set(k1, x); map.set(k2, x); } });
    const items = [...new Set(map.values())].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, MAX);
    const doc = { items, at: new Date(), status };
    await ctx.ncol.updateOne({ _id: 'feed' }, { $set: doc }, { upsert: true });
    return doc;
  }
  const kick = () => (inflight = inflight || refresh().finally(() => { inflight = null; }));
  async function handle(req, res, url) {
    const send = ctx.send;
    let doc = await ctx.ncol.findOne({ _id: 'feed' }), age = doc ? Date.now() - +doc.at : Infinity;
    const force = url.searchParams.get('refresh') === '1' && age > 10 * 60000;
    try {
      if (!doc || force) doc = await kick();
      else if (age > TTL) kick().catch(e => console.error('notices', e.message));
    } catch (e) { if (!doc) return send(res, 502, { error: String(e.message).slice(0, 300) }); }
    return send(res, 200, { items: doc.items, at: +doc.at, status: doc.status || [], refreshing: !!inflight });
  }
  return { handle };
};
