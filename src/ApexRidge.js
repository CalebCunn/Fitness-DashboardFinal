// APEX · First light. Ridgelines drawn from real data, and the morning sky as the
// recovery reading. Shared by Today, Training, Activities and Recovery.
import {useEffect,useLayoutEffect,useRef,useState} from 'react';

// Smooth Catmull-Rom curve through points, as an SVG path.
export function smooth(pts){
 if(!pts.length)return '';
 let d=`M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
 for(let i=0;i<pts.length-1;i++){
  const p0=pts[i-1]||pts[i],p1=pts[i],p2=pts[i+1],p3=pts[i+2]||p2;
  const c1=[p1[0]+(p2[0]-p0[0])/6,p1[1]+(p2[1]-p0[1])/6],c2=[p2[0]-(p3[0]-p1[0])/6,p2[1]-(p3[1]-p1[1])/6];
  d+=` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
 }
 return d;
}

// Sky state from a recovery score. Colour is the reading: no rings, no traffic lights.
export function skyFor(score){
 if(score==null)return {key:'night',label:'No reading yet',line:'Connect WHOOP to read this morning’s recovery.'};
 if(score>=67)return {key:'clear',label:'Recovered. Good to train.'};
 if(score>=34)return {key:'haze',label:'Middling. Train, but keep it honest.'};
 return {key:'overcast',label:'Run down. Easy or rest today.'};
}

const reduced=()=>typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Count a number up on a smooth curve. Plays only when `play` is true.
export function useRoll(value,play,ms=900){
 const [v,setV]=useState(play?0:value);
 useEffect(()=>{
  if(!play||!Number.isFinite(value)||reduced()){setV(value);return;}
  let raf,start;const step=t=>{if(!start)start=t;const k=Math.min(1,(t-start)/ms),e=1-Math.pow(1-k,3);setV(value*e);if(k<1)raf=requestAnimationFrame(step);};
  raf=requestAnimationFrame(step);return()=>cancelAnimationFrame(raf);
 },[value,play,ms]);
 return v;
}

// The horizon of the Today sky: one peak per day of the week, height from the
// planned (or run) distance, so the week is literally a ridge.
function weekHorizon(days){
 const W=400,base=118,n=days.length||7,max=Math.max(16,...days.map(d=>Math.max(d.plannedKm||0,d.km||0)));
 const xs=Array.from({length:n},(_,i)=>20+i*(W-40)/(n-1));
 const pts=[[0,base]];
 xs.forEach((x,i)=>{
  const v=Math.max(days[i]?.plannedKm||0,days[i]?.km||0,1.4);
  pts.push([x,base-v/max*80]);
  if(i<n-1){const next=Math.max(days[i+1]?.plannedKm||0,days[i+1]?.km||0,1.4);pts.push([x+(W-40)/(n-1)/2,base-6-Math.min(v,next)/max*18]);}
 });
 pts.push([W,base-6]);
 return {d:smooth(pts)+` L${W},200 L0,200Z`,xs:xs.map(x=>x/W*100),ys:xs.map((_,i)=>pts[1+i*2][1])};
}

const MID='M0,140 '+smooth([[0,140],[60,128],[130,138],[200,124],[270,136],[340,126],[400,134]]).slice(1)+' L400,200 L0,200Z';
const NEAR=smooth([[0,160],[90,152],[180,158],[260,150],[340,156],[400,152]])+' L400,200 L0,200Z';

// Signature: "First light". On the first open of a day the sun rises to the
// recovery height, the sky settles on its colour and the number rolls up.
function firstLightToday(score){
 if(score==null||reduced())return false;
 try{const key=new Date().toDateString();if(localStorage.getItem('apex-first-light')===key)return false;localStorage.setItem('apex-first-light',key);return true;}catch{return false;}
}

