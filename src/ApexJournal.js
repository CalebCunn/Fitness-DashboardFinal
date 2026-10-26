import {useState,useEffect} from 'react';
import {localDate,datedSessions} from './ApexTraining';
import {focusRace,raceDate} from './ApexGoals';
import {BodyMap,bodyRead,LEVELS} from './ApexBody';
export default function Journal({userPrefs,onSavePrefs,plan,nav}){
 const today=localDate(new Date()),journal=userPrefs?.journal||{},[date,setDate]=useState(today),[editing,setEditing]=useState(false),[draft,setDraft]=useState({}),[notice,setNotice]=useState('');
 const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);return localDate(d);}),entries=days.filter(d=>journal[d]),sessions=datedSessions(plan).filter(s=>days.includes(s.date)),foods=days.filter(d=>userPrefs?.nutrition?.[d]),goal=focusRace(userPrefs?.races);
 useEffect(()=>{const open=()=>{setDate(today);setDraft(journal[today]||{energy:3,soreness:1,stress:3,notes:''});setEditing(true);};window.addEventListener('apex-checkin',open);return()=>window.removeEventListener('apex-checkin',open);},[today,journal]);
 return <section className="daily-review" id="checkin"><div className="section-label"><div><span className="eyebrow">How you feel</span><h2>Check-in</h2></div><button className="secondary-action" onClick={()=>{setDraft(journal[date]||{energy:3,soreness:1,stress:3,notes:''});setEditing(!editing);}}>{editing?'Close':journal[date]?'Edit check-in':'Check in'}</button></div><div className="checkin-days">{days.map(d=><button key={d} aria-pressed={date===d} onClick={()=>{setDate(d);setEditing(false);}}><span>{new Date(d+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short'})}</span><strong>{new Date(d+'T12:00:00').getDate()}</strong><i>{journal[d]?'•':''}</i></button>)}</div>
 {editing?<form className="checkin-form" onSubmit={e=>{e.preventDefault();onSavePrefs({...userPrefs,journal:{...journal,[date]:{...draft,updatedAt:new Date().toISOString()}}});setEditing(false);setNotice('Check-in added.');}}>{[['energy','Energy','Low','High'],['stress','Stress','Low','High']].map(([k,l,low,high])=><label key={k}>{l}<div className="checkin-scale">{[1,2,3,4,5].map(n=><button type="button" key={n} aria-label={`${l} ${n} of 5`} aria-pressed={draft[k]===n} onClick={()=>setDraft({...draft,[k]:n})}>{n}</button>)}</div><small>{low} → {high}</small></label>)}<div className="body-check"><span className="label">Anything sore? Tap where it talks</span><BodyMap value={draft.body||{}} onChange={b=>setDraft({...draft,body:b,soreness:Math.max(1,...Object.values(b).map(v=>v+1))})}/><p className="body-legend"><i className="lv-1"/>Niggle<i className="lv-2"/>Sore<i className="lv-3"/>Pain</p><p className="body-coach"><b>Coach:</b> {bodyRead(draft.body).line}</p></div><label>A note to yourself<textarea rows={2} value={draft.notes||''} onChange={e=>setDraft({...draft,notes:e.target.value})}/></label><button className="primary-action">Save check-in</button></form>:<p className="checkin-summary">{journal[date]?`Energy ${journal[date].energy}/5 · Stress ${journal[date].stress}/5 · ${bodyRead(journal[date].body).spots.map(x=>`${x.name} ${LEVELS[x.level]}`).join(', ')||`soreness ${journal[date].soreness}/5`}${journal[date].notes?' — '+journal[date].notes:''}`:'How do you feel this morning? It tells your coach what WHOOP cannot.'}</p>}
 {notice&&<p role="status" className="form-note">{notice}</p>}<details className="week-review"><summary>Your last 7 days <span>Review</span></summary><div className="review-metrics"><div><strong>{sessions.filter(s=>s.done).length}/{sessions.length}</strong><span>plan sessions complete</span></div><div><strong>{foods.length}/7</strong><span>days with food logged</span></div><div><strong>{entries.length}/7</strong><span>check-ins</span></div></div><p>Counts reflect your APEX entries, including partial food logs. Check-ins describe how you felt; they don’t establish what caused changes in recovery.</p><button className="text-button" onClick={()=>nav('plan')}>Review your plan</button></details>{goal&&<button className="goal-link" onClick={()=>nav('races')}><div><span className="eyebrow">{goal.next?'Primary goal':'Next up'}</span><strong>{goal.name}</strong><span>{goal.target||'Your next finish line'}{raceDate(goal)?' · '+goal.date:''}</span></div><span>Edit goal</span></button>}</section>;
}
export function PersonalSettings({userPrefs,onSavePrefs}){const [p,setP]=useState(userPrefs?.profile||{}),[saved,setSaved]=useState(false);return <section className="personal-settings"><div className="section-label"><h2>Your coaching profile</h2><button className="text-button" onClick={()=>{const blob=new Blob([JSON.stringify({format:'apex-personal-export-v1',exportedAt:new Date().toISOString(),preferences:(({aiKey,...rest})=>rest)(userPrefs||{})},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='apex-personal-data.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>Export my APEX data</button></div><p className="form-note">These are the details your coach uses. Change them whenever your circumstances change.</p><form className="meal-fields" onSubmit={e=>{e.preventDefault();onSavePrefs({...userPrefs,profile:p});setSaved(true);}}>{[['name','Preferred name'],['focus','What are you working towards?'],['availability','Training availability'],['experience','Running and lifting experience'],['constraints','Injuries, constraints or preferences']].map(([k,l])=><label key={k}>{l}<input value={p[k]||''} onChange={e=>{setP({...p,[k]:e.target.value});setSaved(false);}}/></label>)}<button className="primary-action">Save profile</button>{saved&&<p role="status">Profile updated.</p>}</form></section>;}

// ── Journal ── an optional notebook page: write whatever you like, one entry per day.
// Saved to the account by day (prefs.journal) and read by the coach (see journalContext).
const written=j=>!!j?.entry;
const dayLabel=d=>new Date(d+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
const draftKey=d=>`apex-journal-draft:${d}`;
const readDraft=d=>{try{return JSON.parse(localStorage.getItem(draftKey(d))||'null');}catch{return null;}};
const keepDraft=(d,v)=>{try{v?localStorage.setItem(draftKey(d),JSON.stringify(v)):localStorage.removeItem(draftKey(d));}catch{}};

export function JournalPage({userPrefs,onSavePrefs}){
 const today=localDate(new Date()),journal=userPrefs?.journal||{};
 const pick=d=>{const j=journal[d]||{};return readDraft(d)||{entry:j.entry||''};};
 const [date,setDate]=useState(today),[draft,setDraft]=useState(()=>pick(today)),[note,setNote]=useState(''),[shown,setShown]=useState(20);
 const open=d=>{setDate(d);setDraft(pick(d));setNote('');window.scrollTo({top:0,behavior:'smooth'});};
 const edit=v=>{const n={...draft,...v};setDraft(n);keepDraft(date,n);setNote('');};
 const save=e=>{e.preventDefault();const j=journal[date]||{};
  onSavePrefs({...userPrefs,journal:{...journal,[date]:{soreness:1,stress:3,...j,entry:draft.entry.trim(),updatedAt:new Date().toISOString()}}});
  keepDraft(date,null);setNote('Saved.');};
 const past=Object.keys(journal).filter(d=>d!==date&&written(journal[d])).sort((a,b)=>b.localeCompare(a));
 return <section className="journal-page">
  <div className="section-label"><div><h2>{date===today?'Today':dayLabel(date)}</h2></div>{date!==today&&<button className="text-button" onClick={()=>open(today)}>Back to today</button>}</div>
  <p className="form-note">Your space to write: training, life, how you’re feeling, anything. Only you and your coach can read it, and the coach remembers it.</p>
  <form className="checkin-form" onSubmit={save}>
   <label className="jr-write"><span className="sr-only">Journal entry</span><textarea rows={8} value={draft.entry} onChange={e=>edit({entry:e.target.value})} placeholder="What’s on your mind?"/></label>
   <div className="jr-actions"><button className="primary-action" disabled={!draft.entry.trim()&&!(journal[date]?.entry)}>Save</button>{note&&<small role="status">{note}</small>}</div>
  </form>
  {past.length>0&&<div className="jr-past">
   <div className="section-label"><h2>Earlier</h2></div>
   {past.slice(0,shown).map(d=>{const j=journal[d];return <article key={d} className="jr-entry">
    <div className="jr-entry-head"><strong>{dayLabel(d)}</strong><button className="text-button" onClick={()=>open(d)}>Edit</button></div>
    {j.entry&&<p className="jr-text">{j.entry}</p>}
   </article>;})}
   {past.length>shown&&<button className="secondary-action" onClick={()=>setShown(shown+20)}>Show more</button>}
  </div>}
 </section>;
}

// What the coach is given: check-ins and journal entries, recent ones in full, older ones shortened.
export function journalContext(userPrefs,today,limit=16000){
 const recent=new Date(today+'T12:00:00');recent.setDate(recent.getDate()-45);const cut=localDate(recent);
 const rows=[];let used=0,left=0;
 for(const [d,j] of Object.entries(userPrefs?.journal||{}).sort(([a],[b])=>b.localeCompare(a))){
  const spots=bodyRead(j.body).spots.map(x=>`${x.name} ${LEVELS[x.level]}`).join(', ');
  const short=s=>d>=cut||s.length<=280?s:s.slice(0,277)+'…';
  const parts=[j.energy&&`morning energy ${j.energy}/5`,j.stress&&`stress ${j.stress}/5`,spots?`sore: ${spots}`:j.soreness>1&&`soreness ${j.soreness}/5`,j.notes&&`morning note: ${short(j.notes)}`,
   j.entry&&`wrote: ${short(j.entry)}`].filter(Boolean);
  if(!parts.length)continue;
  const row=`${d} ${new Date(d+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short'})}: ${parts.join('; ')}`;
  if(used+row.length>limit){left++;continue;}rows.push(row);used+=row.length;
 }
 return rows.join('\n')+(left?`\n(${left} older entries not shown)`:'');
}
