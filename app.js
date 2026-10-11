'use strict';
(()=>{
/* =====================================================================
   Planner x  -  architecture
   util   : DOM / Persian digits / date helpers
   store  : state, migration, persistence, undo snapshots
   fx     : confetti, count-up, ripple, FLIP, toast
   views  : plan / cal / timer / stats / backup  (pure html builders)
   ui     : dialog, drag & drop, actions (event delegation)
   ===================================================================== */

/* ---------- util ---------- */
const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
const DAYS=['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
const DS=['ش','ی','د','س','چ','پ','ج'];
const FD='۰۱۲۳۴۵۶۷۸۹',PF='fa-IR-u-ca-persian',DAY=864e5;
const MAXROWS=20,DEFROWS=6;
const EMOJIS=['📚','✏️','🧮','🔬','🧪','🌍','📖','💻','🧠','🎯','🗣️','⚡'];
const COLORS=['#2563EB','#0D9488','#16A34A','#D97706','#DC2626','#9333EA'];
const TABS=[['plan','list-checks','برنامه‌ریزی'],['cal','calendar-blank','تقویم'],['timer','timer','تایمر مطالعه'],['stats','chart-bar','آمار مطالعه'],['backup','cloud-arrow-down','پشتیبان‌گیری']];
const fa=n=>String(n).replace(/\d/g,d=>FD[d]).replace(/([۰-۹])\.([۰-۹])/g,'$1٫$2');
const en=s=>String(s).replace(/[۰-۹]/g,d=>FD.indexOf(d)).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[٫,،]/g,'.');
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now()*1000+Math.floor(Math.random()*999);
const r1=n=>fa(Math.round(n*10)/10);
const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
const I=(n,w)=>`<svg class="i" aria-hidden="true"><use href="#i-${n}${w==='b'?'-bold':''}"/></svg>`;
const fmt=(d,o)=>new Intl.DateTimeFormat(PF,o).format(d);
const pad=n=>String(n).padStart(2,'0');
const key=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const parse=k=>{const [y,m,d]=k.split('-').map(Number);return new Date(y,m-1,d,12)};
const addDays=(d,n)=>{const x=new Date(d);x.setHours(12,0,0,0);x.setDate(x.getDate()+n);return x};
const weekStart=d=>addDays(d,-((d.getDay()+1)%7));
const jp=d=>{const o={};new Intl.DateTimeFormat('en-u-ca-persian',{year:'numeric',month:'numeric',day:'numeric'}).formatToParts(d).forEach(p=>{if(p.type==='year'||p.type==='month'||p.type==='day')o[p.type]=parseInt(p.value)});return o};
const monthStart=d=>addDays(d,-(jp(d).day-1));
const pd=d=>{const m={};new Intl.DateTimeFormat(PF,{weekday:'long',day:'numeric',month:'long',year:'numeric'}).formatToParts(d).forEach(p=>m[p.type]=p.value);return `${m.weekday} ${m.day} ${m.month} ${m.year}`};
const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;

let TODAY,WS0,TI;
const refreshToday=()=>{TODAY=new Date();TODAY.setHours(12,0,0,0);WS0=weekStart(TODAY);TI=(TODAY.getDay()+1)%7};
refreshToday();
const wkOf=w=>key(addDays(WS0,7*w));

/* ---------- store ---------- */
const SKEY='sp4';
const cleanTask=t=>{
 if(!t||typeof t!=='object')return null;
 let n=String(t.n||'').trim();if(!n)return null;
 if(t.t&&String(t.t).trim())n+=' - '+String(t.t).trim();           // merge legacy name + description
 const wk=typeof t.wk==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(t.wk)?t.wk:wkOf(+t.w||0);  // legacy relative week
 return{id:t.id||uid(),n:n.slice(0,80),h:+t.h>0?Math.min(24,+t.h):1,wk,d:clamp(+t.d||0,0,6),s:clamp(+t.s||0,0,MAXROWS-1),c:clamp(+t.c||0,0,COLORS.length-1),e:typeof t.e==='string'&&EMOJIS.includes(t.e)?t.e:'',done:!!t.done}};
const normalize=raw=>{
 raw=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const rows={};if(raw.rows&&typeof raw.rows==='object')for(const k in raw.rows){const v=+raw.rows[k];if(v>=1)rows[k]=clamp(Math.round(v),1,MAXROWS)}
 return{tasks:(Array.isArray(raw.tasks)?raw.tasks:[]).map(cleanTask).filter(Boolean),
  rows,defRows:clamp(Math.round(+raw.defRows)||DEFROWS,1,MAXROWS),
  log:(Array.isArray(raw.log)?raw.log:[]).filter(l=>l&&/^\d{4}-\d{2}-\d{2}$/.test(l.k)&&+l.h>0).map(l=>({k:l.k,h:+l.h})),
  tab:TABS.some(t=>t[0]===raw.tab)?raw.tab:'plan',stat:['day','week','month'].includes(raw.stat)?raw.stat:'day'}};
let S;
try{S=normalize(JSON.parse(localStorage.getItem(SKEY)||localStorage.getItem('sp3')||'{}'))}catch(e){S=normalize({})}
const save=()=>{try{localStorage.setItem(SKEY,JSON.stringify(S))}catch(e){}};
const snap=()=>JSON.stringify({tasks:S.tasks,rows:S.rows,defRows:S.defRows,log:S.log});
const restore=str=>{const o=normalize(JSON.parse(str));S.tasks=o.tasks;S.rows=o.rows;S.defRows=o.defRows;S.log=o.log;save()};
const rowsFor=wk=>{const mx=S.tasks.reduce((a,t)=>t.wk===wk?Math.max(a,t.s+1):a,0);return clamp(Math.max(S.rows[wk]??S.defRows,mx),1,MAXROWS)};
const hoursMap=()=>{
 const m=new Map();
 for(const t of S.tasks)if(t.done){const k=key(addDays(parse(t.wk),t.d));m.set(k,(m.get(k)||0)+t.h)}
 for(const l of S.log)m.set(l.k,(m.get(l.k)||0)+l.h);
 return m};

/* ---------- fx ---------- */
const cv=$('#fx'),cx=cv.getContext('2d');let parts=[],raf=0;
const fit=()=>{const r=devicePixelRatio||1;cv.width=innerWidth*r;cv.height=innerHeight*r;cx.setTransform(r,0,0,r,0,0)};
fit();addEventListener('resize',fit);
function burst(x,y,n=28,power=1){
 if(reduced)return;
 for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,v=(3+Math.random()*7)*power;
  parts.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-4*power,g:.22,r:3+Math.random()*4,rot:Math.random()*6,vr:(Math.random()-.5)*.4,c:COLORS[i%COLORS.length],life:1,sq:Math.random()<.5,em:i%5===0?['🎉','⭐','📚','✨','🔥','💪'][i%6]:''})}
 if(!raf)raf=requestAnimationFrame(loop)}
