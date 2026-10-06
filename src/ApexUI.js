import {useDialog} from './ApexInteractions';
import {Fragment,useEffect,useRef,useState} from 'react';
import {localDate,addDays,mondayOf,prettyDate,surfaceFor} from './apexDates';
import {Bend,useLap,readyFor,WeekBars} from './ApexTrack';
import {usePerformance,formLabel,clock,isRun as runOf} from './ApexPerformance';
import {focusRace,raceDate} from './ApexGoals';
import {readSettings,TAB_CHOICES,ACCENTS,STATS,dist,paceOf,perUnit,unitsOf,heartRate} from './ApexSettings';
import {allShoes,shoeStats} from './ApexShoes';
import './ApexUI.css';

const paths={
 home:'M4 11.5 12 5l8 6.5V20H4z M9.5 20v-5h5v5',
 performance:'M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M12 13l3.5-3.5 M10 2h4 M12 2v3',
 activity:'M3 12h4l3-7 4 14 3-7h4',
 plan:'M5 5h14v15H5z M5 10h14 M9 3v4 M15 3v4',
 nutrition:'M7 3v8a3 3 0 0 0 6 0V3 M10 3v18 M17 3c-2.5 2-2.5 9 0 10v8',
 recovery:'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
 gym:'M2 12h2 M20 12h2 M5 8v8 M19 8v8 M8 6v12 M16 6v12 M8 12h8',
 coach:'M5 18V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9l-4 3z M9 10.5h6 M9 13.5h4',
 profile:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 20a8 8 0 0 1 16 0',
 races:'M5 21V4 M5 4h11l-2 4 2 4H5',
 arrow:'M5 12h14 M13 6l6 6-6 6',
 back:'M15 5l-7 7 7 7',
 plus:'M12 5v14 M5 12h14',
 more:'M5 12h.01 M12 12h.01 M19 12h.01',
 close:'M6 6l12 12 M18 6 6 18',
 sun:'M12 4V2 M12 22v-2 M4 12H2 M22 12h-2 M6 6 4.5 4.5 M19.5 19.5 18 18 M6 18l-1.5 1.5 M19.5 4.5 18 6 M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
 moon:'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
 coros:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
 check:'M5 12.5 10 17 19 7',
 external:'M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
 chevron:'M9 5l7 7-7 7',
 shoes:'M3 15.5c0-2 1-3.2 2.2-4.7L7.5 8h3l1.5 2.5c1.6.9 4 1.4 6.3 1.9 1.6.4 2.7 1.6 2.7 3.1v1H3z M3 18.5h18',
 settings:'M4 7h10 M18 7h2 M4 17h4 M12 17h8 M16 5v4 M10 15v4',
 poster:'M5 3h14v18H5z M5 15c3-4 6-4 9-1s3 2 5 0',
};

