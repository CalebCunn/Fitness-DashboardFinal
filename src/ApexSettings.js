// APEX · Customise. Every choice lives in userPrefs.settings, so it syncs with the
// rest of your saved data. Missing values always fall back to DEFAULTS.
import {useEffect,useMemo,useState} from 'react';
import {Icon} from './ApexUI';
import {historyInfo,clearHistory} from './strava';
import {PUBLIC,accessCode,setAccessCode,ownKey,setOwnKey,testKey} from './apexAccess';
import {signOut,deleteAccount,accountSummary} from './apexAuth';
const FREE_LIMIT=+(process.env.REACT_APP_FREE_MESSAGES||30),PRO_LIMIT=+(process.env.REACT_APP_PRO_MESSAGES||400);

export const HOME_MODULES={
 recovery:['Recovery poster','Score, sleep and HRV'],
 session:['Today’s session','The plan, the call, energy'],
 day:['Your day','Run window, refuel and bedtime on one lap'],
 stats:['Stats row','Three numbers of your choice'],
 week:['This week','Planned and run, by day'],
 race:['Next race','Countdown and goal'],
 checkin:['Check-in','Soreness, stress, notes'],
 fuel:['Fuel','Today’s calories and protein'],
 results:['Results','Your last three activities'],
};
export const STATS={
 form:'Form',fitness:'Fitness',marathon:'Marathon prediction',half:'Half prediction',tenk:'10K prediction',fivek:'5K prediction',
 week:'This week',month:'This month',year:'This year',streak:'Run streak',hrv:'HRV',sleep:'Sleep',rhr:'Resting HR',shoe:'Shoe mileage',race:'Race countdown',
};
export const TAB_CHOICES={plan:'Training',activity:'Activity',coach:'Coach',performance:'Performance',shoes:'Shoes',recovery:'Recovery',nutrition:'Fuel',gym:'Strength'};
export const ACCENTS={
 cobalt:{name:'Cobalt',light:'#1C3BDB',dark:'#3553F5'},
 red:{name:'Signal red',light:'#D2311E',dark:'#F0533E'},
 green:{name:'Racing green',light:'#17694A',dark:'#2E9C6E'},
 ink:{name:'Ink',light:'#151A2E',dark:'#2C3350'},
};
// The two looks: Apex (racing green, cream and gold, the default) and the original Swiss cobalt poster.
export const LOOKS={apex:'Apex green',swiss:'Swiss poster'};
export const POSTER_STYLES={route:'Route',elevation:'Elevation',splits:'Splits'};
export const PB_DISTANCES=[['1K',1000],['1 mile',1609.34],['5K',5000],['10K',10000],['Half',21097.5],['Marathon',42195]];

export const DEFAULTS={
 home:{order:Object.keys(HOME_MODULES),hidden:['fuel']},
 stats:['form','marathon','week'],
 tabs:['plan','activity','coach'],
 look:'apex',todayPoster:'lanes',accent:'cobalt',units:'km',
 hr:{max:null,rest:null,model:'reserve'},
 predictor:{weeks:8},
 pbs:[],goals:{},shoes:{},
 poster:'route',
 hiddenTypes:['Walk'],
};

export function readSettings(userPrefs){
 const s=userPrefs?.settings||{};
 // New modules slot in after the module they follow by default, not at the end.
 const order=(s.home?.order||[]).filter(k=>HOME_MODULES[k]);Object.keys(HOME_MODULES).forEach((k,i,all)=>{if(order.includes(k))return;const prev=all.slice(0,i).reverse().find(x=>order.includes(x));order.splice(prev?order.indexOf(prev)+1:0,0,k);});
 return {...DEFAULTS,...s,home:{order,hidden:s.home?.hidden||DEFAULTS.home.hidden},hr:{...DEFAULTS.hr,...s.hr},predictor:{...DEFAULTS.predictor,...s.predictor},
  hiddenTypes:Array.isArray(s.hiddenTypes)?s.hiddenTypes:DEFAULTS.hiddenTypes,
  stats:(s.stats||DEFAULTS.stats).filter(k=>STATS[k]).slice(0,3),tabs:(s.tabs||DEFAULTS.tabs).filter(k=>TAB_CHOICES[k]).slice(0,3),pbs:s.pbs||[],goals:s.goals||{},shoes:s.shoes||{}};
}

