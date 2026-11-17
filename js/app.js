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
const tt=(a,b)=>lang==='hi'?b:a,fm=x=>+(+x).toFixed(2);
const qcard=(i,q,pk,extra)=>`<div class="fb ${pk==null?'':pk===q.a?'ok':'no'}"><b>${i}. ${esc(L(q.q))}</b>${L(q.o).map((o,k)=>`<div>${k===q.a?'\u2713 ':k===pk?'\u2717 ':'\u2022 '}${esc(o)}${k===pk?' \u2190 '+tt('your answer','आपका उत्तर'):''}</div>`).join('')}<div style="margin-top:6px"><i>${t('q.exp')}:</i> ${esc(L(q.x)||'')}</div>${extra||''}</div>`;
const qapi=async path=>{const r=await api(path);return r.questions};
let timers=[],hook=null;
const clearT=()=>{timers.forEach(clearInterval);timers=[];hook=null};
const saveAtt=arr=>{const rows=arr.map(a=>Object.assign({ts:Date.now(),exam:me.exam},a));store.set(attKey,getAtt().concat(rows));api('/attempts',{method:'POST',body:JSON.stringify({attempts:rows})}).catch(e=>console.error(e));};

function fillExams(){const v=me.exam;sel.innerHTML=examsFor(me.qual).map(e=>`<option value="${e.id}">${esc(e.n)}</option>`).join('');sel.value=v}
sel.onchange=()=>{me.exam=sel.value;all[em]=me;store.set('cs_users',all);api('/profile',{method:'PATCH',body:JSON.stringify({exam:me.exam})}).catch(console.error);route()};
document.getElementById('logout').onclick=async()=>{try{await api('/logout',{method:'POST'})}finally{store.set('cs_session',null);location.href='index.html'}};

/* practice quiz with instant feedback and per question timer */
const noTr=q=>q.s==='eng'||q.s==='hindi'||(q.q&&q.q.hi);
async function trQs(qs){const need=qs.filter(q=>!noTr(q));
 for(let round=0;round<4;round++){const todo=need.filter(q=>!(q.q&&q.q.hi));if(!todo.length)return;if(round)await new Promise(r=>setTimeout(r,2000*round));
  const parts=[];for(let i=0;i<todo.length;i+=30)parts.push(todo.slice(i,i+30));
  await Promise.all(parts.map(async part=>{try{const r=await api('/translate',{method:'POST',body:JSON.stringify({items:part.map(q=>({q:q.q.en,o:q.o.en,x:(q.x&&q.x.en)||''}))})});part.forEach((q,k)=>{const v=r.items[k];if(v){q.q.hi=v.q;q.o.hi=v.o;q.x=q.x||{};q.x.hi=v.x}})}catch{}}))}}