function loop(){
 cx.clearRect(0,0,innerWidth,innerHeight);
 parts=parts.filter(p=>p.life>0&&p.y<innerHeight+30);
 for(const p of parts){p.vy+=p.g;p.vx*=.985;p.x+=p.vx;p.y+=p.vy;p.rot+=p.vr;p.life-=.012;
  cx.save();cx.globalAlpha=Math.max(0,p.life);cx.translate(p.x,p.y);cx.rotate(p.rot);cx.fillStyle=p.c;
  if(p.em){cx.font='22px sans-serif';cx.textAlign='center';cx.textBaseline='middle';cx.fillText(p.em,0,0)}else if(p.sq)cx.fillRect(-p.r,-p.r/2,p.r*2,p.r);else{cx.beginPath();cx.arc(0,0,p.r/1.5,0,7);cx.fill()}cx.restore()}
 raf=parts.length?requestAnimationFrame(loop):0;
 if(!raf)cx.clearRect(0,0,innerWidth,innerHeight)}
function countTo(el,to,dec=1,dur=900){
 const f=v=>dec?r1(v):fa(Math.round(v));
 if(reduced||!isFinite(to)){el.textContent=f(to);return}
 const t0=performance.now();
 const step=t=>{const p=Math.min(1,(t-t0)/dur),e=1-Math.pow(1-p,3);el.textContent=f(to*e);if(p<1)requestAnimationFrame(step)};
 requestAnimationFrame(step)}
const counts=root=>$$('[data-count]',root||document).forEach(el=>countTo(el,+el.dataset.count,+el.dataset.dec));
function flip(fn){
 const before=new Map($$('.task').map(e=>[e.dataset.id,e.getBoundingClientRect()]));
 fn();
 if(reduced)return;
 $$('.task').forEach(e=>{const b=before.get(e.dataset.id);if(!b)return;const a=e.getBoundingClientRect(),dx=b.left-a.left,dy=b.top-a.top;
  if(Math.abs(dx)+Math.abs(dy)>1)e.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'none'}],{duration:480,easing:'cubic-bezier(.2,.9,.25,1.1)'})})}
function toast(msg,undoSnap){
 const box=$('#toasts'),t=document.createElement('div');t.className='toast';t.setAttribute('role','status');
 t.innerHTML=`<span>${esc(msg)}</span>`+(undoSnap?`<button type="button">بازگردانی</button>`:'');
 const kill=()=>{if(t.dataset.k)return;t.dataset.k=1;t.classList.add('out');setTimeout(()=>t.remove(),260)};
 if(undoSnap)$('button',t).onclick=()=>{restore(undoSnap);kill();render({});};
 box.appendChild(t);while(box.children.length>3)box.firstChild.remove();setTimeout(kill,5200)}
document.addEventListener('pointerdown',e=>{
 const b=e.target.closest('.btn,.ib');if(!b||reduced)return;
 const r=b.getBoundingClientRect(),s=Math.max(r.width,r.height)*2,sp=document.createElement('span');
 sp.className='rp';sp.style.cssText=`width:${s}px;height:${s}px;left:${e.clientX-r.left-s/2}px;top:${e.clientY-r.top-s/2}px`;
 b.appendChild(sp);setTimeout(()=>sp.remove(),650)});
const tip=$('#tip');
document.addEventListener('pointerover',e=>{
 const c=e.target.closest('[data-tip]');if(!c){tip.classList.remove('on');return}
 tip.textContent=c.dataset.tip;const r=c.getBoundingClientRect();tip.classList.add('on');
 const w=tip.offsetWidth;tip.style.left=clamp(r.left+r.width/2-w/2,8,innerWidth-w-8)+'px';tip.style.top=(r.top-tip.offsetHeight-8)+'px'});
document.addEventListener('scroll',()=>tip.classList.remove('on'),true);

/* ---------- navigation chrome ---------- */
let W=0,CM=0,lastTab=null;
const nav=$('#nav');
nav.innerHTML='<span class="ind nt" id="ind"></span>'+TABS.map(t=>`<button class="tab" data-a="tab" data-t="${t[0]}" title="${t[2]}">${I(t[1])}<span>${t[2]}</span></button>`).join('');
function placeInd(anim){
 const on=$('.tab.on',nav),ind=$('#ind');if(!on)return;
 ind.classList.toggle('nt',!anim);ind.style.left=on.offsetLeft+'px';ind.style.width=on.offsetWidth+'px'}
