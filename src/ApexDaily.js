// APEX · Daily. The all-day tracker: steps against your goal, active calories, heart rate hour by hour,
// resting heart rate, exercise minutes or WHOOP strain, and the last two weeks.
import {useState} from 'react';
import {Icon} from './ApexUI';
import {DAILY_NAMES,ymd} from './dailyActivity';
import {HAS_HEALTH} from './native';
import {available,connectSource,SOURCES} from './recoverySources';
import {PREVIEW} from './ApexPreview';

export const STEP_GOAL=10000;
const n=v=>Number.isFinite(v)?Math.round(v).toLocaleString('en-GB'):'—';
const hourLabel=h=>h===0?'12am':h<12?`${h}am`:h===12?'12pm':`${h-12}pm`;
export const stepGoalOf=userPrefs=>Number(userPrefs?.settings?.stepGoal)||STEP_GOAL;

// Steps as a lap of the track: the ring fills towards your goal.
function StepRing({steps,goal,distanceM}){
 const p=Math.min(1,(steps||0)/goal),r=52,c=2*Math.PI*r;
 return <div className="dy-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r={r} className="dy-ring-track"/><circle cx="60" cy="60" r={r} className="dy-ring-fill" strokeDasharray={`${p*c} ${c}`} transform="rotate(-90 60 60)"/></svg>
  <div><strong>{n(steps)}</strong><span>of {n(goal)} steps</span>{Number.isFinite(distanceM)&&<em>{(distanceM/1000).toFixed(1)} km on foot</em>}</div></div>;
}

// Each hour: a bar from lowest to highest heart rate, the line joins the averages. The run stands out.
function HeartDay({hours}){
 const rows=hours.filter(x=>Number.isFinite(x.avgHr));
 if(rows.length<2)return null;
 const lo=Math.max(30,Math.min(...rows.map(x=>x.minHr??x.avgHr))-5),hi=Math.max(...rows.map(x=>x.maxHr??x.avgHr))+5,H=150,w=360/24;
 const y=v=>H-(v-lo)/Math.max(1,hi-lo)*(H-10)-4,x=h=>h*w+w/2;
 const line=rows.map((r,i)=>`${i?'L':'M'}${x(r.h).toFixed(1)} ${y(r.avgHr).toFixed(1)}`).join(' ');
 const peak=rows.reduce((a,b)=>(b.maxHr??0)>(a.maxHr??0)?b:a);
 const avg=Math.round(rows.reduce((s,r)=>s+r.avgHr,0)/rows.length);
 return <section className="dy-chart"><div className="section-label"><div><span className="eyebrow">Heart rate</span><h2>Through the day</h2></div><p><strong>{avg}</strong> bpm average · peak {n(peak.maxHr)} at {hourLabel(peak.h)}</p></div>
  <svg viewBox={`0 0 360 ${H}`} preserveAspectRatio="none" role="img" aria-label={`Heart rate today: ${avg} bpm average, peaking at ${n(peak.maxHr)} around ${hourLabel(peak.h)}`}>
   {rows.map(r=>Number.isFinite(r.minHr)&&Number.isFinite(r.maxHr)&&<rect key={r.h} x={x(r.h)-w*.3} width={w*.6} y={y(r.maxHr)} height={Math.max(2,y(r.minHr)-y(r.maxHr))} rx={w*.3} className={r===peak?'dy-band is-peak':'dy-band'}/>)}
   <path d={line} className="dy-line"/>
  </svg>
  <div className="dy-axis"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>12am</span></div></section>;
}