export function Icon({name,size=22}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.activity}/></svg>;}
// The mark: the end of a track, lane 1 drawn heavy.
export function Mark({size=26}){return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true"><g fill="none" stroke="currentColor" strokeLinecap="butt"><path d="M62 46H28a14 14 0 0 1 0-28h34" strokeWidth="6"/><path d="M62 55H28a23 23 0 0 1 0-46h34" strokeWidth="2.4"/></g></svg>;}

const MORE_ALL=[['performance','Performance','Form, predictor, PBs, pace band'],['shoes','Shoes','Mileage, rotation and retirement'],['recovery','Recovery','Sleep, HRV and the last 30 mornings'],['nutrition','Fuel','Meals, targets and body weight'],['gym','Strength','Live workouts, rest timer, history'],['races','Races','Your calendar and primary goal'],['settings','Customise','Today, tabs, colour, units, PBs, heart rate'],['profile','You','Profile and connections'],['plan','Training','Your plan, week by week'],['activity','Activity','Every run and the 12-week grid'],['coach','Coach','Plans, questions, adjustments']];
const TITLES={shoes:'Shoes',performance:'Performance',plan:'Training',activity:'Activity',recovery:'Recovery',nutrition:'Fuel',gym:'Strength',coach:'Coach',profile:'You',races:'Races',settings:'Customise'};

export function Frame({page,nav,athlete,dark,preview,settings,children}){
 const positions=useRef({}),previous=useRef(page),scroll=useRef(null),[menu,setMenu]=useState(false),[solid,setSolid]=useState(false);
 useDialog(menu,()=>setMenu(false));
 useEffect(()=>{previous.current=page;if(scroll.current)scroll.current.scrollTop=positions.current[page]||0;setMenu(false);setSolid((positions.current[page]||0)>8);},[page]);
 const tabs=[['home','Today'],...(settings?.tabs||['plan','activity','coach']).map(k=>[k,TAB_CHOICES[k]])];
 const more=MORE_ALL.filter(([id])=>!tabs.some(([t])=>t===id));
 const inMore=more.some(([id])=>id===page);
 const title=TITLES[page],home=page==='home';
 const accent=ACCENTS[settings?.accent]||ACCENTS.cobalt;
 const onScroll=e=>{const t=e.currentTarget.scrollTop;positions.current[previous.current]=t;const s=home?t>window.innerHeight*.45:t>8;if(s!==solid)setSolid(s);};
 return <div className={`apex-app${dark?' apex-dark':''}${home?' is-home':''}`} style={{'--accent':dark?accent.dark:accent.light}}>
  <a className="skip-link" href="#main-content">Skip to content</a>
  <aside className="rail" aria-label="Main navigation">
   <button className="rail-brand" onClick={()=>nav('home')} aria-label="APEX home"><Mark size={26}/><span>APEX</span></button>
   <nav>{[...tabs,...more.map(([id,l])=>[id,l])].map(([id,label],i)=><Fragment key={id}>{i===tabs.length&&<hr/>}<button className={page===id?'is-on':''} aria-current={page===id?'page':undefined} onClick={()=>nav(id)}><Icon name={id} size={20}/><span>{label}</span></button></Fragment>)}</nav>
  </aside>
  <div className="workspace" ref={scroll} onScroll={onScroll}>
   <header className={`topbar${solid?' is-solid':''}`}>
    <button className="brand" onClick={()=>nav('home')} aria-label="APEX home"><Mark size={22}/><span>APEX</span></button>
    {!home&&title&&<span className="topbar-title" aria-hidden="true">{title}</span>}
    <div className="topbar-actions">
     {preview&&<span className="preview-chip">Sample</span>}
     {home&&<button className="glass-button" onClick={()=>nav('settings')} aria-label="Customise Today"><Icon name="settings" size={19}/></button>}
     <button className="glass-button avatar" onClick={()=>nav('profile')} aria-label="Your profile">{athlete?.firstname?.[0]||'A'}</button>
    </div>
   </header>
   <main className={`content screen-${page}`} id="main-content">
    {title&&page!=='coach'&&<div className="page-head"><h1>{title}</h1></div>}
    {children}
   </main>
  </div>
  <nav className="dock" aria-label="Main navigation">
   {tabs.map(([id,label])=><button key={id} className={page===id?'is-on':''} aria-current={page===id?'page':undefined} onClick={()=>nav(id)}><Icon name={id} size={23}/><span>{label}</span></button>)}
   <button className={inMore||menu?'is-on':''} aria-expanded={menu} aria-haspopup="dialog" onClick={()=>setMenu(!menu)}><Icon name="more" size={25}/><span>More</span></button>
  </nav>
  {menu&&<div className="sheet-backdrop" onClick={e=>{if(e.target===e.currentTarget)setMenu(false);}}>
   <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="more-title">
    <div className="sheet-grip"/>
    <div className="sheet-head"><h2 id="more-title">More</h2><button className="glass-button" onClick={()=>setMenu(false)} aria-label="Close"><Icon name="close" size={18}/></button></div>
    <div className="sheet-list">{more.map(([id,label,sub])=><button key={id} className={page===id?'is-on':''} onClick={()=>{nav(id);setMenu(false);}}><Icon name={id} size={22}/><span><strong>{label}</strong><small>{sub}</small></span><Icon name="chevron" size={17}/></button>)}</div>
   </section>
  </div>}
 </div>;
}

const num=(n,d=0)=>Number.isFinite(Number(n))?Number(n).toLocaleString('en-GB',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
const actDay=a=>(a.start_date_local||a.start_date||'').slice(0,10);
const hm=ms=>ms==null?null:`${Math.floor(ms/3600000)} h ${String(Math.round(ms%3600000/60000)).padStart(2,'0')}`;
const dd=x=>String(x).padStart(2,'0');

function datedPlan(plan){return (plan?.sessions||[]).map((s,i)=>{let d=s.date;if(!d&&plan?.startDate)d=addDays(plan.startDate,i);return {...s,date:d,index:i};});}

function sessionHeadline(session,plan,planUnavailable){
 if(planUnavailable)return {meta:'Plan unavailable',big:['Plan',' not loaded'],line:'Your saved plan could not load. Retry saved data at the top of the page. Nothing has been overwritten.'};
 if(!plan)return {meta:'No plan yet',big:['Build',' your week'],line:'Ask your coach for a week built around your recovery, your races and your life.'};
 if(!session)return {meta:'Nothing planned',big:['A free',' day'],line:'No session on the plan today. Move easy, or add something yourself.'};
 const type=session.type,km=parseFloat(session.dist)||0;
 if(type==='Rest')return {meta:'Rest day',big:['',' Rest'],line:session.notes||'Recovery is part of the work. Sleep, eat well, stay loose.'};
 if(type==='Gym')return {meta:'Strength',big:['',' Strength'],line:session.notes||'Strength work to support your running.',cta:['Start workout','gym']};
 return {meta:[session.pace&&session.pace!=='N/A'?session.pace.replace(/\/?km$/,'')+' /km':'',session.shoe&&session.shoe!=='N/A'?session.shoe:''].filter(Boolean).join(' · ')||'Today',big:[`${num(km,km%1?1:0)} km `,surfaceFor(type).name.toLowerCase()],line:session.notes};
}

export function Home({acts=[],gear=[],whoop,whoopOk,connectWhoop,plan,nav,userPrefs,prefsUnavailable=false,planUnavailable=false,checkin=null}){
 const settings=readSettings(userPrefs);
 const now=new Date(),today=localDate(now),monday=mondayOf(today);
 const sessions=datedPlan(plan);
 const session=sessions.find(s=>s.date===today&&s.type!=='Rest'&&!s.done)||sessions.find(s=>s.date===today);
 const runs=acts.filter(runOf);
 const ranBetween=(a,b)=>runs.filter(r=>actDay(r)>=a&&actDay(r)<=b).reduce((n,r)=>n+(r.distance||0),0);
 const weekM=ranBetween(monday,today),monthM=ranBetween(today.slice(0,8)+'01',today),yearM=ranBetween(today.slice(0,5)+'01-01',today);
 const planned=sessions.filter(s=>s.date>=monday&&s.date<=addDays(monday,6)&&!['Rest','Gym'].includes(s.type)).reduce((n,s)=>n+(parseFloat(s.dist)||0),0);
 const food=userPrefs?.nutrition?.[today]||{},targets={kcal:3000,protein:140,...userPrefs?.nutritionTargets};
 const recent=[...acts].sort((a,b)=>new Date(b.start_date_local||b.start_date)-new Date(a.start_date_local||a.start_date)).slice(0,3);
 const recs=whoop?.recoveries?.records||[],rec=recs[0]?.score,score=whoopOk&&rec?.recovery_score!=null?Math.round(rec.recovery_score):null;
 const sleep=whoop?.sleeps?.records?.[0]?.score,stage=sleep?.stage_summary;
 const asleep=stage?(stage.total_in_bed_time_milli||0)-(stage.total_awake_time_milli||0):null;
 const prevHrv=recs.slice(1,8).map(r=>r.score?.hrv_rmssd_milli).filter(Number.isFinite),hrvBase=prevHrv.length?prevHrv.reduce((a,b)=>a+b,0)/prevHrv.length:null;
 const hrvDelta=hrvBase&&Number.isFinite(rec?.hrv_rmssd_milli)?Math.round((rec.hrv_rmssd_milli/hrvBase-1)*100):null;
 const lap=useLap(score),ready=readyFor(score);
 const {form,pred}=usePerformance(acts,whoop,settings);
 const last=form.ready?form.series[form.series.length-1]:null,fl=last?formLabel(last.tsb):null;
 const goal=focusRace(userPrefs?.races),goalDays=goal&&raceDate(goal)?Math.ceil((new Date(goal.date+'T12:00:00')-new Date(today+'T12:00:00'))/86400000):null;
 const topShoe=shoeStats(allShoes(gear,settings),acts,settings).filter(s=>!s.retired).sort((a,b)=>(b.last||'').localeCompare(a.last||'')||(b.primary?1:0)-(a.primary?1:0)||b.km-a.km)[0];
 const days=new Set(runs.map(actDay));let streak=0;for(let k=days.has(today)?today:addDays(today,-1);days.has(k);k=addDays(k,-1))streak++;
 const todayRun=runs.filter(a=>actDay(a)===today).sort((a,b)=>new Date(b.start_date_local||b.start_date)-new Date(a.start_date_local||a.start_date))[0];
 const runTime=a=>new Date(a.start_date_local||a.start_date).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:a.start_date_local?'UTC':undefined});
 const head=todayRun?{meta:`Done at ${runTime(todayRun)}${session&&!['Rest','Gym'].includes(session.type)?` · planned ${num(parseFloat(session.dist)||0,1)} km`:''}`,big:[`${dist(todayRun.distance,settings)} ${unitsOf(settings)} `,'done'],line:`${todayRun.name}, ${paceOf(todayRun.average_speed,settings)}${perUnit(settings)}${todayRun.average_heartrate?`, ${Math.round(todayRun.average_heartrate)} bpm`:''}.`,cta:['View run','run']}:sessionHeadline(session,plan,planUnavailable);
 const checkIn=()=>{window.dispatchEvent(new CustomEvent('apex-checkin'));setTimeout(()=>document.getElementById('checkin')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}),60);};
 const checkedIn=!!userPrefs?.journal?.[today];
 const u=unitsOf(settings);
 const statValue={
  form:[last?`${last.tsb>=0?'+':''}${Math.round(last.tsb)}`:'—',fl?.label||'Warming up','performance'],
  fitness:[last?Math.round(last.ctl):'—','6-week load','performance'],
  marathon:[pred.now.Marathon?clock(pred.now.Marathon):'—','Predicted','performance'],
  half:[pred.now.Half?clock(pred.now.Half):'—','Predicted','performance'],
  tenk:[pred.now['10K']?clock(pred.now['10K']):'—','Predicted','performance'],
  fivek:[pred.now['5K']?clock(pred.now['5K']):'—','Predicted','performance'],
  week:[`${dist(weekM,settings,1)}`,planned?`of ${num(u==='mi'?planned/1.60934:planned,0)} ${u}`:u,'plan'],
  month:[dist(monthM,settings,0),`${u} in ${now.toLocaleDateString('en-GB',{month:'long'})}`,'activity'],
  year:[dist(yearM,settings,0),`${u} in ${now.getFullYear()}`,'activity'],
  streak:[streak,streak===1?'day running':'days running','activity'],
  hrv:[Number.isFinite(rec?.hrv_rmssd_milli)?Math.round(rec.hrv_rmssd_milli):'—',hrvDelta!=null?`ms · ${hrvDelta>=0?'+':''}${hrvDelta}%`:'ms','recovery'],
  sleep:[asleep?hm(asleep):'—','asleep','recovery'],
  rhr:[rec?.resting_heart_rate!=null?Math.round(rec.resting_heart_rate):'—','bpm resting','recovery'],
  shoe:[topShoe?dist(topShoe.km*1000,settings,0):'—',topShoe?`${u} · ${topShoe.name}`:'No shoes','shoes'],
  race:[goalDays!=null?goalDays:'—',goal?`days to ${goal.name}`:'No race set','races'],
 };
 const weekDays=Array.from({length:7},(_,i)=>{const key=addDays(monday,i),ds=sessions.filter(s=>s.date===key),main=ds.find(s=>s.type!=='Rest')||ds[0],d=new Date(key+'T12:00:00');
  return {key,short:d.toLocaleDateString('en-GB',{weekday:'short'}).slice(0,2),date:d.getDate(),plannedKm:ds.filter(s=>!['Rest','Gym'].includes(s.type)).reduce((n,s)=>n+(parseFloat(s.dist)||0),0),km:ranBetween(key,key)/1000,strength:ds.some(s=>s.type==='Gym'),effort:{'Long Run':'long',Tempo:'tempo',Interval:'int'}[main?.type]||'easy',aria:`${d.toLocaleDateString('en-GB',{weekday:'long'})}: ${main?main.type:'nothing planned'}`};});
 const modules={
  recovery:<section key="recovery" className="poster today-poster" aria-label={score==null?'Recovery not available':`Recovery ${score}. ${ready.label}`}>
   <div className="poster-meta"><span>{now.toLocaleDateString('en-GB',{weekday:'short'})} {dd(now.getDate())}.{dd(now.getMonth()+1)}</span><span>Week {Math.ceil(((now-new Date(now.getFullYear(),0,1))/86400000+new Date(now.getFullYear(),0,1).getDay()+1)/7)}</span><span>{goalDays!=null?`${goal.name.split(' ')[0]} −${goalDays}`:`${dist(weekM,settings,1)} ${u} run`}</span></div>
   <Bend progress={lap} score={score}/>
   <button className="poster-score" onClick={whoopOk?()=>nav('recovery'):connectWhoop} aria-label={whoopOk?'Open recovery detail':'Connect WHOOP'}>
    <small>Recovery</small><b>{score==null?'—':Math.round(lap)}</b><em>{ready.word}</em>
   </button>
   <p className="poster-signals">{whoopOk?<>{asleep&&<span>{hm(asleep)} asleep</span>}{Number.isFinite(rec?.hrv_rmssd_milli)&&<span>HRV {Math.round(rec.hrv_rmssd_milli)}{hrvDelta!=null?` · ${hrvDelta>=0?'+':''}${hrvDelta} %`:''}</span>}{rec?.resting_heart_rate!=null&&<span>RHR {Math.round(rec.resting_heart_rate)}</span>}</>:<span>Connect WHOOP to read your recovery</span>}</p>
  </section>,
  session:<section key="session" className="today-session" aria-label="Today’s session">
   <div className="session-grid"><span className="label">{todayRun?'Today':'Today'}<br/>{head.meta}</span><div>
    <h2 className="session-title">{head.big[0]}<em>{head.big[1]}</em></h2>
    {head.line&&<p className="today-note">{head.line}</p>}
   </div></div>
   <div className="cta-bar">
    {!prefsUnavailable&&<button className="cta-main" onClick={checkIn}><span>{checkedIn?'Checked in':'Check in'}</span><Icon name={checkedIn?'check':'arrow'} size={20}/></button>}
    {head.cta?.[1]==='run'&&<button className="cta-side" onClick={()=>nav('activity',todayRun.id)}>Run</button>}
    {head.cta?.[1]==='gym'&&<button className="cta-side" onClick={()=>nav('gym')}>Lift</button>}
    <button className="cta-side" onClick={()=>nav('coach')}>Coach</button>
   </div>
  </section>,
  stats:<section key="stats" className="stat-row" aria-label="Your numbers">{settings.stats.map(k=>{const [v,sub,go]=statValue[k]||['—','',null];return <button key={k} onClick={()=>go&&nav(go)}><span className="label">{STATS[k]}</span><b>{v}</b><small>{sub}</small></button>;})}</section>,
  week:<section key="week" className="today-week" aria-labelledby="week-title"><div className="section-head"><h2 id="week-title">This week</h2><button className="text-button" onClick={()=>nav('plan')}>Training<Icon name="arrow" size={15}/></button></div><WeekBars days={weekDays} todayKey={today} onPick={()=>nav('plan')}/></section>,
  race:goal?<button key="race" className="race-strip" onClick={()=>nav('races')}><span className="label">Next race</span><span><b>{goal.name}</b><small>{[goal.target,raceDate(goal)&&prettyDate(goal.date,{day:'numeric',month:'long',year:'numeric'})].filter(Boolean).join(' · ')}</small></span>{goalDays!=null&&<strong>{goalDays}<small>days</small></strong>}</button>:null,
  checkin:prefsUnavailable?null:<Fragment key="checkin">{checkin}</Fragment>,
  fuel:prefsUnavailable?null:<button key="fuel" className="race-strip" onClick={()=>nav('nutrition')}><span className="label">Fuel</span><span><b>{num(Number(food.kcal||0))} of {num(targets.kcal)} kcal</b><small>{num(Number(food.protein||0))} g protein</small></span><Icon name="chevron" size={16}/></button>,
  results:<section key="results" className="today-recent" aria-labelledby="recent-title">
   <div className="section-head"><h2 id="recent-title">Results</h2><button className="text-button" onClick={()=>nav('activity')}>All<Icon name="arrow" size={15}/></button></div>
   {recent.length?recent.map((a,i)=><button key={a.id||i} className="list-row result-row" onClick={()=>nav('activity',a.id)}>
    <span className="res-pos">{dd(i+1)}</span>
    <span className="row-copy"><small>{new Date(a.start_date_local||a.start_date).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})} · {runOf(a)?'Run':(a.type||'Session').replace(/([a-z])([A-Z])/g,'$1 $2')}</small><b>{a.name}</b></span>
    <span className="row-figure">{a.distance?dist(a.distance,settings):Math.round((a.moving_time||0)/60)}<small>{a.distance?u:'min'}</small>{runOf(a)&&<em>{paceOf(a.average_speed,settings)}{perUnit(settings)}</em>}</span>
   </button>):<p className="empty-note">Your synced activities will appear here.</p>}
  </section>,
 };
 return <div className="today">
  {settings.home.order.filter(k=>!settings.home.hidden.includes(k)).map(k=>modules[k])}
  <button className="customise-link" onClick={()=>nav('settings')}><Icon name="settings" size={17}/>Customise Today</button>
 </div>;
}