function withTr(el,qs,go){if(lang!=='hi'||!qs.some(q=>!noTr(q)))return go();el.innerHTML=`<div class="notice">${t('tr.busy')}</div>`;trQs(qs).then(go,()=>{el.innerHTML=`<div class="notice">${t('tr.fail')}</div>`;setTimeout(go,1800)})}
function runQuiz(el,qs,done,ctx){withTr(el,qs,()=>runQuizNow(el,qs,done,ctx))}
function runQuizNow(el,qs,done,ctx){
 let i=0,picked=null,start=Date.now(),frozen=null,res=[];
 function draw(){const q=qs[i];
  el.innerHTML=`<div class="qhead"><span>${i+1} ${t('q.of')} ${qs.length}</span><span class="timer" id="qt">${fmt((frozen??(Date.now()-start))/1000)}</span></div>
  <h3 class="qtext">${esc(L(q.q))}</h3>
  <div>${L(q.o).map((o,k)=>{let c='opt';if(picked!==null){if(k===q.a)c+=' correct';else if(k===picked)c+=' wrong'}return`<button class="${c}" data-k="${k}" ${picked!==null?'disabled':''}>${esc(o)}</button>`}).join('')}</div>
  ${picked===null?'':`<div class="fb ${picked===q.a?'ok':'no'}"><b>${picked===q.a?t('q.correct'):t('q.wrong')+' '+esc(L(q.o)[q.a])}</b><b style="margin-top:8px">${t('q.exp')}</b>${esc(L(q.x))}${q.ai?`<br><i style="opacity:.7">${t('pyq.ai')}</i>`:''}</div>`}
  ${picked===null?'':`<button class="btn" id="nx">${i===qs.length-1?t('q.finish'):t('q.next')}</button>`}`;
  el.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{frozen=Date.now()-start;picked=+b.dataset.k;res.push({s:qs[i].s,c:qs[i].c,ok:picked===qs[i].a,sec:Math.round(frozen/1000)});if(ctx&&ctx.chap){api('/chap/answer',{method:'POST',body:JSON.stringify({id:qs[i].id,picked,sec:Math.round(frozen/1000)})}).catch(()=>{})}else if(ctx){const z=qs[i];api('/qlog',{method:'POST',body:JSON.stringify({exam:me.exam,year:ctx.year,paper:ctx.paper,s:z.s,q:z.q,o:z.o,a:z.a,x:z.x||null,picked,ok:picked===z.a,sec:Math.round(frozen/1000),ai:!!z.ai})}).catch(()=>{})}draw()});
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
profile(){
 const o=(v,l,cur)=>`<option value="${v}"${cur===v?' selected':''}>${l}</option>`;
 let av=me.avatar||'';
 view.innerHTML=`${head('pr.title','pr.hint')}<div class="prof"><div class="pav"><div class="avbig" id="avb"></div><div class="acts"><label class="btn ghost sm" for="avf" style="cursor:pointer">${t('pr.photo')}</label><input type="file" id="avf" accept="image/*" hidden><button class="btn ghost sm" id="avr" type="button">${t('pr.rm')}</button></div></div>
 <div class="field"><label for="pn">${t('pr.name')}</label><input id="pn" maxlength="60" value="${esc(me.name)}"></div>
 <div class="row2"><div class="field"><label for="pg">${t('pr.gender')}</label><select id="pg">${o('male',t('g.male'),me.gender)}${o('female',t('g.female'),me.gender)}${o('other',t('g.other'),me.gender)}</select></div>
 <div class="field"><label for="pc">${t('pr.cat')}</label><select id="pc">${['General','OBC','SC','ST','EWS','Other'].map(c=>o(c,c==='General'?t('c.gen'):c==='Other'?t('c.other'):c,me.category)).join('')}</select></div></div>
 <div class="row2"><div class="field"><label for="pq">${t('pr.qual')}</label><select id="pq">${o('10',t('q.10'),me.qual)}${o('12',t('q.12'),me.qual)}${o('grad',t('q.grad'),me.qual)}</select></div>
 <div class="field"><label for="pe">${t('pr.exam')}</label><select id="pe"></select></div></div>
 <div class="field"><label for="pb">${t('pr.bio')}</label><textarea id="pb" rows="3" maxlength="300">${esc(me.bio||'')}</textarea></div>
 <button class="btn" id="ps" type="button">${t('pr.save')}</button> <span class="hint" id="pm"></span></div>`;
 const $=q=>view.querySelector(q),paint=()=>{$('#avb').innerHTML=av?`<img src="${av}" alt="">`:esc((me.name||'?').trim()[0]||'?').toUpperCase()};paint();
 const fillE=()=>{const q=$('#pq').value,list=examsFor(q),cur=list.some(e=>e.id===me.exam)?me.exam:list[0].id;$('#pe').innerHTML=list.map(e=>`<option value="${e.id}"${e.id===cur?' selected':''}>${esc(e.n)}</option>`).join('')};fillE();$('#pq').onchange=fillE;
 $('#avr').onclick=()=>{av='';paint()};
 $('#avf').onchange=e=>{const f=e.target.files[0];if(!f)return;const img=new Image(),u=URL.createObjectURL(f);img.onload=()=>{const c=document.createElement('canvas'),z=256,m=Math.min(img.width,img.height);c.width=c.height=z;c.getContext('2d').drawImage(img,(img.width-m)/2,(img.height-m)/2,m,m,0,0,z,z);av=c.toDataURL('image/jpeg',.82);URL.revokeObjectURL(u);paint()};img.onerror=()=>{$('#pm').textContent=t('pr.badimg')};img.src=u};
 $('#ps').onclick=async()=>{const btn=$('#ps');btn.disabled=true;$('#pm').textContent='';try{const r=await api('/profile',{method:'PATCH',body:JSON.stringify({name:$('#pn').value,gender:$('#pg').value,category:$('#pc').value,qual:$('#pq').value,exam:$('#pe').value,bio:$('#pb').value,avatar:av})});Object.assign(me,r.user);all[em]=me;store.set('cs_users',all);fillExams();paintAv();$('#pm').textContent=t('pr.saved')}catch(e){$('#pm').textContent=e.message}btn.disabled=false};
},

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
 view.innerHTML=`<div class="hdr"><div>${head('pyq.t','pyq.d')}</div><button class="tbtn" id="mya" type="button">${tt('My attempted questions','मेरे हल किए प्रश्न')}</button></div><h3>${esc(exam().n)}</h3><div id="box" style="margin-top:16px"></div>`;
 const box=view.querySelector('#box');let ov=null;
 const EXTRA={hindi:{en:'Hindi',hi:'\u0939\u093f\u0902\u0926\u0940'},sci:{en:'General Science',hi:'\u0938\u093e\u092e\u093e\u0928\u094d\u092f \u0935\u093f\u091c\u094d\u091e\u093e\u0928'}};
 const sname=id=>{const x=SUBJECTS.find(v=>v.id===id)||EXTRA[id];return x?L(x):id};
 const sum=o=>Object.values(o).reduce((p,c)=>p+c,0),tot=y=>y.papers.reduce((p,c)=>p+sum(c.subjects),0);
 const back=(f)=>{box.querySelector('#bk').onclick=f};
 const years=()=>{clearT();box.dataset.m='y';if(!ov){box.textContent=t('model.busy');return}
  box.innerHTML=`<p class="hint">${t('pyq.pick')}</p><div class="yrs">${ov.years.map(y=>{const n=tot(y);return`<button class="yr${n?'':' up'}" data-y="${y.year}"><b>${y.year}</b><span>${n?(y.papers.length>1?y.papers.length+' '+t('pyq.pp')+' \u00b7 ':'')+n+' '+t('pyq.q'):y.processing.length?t('pyq.proc'):t('pyq.up')}</span></button>`}).join('')}</div>`;
  box.querySelectorAll('.yr').forEach(b=>b.onclick=()=>{const y=ov.years.find(v=>v.year===+b.dataset.y);y.papers.length?papers(y):upload(y,'Paper 1')})};
 const papers=y=>{clearT();box.dataset.m='p';
  box.innerHTML=`<button class="tbtn" id="bk" type="button">\u2190 ${t('pyq.back')}</button><h3 style="margin:14px 0 4px">${esc(exam().n)} ${y.year}</h3><p class="hint">${t('pyq.papers')}</p><div class="list">${y.papers.map((p,i)=>`<button data-i="${i}"><b style="font-weight:500">${esc(p.label)}</b><span>${sum(p.subjects)} ${t('pyq.q')}</span></button>`).join('')}${y.processing.map(l=>`<button disabled><b style="font-weight:500">${esc(l)}</b><span>${t('pyq.proc')}</span></button>`).join('')}<button data-i="add"><b style="font-weight:500">+ ${t('pyq.add')}</b><span></span></button></div>`;
  back(years);box.querySelectorAll('.list button[data-i]').forEach(b=>b.onclick=()=>b.dataset.i==='add'?upload(y,''):subjects(y,y.papers[+b.dataset.i]))};
 const subjects=(y,p)=>{clearT();box.dataset.m='s';const ent=Object.entries(p.subjects),n=sum(p.subjects),lab=encodeURIComponent(p.label);
  box.innerHTML=`<button class="tbtn" id="bk" type="button">\u2190 ${t('pyq.back')}</button><h3 style="margin:14px 0 4px">${esc(exam().n)} ${y.year} \u00b7 ${esc(p.label)}</h3><p class="hint">${t('pyq.sub')}</p><div class="list">${ent.map(([s,c])=>`<button data-s="${s}"><b style="font-weight:500">${esc(sname(s))}</b><span>${c} ${t('pyq.q')}</span></button>`).join('')}${ent.length>1?`<button data-s="all"><b style="font-weight:500">${t('pyq.full')}</b><span>${n} ${t('pyq.q')}</span></button>`:''}</div><div id="qb" style="margin-top:22px"></div><div class="repbox"><button class="tbtn" id="rp" type="button">\u2606 ${t('pyq.rep')}</button><div id="rf" class="hide"><textarea id="rn" rows="2" maxlength="500" placeholder="${t('pyq.repn')}"></textarea><button class="btn sm" id="rs" type="button">${t('pyq.reps')}</button></div></div>`;
  back(()=>papers(y));
  const rp=box.querySelector('#rp'),rf=box.querySelector('#rf');rp.onclick=()=>rf.classList.toggle('hide');
  box.querySelector('#rs').onclick=async()=>{try{await api('/pyq/report',{method:'POST',body:JSON.stringify({exam:me.exam,year:y.year,label:p.label,note:box.querySelector('#rn').value})});rf.classList.add('hide');rp.textContent='\u2605 '+t('pyq.reped');rp.disabled=true}catch(e){alert(e.message)}};
  const go=async s=>{const qb=box.querySelector('#qb');clearT();qb.textContent=t('model.busy');try{const r=await api('/pyq/paper?exam='+encodeURIComponent(me.exam)+'&year='+y.year+'&label='+lab+(s==='all'?'':'&s='+s));if(!r.questions.length){qb.innerHTML=`<div class="notice">${t('pyq.none')}</div>`;return}runQuiz(qb,r.questions,res=>summary(qb,res,()=>go(s)),{year:y.year,paper:p.label});qb.scrollIntoView({behavior:'smooth',block:'start'})}catch(e){qb.textContent=e.message}};
  box.querySelectorAll('.list button').forEach(b=>b.onclick=()=>go(b.dataset.s))};
 const upload=(y,label)=>{clearT();box.dataset.m='u';const busy=label&&y.processing.includes(label);
  box.innerHTML=`<button class="tbtn" id="bk" type="button">\u2190 ${t('pyq.back')}</button><h3 style="margin:14px 0 6px">${esc(exam().n)} ${y.year}</h3><div class="notice">${busy?t('pyq.busy'):t('pyq.need')}</div>${busy?'':`<div class="field" style="margin-top:16px"><label for="al">${t('pyq.label')}</label><input id="al" list="pl" maxlength="30" value="${esc(label)}" placeholder="Paper 1, Paper 2, Shift 1..."><datalist id="pl">${['Paper 1','Paper 2','Shift 1','Shift 2','Shift 3','Shift 4','Shift 5','Shift 6'].map(x=>`<option value="${x}">`).join('')}</datalist></div><div class="field"><label for="af">${t('pyq.paperpdf')}</label><input type="file" id="af" accept="application/pdf"></div><div class="field"><label for="ak">${t('pyq.keypdf')}</label><input type="file" id="ak" accept="application/pdf"></div><button class="btn" id="go" type="button">${t('pyq.send')}</button>`}<p class="hint" id="am" style="margin-top:12px"></p>`;
  back(y.papers.length?()=>papers(y):years);const go=box.querySelector('#go');if(!go)return;
  const am=box.querySelector('#am'),b64=f=>new Promise((ok,no)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]);r.onerror=no;r.readAsDataURL(f)});
  go.onclick=async()=>{const f=box.querySelector('#af').files[0],k=box.querySelector('#ak').files[0],lb=box.querySelector('#al').value.trim();if(!lb||!f){am.textContent=t('pyq.choose');return}if(f.size+(k?k.size:0)>8*1024*1024){am.textContent=t('pyq.big');return}
   go.disabled=true;am.textContent=t('pyq.upl');
   try{const r=await api('/pyq/import',{method:'POST',body:JSON.stringify({exam:me.exam,examName:exam().n,year:y.year,label:lb,file:await b64(f),key:k?await b64(k):null})});
    const poll=async()=>{if(!document.body.contains(am))return;const j=await api('/pyq/job/'+r.jobId);am.textContent=j.message;if(j.status==='running'){setTimeout(poll,3000)}else if(j.status==='done'){await refresh();const ny=ov.years.find(v=>v.year===y.year),np=ny&&ny.papers.find(v=>v.label===lb);if(np)subjects(ny,np)}else go.disabled=false};poll()}
   catch(e){am.textContent=e.message;go.disabled=false}}};
 const refresh=()=>api('/pyq/overview?exam='+encodeURIComponent(me.exam)).then(r=>{ov=r;if(box.dataset.m==='y')years()}).catch(e=>{box.textContent=e.message});
 const attGroup=async g=>{clearT();box.dataset.m='a2';box.innerHTML=`<button class="tbtn" id="bk" type="button">\u2190 ${t('pyq.back')}</button><h3 style="margin:14px 0 4px">${esc(exam().n)} ${g.year} \u00b7 ${esc(g.paper)}</h3><div id="ab">${t('model.busy')}</div>`;back(att);
  try{const r=await api('/qlog?exam='+encodeURIComponent(me.exam)+'&year='+g.year+'&paper='+encodeURIComponent(g.paper)),ab=box.querySelector('#ab'),ids=[...new Set(r.items.map(x=>x.s))];ab.innerHTML=ids.map(s=>{const it=r.items.filter(x=>x.s===s);return`<h3 style="margin:20px 0 6px">${esc(sname(s))} <span class="hint">${it.filter(x=>x.ok).length} / ${it.length}</span></h3>`+it.map((x,i)=>qcard(i+1,x,x.picked,x.times>1?`<div class="hint">${tt('Attempted','हल किया')} ${x.times} ${tt('times, latest shown','बार, आखिरी दिखाया गया')}</div>`:'')).join('')}).join('')}catch(e){box.querySelector('#ab').textContent=e.message}};
 const att=async()=>{clearT();box.dataset.m='a';box.innerHTML=`<button class="tbtn" id="bk" type="button">\u2190 ${t('pyq.back')}</button><h3 style="margin:14px 0 4px">${tt('My attempted questions','मेरे हल किए प्रश्न')}</h3><p class="hint">${tt('Pick the year to see your attempted questions, your answers and explanations.','वर्ष चुनें और अपने हल किए प्रश्न, उत्तर और व्याख्या देखें।')}</p><div class="list" id="ag">${t('model.busy')}</div>`;back(years);
  try{const r=await api('/qlog?exam='+encodeURIComponent(me.exam)),ag=box.querySelector('#ag');ag.innerHTML=r.groups.length?r.groups.map((g,i)=>`<button data-i="${i}"><b style="font-weight:500">${g.year} \u00b7 ${esc(g.paper)}</b><span>${g.ok} / ${g.total} ${tt('correct','सही')}</span></button>`).join(''):`<div class="notice">${tt('You have not attempted any previous year question yet.','आपने अभी तक कोई पिछले वर्ष का प्रश्न हल नहीं किया है।')}</div>`;ag.querySelectorAll('button').forEach(b=>b.onclick=()=>attGroup(r.groups[+b.dataset.i]))}catch(e){box.querySelector('#ag').textContent=e.message}};
 view.querySelector('#mya').onclick=att;
 years();refresh();
},