// ── Units ──
const MI=1609.34;
export const unitsOf=settings=>settings?.units==='mi'?'mi':'km';
export function dist(m,settings,d=2){if(!Number.isFinite(m))return '—';const v=unitsOf(settings)==='mi'?m/MI:m/1000;return v.toFixed(d);}
export function paceOf(mps,settings){if(!mps||!Number.isFinite(mps)||mps<=0)return '—';const per=unitsOf(settings)==='mi'?MI:1000;const v=Math.round(per/mps);return `${Math.floor(v/60)}:${String(v%60).padStart(2,'0')}`;}
export const perUnit=settings=>`\u2009/${unitsOf(settings)}`;

// ── Heart rate: automatic, overridable ──
export function heartRate(settings,acts=[],whoop){
 const autoMax=Math.max(0,...acts.map(a=>a.max_heartrate||0))||null;
 const rhr=(whoop?.recoveries?.records||[]).slice(0,7).map(r=>r.score?.resting_heart_rate).filter(Number.isFinite).sort((a,b)=>a-b);
 const autoRest=rhr.length?rhr[Math.floor(rhr.length/2)]:null;
 return {max:settings?.hr?.max||autoMax,rest:settings?.hr?.rest||autoRest,autoMax,autoRest,model:settings?.hr?.model||'reserve',maxSet:!!settings?.hr?.max,restSet:!!settings?.hr?.rest};
}