function setNav(anim){
 $$('.tab',nav).forEach(b=>{const on=b.dataset.t===S.tab;b.classList.toggle('on',on);on?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current')});
 placeInd(anim)}
addEventListener('resize',()=>placeInd(false));
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>placeInd(false));

/* ---------- views ---------- */
function plan(o){
 const wk=wkOf(W),wt=S.tasks.filter(t=>t.wk===wk),done=wt.filter(t=>t.done).length,total=wt.length,rows=rowsFor(wk);
 const ws=parse(wk),isNow=W===0;
 let g=DAYS.map((d,i)=>`<div class="dh ${isNow&&i===TI?'today':''}"><span class="dn">${d}</span><span class="dd">${fmt(addDays(ws,i),{day:'numeric',month:'long'})}</span></div>`).join('');
 for(let k=0;k<rows;k++)for(let i=0;i<7;i++){
  const t=wt.find(x=>x.d===i&&x.s===k),td=isNow&&i===TI?' today':'',nr=o.newRowFrom!=null&&k>=o.newRowFrom?` nr" style="--j:${i}`:`" style="--i:${k*7+i}`;
  g+=`<div class="cell${td}${nr}" data-d="${i}" data-s="${k}">`+(t
   ?`<div class="task${t.done?' done':''}${o.added===t.id?' pop':''}" role="button" tabindex="0" aria-pressed="${t.done}" data-a="tog" data-id="${t.id}" style="--c:${COLORS[t.c]}" title="${esc(t.n)} - ${fa(t.h)} ساعت">${t.e?`<span class="em">${t.e}</span>`:''}<div class="tt"><b>${esc(t.n)}</b><span class="hrs">${fa(t.h)} ساعت</span></div><span class="chk">${I('check','b')}</span><button type="button" class="tb" data-a="edit" data-id="${t.id}" aria-label="ویرایش یا حذف" title="ویرایش / حذف">${I('pencil-simple')}</button></div>`
   :`<button type="button" class="add" data-a="addtask" data-d="${i}" data-s="${k}" aria-label="افزودن کار">${I('plus','b')}</button>`)+`</div>`;
 }
 for(let i=0;i<7;i++){const hs=wt.filter(t=>t.d===i).reduce((a,t)=>a+t.h,0);g+=`<div class="foot">${hs?'جمع: '+fa(Math.round(hs*100)/100)+' ساعت':''}</div>`}
 const r=fmt(ws,{day:'numeric',month:'long'})+' تا '+fmt(addDays(ws,6),{day:'numeric',month:'long',year:'numeric'});
 const sl=o.dir?` sl" style="--rows:${rows};--sx:${o.dir>0?-34:34}px`:`" style="--rows:${rows}`;
 return `<section class="card sched"><div class="tbar"><div class="ttl"><h3>🗓️ برنامه هفتگی</h3><span class="chip" id="chip">${fa(done)} از ${fa(total)} انجام شد</span></div>
 <div class="wnav"><button class="btn g ico" data-a="wprev" aria-label="هفته قبل" title="هفته قبل">${I('caret-right','b')}</button><b>${r}</b><button class="btn g ico" data-a="wnext" aria-label="هفته بعد" title="هفته بعد">${I('caret-left','b')}</button></div>
 <div class="ta">${W?`<button class="btn g" data-a="wnow">این هفته</button>`:''}
  <div class="step" id="step" title="تعداد ردیف‌های جدول"><span>ردیف</span><button type="button" data-a="rowdec" aria-label="کم کردن ردیف">${I('minus','b')}</button><b>${fa(rows)}</b><button type="button" data-a="rowinc" aria-label="افزودن ردیف">${I('plus','b')}</button></div>
  <button class="btn g" data-a="wcopy" title="کارهای هفته قبل را در خانه‌های خالی این هفته کپی می‌کند">${I('copy')}کپی از هفته قبل</button>
  ${total?`<button class="btn g ico" data-a="wclear" aria-label="پاک کردن هفته" title="پاک کردن همه کارهای این هفته">${I('trash')}</button>`:''}</div></div>
 ${total?'':'<p class="hint"><span class="wv">👋</span> این هفته هنوز کاری ندارد. روی هر خانه خالی بزنید. کارها را می‌توانید بکشید و در خانه دیگر رها کنید.</p>'}
 <div class="scroll"><div class="wk${sl}">${g}</div></div></section>`;
}

function byDate(){
 const m=new Map();
 for(const t of S.tasks){const k=key(addDays(parse(t.wk),t.d)),e=m.get(k)||{n:0,h:0};e.n++;e.h+=t.h;m.set(k,e)}
 return m}
function cal(o){
 let c=monthStart(TODAY);
 for(let k=0;k<Math.abs(CM);k++){if(CM>0)c=monthStart(addDays(c,31));else c=monthStart(addDays(c,-1))}
 const mo=jp(c).month,bd=byDate();
 let h=DAYS.map(d=>`<div class="dnm">${d}</div>`).join('');
 for(let k=0;k<(c.getDay()+1)%7;k++)h+='<div class="cd e"></div>';
 let i=0;
 for(let x=new Date(c);jp(x).month===mo;x=addDays(x,1),i++){
  const k=key(x),e=bd.get(k),isT=k===key(TODAY);
  h+=`<button class="cd ${isT?'t':''}" data-a="cgo" data-date="${k}" style="--i:${i};--k:${e?Math.min(1,e.h/6):0}"><span>${fa(jp(x).day)}</span>${e?`<small>${fa(e.n)} کار · ${r1(e.h)} ساعت</small>`:'<small></small>'}</button>`}
 return `<section class="card pad calw"><div class="ch"><h3>📆 تقویم شمسی</h3><div class="cmo"><button class="btn g ico" data-a="cprev" aria-label="ماه قبل">${I('caret-right','b')}</button><b>${fmt(c,{month:'long',year:'numeric'})}</b><button class="btn g ico" data-a="cnext" aria-label="ماه بعد">${I('caret-left','b')}</button></div></div><div class="cal ${o.enter||o.cal?'enter':''}">${h}</div><p class="pct" style="margin-top:16px">روی هر روز بزنید تا هفته آن در برنامه باز شود. هرچه ساعت برنامه‌ریزی‌شده بیشتر باشد، رنگ آن روز پررنگ‌تر است.</p></section>`;
}

/* timer */
const RC=2*Math.PI*118;
let tm={left:1500,total:1500,run:null,end:0,done:false},AC=null;
const audio=()=>{try{AC=AC||new(window.AudioContext||window.webkitAudioContext)();if(AC.state==='suspended')AC.resume()}catch(e){}return AC};
function bell(){const c=audio();if(!c)return;const t0=c.currentTime+.05;
 for(let n=0;n<4;n++){const t=t0+n*1.2;
  [[880,.45],[1320,.2],[1760,.09]].forEach(([f,g])=>{const o=c.createOscillator(),v=c.createGain();o.type='sine';o.frequency.value=f;
   v.gain.setValueAtTime(0,t);v.gain.linearRampToValueAtTime(g,t+.012);v.gain.exponentialRampToValueAtTime(.0001,t+1.1);
   o.connect(v);v.connect(c.destination);o.start(t);o.stop(t+1.15)})}
 try{navigator.vibrate&&navigator.vibrate([300,150,300])}catch(e){}}
const clk=()=>fa(pad(Math.floor(tm.left/60)))+':'+fa(pad(tm.left%60));
const sessionsToday=()=>S.log.filter(l=>l.k===key(new Date())).length;
function paintTimer(){
 const f=$('#rfg'),c=$('#clk');if(f)f.style.strokeDashoffset=RC*(tm.left/tm.total);if(c)c.textContent=clk();
 document.title=tm.run?`${clk()} · Planner x`:'Planner x'}
function tick(){
 tm.left=Math.max(0,Math.ceil((tm.end-Date.now())/1000));
 if(tm.left<=0){
  clearInterval(tm.run);tm.run=null;
  S.log.push({k:key(new Date()),h:tm.total/3600});save();
  tm.left=tm.total;tm.done=true;bell();document.title='Planner x';
  toast('⏰ زمان مطالعه تمام شد. به آمار اضافه شد.');
  if(S.tab==='timer'){render({});const r=$('.ringw');if(r){r.classList.add('fin');const b=r.getBoundingClientRect();burst(b.left+b.width/2,b.top+b.height/2,60,1.3)}}
  return}
 paintTimer()}
function timer(){
 const off=RC*(tm.left/tm.total);
 return `<section class="card pad mid"><div class="timer"><div class="ringw ${tm.run?'run':''}"><svg viewBox="0 0 272 272" aria-hidden="true"><defs><linearGradient id="gr" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--pr)"/><stop offset="1" stop-color="var(--prh)"/></linearGradient></defs><circle class="bg" cx="136" cy="136" r="118"/><circle class="fg" id="rfg" cx="136" cy="136" r="118" stroke="url(#gr)" stroke-dasharray="${RC}" stroke-dashoffset="${off}"/></svg><div class="t" id="clk">${clk()}</div></div>
 ${tm.done?`<p class="dmsg"><span class="wv">🔔</span> زمان مطالعه تمام شد. کمی استراحت کنید.</p>`:''}
 <div class="tctl"><button class="btn" data-a="tstart">${I(tm.run?'pause':'play','b')}${tm.run?'توقف':'شروع'}</button><button class="btn g" data-a="treset">${I('arrow-counter-clockwise')}بازنشانی</button><button class="btn g ico" data-a="tbell" aria-label="آزمایش صدا" title="آزمایش صدا">${I('bell-ringing')}</button>
 <select data-a="tlen" aria-label="مدت تایمر">${[15,25,45,60,90].map(x=>`<option value="${x}" ${x*60===tm.total?'selected':''}>${fa(x)} دقیقه</option>`).join('')}</select></div>
 <p class="tsub">جلسه‌های کامل‌شده امروز: ${fa(sessionsToday())} · هر جلسه کامل در آمار مطالعه ثبت می‌شود</p></div></section>`;
}

/* stats: study hours only (day / week / month) */
let SO=0;
function period(mode,o){
 if(mode==='day'){const d=addDays(TODAY,o);return{days:[d],label:pd(d),now:!o}}
 if(mode==='week'){const s=addDays(WS0,7*o),e=addDays(s,6);return{days:[0,1,2,3,4,5,6].map(i=>addDays(s,i)),label:fmt(s,{day:'numeric',month:'long'})+' تا '+fmt(e,{day:'numeric',month:'long'}),now:!o}}
 let m=monthStart(TODAY);for(let i=0;i<Math.abs(o);i++)m=o<0?monthStart(addDays(m,-1)):monthStart(addDays(m,32));
 const days=[];for(let x=new Date(m);jp(x).month===jp(m).month;x=addDays(x,1))days.push(x);
 return{days,label:fmt(m,{month:'long',year:'numeric'}),now:!o}}
function stats(){
 const map=hoursMap(),mode=S.stat,P=period(mode,SO),total=P.days.reduce((a,d)=>a+(map.get(key(d))||0),0);
 const unit={day:'روز',week:'هفته',month:'ماه'}[mode];
 return `<div class="stack"><section class="card pad sx">
 <div class="seg" id="seg"><span class="th nt"></span>${[['day','روز'],['week','هفته'],['month','ماه']].map(([m,t])=>`<button data-a="smode" data-m="${m}" class="${m===mode?'on':''}">${t}</button>`).join('')}</div>
 <div class="pn"><button class="btn g ico" data-a="sprev" aria-label="قبلی">${I('caret-right','b')}</button><div class="pl"><b>${esc(P.label)}</b>${P.now?`<small>${mode==='day'?'امروز':'این '+unit}</small>`:`<button class="lk" data-a="snow">برگشت به ${mode==='day'?'امروز':'این '+unit}</button>`}</div><button class="btn g ico" data-a="snext" aria-label="بعدی">${I('caret-left','b')}</button></div>
 <div class="big"><span data-count="${total}" data-dec="1">${r1(total)}</span><small>ساعت مطالعه</small></div></section></div>`;
}
function placeSeg(anim){
 const s=$('#seg');if(!s)return;const on=$('button.on',s),th=$('.th',s);
 th.classList.toggle('nt',!anim);th.style.left=on.offsetLeft+'px';th.style.width=on.offsetWidth+'px'}

function backup(){
 return `<div class="bg2"><section class="card pad"><div class="bc"><h3>💾 پشتیبان‌گیری</h3><p>همه کارها، تعداد ردیف‌ها و ساعت‌های مطالعه در یک فایل JSON ذخیره می‌شود.</p><button class="btn" data-a="bk">${I('download-simple')}دانلود فایل پشتیبان</button></div></section>
 <section class="card pad"><div class="bc"><h3>📥 بازیابی اطلاعات</h3><p>فایل پشتیبان را انتخاب کنید. اطلاعات فعلی جایگزین می‌شوند (فایل‌های نسخه قبل هم پذیرفته می‌شوند).</p><input type="file" id="rf" accept=".json,application/json" hidden><button class="btn g" data-a="rs">${I('upload-simple')}انتخاب فایل</button><p id="msg" class="pct"></p></div></section></div>`;
}

/* ---------- render ---------- */
const VIEWS={plan,cal,timer,stats,backup};
function updateChrome(){
 const today=S.tasks.filter(t=>t.wk===wkOf(0)&&t.d===TI),dn=today.filter(t=>t.done).length,pc=today.length?Math.round(dn/today.length*100):0;
 $('#hrfg').style.strokeDashoffset=100-pc;$('#hrt').textContent=pc===100?'🎉':fa(pc)+'٪';
 $('#date').textContent=pd(TODAY);
 $('#sub').textContent=today.length?`${fa(today.length)} کار برای امروز، ${fa(dn)} انجام شده`:'برای امروز کاری ثبت نشده';
 const chip=$('#chip');if(chip&&S.tab==='plan'){const wt=S.tasks.filter(t=>t.wk===wkOf(W));chip.textContent=`${fa(wt.filter(t=>t.done).length)} از ${fa(wt.length)} انجام شد`}}
function render(o={}){
 refreshToday();
 const tabChanged=lastTab!==S.tab;
 if(tabChanged)o.enter=true;
 const v=$('#view');
 v.className=(S.tab==='plan'?'plan':'')+(o.enter?' enter':'');
 v.innerHTML=VIEWS[S.tab](o);
 setNav(tabChanged&&lastTab!==null);lastTab=S.tab;
 if(S.tab==='stats'){counts(v);placeSeg(false)}
 saveSoft();updateChrome()}
const saveSoft=()=>save();

/* ---------- dialog ---------- */
const dlg=$('#dlg'),form=$('#f');let DLG=null;
function closeDlg(){
 DLG=null;if(!dlg.open)return;
 dlg.classList.add('closing');
 setTimeout(()=>{dlg.classList.remove('closing');if(dlg.close)dlg.close();else dlg.removeAttribute('open')},180)}
function openDlg(title,body,onSave,onDel){
 DLG={onSave,onDel};
 form.innerHTML=`<h3>${title}</h3>${body}<p class="err" id="err" role="alert"></p><div class="acts"><button type="button" class="btn" data-x="s">${I('check','b')}ذخیره</button><button type="button" class="btn g" data-x="c">انصراف</button>${onDel?`<button type="button" class="btn g dng" data-x="d">${I('trash')}حذف</button>`:''}</div>`;
 dlg.classList.remove('closing');
 if(dlg.showModal)dlg.showModal();else dlg.setAttribute('open','');
 const f=form.elements.n;if(f){f.focus();f.select&&f.select()}}
function submitDlg(){
 if(!DLG)return;
 let ok=false;
 try{ok=DLG.onSave()}catch(err){const er=$('#err');if(er)er.textContent='خطا در ذخیره: '+err.message;return}
 if(ok)closeDlg()}
form.addEventListener('submit',e=>{e.preventDefault();submitDlg()});
form.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.tagName==='INPUT'){e.preventDefault();submitDlg()}});
form.addEventListener('click',e=>{
 const x=e.target.closest('[data-x]')?.dataset.x,q=e.target.closest('[data-q]'),sw=e.target.closest('[data-c]'),sg=e.target.closest('[data-sg]'),eb=e.target.closest('[data-e]');
 if(x==='s')submitDlg();
 else if(x==='c')closeDlg();
 else if(x==='d'&&DLG&&DLG.onDel){DLG.onDel();closeDlg()}
 else if(q){form.elements.h.value=fa(q.dataset.q);hq()}
 else if(sg){form.elements.n.value=sg.dataset.sg;form.elements.n.focus()}
 else if(eb){form.elements.e.value=eb.dataset.e;$$('.eb',form).forEach(b=>b.classList.toggle('on',b===eb))}
 else if(sw){form.elements.c.value=sw.dataset.c;$$('.sw',form).forEach(b=>b.classList.toggle('on',b===sw))}});
