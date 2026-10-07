// APEX · Swiss race poster. Graphics from the track: recovery is your lap round
// the bend, the week is a bar chart on a grid, runs are profiles and posters.
import {useEffect,useLayoutEffect,useRef,useState} from 'react';

const reduced=()=>typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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

export function readyFor(score){
 if(score==null)return {key:'none',label:'No reading',word:'Waiting.',line:'Connect WHOOP to read this morning’s recovery.'};
 if(score>=67)return {key:'high',label:'Ready to run',word:'Ready to run.'};
 if(score>=34)return {key:'mid',label:'Train steady',word:'Steady today.'};
 return {key:'low',label:'Recover first',word:'Recover first.'};
}

// Signature: "first lap". On the first open of the day your lap sweeps the bend
// to your recovery score and the number counts up with it.
function firstLap(){
 if(reduced())return false;
 try{const k=new Date().toDateString();if(localStorage.getItem('apex-first-lap')===k)return false;localStorage.setItem('apex-first-lap',k);return true;}catch{return false;}
}

export function useLap(score,{animate=true}={}){
 const target=score==null?0:Math.max(0,Math.min(100,score));
 const decided=useRef(false),[p,setP]=useState(target);
 useLayoutEffect(()=>{
  if(score==null){setP(0);return;}
  if(decided.current||!animate){setP(target);return;}
  decided.current=true;
  if(!firstLap()){setP(target);return;}
  setP(0);let raf,start;const dur=1600;
  const step=t=>{if(!start)start=t;const k=Math.min(1,(t-start)/dur),e=1-Math.pow(1-k,3);setP(target*e);if(k<1)raf=requestAnimationFrame(step);};
  raf=requestAnimationFrame(step);return()=>cancelAnimationFrame(raf);
 },[score,target,animate]);
 return p;
}

// The track: the end of a 400 m track seen from above. Two straights run in from
// the right, round the bend, six lanes with painted numbers and a start line.
// Lane 1 carries your lap: from the start line, down the straight, round the
// bend, as far as your recovery score. The straights fade out, so it reads as a
// track that carries on, not a rainbow.
const C=[150,130],R0=58,LANE=12,LANES=6,START=330,LAP_R=R0+LANE/2;
const laneLine=r=>`M400,${C[1]+r} H${C[0]} A${r},${r} 0 0 1 ${C[0]},${C[1]-r} H400`;
const lapPath=`M${START},${C[1]+LAP_R} H${C[0]} A${LAP_R},${LAP_R} 0 0 1 ${C[0]},${C[1]-LAP_R} H400`;
function lapPoint(t){
 const a=START-C[0],arc=Math.PI*LAP_R,b=400-C[0],total=a+arc+b;let s=Math.max(0,Math.min(1,t))*total;
 if(s<=a)return [START-s,C[1]+LAP_R];s-=a;
 if(s<=arc){const ang=Math.PI/2+s/LAP_R;return [C[0]+LAP_R*Math.cos(ang),C[1]+LAP_R*Math.sin(ang)];}s-=arc;
 return [C[0]+s,C[1]-LAP_R];
}
let trackId=0;
export function Bend({progress=0,score,className='',numbers=true}){
 const [x,y]=lapPoint(progress/100);
 const [id]=useState(()=>`fade${++trackId}`);
 return <svg className={`bend ${className}`} viewBox="0 0 400 260" aria-hidden="true">
  <defs><linearGradient id={id} x1="0" x2="1" y1="0" y2="0"><stop offset=".55" stopColor="#fff"/><stop offset="1" stopColor="#fff" stopOpacity="0"/></linearGradient><mask id={`${id}m`}><rect width="400" height="260" fill={`url(#${id})`}/></mask></defs>
  <g mask={`url(#${id}m)`}>
   {Array.from({length:LANES+1},(_,i)=><path key={i} d={laneLine(R0+i*LANE)} className="bend-lane"/>)}
   <line x1={START} x2={START} y1={C[1]+R0} y2={C[1]+R0+LANES*LANE} className="bend-start"/>
   {numbers&&Array.from({length:LANES},(_,i)=><text key={i} x={START+18} y={C[1]+R0+i*LANE+LANE/2+3.5} className="bend-num">{i+1}</text>)}
   <path d={lapPath} className="bend-lap" pathLength="100" strokeDasharray={`${progress} 100`}/>
  </g>
  {score!=null&&<circle cx={x} cy={y} r="7" className="bend-runner"/>}
 </svg>;
}

