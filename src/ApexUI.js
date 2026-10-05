import {useDialog} from './ApexInteractions';
import {Fragment,useEffect,useRef,useState} from 'react';
import {localDate,addDays,mondayOf,prettyDate,surfaceFor} from './apexDates';
import {SkyHero} from './ApexRidge';
import {focusRace,raceDate} from './ApexGoals';
import './ApexUI.css';

const paths={
 home:'M3 19h18 M5 19l5.5-9 3.5 5 2.5-3.5L20 19',
 activity:'M3 12h4l3-7 4 14 3-7h4',
 plan:'M5 5h14v15H5z M5 10h14 M9 3v4 M15 3v4',
 nutrition:'M7 3v8a3 3 0 0 0 6 0V3 M10 3v18 M17 3c-2.5 2-2.5 9 0 10v8',
 recovery:'M3 17h18 M7 17a5 5 0 0 1 10 0 M12 6V4 M5.6 9.6 4.2 8.2 M18.4 9.6l1.4-1.4',
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
};
export function Icon({name,size=22}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.activity}/></svg>;}
// The mark: a summit with the sun resting beside it.
export function Mark({size=26}){return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true"><path d="M5 54 27.6 18.4c2-3.2 6.7-3.2 8.8 0L59 54Z" fill="currentColor"/><circle cx="48" cy="17" r="7.5" fill="#FFC23A"/></svg>;}

const NAV=[['home','Today'],['plan','Training'],['activity','Activity'],['coach','Coach']];
const MORE=[['recovery','Recovery','Sleep, HRV and the last 30 mornings'],['nutrition','Fuel','Meals, targets and body weight'],['gym','Strength','Live workouts, rest timer, history'],['races','Races','Your calendar and primary goal'],['profile','You','Profile, connections, appearance']];
const TITLES={plan:['Training',''],activity:['Activity',''],recovery:['Recovery',''],nutrition:['Fuel',''],gym:['Strength',''],coach:['Coach',''],profile:['You',''],races:['Races','']};

export function Frame({page,nav,athlete,dark,setDark,preview,children}){
 const positions=useRef({}),previous=useRef(page),scroll=useRef(null),[menu,setMenu]=useState(false),[solid,setSolid]=useState(false);
 useDialog(menu,()=>setMenu(false));
 useEffect(()=>{previous.current=page;if(scroll.current)scroll.current.scrollTop=positions.current[page]||0;setMenu(false);setSolid((positions.current[page]||0)>8);},[page]);
 const inMore=MORE.some(([id])=>id===page);
 const title=TITLES[page],home=page==='home';
 const onScroll=e=>{const t=e.currentTarget.scrollTop;positions.current[previous.current]=t;const s=home?t>window.innerHeight*.42:t>8;if(s!==solid)setSolid(s);};
 return <div className={`apex-app${dark?' apex-dark':''}${home?' is-home':''}`}>
  <a className="skip-link" href="#main-content">Skip to content</a>
  <aside className="rail" aria-label="Main navigation">
   <button className="rail-brand" onClick={()=>nav('home')} aria-label="APEX home"><Mark size={28}/><span>APEX</span></button>
   <nav>{[...NAV,...MORE.map(([id,l])=>[id,l])].map(([id,label],i)=><Fragment key={id}>{i===NAV.length&&<hr/>}<button className={page===id?'is-on':''} aria-current={page===id?'page':undefined} onClick={()=>nav(id)}><Icon name={id} size={20}/><span>{label}</span></button></Fragment>)}</nav>
   <button className="rail-theme" onClick={()=>setDark(!dark)} aria-label={dark?'Use light appearance':'Use dark appearance'}><Icon name={dark?'sun':'moon'} size={18}/>{dark?'Light':'Dark'}</button>
  </aside>
  <div className="workspace" ref={scroll} onScroll={onScroll}>
   <header className={`topbar${solid?' is-solid':''}`}>
    <button className="brand" onClick={()=>nav('home')} aria-label="APEX home"><Mark size={22}/><span>APEX</span></button>
    {!home&&title&&<span className="topbar-title" aria-hidden="true">{title[0]}</span>}
    <div className="topbar-actions">
     {preview&&<span className="preview-chip">Sample data</span>}
     <button className="glass-button avatar" onClick={()=>nav('profile')} aria-label="Your profile">{athlete?.firstname?.[0]||'A'}</button>
    </div>
   </header>
   <main className={`content screen-${page}`} id="main-content">
    {title&&page!=='coach'&&<div className="page-head"><h1>{title[0]}</h1>{title[1]&&<p>{title[1]}</p>}</div>}
    {children}
   </main>
  </div>
  <nav className="dock" aria-label="Main navigation">
   {NAV.map(([id,label])=><button key={id} className={page===id?'is-on':''} aria-current={page===id?'page':undefined} onClick={()=>nav(id)}><Icon name={id} size={23}/><span>{label}</span></button>)}
   <button className={inMore||menu?'is-on':''} aria-expanded={menu} aria-haspopup="dialog" onClick={()=>setMenu(!menu)}><Icon name="more" size={25}/><span>More</span></button>
  </nav>
  {menu&&<div className="sheet-backdrop" onClick={e=>{if(e.target===e.currentTarget)setMenu(false);}}>
   <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="more-title">
    <div className="sheet-grip"/>
    <div className="sheet-head"><h2 id="more-title">More</h2><button className="glass-button" onClick={()=>setMenu(false)} aria-label="Close"><Icon name="close" size={18}/></button></div>
    <div className="sheet-list">{MORE.map(([id,label,sub])=><button key={id} className={page===id?'is-on':''} onClick={()=>{nav(id);setMenu(false);}}><Icon name={id} size={22}/><span><strong>{label}</strong><small>{sub}</small></span><Icon name="chevron" size={17}/></button>)}</div>
   </section>
  </div>}
 </div>;
}

const num=(n,d=0)=>Number.isFinite(Number(n))?Number(n).toLocaleString('en-GB',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
const isRun=a=>a.type==='Run'||a.sport_type==='Run'||a.sport_type==='TrailRun';
const actDay=a=>(a.start_date_local||a.start_date||'').slice(0,10);
const pace=s=>{if(!s)return '—';const v=Math.round(1000/s);return `${Math.floor(v/60)}:${String(v%60).padStart(2,'0')}`;};
const hm=ms=>ms==null?null:`${Math.floor(ms/3600000)} h ${Math.round(ms%3600000/60000)} m`;

function datedPlan(plan){return (plan?.sessions||[]).map((s,i)=>{let d=s.date;if(!d&&plan?.startDate)d=addDays(plan.startDate,i);return {...s,date:d,index:i};});}

function sessionHeadline(session,plan,planUnavailable){
 if(planUnavailable)return {meta:'Plan unavailable',big:'Plan not loaded',line:'Your saved plan could not load. Retry saved data at the top of the page. Nothing has been overwritten.'};
 if(!plan)return {meta:'No plan yet',big:'Build your week',line:'Ask your coach for a week built around your recovery, your races and your life.',cta:['Build with Coach','coach']};
 if(!session)return {meta:'Nothing scheduled',big:'Free day',line:'No session on the plan today. Move easy, or add something yourself.',cta:['Open training','plan']};
 const type=session.type,km=parseFloat(session.dist)||0;
 if(type==='Rest')return {meta:'Rest day',big:'Rest',line:session.notes||'Recovery is part of the work. Sleep, eat well, stay loose.',cta:['Open training','plan']};
 if(type==='Gym')return {meta:'Strength',big:'Strength',line:session.notes||'Strength work to support your running.',cta:['Start workout','gym']};
 const paceTxt=session.pace&&session.pace!=='N/A'?`${session.pace.replace(/\/?km$/,'')} /km`:'';
 return {meta:['Today',paceTxt,session.shoe&&session.shoe!=='N/A'?session.shoe:''].filter(Boolean).join(' · '),big:`${num(km,km%1?1:0)} km ${surfaceFor(type).name.toLowerCase()}`,line:session.notes,cta:['Open session','plan']};
}

export function Home({acts=[],whoop,whoopOk,connectWhoop,plan,nav,userPrefs,prefsUnavailable=false,planUnavailable=false}){
 const now=new Date(),today=localDate(now),monday=mondayOf(today);
 const sessions=datedPlan(plan);
 const session=sessions.find(s=>s.date===today&&s.type!=='Rest'&&!s.done)||sessions.find(s=>s.date===today);
 const days=Array.from({length:7},(_,i)=>{const key=addDays(monday,i),ds=sessions.filter(s=>s.date===key),main=ds.find(s=>s.type!=='Rest')||ds[0];
  const km=acts.filter(a=>isRun(a)&&actDay(a)===key).reduce((s,a)=>s+(a.distance||0)/1000,0);
  return {key,label:prettyDate(key,{weekday:'short'}),type:main?.type,plannedKm:ds.filter(s=>!['Rest','Gym'].includes(s.type)).reduce((n,s)=>n+(parseFloat(s.dist)||0),0),km};});
 const todayIndex=days.findIndex(d=>d.key===today);
 const ran=days.reduce((n,d)=>n+d.km,0),planned=days.reduce((n,d)=>n+d.plannedKm,0);
 const food=userPrefs?.nutrition?.[today]||{},targets={kcal:3000,protein:140,carbs:300,...userPrefs?.nutritionTargets};
 const recent=[...acts].sort((a,b)=>new Date(b.start_date_local||b.start_date)-new Date(a.start_date_local||a.start_date)).slice(0,3);
 const recs=whoop?.recoveries?.records||[],rec=recs[0]?.score,score=rec?.recovery_score==null?null:Math.round(rec.recovery_score);
 const sleep=whoop?.sleeps?.records?.[0]?.score,stage=sleep?.stage_summary;
 const asleep=stage?(stage.total_in_bed_time_milli||0)-(stage.total_awake_time_milli||0):null;
 const prevHrv=recs.slice(1,8).map(r=>r.score?.hrv_rmssd_milli).filter(Number.isFinite),hrvBase=prevHrv.length?prevHrv.reduce((a,b)=>a+b,0)/prevHrv.length:null;
 const hrvDelta=hrvBase&&Number.isFinite(rec?.hrv_rmssd_milli)?Math.round((rec.hrv_rmssd_milli/hrvBase-1)*100):null;
 const signals=[asleep?`${hm(asleep)} asleep`:null,Number.isFinite(rec?.hrv_rmssd_milli)?`HRV ${Math.round(rec.hrv_rmssd_milli)} ms${hrvDelta!=null?`, ${Math.abs(hrvDelta)}% ${hrvDelta>=0?'above':'below'} your week`:''}`:null,rec?.resting_heart_rate!=null?`RHR ${Math.round(rec.resting_heart_rate)}`:null].filter(Boolean).join(' · ');
 const todayRun=acts.filter(a=>isRun(a)&&actDay(a)===today).sort((a,b)=>new Date(b.start_date_local||b.start_date)-new Date(a.start_date_local||a.start_date))[0];
 const runTime=a=>new Date(a.start_date_local||a.start_date).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:a.start_date_local?'UTC':undefined});
 // Once today's run is on Strava, Today shows what you did rather than what was planned.
 const head=todayRun?{meta:`Done at ${runTime(todayRun)} · ${session&&!['Rest','Gym'].includes(session.type)?`planned ${num(parseFloat(session.dist)||0,1)} km`:'from Strava'}`,big:`${num(todayRun.distance/1000,2)} km`,line:`${todayRun.name} at ${pace(todayRun.average_speed)} /km${todayRun.average_heartrate?`, ${Math.round(todayRun.average_heartrate)} bpm`:''}.`,cta:['View run','run']}:sessionHeadline(session,plan,planUnavailable);
 const goal=focusRace(userPrefs?.races),goalDays=goal&&raceDate(goal)?Math.ceil((new Date(goal.date+'T12:00:00')-new Date(today+'T12:00:00'))/86400000):null;
 const checkIn=()=>{window.dispatchEvent(new CustomEvent('apex-checkin'));setTimeout(()=>document.getElementById('checkin')?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'}),60);};
 const checkedIn=!!userPrefs?.journal?.[today];
 return <div className="today">
  <SkyHero score={whoopOk?score:null} days={days} todayIndex={todayIndex} onScore={whoopOk?()=>nav('recovery'):undefined} dateLabel={prettyDate(today,{weekday:'short',day:'numeric',month:'short'})}>
   {whoopOk?(signals&&<p className="sky-signals">{signals}</p>):<button className="sky-connect" onClick={connectWhoop}>Connect WHOOP<Icon name="arrow" size={17}/></button>}
  </SkyHero>
  <section className="today-session" aria-label="Today’s session">
   <p className="meta">{head.meta}{session?.done&&<span className="done-mark"><Icon name="check" size={14}/>Done</span>}</p>
   <h2 className="display today-big">{head.big}</h2>
   {head.line&&<p className="today-note">{head.line}</p>}
   <div className="today-actions">
    {!prefsUnavailable&&<button className="primary-action" onClick={checkIn}><span className={`sun-dot${checkedIn?' is-done':''}`}/>{checkedIn?'Checked in':'Check in'}</button>}
    {head.cta?.[1]!=='run'&&<button className="secondary-action" onClick={()=>nav('coach')}>Ask coach</button>}
    {head.cta&&head.cta[1]==='run'&&<button className="secondary-action" onClick={()=>nav('activity',todayRun.id)}>{head.cta[0]}</button>}
    {head.cta&&head.cta[1]==='gym'&&<button className="secondary-action" onClick={()=>nav('gym')}>{head.cta[0]}</button>}
   </div>
  </section>
  <section className="today-rows" aria-label="Your day">
   <button className="list-row" onClick={()=>nav('plan')}><span className="row-copy"><small>This week</small><b>{num(ran,1)} of {num(planned,1)} km</b></span><span className="row-figure">{planned?Math.round(ran/planned*100):0}<small>%</small></span><Icon name="chevron" size={16}/></button>
   {goal&&<button className="list-row" onClick={()=>nav('races')}><span className="row-copy"><small>{goal.name}{goal.target?` · ${goal.target}`:''}</small><b>{raceDate(goal)?prettyDate(goal.date,{day:'numeric',month:'long'}):goal.date||'Date to be decided'}</b></span>{goalDays!=null&&<span className="row-figure">{goalDays}<small>days</small></span>}<Icon name="chevron" size={16}/></button>}
   {!prefsUnavailable&&<button className="list-row" onClick={()=>nav('nutrition')}><span className="row-copy"><small>Fuel today</small><b>{num(Number(food.kcal||0))} of {num(targets.kcal)} kcal</b></span><span className="row-figure">{num(Number(food.protein||0))}<small>g protein</small></span><Icon name="chevron" size={16}/></button>}
  </section>
  <section className="today-recent" aria-labelledby="recent-title">
   <div className="section-head"><h2 id="recent-title">Recent</h2><button className="text-button" onClick={()=>nav('activity')}>All activity<Icon name="arrow" size={15}/></button></div>
   {recent.length?recent.map((a,i)=><button key={a.id||i} className="list-row" onClick={()=>nav('activity',a.id)}>
    <span className="row-copy"><small>{new Date(a.start_date_local||a.start_date).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})} · {isRun(a)?'Run':(a.type||'Session').replace(/([a-z])([A-Z])/g,'$1 $2')}</small><b>{a.name}</b></span>
    <span className="row-figure">{a.distance?num(a.distance/1000,2):Math.round((a.moving_time||0)/60)}<small>{a.distance?'km':'min'}</small>{isRun(a)&&<em>{pace(a.average_speed)} /km</em>}</span>
   </button>):<p className="empty-note">Your synced activities will appear here.</p>}
  </section>
 </div>;
}

export function Welcome({url}){
 return <div className="welcome">
  <SkyHero decor score={78} days={[{plannedKm:8},{plannedKm:4},{plannedKm:11},{plannedKm:7},{plannedKm:3},{plannedKm:16},{plannedKm:6}]} todayIndex={5}/>
  <div className="welcome-inner">
   <div className="welcome-brand"><Mark size={34}/><span>APEX</span></div>
   <h1>Read the morning. Then run.</h1>
   <p>Recovery, sleep, your plan and every run, with a coach who knows all of it.</p>
   <a className="welcome-cta" href={url}>Connect with Strava<Icon name="arrow"/></a>
   <small>Your existing Strava account, read-only. WHOOP and COROS connect later.</small>
  </div>
 </div>;
}