form.addEventListener('input',e=>{if(e.target.name==='h')hq();const er=$('#err');if(er)er.textContent=''});
dlg.addEventListener('cancel',e=>{e.preventDefault();closeDlg()});
function hq(){const v=parseFloat(en(form.elements.h.value));$$('.q',form).forEach(b=>b.classList.toggle('on',+b.dataset.q===v))}
const taskBody=(n,h,c,e='')=>`<label class="fld"><span>عنوان کار</span><input name="n" maxlength="80" autocomplete="off" value="${esc(n)}" placeholder="مثلاً ریاضی - فصل ۲ تمرین‌ها"></label>${(()=>{const r=[...new Set(S.tasks.map(x=>x.n))].slice(-5).reverse();return r.length?`<div class="qs sg">${r.map(x=>`<button type="button" class="q" data-sg="${esc(x)}">${esc(x.length>18?x.slice(0,18)+"…":x)}</button>`).join("")}</div>`:""})()}
<div class="fld"><span>مدت مطالعه (ساعت)</span><input name="h" inputmode="decimal" aria-label="مدت مطالعه به ساعت" autocomplete="off" value="${fa(h)}"><div class="qs">${[0.5,1,1.5,2,3].map(x=>`<button type="button" class="q ${x===h?'on':''}" data-q="${x}">${fa(x)}</button>`).join('')}</div></div>
<div class="fld"><span>رنگ</span><div class="cols">${COLORS.map((x,i)=>`<button type="button" class="sw ${i===c?'on':''}" data-c="${i}" style="--c:${x}" aria-label="رنگ ${fa(i+1)}"></button>`).join('')}</div></div><div class="fld"><span>ایموجی (اختیاری)</span><div class="ems"><button type="button" class="eb ${e===''?'on':''}" data-e="" aria-label="بدون ایموجی">∅</button>${EMOJIS.map(x=>`<button type="button" class="eb ${x===e?'on':''}" data-e="${x}">${x}</button>`).join('')}</div></div><input type="hidden" name="c" value="${c}"><input type="hidden" name="e" value="${e}">`;
function readTask(){
 const E=form.elements,n=E.n.value.trim(),h=parseFloat(en(E.h.value));
 const bad=(m,el)=>{$('#err').textContent=m;el.focus();return null};
 if(!n)return bad('عنوان کار را وارد کنید.',E.n);
 if(!(h>0&&h<=24))return bad('مدت باید عددی بین ۰٫۵ تا ۲۴ ساعت باشد.',E.h);
 return{n,h:Math.round(h*100)/100,c:clamp(+E.c.value||0,0,COLORS.length-1),e:EMOJIS.includes(E.e.value)?E.e.value:''}}