export function SkyHero({score,days=[],todayIndex=-1,children,onScore,dateLabel,decor=false,now=new Date()}){
 const sky=skyFor(score);
 const h=now.getHours(),evening=h>=20||h<5;
 // Decided once per mount, as soon as a score exists (WHOOP may arrive after first paint).
 const decided=useRef(false),[play,setPlay]=useState(false),[risen,setRisen]=useState(true);
 useLayoutEffect(()=>{if(decided.current||score==null)return;decided.current=true;if(!decor&&!evening&&firstLightToday(score)){setPlay(true);setRisen(false);}},[score,decor,evening]);
 useEffect(()=>{if(!play)return;let b;const a=requestAnimationFrame(()=>{b=requestAnimationFrame(()=>setRisen(true));});return()=>{cancelAnimationFrame(a);cancelAnimationFrame(b);};},[play]);
 const shown=useRoll(score??0,play);
 const week=days.length?days:Array.from({length:7},()=>({plannedKm:6}));
 const horizon=weekHorizon(week);
 // The sun means today: it rests on today's peak (or sets behind it after dark).
 const ti=todayIndex>=0?todayIndex:Math.min(6,(now.getDay()+6)%7);
 const peakY=horizon.ys[ti];
 return <section className={`sky-hero sky-${evening&&score!=null?'evening':sky.key}${risen?' is-risen':''}${play?' is-playing':''}`} style={{'--sun-x':`${Math.max(15,Math.min(85,horizon.xs[ti]))}%`,'--peak':peakY/200}} aria-label={score==null?'Recovery not available':`Recovery ${Math.round(score)} percent. ${sky.label}`}>
  <div className="sky-veil" aria-hidden="true"/>
  {score!=null&&<div className="sky-sun" aria-hidden="true"/>}
  {!decor&&<div className="sky-copy">
   {dateLabel&&<p className="sky-date">{dateLabel}</p>}
   <button className="sky-score" onClick={onScore} disabled={!onScore} aria-label="Open recovery detail">
    <span className="sky-number">{score==null?'—':Math.round(shown)}</span>
   </button>
   <p className="sky-label">{sky.label}</p>
   {children}
  </div>}
  <svg className="sky-ridges" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
   <path className="ridge-far" d={horizon.d}/><path className="ridge-mid" d={MID}/><path className="ridge-near" d={NEAR}/>
  </svg>
  {!decor&&days.length>0&&<ol className="sky-days" aria-hidden="true">{days.map((d,i)=><li key={d.key||i} style={{left:`${horizon.xs[i]}%`}} className={i===todayIndex?'is-today':''}>{(d.label||'')[0]}</li>)}</ol>}
 </section>;
}

// A small sky for the Recovery page and anywhere a compact reading is needed.
export function SkyTile({score}){
 const sky=skyFor(score),sunTop=score==null?80:14+(1-Math.max(0,Math.min(100,score))/100)*52;
 return <div className={`sky-tile sky-${sky.key}`} aria-hidden="true">
  {score!=null&&<i className="sky-sun" style={{'--sun-top':`${sunTop}%`}}/>}
  <svg viewBox="0 0 400 200" preserveAspectRatio="none"><path className="ridge-far" d={smooth([[0,150],[70,120],[140,138],[210,96],[280,130],[340,112],[400,128]])+' L400,200 L0,200Z'}/><path className="ridge-near" d={NEAR}/></svg>
 </div>;
}

