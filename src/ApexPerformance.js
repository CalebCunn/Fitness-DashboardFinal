// APEX · Performance: fitness, fatigue and form, race predictions, the PB wall,
// shoe mileage and a shareable weekly recap. Everything is computed on the device
// from Strava activities (plus WHOOP resting HR when available).
import {useEffect,useMemo,useState} from 'react';
import {getActivity} from './strava';
import {PREVIEW} from './ApexPreview';
import {Icon} from './ApexUI';
import {Spark,smooth} from './ApexTrack';
import {focusRace,raceDate} from './ApexGoals';
import {localDate,addDays,mondayOf} from './apexDates';
import {readSettings,heartRate,PB_DISTANCES} from './ApexSettings';
import {PaceBand,drawTrack} from './ApexPoster';
import {allShoes,shoeStats} from './ApexShoes';

export const isRun=a=>a.type==='Run'||a.sport_type==='Run'||a.sport_type==='TrailRun';
const day=a=>(a.start_date_local||a.start_date||'').slice(0,10);
export const clock=s=>{if(!Number.isFinite(s))return '—';s=Math.round(s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`:`${m}:${String(x).padStart(2,'0')}`;};
const pacePer=(secs,m)=>{const v=Math.round(secs/(m/1000));return `${Math.floor(v/60)}:${String(v%60).padStart(2,'0')}`;};

// ── Training load ──
// Load per activity: Strava relative effort when present, otherwise Banister
// TRIMP from heart rate, otherwise a time-based estimate.
function loadOf(a,restHr,maxHr){
 if(Number.isFinite(a.suffer_score)&&a.suffer_score>0)return a.suffer_score;
 const mins=(a.moving_time||0)/60;
 if(a.average_heartrate&&maxHr&&restHr&&maxHr>restHr){const r=Math.max(0,Math.min(1,(a.average_heartrate-restHr)/(maxHr-restHr)));return mins*r*0.64*Math.exp(1.92*r);}
 return mins*(isRun(a)?0.9:0.55);
}

export function formSeries(acts,{restHr,maxHr,days=84}={}){
 const today=localDate(new Date()),loads={};
 const peak=maxHr||Math.max(0,...acts.map(a=>a.max_heartrate||0))||null;
 acts.forEach(a=>{const k=day(a);if(k)loads[k]=(loads[k]||0)+loadOf(a,restHr,peak);});
 const first=Object.keys(loads).sort()[0]||today;
 // Seed both averages with the mean daily load of the first 6 weeks, so a short
 // history doesn't read as a sudden spike of fatigue.
 let seed=0,n=0;for(let k=first;k<=today&&n<42;k=addDays(k,1),n++)seed+=loads[k]||0;seed=n?seed/n:0;
 let ctl=seed,atl=seed;const out=[];
 for(let k=first;k<=today;k=addDays(k,1)){
  const tsb=ctl-atl;// form uses yesterday's numbers, before today's session
  const l=loads[k]||0;ctl+=(l-ctl)/42;atl+=(l-atl)/7;
  out.push({key:k,load:l,ctl,atl,tsb});
 }
 return {series:out.slice(-days),warm:out.length<42,ready:out.length>=21};
}

export function formLabel(tsb){
 if(tsb>=15)return {key:'peak',label:'Very fresh',line:'Rested enough to race. Much longer like this and fitness starts to fade.'};
 if(tsb>=5)return {key:'fresh',label:'Fresh',line:'Fatigue is below fitness. A good day for something hard, or a race.'};
 if(tsb>=-10)return {key:'neutral',label:'Balanced',line:'Training and recovery are in step.'};
 if(tsb>=-30)return {key:'build',label:'Building',line:'Productive fatigue. Keep easy days easy and sleep well.'};
 return {key:'over',label:'Overreaching',line:'Fatigue is well above fitness. Back off before it costs you.'};
}

// ── Predictions (Riegel, exponent 1.06) ──
export const DISTANCES=[['5K',5000],['10K',10000],['Half',21097.5],['Marathon',42195]];
const riegel=(t,d1,d2)=>t*Math.pow(d2/d1,1.06);

function effortSources(acts,efforts,fromKey,toKey){
 const src=[];
 acts.forEach(a=>{const k=day(a);if(!isRun(a)||k<fromKey||k>toKey||!(a.distance>=3000)||!a.moving_time)return;src.push({d:a.distance,t:a.moving_time,label:`${a.name}, ${new Date(k+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`});});
 Object.values(efforts||{}).forEach(e=>{if(e.date<fromKey||e.date>toKey)return;(e.efforts||[]).forEach(x=>{if(x.distance>=1500&&x.moving_time)src.push({d:x.distance,t:x.moving_time,label:`${x.name} in ${e.name}, ${new Date(e.date+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`});});});
 return src;
}
function bestPrediction(src,target,withSource){let best=null,from=null;src.forEach(s=>{const p=riegel(s.t,s.d,target);if(!best||p<best){best=p;from=s;}});return withSource?{time:best,from}:best;}

export function predictions(acts,efforts,weeks=8,manual=[]){
 const today=localDate(new Date()),from=addDays(today,-7*weeks);
 const manualSrc=manual.filter(p=>p.date&&p.date>=from).map(p=>({d:(PB_DISTANCES.find(d=>d[0]===p.dist)||[])[1],t:p.time,label:`${p.dist} PB${p.race?` at ${p.race}`:''}`})).filter(x=>x.d);
 const src=[...effortSources(acts,efforts,from,today),...manualSrc];
 const now=Object.fromEntries(DISTANCES.map(([k,d])=>[k,bestPrediction(src,d)]));
 const basis=bestPrediction(src,42195,true).from;
 const trend=Array.from({length:12},(_,i)=>{const end=addDays(today,-7*(11-i));return bestPrediction(effortSources(acts,efforts,addDays(end,-7*weeks),end),42195);});
 return {now,trend,sources:src.length,basis};
}

export function parseTarget(text){
 const m=(text||'').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);if(!m)return null;
 return m[3]!=null?(+m[1])*3600+(+m[2])*60+(+m[3]):(+m[1])*3600+(+m[2])*60;
}

// ── Best efforts cache (filled from detailed activities) ──
const KEY='apex-efforts-v1';
export function loadEfforts(){try{return JSON.parse(localStorage.getItem(KEY))||{};}catch{return {};}}
export function rememberEfforts(a){
 if(!a?.id||!isRun(a)||!Array.isArray(a.best_efforts))return;
 try{const all=loadEfforts();all[a.id]={date:day(a),name:a.name,efforts:a.best_efforts.map(e=>({name:e.name,distance:e.distance,moving_time:e.moving_time||e.elapsed_time}))};localStorage.setItem(KEY,JSON.stringify(all));}catch{}
}
const WALL=[['1K',['1k','1K']],['1 mile',['1 mile']],['5K',['5k','5K']],['10K',['10k','10K']],['Half',['Half-Marathon','half-marathon']],['Marathon',['Marathon','marathon']]];
export function pbWall(efforts,manual=[]){
 return WALL.map(([label,names])=>{let best=null;Object.entries(efforts).forEach(([id,e])=>(e.efforts||[]).forEach(x=>{if(names.includes(x.name)&&x.moving_time&&(!best||x.moving_time<best.time))best={time:x.moving_time,date:e.date,run:e.name,id:+id};}));manual.filter(p=>p.dist===label).forEach(p=>{if(!best||p.time<best.time)best={time:p.time,date:p.date,run:p.race||'Entered by you',manual:true};});return {label,best};});
}

// ── Shoes ──
export function shoeState(km,limit=800){
 if(km>=limit)return [`Past ${limit} km`,'retire'];
 if(km>=limit*.8)return ['Retire soon','warn'];
 if(km>=150)return ['In its prime','prime'];
 return ['Breaking in','new'];
}

// ── Weekly recap card, drawn on a canvas so it can be shared as an image ──
async function drawRecap(stats,accent='#1C3BDB'){
 const SANS='"Instrument Sans", -apple-system, Helvetica, sans-serif',SERIF='"Instrument Serif", Georgia, serif';
 const c=document.createElement('canvas');c.width=1080;c.height=1350;const g=c.getContext('2d');
 try{await Promise.all([document.fonts?.load(`400 200px ${SANS}`),document.fonts?.load(`italic 400 80px ${SERIF}`)]);}catch{}
 g.fillStyle=accent;g.fillRect(0,0,1080,1350);
 drawTrack(g,0,880,1080,{alpha:.28});
 g.fillStyle='#fff';g.font=`500 28px ${SANS}`;g.fillText('THE WEEK · APEX',72,92);g.fillText(stats.range.toUpperCase(),640,92);
 g.fillStyle='rgba(255,255,255,.6)';g.fillRect(72,52,936,2);
 g.fillStyle='#fff';g.font=`400 330px ${SANS}`;g.fillText(stats.km,60,470);
 g.font=`italic 400 90px ${SERIF}`;g.fillText('kilometres this week',72,580);
 const rows=[['Runs',stats.runs],['Time',stats.time],['Longest',stats.longest],['Form',stats.form],['Marathon',stats.marathon]];
 rows.forEach(([k,v],i)=>{const y=720+i*110;g.fillStyle='rgba(255,255,255,.6)';g.fillRect(72,y,936,2);g.fillStyle='rgba(255,255,255,.8)';g.font=`500 28px ${SANS}`;g.fillText(k.toUpperCase(),72,y+62);g.fillStyle='#fff';g.font=`400 64px ${SANS}`;g.textAlign='right';g.fillText(v,1008,y+74);g.textAlign='left';});
 return new Promise(r=>c.toBlob(r,'image/png'));
}

function weekStats(acts,form,pred){
 const today=localDate(new Date()),mon=mondayOf(today),runs=acts.filter(a=>isRun(a)&&day(a)>=mon&&day(a)<=today);
 const km=runs.reduce((s,a)=>s+(a.distance||0),0)/1000,time=runs.reduce((s,a)=>s+(a.moving_time||0),0),longest=Math.max(0,...runs.map(a=>a.distance||0))/1000;
 const tsb=form.series[form.series.length-1]?.tsb;
 return {km:km.toFixed(1),runs:String(runs.length),time:clock(time),longest:`${longest.toFixed(1)} km`,form:tsb==null||!form.ready?'—':`${tsb>=0?'+':''}${Math.round(tsb)} ${formLabel(tsb).label}`,marathon:pred.now.Marathon?clock(pred.now.Marathon):'—',range:`${new Date(mon+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${new Date(today+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`};
}

// Hook shared by Today and Performance so both read the same numbers.
export function usePerformance(acts,whoop,settings){
 const hr=heartRate(settings,acts,whoop),restHr=hr.rest,maxHr=hr.max,weeks=settings?.predictor?.weeks||8,manual=settings?.pbs||[];
 const [efforts,setEfforts]=useState(()=>PREVIEW?previewEfforts(acts):loadEfforts());
 useEffect(()=>{const sync=()=>setEfforts(PREVIEW?previewEfforts(acts):loadEfforts());sync();window.addEventListener('apex-efforts',sync);return()=>window.removeEventListener('apex-efforts',sync);},[acts]);
 const form=useMemo(()=>formSeries(acts,{restHr,maxHr}),[acts,restHr,maxHr]);
 const pred=useMemo(()=>predictions(acts,efforts,weeks,manual),[acts,efforts,weeks,manual]);
 return {form,pred,efforts,setEfforts,restHr};
}

function previewEfforts(acts){
 const out={};acts.filter(a=>isRun(a)&&a.distance>=5000).forEach((a,i)=>{const p=a.moving_time/a.distance;out[a.id]={date:day(a),name:a.name,efforts:[{name:'1k',distance:1000,moving_time:Math.round(p*1000*.86)},{name:'1 mile',distance:1609,moving_time:Math.round(p*1609*.88)},{name:'5k',distance:5000,moving_time:Math.round(p*5000*.93)},...(a.distance>=10000?[{name:'10k',distance:10000,moving_time:Math.round(p*10000*.96)}]:[]),...(a.distance>=21097?[{name:'Half-Marathon',distance:21097,moving_time:Math.round(p*21097*.99)}]:[])]};});
 return out;
}

const ZONES_FORM=[['over','Too much',-60,-30],['build','Building',-30,-10],['neutral','Balanced',-10,5],['fresh','Fresh',5,15],['peak','Race-ready',15,40]];
const sign=v=>`${v>=0?'+':'−'}${Math.abs(Math.round(v))}`;
const shortDate=k=>new Date(k+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'});

// Where today's form sits, on a labelled scale from overreaching to race-ready.
function FormScale({tsb}){
 const lo=-45,hi=30,pos=v=>(Math.max(lo,Math.min(hi,v))-lo)/(hi-lo)*100;
 return <div className="form-scale" aria-label={`Form ${sign(tsb)}, on a scale from overreaching to race-ready`}>
  <div className="fs-bar">{ZONES_FORM.map(([k,l,a,b])=><span key={k} className={`fs-${k}`} style={{left:`${pos(a)}%`,width:`${pos(b)-pos(a)}%`}}/>)}<i style={{left:`${pos(tsb)}%`}}><b>{sign(tsb)}</b></i></div>
  <div className="fs-labels">{ZONES_FORM.map(([k,l,a,b])=><span key={k} style={{left:`${(pos(a)+pos(b))/2}%`}}>{l}</span>)}</div>
  <div className="fs-ticks">{[-30,-10,0,5,15].filter(v=>Math.abs(v-tsb)>3).map(v=><span key={v} style={{left:`${pos(v)}%`}}>{v>0?`+${v}`:v}</span>)}</div>
 </div>;
}

// Twelve weeks of fitness and fatigue, labelled where they end, with a finger
// scrubber that reads out any day. Form is shown below as bars around zero.
function FormChart({series}){
 const [at,setAt]=useState(null);
 if(series.length<2)return null;
 const W=400,H=170,top=14,bottom=150;
 const vals=series.flatMap(s=>[s.ctl,s.atl]),vmin=Math.min(...vals),vmax=Math.max(...vals),pad=Math.max(4,(vmax-vmin)*.15),lo=Math.max(0,vmin-pad),hi=vmax+pad;
 const y=v=>bottom-(v-lo)/(hi-lo||1)*(bottom-top),x=i=>i/(series.length-1)*W;
 const step=(hi-lo)>60?20:(hi-lo)>24?10:5,grid=[];for(let v=Math.ceil(lo/step)*step;v<=hi;v+=step)grid.push(v);
 const last=series[series.length-1],cur=at!=null?series[at]:last;
 const move=e=>{const r=e.currentTarget.getBoundingClientRect();const f=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));setAt(Math.round(f*(series.length-1)));};
 const tsbMax=Math.max(10,...series.map(s=>Math.abs(s.tsb)));
 const ticks=[0,Math.round((series.length-1)/3),Math.round((series.length-1)*2/3),series.length-1];
 return <div className="fc-wrap">
  <div className="fc-grid-labels" aria-hidden="true">{grid.map(v=><span key={v} style={{top:`calc(28px + ${y(v)/H*170}px)`}}>{v}</span>)}</div>
  <div className="fc-read" aria-live="polite"><span>{at!=null?shortDate(cur.key):'Today'}</span><span><i className="k-fit"/>Fitness <b>{Math.round(cur.ctl)}</b></span><span><i className="k-fat"/>Fatigue <b>{Math.round(cur.atl)}</b></span><span>Form <b>{sign(cur.tsb)}</b></span></div>
  <svg className="form-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onPointerMove={move} onPointerDown={move} onPointerLeave={()=>setAt(null)} role="img" aria-label="Fitness and fatigue over the last 12 weeks">
   {grid.map(v=><line key={v} x1="0" x2={W} y1={y(v)} y2={y(v)} className="fc-grid" vectorEffect="non-scaling-stroke"/>)}
   <path className="fc-fat" d={smooth(series.map((s,i)=>[x(i),y(s.atl)]))} vectorEffect="non-scaling-stroke"/>
   <path className="fc-fit" d={smooth(series.map((s,i)=>[x(i),y(s.ctl)]))} vectorEffect="non-scaling-stroke"/>
   {at!=null&&<line x1={x(at)} x2={x(at)} y1={top} y2={bottom} className="fc-cursor" vectorEffect="non-scaling-stroke"/>}
  </svg>
  <div className="fc-axis">{ticks.map(i=><span key={i} style={{left:`${x(i)/W*100}%`}}>{i===series.length-1?'Today':shortDate(series[i].key)}</span>)}</div>
  <div className="fc-form"><span className="fc-form-label">Form<small>↑ fresher · ↓ tired</small></span>
   <svg viewBox={`0 0 ${W} 60`} preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2={W} y1="30" y2="30" className="fc-zero" vectorEffect="non-scaling-stroke"/>{series.map((s,i)=>{const h=s.tsb/tsbMax*26;return <rect key={s.key} x={x(i)-1.2} width="2.4" y={h>=0?30-h:30} height={Math.abs(h)} className={h>=0?'fc-form-pos':'fc-form-neg'}/>;})}</svg>
  </div>
 </div>;
}

export default function Performance({acts=[],gear=[],whoop,userPrefs,nav}){
 const settings=readSettings(userPrefs),accent=getComputedStyle(document.querySelector('.apex-app')||document.body).getPropertyValue('--accent').trim()||'#1C3BDB';
 const {form,pred,efforts,setEfforts}=usePerformance(acts,whoop,settings);
 const [scan,setScan]=useState(null),[shareNote,setShareNote]=useState('');
 const last=form.ready?form.series[form.series.length-1]:null,fl=last?formLabel(last.tsb):null;
 const goal=focusRace(userPrefs?.races),goalSecs=parseTarget(goal?.target),goalDist=(parseFloat(goal?.distance)||42.195)*1000;
 const goalPred=pred.now.Marathon&&goal?pred.now.Marathon*Math.pow(goalDist/42195,1.06):null;
 const gap=goalSecs&&goalPred?goalPred-goalSecs:null;
 const wall=pbWall(efforts,settings.pbs);
 const shoeList=shoeStats(allShoes(gear,settings),acts,settings).filter(s=>!s.retired).sort((a,b)=>b.km-a.km);
 const runs=acts.filter(isRun).sort((a,b)=>new Date(b.start_date_local||b.start_date)-new Date(a.start_date_local||a.start_date));
 const unscanned=runs.filter(a=>!efforts[a.id]&&a.distance>=1000);
 const runScan=async()=>{
  if(PREVIEW){setScan({done:0,total:0,msg:'Scanning works with your live Strava data.'});return;}
  const batch=unscanned.slice(0,20);setScan({done:0,total:batch.length});
  for(let i=0;i<batch.length;i++){try{const a=await getActivity(batch[i].id);rememberEfforts(a);}catch(e){setScan({done:i,total:batch.length,msg:'Strava stopped the scan (rate limit). Try again in 15 minutes.'});break;}setScan({done:i+1,total:batch.length});await new Promise(r=>setTimeout(r,350));}
  setEfforts(loadEfforts());window.dispatchEvent(new Event('apex-efforts'));
 };
 const share=async()=>{
  setShareNote('');const blob=await drawRecap(weekStats(acts,form,pred),accent);if(!blob){setShareNote('The card could not be drawn on this device.');return;}
  const file=new File([blob],'apex-week.png',{type:'image/png'});
  try{if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:'My week on APEX'});return;}}catch(e){if(e?.name==='AbortError')return;}
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='apex-week.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);setShareNote('Saved as apex-week.png.');
 };
 return <div className="performance-page">
  <section className="perf-form" aria-labelledby="form-title">
   <div className="section-head"><h2 id="form-title">Form</h2><span className="meta">Fitness minus fatigue</span></div>
   {last?<>
    <div className="form-hero"><span className={`form-tag form-${fl.key}`}><b>{sign(last.tsb)}</b></span><div><strong>{fl.label}</strong><p>{fl.line}</p></div></div>
    <FormScale tsb={last.tsb}/>
    <dl className="form-explain">
     <div><dt><i className="k-fit"/>Fitness</dt><dd><b>{Math.round(last.ctl)}</b><span>Your average daily training load over the last 6 weeks. It climbs slowly with consistent training: higher means fitter.</span></dd></div>
     <div><dt><i className="k-fat"/>Fatigue</dt><dd><b>{Math.round(last.atl)}</b><span>Your average daily load over the last 7 days. It jumps after hard days and drops quickly when you rest.</span></dd></div>
     <div><dt>Form</dt><dd><b>{sign(last.tsb)}</b><span>{Math.round(last.ctl)} fitness − {Math.round(last.atl)} fatigue. Negative means you’re carrying more recent work than your body is used to; positive means you’re fresh.</span></dd></div>
    </dl>
    <h3 className="fc-title">Last 12 weeks</h3>
    <FormChart series={form.series}/>
    <div className="form-guide"><span className="label">How to use it</span><p><b>Race week:</b> aim for +5 to +15, fresh but still fit.</p><p><b>Training block:</b> −10 to −30 is normal; that’s productive fatigue.</p><p><b>Below −30 for more than a week:</b> ease off; injury and illness risk climb.</p></div>
    <p className="form-note">Load for each activity comes from Strava’s relative effort, or from heart rate and time when that’s missing. One easy hour is roughly 40 to 60 load.{form.warm?' Fewer than 6 weeks of activities are loaded, so fitness is still settling.':''}</p>
   </>:<div className="form-empty"><strong>Warming up</strong><p>Form appears once three weeks of activities have synced.</p></div>}
  </section>

  <section className="perf-predict" aria-labelledby="pred-title">
   <div className="section-head"><h2 id="pred-title">Race predictor</h2><span className="meta">Last {settings.predictor.weeks} weeks</span></div>
   <div className="predict-board">{DISTANCES.map(([k,d])=>{const g=settings.goals[k],gp=g&&pred.now[k]?pred.now[k]-g:null;return <div key={k} className={k==='Marathon'?'is-key':''}><small>{k}</small><b>{pred.now[k]?clock(pred.now[k]):'—'}</b><em>{gp!=null?(gp<=0?`Goal ${clock(g)} · on track`:`Goal ${clock(g)} · ${clock(gp)} off`):pred.now[k]?`${pacePer(pred.now[k],d)} /km`:''}</em></div>;})}</div>
   {goal&&<div className="goal-strip"><div><small>{goal.name}{goal.target?` · ${goal.target}`:''}</small><b>{gap==null?'Set a target time on the race to see the gap.':gap<=0?`On track · ${clock(-gap)} inside target`:`${clock(gap)} to find · ${Math.round(gap/(goalDist/1000))} s/km`}</b></div>{raceDate(goal)&&<span>{Math.max(0,Math.ceil((new Date(goal.date+'T12:00:00')-new Date())/86400000))}<small>days</small></span>}</div>}
   <div className="predict-trend"><small>Marathon prediction, 12 weeks</small><Spark values={pred.trend} goal={goalSecs&&goalDist===42195?goalSecs:null} invert/></div>
   {pred.basis&&<p className="predict-basis">Strongest signal: <b>{pred.basis.label}</b></p>}
   <p className="form-note">Riegel’s formula on your best runs and best efforts of the last 8 weeks. It assumes the training for the distance; treat the marathon number as the ceiling of your current shape.</p>
  </section>

  <section className="perf-pbs" aria-labelledby="pb-title">
   <div className="section-head"><h2 id="pb-title">PB wall</h2>{!PREVIEW&&unscanned.length>0&&<button className="text-button" disabled={scan&&scan.done<scan.total&&!scan.msg} onClick={runScan}>{scan&&scan.done<scan.total&&!scan.msg?`Scanning ${scan.done}/${scan.total}`:`Scan ${Math.min(20,unscanned.length)} runs`}</button>}</div>
   <div className="pb-wall">{wall.map(w=><button key={w.label} className={`pb-tile${w.best?'':' is-empty'}`} disabled={!w.best} onClick={()=>w.best&&(w.best.id?nav('activity',w.best.id):nav('settings'))}><small>{w.label}</small><b>{w.best?clock(w.best.time):'—'}</b><em>{w.best?(w.best.date?new Date(w.best.date+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):w.best.run):'Not yet'}</em></button>)}</div>
   {scan?.msg&&<p className="form-note">{scan.msg}</p>}
   <p className="form-note">From Strava’s detailed runs plus any PBs you add in Customise. Every run you open is added; scanning fetches up to 20 at a time to stay inside Strava’s limits.</p>
   <button className="text-button" onClick={()=>nav('settings')}>Add a PB<Icon name="plus" size={15}/></button>
  </section>

  <PaceBand goal={goal} goals={settings.goals} accent={accent}/>

  {shoeList.length>0&&<section className="perf-shoes" aria-labelledby="shoe-title">
   <div className="section-head"><h2 id="shoe-title">Shoes</h2><button className="text-button" onClick={()=>nav('shoes')}>All shoes<Icon name="arrow" size={15}/></button></div>
   {shoeList.slice(0,3).map(g=>{const [label,tone]=shoeState(g.km,g.limit);return <button className={`shoe-row shoe-${tone}`} key={g.id} onClick={()=>nav('shoes')}><div className="shoe-top"><span><b>{g.name}</b><small>{g.role||label}</small></span><strong>{Math.round(g.km)}<small>km</small></strong></div><div className="shoe-bar"><i style={{width:`${Math.min(100,g.km/g.limit*100)}%`}}/></div></button>;})}
  </section>}

  <section className="perf-recap"><div><span className="eyebrow">This week</span><h2>Share your week</h2><p>A recap card with your kilometres, time, longest run, form and marathon prediction.</p></div><button className="primary-action" onClick={share}><Icon name="external" size={18}/>Share card</button>{shareNote&&<p className="form-note">{shareNote}</p>}</section>
 </div>;
}