/* ---------- task operations ---------- */
function findFree(wk,d,from){
 for(let k=from;k<MAXROWS;k++)if(!S.tasks.some(t=>t.wk===wk&&t.d===d&&t.s===k))return k;
 for(let dd=0;dd<7;dd++)for(let k=0;k<MAXROWS;k++)if(!S.tasks.some(t=>t.wk===wk&&t.d===dd&&t.s===k))return[dd,k];
 return null}
function toggle(id){
 const t=S.tasks.find(x=>x.id==id);if(!t)return;
 t.done=!t.done;save();
 const el=$(`.task[data-id="${id}"]`);
 if(el){el.classList.toggle('done',t.done);el.setAttribute('aria-pressed',t.done);
  if(t.done){el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash');
   const r=$('.chk',el).getBoundingClientRect();burst(r.left+r.width/2,r.top+r.height/2,26,1);
   const td=S.tasks.filter(x=>x.wk===wkOf(0)&&x.d===TI);
   if(t.wk===wkOf(0)&&t.d===TI&&td.length&&td.every(x=>x.done)){setTimeout(()=>{burst(innerWidth*.3,innerHeight*.35,60,1.4);burst(innerWidth*.7,innerHeight*.35,60,1.4)},150);toast('🎉 همه کارهای امروز تمام شد. آفرین!')}}}
 updateChrome()}
