import {useDialog} from './ApexInteractions';
import {Fragment,useEffect,useRef,useState} from 'react';
import RecoverySculpture,{bandOf} from './RecoverySculpture';
import {localDate,addDays,mondayOf,prettyDate,surfaceFor,parseDay} from './apexDates';
import './ApexUI.css';

const paths={
 home:'M4 11.5 12 5l8 6.5V20H4z M9.5 20v-5h5v5',
 activity:'M3 12h4l3-7 4 14 3-7h4',
 plan:'M4 6h16 M4 12h16 M4 18h10 M18 16v4 M16 18h4',
 nutrition:'M7 3v8a3 3 0 0 0 6 0V3 M10 3v18 M17 3c-2.5 2-2.5 9 0 10v8',
 recovery:'M3 12h4l2-4 3 8 2-4h7',
 gym:'M2 12h2 M20 12h2 M5 8v8 M19 8v8 M8 6v12 M16 6v12 M8 12h8',
 coach:'M5 18V8a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9l-4 3z M9 10.5h6 M9 13.5h4',
 profile:'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 20a8 8 0 0 1 16 0',
 races:'M5 21V4 M5 4h11l-2 4 2 4H5',
 arrow:'M5 12h14 M13 6l6 6-6 6',
 plus:'M12 5v14 M5 12h14',
 more:'M5 12h.01 M12 12h.01 M19 12h.01',
 close:'M6 6l12 12 M18 6 6 18',
 sun:'M12 4V2 M12 22v-2 M4 12H2 M22 12h-2 M6 6 4.5 4.5 M19.5 19.5 18 18 M6 18l-1.5 1.5 M19.5 4.5 18 6 M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
 moon:'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
 coros:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
 check:'M5 12.5 10 17 19 7',
};
export function Icon({name,size=22}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.activity}/></svg>;}
export function Mark({size=26}){return <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true"><g fill="currentColor"><path d="M8 52 29 13c1.4-2.7 5.3-2.7 6.8 0l2.7 5L20 52Z"/><path d="m39 25 15 27H42.5L33.4 35Z"/></g></svg>;}

const NAV=[['home','Today'],['plan','Training'],['coach','Coach'],['nutrition','Fuel']];
const MORE=[['recovery','Recovery','Readiness, sleep and HRV'],['activity','Activities','Every run and session, results-board style'],['gym','Strength','Live workouts, rest timer, history'],['races','Races','Your calendar and primary goal'],['profile','You','Profile, connections, appearance']];
const TITLES={plan:['Training','Your week, lane by lane'],activity:['Activities','The results board'],recovery:['Recovery','How ready you are'],nutrition:['Fuel','What goes in'],gym:['Strength','Live sessions, rest timer, history'],coach:['Coach',''],profile:['You','Profile and connections'],races:['Races','Something to chase']};

export function Frame({page,nav,athlete,dark,setDark,preview,children}){
 const positions=useRef({}),previous=useRef(page),scroll=useRef(null),[menu,setMenu]=useState(false);
 useDialog(menu,()=>setMenu(false));
 useEffect(()=>{previous.current=page;if(scroll.current)scroll.current.scrollTop=positions.current[page]||0;setMenu(false);},[page]);
 const inMore=MORE.some(([id])=>id===page);
 const title=TITLES[page];
 return <div className={`apex-app${dark?' apex-dark':''}`}>
  <a className="skip-link" href="#main-content">Skip to content</a>
  <aside className="rail" aria-label="Main navigation">
   <button className="rail-brand" onClick={()=>nav('home')} aria-label="APEX home"><Mark size={28}/><span>APEX</span></button>
   <nav>{[...NAV,...MORE.map(([id,l])=>[id,l])].map(([id,label],i)=><Fragment key={id}>{i===NAV.length&&<hr/>}<button className={page===id?'is-on':''} aria-current={page===id?'page':undefined} onClick={()=>nav(id)}><span className="nav-ring"><Icon name={id} size={20}/></span><span>{label}</span></button></Fragment>)}</nav>
   <button className="rail-theme" onClick={()=>setDark(!dark)} aria-label={dark?'Use light appearance':'Use dark appearance'}><Icon name={dark?'sun':'moon'} size={18}/>{dark?'Light':'Dark'}</button>
  </aside>
  <div className="workspace" ref={scroll} onScroll={e=>{positions.current[previous.current]=e.currentTarget.scrollTop;}}>
   <header className="topbar">
    <button className="brand" onClick={()=>nav('home')} aria-label="APEX home"><Mark size={22}/><span>APEX</span></button>
    <div className="topbar-actions">
     {preview&&<span className="preview-chip">Preview · sample data</span>}
     <button className="round-button" onClick={()=>setDark(!dark)} aria-label={dark?'Use light appearance':'Use dark appearance'}><Icon name={dark?'sun':'moon'} size={18}/></button>
     <button className="avatar" onClick={()=>nav('profile')} aria-label="Your profile">{athlete?.firstname?.[0]||'A'}</button>
    </div>
   </header>
   <main className={`content screen-${page}`} id="main-content">
    {title&&page!=='coach'&&<div className="page-head"><h1>{title[0]}</h1>{title[1]&&<p>{title[1]}</p>}</div>}
    {children}
   </main>
   <footer className="foot"><Mark size={14}/><span>Progress is personal.</span></footer>
  </div>
  <nav className="dock" aria-label="Main navigation">
   {NAV.map(([id,label])=><button key={id} className={page===id?'is-on':''} aria-current={page===id?'page':undefined} onClick={()=>nav(id)}><span className="nav-ring"><Icon name={id} size={21}/></span><span>{label}</span></button>)}
   <button className={inMore||menu?'is-on':''} aria-expanded={menu} aria-haspopup="dialog" onClick={()=>setMenu(!menu)}><span className="nav-ring"><Icon name="more" size={24}/></span><span>More</span></button>
  </nav>
  {menu&&<div className="sheet-backdrop" onClick={e=>{if(e.target===e.currentTarget)setMenu(false);}}>
   <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="more-title">
    <div className="sheet-grip"/>
    <div className="sheet-head"><h2 id="more-title">More</h2><button className="round-button" onClick={()=>setMenu(false)} aria-label="Close"><Icon name="close" size={18}/></button></div>
    <div className="sheet-lanes">{MORE.map(([id,label,sub],i)=><button key={id} className={page===id?'is-on':''} onClick={()=>{nav(id);setMenu(false);}}><span className="lane-no">{i+1}</span><span className="sheet-icon"><Icon name={id} size={20}/></span><span className="sheet-copy"><strong>{label}</strong><small>{sub}</small></span><Icon name="arrow" size={18}/></button>)}</div>
   </section>
  </div>}
 </div>;
}

const num=(n,d=0)=>Number.isFinite(Number(n))?Number(n).toLocaleString('en-GB',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
const isRun=a=>a.type==='Run'||a.sport_type==='Run'||a.sport_type==='TrailRun';
const actDay=a=>(a.start_date_local||a.start_date||'').slice(0,10);
const pace=s=>{if(!s)return '—';const v=Math.round(1000/s);return `${Math.floor(v/60)}:${String(v%60).padStart(2,'0')}`;};

function useCountUp(value,ms=900){
 const [v,setV]=useState(value);
 useEffect(()=>{
  if(!Number.isFinite(value)||window.matchMedia('(prefers-reduced-motion: reduce)').matches){setV(value);return;}
  let raf,start;const from=0;
  const step=t=>{if(!start)start=t;const k=Math.min(1,(t-start)/ms);setV(from+(value-from)*(1-Math.pow(1-k,3)));if(k<1)raf=requestAnimationFrame(step);};
  raf=requestAnimationFrame(step);return()=>cancelAnimationFrame(raf);
 },[value,ms]);
 return v;
}

function datedPlan(plan){return (plan?.sessions||[]).map((s,i)=>{let d=s.date;if(!d&&plan?.startDate)d=addDays(plan.startDate,i);return {...s,date:d,index:i};});}

function TodayHero({session,plan,weekDays,today,nav,planUnavailable}){
 const type=planUnavailable?null:session?.type;
 const sf=surfaceFor(type||(plan?'Rest':'Long Run'));
 const km=parseFloat(session?.dist)||0;
 const counted=useCountUp(km);
 const lane=(parseDay(today).getDay()+6)%7+1;
 let label,big,unit,line,cta,ctaGo;
 if(planUnavailable){label='Plan unavailable';big='—';line='Your saved plan could not load. Retry saved data at the top of the page. Nothing has been overwritten.';}
 else if(!plan){label='No plan yet';big='Build';unit='your week';line='Ask your coach for a week built around your recovery, your races and your life.';cta='Build with Coach';ctaGo='coach';}
 else if(!session){label='Nothing scheduled';big='Free';unit='day';line='No session on the plan today. Move easy, or add something yourself.';cta='Open training';ctaGo='plan';}
 else if(type==='Rest'){label='Rest day';big='Rest';line=session.notes||'Recovery is part of the work. Sleep, eat well, stay loose.';cta='Open training';ctaGo='plan';}
 else if(type==='Gym'){label='Strength';big='Lift';unit='day';line=session.notes||'Strength work to support your running.';cta='Start workout';ctaGo='gym';}
 else{label=sf.name;big=km>=10?Math.round(counted):counted.toFixed(km%1?1:0);unit='km';line=[session.pace&&session.pace!=='N/A'?`${session.pace.replace(/\/?km$/,'')} /km`:'',session.notes].filter(Boolean).join('. ');cta='Open session';ctaGo='plan';}
 const isWord=typeof big==='string'&&!/^[\d.]+$/.test(big);
 return <section className="hero" style={{'--surface':sf.bg,'--surface-ink':sf.ink}} aria-label={`Today: ${label}`}>
  <svg className="hero-lines" viewBox="0 0 420 340" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">{[0,1,2,3,4,5].map(i=>{const t=20+i*20,b=320-i*20,r=(b-t)/2;return <path key={i} d={`M-10 ${b} H${280} A${r} ${r} 0 0 0 ${280} ${t} H-10`}/>;})}</svg>
  <div className="hero-top"><span className="lane-tag">Lane {lane}</span><span>{prettyDate(today,{weekday:'long',day:'numeric',month:'long'})}</span>{session?.done&&<span className="hero-done"><Icon name="check" size={14}/>Done</span>}</div>
  <div className="hero-body">
   <p className="hero-label">{label}</p>
   <p className={`hero-figure${isWord?' is-word':''}`}><span>{big}</span>{unit&&<small>{unit}</small>}</p>
   {line&&<p className="hero-line">{line}</p>}
   {session?.shoe&&session.shoe!=='N/A'&&<p className="hero-shoe">In the {session.shoe}</p>}
  </div>
  <div className="hero-foot">
   <div className="hero-ruler" aria-label="This week">{weekDays.map(d=><span key={d.key} className={`${d.key===today?'is-today':''} ${d.done?'is-done':d.planned?'is-planned':''}`} title={`${d.label}: ${d.type||'nothing planned'}`}><i/><b>{d.label[0]}</b></span>)}</div>
   {cta&&<button className="hero-cta" onClick={()=>nav(ctaGo)}>{cta}<Icon name="arrow" size={18}/></button>}
  </div>
 </section>;
}

export function RecoveryHero({whoop,whoopOk,connectWhoop,nav}){
 const record=whoop?.recoveries?.records?.[0],raw=record?.score?.recovery_score,score=raw==null?null:Math.round(raw);
 const sleep=whoop?.sleeps?.records?.[0]?.score,band=bandOf(score);
 const count=useCountUp(score??0,1300);
 return <section className={`card lap-card band-${band.tone}`}>
  <div className="card-head"><h2>Readiness</h2><span className="source"><i/>{whoopOk?'WHOOP':'Not connected'}</span></div>
  <div className="lap-stage"><RecoverySculpture score={score}/><div className="lap-score"><strong>{score==null?'—':Math.round(count)}<sup>{score==null?'':'%'}</sup></strong><span>{band.label}</span></div></div>
  <dl className="stat-row">
   <div><dt>HRV</dt><dd>{record?.score?.hrv_rmssd_milli==null?'—':num(record.score.hrv_rmssd_milli)}<small>ms</small></dd></div>
   <div><dt>Resting HR</dt><dd>{record?.score?.resting_heart_rate??'—'}<small>bpm</small></dd></div>
   <div><dt>Sleep</dt><dd>{sleep?.sleep_performance_percentage==null?'—':Math.round(sleep.sleep_performance_percentage)}<small>%</small></dd></div>
  </dl>
  <button className="card-link" onClick={whoopOk?()=>nav('recovery'):connectWhoop}>{whoopOk?'Recovery detail':'Connect WHOOP'}<Icon name="arrow" size={17}/></button>
 </section>;
}

function WeekLanes({days,today,nav}){
 const max=Math.max(...days.map(d=>Math.max(d.plannedKm,d.km)),5);
 const done=days.reduce((n,d)=>n+d.km,0),planned=days.reduce((n,d)=>n+d.plannedKm,0);
 return <section className="card lanes-card">
  <div className="card-head"><h2>This week</h2><button className="text-button" onClick={()=>nav('plan')}>Training<Icon name="arrow" size={15}/></button></div>
  <p className="lanes-total"><strong>{num(done,1)}</strong><span>of {num(planned,1)} km planned</span></p>
  <ol className="lanes">{days.map((d,i)=><li key={d.key} className={`${d.key===today?'is-today':''}${d.key>today?' is-future':''}`}>
   <span className="lane-no">{i+1}</span>
   <span className="lane-day"><b>{d.label}</b>{parseDay(d.key).getDate()}</span>
   <span className="lane-track" style={{'--lane':d.color}}>
    {d.plannedKm>0&&<i className="lane-plan" style={{width:`${d.plannedKm/max*100}%`}}/>}
    {d.km>0&&<i className="lane-run" style={{width:`${Math.max(3,d.km/max*100)}%`}}/>}
    {!d.plannedKm&&!d.km&&<em>{d.type||'—'}</em>}
    {d.type&&(d.plannedKm||d.km)?<em className="lane-type">{d.type}</em>:null}
   </span>
   <span className="lane-km">{d.km>0?num(d.km,1):d.plannedKm>0?num(d.plannedKm,1):''}<small>{d.km>0||d.plannedKm>0?'km':''}</small></span>
  </li>)}</ol>
  <div className="lanes-key"><span><i className="k-run"/>Ran (Strava)</span><span><i className="k-plan"/>Planned</span></div>
 </section>;
}

export function Home({acts=[],whoop,whoopOk,connectWhoop,athlete,plan,nav,userPrefs,prefsUnavailable=false,planUnavailable=false}){
 const now=new Date(),today=localDate(now),monday=mondayOf(today);
 const sessions=datedPlan(plan);
 const session=sessions.find(s=>s.date===today&&s.type!=='Rest'&&!s.done)||sessions.find(s=>s.date===today);
 const days=Array.from({length:7},(_,i)=>{const key=addDays(monday,i),ds=sessions.filter(s=>s.date===key),main=ds.find(s=>s.type!=='Rest')||ds[0];
  const km=acts.filter(a=>isRun(a)&&actDay(a)===key).reduce((s,a)=>s+(a.distance||0)/1000,0);
  return {key,label:prettyDate(key,{weekday:'short'}),type:main?.type,color:surfaceFor(main?.type).bg,plannedKm:ds.filter(s=>!['Rest','Gym'].includes(s.type)).reduce((n,s)=>n+(parseFloat(s.dist)||0),0),km,planned:!!main&&main.type!=='Rest',done:ds.length>0&&ds.filter(s=>s.type!=='Rest').every(s=>s.done)&&ds.some(s=>s.type!=='Rest')};});
 const food=userPrefs?.nutrition?.[today]||{},targets={kcal:3000,protein:140,carbs:300,...userPrefs?.nutritionTargets};
 const recent=[...acts].sort((a,b)=>new Date(b.start_date_local||b.start_date)-new Date(a.start_date_local||a.start_date)).slice(0,4);
 const h=now.getHours(),greet=h<5?'Late one':h<12?'Morning':h<18?'Afternoon':'Evening';
 const rec=whoop?.recoveries?.records?.[0]?.score?.recovery_score;
 const summary=[session?(session.type==='Rest'?'Rest day on the plan':`${surfaceFor(session.type).name} on the plan`):plan?'Nothing on the plan today':null,rec!=null?`recovery ${Math.round(rec)}%`:null].filter(Boolean).join(' · ');
 return <div className="today">
  <div className="today-top"><h1>{greet}{athlete?.firstname?`, ${athlete.firstname}`:''}.</h1>{summary&&<p>{summary.charAt(0).toUpperCase()+summary.slice(1)}.</p>}</div>
  <div className="today-grid">
   <TodayHero session={session} plan={plan} weekDays={days} today={today} nav={nav} planUnavailable={planUnavailable}/>
   <RecoveryHero {...{whoop,whoopOk,connectWhoop,nav}}/>
   <WeekLanes days={days} today={today} nav={nav}/>
   {!prefsUnavailable&&<section className="card fuel-card">
    <div className="card-head"><h2>Fuel</h2><button className="text-button" onClick={()=>nav('nutrition')}>Log a meal<Icon name="plus" size={15}/></button></div>
    <p className="fuel-big"><strong>{num(Number(food.kcal||0))}</strong><span>of {num(targets.kcal)} kcal</span></p>
    {[['kcal','Energy','kcal'],['protein','Protein','g'],['carbs','Carbs','g']].map(([k,l,u])=>{const v=Number(food[k]||0),pct=Math.min(110,v/targets[k]*100);return <div className={`fuel-lane fuel-${k}`} key={k}><span>{l}</span><span className="fuel-bar"><i style={{width:`${Math.min(100,pct)}%`}}/><b aria-hidden="true"/></span><span className="fuel-val">{num(v)}<small>/{num(targets[k])}{u}</small></span></div>;})}
   </section>}
   <section className="card results-card">
    <div className="card-head"><h2>Results</h2><button className="text-button" onClick={()=>nav('activity')}>All<Icon name="arrow" size={15}/></button></div>
    {recent.length?<ol className="results">{recent.map((a,i)=><li key={a.id||i}><button onClick={()=>nav('activity',a.id)}>
     <span className="res-pos">{String(i+1).padStart(2,'0')}</span>
     <span className="res-name"><b>{a.name}</b><small>{new Date(a.start_date_local||a.start_date).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})} · {isRun(a)?'Run':(a.type||'Session').replace(/([a-z])([A-Z])/g,'$1 $2')}</small></span>
     <span className="res-num">{a.distance?num(a.distance/1000,1):Math.round((a.moving_time||0)/60)}<small>{a.distance?'km':'min'}</small></span>
     <span className="res-pace">{isRun(a)?pace(a.average_speed):''}<small>{isRun(a)?'/km':''}</small></span>
    </button></li>)}</ol>:<p className="empty-note">Your synced activities will appear here.</p>}
   </section>
  </div>
 </div>;
}

export function Welcome({url}){
 return <div className="welcome">
  <svg className="welcome-lines" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">{[0,1,2,3,4,5,6,7].map(i=>{const t=140+i*24,b=620-i*24,r=(b-t)/2;return <path key={i} d={`M-40 ${b} H${230} A${r} ${r} 0 0 0 ${230} ${t} H-40`}/>;})}</svg>
  <div className="welcome-inner">
   <div className="welcome-brand"><Mark size={40}/><span>APEX</span></div>
   <h1>Progress<br/>is personal.</h1>
   <p>Training, recovery, strength and fuel. One place, built around how you actually train.</p>
   <a className="welcome-cta" href={url}>Connect with Strava<Icon name="arrow"/></a>
   <small>Your existing Strava account. Read-only.</small>
  </div>
 </div>;
}