admin(){
 if(!me.admin){location.hash='#dashboard';return}
 view.innerHTML=`<h2>Admin</h2><p class="hint">All uploaded papers. Papers with a \u2605 were reported by students and are shown first. Review the questions: if the paper is fine, press Keep; if it is wrong, press Delete.</p><div id="al" style="margin-top:16px">Loading...</div>`;
 const nm=id=>(EXAMS.find(e=>e.id===id)||{n:id}).n,al=view.querySelector('#al');
 const qs=p=>`exam=${encodeURIComponent(p.exam)}&year=${p.year}&label=${encodeURIComponent(p.label)}`;
 const load=async()=>{try{const r=await api('/admin/pyq/papers');al.innerHTML=r.papers.length?'':'<div class="notice">No papers uploaded yet.</div>';
  r.papers.forEach(p=>{const d=document.createElement('div');d.className='card adm';d.innerHTML=`<b>${p.reports.length?`<span class="star">\u2605 ${p.reports.length}</span> `:''}${esc(nm(p.exam))} ${p.year} \u00b7 ${esc(p.label)}</b><div class="hint">${p.count} questions \u00b7 ${p.ai} solved by AI</div>${p.reports.map(x=>`<div class="rpt">${esc(x.by||'User')}: ${esc(x.note||'(no note)')}</div>`).join('')}<div class="acts" style="margin-top:10px"><button class="btn ghost sm" data-a="rv">Review questions</button>${p.reports.length?'<button class="btn ghost sm" data-a="keep">Keep (reports are wrong)</button>':''}<button class="btn sm stop" data-a="del">Delete paper</button></div><div class="rvw"></div>`;
   d.querySelector('[data-a=rv]').onclick=async e=>{const box=d.querySelector('.rvw');if(box.innerHTML){box.innerHTML='';return}box.textContent='Loading...';const x=await api('/pyq/paper?'+qs(p).replace('label','label'));box.innerHTML=x.questions.map((q,i)=>`<div class="rq"><b>${i+1}. ${esc(L(q.q))}</b>${L(q.o).map((o,k)=>`<div class="${k===q.a?'ok':''}">${k===q.a?'\u2713 ':''}${esc(o)}</div>`).join('')}<div class="hint" style="white-space:pre-line">${esc(L(q.x))}</div></div>`).join('')};
   const keep=d.querySelector('[data-a=keep]');if(keep)keep.onclick=async()=>{await api('/admin/pyq/dismiss?'+qs(p),{method:'POST',body:'{}'});load()};
   d.querySelector('[data-a=del]').onclick=async()=>{if(!confirm('Delete '+nm(p.exam)+' '+p.year+' '+p.label+'?'))return;await api('/admin/pyq?'+qs(p),{method:'DELETE'});load()};
   al.appendChild(d)})}catch(e){al.textContent=e.message}};
 load();
},