function removeTask(id,quiet){
 const before=snap(),el=$(`.task[data-id="${id}"]`);
 const go=()=>{S.tasks=S.tasks.filter(t=>t.id!=id);save();flip(()=>render({}));if(!quiet)toast('🗑️ کار حذف شد.',before)};
 if(el&&!reduced){el.classList.add('out');setTimeout(go,200)}else go()}
function setRows(delta){
 const wk=wkOf(W),cur=rowsFor(wk),nx=cur+delta;
 if(nx<1||nx>MAXROWS){$('#step')?.classList.add('shake');setTimeout(()=>$('#step')?.classList.remove('shake'),500);return}
 if(delta<0&&S.tasks.some(t=>t.wk===wk&&t.s>=nx)){
  const st=$('#step');st.classList.remove('shake');void st.offsetWidth;st.classList.add('shake');
  toast('ردیف آخر خالی نیست. اول کارهای آن را جابه‌جا یا حذف کنید.');return}
 S.rows[wk]=nx;S.defRows=nx;save();render(delta>0?{newRowFrom:cur}:{})}

/* ---------- drag & drop (mouse, pen, touch long-press) ---------- */
let drag=null,noClick=false;
const view=$('#view');
view.addEventListener('pointerdown',e=>{
 const el=e.target.closest('.task');if(!el||e.target.closest('.tb')||(e.button&&e.button>0))return;
 drag={el,id:el.dataset.id,x:e.clientX,y:e.clientY,on:false,type:e.pointerType,ready:e.pointerType!=='touch',t:0,over:null};
 if(!drag.ready)drag.t=setTimeout(()=>{if(drag){drag.ready=true;if(!drag.on&&navigator.vibrate)try{navigator.vibrate(12)}catch(x){}}},260)});
