(function(){
const em=store.get('cs_session',null),all=store.get('cs_users',{}),me=all[em];
if(!me){location.replace('login.html');return}
const view=document.getElementById('view'),sel=document.getElementById('examSel');
const attKey='cs_att_'+em,intKey='cs_int_'+em;
const getAtt=()=>store.get(attKey,[]),exam=()=>EXAMS.find(e=>e.id===me.exam)||EXAMS[0];
const subj=id=>SUBJECTS.find(s=>s.id===id),chap=id=>CHAPTERS.find(c=>c.id===id);
const fmt=s=>{s=Math.max(0,Math.round(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),r=s%60;return(h?h+':'+String(m).padStart(2,'0'):m)+':'+String(r).padStart(2,'0')};
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const md=x=>{const code=[];let h=esc(x).replace(/```(?:\w+)?\n?([\s\S]*?)```/g,(_,c)=>{code.push(c);return '\u0000'+(code.length-1)+'\u0000'});h=h.replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*(.+?)\*\*/g,'<b>$1</b>');const out=[];let list=null;for(const ln of h.split('\n')){let m;if(m=ln.match(/^\s*(?:[-*\u2022]|\d+[.)])\s+(.*)/)){const o=/^\s*\d/.test(ln)?'ol':'ul';if(list!==o){if(list)out.push('</'+list+'>');out.push('<'+o+'>');list=o}out.push('<li>'+m[1]+'</li>');continue}if(list){out.push('</'+list+'>');list=null}if(m=ln.match(/^&gt;\s?(.*)/)){out.push('<blockquote>'+m[1]+'</blockquote>');continue}if(m=ln.match(/^#{1,4}\s+(.*)/)){out.push('<h4>'+m[1]+'</h4>');continue}out.push(ln.trim()===''?'<div class="gap"></div>':'<div>'+ln+'</div>')}if(list)out.push('</'+list+'>');return out.join('').replace(/\u0000(\d+)\u0000/g,(_,i)=>'<pre><code>'+code[i]+'</code></pre>')};
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
  ${picked===null?'':`<div class="fb ${picked===q.a?'ok':'no'}"><b>${picked===q.a?t('q.correct'):t('q.wrong')+' '+esc(L(q.o)[q.a])}</b><b style="margin-top:8px">${t('q.exp')}</b>${esc(L(q.x))}${q.ai?`<br><i style="opacity:.7">${t('pyq.ai')}</i>`:''}</div>`}
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
 view.innerHTML=`<div class="chatwrap" id="cw"><section class="chat"><div class="chat-top"><button class="icb" id="hb" type="button" aria-label="${t('chat.hist')}" title="${t('chat.hist')}">\u2630</button><b id="ct">${t('chat.t')}</b><select id="lg" class="lgsel" aria-label="Reply language"><option value="en">English</option><option value="hi">\u0939\u093f\u0928\u094d\u0926\u0940</option><option value="hinglish">Hinglish</option></select><button class="icb" id="nc2" type="button" aria-label="${t('chat.new')}" title="${t('chat.new')}">\uff0b</button></div><div class="msgs" id="ms"></div><button class="down hide" id="dn" type="button" aria-label="Scroll to latest">\u2193</button><div class="replyto hide" id="rq"><span id="rqt"></span><button class="icb" id="rqx" type="button" aria-label="Cancel reply">\u2715</button></div><form class="send" id="sf"><textarea id="mi" rows="1" placeholder="${t('chat.ph')}" enterkeyhint="send"></textarea><button class="sbtn" id="sb" type="submit" aria-label="${t('chat.send')}">\u2191</button></form></section><div class="bd hide" id="bd"></div><aside class="convs" id="cv"><div class="cv-h"><b>${t('chat.hist')}</b><button class="icb" id="cvx" type="button" aria-label="Close">\u2715</button></div><button class="btn sm" id="nc" type="button">+ ${t('chat.new')}</button><div class="cl" id="cl"></div><button class="tbtn" id="clr" type="button">${t('chat.clear')}</button></aside></div>`;
 const $=q=>view.querySelector(q),cw=$('#cw'),cv=$('#cv'),ms=$('#ms'),mi=$('#mi'),sb=$('#sb'),dn=$('#dn'),rq=$('#rq'),lg=$('#lg');
 let convId=null,busy=false,ctrl=null,quote='',convList=[];
 let lang=store.get('cs_chat_lang',(document.documentElement.lang||'en').startsWith('hi')?'hi':'en');lg.value=lang;lg.onchange=()=>{lang=lg.value;store.set('cs_chat_lang',lang)};
 const fit=()=>{const top=cw.getBoundingClientRect().top;cw.style.height=Math.max(340,window.innerHeight-Math.max(top,0)-12)+'px'};
 fit();addEventListener('resize',fit);hook=()=>removeEventListener('resize',fit);
 const near=()=>ms.scrollHeight-ms.scrollTop-ms.clientHeight<140,toEnd=()=>{ms.scrollTop=ms.scrollHeight};
 ms.addEventListener('scroll',()=>dn.classList.toggle('hide',near()));dn.onclick=toEnd;
 const drawer=o=>{cv.classList.toggle('open',o);$('#bd').classList.toggle('hide',!o)};
 $('#hb').onclick=()=>drawer(true);$('#cvx').onclick=()=>drawer(false);$('#bd').onclick=()=>drawer(false);
 const bar=me_=>`<div class="mt"><button data-a="copy">${t('chat.copy')}</button><button data-a="reply">${t('chat.reply')}</button>${me_?'':`<button data-a="regen">\u21bb ${t('chat.regen')}</button>`}</div>`;
 const add=(x,me_,saved=true)=>{const d=document.createElement('div');d.className='msg '+(me_?'me':'bot');d._raw=x;d._saved=saved;d.innerHTML=`<div class="mc">${md(x)}</div>`+bar(me_);ms.appendChild(d);return d};
 const setBot=(d,x)=>{d._raw=x;d.querySelector('.mc').innerHTML=md(x)};
 const trimRegen=()=>{ms.querySelectorAll('.bot [data-a=regen]').forEach(b=>b.remove());const bots=ms.querySelectorAll('.bot'),l=bots[bots.length-1];if(l&&l._raw&&l.querySelector('.mt'))l.querySelector('.mt').insertAdjacentHTML('beforeend',`<button data-a="regen">\u21bb ${t('chat.regen')}</button>`)};
 const empty=()=>{ms.innerHTML=`<div class="welcome"><div class="wi">\u2726</div><h2>${esc(t('chat.hello'))} ${esc(exam().n)}.</h2><div class="sugg">${[1,2,3].map(i=>`<button type="button">${esc(t('chat.s'+i))}</button>`).join('')}</div></div>`;ms.querySelectorAll('.sugg button').forEach(b=>b.onclick=()=>send(b.textContent));convId=null;$('#ct').textContent=t('chat.t')};
 const drawList=()=>{const cl=$('#cl');cl.innerHTML=convList.length?'':`<p class="hint" style="padding:8px">${t('chat.none')}</p>`;convList.forEach(c=>{const row=document.createElement('div');row.className='ci'+(c.id===convId?' on':'');row.innerHTML=`<button class="ct" type="button">${esc(c.title)}</button><button class="cx" type="button" aria-label="${t('chat.del')}" title="${t('chat.del')}">\u2715</button>`;row.querySelector('.ct').onclick=()=>open(c.id);row.querySelector('.cx').onclick=async()=>{if(!confirm(t('chat.del')+'?'))return;await api('/convs/'+c.id,{method:'DELETE'}).catch(()=>{});convList=convList.filter(x=>x.id!==c.id);if(convId===c.id)empty();drawList()};cl.appendChild(row)})};
 const load=async()=>{try{convList=(await api('/convs')).convs;drawList();return convList}catch{return[]}};
 const open=async id=>{drawer(false);try{const r=await api('/convs/'+id);ms.innerHTML='';r.messages.forEach(m=>add(m.message,m.role==='user'));convId=id;$('#ct').textContent=r.title;trimRegen();toEnd();drawList()}catch(e){alert(e.message)}};
 const stopUi=()=>{busy=false;ctrl=null;sb.textContent='\u2191';sb.classList.remove('stop')};
 const run=async(text,o={})=>{
  if(busy||!text.trim())return;busy=true;sb.textContent='\u25a0';sb.classList.add('stop');
  const w=ms.querySelector('.welcome');if(w)w.remove();
  if(!o.reuse)add(text,true);
  const bub=add('\u2026',false,false);bub.classList.add('typing');toEnd();ctrl=new AbortController();let txt='',failed=false;
  try{
   const r=await fetch('/api/ai/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:text,convId,regen:!!o.regen,lang}),signal:ctrl.signal});
   if(r.status===401){location.replace('login.html');return}
   if((r.headers.get('content-type')||'').includes('json')){const j=await r.json();txt=j.answer||j.error||'Error';failed=!j.answer||!!j.error;setBot(bub,txt)}
   else{const id=r.headers.get('x-conv-id');if(id)convId=id;const rd=r.body.getReader(),dc=new TextDecoder();for(;;){const {done,value}=await rd.read();if(done)break;txt+=dc.decode(value,{stream:true});bub.classList.remove('typing');const stick=near();setBot(bub,txt);if(stick)toEnd();else dn.classList.remove('hide')}}
  }catch(e){if(e.name==='AbortError'){if(!txt){setBot(bub,'('+t('chat.stopped')+')');failed=true}}else{failed=true;setBot(bub,txt||e.message)}}
  finally{bub.classList.remove('typing');bub._saved=!failed&&!!txt;stopUi();trimRegen();if(!failed&&convId){const c=await load();const cur=c.find(x=>x.id===convId);if(cur)$('#ct').textContent=cur.title}}
 };
 const clearQuote=()=>{quote='';rq.classList.add('hide')};
 const buildMsg=x=>{const q=quote;clearQuote();return q?q.split('\n').map(l=>'> '+l).join('\n')+'\n\n'+x:x};
 const send=x=>run(buildMsg(x));
 $('#rqx').onclick=clearQuote;
 ms.addEventListener('click',async e=>{const b=e.target.closest('button[data-a]');if(!b)return;const m=b.closest('.msg'),raw=(m._raw||'').replace(/^(>.*\n?)+\s*/,'');
  if(b.dataset.a==='copy'){try{await navigator.clipboard.writeText(raw)}catch{const ta=document.createElement('textarea');ta.value=raw;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove()}b.textContent='\u2713';setTimeout(()=>{b.textContent=t('chat.copy')},1200)}
  if(b.dataset.a==='reply'){quote=raw.slice(0,200);$('#rqt').textContent=t('chat.replying')+': '+raw.slice(0,90)+(raw.length>90?'\u2026':'');rq.classList.remove('hide');mi.focus()}
  if(b.dataset.a==='regen'&&!busy){const users=ms.querySelectorAll('.me'),lu=users[users.length-1];if(!lu)return;const saved=m._saved;m.remove();run(lu._raw,{reuse:true,regen:saved})}
 });
 const grow=()=>{mi.style.height='auto';mi.style.height=Math.min(mi.scrollHeight,140)+'px'};mi.addEventListener('input',grow);
 const coarse=matchMedia('(pointer:coarse)').matches;
 mi.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!coarse){e.preventDefault();$('#sf').requestSubmit()}});
 $('#sf').onsubmit=e=>{e.preventDefault();if(busy){ctrl&&ctrl.abort();return}const x=mi.value.trim();if(!x)return;mi.value='';grow();send(x)};
 const fresh=()=>{if(busy)return;empty();drawer(false);drawList();mi.focus()};
 $('#nc').onclick=fresh;$('#nc2').onclick=fresh;
 $('#clr').onclick=async()=>{if(!convList.length||!confirm(t('chat.clear')+'?'))return;await api('/convs',{method:'DELETE'}).catch(()=>{});convList=[];empty();drawList()};
 empty();load().then(l=>{if(l.length)open(l[0].id)});
},

pyq(){
 view.innerHTML=`${head('pyq.t','pyq.d')}<h3>${esc(exam().n)}</h3><div id="box" style="margin-top:16px"></div>${me.admin?'<div id="adm"></div>':''}`;
 const box=view.querySelector('#box');let ov=null;
 const sname=id=>{const x=SUBJECTS.find(v=>v.id===id);return x?L(x):id};
 const years=()=>{if(!ov){box.textContent=t('model.busy');return}const any=ov.years.some(y=>Object.keys(y.subjects).length);
  box.innerHTML=(any?'':`<div class="notice">${t('pyq.none')}</div>`)+`<p class="hint">${t('pyq.pick')}</p><div class="yrs">${ov.years.map(y=>{const n=Object.values(y.subjects).reduce((p,c)=>p+c,0);return`<button class="yr" data-y="${y.year}" ${n?'':'disabled'}><b>${y.year}</b><span>${n?n+' '+t('pyq.q'):t('pyq.na')}</span></button>`}).join('')}</div>`;
  box.querySelectorAll('.yr:not([disabled])').forEach(b=>b.onclick=()=>subjects(ov.years.find(y=>y.year===+b.dataset.y)))};
 const subjects=y=>{clearT();const ent=Object.entries(y.subjects),tot=ent.reduce((p,[,n])=>p+n,0);
  box.innerHTML=`<button class="tbtn" id="bk" type="button">\u2190 ${t('pyq.back')}</button><h3 style="margin:14px 0 4px">${esc(exam().n)} ${y.year}</h3><p class="hint">${t('pyq.sub')}</p><div class="list">${ent.map(([s,n])=>`<button data-s="${s}"><b style="font-weight:500">${esc(sname(s))}</b><span>${n} ${t('pyq.q')}</span></button>`).join('')}${ent.length>1?`<button data-s="all"><b style="font-weight:500">${t('pyq.full')}</b><span>${tot} ${t('pyq.q')}</span></button>`:''}</div><div id="qb" style="margin-top:22px"></div>`;
  box.querySelector('#bk').onclick=()=>{clearT();years()};
  const go=async s=>{const qb=box.querySelector('#qb');clearT();qb.textContent=t('model.busy');try{const r=await api('/pyq/paper?exam='+encodeURIComponent(me.exam)+'&year='+y.year+(s==='all'?'':'&s='+s));if(!r.questions.length){qb.innerHTML=`<div class="notice">${t('pyq.none')}</div>`;return}runQuiz(qb,r.questions,res=>summary(qb,res,()=>go(s)));qb.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){qb.textContent=e.message}};
  box.querySelectorAll('.list button').forEach(b=>b.onclick=()=>go(b.dataset.s))};
 const refresh=()=>api('/pyq/overview?exam='+encodeURIComponent(me.exam)).then(r=>{ov=r;years()}).catch(e=>{box.textContent=e.message});
 years();refresh();
 const adm=view.querySelector('#adm');if(!adm)return;
 const now=new Date().getFullYear();
 adm.innerHTML=`<hr style="margin:32px 0 18px;border:0;border-top:1px solid var(--line)"><h3>Import a paper (admin)</h3><p class="hint">Upload the official question paper PDF, and its answer key PDF if it is separate. AI reads it and saves the MCQs with answers and explanations for ${esc(exam().n)}. Keep the files under about 8 MB in total. Importing a year again replaces the old data.</p><div class="row2"><div class="field"><label for="ay">Year</label><select id="ay">${Array.from({length:10},(_,i)=>`<option>${now-i}</option>`).join('')}</select></div><div class="field"><label for="as">Subject</label><select id="as"><option value="auto">Auto detect (mixed paper)</option>${SUBJECTS.map(x=>`<option value="${x.id}">${esc(L(x))}</option>`).join('')}</select></div></div><div class="field"><label for="af">Question paper PDF</label><input type="file" id="af" accept="application/pdf"></div><div class="field"><label for="ak">Answer key PDF (optional)</label><input type="file" id="ak" accept="application/pdf"></div><div class="acts"><button class="btn" id="aim" type="button">Import with AI</button><button class="btn ghost" id="adl" type="button">Delete this year</button></div><p class="hint" id="am"></p>`;
 const am=adm.querySelector('#am'),b64=f=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=no;r.readAsDataURL(f)});
 adm.querySelector('#adl').onclick=async()=>{const y=adm.querySelector('#ay').value;if(!confirm('Delete all '+exam().n+' '+y+' questions?'))return;try{await api('/admin/pyq?exam='+encodeURIComponent(me.exam)+'&year='+y,{method:'DELETE'});am.textContent='Deleted.';refresh()}catch(e){am.textContent=e.message}};
 adm.querySelector('#aim').onclick=async()=>{const f=adm.querySelector('#af').files[0],k=adm.querySelector('#ak').files[0];if(!f){am.textContent='Choose the question paper PDF first.';return}if(f.size+(k?k.size:0)>8*1024*1024){am.textContent='Files are too large. Keep the total under 8 MB.';return}
  const btn=adm.querySelector('#aim');btn.disabled=true;am.textContent='Uploading...';
  try{const r=await api('/admin/pyq/import',{method:'POST',body:JSON.stringify({exam:me.exam,examName:exam().n,year:+adm.querySelector('#ay').value,subject:adm.querySelector('#as').value,paper:await b64(f),key:k?await b64(k):null})});
   const poll=async()=>{if(!document.body.contains(am))return;const j=await api('/admin/pyq/job/'+r.jobId);am.textContent=j.message;if(j.status==='running'){setTimeout(poll,3000)}else{btn.disabled=false;if(j.status==='done')refresh()}};poll()}
  catch(e){am.textContent=e.message;btn.disabled=false}};
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