model(){
 view.innerHTML=`<div class="hdr"><div>${head('model.t')}</div><button class="tbtn" id="mya" type="button">${tt('My attempted questions','मेरे हल किए प्रश्न')}</button></div><h3>${esc(exam().n)}</h3><div id="box" style="margin-top:16px"></div>`;
 const box=view.querySelector('#box'),enc=encodeURIComponent;let info=null,run=0;
 const busy=m=>{clearT();box.innerHTML=`<div class="notice">${m||t('model.busy')}</div>`};
 const alive=k=>k===run&&document.body.contains(box);
 const bk=(f,l)=>{const b=box.querySelector('#bk');if(b)b.onclick=f};
 const stTxt=p=>p.status==='done'?tt('Score','स्कोर')+' '+fm(p.score)+' / '+fm(p.max):p.status==='started'?tt('In progress, resume','जारी है, आगे बढ़ें'):p.status==='generating'?tt('Being prepared...','तैयार हो रहा है...'):tt('Ready, not started','तैयार, शुरू नहीं हुआ');
 const pTable=p=>`<div style="overflow-x:auto"><table class="pt"><tr><th>${tt('Subject','विषय')}</th><th>${tt('Questions','प्रश्न')}</th><th>${tt('Marks per question','अंक प्रति प्रश्न')}</th><th>${tt('Negative marking','नेगेटिव मार्किंग')}</th><th>${tt('Total marks','कुल अंक')}</th></tr>${p.subjects.map(s=>`<tr><td>${esc(L(s))}</td><td>${s.n}</td><td>${fm(s.m)}</td><td>${s.neg?'-'+fm(s.neg):'0'}</td><td>${fm(s.n*s.m)}</td></tr>`).join('')}<tr class="tot"><td>${tt('Total','कुल')}</td><td>${p.q}</td><td></td><td></td><td>${fm(p.marks)}</td></tr></table></div>`;
 const home=async()=>{const k=++run;busy();try{info=await api('/model/info?exam='+enc(me.exam));if(!alive(k))return;drawHome()}catch(e){box.textContent=e.message}};
 const drawHome=()=>{clearT();const p=info.pattern,nx=(info.papers.reduce((a,x)=>Math.max(a,x.no),0))+1;
  box.innerHTML=`<div class="card"><b>${tt('Exam pattern','परीक्षा पैटर्न')}: ${p.q} ${tt('questions','प्रश्न')} · ${fm(p.marks)} ${tt('marks','अंक')} · ${p.dur} ${tt('minutes','मिनट')}</b>${p.note?`<div class="hint">${esc(L(p.note))}</div>`:''}${pTable(p)}<div class="hint">${tt('Real exam style: you see answers and your score only after you submit. Each new paper has fresh questions of the same type and trend as previous year papers.','असली परीक्षा की तरह: उत्तर और स्कोर सबमिट करने के बाद ही दिखेंगे। हर नया पेपर पिछले वर्षों के प्रकार और ट्रेंड के नए प्रश्नों का होता है।')}</div></div>
  <div class="list" style="margin-top:20px">${info.papers.map((x,i)=>`<button data-i="${i}"><b style="font-weight:500">${tt('Model Paper','मॉडल पेपर')} ${x.no}</b><span>${stTxt(x)}</span></button>`).join('')}</div>
  <button class="btn" id="mk" type="button" style="margin-top:8px">+ ${tt('Generate Model Paper','मॉडल पेपर बनाएँ')} ${nx}</button><p class="hint" id="mm"></p>`;
  box.querySelectorAll('.list button').forEach(b=>b.onclick=()=>open(info.papers[+b.dataset.i].id));
  box.querySelector('#mk').onclick=async()=>{const b=box.querySelector('#mk');b.disabled=true;try{const r=await api('/model/create',{method:'POST',body:JSON.stringify({exam:me.exam,examName:exam().n})});open(r.id)}catch(e){box.querySelector('#mm').textContent=e.message;b.disabled=false}};
 };
 const open=async id=>{const k=++run;busy();try{
   let p=await api('/model/paper?id='+id+'&lang='+lang);if(!alive(k))return;
   if(p.status==='generating'){return waitGen(id,k,p)}
   if(p.status==='error'){box.innerHTML=`<button class="tbtn" id="bk" type="button">\u2190 ${t('pyq.back')}</button><div class="notice" style="margin-top:14px">${esc(p.message)}</div>`;bk(home);return}
   if(p.status==='ready')return intro(p);
   if(p.status==='started')return runTest(p);
   result(p,p.fresh);
  }catch(e){box.textContent=e.message}};
 const waitGen=(id,k,p)=>{const draw=p=>{box.innerHTML=`<button class="tbtn" id="bk" type="button">\u2190 ${t('pyq.back')}</button><h3 style="margin:14px 0 6px">${tt('Model Paper','मॉडल पेपर')} ${p.no}</h3><div class="notice">${tt('Preparing your paper in the exam pattern. This takes a few minutes. Questions ready','आपका पेपर परीक्षा पैटर्न में तैयार हो रहा है। इसमें कुछ मिनट लगते हैं। तैयार प्रश्न')}: ${p.progress} / ${p.total}${p.message?' · '+tt('Translating to Hindi...','हिंदी अनुवाद हो रहा है...'):''}</div>`;bk(home)};draw(p);
  const poll=async()=>{if(!alive(k))return;try{const n=await api('/model/paper?id='+id+'&lang='+lang);if(!alive(k))return;if(n.status==='generating'){draw(n);setTimeout(poll,3000)}else open(id)}catch(e){box.textContent=e.message}};setTimeout(poll,3000)};
 const intro=p=>{const tq=p.questions.length,mk=p.subjects.reduce((a,s)=>a+s.n*s.m,0);
  box.innerHTML=`<button class="tbtn" id="bk" type="button">\u2190 ${t('pyq.back')}</button><h3 style="margin:14px 0 6px">${tt('Model Paper','मॉडल पेपर')} ${p.no}</h3><div class="card"><b>${tq} ${tt('questions','प्रश्न')} · ${fm(mk)} ${tt('marks','अंक')} · ${p.dur} ${tt('minutes','मिनट')}</b>${pTable({subjects:p.subjects,q:tq,marks:mk})}<ul class="hint"><li>${tt('The timer starts when you press Start and keeps running even if you leave this page.','स्टार्ट दबाते ही टाइमर शुरू हो जाता है और पेज छोड़ने पर भी चलता रहता है।')}</li><li>${tt('Answers and your score appear only after you submit.','उत्तर और स्कोर सबमिट करने के बाद ही दिखेंगे।')}</li><li>${tt('If you leave the test, unattempted questions score 0 and your attempted ones are marked.','टेस्ट छोड़ने पर हल न किए प्रश्नों के 0 अंक मिलेंगे और हल किए प्रश्नों की मार्किंग होगी।')}</li></ul></div><button class="btn" id="st" type="button" style="margin-top:16px">${tt('Start test','टेस्ट शुरू करें')}</button><p class="hint" id="sm"></p>`;
  bk(home);const b=box.querySelector('#st');b.onclick=async()=>{b.disabled=true;box.querySelector('#sm').textContent=t('model.busy');try{const r=await api('/model/start',{method:'POST',body:JSON.stringify({id:p.id,lang})});runTest(r)}catch(e){box.querySelector('#sm').textContent=e.message;b.disabled=false}}};
 function runTest(p){clearT();const k=++run,qs=p.questions,N=qs.length,ans=Array.from({length:N},(_,i)=>p.answers[i]??null),spent=Array.from({length:N},(_,i)=>+p.spent[i]||0),off=p.now-Date.now(),endAt=p.endsAt;
  let cur=Math.max(0,ans.findIndex(x=>x===null)),mark=Date.now(),over=false;
  const left=()=>(endAt-(Date.now()+off))/1000,lap=()=>{spent[cur]+=(Date.now()-mark)/1000;mark=Date.now()};
  const save=()=>{lap();api('/model/save',{method:'POST',body:JSON.stringify({id:p.id,answers:ans,spent:spent.map(Math.round)})}).catch(()=>{})};
  const sub=id=>p.subjects.find(s=>s.id===id),att=()=>ans.filter(x=>x!==null).length;
  function draw(){const q=qs[cur],sid=q.s;
   box.innerHTML=`<div class="qhead"><span>${cur+1} ${t('q.of')} ${N}</span><span>${t('model.left')}: <span class="timer" id="left">${fmt(left())}</span></span></div>
   <div class="tabs sec">${p.subjects.map(s=>{const ix=qs.map((x,i)=>x.s===s.id?i:-1).filter(i=>i>=0),d=ix.filter(i=>ans[i]!==null).length;return`<button class="tbtn ${s.id===sid?'on':''}" data-f="${ix[0]}">${esc(L(s))} (${d}/${ix.length})</button>`}).join('')}</div>
   <h3 class="qtext">${esc(L(q.q))}</h3>${L(q.o).map((o,i)=>`<button class="opt ${ans[cur]===i?'sel':''}" data-k="${i}">${esc(o)}</button>`).join('')}
   <div class="pal">${qs.map((x,i)=>x.s===sid?`<button data-i="${i}" class="${ans[i]!==null?'done':''} ${i===cur?'cur':''}">${i+1}</button>`:'').join('')}</div>
   <div class="acts"><button class="btn ghost" id="pv" ${cur?'':'disabled'}>${t('back')}</button><button class="btn ghost" id="nx" ${cur<N-1?'':'disabled'}>${t('q.next')}</button><button class="btn ghost" id="cl">${t('model.clear')}</button><button class="btn" id="sb">${tt('Submit / Leave test','सबमिट / टेस्ट छोड़ें')}</button></div>`;
   box.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{ans[cur]=+b.dataset.k;save();draw()});
   box.querySelectorAll('.pal button').forEach(b=>b.onclick=()=>{lap();cur=+b.dataset.i;draw()});
   box.querySelectorAll('.sec button').forEach(b=>b.onclick=()=>{lap();cur=+b.dataset.f;draw()});
   box.querySelector('#pv').onclick=()=>{lap();cur--;draw()};box.querySelector('#nx').onclick=()=>{lap();cur++;draw()};
   box.querySelector('#cl').onclick=()=>{ans[cur]=null;save();draw()};
   box.querySelector('#sb').onclick=()=>{const a=att();if(confirm(tt(`You attempted ${a} of ${N} questions. Unattempted questions will score 0. Submit the test and see your result?`,`आपने ${N} में से ${a} प्रश्न हल किए हैं। हल न किए प्रश्नों के 0 अंक मिलेंगे। क्या टेस्ट सबमिट करके रिज़ल्ट देखना चाहते हैं?`)))finish()};
  }
  async function finish(){if(over)return;over=true;lap();clearT();busy(tt('Checking your answers...','आपके उत्तर जाँचे जा रहे हैं...'));try{const r=await api('/model/submit',{method:'POST',body:JSON.stringify({id:p.id,answers:ans,spent:spent.map(Math.round)})});result(r,r.fresh)}catch(e){over=false;box.innerHTML=`<div class="notice">${esc(e.message)}</div><button class="btn" id="rt" type="button" style="margin-top:12px">${tt('Try again','फिर कोशिश करें')}</button>`;box.querySelector('#rt').onclick=finish}}
  hook=()=>{if(lang==='hi'&&qs.some(x=>x.s!=='eng'&&x.s!=='hindi'&&!x.q.hi))api('/model/paper?id='+p.id+'&lang=hi').then(r=>{r.questions.forEach((x,i)=>{if(x.q.hi){qs[i].q=x.q;qs[i].o=x.o}});if(alive(k))draw()}).catch(()=>{});draw()};
  timers.push(setInterval(()=>{const e=document.getElementById('left');if(e)e.textContent=fmt(left());if(left()<=0&&!over)finish()},1000));draw()}
 function result(p,fresh){clearT();const r=p.result,qs=p.questions;
  if(fresh)saveAtt(qs.map((q,i)=>p.answers[i]==null?null:{s:q.s,c:'',ok:p.answers[i]===q.a,sec:Math.round(p.spent[i]||0),src:'model'}).filter(Boolean));
  let sid=p.subjects[0].id;
  const card=(b,s)=>`<div class="card"><b>${b}</b><span>${s}</span></div>`;
  const draw=()=>{box.innerHTML=`<button class="tbtn" id="bk" type="button">\u2190 ${t('pyq.back')}</button><h3 style="margin:14px 0 12px">${tt('Model Paper','मॉडल पेपर')} ${p.no} · ${tt('Result','रिज़ल्ट')}</h3>
   <div class="kv">${card(fm(r.score)+' / '+fm(r.max),tt('Score','स्कोर'))}${card(fm(r.pct)+'%',tt('Percentage','प्रतिशत'))}${card(r.att+' / '+r.n,tt('Attempted','हल किए'))}${card(r.acc+'%',t('q.acc'))}</div>
   <div class="kv">${card(r.ok,tt('Correct','सही'))}${card(r.bad,tt('Wrong','गलत'))}${card(r.skip,tt('Unattempted','बिना हल किए'))}${card(fmt(r.sec),tt('Time taken','लिया गया समय'))}</div>
   <h3>${tt('Subject wise','विषय अनुसार')}</h3><div style="overflow-x:auto"><table class="pt"><tr><th>${tt('Subject','विषय')}</th><th>${tt('Attempted','हल किए')}</th><th>${tt('Correct','सही')}</th><th>${tt('Wrong','गलत')}</th><th>${tt('Skipped','छोड़े')}</th><th>${tt('Marks','अंक')}</th><th>${tt('Accuracy','सटीकता')}</th></tr>${r.subjects.map(s=>`<tr><td>${esc(L(s))}</td><td>${s.att} / ${s.n}</td><td>${s.ok}</td><td>${s.bad}</td><td>${s.skip}</td><td>${fm(s.marks)} / ${fm(s.max)}</td><td>${s.att?s.acc+'%':'0'}</td></tr>`).join('')}<tr class="tot"><td>${tt('Total','कुल')}</td><td>${r.att} / ${r.n}</td><td>${r.ok}</td><td>${r.bad}</td><td>${r.skip}</td><td>${fm(r.score)} / ${fm(r.max)}</td><td>${r.acc}%</td></tr></table></div>
   <h3 style="margin-top:24px">${t('model.review')}</h3><div class="tabs">${p.subjects.map(s=>`<button class="tbtn ${s.id===sid?'on':''}" data-s="${s.id}">${esc(L(s))}</button>`).join('')}</div>
   ${qs.map((q,i)=>q.s!==sid?'':qcard(i+1,q,p.answers[i],`<div class="hint">${p.answers[i]==null?tt('Not attempted: 0 marks','हल नहीं किया: 0 अंक'):p.answers[i]===q.a?'+'+fm(p.subjects.find(s=>s.id===q.s).m):'-'+fm(p.subjects.find(s=>s.id===q.s).neg)} ${tt('marks','अंक')}${q.t?' · '+esc(q.t):''}</div>`)).join('')}
   <button class="btn" id="home" type="button">${tt('All model papers','सभी मॉडल पेपर')}</button>`;
   bk(home);box.querySelector('#home').onclick=home;box.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{sid=b.dataset.s;draw()})};
  hook=draw;draw()}
 view.querySelector('#mya').onclick=async()=>{const k=++run;busy();try{const r=await api('/model/info?exam='+enc(me.exam));if(!alive(k))return;const done=r.papers.filter(x=>x.status==='done');
   box.innerHTML=`<button class="tbtn" id="bk" type="button">\u2190 ${t('pyq.back')}</button><h3 style="margin:14px 0 6px">${tt('My attempted questions','मेरे हल किए प्रश्न')}</h3><p class="hint">${tt('Pick a model paper to see every question, your answer, the right answer and the explanation.','किसी मॉडल पेपर को चुनें और हर प्रश्न, अपना उत्तर, सही उत्तर और व्याख्या देखें।')}</p><div class="list">${done.length?done.map((x,i)=>`<button data-i="${i}"><b style="font-weight:500">${tt('Model Paper','मॉडल पेपर')} ${x.no}</b><span>${fm(x.score)} / ${fm(x.max)}</span></button>`).join(''):`<div class="notice">${tt('No submitted model papers yet.','अभी कोई सबमिट किया हुआ मॉडल पेपर नहीं है।')}</div>`}</div>`;
   bk(home);box.querySelectorAll('.list button').forEach(b=>b.onclick=()=>open(done[+b.dataset.i].id))}catch(e){box.textContent=e.message}};
 home();
},

