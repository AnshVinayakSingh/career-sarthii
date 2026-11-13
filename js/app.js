(function(){
const em=store.get('cs_session',null),all=store.get('cs_users',{}),me=all[em];
if(!me){location.replace('login.html');return}
const view=document.getElementById('view'),sel=document.getElementById('examSel');
const attKey='cs_att_'+em,intKey='cs_int_'+em;
const getAtt=()=>store.get(attKey,[]),exam=()=>EXAMS.find(e=>e.id===me.exam)||EXAMS[0];
const subj=id=>SUBJECTS.find(s=>s.id===id),chap=id=>CHAPTERS.find(c=>c.id===id);
const fmt=s=>{s=Math.max(0,Math.round(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;return(h?h+':'+String(m).padStart(2,'0'):m)+':'+String(r).padStart(2,'0')};
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const md=x=>esc(x).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/^\* /gm,'• ');
const qapi=async path=>{const r=await api(path);return r.questions};
let timers=[],hook=null;
const clearT=()=>{timers.forEach(clearInterval);timers=[];hook=null};
const saveAtt=arr=>{const rows=arr.map(a=>Object.assign({ts:Date.now(),exam:me.exam},a));store.set(attKey,getAtt().concat(rows));api('/attempts',{method:'POST',body:JSON.stringify({attempts:rows})}).catch(e=>console.error(e));};

function fillExams(){const v=me.exam;sel.innerHTML=examsFor(me.qual).map(e=>`<option value="${e.id}">${esc(e.n)}</option>`).join('');sel.value=v}
sel.onchange=()=>{me.exam=sel.value;all[em]=me;store.set('cs_users',all);api('/profile',{method:'PATCH',body:JSON.stringify({exam:me.exam})}).catch(console.error);route()};
document.getElementById('logout').onclick=async()=>{try{await api('/logout',{method:'POST'})}finally{store.set('cs_session',null);location.href='index.html'}};

/* practice quiz with instant feedback and per question timer */
function runQuiz(el,qs,done){
 let i=0,picked=null,start=Date.now(),frozen=null,res=[];
 function draw(){const q=qs[i];
  el.innerHTML=`<div class="qhead"><span>${i+1} ${t('q.of')} ${qs.length}</span><span class="timer" id="qt">${fmt((frozen??(Date.now()-start))/1000)}</span></div>
  <h3 class="qtext">${esc(L(q.q))}</h3>
  <div>${L(q.o).map((o,k)=>{let c='opt';if(picked!==null){if(k===q.a)c+=' correct';else if(k===picked)c+=' wrong'}return`<button class="${c}" data-k="${k}" ${picked!==null?'disabled':''}>${esc(o)}</button>`}).join('')}</div>
  ${picked===null?'':(picked===q.a?`<div class="fb ok"><b>${t('q.correct')}</b></div>`:`<div class="fb no"><b>${t('q.wrong')} ${esc(L(q.o)[q.a])}</b><b style="margin-top:8px">${t('q.exp')}</b>${esc(L(q.x))}</div>`)}
  ${picked===null?'':`<button class="btn" id="nx">${i===qs.length-1?t('q.finish'):t('q.next')}</button>`}`;
  el.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{frozen=Date.now()-start;picked=+b.dataset.k;res.push({s:qs[i].s,c:qs[i].c,ok:picked===qs[i].a,sec:Math.round(frozen/1000)});draw()});
  const nx=el.querySelector('#nx');if(nx)nx.onclick=()=>{if(i===qs.length-1){clearT();saveAtt(res.map(r=>Object.assign({src:'quiz'},r)));done(res)}else{i++;picked=null;frozen=null;start=Date.now();draw()}};
 }
 hook=draw;timers.push(setInterval(()=>{const e=document.getElementById('qt');if(e&&frozen===null)e.textContent=fmt((Date.now()-start)/1000)},500));draw();
}
function summary(el,res,again){
 const ok=res.filter(r=>r.ok).length,avg=res.reduce((a,r)=>a+r.sec,0)/(res.length||1);
 el.innerHTML=`<div class="kv"><div class="card"><b>${ok} / ${res.length}</b><span>${t('q.score')}</span></div><div class="card"><b>${Math.round(ok/(res.length||1)*100)}%</b><span>${t('q.acc')}</span></div><div class="card"><b>${fmt(avg)}</b><span>${t('q.avg')}</span></div></div><button class="btn" id="ag">${t('q.again')}</button>`;
 el.querySelector('#ag').onclick=again;
}
const head=(k,d)=>`<h2>${t(k)}</h2>${d?`<p style="color:var(--muted)">${t(d)}</p>`:''}`;

const V={
dashboard(){const a=getAtt();
 const tiles=[['chat','f.chat'],['pyq','f.pyq'],['model','f.model'],['chapters','f.chapter'],['interview','f.interview'],['notices','f.notify'],['analysis','f.analysis']];
 view.innerHTML=`<h2>${t('dash.hello')}, ${esc(me.name.split(' ')[0])}</h2>
 <div class="kv"><div class="card"><b>${esc(exam().n)}</b><span>${t('prof.exam')}</span></div><div class="card"><b>${esc(me.category)}</b><span>${t('prof.cat')}</span></div><div class="card"><b>${t('q.'+me.qual)}</b><span>${t('prof.qual')}</span></div><div class="card"><b>${a.length}</b><span>${t('dash.attempted')}</span></div></div>
 <div class="grid3">${tiles.map(([h,k])=>`<a class="card tile" href="#${h}"><h3>${t(k+'.t')}</h3><p>${t(k+'.d')}</p></a>`).join('')}</div><div class="block"><button class="tbtn" id="deleteAccount" type="button">Delete my account and data</button></div>`;
 view.querySelector('#deleteAccount').onclick=async()=>{if(!confirm('Permanently delete your account, saved papers, chat history, and practice history?'))return;try{await api('/account',{method:'DELETE'});store.set('cs_session',null);location.href='index.html'}catch(e){alert(e.message)}};
 },

chat(){
 view.innerHTML=`${head('chat.t')}<div class="chat"><div class="msgs" id="ms"></div><div class="chips"><button class="tbtn">${t('chat.s1')}</button><button class="tbtn">${t('chat.s2')}</button><button class="tbtn">${t('chat.s3')}</button></div><form class="send" id="sf"><input id="mi" placeholder="${t('chat.ph')}" autocomplete="off"><button class="btn" type="submit">${t('chat.send')}</button></form></div>`;
 const ms=view.querySelector('#ms'),add=(x,me_)=>{const d=document.createElement('div');d.className='msg'+(me_?' me':'');if(me_)d.textContent=x;else d.innerHTML=md(x);ms.appendChild(d);ms.scrollTop=ms.scrollHeight;return d};
 add(t('chat.hello')+' '+exam().n+'.');
 api('/chats').then(({messages})=>{ms.innerHTML='';messages.forEach(m=>add(m.message,m.role==='user'))}).catch(()=>{});
 let busy=false;
 const send=async x=>{if(!x.trim()||busy)return;busy=true;add(x,true);const bub=add('…',false);try{const r=await fetch('/api/ai/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:x})});if(r.status===401){location.replace('login.html');return}if((r.headers.get('content-type')||'').includes('json')){const j=await r.json();bub.innerHTML=md(j.answer||j.error||'Error')}else{const rd=r.body.getReader(),dc=new TextDecoder();let txt='';for(;;){const {done,value}=await rd.read();if(done)break;txt+=dc.decode(value,{stream:true});bub.innerHTML=md(txt);ms.scrollTop=ms.scrollHeight}}}catch(e){bub.textContent=e.message}finally{busy=false}};
 view.querySelectorAll('.chips button').forEach(b=>b.onclick=()=>send(b.textContent));
 view.querySelector('#sf').onsubmit=e=>{e.preventDefault();const i=view.querySelector('#mi');send(i.value);i.value=''};
},

pyq(){
 const real=((window.__meta||{}).pyq||{})[me.exam]||[];
 view.innerHTML=`${head('pyq.t','pyq.d')}<h3>${esc(exam().n)}</h3><div class="row2" style="max-width:420px;align-items:end"><div class="field" style="margin:0"><label for="yr">${t('q.year')}</label><select id="yr">${real.map(y=>`<option value="y${y}">${y} (official)</option>`).join('')}${[1,2,3,4,5].map(n=>`<option value="s${n}">Practice set ${n}</option>`).join('')}</select></div><div><button class="btn" id="go">${t('q.start')}</button></div></div><p class="hint" style="margin-top:12px">${t('q.sample')}</p><div id="box" style="margin-top:24px"></div>`;
 if(!window.__meta)api('/questions/meta').then(m=>{window.__meta=m;if(((m.pyq||{})[me.exam]||[]).length&&location.hash==='#pyq')pyq()}).catch(()=>{});
 const box=view.querySelector('#box');
 view.querySelector('#go').onclick=async()=>{clearT();const v=view.querySelector('#yr').value;box.textContent=t('model.busy');try{const start=async()=>{const qs=await qapi(v[0]==='y'?'/questions?year='+v.slice(1):'/questions?n=20&seed='+(+v.slice(1)*7919+Date.now()%1000));if(!qs.length){box.innerHTML=`<div class="notice">${t('chap.soon')}</div>`;return}runQuiz(box,qs,res=>summary(box,res,start))};await start()}catch(e){box.textContent=e.message}};
},

model(){
 view.innerHTML=`${head('model.t','model.d')}<div class="acts"><button class="btn" id="gen">${t('model.gen')}</button><button class="btn ghost" id="ai">${t('model.ai')}</button></div><div id="box" style="margin-top:24px"></div>`;
 const box=view.querySelector('#box');
 view.querySelector('#gen').onclick=async()=>{clearT();box.textContent=t('model.busy');try{paper(box,await qapi('/questions?paper=1&n=50&seed='+Date.now()%1e9))}catch(e){box.textContent=e.message}};
 view.querySelector('#ai').onclick=async()=>{clearT();box.textContent=t('model.busy');try{const r=await api('/ai/paper',{method:'POST',body:'{}'});paper(box,r.questions)}catch(e){box.textContent=e.message}};
},

chapters(){
 let sid=SUBJECTS[0].id,meta=(window.__meta||{}).chapters||{};
 api('/questions/meta').then(m=>{window.__meta=m;meta=m.chapters;if(location.hash==='#chapters'&&!view.querySelector('#box').innerHTML)draw()}).catch(()=>{});
 const draw=()=>{clearT();view.innerHTML=`${head('chap.t')}<div class="tabs">${SUBJECTS.map(s=>`<button class="tbtn ${s.id===sid?'on':''}" data-s="${s.id}">${esc(L(s))}</button>`).join('')}</div><div class="list">${CHAPTERS.filter(c=>c.s===sid).map(c=>{const n=meta[c.id];return`<button data-c="${c.id}"><b style="font-weight:500">${esc(L(c))}</b><span>${n==null?'':n<0?'∞':n} ${t('chap.n')}</span></button>`}).join('')}</div><div id="box" style="margin-top:20px"></div>`;
  view.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{sid=b.dataset.s;draw()});
  view.querySelectorAll('.list button').forEach(b=>b.onclick=async()=>{const box=view.querySelector('#box');box.textContent=t('model.busy');try{const go=async()=>{const qs=await qapi('/questions?c='+b.dataset.c+'&n=10&seed='+Date.now()%1e9);if(!qs.length){box.innerHTML=`<div class="notice">${t('chap.soon')}</div>`;return}runQuiz(box,qs,res=>summary(box,res,go))};await go();box.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){box.textContent=e.message}});
 };draw();hook=null;
},

interview(){
 if(!exam().iv){view.innerHTML=`${head('int.t')}<div class="notice">${t('int.none')}</div>`;return}
 view.innerHTML=`${head('int.t','int.d')}<h3>${esc(exam().n)}</h3><div class="field" style="max-width:260px"><label for="il">${t('int.lang')}</label><select id="il"><option value="en">English</option><option value="hi">हिंदी</option></select></div><button class="btn" id="go">${t('int.start')}</button><div id="box" style="margin-top:24px"></div>`;
 const il=view.querySelector('#il');il.value=lang;
 view.querySelector('#go').onclick=()=>{clearT();interviewRun(view.querySelector('#box'),il.value)};
},

notices(){
 const key='cs_notif_'+em,p=store.get(key,{notif:true,form:true,result:true}),e=exam();
 view.innerHTML=`${head('notice.t','notice.d')}<h3>${esc(e.n)}</h3><p><a class="btn" href="${e.u}" target="_blank" rel="noopener noreferrer">${t('notice.official')}</a></p>
 <div class="card" style="max-width:420px"><b>${t('notice.prefs')}</b><div style="margin-top:10px;display:grid;gap:8px">${[['notif','n.notif'],['form','n.form'],['result','n.result']].map(([k,l])=>`<label class="check"><input type="checkbox" data-k="${k}" ${p[k]?'checked':''}><span>${t(l)}</span></label>`).join('')}</div></div><p class="hint" style="margin-top:14px">${t('notice.note')}</p>`;
 view.querySelectorAll('input[data-k]').forEach(i=>i.onchange=()=>{p[i.dataset.k]=i.checked;store.set(key,p)});
},

documents(){
 view.innerHTML=`<h2>Study documents</h2><p style="color:var(--muted)">Upload previous year papers or notes. Files are stored in your account. PDF and TXT files can be used as references in AI chat.</p><form id="docForm" class="card" style="max-width:620px"><div class="field"><label for="docFile">PDF, TXT, or DOCX (up to 8 MB)</label><input id="docFile" type="file" accept=".pdf,.txt,.docx,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required></div><button class="btn" type="submit">Save document</button><span id="docMsg" class="hint" style="margin-left:12px"></span></form><div id="docs" class="list" style="margin-top:20px"></div>`;
 const list=view.querySelector('#docs'),msg=view.querySelector('#docMsg');
 const refresh=async()=>{try{const {documents}=await api('/documents');list.innerHTML=documents.length?documents.map(d=>`<div><b>${esc(d.name)}</b><span>${Math.ceil(d.size/1024)} KB <button class="tbtn" data-delete="${d.id}" type="button">Delete</button></span></div>`).join(''):'<div class="notice">No documents saved yet.</div>';list.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{await api('/documents/'+b.dataset.delete,{method:'DELETE'});refresh()})}catch(e){list.textContent=e.message}};
 view.querySelector('#docForm').onsubmit=async e=>{e.preventDefault();const f=view.querySelector('#docFile').files[0];if(!f)return;msg.textContent='Saving…';try{const data=await f.arrayBuffer(),bytes=new Uint8Array(data);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));const base64=btoa(binary),ext=f.name.split('.').pop().toLowerCase(),mimeByExt={pdf:'application/pdf',txt:'text/plain',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};await api('/documents',{method:'POST',body:JSON.stringify({name:f.name,mime:mimeByExt[ext]||f.type,data:base64})});msg.textContent='Saved';e.target.reset();refresh()}catch(x){msg.textContent=x.message}};
 refresh();
},

analysis(){
 const a=getAtt(),ints=store.get(intKey,[]);
 if(!a.length&&!ints.length){view.innerHTML=`${head('an.t')}<div class="notice">${t('an.empty')}</div>`;return}
 const ok=a.filter(x=>x.ok).length,avg=a.reduce((s,x)=>s+x.sec,0)/(a.length||1);
 const by=(arr,key)=>{const m={};arr.forEach(x=>{const k=x[key];if(!k)return;(m[k]=m[k]||{n:0,ok:0}).n++;if(x.ok)m[k].ok++});return m};
 const bs=by(a,'s'),bc=by(a,'c');
 const weak=Object.entries(bc).map(([k,v])=>[k,v.ok/v.n,v.n]).sort((x,y)=>x[1]-y[1]).slice(0,5);
 const slow=a.slice().sort((x,y)=>y.sec-x.sec).slice(0,5);
 view.innerHTML=`${head('an.t')}<div class="kv"><div class="card"><b>${a.length}</b><span>${t('dash.attempted')}</span></div><div class="card"><b>${a.length?Math.round(ok/a.length*100):0}%</b><span>${t('q.acc')}</span></div><div class="card"><b>${fmt(avg)}</b><span>${t('q.avg')}</span></div><div class="card"><b>${ints.length}</b><span>${t('an.int')}</span></div></div>
 <div class="two" style="gap:32px"><div class="card"><h3>${t('an.by')}</h3><div class="bars">${Object.entries(bs).map(([k,v])=>{const p=Math.round(v.ok/v.n*100);return`<div><div class="lab"><span>${esc(L(subj(k)))}</span><span>${p}% (${v.ok}/${v.n})</span></div><div class="track"><div class="fill" style="width:${p}%"></div></div></div>`}).join('')}</div></div>
 <div class="card"><h3>${t('an.weak')}</h3><div class="bars">${weak.map(([k,r,n])=>`<div><div class="lab"><span>${esc(L(chap(k)))}</span><span>${Math.round(r*100)}% (${n})</span></div><div class="track"><div class="fill" style="width:${Math.round(r*100)}%"></div></div></div>`).join('')}</div>
 <h3 style="margin-top:20px">${t('an.slow')}</h3>${slow.map(x=>`<div class="lab" style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px"><span>${esc(L(chap(x.c)||subj(x.s)))}</span><span>${x.sec} ${t('sec')}</span></div>`).join('')}</div></div>
 <p class="hint" style="margin-top:20px">${t('an.ai')}</p>`;
}};

/* three hour model paper */
function paper(el,source=shuffle(QUESTIONS)){
 const qs=shuffle(source),ans=qs.map(()=>null),spent=qs.map(()=>0);let cur=0,mark=Date.now(),total=Math.max(60,qs.length*72),end=Date.now()+total*1000,over=false;
 const lap=()=>{spent[cur]+=(Date.now()-mark)/1000;mark=Date.now()};
 function draw(){const q=qs[cur];
  el.innerHTML=`<div class="qhead"><span>${cur+1} ${t('q.of')} ${qs.length}</span><span>${t('model.left')}: <span class="timer" id="left">${fmt((end-Date.now())/1000)}</span></span></div>
  <h3 class="qtext">${esc(L(q.q))}</h3>${L(q.o).map((o,k)=>`<button class="opt ${ans[cur]===k?'sel':''}" data-k="${k}">${esc(o)}</button>`).join('')}
  <div class="pal">${qs.map((_,i)=>`<button data-i="${i}" class="${ans[i]!==null?'done':''} ${i===cur?'cur':''}">${i+1}</button>`).join('')}</div>
  <div class="acts"><button class="btn ghost" id="pv" ${cur?'':'disabled'}>${t('back')}</button><button class="btn ghost" id="nx" ${cur<qs.length-1?'':'disabled'}>${t('q.next')}</button><button class="btn ghost" id="cl">${t('model.clear')}</button><button class="btn" id="sb">${t('model.submit')}</button></div>`;
  el.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{ans[cur]=+b.dataset.k;draw()});
  el.querySelectorAll('.pal button').forEach(b=>b.onclick=()=>{lap();cur=+b.dataset.i;draw()});
  el.querySelector('#pv').onclick=()=>{lap();cur--;draw()};el.querySelector('#nx').onclick=()=>{lap();cur++;draw()};
  el.querySelector('#cl').onclick=()=>{ans[cur]=null;draw()};
  el.querySelector('#sb').onclick=()=>{if(confirm(t('model.confirm')))finish()};
 }
 function finish(){lap();clearT();
  const res=qs.map((q,i)=>({s:q.s,c:q.c,ok:ans[i]===q.a,sec:Math.round(spent[i]),src:'model'}));saveAtt(res);
  const ok=res.filter(r=>r.ok).length;
  el.innerHTML=`<div class="kv"><div class="card"><b>${ok} / ${qs.length}</b><span>${t('q.score')}</span></div><div class="card"><b>${fmt(total-Math.max(0,(end-Date.now())/1000))}</b><span>${t('model.left')}</span></div></div>
  <h3>${t('model.review')}</h3>${qs.map((q,i)=>`<div class="fb ${ans[i]===q.a?'ok':'no'}"><b>${i+1}. ${esc(L(q.q))}</b>${ans[i]===null?t('model.skipped'):esc(L(q.o)[ans[i]])}${ans[i]===q.a?'':`<br>${t('q.wrong')} ${esc(L(q.o)[q.a])}<br><i>${t('q.exp')}:</i> ${esc(L(q.x))}`}</div>`).join('')}<button class="btn" id="ag">${t('model.gen')}</button>`;
  el.querySelector('#ag').onclick=async()=>{el.textContent=t('model.busy');try{paper(el,await qapi('/questions?paper=1&n=50&seed='+Date.now()%1e9))}catch(e){el.textContent=e.message}};
 }
 hook=draw;timers.push(setInterval(()=>{const e=document.getElementById('left');if(e)e.textContent=fmt((end-Date.now())/1000);if(Date.now()>=end&&!over){over=true;finish()}},1000));draw();
}

/* interview rounds */
function interviewRun(el,lg){
 const qs=INTERVIEW[lg],ans=[];let i=0,st=Date.now();
 function draw(){
  el.innerHTML=`<div class="qhead"><span>${i+1} ${t('q.of')} ${qs.length}</span><span class="timer" id="qt">0:00</span></div><h3 class="qtext">${esc(qs[i])}</h3>
  <div class="field"><textarea id="ta" placeholder="${t('int.ans')}"></textarea></div>
  <div class="acts"><button class="btn ghost" id="sp">${t('int.speak')}</button><button class="btn" id="nx">${i===qs.length-1?t('int.end'):t('int.next')}</button></div>`;
  el.querySelector('#sp').onclick=()=>{if(!('speechSynthesis' in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(qs[i]);u.lang=lg==='hi'?'hi-IN':'en-IN';speechSynthesis.speak(u)};
  el.querySelector('#nx').onclick=()=>{speechSynthesis&&speechSynthesis.cancel();ans.push({q:qs[i],a:el.querySelector('#ta').value.trim(),sec:Math.round((Date.now()-st)/1000)});if(i===qs.length-1)end();else{i++;st=Date.now();draw()}};
 }
 async function end(){clearT();el.innerHTML='<div class="notice">Preparing your feedback…</div>';const words=x=>x.split(/\s+/).filter(Boolean).length;
  const summary={n:ans.length,words:ans.reduce((s,x)=>s+words(x.a),0),sec:ans.reduce((s,x)=>s+x.sec,0)};store.set(intKey,store.get(intKey,[]).concat([{ts:Date.now(),exam:me.exam,...summary}]));let feedback='Review each answer for a clear structure: direct response, one specific example, and a concise closing. Verify any facts you mention.';try{const r=await api('/ai/interview',{method:'POST',body:JSON.stringify({language:lg,answers:ans})});feedback=r.feedback}catch(e){feedback=e.message}api('/interviews',{method:'POST',body:JSON.stringify({language:lg,summary:{...summary,answers:ans,feedback}})}).catch(console.error);
  el.innerHTML=`<h3>${t('int.sum')}</h3>${ans.map((x,k)=>`<div class="fb"><b>${k+1}. ${esc(x.q)}</b>${esc(x.a)||'-'}<br><span class="hint">${words(x.a)} ${t('int.words')}, ${x.sec} ${t('sec')}</span></div>`).join('')}<div class="notice"><b>Interview feedback</b><br>${esc(feedback)}</div>`}
 timers.push(setInterval(()=>{const e=document.getElementById('qt');if(e)e.textContent=fmt((Date.now()-st)/1000)},500));draw();
}

function route(){clearT();const h=(location.hash||'#dashboard').slice(1),k=V[h]?h:'dashboard';
 document.querySelectorAll('#side a.nl').forEach(a=>a.classList.toggle('on',a.getAttribute('href')==='#'+k));V[k]();window.scrollTo(0,0)}
window.addEventListener('hashchange',route);
document.addEventListener('langchange',()=>{fillExams();if(hook)hook();else if(view.innerHTML)route()});
fillExams();route();
})();
