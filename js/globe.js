(function(){
const cv=document.getElementById('globe');if(!cv)return;
const ctx=cv.getContext('2d'),reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
const N=1500,pts=[],GA=Math.PI*(3-Math.sqrt(5));
for(let i=0;i<N;i++){const y=1-2*(i+.5)/N,r=Math.sqrt(1-y*y),a=GA*i;pts.push([Math.cos(a)*r,y,Math.sin(a)*r])}
const rad=d=>d*Math.PI/180,ll=(la,lo)=>[Math.cos(rad(la))*Math.sin(rad(lo)),Math.sin(rad(la)),Math.cos(rad(la))*Math.cos(rad(lo))];
const india=ll(22,79),tilt=rad(22);let th=rad(-79),W=0,H=0,col='#101c28',mark='#d99a00',f=0,t0=0;
function size(){const d=devicePixelRatio||1,w=cv.clientWidth;cv.width=w*d;cv.height=w*d;W=H=w;ctx.setTransform(d,0,0,d,0,0)}
function rot(p){const c=Math.cos(th),s=Math.sin(th);let x=p[0]*c+p[2]*s,z=-p[0]*s+p[2]*c,y=p[1];const ct=Math.cos(tilt),st=Math.sin(tilt);return[x,y*ct-z*st,y*st+z*ct]}
function colors(){const s=getComputedStyle(document.documentElement);col=s.getPropertyValue('--ink').trim()||col;mark=s.getPropertyValue('--mark').trim()||mark}
function rgba(h,a){h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');return`rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a})`}
function ring(lat){ctx.beginPath();let on=false;for(let lo=0;lo<=360;lo+=4){const p=rot(ll(lat,lo));const X=W/2+p[0]*R,Y=H/2-p[1]*R;if(p[2]>0){on?ctx.lineTo(X,Y):ctx.moveTo(X,Y);on=true}else on=false}ctx.stroke()}
let R=0;
function draw(ts){
 if(!W)size();R=W*.38;if(f%20===0)colors();f++;
 ctx.clearRect(0,0,W,H);
 ctx.strokeStyle=rgba(col,.14);ctx.lineWidth=1;ctx.beginPath();ctx.arc(W/2,H/2,R,0,7);ctx.stroke();
 for(const la of[-60,-30,0,30,60])ring(la);
 for(const p of pts){const q=rot(p),X=W/2+q[0]*R,Y=H/2-q[1]*R;
  if(q[2]>0){ctx.fillStyle=rgba(col,.25+.6*q[2]);ctx.fillRect(X-.8,Y-.8,1.7,1.7)}else{ctx.fillStyle=rgba(col,.07);ctx.fillRect(X-.6,Y-.6,1.2,1.2)}}
 const m=rot(india),mx=W/2+m[0]*R,my=H/2-m[1]*R;
 if(m[2]>0){const k=((ts||0)/1600)%1;ctx.strokeStyle=rgba(mark,1-k);ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(mx,my,4+k*18,0,7);ctx.stroke();ctx.fillStyle=mark;ctx.beginPath();ctx.arc(mx,my,4,0,7);ctx.fill()}
 const a=(ts||0)/5200,ox=W/2+Math.cos(a)*R*1.22,oy=H/2+Math.sin(a)*R*.34*1+Math.sin(a)*0;
 ctx.strokeStyle=rgba(col,.16);ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(W/2,H/2,R*1.22,R*.34,0,0,7);ctx.stroke();
 ctx.fillStyle=mark;ctx.beginPath();ctx.arc(ox,oy,3,0,7);ctx.fill();
 if(!reduce){th+=.0028;requestAnimationFrame(draw)}
}
addEventListener('resize',()=>{size();if(reduce)draw(0)});
document.addEventListener('themechange',()=>{colors();if(reduce)draw(0)});
requestAnimationFrame(draw);
})();