chapters(){
 view.innerHTML=`<div class="hdr"><div>${head('chap.t')}</div><button class="tbtn" id="mya" type="button">${tt('My attempted questions','मेरे हल किए प्रश्न')}</button></div><h3>${esc(exam().n)}</h3><div id="box" style="margin-top:16px"></div>`;
 const box=view.querySelector('#box'),enc=encodeURIComponent,bkb=`<button class="tbtn" id="bk" type="button">\u2190 ${t('pyq.back')}</button>`;let run=0;
 const alive=k=>k===run&&document.body.contains(box),bk=f=>{box.querySelector('#bk').onclick=f};
 const busy=m=>{clearT();box.innerHTML=`<div class="notice">${m||t('model.busy')}</div>`};
 const subjects=async()=>{const k=++run;busy();try{const r=await api('/chap/subjects?exam='+enc(me.exam));if(!alive(k))return;
   box.innerHTML=`<p class="hint">${tt('Pick a subject of your exam','अपनी परीक्षा का विषय चुनें')}</p><div class="list">${r.subjects.map(s=>`<button data-s="${s.id}"><b style="font-weight:500">${esc(L(s))}</b><span>${s.n} ${tt('questions in the exam','प्रश्न परीक्षा में')}</span></button>`).join('')}</div>`;
   box.querySelectorAll('.list button').forEach(b=>b.onclick=()=>chaps(r.subjects.find(s=>s.id===b.dataset.s)))}catch(e){box.textContent=e.message}};
 const chaps=async s=>{const k=++run;busy(tt('Finding chapters...','चैप्टर खोजे जा रहे हैं...'));try{const r=await api('/chap/list?exam='+enc(me.exam)+'&examName='+enc(exam().n)+'&s='+s.id);if(!alive(k))return;
   box.innerHTML=`${bkb}<h3 style="margin:14px 0 4px">${esc(L(s))}</h3><p class="hint">${tt('Pick a chapter. Questions come one by one, new ones are prepared while you solve.','चैप्टर चुनें। हर बार परीक्षा जैसे नए प्रश्न बनते हैं।')}</p><div class="list">${r.chapters.map((c,i)=>`<button data-i="${i}"><b style="font-weight:500">${i+1}. ${esc(L(c))}</b><span></span></button>`).join('')}</div><div id="qb" style="margin-top:20px"></div>`;
   bk(subjects);box.querySelectorAll('.list button').forEach(b=>b.onclick=()=>go(s,r.chapters[+b.dataset.i]))}catch(e){box.textContent=e.message}};
 let sess=null;
 const go=(s,c)=>{clearT();if(sess)sess.dead=true;const me2=sess={dead:false};++run;box.innerHTML=`${bkb}<h3 style="margin:14px 0 2px">${esc(L(c))}</h3><p class="hint" style="margin:0 0 14px">${esc(L(s))}</p><div id="qb"></div>`;bk(()=>{me2.dead=true;clearT();chaps(s)});const qb=box.querySelector('#qb'),BATCH=5;window.scrollTo({top:0});
  let queue=[],idx=0,inflight=false,err=null,waiting=true,picked=null,start=Date.now(),frozen=null,res=[],t0=Date.now();
  const live=()=>!me2.dead&&document.body.contains(qb);
  const more=async()=>{if(inflight||!live())return;inflight=true;err=null;
   for(let tr=0;tr<2&&live();tr++){try{const r=await api('/chap/questions',{method:'POST',body:JSON.stringify({exam:me.exam,examName:exam().n,s:s.id,cid:c.id,n:BATCH})});if(!live()){inflight=false;return}queue.push(...r.questions);err=null;break}catch(e){err=e.message}}
   inflight=false;if(!live())return;
   if(waiting&&(queue.length>idx||err)){if(queue.length>idx){waiting=false;start=Date.now();frozen=null}draw()}
   pre()};
  const pre=()=>{if(live()&&!inflight&&!err&&queue.length-idx-1<BATCH)more()};
  const finish=()=>{me2.dead=true;clearT();if(!res.length){qb.innerHTML='';return}saveAtt(res.map(r=>Object.assign({src:'quiz'},r)));summary(qb,res,()=>go(s,c))};
  const endBtn=`<button class="tbtn" id="en" type="button" style="margin-left:10px">${tt('End practice','प्रैक्टिस खत्म करें')}</button>`;
  function draw(){if(!live())return;
   if(waiting||queue.length<=idx){
    qb.innerHTML=err?`<div class="notice">${esc(err)}</div><button class="btn" id="rt">${tt('Try again','फिर कोशिश करें')}</button>${endBtn}`:`<div class="notice">${tt('Making questions for','प्रश्न बन रहे हैं:')} ${esc(L(c))}... ${tt('a few seconds','कुछ सेकंड')}</div>${res.length?endBtn:''}`;
    const rt=qb.querySelector('#rt');if(rt)rt.onclick=()=>{err=null;draw();more()};const en=qb.querySelector('#en');if(en)en.onclick=finish;return}
   const q=queue[idx],ok=res.filter(r=>r.ok).length;
   qb.innerHTML=`<div class="qhead"><span>${tt('Question','प्रश्न')} ${idx+1} <span class="hint">· ${ok} / ${res.length} ${tt('correct','सही')}</span></span><span class="timer" id="qt">${fmt((frozen??(Date.now()-start))/1000)}</span></div>
   <h3 class="qtext">${esc(L(q.q))}</h3>
   <div>${L(q.o).map((o,k)=>{let cl='opt';if(picked!==null){if(k===q.a)cl+=' correct';else if(k===picked)cl+=' wrong'}return`<button class="${cl}" data-k="${k}" ${picked!==null?'disabled':''}>${esc(o)}</button>`}).join('')}</div>
   ${picked===null?'':`<div class="fb ${picked===q.a?'ok':'no'}"><b>${picked===q.a?t('q.correct'):t('q.wrong')+' '+esc(L(q.o)[q.a])}</b><b style="margin-top:8px">${t('q.exp')}</b>${esc(L(q.x)||'')}</div><button class="btn" id="nx">${t('q.next')}</button>${endBtn}`}
   ${picked===null&&res.length?`<div style="margin-top:12px">${endBtn.replace('margin-left:10px','')}</div>`:''}`;
   qb.querySelectorAll('.opt').forEach(b=>b.onclick=()=>{frozen=Date.now()-start;picked=+b.dataset.k;const sec=Math.round(frozen/1000);res.push({s:q.s,c:q.c,ok:picked===q.a,sec});api('/chap/answer',{method:'POST',body:JSON.stringify({id:q.id,picked,sec})}).catch(()=>{});draw()});
   const nx=qb.querySelector('#nx');if(nx)nx.onclick=()=>{idx++;picked=null;frozen=null;start=Date.now();if(queue.length<=idx){waiting=true;draw();more();return}draw();pre()};
   const en=qb.querySelector('#en');if(en)en.onclick=finish}
  timers.push(setInterval(()=>{const e=document.getElementById('qt');if(e&&frozen===null&&!waiting)e.textContent=fmt((Date.now()-start)/1000)},500));
  draw();more()};
 view.querySelector('#mya').onclick=async()=>{const k=++run;busy();try{const r=await api('/chap/attempted?exam='+enc(me.exam));if(!alive(k))return;
   box.innerHTML=`${bkb}<h3 style="margin:14px 0 4px">${tt('My attempted questions','मेरे हल किए प्रश्न')}</h3><p class="hint">${tt('Pick a subject to see your attempted questions, your answers and explanations.','विषय चुनें और अपने हल किए प्रश्न, उत्तर और व्याख्या देखें।')}</p><div class="list">${r.subjects.length?r.subjects.map(s=>`<button data-s="${s.id}"><b style="font-weight:500">${esc(L(s))}</b><span>${s.ok} / ${s.total} ${tt('correct','सही')}</span></button>`).join(''):`<div class="notice">${tt('You have not attempted any chapter wise question yet.','आपने अभी तक कोई चैप्टर वाइज़ प्रश्न हल नहीं किया है।')}</div>`}</div>`;
   bk(subjects);box.querySelectorAll('.list button').forEach(b=>b.onclick=async()=>{const s=r.subjects.find(x=>x.id===b.dataset.s),k2=++run;busy();try{const d=await api('/chap/attempted?exam='+enc(me.exam)+'&s='+s.id);if(!alive(k2))return;const cs=[...new Set(d.items.map(x=>x.c))];
     box.innerHTML=`${bkb}<h3 style="margin:14px 0 4px">${esc(L(s))} <span class="hint">${s.ok} / ${s.total}</span></h3>${cs.map(c=>{const it=d.items.filter(x=>x.c===c);return`<h3 style="margin:20px 0 6px">${esc(L({en:c,hi:it[0].chi}))} <span class="hint">${it.filter(x=>x.ok).length} / ${it.length}</span></h3>`+it.map((x,i)=>qcard(i+1,x,x.picked)).join('')}).join('')}`;bk(()=>view.querySelector('#mya').onclick())}catch(e){box.textContent=e.message}})}catch(e){box.textContent=e.message}};
 hook=null;subjects();
},