function StepsDay({hours}){
 const rows=hours.filter(x=>Number.isFinite(x.steps));
 if(!rows.some(r=>r.steps>0))return null;
 const max=Math.max(...rows.map(r=>r.steps)),H=90,w=360/24,best=rows.reduce((a,b)=>b.steps>a.steps?b:a);
 return <section className="dy-chart"><div className="section-label"><div><span className="eyebrow">Steps</span><h2>Hour by hour</h2></div><p>Busiest hour {hourLabel(best.h)} · <strong>{n(best.steps)}</strong></p></div>
  <svg viewBox={`0 0 360 ${H}`} preserveAspectRatio="none" role="img" aria-label={`Steps by hour today. Busiest hour ${hourLabel(best.h)} with ${n(best.steps)} steps.`}>
   {rows.map(r=>{const h=r.steps/max*(H-6);return <rect key={r.h} x={r.h*w+w*.18} width={w*.64} y={H-h} height={Math.max(h,r.steps?2:0)} rx="2" className="dy-bar"/>;})}
  </svg>
  <div className="dy-axis"><span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>12am</span></div></section>;
}

const METRICS={steps:['Steps','steps',''],activeKcal:['Calories','active kcal',''],avgHr:['Avg HR','bpm average',''],restingHr:['Resting HR','bpm resting',''],exerciseMin:['Exercise','minutes',''],strain:['Strain','strain','.1']};
function Fortnight({days,goal}){
 const keys=Object.keys(METRICS).filter(k=>days.some(d=>Number.isFinite(d[k])));
 const [pick,setPick]=useState(null),k=keys.includes(pick)?pick:keys[0];
 if(!k)return null;
 const rows=days.slice(0,14).reverse(),vals=rows.map(d=>d[k]).filter(Number.isFinite),max=Math.max(...vals,k==='steps'?goal:0)*1.08,H=130,w=360/rows.length;
 const avg=vals.reduce((a,b)=>a+b,0)/vals.length,today=ymd(new Date()),fmt=v=>METRICS[k][2]?Number(v).toFixed(1):n(v);
 const low=k==='avgHr'||k==='restingHr'?Math.min(...vals)*.85:0,yv=v=>H-(v-low)/Math.max(1,max-low)*(H-8);
 return <section className="dy-chart"><div className="section-label"><div><span className="eyebrow">Two weeks</span><h2>{METRICS[k][0]}</h2></div><p>Average <strong>{fmt(avg)}</strong> {METRICS[k][1]}</p></div>
  {keys.length>1&&<div className="range-control">{keys.map(x=><button key={x} className={x===k?'active':''} aria-pressed={x===k} onClick={()=>setPick(x)}>{METRICS[x][0]}</button>)}</div>}
  <svg viewBox={`0 0 360 ${H}`} preserveAspectRatio="none" role="img" aria-label={`${METRICS[k][0]} over the last ${rows.length} days, averaging ${fmt(avg)}`}>
   {rows.map((d,i)=>Number.isFinite(d[k])&&<rect key={d.day} x={i*w+w*.16} width={w*.68} y={yv(d[k])} height={H-yv(d[k])} rx="2" className={d.day===today?'dy-bar is-today':k==='steps'&&d[k]>=goal?'dy-bar is-goal':'dy-bar'}/>)}
   {k==='steps'&&<line x1="0" x2="360" y1={yv(goal)} y2={yv(goal)} className="dy-goal"/>}
  </svg>
  <div className="dy-axis"><span>{new Date(rows[0].day+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span><span>{k==='steps'?`Dashed line is your ${n(goal)} goal`:''}</span><span>Today</span></div></section>;
}

function GoalEdit({goal,onSave}){
 const [edit,setEdit]=useState(false),[v,setV]=useState(String(goal));
 if(!edit)return <button className="text-button dy-goal-btn" onClick={()=>{setV(String(goal));setEdit(true);}}>Step goal {n(goal)}</button>;
 const save=e=>{e.preventDefault();const x=parseInt(v.replace(/\D/g,''),10);if(x>=1000&&x<=100000)onSave(x);setEdit(false);};
 return <form className="dy-goal-form" onSubmit={save}><label>Daily step goal<input inputMode="numeric" autoFocus value={v} onChange={e=>setV(e.target.value)}/></label><button className="secondary-action set-small-btn">Save</button></form>;
}

export default function Daily({daily,loading,userPrefs,onSavePrefs}){
 const goal=stepGoalOf(userPrefs);
 const saveGoal=g=>onSavePrefs?.({...userPrefs,settings:{...(userPrefs?.settings||{}),stepGoal:g}});
 if(!daily){
  if(loading)return <p className="form-note">Loading today…</p>;
  const opts=[...(HAS_HEALTH?['health']:[]),...available().filter(k=>k==='oura'||k==='whoop')];
  return <section className="recovery-connect"><div><span className="eyebrow">Nothing connected yet</span><h2>Track the whole day.</h2><p>Steps, calories and heart rate from morning to night. {HAS_HEALTH?'Apple Health works with your iPhone and Apple Watch.':'Connect Oura or WHOOP, or use the Apex iPhone app for Apple Health.'}</p>
   <div className="source-buttons">{opts.map((k,i)=><button key={k} className={i?'secondary-action':'primary-action'} onClick={()=>{if(!PREVIEW)Promise.resolve(connectSource(k)).catch(()=>{});}}>Connect {SOURCES[k]} <Icon name="arrow"/></button>)}</div></div></section>;
 }
 const t=daily.days.find(d=>d.day===ymd(new Date()))||{},hours=daily.hours||[],hasSteps=daily.days.some(d=>Number.isFinite(d.steps));
 const tiles=[
  ['Active calories',n(t.activeKcal),'kcal'],
  ['Avg heart rate',n(t.avgHr),'bpm',Number.isFinite(t.minHr)?`${t.minHr}–${t.maxHr} today`:null],
  ['Resting HR',n(t.restingHr),'bpm'],
  Number.isFinite(t.strain)?['Strain',Number(t.strain).toFixed(1),'/ 21']:['Exercise',n(t.exerciseMin),'min'],
 ];
 return <div className="daily-page">
  <section className="dy-hero">
   {hasSteps?<StepRing steps={t.steps} goal={goal} distanceM={t.distanceM}/>:<div className="dy-ring is-strain"><div><strong>{Number.isFinite(t.strain)?Number(t.strain).toFixed(1):'—'}</strong><span>strain today</span></div></div>}
   <div className="dy-tiles">{tiles.map(([label,value,unit,note])=><div key={label} className="dy-tile"><span>{label}</span><strong>{value}<small> {unit}</small></strong>{note&&<p>{note}</p>}</div>)}</div>
  </section>
  <p className="form-note dy-source">From {DAILY_NAMES[daily.source]}{daily.source==='whoop'?'. WHOOP doesn’t share steps, so you see strain instead.':'.'} Pull down to refresh.{hasSteps&&onSavePrefs&&<> <GoalEdit goal={goal} onSave={saveGoal}/></>}</p>
  <HeartDay hours={hours}/>
  <StepsDay hours={hours}/>
  <Fortnight days={daily.days} goal={goal}/>
 </div>;
}

// Today screen: one line with the day so far.
export function DailyStrip({daily,userPrefs,nav}){
 const t=daily?.days?.find(d=>d.day===ymd(new Date()));
 if(!t)return null;
 const goal=stepGoalOf(userPrefs),steps=Number.isFinite(t.steps);
 return <button className="race-strip" onClick={()=>nav('daily')}><span className="label">Today</span><span><b>{steps?`${n(t.steps)} steps`:`Strain ${Number.isFinite(t.strain)?Number(t.strain).toFixed(1):'—'}`}</b><small>{[Number.isFinite(t.activeKcal)&&`${n(t.activeKcal)} kcal`,Number.isFinite(t.avgHr)&&`${t.avgHr} bpm avg`,Number.isFinite(t.restingHr)&&`${t.restingHr} resting`].filter(Boolean).join(' · ')||'Your day so far'}</small></span>{steps&&<strong>{Math.min(999,Math.round(t.steps/goal*100))}<small>%</small></strong>}</button>;
}