view.addEventListener('pointermove',e=>{
 const st=e.target.closest&&e.target.closest('.stat');
 if(st&&!reduced){const r=st.getBoundingClientRect(),px=(e.clientX-r.left)/r.width-.5,py=(e.clientY-r.top)/r.height-.5;st.style.transform=`perspective(700px) rotateY(${-px*12}deg) rotateX(${py*10}deg) translateY(-3px)`}
 const el=e.target.closest&&e.target.closest('.task');
 if(el&&!drag){const r=el.getBoundingClientRect();el.style.setProperty('--mx',(e.clientX-r.left)+'px');el.style.setProperty('--my',(e.clientY-r.top)+'px')}});
function startDrag(e){
 const el=drag.el,r=el.getBoundingClientRect(),g=el.cloneNode(true);
 g.classList.add('ghost');g.classList.remove('pop','flash');g.removeAttribute('data-a');
 g.style.width=r.width+'px';g.style.height=r.height+'px';g.style.left=r.left+'px';g.style.top=r.top+'px';
 drag.dx=e.clientX-r.left;drag.dy=e.clientY-r.top;drag.g=g;document.body.appendChild(g);
 el.classList.add('dragging');drag.on=true;document.body.style.cursor='grabbing'}
addEventListener('pointermove',e=>{
 if(!drag)return;
 if(!drag.on){
  const dist=Math.hypot(e.clientX-drag.x,e.clientY-drag.y);
  if(drag.type==='touch'&&!drag.ready){if(dist>8){clearTimeout(drag.t);drag=null}return}
  if(dist<7)return;startDrag(e)}
 drag.g.style.left=(e.clientX-drag.dx)+'px';drag.g.style.top=(e.clientY-drag.dy)+'px';
 const under=document.elementFromPoint(e.clientX,e.clientY),cell=under&&under.closest('.cell');
 if(cell!==drag.over){drag.over&&drag.over.classList.remove('over');drag.over=cell;cell&&cell.classList.add('over')}
 const sc=$('.scroll');if(sc){const r=sc.getBoundingClientRect();if(e.clientY>r.bottom-40)sc.scrollTop+=12;else if(e.clientY<r.top+90)sc.scrollTop-=12}});
addEventListener('touchmove',e=>{if(drag&&drag.on)e.preventDefault()},{passive:false});
function endDrag(cancel){
 if(!drag)return;const d=drag;drag=null;clearTimeout(d.t);
 if(!d.on)return;
 noClick=true;setTimeout(()=>noClick=false,60);
 document.body.style.cursor='';d.g.remove();d.el.classList.remove('dragging');d.over&&d.over.classList.remove('over');
 if(cancel||!d.over)return;
 const wk=wkOf(W),t=S.tasks.find(x=>x.id==d.id),nd=+d.over.dataset.d,ns=+d.over.dataset.s;
 if(!t||(t.d===nd&&t.s===ns))return;
 const other=S.tasks.find(x=>x.wk===wk&&x.d===nd&&x.s===ns&&x.id!==t.id);
 if(other){other.d=t.d;other.s=t.s}
 t.d=nd;t.s=ns;save();flip(()=>render({}))}
addEventListener('pointerup',()=>endDrag(false));
addEventListener('pointercancel',()=>endDrag(true));
document.addEventListener('click',e=>{if(noClick){e.stopPropagation();e.preventDefault()}},true);