interview(){
 if(!exam().iv){view.innerHTML=`${head('int.t')}<div class="notice">${t('int.none')}</div>`;return}
 view.innerHTML=`${head('int.t','int.d')}<h3>${esc(exam().n)}</h3><div class="field" style="max-width:260px"><label for="il">${t('int.lang')}</label><select id="il"><option value="en">English</option><option value="hi">हिंदी</option></select></div><button class="btn" id="go">${t('int.start')}</button><div id="box" style="margin-top:24px"></div>`;
 const il=view.querySelector('#il');il.value=lang;
 view.querySelector('#go').onclick=()=>{clearT();interviewRun(view.querySelector('#box'),il.value)};
},

notices(){
 const CATS=[['all','All','सभी'],['form','Apply / Forms','फॉर्म / आवेदन'],['result','Results','रिज़ल्ट'],['admit','Admit Card','एडमिट कार्ड'],['city','City / Centre','सिटी / सेंटर'],['exam','Exam Dates','परीक्षा तिथि'],['postponed','Postponed','स्थगित / बदलाव'],['answerkey','Answer Key','आंसर की'],['other','Other','अन्य']];
 const PORTALS=[['SSC','https://ssc.gov.in'],['UPSC','https://upsc.gov.in'],['Railway RRB','https://indianrailways.gov.in'],['IBPS','https://www.ibps.in'],['SBI Careers','https://sbi.co.in/web/careers'],['RBI','https://opportunities.rbi.org.in'],['NTA','https://nta.ac.in'],['UPPSC','https://uppsc.up.nic.in'],['UPSSSC','https://upsssc.gov.in'],['UP Police (UPPRPB)','https://uppbpb.gov.in'],['Join Indian Army','https://joinindianarmy.nic.in'],['India Post','https://indiapost.gov.in'],['National Career Service','https://www.ncs.gov.in'],['Employment News','https://www.employmentnews.gov.in']];
 view.innerHTML=`<div class="hdr"><div><h2>${tt('Government Exam Notifications','सरकारी परीक्षा नोटिफिकेशन')}</h2><p style="color:var(--muted)">${tt('Forms, results, admit cards, city allotment, exam dates, postponements and answer keys of all government exams, with live links.','सभी सरकारी परीक्षाओं के फॉर्म, रिज़ल्ट, एडमिट कार्ड, सिटी अलॉटमेंट, परीक्षा तिथि, स्थगन और आंसर की, लाइव लिंक के साथ।')}</p></div><button class="tbtn" id="nrf" type="button">${tt('Refresh','रिफ्रेश')}</button></div>
 <input id="nq" class="nq" type="search" placeholder="${tt('Search exam, board or keyword (SSC, UPSC, Railway...)','परीक्षा, बोर्ड या कीवर्ड खोजें (SSC, UPSC, Railway...)')}"><div class="chips" id="nch"></div><div id="nmeta" class="hint"></div><div id="nl" style="margin-top:10px"></div>
 <details class="card" style="margin-top:22px"><summary><b>${tt('Official portals','आधिकारिक वेबसाइट')}</b></summary><div class="npt">${PORTALS.map(([n,u])=>`<a href="${u}" target="_blank" rel="noopener noreferrer">${esc(n)} \u2197</a>`).join('')}</div></details>`;
 const nl=view.querySelector('#nl'),nch=view.querySelector('#nch'),nq=view.querySelector('#nq'),meta=view.querySelector('#nmeta');let items=[],cat='all';
 const dt=d=>{if(!d)return'';const x=new Date(d+'T00:00:00');return isNaN(x)?'':x.toLocaleDateString(lang==='hi'?'hi-IN':'en-IN',{day:'numeric',month:'short',year:'numeric'})};
 const ago=ms=>{const m=Math.round((Date.now()-ms)/60000);return m<2?tt('just now','अभी'):m<60?m+tt(' min ago',' मिनट पहले'):Math.round(m/60)<48?Math.round(m/60)+tt(' hours ago',' घंटे पहले'):Math.round(m/1440)+tt(' days ago',' दिन पहले')};
 const draw=()=>{const q=nq.value.trim().toLowerCase(),cnt={};items.forEach(x=>{cnt[x.cat]=(cnt[x.cat]||0)+1});
  nch.innerHTML=CATS.filter(c=>c[0]==='all'||cnt[c[0]]).map(c=>`<button type="button" data-c="${c[0]}" class="${c[0]===cat?'on':''}">${tt(c[1],c[2])} ${c[0]==='all'?items.length:cnt[c[0]]}</button>`).join('');
  nch.querySelectorAll('button').forEach(b=>b.onclick=()=>{cat=b.dataset.c;draw()});
  const list=items.filter(x=>(cat==='all'||x.cat===cat)&&(!q||(x.title+' '+(x.hi||'')+' '+x.org+' '+x.sum).toLowerCase().includes(q)));
  nl.innerHTML=list.length?list.map(x=>{const c=CATS.find(k=>k[0]===x.cat)||CATS[8],today=new Date().toISOString().slice(0,10),late=x.lastDate&&x.lastDate<today;
   return`<div class="nc"><div class="nct"><span class="nb nb-${x.cat}">${tt(c[1],c[2])}</span>${x.org?`<span class="hint">${esc(x.org)}</span>`:''}<span class="hint" style="margin-left:auto">${dt(x.date)}</span></div><b class="nti">${esc(lang==='hi'&&x.hi?x.hi:x.title)}</b>${(lang==='hi'&&x.sumHi?x.sumHi:x.sum)?`<div class="nsu">${esc(lang==='hi'&&x.sumHi?x.sumHi:x.sum)}</div>`:''}
   ${x.lastDate?`<div class="hint" style="margin-top:6px">${tt('Last date','अंतिम तिथि')}: <b style="${late?'':'color:var(--accent)'}">${dt(x.lastDate)}</b>${late?' ('+tt('closed','समाप्त')+')':''}</div>`:''}
   <div class="nac"><a class="btn sm" href="${esc(x.link)}" target="_blank" rel="noopener noreferrer">${tt('Open notice','नोटिस खोलें')} \u2197</a>${x.apply?`<a class="btn ghost sm" href="${esc(x.apply)}" target="_blank" rel="noopener noreferrer">${tt('Apply link','आवेदन लिंक')} \u2197</a>`:''}${x.off&&x.off!==x.link?`<a class="btn ghost sm" href="${esc(x.off)}" target="_blank" rel="noopener noreferrer">${tt('Official site','आधिकारिक साइट')} \u2197</a>`:''}${x.src?`<span class="hint">${tt('Source','स्रोत')}: ${esc(x.src)}</span>`:''}</div></div>`}).join(''):`<div class="notice">${tt('Nothing found for this filter.','इस फ़िल्टर में कुछ नहीं मिला।')}</div>`};
 let busy=false;const load=async force=>{if(busy)return;busy=true;nl.innerHTML=`<div class="notice">${tt('Collecting the latest notices from official sources... first load can take up to a minute.','आधिकारिक स्रोतों से ताज़ा नोटिस जुटाए जा रहे हैं... पहली बार में 1 मिनट तक लग सकता है।')}</div>`;
  try{const r=await api('/notices'+(force?'?refresh=1':''));if(!document.body.contains(nl))return;items=r.items||[];const okS=(r.status||[]).filter(z=>z.ok).map(z=>z.name);meta.textContent=r.at?(okS.length?tt('Sources: ','स्रोत: ')+okS.join(', ')+' · ':'')+tt('Updated ','अपडेट: ')+ago(r.at)+(r.refreshing?' · '+tt('refreshing...','रिफ्रेश हो रहा है...'):''):'';draw()}
  catch(e){if(document.body.contains(nl))nl.innerHTML=`<div class="notice">${esc(e.message)}</div>`}finally{busy=false}};
 nq.oninput=draw;view.querySelector('#nrf').onclick=()=>load(true);load(false);
},

