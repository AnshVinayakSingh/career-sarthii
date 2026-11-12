const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { MongoClient, ObjectId } = require('mongodb');

const ROOT = __dirname;
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^(['"])(.*)\1$/,'$2'); }
const PORT = Number(process.env.PORT || 3000);
const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.MONGODB_DB || 'career_sarthii';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const cookieName = 'cs_session';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const passwordHash = (password,salt) => crypto.scryptSync(password,salt,64).toString('hex');
const safeUser = u => ({name:u.name,gender:u.gender,category:u.category,email:u.email,qual:u.qualification,exam:u.exam});
const mimeTypes={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon'};
const send=(res,status,data,headers={})=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers});res.end(JSON.stringify(data));};
const readBody=req=>new Promise((resolve,reject)=>{let chunks=[],size=0;req.on('data',c=>{size+=c.length;if(size>12*1024*1024){reject(new Error('Request too large'));req.destroy();return;}chunks.push(c)});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}'))}catch{reject(new Error('Invalid JSON'))}});req.on('error',reject)});
const cookie=(token,age=60*60*24*14)=>`${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}`;
let client,db,users,sessions,attempts,chats,documents,interviews;
async function sessionUser(req){const value=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='));if(!value)return null;const token=decodeURIComponent(value.slice(cookieName.length+1));const session=await sessions.findOne({tokenHash:hash(token),expiresAt:{$gt:new Date()}});if(!session)return null;return users.findOne({_id:session.userId});}
async function requireUser(req,res){const u=await sessionUser(req);if(!u)send(res,401,{error:'Please log in again.'});return u;}
async function createSession(userId,res){const token=crypto.randomBytes(32).toString('base64url');await sessions.insertOne({tokenHash:hash(token),userId,expiresAt:new Date(Date.now()+14*86400000)});res.setHeader('Set-Cookie',cookie(token));}
async function gemini(contents,config={}){if(!GEMINI_API_KEY)return null;const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':GEMINI_API_KEY},body:JSON.stringify({contents,generationConfig:config})});const payload=await response.json();if(!response.ok)throw new Error(payload.error?.message||`Gemini returned ${response.status}`);return(payload.candidates?.[0]?.content?.parts||[]).map(p=>p.text||'').join('').trim();}
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
    const b=await readBody(req),email=String(b.email||'').trim().toLowerCase(),password=String(b.pass||''),u=await users.findOne({email});
    if(!u||!crypto.timingSafeEqual(Buffer.from(passwordHash(password,u.passSalt),'hex'),Buffer.from(u.passHash,'hex')))return send(res,401,{error:'Email or password is incorrect.'});
    await createSession(u._id,res);return send(res,200,{user:safeUser(u)});
   }
   if(url.pathname==='/api/logout'&&req.method==='POST'){const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);if(raw)await sessions.deleteOne({tokenHash:hash(decodeURIComponent(raw))});return send(res,200,{ok:true},{'Set-Cookie':cookie('',0)});}
   if(url.pathname==='/api/me'&&req.method==='GET'){const u=await requireUser(req,res);if(u)return send(res,200,{user:safeUser(u)});return;}
   const user=await requireUser(req,res);if(!user)return;
   if(url.pathname==='/api/account'&&req.method==='DELETE'){const filter={userId:user._id};await Promise.all([sessions.deleteMany(filter),attempts.deleteMany(filter),chats.deleteMany(filter),documents.deleteMany(filter),interviews.deleteMany(filter)]);await users.deleteOne({_id:user._id});return send(res,200,{ok:true},{'Set-Cookie':cookie('',0)});}
   if(url.pathname==='/api/profile'&&req.method==='PATCH'){const b=await readBody(req);if(!b.exam)return send(res,400,{error:'Choose an exam.'});await users.updateOne({_id:user._id},{$set:{exam:String(b.exam)}});return send(res,200,{ok:true});}
   if(url.pathname==='/api/attempts'&&req.method==='GET'){const rows=await attempts.find({userId:user._id}).sort({_id:-1}).limit(2000).toArray();return send(res,200,{attempts:rows.map(x=>({exam:x.exam,src:x.src,s:x.s,c:x.c,ok:x.ok,sec:x.sec,ts:x.createdAt}))});}
   if(url.pathname==='/api/attempts'&&req.method==='POST'){const b=await readBody(req),rows=Array.isArray(b.attempts)?b.attempts.slice(0,300):[];if(rows.length)await attempts.insertMany(rows.map(a=>({userId:user._id,exam:String(a.exam||user.exam),src:String(a.src||'quiz'),s:String(a.s||''),c:String(a.c||''),ok:Boolean(a.ok),sec:Math.max(0,Math.min(86400,Number(a.sec)||0)),createdAt:new Date()})));return send(res,201,{saved:rows.length});}
   if(url.pathname==='/api/chats'&&req.method==='GET'){const rows=await chats.find({userId:user._id}).sort({_id:-1}).limit(100).toArray();return send(res,200,{messages:rows.reverse().map(x=>({role:x.role,message:x.message,ts:x.createdAt}))});}
   if(url.pathname==='/api/documents'&&req.method==='GET'){const rows=await documents.find({userId:user._id},{projection:{name:1,mime:1,size:1,createdAt:1}}).sort({_id:-1}).toArray();return send(res,200,{documents:rows.map(x=>({id:String(x._id),name:x.name,mime:x.mime,size:x.size,ts:x.createdAt}))});}
   if(url.pathname==='/api/documents'&&req.method==='POST'){const b=await readBody(req),name=String(b.name||'').slice(0,180),mime=String(b.mime||'application/pdf'),allowed=['application/pdf','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],data=Buffer.from(String(b.data||''),'base64');if(!name||!allowed.includes(mime)||!data.length||data.length>8*1024*1024)return send(res,400,{error:'Upload a PDF, TXT, or DOCX file up to 8 MB.'});const r=await documents.insertOne({userId:user._id,name,mime,size:data.length,content:data,createdAt:new Date()});return send(res,201,{id:String(r.insertedId),name,size:data.length});}
   const deleteDoc=url.pathname.match(/^\/api\/documents\/([a-f\d]{24})$/i);if(deleteDoc&&req.method==='DELETE'){await documents.deleteOne({_id:new ObjectId(deleteDoc[1]),userId:user._id});return send(res,200,{ok:true});}
   if(url.pathname==='/api/interviews'&&req.method==='GET'){const rows=await interviews.find({userId:user._id},{projection:{exam:1,language:1,createdAt:1}}).sort({_id:-1}).limit(100).toArray();return send(res,200,{interviews:rows.map(x=>({exam:x.exam,language:x.language,ts:x.createdAt}))});}
   if(url.pathname==='/api/interviews'&&req.method==='POST'){const b=await readBody(req);await interviews.insertOne({userId:user._id,exam:user.exam,language:String(b.language||'en'),summary:b.summary||{},createdAt:new Date()});return send(res,201,{ok:true});}
   if(url.pathname==='/api/ai/chat'&&req.method==='POST'){
    const b=await readBody(req),message=String(b.message||'').trim();if(!message)return send(res,400,{error:'Write a question first.'});
    const docs=await documents.find({userId:user._id,mime:{$in:['application/pdf','text/plain']}}).sort({_id:-1}).limit(3).toArray(),parts=[{text:`You are Career Sarthii, a helpful bilingual Indian government-exam tutor. Current exam: ${user.exam}. Answer the student's question clearly, using their language. If attached study papers are provided, use them as reference.`}];
    for(const d of docs){const content=Buffer.isBuffer(d.content)?d.content:Buffer.from(d.content.buffer,0,d.content.position);if(d.mime==='application/pdf')parts.push({inline_data:{mime_type:d.mime,data:content.toString('base64')}});else parts.push({text:`Study document ${d.name}: ${content.toString('utf8').slice(0,12000)}`});}
    parts.push({text:message});let answer;try{answer=await gemini([{role:'user',parts}],{temperature:0.5,maxOutputTokens:1200})}catch(err){return send(res,502,{error:`Gemini could not answer: ${err.message}`})}if(!answer)answer='Gemini is not configured. Add GEMINI_API_KEY to .env to enable AI answers.';
    await chats.insertMany([{userId:user._id,role:'user',message,createdAt:new Date()},{userId:user._id,role:'assistant',message:answer,createdAt:new Date()}]);return send(res,200,{answer,ai:Boolean(GEMINI_API_KEY)});
   }
   if(url.pathname==='/api/ai/paper'&&req.method==='POST'){let qs;try{const text=await gemini([{role:'user',parts:[{text:`Create exactly 10 multiple-choice questions for ${user.exam} exam practice. Use English. Return only valid JSON array, each item having q (string), o (array of exactly 4 strings), a (zero-based correct option index), x (short explanation). Avoid current affairs. Ensure answer index correct.`}]}],{responseMimeType:'application/json',temperature:0.7,maxOutputTokens:3000});qs=JSON.parse(text||'[]');if(!Array.isArray(qs)||qs.length<5)throw Error('Invalid paper');qs=qs.slice(0,20).map(q=>({q:String(q.q),o:q.o.map(String),a:Number(q.a),x:String(q.x),s:'ga',c:'polity'}))}catch(err){if(GEMINI_API_KEY)return send(res,502,{error:`Paper generation failed: ${err.message}`});qs=seededPaper().map(q=>({...q,s:'ga',c:'polity'}))}return send(res,200,{questions:qs,generated:Boolean(GEMINI_API_KEY)});}
   if(url.pathname==='/api/ai/interview'&&req.method==='POST'){const b=await readBody(req),answers=Array.isArray(b.answers)?b.answers.slice(0,12):[];if(!answers.length)return send(res,400,{error:'Complete at least one interview answer.'});if(!GEMINI_API_KEY)return send(res,200,{feedback:'Gemini is not configured yet. Review each answer for a clear structure: direct response, one specific example, and a concise closing. Verify any facts you mention.'});try{const feedback=await gemini([{role:'user',parts:[{text:`You are a supportive but honest interview coach for the ${user.exam} exam. Review these answers in ${b.language==='hi'?'Hindi':'English'}. Give specific feedback on clarity, relevance, structure, and one improvement for each answer. Do not invent facts. Keep it concise. Answers: ${JSON.stringify(answers)}`}]}],{temperature:0.4,maxOutputTokens:1200});return send(res,200,{feedback})}catch(err){return send(res,502,{error:`Interview feedback failed: ${err.message}`})}}
   return send(res,404,{error:'API route not found.'});
  }
  let pathname=decodeURIComponent(url.pathname);if(pathname==='/')pathname='/index.html';const file=path.resolve(ROOT,'.'+pathname);if(!file.startsWith(ROOT+path.sep)&&file!==ROOT)return send(res,403,{error:'Forbidden'});fs.readFile(file,(err,content)=>{if(err)return send(res,404,{error:'Not found'});res.writeHead(200,{'content-type':mimeTypes[path.extname(file).toLowerCase()]||'application/octet-stream','x-content-type-options':'nosniff','referrer-policy':'same-origin'});res.end(content)});
 }catch(err){console.error(err);if(!res.headersSent)send(res,500,{error:err.message||'Server error.'})}
});

async function start(){
 if(!MONGODB_URI){console.error('MongoDB is required. Add MONGODB_URI to your .env file.');process.exitCode=1;return;}
 client=new MongoClient(MONGODB_URI);await client.connect();db=client.db(DB_NAME);
 users=db.collection('users');sessions=db.collection('sessions');attempts=db.collection('attempts');chats=db.collection('chats');documents=db.collection('documents');interviews=db.collection('interviews');
 await Promise.all([users.createIndex({email:1},{unique:true}),sessions.createIndex({tokenHash:1},{unique:true}),sessions.createIndex({expiresAt:1},{expireAfterSeconds:0}),attempts.createIndex({userId:1,_id:-1}),chats.createIndex({userId:1,_id:-1}),documents.createIndex({userId:1,_id:-1}),interviews.createIndex({userId:1,_id:-1})]);
 await db.command({ping:1});server.listen(PORT,()=>console.log(`Career Sarthii connected to MongoDB and running at http://localhost:${PORT}`));
}
start().catch(err=>{console.error('MongoDB connection failed:',err.message);process.exitCode=1;});
process.on('SIGINT',async()=>{if(client)await client.close();process.exit(0)});