// Times can be typed as digits only (1843 → 18:43, 12410 → 1:24:10), so the
// iPhone number pad works; colons or full stops are accepted too.
export function formatDigits(text){
 const d=String(text||'').replace(/\D/g,'').replace(/^0+(?=\d{3})/,'').slice(0,6);
 if(d.length<=2)return d;
 if(d.length<=4)return `${d.slice(0,-2)}:${d.slice(-2)}`;
 return `${d.slice(0,-4)}:${d.slice(-4,-2)}:${d.slice(-2)}`;
}
export function parseTime(text){
 let t=String(text||'').trim().replace(/\./g,':');
 if(t&&!t.includes(':'))t=formatDigits(t);
 const p=t.split(':').map(Number);if(!p.length||p.some(x=>!Number.isFinite(x)||x<0))return null;
 if(p.slice(1).some(x=>x>=60))return null;
 if(p.length===3)return p[0]*3600+p[1]*60+p[2];if(p.length===2)return p[0]*60+p[1];return null;
}
export const fmtTime=s=>{if(!Number.isFinite(s))return '';s=Math.round(s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`:`${m}:${String(x).padStart(2,'0')}`;};

export function useSettings(userPrefs,onSavePrefs){
 const settings=useMemo(()=>readSettings(userPrefs),[userPrefs]);
 const update=patch=>onSavePrefs?.({...userPrefs,settings:{...(userPrefs?.settings||{}),...(typeof patch==='function'?patch(settings):patch)}});
 return [settings,update];
}

export function TimeInput({value,onCommit,placeholder,label}){
 const [text,setText]=useState(Number.isFinite(value)?fmtTime(value):'');
 return <input inputMode="numeric" pattern="[0-9:]*" autoComplete="off" aria-label={label} placeholder={placeholder} value={text}
  onChange={e=>setText(formatDigits(e.target.value))} onBlur={()=>onCommit?.(parseTime(text))}/>;
}

function HistoryRow(){
 const h=historyInfo();
 if(!h)return null;
 return <div className="set-row"><span><b>Strava history</b><small>{h.count.toLocaleString('en-GB')} activities{h.oldest?` back to ${new Date(h.oldest).toLocaleDateString('en-GB',{month:'short',year:'numeric'})}`:''}{h.complete?'':' · still syncing older runs'}</small></span><button className="secondary-action set-small-btn" onClick={()=>{clearHistory();window.location.reload();}}>Re-sync all</button></div>;
}

function Section({title,note,children}){return <section className="set-section"><div className="set-head"><h2>{title}</h2>{note&&<p>{note}</p>}</div>{children}</section>;}

// Coach access: an access code (owner site) and/or the user's own Anthropic key (stays on this device).
function CoachAccess(){
 const [code,setCode]=useState(accessCode()),[key,setKey]=useState(ownKey()),[saved,setSaved]=useState('');
 const save=()=>{setAccessCode(code);setOwnKey(key.trim());setSaved('Saved on this device.');};
 return <Section title="Coach and AI" note={PUBLIC?'The coach includes a monthly allowance. Add your own Anthropic key for unlimited use, billed to your Anthropic account. It stays on this device and is sent only to Anthropic.':'Your coach is locked with an access code. Enter it once on each device. Or add your own Anthropic key, which is sent only to Anthropic.'}>
  {!PUBLIC&&<label className="set-field">Access code<input type="password" autoComplete="off" value={code} onChange={e=>{setCode(e.target.value);setSaved('');}} placeholder="Set as APEX_ACCESS_CODE on Netlify"/></label>}
  <label className="set-field">Your Anthropic API key <small>optional</small><input type="password" autoComplete="off" value={key} onChange={e=>{setKey(e.target.value);setSaved('');}} placeholder="sk-ant-…"/></label>
  <div className="set-row" style={{borderBottom:0,justifyContent:'flex-start'}}><button className="secondary-action" onClick={save}>Save</button>{key&&<button className="text-button" onClick={async()=>{setSaved('Checking…');const r=await testKey(key);setSaved(r.message);}}>Test key</button>}{saved&&<small role="status">{saved}</small>}</div>
 </Section>;
}

function Account(){
 const [busy,setBusy]=useState(false),[err,setErr]=useState(''),[confirm,setConfirm]=useState(false),[me,setMe]=useState(null);
 useEffect(()=>{let live=true;accountSummary().then(m=>{if(live)setMe(m);});return()=>{live=false;};},[]);
 const used=me?me.used:null,limit=me?.plan==='pro'?PRO_LIMIT:FREE_LIMIT;
 return <Section title="Account">
  <div className="set-row"><span><b>Signed in as</b><small>{me?.email||'…'}</small></span><span className={`plan-badge${me?.plan==='pro'?' is-pro':''}`}>{me?.plan==='pro'?'Pro':'Free'}</span></div>
  <div className="set-row" style={{display:'block'}}><span><b>Coach this month</b><small>{used==null?'…':`${used} of ${limit} messages used · resets on the 1st`}</small></span>
   {used!=null&&<div className="usage-bar" aria-hidden="true"><i style={{width:`${Math.min(100,used/limit*100)}%`}}/></div>}</div>
  <div className="set-row"><span><b>Sign out</b><small>Removes your data and connections from this device.</small></span><button className="secondary-action" onClick={()=>signOut()}>Sign out</button></div>
  <div className="set-row"><span><b>Privacy and terms</b></span><span style={{display:'flex',gap:14}}><a className="text-button" href="#privacy">Privacy</a><a className="text-button" href="#terms">Terms</a></span></div>
  <div className="set-row"><span><b>Delete account</b><small>Deletes your account and everything Apex has saved. This can’t be undone.</small></span>
   {confirm?<button className="secondary-action danger" disabled={busy} onClick={async()=>{setBusy(true);setErr('');try{await deleteAccount();}catch(e){setErr(e.message);setBusy(false);}}}>{busy?'Deleting…':'Yes, delete everything'}</button>:<button className="text-button danger" onClick={()=>setConfirm(true)}>Delete account</button>}</div>
  {err&&<p className="form-error">{err}</p>}
 </Section>;
}

export default function Settings({userPrefs,onSavePrefs,acts=[],whoop,theme,setTheme,nav}){
 const [s,update]=useSettings(userPrefs,onSavePrefs);
 const hr=heartRate(s,acts,whoop);
 const [pb,setPb]=useState({dist:'5K',time:'',date:'',race:''}),[pbError,setPbError]=useState('');
 const move=(k,dir)=>{const o=[...s.home.order],i=o.indexOf(k),j=i+dir;if(j<0||j>=o.length)return;[o[i],o[j]]=[o[j],o[i]];update({home:{...s.home,order:o}});};
 const toggle=k=>update({home:{...s.home,hidden:s.home.hidden.includes(k)?s.home.hidden.filter(x=>x!==k):[...s.home.hidden,k]}});
 const pickStat=(slot,k)=>{const next=[...s.stats];next[slot]=k;update({stats:next});};
 const pickTab=(slot,k)=>{const next=[...s.tabs];const other=next.indexOf(k);if(other>=0)next[other]=next[slot];next[slot]=k;update({tabs:next});};
 const addPb=e=>{e.preventDefault();const t=parseTime(pb.time);if(!t){setPbError('Type the time as digits, for example 1842 for 18:42 or 12410 for 1:24:10.');return;}setPbError('');update({pbs:[...s.pbs,{id:Date.now(),dist:pb.dist,time:t,date:pb.date||null,race:pb.race.trim()}]});setPb({...pb,time:'',race:''});};
 return <div className="settings-page">
  {PUBLIC&&<Account/>}
  <p className="lede">Make APEX yours. Every change saves straight to your account.</p>

  <Section title="Today" note="Show, hide and order what’s on your Today screen.">
   <ol className="set-order">{s.home.order.map((k,i)=><li key={k} className={s.home.hidden.includes(k)?'is-off':''}>
    <button role="switch" aria-checked={!s.home.hidden.includes(k)} className="set-switch" onClick={()=>toggle(k)} aria-label={`Show ${HOME_MODULES[k][0]}`}><i/></button>
    <span><b>{HOME_MODULES[k][0]}</b><small>{HOME_MODULES[k][1]}</small></span>
    <span className="set-arrows"><button onClick={()=>move(k,-1)} disabled={i===0} aria-label={`Move ${HOME_MODULES[k][0]} up`}>↑</button><button onClick={()=>move(k,1)} disabled={i===s.home.order.length-1} aria-label={`Move ${HOME_MODULES[k][0]} down`}>↓</button></span>
   </li>)}</ol>
  </Section>

  <Section title="Stats row" note="The three numbers under your session.">
   <div className="set-grid3">{[0,1,2].map(slot=><label key={slot}>Stat {slot+1}<select value={s.stats[slot]||''} onChange={e=>pickStat(slot,e.target.value)}>{Object.entries(STATS).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>)}</div>
  </Section>

  <Section title="Tab bar" note="Today and More are always there. Pick the three in between.">
   <div className="set-grid3">{[0,1,2].map(slot=><label key={slot}>Tab {slot+2}<select value={s.tabs[slot]||''} onChange={e=>pickTab(slot,e.target.value)}>{Object.entries(TAB_CHOICES).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>)}</div>
  </Section>

  <Section title="Look">
   <div className="set-row"><span><b>Appearance</b></span><div className="apex-segments">{[['light','Light'],['dark','Dark'],['auto','Match phone']].map(([k,l])=><button key={k} aria-pressed={theme===k} onClick={()=>setTheme(k)}>{l}</button>)}</div></div>
   <div className="set-row"><span><b>Style</b><small>{s.look==='swiss'?'The original cobalt race poster.':'Racing green and cream, gold for what matters.'}</small></span><div className="apex-segments">{Object.entries(LOOKS).map(([k,l])=><button key={k} aria-pressed={s.look===k} onClick={()=>update({look:k})}>{l}</button>)}</div></div>
   {s.look==='swiss'&&<div className="set-row"><span><b>Colour</b><small>The poster colour across the app.</small></span><div className="swatches">{Object.entries(ACCENTS).map(([k,a])=><button key={k} className={s.accent===k?'is-on':''} style={{'--sw':a.light}} onClick={()=>update({accent:k})} aria-label={a.name} aria-pressed={s.accent===k}><i/></button>)}</div></div>}
   <div className="set-row"><span><b>Today poster</b><small>{s.todayPoster==='track'?'Your recovery as a lap of the track.':'Recovery, sleep, form and week as four lanes.'}</small></span><div className="apex-segments">{[['lanes','Lane race'],['track','Track']].map(([k,l])=><button key={k} aria-pressed={s.todayPoster===k} onClick={()=>update({todayPoster:k})}>{l}</button>)}</div></div>
   <div className="set-row"><span><b>Units</b></span><div className="apex-segments">{[['km','Kilometres'],['mi','Miles']].map(([k,l])=><button key={k} aria-pressed={s.units===k} onClick={()=>update({units:k})}>{l}</button>)}</div></div>
   <div className="set-row"><span><b>Run poster</b><small>Default layout when you make a poster.</small></span><div className="apex-segments">{Object.entries(POSTER_STYLES).map(([k,l])=><button key={k} aria-pressed={s.poster===k} onClick={()=>update({poster:k})}>{l}</button>)}</div></div>
  </Section>

  <Section title="Activities" note="WHOOP and watches log every walk. Hide the types you don’t want counted on Today, Activity, Performance and Shoes.">
   {Object.entries(acts.reduce((m,a)=>{const t=a.sport_type||a.type||'Other';m[t]=(m[t]||0)+1;return m;},{})).sort((a,b)=>b[1]-a[1]).map(([t,n])=><div className="set-row" key={t}><span><b>{t.replace(/([a-z])([A-Z])/g,'$1 $2')}</b><small>{n} {n===1?'activity':'activities'}</small></span><button role="switch" aria-checked={!s.hiddenTypes.includes(t)} className="set-switch" aria-label={`Show ${t}`} onClick={()=>update({hiddenTypes:s.hiddenTypes.includes(t)?s.hiddenTypes.filter(x=>x!==t):[...s.hiddenTypes,t]})}><i/></button></div>)}
   <HistoryRow/>
  </Section>

  <Section title="Personal bests" note="Add PBs from races or from before you used Strava. They join the PB wall and sharpen the race predictor.">
   {s.pbs.length>0&&<div className="set-pbs">{[...s.pbs].sort((a,b)=>PB_DISTANCES.findIndex(d=>d[0]===a.dist)-PB_DISTANCES.findIndex(d=>d[0]===b.dist)).map(p=><div key={p.id}><span><b>{p.dist}</b><small>{[p.race,p.date&&new Date(p.date+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})].filter(Boolean).join(' · ')||'Your PB'}</small></span><strong>{fmtTime(p.time)}</strong><button onClick={()=>update({pbs:s.pbs.filter(x=>x.id!==p.id)})} aria-label={`Remove ${p.dist} PB`}><Icon name="close" size={16}/></button></div>)}</div>}
   <form className="set-pb-form" onSubmit={addPb}>
    <label>Distance<select value={pb.dist} onChange={e=>setPb({...pb,dist:e.target.value})}>{PB_DISTANCES.map(([k])=><option key={k}>{k}</option>)}</select></label>
    <label>Time<input inputMode="numeric" pattern="[0-9:]*" autoComplete="off" placeholder="Type 1842 for 18:42" value={pb.time} onChange={e=>setPb({...pb,time:formatDigits(e.target.value)})}/></label>
    <label>Date<input type="date" value={pb.date} onChange={e=>setPb({...pb,date:e.target.value})}/></label>
    <label>Race<input placeholder="Optional" value={pb.race} onChange={e=>setPb({...pb,race:e.target.value})}/></label>
    <button className="primary-action">Add PB</button>
   </form>
   {pbError&&<p className="form-error">{pbError}</p>}
  </Section>

  <Section title="Goal times" note="Targets per distance. The predictor shows how far off you are.">
   <div className="set-goals">{PB_DISTANCES.slice(2).map(([k])=><label key={k}>{k}<TimeInput label={`${k} goal time`} value={s.goals[k]} placeholder={k==='Marathon'?'2:59:59':k==='Half'?'1:24:00':k==='10K'?'38:00':'18:00'} onCommit={t=>update({goals:{...s.goals,[k]:t||undefined}})}/></label>)}</div>
  </Section>

  <Section title="Heart rate" note="Worked out from your data. Override if you know a more accurate number, for example from a lab or field test.">
   <div className="set-hr">
    <label>Max HR<input inputMode="numeric" placeholder={hr.autoMax?`Auto · ${hr.autoMax}`:'Auto'} defaultValue={s.hr.max||''} onBlur={e=>update({hr:{...s.hr,max:Number(e.target.value)||null}})}/><small>{hr.maxSet?`Using yours. Auto would be ${hr.autoMax||'—'}.`:`Auto: highest in your activities${hr.autoMax?` (${hr.autoMax})`:''}.`}</small></label>
    <label>Resting HR<input inputMode="numeric" placeholder={hr.autoRest?`Auto · ${hr.autoRest}`:'Auto'} defaultValue={s.hr.rest||''} onBlur={e=>update({hr:{...s.hr,rest:Number(e.target.value)||null}})}/><small>{hr.restSet?`Using yours. Auto would be ${hr.autoRest||'—'}.`:`Auto: WHOOP 7-day median${hr.autoRest?` (${hr.autoRest})`:''}.`}</small></label>
   </div>
   <div className="set-row"><span><b>Zone model</b><small>Heart-rate reserve uses resting HR, so it suits trained runners better.</small></span><div className="apex-segments">{[['reserve','HR reserve'],['max','% of max']].map(([k,l])=><button key={k} aria-pressed={s.hr.model===k} onClick={()=>update({hr:{...s.hr,model:k}})}>{l}</button>)}</div></div>
  </Section>

  <Section title="Race predictor">
   <div className="set-row"><span><b>Window</b><small>Which recent runs count.</small></span><div className="apex-segments">{[4,8,12].map(w=><button key={w} aria-pressed={s.predictor.weeks===w} onClick={()=>update({predictor:{...s.predictor,weeks:w}})}>{w} weeks</button>)}</div></div>
  </Section>

  <CoachAccess/>
  <Section title="Shoes" note="Rotation, roles and retire limits live on the Shoes screen."><button className="secondary-action" onClick={()=>nav?.('shoes')}>Open Shoes<Icon name="arrow" size={17}/></button></Section>
 </div>;
}