books(){
 view.innerHTML=`<h2>${tt('Books Library','पुस्तक पुस्तकालय')}</h2><p style="color:var(--muted)">${tt('Tap a book to read it. It opens in your phone or computer PDF reader.','किताब पर टैप करें और पढ़ें। यह आपके फोन या कंप्यूटर के PDF रीडर में खुलती है।')}</p><input id="bq" class="nq" type="search" placeholder="${tt('Search book or writer','किताब या लेखक खोजें')}"><div id="bg" class="bgrid" style="margin-top:16px"></div>`;
 const bg=view.querySelector('#bg'),bq=view.querySelector('#bq');let all=[];
 const draw=()=>{const q=bq.value.trim().toLowerCase(),l=all.filter(b=>!q||(b.title+' '+b.author).toLowerCase().includes(q));
  bg.innerHTML=l.length?l.map(b=>`<a class="bk" href="/api/books/${b.id}/pdf" target="_blank" rel="noopener noreferrer"><div class="bkc">${b.cover?`<img loading="lazy" src="/api/books/${b.id}/cover" alt="">`:'<div class="bkn">PDF</div>'}</div><b class="bkt">${esc(b.title)}</b><span class="bka">${esc(b.author)}</span><span class="bkr">${tt('Read','पढ़ें')} \u2197</span></a>`).join(''):`<div class="notice" style="grid-column:1/-1">${all.length?tt('No book found.','कोई किताब नहीं मिली।'):tt('No books yet. Please check back soon.','अभी कोई किताब नहीं है। जल्द ही आएँगी।')}</div>`};
 bq.oninput=draw;bg.innerHTML=`<div class="notice" style="grid-column:1/-1">${tt('Loading books...','किताबें लोड हो रही हैं...')}</div>`;
 api('/books').then(r=>{if(!document.body.contains(bg))return;all=r.books||[];draw()}).catch(e=>{bg.innerHTML=`<div class="notice" style="grid-column:1/-1">${esc(e.message)}</div>`});
},

