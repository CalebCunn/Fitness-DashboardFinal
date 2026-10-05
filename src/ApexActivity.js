import {useDialog} from './ApexInteractions';
import {useState,useEffect,useMemo} from 'react';
import {createPortal} from 'react-dom';
import {getActivity,getStreams} from './strava';
import {PREVIEW,previewDetail} from './ApexPreview';
import {Icon} from './ApexUI';
import {localDate} from './ApexTraining';
import {addDays,mondayOf} from './apexDates';
import {smooth,Profile} from './ApexTrack';
import {rememberEfforts} from './ApexPerformance';
import {PosterSheet} from './ApexPoster';
import {ShoePicker} from './ApexShoes';
import {dist as distU,paceOf,perUnit,unitsOf} from './ApexSettings';

const run=a=>a.type==='Run'||a.sport_type==='Run'||a.sport_type==='TrailRun';
const pace=s=>{if(!s||!Number.isFinite(s)||s<=0)return '—';const v=Math.round(1000/s);return `${Math.floor(v/60)}:${String(v%60).padStart(2,'0')}`;};
const secPace=v=>{if(!Number.isFinite(v))return '—';v=Math.round(v);return `${Math.floor(v/60)}:${String(v%60).padStart(2,'0')}`;};
const duration=s=>`${Math.floor((s||0)/3600)?Math.floor(s/3600)+'h ':''}${Math.floor((s||0)%3600/60)}m`;
const clock=s=>{s=Math.round(s||0);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`:`${m}:${String(x).padStart(2,'0')}`;};
const day=a=>(a.start_date_local||a.start_date||'').slice(0,10);
const when=a=>new Date(a.start_date_local||a.start_date);
const typeName=a=>run(a)?(a.workout_type===1?'Race':'Run'):(a.sport_type||a.type||'Session').replace(/([a-z])([A-Z])/g,'$1 $2');
const longDate=key=>new Date(key+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
const shortDate=key=>new Date(key+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});

export default function Activity({acts=[],gear=[],initialId=null,restHr=null,nav,settings,hr,userPrefs,onSavePrefs}){
 const [hover,setHover]=useState(null),[picked,setPicked]=useState(null);
 const [type,setType]=useState('all'),[query,setQuery]=useState(''),[period,setPeriod]=useState('all'),[selected,setSelected]=useState(()=>acts.find(a=>a.id===initialId)||null);
 useEffect(()=>{if(initialId){const a=acts.find(x=>x.id===initialId);if(a)setSelected(a);}},[initialId,acts]);
 const today=localDate(new Date()),start=addDays(mondayOf(today),-77);
 const since=new Date();since.setDate(since.getDate()-Number(period));
 const filtered=acts.filter(a=>(type==='all'||(type==='run'?run(a):!run(a)))&&(period==='all'||when(a)>=since)&&(!query||a.name?.toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>when(b)-when(a));
 const total=filtered.reduce((s,a)=>s+(a.distance||0),0)/1000,time=filtered.reduce((s,a)=>s+(a.moving_time||0),0);
 // Twelve Monday-to-Sunday weeks ending this week: columns are weeks, rows are weekdays.
 const grid=useMemo(()=>Array.from({length:84},(_,i)=>{const key=addDays(start,i),items=acts.filter(a=>day(a)===key);const mins=items.reduce((s,a)=>s+(a.moving_time||0)/60,0);
  return {key,items,mins,count:items.length,future:key>today,race:items.some(a=>run(a)&&a.workout_type===1),km:items.filter(run).reduce((s,a)=>s+(a.distance||0)/1000,0)};}),[acts,start,today]);
 const weeks=Array.from({length:12},(_,w)=>grid.slice(w*7,w*7+7).reduce((s,d)=>s+d.km,0));
 const runKm=weeks.reduce((a,b)=>a+b,0),sessions=grid.reduce((n,d)=>n+d.count,0),hours=grid.reduce((n,d)=>n+d.mins,0)/60;
 const level=d=>d.future?'future':d.race?4:d.mins===0?0:d.mins<40?1:d.mins<80?2:3;
 const maxHr=hr?.max||Math.max(0,...acts.map(a=>a.max_heartrate||0))||null;
 const rest=hr?hr.model==='max'?null:hr.rest:restHr;
 const label=hover||picked;
 const vmax=Math.max(10,...weeks);
 const ridge=smooth([[0,58],...weeks.map((v,i)=>[(i+.5)/12*400,58-v/vmax*52]),[400,58]])+' L400,64 L0,64Z';
 return <div className="activity-page">
  {nav&&<button className="perf-link" onClick={()=>nav('performance')}><span><small>Performance</small><b>Form, race predictor, PB wall, shoes</b></span><Icon name="arrow" size={20}/></button>}
  <section className="volume" aria-label="Last 12 weeks">
   <p className="meta">Last 12 weeks · {sessions} sessions · {Math.round(hours)} h</p>
   <p className="hero-figure"><span>{Math.round(runKm)}</span><small>km run</small></p>
   <div className="grid-wrap">
    <svg className="volume-ridge" viewBox="0 0 400 64" preserveAspectRatio="none" aria-hidden="true"><path d={ridge}/></svg>
    <div className="movement-mosaic" aria-label="Activity minutes by day, last 12 weeks" onMouseLeave={()=>setHover(null)}>
     {grid.map(d=>{const l=level(d);return <button key={d.key} disabled={d.future} className={`tile lvl-${l}${picked?.key===d.key?' is-picked':''}${d.key===today?' is-now':''}`}
      aria-label={`${longDate(d.key)}: ${d.future?'still to come':d.count?Math.round(d.mins)+' minutes, '+d.count+' activities':'rest day'}`}
      onMouseEnter={()=>setHover(d)} onFocus={()=>setHover(d)} onBlur={()=>setHover(null)}
      onClick={()=>{setHover(null);if(d.count===1){setPicked(d);setSelected(d.items[0]);}else setPicked(d);}}/>;})}
    </div>
   </div>
   <div className="mosaic-label" aria-live="polite">{label?<><small>{shortDate(label.key)}</small><b>{label.count===0?(label.future?'Still to come':'Rest day'):label.count===1?`${label.items[0].name}${label.items[0].distance?` · ${(label.items[0].distance/1000).toFixed(2)} km`:''} · ${clock(label.items[0].moving_time)}`:`${label.count} sessions · ${Math.round(label.mins)} min`}</b></>:<><small>Tap a day</small><b>Stronger colour, bigger day. Ringed square is today.</b></>}</div>
  </section>

  {picked?.count>1&&<section className="day-panel"><div className="section-head"><h2>{longDate(picked.key)}</h2><button className="text-button" onClick={()=>setPicked(null)}>Close</button></div>{picked.items.map(a=><button key={a.id} className="list-row" onClick={()=>setSelected(a)}><span className="row-copy"><small>{typeName(a)}</small><b>{a.name}</b></span><span className="row-figure">{run(a)?((a.distance||0)/1000).toFixed(1):Math.round((a.moving_time||0)/60)}<small>{run(a)?'km':'min'}</small></span><Icon name="chevron" size={16}/></button>)}</section>}

  <div className="activity-controls">
   <div className="apex-segments">{[['all','Everything'],['run','Running'],['other','Other']].map(([id,l])=><button key={id} aria-pressed={type===id} onClick={()=>setType(id)}>{l}</button>)}</div>
   <div className="activity-search"><input aria-label="Search activities" placeholder="Find an activity" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="Activity period" value={period} onChange={e=>setPeriod(e.target.value)}><option value="all">All loaded</option><option value="30">Last 30 days</option><option value="7">Last 7 days</option></select></div>
   <p className="meta">{filtered.length} activities · {total.toFixed(1)} km · {duration(time)} moving</p>
  </div>

  <div className="activity-list">{filtered.map(a=><button className="activity-row" key={a.id} onClick={()=>setSelected(a)}>
   <span className="activity-art" aria-hidden="true">{run(a)?<RouteLine encoded={a.map?.summary_polyline} small/>:<Icon name="gym" size={22}/>}</span>
   <span className="row-copy"><small>{when(a).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})} · {typeName(a)}</small><b>{a.name}</b></span>
   <span className="row-figure">{a.distance?distU(a.distance,settings):Math.round((a.moving_time||0)/60)}<small>{a.distance?unitsOf(settings):'min'}</small><em>{run(a)?`${paceOf(a.average_speed,settings)}${perUnit(settings)}`:clock(a.moving_time)}</em></span>
  </button>)}</div>
  {filtered.length===0&&<div className="empty-block"><h2>Nothing matches.</h2><p>Try another search or time range.</p></div>}

  {gear.length>0&&<section className="gear-shelf"><div className="section-head"><h2>Shoes</h2></div>{gear.map(g=><div className="list-row" key={g.id}><span className="row-copy"><small>{g.brand_name||'In your rotation'}</small><b>{g.name||g.nickname}</b></span><span className="row-figure">{Math.round((g.distance||0)/1000)}<small>km</small></span></div>)}</section>}
  <p className="form-note">From the activities loaded from Strava. This may be a subset of your full history.</p>
  {selected&&<ActivityDetail summary={selected} maxHr={maxHr} restHr={rest} settings={settings} gear={gear} userPrefs={userPrefs} onSavePrefs={onSavePrefs} onClose={()=>setSelected(null)}/>}
 </div>;
}

function decode(encoded){if(!encoded)return [];let index=0,lat=0,lng=0,out=[];try{while(index<encoded.length){let shift=0,result=0,b;do{b=encoded.charCodeAt(index++)-63;result|=(b&31)<<shift;shift+=5;}while(b>=32&&index<encoded.length);lat+=result&1?~(result>>1):result>>1;shift=0;result=0;do{b=encoded.charCodeAt(index++)-63;result|=(b&31)<<shift;shift+=5;}while(b>=32&&index<encoded.length);lng+=result&1?~(result>>1):result>>1;out.push([lat/1e5,lng/1e5]);}}catch{return [];}return out;}

// Projects [lat,lng] points into a box, keeping the route's real proportions.
function project(points,w,h,pad){
 const ys=points.map(p=>p[0]),xs=points.map(p=>p[1]*Math.cos((ys[0]||0)*Math.PI/180));
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const s=Math.min((w-2*pad)/Math.max(maxX-minX,1e-6),(h-2*pad)/Math.max(maxY-minY,1e-6));
 const ox=(w-(maxX-minX)*s)/2,oy=(h-(maxY-minY)*s)/2;
 return points.map((_,i)=>[ox+(xs[i]-minX)*s,h-(oy+(ys[i]-minY)*s)]);
}

function RouteLine({encoded,points,small=false,markers=[]}){
 const pts=points||decode(encoded);
 if(pts.length<2)return small?<Icon name="activity" size={22}/>:null;
 const W=small?48:400,H=small?48:240,xy=project(pts,W,H,small?6:28);
 const d=xy.filter((_,i)=>i%Math.max(1,Math.floor(xy.length/400))===0||i===xy.length-1).map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
 if(small)return <svg viewBox={`0 0 ${W} ${H}`} width="48" height="48"><path d={d} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
 const [sx,sy]=xy[0],[ex,ey]=xy[xy.length-1];
 return <svg viewBox={`0 0 ${W} ${H}`} className="route-svg" role="img" aria-label="Route">
  {Array.from({length:9},(_,i)=><path key={i} className="route-contour" d={`M-20 ${24+i*26} C80 ${8+i*27} 160 ${50+i*22} 230 ${30+i*26} S330 ${60+i*20} 420 ${40+i*24}`}/>)}
  <path d={d} className="route-path"/>
  {markers.map(m=>{const [x,y]=xy[Math.min(xy.length-1,m.index)];return <g key={m.label} className="route-km"><circle cx={x} cy={y} r="10"/><text x={x} y={y+3.8} textAnchor="middle">{m.label}</text></g>;})}
  <circle cx={ex} cy={ey} r="6.5" className="route-end"/><circle cx={sx} cy={sy} r="7" className="route-start"/><circle cx={sx} cy={sy} r="2.8" className="route-start-in"/>
 </svg>;
}

// Splits per whole kilometre, worked out from the streams when Strava has none.
function streamSplits(st){
 const dist=st.distance?.data,time=st.time?.data;if(!dist?.length||!time?.length)return [];
 const hr=st.heartrate?.data,alt=st.altitude?.data,out=[];let from=0,mark=1000;
 for(let i=1;i<dist.length;i++){if(dist[i]>=mark||i===dist.length-1){const dd=dist[i]-dist[from],tt=time[i]-time[from];if(dd>50){const hrs=hr?hr.slice(from,i+1).filter(Number.isFinite):[];out.push({distance:dd,moving_time:tt,average_speed:dd/tt,average_heartrate:hrs.length?hrs.reduce((a,b)=>a+b,0)/hrs.length:null,elevation_difference:alt?alt[i]-alt[from]:null});}from=i;mark+=1000;}}
 return out;
}

const ZONES=[['Z1','Recovery',.5,.6],['Z2','Endurance',.6,.7],['Z3','Tempo',.7,.8],['Z4','Threshold',.8,.9],['Z5','Max',.9,1.01]];
// Heart-rate reserve (Karvonen) when a resting HR is known from WHOOP, else % of max.
function zoneTimes(st,maxHr,restHr){
 const hr=st.heartrate?.data,time=st.time?.data;if(!hr?.length||!time?.length||!maxHr)return null;
 const secs=ZONES.map(()=>0);
 for(let i=1;i<hr.length;i++){const dt=Math.min(30,time[i]-time[i-1]),r=restHr&&restHr<maxHr?(hr[i]-restHr)/(maxHr-restHr):hr[i]/maxHr;const z=ZONES.findIndex(([, ,lo,hi])=>r>=lo&&r<hi);if(z>=0)secs[z]+=dt;}
 const total=secs.reduce((a,b)=>a+b,0);return total?secs.map(s=>({secs:s,pct:s/total*100})):null;
}

function insights(a,st,splits){
 const out=[],dist=st.distance?.data,time=st.time?.data,hr=st.heartrate?.data,vel=st.velocity_smooth?.data;
 if(splits.length>=4){
  const full=splits.filter(s=>s.distance>900),half=Math.floor(full.length/2),p=s=>1000/s.average_speed;
  const first=full.slice(0,half).reduce((n,s)=>n+p(s),0)/half,second=full.slice(half).reduce((n,s)=>n+p(s),0)/(full.length-half);
  const diff=Math.round(first-second);
  if(Math.abs(diff)<=3)out.push(['Even pacing.',`Both halves within ${Math.max(1,Math.abs(diff))} s/km of each other.`]);
  else if(diff>0)out.push(['Negative split.',`The second half was ${diff} s/km faster than the first.`]);
  else out.push(['Positive split.',`The second half was ${-diff} s/km slower. Worth a look if it was meant to be steady.`]);
  const paces=full.map(p),mean=paces.reduce((a,b)=>a+b,0)/paces.length,sd=Math.sqrt(paces.reduce((n,x)=>n+(x-mean)**2,0)/paces.length);
  const fast=paces.indexOf(Math.min(...paces));
  out.push([`Fastest km: ${fast+1}.`,`${secPace(paces[fast])} /km. Your kilometres varied by about ±${Math.round(sd)} s.`]);
 }
 if(hr?.length&&vel?.length&&time?.length&&time[time.length-1]>1500){
  const mid=time[time.length-1]/2,ratio=(lo,hi)=>{let v=0,h=0;for(let i=0;i<time.length;i++)if(time[i]>=lo&&time[i]<hi&&hr[i]>0&&vel[i]>.5){v+=vel[i];h+=hr[i];}return h?v/h:null;};
  const r1=ratio(300,mid),r2=ratio(mid,Infinity);
  if(r1&&r2){const drift=(r1-r2)/r1*100;out.push([`${drift.toFixed(1)}% heart-rate drift.`,drift<5?'Below 5%, so your aerobic base held for the whole run.':'Above 5%. Heat, fuelling or fatigue made the same pace cost more late on.']);}
 }
 if(a.total_elevation_gain&&a.distance){const perKm=a.total_elevation_gain/(a.distance/1000);if(perKm>=15)out.push(['Hilly.',`${Math.round(perKm)} m of climbing per km. Judge it by effort, not pace.`]);}
 return out;
}

const skyOf=a=>{const h=a.start_date_local?when(a).getUTCHours():when(a).getHours();return h<5||h>=21?'dark':h<9?'dawn':h<17?'day':'dusk';};


// Run replay: the route redrawn as you ran it, coloured by pace, with a runner
// you can play or scrub. Faster kilometres burn brighter.
function RunReplay({points,time,vel,dist,markers}){
 const n=points.length,[i,setI]=useState(n-1),[playing,setPlaying]=useState(false);
 const W=400,H=260,xy=useMemo(()=>project(points,W,H,26),[points]);
 const step=Math.max(1,Math.floor(n/600)),idx=useMemo(()=>Array.from({length:Math.ceil(n/step)},(_,k)=>Math.min(n-1,k*step)),[n,step]);
 const speeds=vel.filter(v=>v>.6).sort((a,b)=>a-b),q=f=>speeds[Math.floor(f*(speeds.length-1))]||0,cuts=[q(.2),q(.4),q(.6),q(.8)];
 const band=v=>!(v>.6)?0:cuts.filter(c=>v>=c).length;
 useEffect(()=>{if(!playing)return;let raf,last;const dur=9000;const tick=t=>{if(last==null)last=t;const adv=(t-last)/dur*(n-1);last=t;setI(p=>{const nx=Math.min(n-1,p+adv);if(nx>=n-1){setPlaying(false);}return nx;});raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);},[playing,n]);
 const at=Math.round(i),segs=[];
 for(let k=1;k<idx.length;k++){const a=idx[k-1],b=idx[k];if(a>at)break;segs.push(<line key={k} x1={xy[a][0]} y1={xy[a][1]} x2={xy[Math.min(b,at)][0]} y2={xy[Math.min(b,at)][1]} className={`rp-seg rp-${band(vel[b])}`}/>);}
 const base=idx.map(k=>`${xy[k][0].toFixed(1)},${xy[k][1].toFixed(1)}`).join(' ');
 const [rx,ry]=xy[at]||xy[0];
 const play=()=>{if(at>=n-1)setI(0);setPlaying(!playing);};
 return <div className="replay">
  <svg viewBox={`0 0 ${W} ${H}`} className="route-svg" role="img" aria-label="Route replay">
   <polyline points={base} className="rp-base"/>
   {segs}
   {markers.map(m=>{const [x,y]=xy[Math.min(n-1,m.index)];return <g key={m.label} className="route-km"><circle cx={x} cy={y} r="10"/><text x={x} y={y+3.8} textAnchor="middle">{m.label}</text></g>;})}
   <circle cx={xy[0][0]} cy={xy[0][1]} r="6" className="route-start"/>
   <circle cx={rx} cy={ry} r="9" className="rp-runner"/>
  </svg>
  <div className="replay-bar">
   <button className="replay-play" onClick={play} aria-label={playing?'Pause replay':'Play replay'}>{playing?<svg width="18" height="18" viewBox="0 0 24 24"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>:<svg width="18" height="18" viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>}</button>
   <input type="range" min="0" max={n-1} step="1" value={at} onChange={e=>{setPlaying(false);setI(+e.target.value);}} aria-label="Scrub through the run"/>
  </div>
  <div className="replay-read"><span><small>Distance</small><b>{dist[at]!=null?(dist[at]/1000).toFixed(2):'—'}</b></span><span><small>Time</small><b>{time[at]!=null?clock(time[at]):'—'}</b></span><span><small>Pace</small><b>{vel[at]>.6?pace(vel[at]):'—'}</b></span></div>
  <div className="replay-key"><span>Slower</span>{[0,1,2,3,4].map(b=><i key={b} className={`rp-${b}`}/>)}<span>Faster</span></div>
 </div>;
}

function ActivityDetail({summary,onClose,maxHr,restHr,settings,gear,userPrefs,onSavePrefs}){
 const [poster,setPoster]=useState(false);
 useDialog(true,onClose);
 const [scrolled,setScrolled]=useState(false),[activity,setActivity]=useState(summary),[st,setSt]=useState({}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[metric,setMetric]=useState('heartrate');
 useEffect(()=>{let active=true;
  if(PREVIEW){const p=previewDetail(summary);setActivity(p.activity);setSt(p.streams);setLoading(false);return;}
  Promise.all([getActivity(summary.id),getStreams(summary.id).catch(()=>({}))]).then(([a,s])=>{if(active){setActivity(a);setSt(s||{});rememberEfforts(a);window.dispatchEvent(new Event('apex-efforts'));}}).catch(()=>{if(active)setError('Detailed data could not be loaded. Your activity summary is shown.');}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};},[summary.id,summary]);
 const a=activity,isRun=run(a),hasDist=a.distance>0;
 const dist=st.distance?.data||[],alt=st.altitude?.data||[],hr=st.heartrate?.data||[],vel=st.velocity_smooth?.data||[],cad=st.cadence?.data||[],watts=st.watts?.data||[];
 const mi=unitsOf(settings)==='mi';
 const splits=((mi?a.splits_standard:a.splits_metric)?.length?(mi?a.splits_standard:a.splits_metric):mi?[]:streamSplits(st)).filter(s=>s.distance>0);
 const pu=v=>paceOf(v,settings),U=unitsOf(settings);
 const peakHr=Math.max(maxHr||0,a.max_heartrate||0)||null,zones=zoneTimes(st,peakHr,restHr);
 const notes=isRun?insights(a,st,splits):[];
 const metrics=[hr.length&&['heartrate','Heart rate'],vel.length&&hasDist&&['pace','Pace'],cad.length&&['cadence','Cadence'],watts.length&&['watts','Power']].filter(Boolean);
 const m=metrics.find(x=>x[0]===metric)?metric:metrics[0]?.[0];
 const series=m==='heartrate'?hr:m==='pace'?vel.map(v=>v>.6?v:NaN):m==='cadence'?cad.map(c=>c*(isRun?2:1)):m==='watts'?watts:[];
 const readout=i=>{const parts=[];if(dist[i]!=null)parts.push(`${(dist[i]/1000).toFixed(2)} km`);if(alt[i]!=null)parts.push(`${Math.round(alt[i])} m`);const v=series[i];if(Number.isFinite(v))parts.push(m==='pace'?`${pace(v)} /km`:m==='heartrate'?`${Math.round(v)} bpm`:m==='cadence'?`${Math.round(v)} spm`:`${Math.round(v)} W`);return parts.join(' · ');};
 const kmMarks=useMemo(()=>{const ll=st.latlng?.data;if(!ll?.length||!dist.length)return [];const total=dist[dist.length-1],step=total>25000?10000:total>8000?5000:total>3000?1000:0;if(!step)return [];const out=[];for(let k=step;k<total-step*.4;k+=step){const i=dist.findIndex(x=>x>=k);if(i>0&&i<ll.length)out.push({index:i,label:String(k/1000)});}return out;},[st,dist]);
 const routePts=st.latlng?.data?.length>1?st.latlng.data:decode(a.map?.polyline||a.map?.summary_polyline);
 const cadence=a.average_cadence?Math.round(a.average_cadence*(isRun?2:1)):null;
 const stride=cadence&&a.average_speed?(a.average_speed*60/cadence).toFixed(2):null;
 const fastest=splits.length?splits.reduce((b,s,i)=>s.distance>900&&(!b||s.average_speed>b.s.average_speed)?{s,i}:b,null):null;
 const facts=[
  ['Moving time',clock(a.moving_time)],['Elapsed',clock(a.elapsed_time)],
  hasDist&&['Average pace',`${pu(a.average_speed)} /${U}`],hasDist&&a.max_speed&&['Fastest pace',`${pu(a.max_speed)} /${U}`],
  a.average_heartrate&&['Average HR',`${Math.round(a.average_heartrate)} bpm`],a.max_heartrate&&['Max HR',`${Math.round(a.max_heartrate)} bpm`],
  hasDist&&['Elevation gain',`${Math.round(a.total_elevation_gain||0)} m`],a.elev_high!=null&&a.elev_low!=null&&['Highest point',`${Math.round(a.elev_high)} m`],
  cadence&&['Cadence',`${cadence} ${isRun?'spm':'rpm'}`],stride&&isRun&&['Stride length',`${stride} m`],
  a.average_watts&&['Average power',`${Math.round(a.average_watts)} W`],
  (a.calories||a.kilojoules)&&['Energy',a.calories?`${Math.round(a.calories).toLocaleString('en-GB')} kcal`:`${Math.round(a.kilojoules)} kJ`],
  a.suffer_score&&['Relative effort',Math.round(a.suffer_score)],
  fastest&&isRun&&[`Fastest ${U}`,`${pu(fastest.s.average_speed)} · ${U} ${fastest.i+1}`],
  a.average_temp!=null&&['Temperature',`${Math.round(a.average_temp)}°C`],
  (a.pr_count>0||a.achievement_count>0)&&['Achievements',`${a.pr_count||0} PR${a.pr_count===1?'':'s'} · ${a.achievement_count||0} total`],
  a.perceived_exertion&&['Perceived effort',`${a.perceived_exertion} / 10`],
  a.kudos_count>0&&['Kudos',a.kudos_count],
  a.device_name&&['Recorded on',a.device_name],
 ].filter(Boolean);
 const spd=splits.filter(s=>s.distance>(mi?1500:900)).map(s=>s.average_speed),sMin=Math.min(...spd),sMax=Math.max(...spd);
 const photo=a.photos?.primary?.urls?.['600']||a.photos?.primary?.urls?.['100'];
 const accent=getComputedStyle(document.querySelector('.apex-app')||document.body).getPropertyValue('--accent').trim()||'#1C3BDB';
 const view=<><PosterSheet open={poster} onClose={()=>setPoster(false)} activity={a} streams={st} points={routePts} splits={splits} settings={settings} accent={accent}/><div className={`detail-view${scrolled?' is-scrolled':''}`} role="dialog" aria-modal="true" aria-labelledby="activity-detail-title">
  <div className="detail-bar"><button className="glass-button" onClick={onClose} aria-label="Back to activity"><Icon name="back" size={20}/></button><span className="detail-bar-title" aria-hidden="true">{a.name}</span><span className="detail-actions"><button className="glass-button" onClick={()=>setPoster(true)} aria-label="Make a poster of this run"><Icon name="poster" size={19}/></button>{!PREVIEW&&a.id&&<a className="glass-button" href={`https://www.strava.com/activities/${a.id}`} target="_blank" rel="noreferrer" aria-label="Open in Strava"><Icon name="external" size={18}/></a>}</span></div>
  <div className="detail-scroll" onScroll={e=>{const s=e.currentTarget.scrollTop>240;if(s!==scrolled)setScrolled(s);}}>
   <header className={`detail-sky sky-${skyOf(a)}`}>
    <div className="detail-head">
     <p className="detail-meta">{when(a).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:when(a).getFullYear()!==new Date().getFullYear()?'numeric':undefined})} · {when(a).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:a.start_date_local?'UTC':undefined})} · {typeName(a)}{a.location_city?` · ${a.location_city}`:''}</p>
     <h2 id="activity-detail-title">{a.name}</h2>
     <p className="detail-hero">{hasDist?<><span>{distU(a.distance,settings)}</span><small>{U}</small></>:<><span>{clock(a.moving_time)}</span><small>moving</small></>}</p>
     <dl className="detail-three">
      {hasDist&&<div><dt>Time</dt><dd>{clock(a.moving_time)}</dd></div>}
      {hasDist&&<div><dt>Pace /{U}</dt><dd>{pu(a.average_speed)}</dd></div>}
      <div><dt>Avg HR</dt><dd>{a.average_heartrate?Math.round(a.average_heartrate):'—'}</dd></div>
      {!hasDist&&<div><dt>Max HR</dt><dd>{a.max_heartrate?Math.round(a.max_heartrate):'—'}</dd></div>}
     </dl>
    </div>
    {(alt.length>1||series.length>1)?<Profile fill={alt.length>1?alt:[]} line={series} height={170} format={readout}/>:<div className="detail-horizon"/>}
   </header>
   <div className="detail-body">
    {metrics.length>1&&<div className="apex-segments detail-metric" role="tablist" aria-label="Line on the profile">{metrics.map(([id,l])=><button key={id} role="tab" aria-selected={m===id} onClick={()=>setMetric(id)}>{l}</button>)}</div>}
    {(alt.length>1||series.length>1)&&<p className="form-note">Drag across the profile to read any point.{alt.length>1&&a.total_elevation_gain?` Shape is elevation, ${Math.round(a.total_elevation_gain)} m gained.`:''}</p>}
    {loading&&<p className="form-note">Loading the full detail from Strava…</p>}
    {error&&<p className="form-error">{error}</p>}
    {a.description&&<p className="detail-description">{a.description}</p>}
    {photo&&<img className="detail-photo" src={photo} alt={`Photo from ${a.name}`}/>}

    {notes.length>0&&<section className="detail-section"><h3>What the run says</h3>{notes.map(([b,t])=><p key={b} className="insight"><b>{b}</b> {t}</p>)}</section>}

    <section className="detail-section"><h3>Details</h3><dl className="facts">{facts.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}{a.gear?.name&&<div className="fact-wide"><dt>Shoe on Strava</dt><dd>{a.gear.name}{a.gear.distance?` · ${Math.round(a.gear.distance/1000)} km`:''}</dd></div>}</dl>{isRun&&<ShoePicker activity={a} gear={gear} userPrefs={userPrefs} onSavePrefs={onSavePrefs}/>}</section>

    {splits.length>1&&hasDist&&<section className="detail-section"><h3>Splits</h3>
     <div className="splits"><div className="split split-head" aria-hidden="true"><span>{mi?'Mi':'Km'}</span><span/><span>Pace</span><span>HR</span><span>Elev</span></div>
      {splits.map((s,i)=>{const t=s.distance>900&&sMax>sMin?(s.average_speed-sMin)/(sMax-sMin):.5,best=fastest&&fastest.i===i;return <div className={`split${best?' is-best':''}`} key={i}>
       <span>{s.distance>900?i+1:distU(s.distance,settings)}</span>
       <span className="split-bar"><i style={{width:`${36+t*64}%`,'--t':t}}/></span>
       <span>{pu(s.average_speed)}</span><span>{s.average_heartrate?Math.round(s.average_heartrate):'—'}</span><span>{s.elevation_difference!=null?`${s.elevation_difference>0?'+':''}${Math.round(s.elevation_difference)}`:'—'}</span></div>;})}
     </div><p className="form-note">Bars are speed: longer and darker is faster. Elevation in metres.</p></section>}

    {zones&&<section className="detail-section"><h3>Heart-rate zones</h3>
     <div className="zone-bar" aria-hidden="true">{zones.map((z,i)=>z.pct>0&&<i key={i} className={`z${i+1}`} style={{flex:z.pct}}/>)}</div>
     <dl className="facts single">{zones.map((z,i)=><div key={i}><dt><i className={`zone-key z${i+1}`}/>{ZONES[i][0]} · {ZONES[i][1]}</dt><dd>{Math.round(z.secs/60)} min · {Math.round(z.pct)}%</dd></div>)}</dl>
     <p className="form-note">{restHr?`Zones use your heart-rate reserve: resting ${Math.round(restHr)} bpm from WHOOP, max ${peakHr} bpm from your loaded activities.`:`Zones are percentages of the highest heart rate in your loaded activities (${peakHr} bpm).`}</p></section>}

    {a.laps?.length>1&&<section className="detail-section"><h3>Laps</h3><div className="splits laps"><div className="split split-head" aria-hidden="true"><span>Lap</span><span>Distance</span><span>Time</span><span>Pace</span><span>HR</span></div>{a.laps.map((l,i)=><div className="split" key={i}><span>{i+1}</span><span>{(l.distance/1000).toFixed(2)} km</span><span>{clock(l.moving_time)}</span><span>{pace(l.average_speed)}</span><span>{l.average_heartrate?Math.round(l.average_heartrate):'—'}</span></div>)}</div></section>}

    {routePts.length>1&&<section className="detail-section"><h3>{st.latlng?.data?.length>1&&st.time?.data?.length===st.latlng.data.length?'Replay':'Route'}</h3><div className="route-box">{st.latlng?.data?.length>1&&st.time?.data?.length===st.latlng.data.length?<RunReplay points={st.latlng.data} time={st.time.data} vel={vel.length===st.latlng.data.length?vel:st.latlng.data.map(()=>NaN)} dist={dist} markers={kmMarks}/>:<RouteLine points={routePts} markers={kmMarks}/>}</div><p className="form-note">{kmMarks.length?'Markers every '+(kmMarks[0].label)+' km. ':''}Press play to rerun it, or drag to any point.</p></section>}

    {a.best_efforts?.length>0&&<section className="detail-section"><h3>Best efforts</h3><dl className="facts single">{a.best_efforts.map((e,i)=><div key={i}><dt>{e.name}{e.pr_rank===1&&<span className="pr-tag">PR</span>}{e.pr_rank>1&&<span className="pr-tag is-quiet">{e.pr_rank===2?'2nd':'3rd'} best</span>}</dt><dd>{clock(e.moving_time||e.elapsed_time)}</dd></div>)}</dl></section>}

    {a.segment_efforts?.length>0&&<section className="detail-section"><h3>Segments</h3><dl className="facts single">{a.segment_efforts.slice(0,8).map((e,i)=><div key={i}><dt>{e.name}{e.pr_rank===1&&<span className="pr-tag">PR</span>}</dt><dd>{clock(e.moving_time||e.elapsed_time)}{e.distance?` · ${(e.distance/1000).toFixed(2)} km`:''}</dd></div>)}</dl></section>}
   </div>
  </div>
 </div></>;
 const host=document.querySelector('.apex-app')||document.body;
 return createPortal(view,host);
}
