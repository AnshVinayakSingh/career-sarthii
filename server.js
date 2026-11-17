const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { MongoClient, ObjectId } = require('mongodb');
const Q = require('./questions.js');
const mctx = {};
const Model = require('./model.js')(mctx);

const ROOT = __dirname;
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^(['"])(.*)\1$/,'$2'); }
const PORT = Number(process.env.PORT || 3000);
const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.MONGODB_DB || 'career_sarthii';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const JWT_SECRET = process.env.JWT_SECRET || '';
const IS_PROD = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
const cookieName = 'cs_session';
const b64u = b => Buffer.from(b).toString('base64url');
const jwtSign = (payload, ttl = 14 * 86400) => { const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), p = b64u(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttl })); return `${h}.${p}.${crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`; };
const jwtVerify = token => { try { const [h, p, sig] = String(token).split('.'); if (!h || !p || !sig) return null; const good = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${p}`).digest(); const given = Buffer.from(sig, 'base64url'); if (good.length !== given.length || !crypto.timingSafeEqual(good, given)) return null; const data = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')); return data.exp > Date.now() / 1000 ? data : null; } catch { return null; } };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const passwordHash = (password,salt) => crypto.scryptSync(password,salt,64).toString('hex');
const ADMINS = (process.env.ADMIN_EMAIL || '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
const ADMIN_PASSWORD = (process.env.ADMIN_PASSWORD || '').trim();
const isAdmin = u => !!u && ADMINS.includes(String(u.email).toLowerCase());
const safeUser = u => ({name:u.name,gender:u.gender,category:u.category,email:u.email,qual:u.qualification,exam:u.exam,bio:u.bio||'',avatar:u.avatar||'',admin:isAdmin(u)});
const mimeTypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon'};
const send=(res,status,data,headers={})=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers});res.end(JSON.stringify(data));};
const readBody=req=>new Promise((resolve,reject)=>{let chunks=[],size=0;req.on('data',c=>{size+=c.length;if(size>12*1024*1024){reject(new Error('Request too large'));req.destroy();return;}chunks.push(c)});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'))}catch{reject(new Error('Invalid JSON'))}});req.on('error',reject)});
const cookie=(token,age=60*60*24*14)=>`${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax;${IS_PROD?' Secure;':''} Max-Age=${age}`;
let modelCol,qlog,chapCol,chq;
let client,db,users,attempts,chats,convs,documents,interviews,pyqCol,pyqJobs,pyqReports,trans;
async function sessionUser(req){const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='));if(!value)return null;const data=jwtVerify(decodeURIComponent(value.slice(cookieName.length+1)));if(!data||!ObjectId.isValid(data.sub))return null;return users.findOne({_id:new ObjectId(data.sub)});}
async function requireUser(req,res){const u=await sessionUser(req);if(!u)send(res,401,{error:'Please log in again.'});return u;}
async function createSession(userId,res){res.setHeader('Set-Cookie',cookie(jwtSign({sub:String(userId)})));}
const THINK_ENV = process.env.GEMINI_THINKING || '';
const thinkFor = m => THINK_ENV || (/flash-lite/.test(m) ? 'minimal' : 'low');
const dedupe = arr => arr.filter((m, i, x) => m && x.indexOf(m) === i);
const MODELS = dedupe([GEMINI_MODEL, ...(process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.6-flash,gemini-3.7-flash').split(',').map(x => x.trim())]);
const CHAT_MODELS = dedupe([process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash-lite', 'gemini-3.6-flash', ...MODELS]);
const LANG_RULE = { en: 'LANGUAGE RULE (strict): always reply in English only, even if the student writes in Hindi, Hinglish or any other language.', hi: 'LANGUAGE RULE (strict): always reply in Hindi written in Devanagari script, even if the student writes in English or Hinglish. Keep well known exam terms such as SSC, GDP, IPC in English.', hinglish: 'LANGUAGE RULE (strict): always reply in Hinglish, meaning Hindi written in Roman (English) letters with common English words mixed in naturally, like "Ye topic bahut important hai". Never use Devanagari script, even if the student writes in English or Hindi.' };
const FIRST_TOKEN_MS = Number(process.env.GEMINI_FIRST_TOKEN_MS) || 8000;
const RETRY = [404, 429, 500, 502, 503, 504];
function gBody(model, contents, config = {}, system) { const generationConfig = { ...config }; delete generationConfig.temperature; if (/gemini-3/.test(model)) generationConfig.thinkingConfig = { thinkingLevel: thinkFor(model) }; const body = { contents, generationConfig }; if (system) body.systemInstruction = { parts: [{ text: system }] }; return JSON.stringify(body); }
const GBASE = process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com';
const gUrl = (model, stream) => `${GBASE}/v1beta/models/${encodeURIComponent(model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
const gHeaders = { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY };
const gText = p => (p.candidates?.[0]?.content?.parts || []).filter(x => !x.thought).map(x => x.text || '').join('');
async function gemini(contents, config = {}, system, opts = {}) {
  if (!GEMINI_API_KEY) return null; let lastErr;
  for (const model of MODELS) {
    const response = await fetch(gUrl(model, false), { method: 'POST', headers: gHeaders, body: gBody(model, contents, config, system), signal: AbortSignal.timeout(opts.timeout || 35000) }).catch(e => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }));
    const payload = await response.json().catch(() => ({}));
    if (response.ok) { const t = gText(payload).trim(); if (t) return t; lastErr = new Error('Empty answer'); continue; }
    lastErr = new Error(payload.error?.message || `Gemini returned ${response.status}`);
    if (!RETRY.includes(response.status) && response.status !== 0) throw lastErr;
  }
  throw lastErr;
}
async function geminiStream(contents, config, system, onText, signal) {
  let lastErr;
  for (const model of CHAT_MODELS) {
    if (signal?.aborted) throw new Error('aborted');
    const ac = new AbortController(), onAbort = () => ac.abort(); signal?.addEventListener('abort', onAbort);
    let gotText = false, timedOut = false; const timer = setTimeout(() => { if (!gotText) { timedOut = true; ac.abort(); } }, FIRST_TOKEN_MS);
    try {
      const r = await fetch(gUrl(model, true), { method: 'POST', headers: gHeaders, body: gBody(model, contents, config, system), signal: ac.signal });
      if (!r.ok) { const p = await r.json().catch(() => ({})); lastErr = new Error(p.error?.message || `Gemini returned ${r.status}`); if (RETRY.includes(r.status) || r.status === 400) continue; throw lastErr; }
      const reader = r.body.getReader(), dec = new TextDecoder(); let buf = '', full = '';
      for (;;) {
        const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line.startsWith('data:')) continue; const j = line.slice(5).trim(); if (!j || j === '[DONE]') continue; try { const t = gText(JSON.parse(j)); if (t) { if (!gotText) { gotText = true; clearTimeout(timer); } full += t; onText(t); } } catch {} }
      }
      if (full) return full; lastErr = new Error('Empty answer');
    } catch (e) {
      if (signal?.aborted) throw e;
      if (gotText) throw e;
      lastErr = timedOut ? new Error('Model was too slow') : e;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
  }
  throw lastErr || new Error('No model answered');
}

const SUBJ_IDS = ['quant', 'reason', 'eng', 'hindi', 'ga', 'sci'];
async function runImport(jobId, { exam, examName, year, label, subject, paper, key }) {
  const setJob = (v) => pyqJobs.updateOne({ _id: jobId }, { $set: v }).catch(console.error);
  try {
    const fixed = SUBJ_IDS.includes(subject) ? subject : null;
    const prompt = `This PDF is the official question paper of the Indian government exam "${examName}", year ${year} (${label}). Extract EVERY multiple choice question exactly as printed (use the English version and ignore the Hindi duplicate; if the paper is only in Hindi, translate each question, option and explanation into clear English). Return ONLY a JSON array. Each item: {"n": question number, "s": ${fixed ? `"${fixed}"` : 'one of "quant" (maths and quantitative aptitude), "reason" (reasoning), "eng" (English), "hindi" (Hindi language), "sci" (general science), "ga" (general awareness, GK, history, polity, geography, current affairs)'}, "q": question text (include any passage or statements it depends on), "o": array of exactly 4 option texts without the A/B/C/D labels, "a": 0-based index of the correct option, "x": a detailed explanation of 3 to 6 sentences: for maths and reasoning show the full step by step working and the formula used; for English and general awareness explain the concept or fact behind the answer and briefly say why the other options are wrong, "ai": true only if you had to solve it yourself because no answer key was available}. ${key ? 'An answer key PDF is attached after the paper: use it for "a".' : 'No answer key is attached: solve each question carefully and set "ai" to true.'} Skip questions that depend on a picture or figure you cannot express in words, and questions without 4 options. Never invent questions. If this PDF is clearly not the question paper for this exam and year, return an empty array []. No text outside the JSON.`;
    const parts = [{ text: prompt }, { inline_data: { mime_type: 'application/pdf', data: paper } }];
    if (key) parts.push({ text: 'ANSWER KEY:' }, { inline_data: { mime_type: 'application/pdf', data: key } });
    const raw = await gemini([{ role: 'user', parts }], { responseMimeType: 'application/json', maxOutputTokens: 60000 }, null, { timeout: 280000 });
    let list; try { list = JSON.parse(raw); } catch { const a = raw.indexOf('['), b = raw.lastIndexOf(']'); list = JSON.parse(raw.slice(a, b + 1)); }
    const docs = (Array.isArray(list) ? list : []).filter(r => r && typeof r.q === 'string' && Array.isArray(r.o) && r.o.length === 4 && r.o.every(o => typeof o === 'string') && Number.isInteger(r.a) && r.a >= 0 && r.a <= 3)
      .map((r, i) => ({ exam, year, paper: label, s: fixed || (SUBJ_IDS.includes(r.s) ? r.s : 'ga'), n: Number(r.n) || i + 1, q: { en: r.q.trim() }, o: { en: r.o.map(o => o.trim()) }, a: r.a, x: { en: String(r.x || 'See the official answer key.').trim() }, ai: !!r.ai || !key, src: 'user', createdAt: new Date() }));
    if (!docs.length) throw new Error('This does not look like the question paper for this exam and year, or no questions could be read. Please check the file.');
    if (await pyqCol.findOne({ exam, year, paper: label })) throw new Error('This paper was just added by someone else.');
    await pyqCol.insertMany(docs);
    prefetchTranslations(docs).catch(() => {});
    await setJob({ status: 'done', count: docs.length, message: `Saved ${docs.length} questions. Hindi translation is being prepared in the background.` });
  } catch (e) { await setJob({ status: 'error', message: e.message }); }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function translateItems(items) {
  const keys = items.map(it => crypto.createHash('sha1').update(JSON.stringify([it.q, it.o, it.x])).digest('hex'));
  const out = new Array(items.length), cached = await trans.find({ _id: { $in: keys } }).toArray(), have = new Map(cached.map(c => [String(c._id), c.v]));
  let pending = []; keys.forEach((k, i) => { if (have.has(k)) out[i] = have.get(k); else pending.push(i); });
  const work = async idx => {
    const batch = idx.map(i => items[i]);
    const prompt = `Translate these Indian government exam MCQs from English to simple, clear Hindi (Devanagari). Keep numbers, formulas, symbols, names of people and places, and the order of the options exactly as they are. Keep the number of options the same. For "x" (the explanation) translate it fully. Return ONLY a JSON array with exactly ${batch.length} objects in the same order, each {"q": string, "o": array of strings, "x": string}.\nITEMS:\n${JSON.stringify(batch)}`;
    let list; try { list = JSON.parse(await gemini([{ role: 'user', parts: [{ text: prompt }] }], { responseMimeType: 'application/json', maxOutputTokens: 16000 }, null, { timeout: 90000 })); } catch { return; }
    if (!Array.isArray(list) || list.length !== batch.length) return;
    const docs = [];
    list.forEach((v, j) => { const i = idx[j]; if (v && typeof v.q === 'string' && Array.isArray(v.o) && v.o.length === items[i].o.length && v.o.every(o => typeof o === 'string')) { const val = { q: v.q, o: v.o, x: String(v.x || '') }; out[i] = val; docs.push({ _id: keys[i], v: val, createdAt: new Date() }); } });
    if (docs.length) await trans.insertMany(docs, { ordered: false }).catch(() => {});
  };
  for (let round = 0; round < 3 && pending.length; round++) {
    if (round) await sleep(1500 * round);
    const size = round ? 8 : 20, chunks = []; for (let i = 0; i < pending.length; i += size) chunks.push(pending.slice(i, i + size));
    await Promise.all(chunks.map(work)); pending = pending.filter(i => !out[i]);
  }
  return out.map(v => v || null);
}
async function prefetchTranslations(list) {
  const need = list.filter(q => q && q.q && q.q.en && q.o && Array.isArray(q.o.en) && q.s !== 'eng' && q.s !== 'hindi' && !q.q.hi).map(q => ({ q: q.q.en, o: q.o.en, x: (q.x && q.x.en) || '' }));
  for (let i = 0; i < need.length; i += 20) { try { await translateItems(need.slice(i, i + 20)); } catch (e) { console.error('prefetch', e.message); } }
}
const localFeedback = (answers, lg) => answers.map((a, i) => { const w = String(a.a || '').split(/\s+/).filter(Boolean).length; const tips = []; if (w < 20) tips.push(lg === 'hi' ? 'उत्तर बहुत छोटा है, कम से कम 3 से 4 वाक्य बोलें।' : 'Answer is very short; aim for at least 3 to 4 sentences.'); else if (w > 150) tips.push(lg === 'hi' ? 'उत्तर लंबा है, मुख्य बिंदुओं पर टिके रहें।' : 'Answer is long; keep to the main points.'); if (!/\d|for example|such as|उदाहरण|जैसे/i.test(a.a || '')) tips.push(lg === 'hi' ? 'एक उदाहरण या तथ्य जोड़ें।' : 'Add one specific example or fact.'); if (!tips.length) tips.push(lg === 'hi' ? 'उत्तर संतुलित है। अंत में एक संक्षिप्त निष्कर्ष जोड़ें।' : 'Good length. End with a short closing line.'); return `${i + 1}. ${tips.join(' ')}`; }).join('\n') + '\n\n' + (lg === 'hi' ? '(AI फीडबैक के लिए GEMINI_API_KEY जोड़ें।)' : '(Add GEMINI_API_KEY for detailed AI feedback.)');
const seededPaper=()=>[
 {q:'What is 20% of 250?',o:['40','50','60','75'],a:1,x:'20% of 250 is 50.'},
 {q:'A can finish a job in 10 days and B in 15 days. How long together?',o:['4 days','5 days','6 days','8 days'],a:2,x:'Their combined daily work is 1/10 + 1/15 = 1/6.'},
 {q:'An item bought for Rs 400 is sold for Rs 500. What is the profit percent?',o:['15%','20%','25%','30%'],a:2,x:'Profit is Rs 100, or 25% of Rs 400.'},
 {q:'Find the next number: 2, 6, 12, 20, 30, ?',o:['40','42','44','48'],a:1,x:'The differences are 4, 6, 8, 10, then 12.'},
 {q:'If CAT is coded as DBU, how is DOG coded?',o:['EPH','EOH','DPH','FPI'],a:0,x:'Each letter moves one step forward.'},
 {q:'Choose the synonym of Abundant.',o:['Scarce','Plentiful','Rare','Meagre'],a:1,x:'Abundant means plentiful.'},
 {q:'Who presides over a joint sitting of the two Houses of Parliament in India?',o:['President','Vice President','Speaker of Lok Sabha','Prime Minister'],a:2,x:'The Speaker of the Lok Sabha presides over a joint sitting.'},
 {q:'In which year did India become independent?',o:['1945','1947','1950','1952'],a:1,x:'India became independent in 1947.'}
];

const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 try{
  if(url.pathname==='/healthz')return send(res,200,{ok:true});
  if(url.pathname.startsWith('/api/')){
   if(req.method==='POST'&&url.pathname==='/api/signup'){
    const b=await readBody(req),name=String(b.name||'').trim(),email=String(b.email||'').trim().toLowerCase(),password=String(b.pass||'');
    if(!name||!email.includes('@')||password.length<8||!b.gender||!b.category||!b.qual||!b.exam||!b.agree)return send(res,400,{error:'Enter valid details, use an 8 character password, and accept the terms.'});
    if(await users.findOne({email}))return send(res,409,{error:'An account with this email already exists.'});
    const salt=crypto.randomBytes(16).toString('hex'),passHash=passwordHash(password,salt);let result;
    try{result=await users.insertOne({name,gender:String(b.gender),category:String(b.category),email,passHash,passSalt:salt,qualification:String(b.qual),exam:String(b.exam),createdAt:new Date()})}catch(e){if(e.code===11000)return send(res,409,{error:'An account with this email already exists.'});throw e;}
    const u=await users.findOne({_id:result.insertedId});await createSession(u._id,res);return send(res,201,{user:safeUser(u)});
   }
   if(req.method==='POST'&&url.pathname==='/api/login'){
    const b=await readBody(req),email=String(b.email||'').trim().toLowerCase(),password=String(b.pass||'');const adminPw=password.trim();let u=await users.findOne({email});
    const sha=x=>crypto.createHash('sha256').update(String(x)).digest();
    if(ADMIN_PASSWORD&&ADMINS.includes(email)&&crypto.timingSafeEqual(sha(adminPw),sha(ADMIN_PASSWORD))){
     const salt=crypto.randomBytes(16).toString('hex'),passHash=passwordHash(adminPw,salt);
     if(!u){await users.insertOne({name:'Admin',gender:'male',category:'General',email,passHash,passSalt:salt,qualification:'grad',exam:'ssc-cgl',createdAt:new Date()});u=await users.findOne({email});}
     else{let same=false;try{same=crypto.timingSafeEqual(Buffer.from(passwordHash(adminPw,u.passSalt),'hex'),Buffer.from(u.passHash,'hex'))}catch{}if(!same){await users.updateOne({_id:u._id},{$set:{passHash,passSalt:salt}});u=await users.findOne({_id:u._id});}}
     await createSession(u._id,res);return send(res,200,{user:safeUser(u)});
    }
    if(!u||!crypto.timingSafeEqual(Buffer.from(passwordHash(password,u.passSalt),'hex'),Buffer.from(u.passHash,'hex')))return send(res,401,{error:'Email or password is incorrect.'});
    await createSession(u._id,res);return send(res,200,{user:safeUser(u)});
   }
   if(url.pathname==='/api/logout'&&req.method==='POST')return send(res,200,{ok:true},{'Set-Cookie':cookie('',0)});
   if(url.pathname==='/api/me'&&req.method==='GET'){const u=await requireUser(req,res);if(u)return send(res,200,{user:safeUser(u)});return;}
   const user=await requireUser(req,res);if(!user)return;
   if(url.pathname==='/api/account'&&req.method==='DELETE'){const filter={userId:user._id};await Promise.all([attempts.deleteMany(filter),modelCol.deleteMany(filter),qlog.deleteMany(filter),chq.deleteMany(filter),chats.deleteMany(filter),convs.deleteMany(filter),documents.deleteMany(filter),interviews.deleteMany(filter)]);await users.deleteOne({_id:user._id});return send(res,200,{ok:true},{'Set-Cookie':cookie('',0)});}
   if(url.pathname==='/api/profile'&&req.method==='PATCH'){
    const b=await readBody(req),set={};
    if(b.name!==undefined){const n=String(b.name).trim();if(n.length<2||n.length>60)return send(res,400,{error:'Enter a name of 2 to 60 characters.'});set.name=n;}
    if(b.gender!==undefined){if(!['male','female','other'].includes(b.gender))return send(res,400,{error:'Invalid gender.'});set.gender=b.gender;}
    if(b.category!==undefined){if(!['General','OBC','SC','ST','EWS','Other'].includes(b.category))return send(res,400,{error:'Invalid category.'});set.category=b.category;}
    if(b.qual!==undefined){if(!['10','12','grad'].includes(b.qual))return send(res,400,{error:'Invalid qualification.'});set.qualification=b.qual;}
    if(b.exam!==undefined){if(!/^[a-z0-9-]{2,30}$/.test(String(b.exam)))return send(res,400,{error:'Choose an exam.'});set.exam=String(b.exam);}
    if(b.bio!==undefined)set.bio=String(b.bio).slice(0,300);
    if(b.avatar!==undefined){const av=String(b.avatar);if(av&&(!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(av)||av.length>120000))return send(res,400,{error:'Photo is too large or not a valid image.'});set.avatar=av;}
    if(!Object.keys(set).length)return send(res,400,{error:'Nothing to update.'});
    await users.updateOne({_id:user._id},{$set:set});return send(res,200,{user:safeUser(await users.findOne({_id:user._id}))});
   }
   if(url.pathname==='/api/attempts'&&req.method==='GET'){const rows=await attempts.find({userId:user._id}).sort({_id:-1}).limit(2000).toArray();return send(res,200,{attempts:rows.map(x=>({exam:x.exam,src:x.src,s:x.s,c:x.c,ok:x.ok,sec:x.sec,ts:x.createdAt}))});}
   if(url.pathname==='/api/attempts'&&req.method==='POST'){const b=await readBody(req),rows=Array.isArray(b.attempts)?b.attempts.slice(0,300):[];if(rows.length)await attempts.insertMany(rows.map(a=>({userId:user._id,exam:String(a.exam||user.exam),src:String(a.src||'quiz'),s:String(a.s||''),c:String(a.c||''),ok:Boolean(a.ok),sec:Math.max(0,Math.min(86400,Number(a.sec)||0)),createdAt:new Date()})));return send(res,201,{saved:rows.length});}
   if(url.pathname==='/api/chats'&&req.method==='GET'){const rows=await chats.find({userId:user._id}).sort({_id:-1}).limit(100).toArray();return send(res,200,{messages:rows.reverse().map(x=>({role:x.role,message:x.message,ts:x.createdAt}))});}
   if(url.pathname==='/api/documents'&&req.method==='GET'){const rows=await documents.find({userId:user._id},{projection:{name:1,mime:1,size:1,createdAt:1}}).sort({_id:-1}).toArray();return send(res,200,{documents:rows.map(x=>({id:String(x._id),name:x.name,mime:x.mime,size:x.size,ts:x.createdAt}))});}
   if(url.pathname==='/api/documents'&&req.method==='POST'){const b=await readBody(req),name=String(b.name||'').slice(0,180),mime=String(b.mime||'application/pdf'),allowed=['application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],data=Buffer.from(String(b.data||''),'base64');if(!name||!allowed.includes(mime)||!data.length||data.length>8*1024*1024)return send(res,400,{error:'Upload a PDF, TXT, or DOCX file up to 8 MB.'});const r=await documents.insertOne({userId:user._id,name,mime,size:data.length,content:data,createdAt:new Date()});return send(res,201,{id:String(r.insertedId),name,size:data.length});}
   const deleteDoc=url.pathname.match(/^\/api\/documents\/([a-f\d]{24})$/i);if(deleteDoc&&req.method==='DELETE'){await documents.deleteOne({_id:new ObjectId(deleteDoc[1]),userId:user._id});return send(res,200,{ok:true});}
   if(url.pathname==='/api/interviews'&&req.method==='GET'){const rows=await interviews.find({userId:user._id},{projection:{exam:1,language:1,createdAt:1}}).sort({_id:-1}).limit(100).toArray();return send(res,200,{interviews:rows.map(x=>({exam:x.exam,language:x.language,ts:x.createdAt}))});}
   if(url.pathname==='/api/interviews'&&req.method==='POST'){const b=await readBody(req);await interviews.insertOne({userId:user._id,exam:user.exam,language:String(b.language||'en'),summary:b.summary||{},createdAt:new Date()});return send(res,201,{ok:true});}
   const convMatch=url.pathname.match(/^\/api\/convs(?:\/([a-f0-9]{24}))?$/);
   if(convMatch){
    const cid=convMatch[1];
    if(!cid&&req.method==='GET'){const rows=await convs.find({userId:user._id}).sort({updatedAt:-1}).limit(50).toArray();return send(res,200,{convs:rows.map(c=>({id:String(c._id),title:c.title,updatedAt:c.updatedAt}))});}
    if(!cid&&req.method==='DELETE'){await Promise.all([convs.deleteMany({userId:user._id}),chats.deleteMany({userId:user._id})]);return send(res,200,{ok:true});}
    if(cid&&req.method==='GET'){const c=await convs.findOne({_id:new ObjectId(cid),userId:user._id});if(!c)return send(res,404,{error:'Chat not found.'});const rows=await chats.find({convId:c._id}).sort({_id:-1}).limit(200).toArray();return send(res,200,{title:c.title,messages:rows.reverse().map(x=>({role:x.role,message:x.message}))});}
    if(cid&&req.method==='DELETE'){await Promise.all([convs.deleteOne({_id:new ObjectId(cid),userId:user._id}),chats.deleteMany({convId:new ObjectId(cid),userId:user._id})]);return send(res,200,{ok:true});}
   }
   if(url.pathname==='/api/ai/chat'&&req.method==='POST'){
    const b=await readBody(req),message=String(b.message||'').trim().slice(0,4000);if(!message)return send(res,400,{error:'Write a question first.'});
    if(!GEMINI_API_KEY)return send(res,200,{answer:'AI is not configured yet. Add GEMINI_API_KEY in the server environment.'});
    let conv=null;if(b.convId&&ObjectId.isValid(b.convId))conv=await convs.findOne({_id:new ObjectId(b.convId),userId:user._id});
    const convId=conv?conv._id:new ObjectId();
    if(conv&&b.regen){const last=await chats.find({convId}).sort({_id:-1}).limit(2).toArray();for(const m of last)await chats.deleteOne({_id:m._id});}
    const system=`You are Career Sarthii, a friendly bilingual tutor for Indian government exams. The student's exam: ${user.exam}. ${LANG_RULE[b.lang]||'Reply in the language the student writes in (Hindi or English).'} Keep answers short and clear (about 120 words unless the student asks for detail): short paragraphs or bullet points, no preamble, no markdown tables. If the message starts with "> " lines, that is the earlier message the student is replying to. If study documents are attached, use them as reference.`;
    const hist=conv?(await chats.find({convId}).sort({_id:-1}).limit(6).toArray()).reverse().map(x=>({role:x.role==='user'?'user':'model',parts:[{text:String(x.message).slice(0,1500)}]})):[];
    const parts=[];
    if(/pdf|paper|document|notes|upload|file|दस्तावेज|नोट्स|पेपर/i.test(message)){let used=0;const docs=await documents.find({userId:user._id,mime:{$in:['application/pdf','text/plain']}}).sort({_id:-1}).limit(2).toArray();for(const d of docs){const raw=d.content,content=Buffer.isBuffer(raw)?raw:Buffer.from(raw.buffer.subarray(0,raw.position));if(used+content.length>6*1024*1024)continue;used+=content.length;if(d.mime==='application/pdf')parts.push({inline_data:{mime_type:d.mime,data:content.toString('base64')}});else parts.push({text:`Study document ${d.name}: ${content.toString('utf8').slice(0,12000)}`});}}
    parts.push({text:message});
    const ac=new AbortController();res.on('close',()=>{if(!res.writableEnded)ac.abort();});
    let started=false,answer='';
    const save=async()=>{if(!answer.trim())return;const now=Date.now(),ts=new Date(now);await chats.insertMany([{userId:user._id,convId,role:'user',message,createdAt:ts},{userId:user._id,convId,role:'assistant',message:answer,createdAt:new Date(now+1)}]);if(conv)await convs.updateOne({_id:convId},{$set:{updatedAt:ts}});else await convs.insertOne({_id:convId,userId:user._id,title:message.replace(/^(>.*\n?)+\s*/,'').slice(0,48)||'New chat',createdAt:ts,updatedAt:ts});};
    try{
     await geminiStream([...hist,{role:'user',parts}],{maxOutputTokens:3000},system,t=>{answer+=t;if(!started){started=true;res.writeHead(200,{'content-type':'text/plain; charset=utf-8','cache-control':'no-store','x-accel-buffering':'no','x-conv-id':String(convId)});}res.write(t);},ac.signal);
     if(!started)return send(res,502,{error:'Gemini returned an empty answer. Please try again.'});
    }catch(err){
     if(!started)return send(res,502,{error:`Gemini could not answer: ${err.message}`});
     if(!ac.signal.aborted){res.write('\n\n[Connection interrupted. Please ask again.]');res.end();}
     await save().catch(console.error);return;
    }
    res.end();await save().catch(console.error);return;
   }
   if(url.pathname==='/api/pyq/overview'&&req.method==='GET'){
    const exam=String(url.searchParams.get('exam')||user.exam),now=new Date().getFullYear();
    const rows=[...(await pyqCol.find({exam},{projection:{year:1,s:1,paper:1}}).toArray()),...Q.pyqList(exam)];
    const run=await pyqJobs.find({exam,status:'running',createdAt:{$gt:new Date(Date.now()-10*60000)}}).toArray();
    return send(res,200,{years:Array.from({length:10},(_,i)=>{const y=now-i,map={};rows.filter(r=>r.year===y).forEach(r=>{const l=r.paper||'Paper 1';map[l]=map[l]||{};map[l][r.s]=(map[l][r.s]||0)+1});return{year:y,papers:Object.entries(map).map(([label,subjects])=>({label,subjects})),processing:run.filter(j=>j.year===y).map(j=>j.label||'Paper 1')}})});
   }
   if(url.pathname==='/api/pyq/paper'&&req.method==='GET'){
    const p=url.searchParams,exam=String(p.get('exam')||user.exam),year=Number(p.get('year')),s=p.get('s'),label=p.get('label')||'Paper 1';
    const rows=[...(await pyqCol.find(s?{exam,year,s}:{exam,year}).toArray()),...Q.pyqList(exam).filter(r=>r.year===year&&(!s||r.s===s))].filter(r=>(r.paper||'Paper 1')===label);
    return send(res,200,{questions:rows.sort((a,b)=>(a.n||0)-(b.n||0)).map(r=>({s:r.s,c:r.c||'',q:r.q,o:r.o,a:r.a,x:r.x,ai:!!r.ai}))});
   }
   if(url.pathname==='/api/pyq/import'&&req.method==='POST'){
    const b=await readBody(req),exam=String(b.exam||user.exam).toLowerCase(),year=Number(b.year),label=String(b.label||'Paper 1').trim().slice(0,30)||'Paper 1',now=Date.now();
    if(!/^[a-z0-9-]{2,30}$/.test(exam)||!(year>=2000&&year<=2100)||!b.file)return send(res,400,{error:'Exam, year and the paper PDF are required.'});
    if(!GEMINI_API_KEY)return send(res,400,{error:'AI is not configured on the server.'});
    if(await pyqCol.findOne({exam,year,paper:label}))return send(res,409,{error:'This paper has already been added. Refresh the page.'});
    if(await pyqJobs.findOne({exam,year,label,status:'running',createdAt:{$gt:new Date(now-10*60000)}}))return send(res,409,{error:'Someone is already uploading this paper. Please check again in a few minutes.'});
    if(!isAdmin(user)&&(await pyqJobs.find({userId:user._id,createdAt:{$gt:new Date(now-86400000)}}).toArray()).length>=5)return send(res,429,{error:'Upload limit reached for today (5 papers). Please try again tomorrow.'});
    const job=await pyqJobs.insertOne({userId:user._id,exam,year,label,status:'running',message:'Reading the paper with AI. This can take 1 to 4 minutes.',createdAt:new Date()});
    runImport(job.insertedId,{exam,examName:String(b.examName||exam).slice(0,60),year,label,subject:'auto',paper:String(b.file),key:b.key?String(b.key):null});
    return send(res,202,{jobId:String(job.insertedId)});
   }
   const jm=url.pathname.match(/^\/api\/pyq\/job\/([a-f0-9]{24})$/);
   if(jm&&req.method==='GET'){const j=await pyqJobs.findOne({_id:new ObjectId(jm[1])});return j&&(String(j.userId)===String(user._id)||isAdmin(user))?send(res,200,{status:j.status,message:j.message,count:j.count||0}):send(res,404,{error:'Job not found.'});}
   if(url.pathname==='/api/pyq/report'&&req.method==='POST'){
    const b=await readBody(req),exam=String(b.exam||'').slice(0,30),year=Number(b.year),label=String(b.label||'Paper 1').slice(0,30),note=String(b.note||'').trim().slice(0,500);
    if(!await pyqCol.findOne({exam,year,paper:label}))return send(res,404,{error:'Paper not found.'});
    const old=await pyqReports.findOne({userId:user._id,exam,year,label});
    if(old)await pyqReports.updateOne({_id:old._id},{$set:{note,createdAt:new Date()}});else await pyqReports.insertOne({userId:user._id,userName:user.name,exam,year,label,note,createdAt:new Date()});
    return send(res,200,{ok:true});
   }
   if(url.pathname.startsWith('/api/admin/pyq')){
    if(!isAdmin(user))return send(res,403,{error:'Admin only.'});
    if(url.pathname==='/api/admin/pyq/papers'&&req.method==='GET'){
     const docs=await pyqCol.find({},{projection:{exam:1,year:1,paper:1,ai:1}}).toArray(),reps=await pyqReports.find({}).toArray(),map={};
     docs.forEach(d=>{const l=d.paper||'Paper 1',k=`${d.exam}|${d.year}|${l}`;const m=map[k]=map[k]||{exam:d.exam,year:d.year,label:l,count:0,ai:0,reports:[]};m.count++;if(d.ai)m.ai++;});
     reps.forEach(r=>{const m=map[`${r.exam}|${r.year}|${r.label}`];if(m)m.reports.push({by:r.userName,note:r.note,at:r.createdAt});});
     return send(res,200,{papers:Object.values(map).sort((a,b)=>b.reports.length-a.reports.length||b.year-a.year)});
    }
    const sel=()=>({exam:String(url.searchParams.get('exam')||''),year:Number(url.searchParams.get('year')),label:String(url.searchParams.get('label')||'Paper 1')});
    if(url.pathname==='/api/admin/pyq/dismiss'&&req.method==='POST'){const{exam,year,label}=sel();await pyqReports.deleteMany({exam,year,label});return send(res,200,{ok:true});}
    if(url.pathname==='/api/admin/pyq'&&req.method==='DELETE'){const{exam,year,label}=sel();if(!exam||!year)return send(res,400,{error:'exam and year required'});await Promise.all([pyqCol.deleteMany({exam,year,paper:label}),pyqReports.deleteMany({exam,year,label})]);return send(res,200,{ok:true});}
   }
   if(url.pathname==='/api/translate'&&req.method==='POST'){
    const b=await readBody(req),items=Array.isArray(b.items)?b.items.slice(0,100):[];
    const ok=items.length&&items.every(it=>it&&typeof it.q==='string'&&Array.isArray(it.o)&&it.o.length>=2&&it.o.length<=6&&it.o.every(o=>typeof o==='string'));
    if(!ok||JSON.stringify(items).length>80000)return send(res,400,{error:'Nothing to translate.'});
    items.forEach(it=>{it.x=String(it.x||'')});
    if(!GEMINI_API_KEY){const hit=await translateItems(items).catch(()=>items.map(()=>null));return send(res,200,{items:hit});}
    try{return send(res,200,{items:await translateItems(items)});}catch(e){return send(res,502,{error:'Translation failed: '+e.message});}
   }
   if(url.pathname==='/api/questions/meta'&&req.method==='GET')return send(res,200,Q.meta());
   if(url.pathname==='/api/questions'&&req.method==='GET'){
    const p=url.searchParams,n=Math.max(1,Math.min(100,Number(p.get('n'))||20)),seed=Number(p.get('seed'))||Math.floor(Math.random()*1e9);
    if(p.get('year')){const rows=Q.pyqFor(user.exam,Number(p.get('year')));return send(res,200,{questions:rows,source:'pyq'});}
    if(p.get('c'))return send(res,200,{questions:Q.forChapter(p.get('c'),n,seed),source:'bank'});
    if(p.get('paper'))return send(res,200,{questions:Q.paper(Math.min(n,100),seed),source:'bank'});
    return send(res,200,{questions:Q.mix(n,seed),source:'bank'});
   }
   if(url.pathname.startsWith('/api/model/')||url.pathname.startsWith('/api/chap/')||url.pathname==='/api/qlog')return Model.handle(req,res,url,user);
   if(url.pathname==='/api/ai/paper'&&req.method==='POST'){let qs;try{const text=await gemini([{role:'user',parts:[{text:`Create exactly 10 multiple-choice questions for ${user.exam} exam practice. Use English. Return only valid JSON array, each item having q (string), o (array of exactly 4 strings), a (zero-based correct option index), x (short explanation). Avoid current affairs. Ensure answer index correct.`}]}],{responseMimeType:'application/json',maxOutputTokens:8000});qs=JSON.parse(text||'[]');if(!Array.isArray(qs)||qs.length<5)throw Error('Invalid paper');qs=qs.slice(0,20).map(q=>({q:String(q.q),o:q.o.map(String),a:Number(q.a),x:String(q.x),s:'ga',c:'polity'}))}catch(err){if(GEMINI_API_KEY)return send(res,502,{error:`Paper generation failed: ${err.message}`});qs=seededPaper().map(q=>({...q,s:'ga',c:'polity'}))}return send(res,200,{questions:qs,generated:Boolean(GEMINI_API_KEY)});}
   if(url.pathname==='/api/ai/interview'&&req.method==='POST'){const b=await readBody(req),answers=Array.isArray(b.answers)?b.answers.slice(0,12):[];if(!answers.length)return send(res,400,{error:'Complete at least one interview answer.'});if(!GEMINI_API_KEY)return send(res,200,{feedback:localFeedback(answers,b.language)});try{const feedback=await gemini([{role:'user',parts:[{text:`You are a supportive but honest interview coach for the ${user.exam} exam. Review these answers in ${b.language==='hi'?'Hindi':'English'}. Give specific feedback on clarity, relevance, structure, and one improvement for each answer. Do not invent facts. Keep it concise. Answers: ${JSON.stringify(answers)}`}]}],{maxOutputTokens:2500});return send(res,200,{feedback})}catch(err){return send(res,502,{error:`Interview feedback failed: ${err.message}`})}}
   return send(res,404,{error:'API route not found.'});
  }
  let pathname=decodeURIComponent(url.pathname);if(pathname==='/')pathname='/index.html';const file=path.resolve(ROOT,'.'+pathname);if(!file.startsWith(ROOT+path.sep)&&file!==ROOT)return send(res,403,{error:'Forbidden'});fs.readFile(file,(err,content)=>{if(err)return send(res,404,{error:'Not found'});res.writeHead(200,{'content-type':mimeTypes[path.extname(file).toLowerCase()]||'application/octet-stream','x-content-type-options':'nosniff','referrer-policy':'same-origin'});res.end(content)});
 }catch(err){console.error(err);if(!res.headersSent)send(res,500,{error:err.message||'Server error.'})}
});

async function start(){
 if(!JWT_SECRET||JWT_SECRET.length<16){console.error('JWT_SECRET is required (at least 16 characters).');process.exitCode=1;return;}
 if(!MONGODB_URI){console.error('MongoDB is required. Add MONGODB_URI to your .env file.');process.exitCode=1;return;}
 client=new MongoClient(MONGODB_URI);await client.connect();db=client.db(DB_NAME);
 users=db.collection('users');attempts=db.collection('attempts');chats=db.collection('chats');convs=db.collection('convs');pyqCol=db.collection('pyq');pyqJobs=db.collection('pyqjobs');pyqReports=db.collection('pyqreports');trans=db.collection('translations');documents=db.collection('documents');interviews=db.collection('interviews');modelCol=db.collection('modelpapers');qlog=db.collection('qlog');chapCol=db.collection('chaplist');chq=db.collection('chq');
 Object.assign(mctx,{gemini,translateItems,send,readBody,ObjectId,isAdmin,modelCol,qlog,chapCol,chq,pyqCol,hasKey:!!GEMINI_API_KEY});
 await Promise.all([modelCol.createIndex({userId:1,exam:1,no:1}),qlog.createIndex({userId:1,exam:1,year:1}),chq.createIndex({userId:1,exam:1,s:1}),users.createIndex({email:1},{unique:true}),attempts.createIndex({userId:1,_id:-1}),chats.createIndex({userId:1,_id:-1}),chats.createIndex({convId:1,_id:1}),convs.createIndex({userId:1,updatedAt:-1}),pyqCol.createIndex({exam:1,year:1,s:1}),documents.createIndex({userId:1,_id:-1}),interviews.createIndex({userId:1,_id:-1})]);
 if(ADMINS[0]&&ADMIN_PASSWORD.length>=8){const email=ADMINS[0],pw=ADMIN_PASSWORD,u=await users.findOne({email});
  if(!u){const salt=crypto.randomBytes(16).toString('hex');await users.insertOne({name:'Admin',gender:'other',category:'General',email,passHash:passwordHash(pw,salt),passSalt:salt,qualification:'grad',exam:'ssc-cgl',createdAt:new Date()});console.log('Admin account created for',email);}
  else if(passwordHash(pw,u.passSalt)!==u.passHash){const salt=crypto.randomBytes(16).toString('hex');await users.updateOne({_id:u._id},{$set:{passHash:passwordHash(pw,salt),passSalt:salt}});console.log('Admin password updated for',email);}}
 await db.command({ping:1});server.listen(PORT,'0.0.0.0',()=>console.log(`Career Sarthii connected to MongoDB and running at http://localhost:${PORT}`));
  console.log(ADMINS.length&&ADMIN_PASSWORD?`Admin login is ON for: ${ADMINS.map(e=>e.replace(/^(.{3}).*(@.*)$/,'$1***$2')).join(', ')}`:'Admin login is OFF. Set ADMIN_EMAIL and ADMIN_PASSWORD in the Render Environment.');
  if(GEMINI_API_KEY)setTimeout(async()=>{try{await prefetchTranslations(Q.bankAll());await prefetchTranslations(await pyqCol.find({}).toArray());}catch(e){console.error('prefetch',e.message)}},Number(process.env.PREFETCH_DELAY_MS)||8000);
}
start().catch(err=>{console.error('MongoDB connection failed:',err.message);process.exitCode=1;});
process.on('SIGINT',async()=>{if(client)await client.close();process.exit(0)});