// The week as a Swiss bar chart: hairline outline = planned, solid = run.
export function WeekBars({days,todayKey,onPick}){
 const max=Math.max(12,...days.map(d=>Math.max(d.plannedKm||0,d.km||0)));
 return <div className="week-bars" role="group" aria-label="This week, planned and run distance per day">
  {days.map(d=>{const plan=d.plannedKm||0,ran=d.km||0,v=ran||plan;return <button key={d.key} type="button" className={`wb-day wb-${d.effort||'easy'}${d.key===todayKey?' is-today':''}${ran?' is-run':''}`} onClick={()=>onPick?.(d)} aria-label={d.aria}>
   <span className="wb-val">{v?(Math.round(v*10)/10).toString():d.strength?'Gym':'–'}</span>
   <span className="wb-col">
    {plan>0&&<i className="wb-plan" style={{height:`${plan/max*100}%`}}/>}
    {ran>0&&<i className="wb-run" style={{height:`${ran/max*100}%`}}/>}
    {!plan&&!ran&&d.strength&&<i className="wb-gym"/>}
   </span>
   <span className="wb-day-label"><small>{d.short}</small><b>{d.date}</b></span>
  </button>;})}
 </div>;
}

// Any series as a profile: elevation silhouette with an optional line on top,
// with a finger-following scrubber.
export function Profile({fill=[],line=[],height=180,format,invert=false,onScrub}){
 const ref=useRef(null),[at,setAt]=useState(null);
 const VW=400,VH=height,n=Math.max(fill.length,line.length);
 if(n<2)return null;
 const scale=(arr,top,bottom,inv)=>{const v=arr.filter(Number.isFinite);if(!v.length)return null;const lo=Math.min(...v),hi=Math.max(...v),span=hi-lo||1;return arr.map((y,i)=>[i/(arr.length-1)*VW,Number.isFinite(y)?(inv?top+(y-lo)/span*(bottom-top):bottom-(y-lo)/span*(bottom-top)):bottom]);};
 const win=Math.max(1,Math.round(line.length/90)),avg=line.map((_,i)=>{let s=0,c=0;for(let j=Math.max(0,i-win);j<=Math.min(line.length-1,i+win);j++)if(Number.isFinite(line[j])){s+=line[j];c++;}return c?s/c:NaN;});
 const f=fill.length>1?scale(fill,VH*.4,VH-4):null,l=avg.length>1?scale(avg,VH*.08,VH*.62,invert)?.map(([x,y])=>[20+x*(VW-40)/VW,y]):null;
 const move=e=>{const r=ref.current?.getBoundingClientRect();if(!r)return;const x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));const i=Math.round(x*(n-1));setAt(i);onScrub?.(i);};
 return <div className="profile" ref={ref} onPointerMove={move} onPointerDown={move} onPointerLeave={()=>setAt(null)} style={{'--h':`${VH}px`}}>
  <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" aria-hidden="true">
   {f&&<path className="profile-fill" d={smooth(f.filter((_,i)=>i%Math.ceil(f.length/160)===0||i===f.length-1))+` L${VW},${VH} L0,${VH}Z`}/>}
   {l&&<path className="profile-line" d={smooth(l.filter((_,i)=>i%Math.ceil(l.length/200)===0||i===l.length-1))} vectorEffect="non-scaling-stroke"/>}
   {at!=null&&<line x1={at/(n-1)*VW} x2={at/(n-1)*VW} y1="0" y2={VH} className="profile-cursor" vectorEffect="non-scaling-stroke"/>}
  </svg>
  {at!=null&&format&&<div className="profile-read" style={{left:`${Math.min(70,Math.max(2,at/(n-1)*100-12))}%`}}>{format(at)}</div>}
 </div>;
}

// Small sparkline for trends (predictor, form).
export function Spark({values,height=44,goal=null,invert=false}){
 const v=values.filter(Number.isFinite);if(v.length<2)return null;
 const all=goal!=null?[...v,goal]:v,lo=Math.min(...all),hi=Math.max(...all),span=hi-lo||1;
 const y=x=>invert?4+(x-lo)/span*(height-8):height-4-(x-lo)/span*(height-8);
 const pts=values.map((x,i)=>[i/(values.length-1)*200,Number.isFinite(x)?y(x):NaN]).filter(p=>Number.isFinite(p[1]));
 return <svg className="spark" viewBox={`0 0 200 ${height}`} preserveAspectRatio="none" aria-hidden="true">
  {goal!=null&&<line x1="0" x2="200" y1={y(goal)} y2={y(goal)} className="spark-goal" vectorEffect="non-scaling-stroke"/>}
  <path d={smooth(pts)} className="spark-line" vectorEffect="non-scaling-stroke"/>
  <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="3.5" className="spark-dot"/>
 </svg>;
}

export function useInterval(fn,ms,active){
 const ref=useRef(fn);ref.current=fn;
 useEffect(()=>{if(!active)return;const id=setInterval(()=>ref.current(),ms);return()=>clearInterval(id);},[ms,active]);
}
