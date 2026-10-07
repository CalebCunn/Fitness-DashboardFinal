// APEX · Shoes. Your rotation from Strava plus any pairs you add yourself:
// mileage against a retire limit, how you use each pair, and when it will be done.
import {useMemo,useState} from 'react';
import {Icon} from './ApexUI';
import {readSettings,useSettings,dist,paceOf,perUnit,unitsOf} from './ApexSettings';
import {localDate,addDays} from './apexDates';

export const ROLES=['Daily trainer','Tempo','Race','Long run','Trail','Recovery'];
const isRun=a=>a.type==='Run'||a.sport_type==='Run'||a.sport_type==='TrailRun';
const day=a=>(a.start_date_local||a.start_date||'').slice(0,10);
const fmtDate=k=>k?new Date(k+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—';

// Which shoe a run was in: your own assignment wins, then Strava's gear_id.
export function shoeFor(activity,settings){return settings?.shoeAssign?.[activity.id]||activity.gear_id||activity.gear?.id||null;}

export function allShoes(gear=[],settings){
 const local=settings?.shoes||{};
 const strava=gear.map(g=>({id:g.id,name:g.name||g.nickname||[g.brand_name,g.model_name].filter(Boolean).join(' ')||'Shoe',brand:g.brand_name||'',source:'strava',baseKm:(g.distance||0)/1000,primary:!!g.primary,retired:local[g.id]?.retired??!!g.retired,role:local[g.id]?.role||'',limit:local[g.id]?.retire||800,bought:local[g.id]?.bought||null}));
 const mine=(settings?.myShoes||[]).map(s=>({...s,source:'mine',baseKm:Number(s.startKm)||0,limit:s.retire||local[s.id]?.retire||800,role:local[s.id]?.role||s.role||'',retired:local[s.id]?.retired??!!s.retired}));
 return [...strava,...mine];
}

export function shoeStats(shoes,acts,settings){
 const today=localDate(new Date()),from30=addDays(today,-30),from56=addDays(today,-56);
 return shoes.map(s=>{
  const runs=acts.filter(a=>isRun(a)&&shoeFor(a,settings)===s.id).sort((a,b)=>day(b).localeCompare(day(a)));
  const m=runs.reduce((n,a)=>n+(a.distance||0),0),time=runs.reduce((n,a)=>n+(a.moving_time||0),0);
  // Strava's own total already includes its runs; your own pairs count the runs you assign.
  const km=s.source==='strava'?s.baseKm+runs.filter(a=>settings?.shoeAssign?.[a.id]===s.id&&a.gear_id!==s.id).reduce((n,a)=>n+(a.distance||0)/1000,0):s.baseKm+m/1000;
  const recent=runs.filter(a=>day(a)>=from56).reduce((n,a)=>n+(a.distance||0)/1000,0)/8;
  const left=Math.max(0,s.limit-km),weeks=recent>0?left/recent:null;
  return {...s,km,runs:runs.length,last:runs[0]?day(runs[0]):null,month:runs.filter(a=>day(a)>=from30).reduce((n,a)=>n+(a.distance||0),0),avgSpeed:time?m/time:null,longest:Math.max(0,...runs.map(a=>a.distance||0)),perWeek:recent,left,retireBy:weeks!=null&&!s.retired?addDays(today,Math.round(weeks*7)):null};
 });
}

function ShoeCard({s,settings,onPatch,onRemove}){
 const [open,setOpen]=useState(false);
 const pct=Math.min(100,s.km/s.limit*100),tone=s.km>=s.limit?'retire':s.km>=s.limit*.8?'warn':'ok';
 const u=unitsOf(settings),shown=u==='mi'?s.km/1.60934:s.km;
 return <article className={`shoe-card is-${tone}${s.retired?' is-retired':''}`}>
  <header>
   <div><span className="label">{[s.brand,s.role,s.primary?'Default on Strava':'',s.retired?'Retired':''].filter(Boolean).join(' · ')||(s.source==='mine'?'Added by you':'From Strava')}</span><h3>{s.name}</h3></div>
   <strong>{Math.round(shown)}<small>{u}</small></strong>
  </header>
  <div className="shoe-meter" aria-label={`${Math.round(s.km)} of ${s.limit} km`}><i style={{width:`${pct}%`}}/>{[.25,.5,.75].map(t=><b key={t} style={{left:`${t*100}%`}}/>)}</div>
  <div className="shoe-scale"><span>0</span><span>{tone==='retire'?`Past ${s.limit} km`:`${Math.round(s.left)} km left of ${s.limit}`}</span></div>
  <dl className="shoe-facts">
   <div><dt>Runs</dt><dd>{s.runs}</dd></div>
   <div><dt>Last 30 days</dt><dd>{dist(s.month,settings,0)} {u}</dd></div>
   <div><dt>Avg pace</dt><dd>{s.avgSpeed?`${paceOf(s.avgSpeed,settings)}${perUnit(settings)}`:'—'}</dd></div>
   <div><dt>Longest</dt><dd>{s.longest?`${dist(s.longest,settings,1)} ${u}`:'—'}</dd></div>
   <div><dt>Last run</dt><dd>{fmtDate(s.last)}</dd></div>
   <div><dt>Retire by</dt><dd>{s.retired?'Retired':s.retireBy?fmtDate(s.retireBy):'Not enough runs'}</dd></div>
  </dl>
  <button className="text-button" onClick={()=>setOpen(!open)} aria-expanded={open}>{open?'Done':'Edit'}<Icon name={open?'check':'settings'} size={15}/></button>
  {open&&<div className="shoe-edit">
   <label>Role<select value={s.role} onChange={e=>onPatch({role:e.target.value})}><option value="">No role</option>{ROLES.map(r=><option key={r}>{r}</option>)}</select></label>
   <label>Retire at<select value={s.limit} onChange={e=>onPatch({retire:Number(e.target.value)})}>{[300,400,500,600,700,800,900,1000,1200].map(k=><option key={k} value={k}>{k} km</option>)}</select></label>
   <label className="checkbox-label"><input type="checkbox" checked={!!s.retired} onChange={e=>onPatch({retired:e.target.checked})}/>Retired</label>
   {s.source==='mine'&&<button className="text-button danger" onClick={onRemove}>Remove this shoe</button>}
  </div>}
 </article>;
}

export default function Shoes({gear=[],acts=[],userPrefs,onSavePrefs}){
 const [settings,update]=useSettings(userPrefs,onSavePrefs);
 const [adding,setAdding]=useState(false),[draft,setDraft]=useState({name:'',brand:'',startKm:'',role:'Daily trainer'}),[show,setShow]=useState('active');
 const list=useMemo(()=>shoeStats(allShoes(gear,settings),acts,settings),[gear,acts,settings]);
 const active=list.filter(s=>!s.retired).sort((a,b)=>b.km-a.km),retired=list.filter(s=>s.retired);
 const patch=(s,p)=>{if(s.source==='mine'&&('retired' in p||'retire' in p||'role' in p))update({myShoes:(settings.myShoes||[]).map(x=>x.id===s.id?{...x,...p}:x)});else update({shoes:{...settings.shoes,[s.id]:{...settings.shoes[s.id],...p}}});};
 const totalKm=active.reduce((n,s)=>n+s.km,0),u=unitsOf(settings);
 const add=e=>{e.preventDefault();if(!draft.name.trim())return;update({myShoes:[...(settings.myShoes||[]),{id:`mine-${Date.now()}`,name:draft.name.trim(),brand:draft.brand.trim(),startKm:Number(draft.startKm)||0,role:draft.role,retire:800,bought:localDate(new Date())}]});setDraft({name:'',brand:'',startKm:'',role:'Daily trainer'});setAdding(false);};
 return <div className="shoes-page">
  <section className="poster shoes-poster">
   <div className="poster-meta"><span>Rotation</span><span>{active.length} pairs</span><span>{retired.length} retired</span></div>
   <p className="shoes-total"><b>{Math.round(u==='mi'?totalKm/1.60934:totalKm).toLocaleString('en-GB')}</b><em>{u} on your feet right now.</em></p>
  </section>
  <div className="shoes-bar"><div className="apex-segments">{[['active','In rotation'],['retired','Retired']].map(([k,l])=><button key={k} aria-pressed={show===k} onClick={()=>setShow(k)}>{l}</button>)}</div><button className="primary-action" onClick={()=>setAdding(!adding)}><Icon name="plus" size={18}/>Add shoe</button></div>
  {adding&&<form className="shoe-add" onSubmit={add}>
   <label>Name<input required value={draft.name} placeholder="Endorphin Speed 4" onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   <label>Brand<input value={draft.brand} placeholder="Saucony" onChange={e=>setDraft({...draft,brand:e.target.value})}/></label>
   <label>Km already run<input inputMode="numeric" value={draft.startKm} placeholder="0" onChange={e=>setDraft({...draft,startKm:e.target.value.replace(/[^\d.]/g,'')})}/></label>
   <label>Role<select value={draft.role} onChange={e=>setDraft({...draft,role:e.target.value})}>{ROLES.map(r=><option key={r}>{r}</option>)}</select></label>
   <button className="primary-action">Add to rotation</button>
   <p className="form-note">Shoes from Strava appear automatically. Add pairs here that aren’t on Strava, then pick them on a run to count its kilometres.</p>
  </form>}
  <div className="shoe-list">{(show==='active'?active:retired).map(s=><ShoeCard key={s.id} s={s} settings={settings} onPatch={p=>patch(s,p)} onRemove={()=>update({myShoes:(settings.myShoes||[]).filter(x=>x.id!==s.id)})}/>)}
   {(show==='active'?active:retired).length===0&&<div className="empty-block"><h2>{show==='active'?'No shoes yet.':'Nothing retired yet.'}</h2><p>{show==='active'?'Add your shoes in Strava, or add a pair here.':'Retired pairs keep their history here.'}</p></div>}
  </div>
 </div>;
}

// Small picker for the run detail: which shoe was this run in?
export function ShoePicker({activity,gear,userPrefs,onSavePrefs}){
 const settings=readSettings(userPrefs);
 const shoes=allShoes(gear,settings).filter(s=>!s.retired||s.id===shoeFor(activity,settings));
 if(!onSavePrefs||!shoes.length)return null;
 const current=shoeFor(activity,settings)||'';
 return <label className="shoe-picker">Shoe<select value={current} onChange={e=>onSavePrefs({...userPrefs,settings:{...(userPrefs?.settings||{}),shoeAssign:{...(settings.shoeAssign||{}),[activity.id]:e.target.value||undefined}}})}><option value="">Not set</option>{shoes.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>;
}