// Week as a ridge: one peak per day. Filled = run, outline = planned, dashed = strength.
export function WeekRidge({days,todayKey,onPick}){
 const W=400,H=150,base=136,max=Math.max(16,...days.map(d=>Math.max(d.plannedKm||0,d.km||0)));
 const step=(W-64)/6,half=Math.min(40,step*.74);
 const peak=(x,h)=>`M${x-half},${base} C${x-half*.36},${base} ${x-half*.32},${base-h} ${x},${base-h} C${x+half*.32},${base-h} ${x+half*.36},${base} ${x+half},${base}`;
 return <div className="week-ridge">
  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="This week as a ridge: planned and run distance per day">
   <line x1="0" x2={W} y1={base} y2={base} className="wr-base"/>
   {days.map((d,i)=>{const x=32+i*step,ph=d.plannedKm?18+d.plannedKm/max*100:0,rh=d.km?18+d.km/max*100:0;
    return <g key={d.key} className={`wr-day wr-${d.effort||'easy'}`}>
     {d.strength&&!ph&&!rh&&<path d={peak(x,32)} className="wr-strength"/>}
     {ph>0&&<path d={peak(x,ph)+'Z'} className={rh?'wr-plan-ghost':'wr-plan'}/>}
     {rh>0&&<path d={peak(x,rh)+'Z'} className="wr-run"/>}
     {!ph&&!rh&&!d.strength&&<line x1={x-12} x2={x+12} y1={base} y2={base} className="wr-rest"/>}
    </g>;})}
  </svg>
  <div className="wr-labels">{days.map((d,i)=>{const v=d.km||d.plannedKm,h=v?18+v/max*100:d.strength?32:0;return <span key={d.key} style={{left:`${(32+i*step)/W*100}%`,bottom:`${(H-base+h)/H*100}%`}} className={d.key===todayKey?'is-today':''}>{v?<b>{(Math.round(v*10)/10).toString()}</b>:null}</span>;})}</div>
  <div className="wr-days">{days.map(d=><button key={d.key} type="button" className={d.key===todayKey?'is-today':''} onClick={()=>onPick?.(d)} aria-label={d.aria}><small>{d.short}</small><b>{d.date}</b></button>)}</div>
 </div>;
}

// Any series as a profile: elevation silhouette with an optional line on top,
// with a finger-following scrubber.
export function Profile({fill=[],line=[],xs=[],height=180,format,lineLabel,invert=false,onScrub}){
 const ref=useRef(null),[at,setAt]=useState(null);
 const W=400,H=height,n=Math.max(fill.length,line.length);
 if(n<2)return null;
 const scale=(arr,top,bottom,inv)=>{const v=arr.filter(Number.isFinite);if(!v.length)return null;const lo=Math.min(...v),hi=Math.max(...v),span=hi-lo||1;return arr.map((y,i)=>[i/(arr.length-1)*W,Number.isFinite(y)?(inv?top+(y-lo)/span*(bottom-top):bottom-(y-lo)/span*(bottom-top)):bottom]);};
 // A rolling average so the line reads as a trend, not sensor noise.
 const win=Math.max(1,Math.round(line.length/90)),avg=line.map((_,i)=>{let s=0,c=0;for(let j=Math.max(0,i-win);j<=Math.min(line.length-1,i+win);j++)if(Number.isFinite(line[j])){s+=line[j];c++;}return c?s/c:NaN;});
 const f=fill.length>1?scale(fill,H*.38,H-6):null,l=avg.length>1?scale(avg,H*.08,H*.62,invert).map(([x,y])=>[16+x*(W-32)/W,y]):null;
 const move=e=>{const r=ref.current?.getBoundingClientRect();if(!r)return;const x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));const i=Math.round(x*(n-1));setAt(i);onScrub?.(i);};
 return <div className="profile" ref={ref} onPointerMove={move} onPointerDown={move} onPointerLeave={()=>setAt(null)} style={{'--h':`${H}px`}}>
  <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
   {f&&<path className="profile-fill" d={smooth(f.filter((_,i)=>i%Math.ceil(f.length/160)===0||i===f.length-1))+` L${W},${H} L0,${H}Z`}/>}
   {l&&<path className="profile-line" d={smooth(l.filter((_,i)=>i%Math.ceil(l.length/200)===0||i===l.length-1))} vectorEffect="non-scaling-stroke"/>}
   {at!=null&&<line x1={at/(n-1)*W} x2={at/(n-1)*W} y1="0" y2={H} className="profile-cursor" vectorEffect="non-scaling-stroke"/>}
  </svg>
  {at!=null&&format&&<div className="profile-read" style={{left:`${Math.min(78,Math.max(2,at/(n-1)*100-10))}%`}}>{format(at)}</div>}
  {lineLabel&&<span className="profile-key">{lineLabel}</span>}
 </div>;
}