export function Welcome({url}){
 return <div className="welcome">
  <div className="welcome-poster"><Bend progress={78} score={78}/><div className="welcome-meta"><span>APEX</span><span>Running</span><span>Recovery</span></div></div>
  <div className="welcome-inner">
   <h1>Every run, <em>read well.</em></h1>
   <p>Recovery, your plan, every run in detail, race predictions and posters, with a coach who knows all of it.</p>
   <a className="welcome-cta" href={url}><span>Connect with Strava</span><Icon name="arrow"/></a>
   <small>Your existing Strava account, read-only. WHOOP and COROS connect later.</small>
  </div>
 </div>;
}

// Cloud sync, told quietly: a small toast above the tab bar. "Saved" fades on its
// own; a failed sync stays until you retry or dismiss it. Never pushes the page down.
export function SyncToast({status,onRetry}){
 const [shown,setShown]=useState(null);
 useEffect(()=>{
  const st=status?.state;
  if(st==='saved'){setShown({kind:'saved',text:'Saved'});const t=setTimeout(()=>setShown(null),1600);return()=>clearTimeout(t);}
  if(st==='pending'||st==='error'){setShown({kind:st,text:status.message||'Cloud sync needs a retry.'});return;}
  if(st==='idle')setShown(null);
 },[status]);
 if(!shown)return null;
 return <div className={`sync-toast is-${shown.kind}`} role="status" aria-live="polite">
  {shown.kind==='saved'?<Icon name="check" size={16}/>:<span className="sync-dot"/>}
  <span>{shown.text}</span>
  {shown.kind!=='saved'&&<><button onClick={onRetry}>Retry</button><button aria-label="Dismiss" onClick={()=>setShown(null)}><Icon name="close" size={14}/></button></>}
 </div>;
}

// Re-exported for screens that only need the HR helper.
export {heartRate};