uploadbooks(){
 if(!me.admin){location.hash='#books';return}
 view.innerHTML=`<h2>${tt('Upload Books','किताबें अपलोड करें')}</h2><p style="color:var(--muted)">${tt('Add a book: cover image, book name, writer name and the PDF. It shows in every student\u2019s Books Library.','किताब जोड़ें: कवर इमेज, किताब का नाम, लेखक का नाम और PDF। यह हर छात्र की पुस्तक पुस्तकालय में दिखेगी।')}</p>
 <form id="bf" class="card" style="max-width:560px"><div class="field"><label for="bc">${tt('Cover image','कवर इमेज')}</label><input id="bc" type="file" accept="image/png,image/jpeg,image/webp" required><img id="bp" alt="" style="display:none;margin-top:10px;max-width:120px;border-radius:6px"></div>
 <div class="field"><label for="bn">${tt('Book name','किताब का नाम')}</label><input id="bn" maxlength="150" required></div>
 <div class="field"><label for="ba">${tt('Writer name','लेखक का नाम')}</label><input id="ba" maxlength="100" required></div>
 <div class="field"><label for="bf2">${tt('Book PDF (up to 80 MB)','किताब की PDF (80 MB तक)')}</label><input id="bf2" type="file" accept="application/pdf,.pdf" required></div>
 <button class="btn" type="submit" id="bs">${tt('Upload book','किताब अपलोड करें')}</button><div id="bm" class="hint" style="margin-top:10px"></div><progress id="bpg" max="100" value="0" style="display:none;width:100%;margin-top:8px"></progress></form>
 <h3 style="margin:26px 0 8px">${tt('Uploaded books','अपलोड की गई किताबें')}</h3><div id="bl" class="list"></div>`;
 const bm=view.querySelector('#bm'),bl=view.querySelector('#bl'),pg=view.querySelector('#bpg'),bs=view.querySelector('#bs'),bc=view.querySelector('#bc'),bp=view.querySelector('#bp');let cover='';
 const small=f=>new Promise((ok,no)=>{const u=URL.createObjectURL(f),im=new Image();im.onload=()=>{const W=420,r=Math.min(1,W/im.width),c=document.createElement('canvas');c.width=Math.round(im.width*r);c.height=Math.round(im.height*r);c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(u);ok(c.toDataURL('image/jpeg',0.85))};im.onerror=()=>no(new Error(tt('Could not read this image.','यह इमेज नहीं पढ़ी जा सकी।')));im.src=u});
 bc.onchange=async()=>{cover='';bp.style.display='none';if(!bc.files[0])return;try{cover=await small(bc.files[0]);bp.src=cover;bp.style.display='block'}catch(e){bm.textContent=e.message}};
 const refresh=async()=>{try{const r=await api('/books');if(!document.body.contains(bl))return;bl.innerHTML=r.books.length?r.books.map(b=>`<div><b>${esc(b.title)}</b><span>${esc(b.author)} · ${Math.max(1,Math.round(b.size/1048576*10)/10)} MB <button class="tbtn" data-d="${b.id}" type="button">${tt('Delete','हटाएँ')}</button></span></div>`).join(''):`<div class="notice">${tt('No books uploaded yet.','अभी कोई किताब अपलोड नहीं हुई।')}</div>`;bl.querySelectorAll('[data-d]').forEach(x=>x.onclick=async()=>{if(!confirm(tt('Delete this book?','यह किताब हटाएँ?')))return;try{await api('/admin/books/'+x.dataset.d,{method:'DELETE'});refresh()}catch(e){bm.textContent=e.message}})}catch(e){bl.textContent=e.message}};
 view.querySelector('#bf').onsubmit=async e=>{e.preventDefault();const f=view.querySelector('#bf2').files[0];if(!f||!cover){bm.textContent=tt('Please choose the cover image and the PDF.','कवर इमेज और PDF चुनें।');return}
  if(f.size>80*1024*1024){bm.textContent=tt('PDF is larger than 80 MB.','PDF 80 MB से बड़ी है।');return}
  bs.disabled=true;pg.style.display='block';pg.value=0;bm.textContent=tt('Uploading...','अपलोड हो रहा है...');let id=null;
  try{const r=await api('/admin/books',{method:'POST',body:JSON.stringify({title:view.querySelector('#bn').value,author:view.querySelector('#ba').value,cover})});id=r.id;
   await new Promise((ok,no)=>{const x=new XMLHttpRequest();x.open('PUT','/api/admin/books/'+id+'/pdf');x.setRequestHeader('Content-Type','application/pdf');x.upload.onprogress=ev=>{if(ev.lengthComputable)pg.value=Math.round(ev.loaded/ev.total*100)};x.onload=()=>{if(x.status<300)ok();else{let m='';try{m=JSON.parse(x.responseText).error}catch{}no(new Error(m||tt('Upload failed.','अपलोड नहीं हो सका।')))}};x.onerror=()=>no(new Error(tt('Network error. Please try again.','नेटवर्क में दिक्कत। फिर कोशिश करें।')));x.send(f)});
   bm.textContent=tt('Book uploaded. Students can see it now.','किताब अपलोड हो गई। अब छात्र इसे देख सकते हैं।');e.target.reset();bp.style.display='none';cover='';refresh()}
  catch(err){bm.textContent=err.message;if(id)api('/admin/books/'+id,{method:'DELETE'}).catch(()=>{})}
  finally{bs.disabled=false;pg.style.display='none'}};
 refresh();
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
 <div class="two" style="gap:32px"><div class="card"><h3>${t('an.by')}</h3><div class="bars">${Object.entries(bs).map(([k,v])=>{const p=Math.round(v.ok/v.n*100);return`<div><div class="lab"><span>${esc(L(subj(k))||k)}</span><span>${p}% (${v.ok}/${v.n})</span></div><div class="track"><div class="fill" style="width:${p}%"></div></div></div>`}).join('')}</div></div>
 <div class="card"><h3>${t('an.weak')}</h3><div class="bars">${weak.map(([k,r,n])=>`<div><div class="lab"><span>${esc(L(chap(k))||k)}</span><span>${Math.round(r*100)}% (${n})</span></div><div class="track"><div class="fill" style="width:${Math.round(r*100)}%"></div></div></div>`).join('')}</div>
 <h3 style="margin-top:20px">${t('an.slow')}</h3>${slow.map(x=>`<div class="lab" style="display:flex;justify-content:space-between;font-size:14px;margin-bottom:6px"><span>${esc(L(chap(x.c)||subj(x.s))||x.c||x.s)}</span><span>${x.sec} ${t('sec')}</span></div>`).join('')}</div></div>
 <p class="hint" style="margin-top:20px">${t('an.ai')}</p>`;
}};

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
const sp=document.querySelector('.topbar .sp'),avA=document.createElement('a');avA.href='#profile';avA.className='av';avA.title='Profile';sp.insertBefore(avA,sp.firstChild);
function paintAv(){avA.innerHTML=me.avatar?`<img src="${me.avatar}" alt="">`:esc((me.name||'?').trim()[0]||'?').toUpperCase()}paintAv();
if(me.admin){const ad=document.createElement('a');ad.className='nl';ad.href='#admin';ad.textContent='Admin';document.querySelector('#side .bot').before(ad);const ub=document.createElement('a');ub.className='nl';ub.href='#uploadbooks';ub.textContent=tt('Upload Books','किताबें अपलोड करें');ad.before(ub)}
fillExams();route();
})();