/* ---------- actions ---------- */
const go=t=>{S.tab=t;save();render({enter:true})};
const slideWeek=dir=>{W+=dir;render({enter:true,dir})};
const ACT={
 tab:el=>go(el.dataset.t),
 tog:el=>toggle(el.dataset.id),
 del:el=>removeTask(el.dataset.id),
 addtask:el=>{
  const d=+el.dataset.d,s=+el.dataset.s,wk=wkOf(W);
  openDlg(`افزودن کار · ${DAYS[d]} ${fmt(addDays(parse(wk),d),{day:'numeric',month:'long'})}`,taskBody('',1,0,''),()=>{
   const v=readTask();if(!v)return false;const id=uid();
   S.tasks.push({id,wk,d,s,done:false,...v});save();render({added:id});return true})},
 edit:el=>{
  const t=S.tasks.find(x=>x.id==el.dataset.id);if(!t)return;
  openDlg('ویرایش کار',taskBody(t.n,t.h,t.c,t.e),()=>{const v=readTask();if(!v)return false;Object.assign(t,v);save();render({});return true},()=>removeTask(t.id))},
 dup:el=>{
  const t=S.tasks.find(x=>x.id==el.dataset.id);if(!t)return;
  let f=findFree(t.wk,t.d,t.s+1);if(!f){toast('خانه خالی پیدا نشد. یک ردیف اضافه کنید.');return}
  const d=Array.isArray(f)?f[0]:t.d,s=Array.isArray(f)?f[1]:f,id=uid();
  if(s>=rowsFor(t.wk))S.rows[t.wk]=s+1;
  S.tasks.push({...t,id,d,s,done:false});save();flip(()=>render({added:id}))},
 rowinc:()=>setRows(1),rowdec:()=>setRows(-1),
 wprev:()=>slideWeek(-1),wnext:()=>slideWeek(1),wnow:()=>{const d=W<0?1:-1;W=0;render({enter:true,dir:d})},
 wcopy:()=>{
  const wk=wkOf(W),pk=wkOf(W-1),before=snap();let n=0;
  S.tasks.filter(t=>t.wk===pk).forEach(t=>{if(!S.tasks.some(x=>x.wk===wk&&x.d===t.d&&x.s===t.s)){S.tasks.push({...t,id:uid(),wk,done:false});n++}});
  const mx=S.tasks.reduce((a,t)=>t.wk===wk?Math.max(a,t.s+1):a,0);if(mx>(S.rows[wk]??S.defRows))S.rows[wk]=mx;
  save();render({enter:true});toast(n?`${fa(n)} کار از هفته قبل کپی شد.`:'چیزی برای کپی نبود.',n?before:null)},
 wclear:()=>{const wk=wkOf(W),before=snap();S.tasks=S.tasks.filter(t=>t.wk!==wk);save();render({});toast('همه کارهای این هفته پاک شد.',before)},
 cprev:()=>{CM--;render({cal:true})},cnext:()=>{CM++;render({cal:true})},
 cgo:el=>{W=Math.round((weekStart(parse(el.dataset.date))-WS0)/(7*DAY));S.tab='plan';save();render({enter:true})},
 smode:el=>{S.stat=el.dataset.m;SO=0;save();render({enter:true})},
 sprev:()=>{SO--;render({})},snext:()=>{SO++;render({})},snow:()=>{SO=0;render({})},
 tstart:()=>{
  if(tm.run){clearInterval(tm.run);tm.run=null;tm.left=Math.max(1,Math.ceil((tm.end-Date.now())/1000));document.title='Planner x'}
  else{audio();tm.done=false;tm.end=Date.now()+tm.left*1000;tm.run=setInterval(tick,200)}
  render({})},
 tbell:()=>bell(),
 treset:()=>{clearInterval(tm.run);tm.run=null;tm.left=tm.total;tm.done=false;document.title='Planner x';render({})},
 bk:()=>{
  const u=URL.createObjectURL(new Blob([JSON.stringify({v:4,tasks:S.tasks,rows:S.rows,defRows:S.defRows,log:S.log})],{type:'application/json'})),l=document.createElement('a');
  l.href=u;l.download='study-planner-backup-'+key(new Date())+'.json';document.body.appendChild(l);l.click();l.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);toast('✅ فایل پشتیبان دانلود شد.')},
 rs:()=>$('#rf').click()
};
document.addEventListener('click',e=>{
 const el=e.target.closest('[data-a]');if(!el)return;
 const f=ACT[el.dataset.a];if(f)f(el)});
document.addEventListener('keydown',e=>{
 const t=e.target;if(!t.matches)return;
 if((e.key==='Enter'||e.key===' ')&&t.matches('.task')){e.preventDefault();t.click()}
 else if((e.key==='Delete'||e.key==='Backspace')&&t.matches('.task')){e.preventDefault();removeTask(t.dataset.id)}});
document.addEventListener('change',e=>{
 const el=e.target;
 if(el.dataset&&el.dataset.a==='tlen'){clearInterval(tm.run);tm.run=null;tm.done=false;tm.total=tm.left=+el.value*60;render({})}
 if(el.id==='rf'&&el.files[0]){
  const r=new FileReader();
  r.onload=()=>{try{
   const d=JSON.parse(r.result);if(!d||!Array.isArray(d.tasks))throw 0;
   const before=snap();restore(r.result);render({});$('#msg').textContent='اطلاعات با موفقیت بازیابی شد.';toast('📥 اطلاعات بازیابی شد.',before)
  }catch(x){$('#msg').textContent='فایل معتبر نیست. فایل پشتیبانی که از همین برنامه گرفته‌اید را انتخاب کنید.'}};
  r.readAsText(el.files[0])}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){const k=key(TODAY);refreshToday();if(key(TODAY)!==k)render({})}});

/* ---------- theme (circular reveal when supported) ---------- */
const root=document.documentElement;
try{const th=localStorage.getItem('sp-theme');if(th)root.dataset.theme=th}catch(e){}
const isDark=()=>root.dataset.theme==='dark'||(!root.dataset.theme&&matchMedia('(prefers-color-scheme:dark)').matches);
const themeBtn=()=>{$('#theme').innerHTML=I(isDark()?'sun':'moon')};
$('#theme').onclick=e=>{
 const n=isDark()?'light':'dark';
 const apply=()=>{root.dataset.theme=n;try{localStorage.setItem('sp-theme',n)}catch(x){}themeBtn()};
 if(!document.startViewTransition||reduced){apply();return}
 const r=e.currentTarget.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,rad=Math.hypot(Math.max(x,innerWidth-x),Math.max(y,innerHeight-y));
 document.startViewTransition(apply).ready.then(()=>root.animate({clipPath:[`circle(0 at ${x}px ${y}px)`,`circle(${rad}px at ${x}px ${y}px)`]},{duration:650,easing:'cubic-bezier(.25,.8,.25,1)',pseudoElement:'::view-transition-new(root)'})).catch(()=>{})};
themeBtn();
render({enter:true});
})();
if('serviceWorker' in navigator&&location.protocol!=='file:')addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
