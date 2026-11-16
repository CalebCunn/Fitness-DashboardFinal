// APEX · Strength. Routines (Push A, Pull B…), a live workout with per-exercise rest timers and last time's numbers,
// history, and progress per lift. The coach builds and edits routines (see strength.js for the format).
import {useState,useEffect,useMemo} from 'react';
import {Icon} from './ApexUI';
import {PREVIEW} from './ApexPreview';
import {localDate} from './apexDates';
import {readRoutines,historyOf,repsStart,restLabel,lastSets,progress,newBests,nextUp,uid,setLabel} from './strength';

const DRAFT='apex-strength-draft';
const n=v=>Number(v||0).toLocaleString('en-GB');
const dayLabel=d=>d?new Date(d+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'}):'';
const mins=(a,b)=>Math.max(1,Math.round((new Date(b)-new Date(a))/60000));
const validSet=s=>s.weight!==''&&Number(s.weight)>=0&&Number.isFinite(Number(s.weight))&&Number(s.reps)>0;

// A button that needs a second tap, for things that can't be undone.
function Confirm({label,sure='Tap again to confirm',onYes,className='text-button'}){
 const [armed,setArmed]=useState(false);
 useEffect(()=>{if(!armed)return;const t=setTimeout(()=>setArmed(false),3000);return()=>clearTimeout(t);},[armed]);
 return <button className={`${className}${armed?' is-armed':''}`} onClick={()=>armed?onYes():setArmed(true)}>{armed?sure:label}</button>;
}

function exerciseFrom(e,history){
 const last=lastSets(history,e.name),guess=String(e.weight||'').match(/[\d.]+/)?.[0]||'';
 return {name:e.name,target:`${e.sets} × ${e.reps}${e.weight?` · ${e.weight}`:''}`,rest:Number(e.rest)||90,notes:e.notes||'',
  lastTime:last?`${dayLabel(last.date)}: ${last.sets.map(s=>`${s.weight}×${s.reps}`).join(', ')}`:null,
  sets:Array.from({length:Math.min(10,Number(e.sets)||3)},(_,i)=>{const p=last?.sets?.[i]||last?.sets?.[last.sets.length-1];return {weight:p?String(p.weight):guess,reps:p?String(p.reps):repsStart(e.reps),done:false};})};
}

function Live({workout,setWorkout,history,names,onFinish,onDiscard}){
 const [seconds,setSeconds]=useState(0),[adding,setAdding]=useState(''),[,tick]=useState(0);
 useEffect(()=>{if(!workout.restUntil){setSeconds(0);return;}const f=()=>setSeconds(Math.max(0,Math.ceil((workout.restUntil-Date.now())/1000)));f();const id=setInterval(f,500);return()=>clearInterval(id);},[workout.restUntil]);
 useEffect(()=>{const id=setInterval(()=>tick(t=>t+1),30000);return()=>clearInterval(id);},[]);
 const ex=(i,patch)=>setWorkout({...workout,exercises:workout.exercises.map((e,j)=>j===i?{...e,...patch}:e)});
 const set=(i,si,patch)=>{const e=workout.exercises[i];setWorkout({...workout,...(patch.done?{restUntil:Date.now()+e.rest*1000}:{}),exercises:workout.exercises.map((x,j)=>j===i?{...x,sets:x.sets.map((s,k)=>k===si?{...s,...patch}:s)}:x)});};
 const done=workout.exercises.reduce((a,e)=>a+e.sets.filter(s=>s.done).length,0),total=workout.exercises.reduce((a,e)=>a+e.sets.length,0);
 const volume=workout.exercises.reduce((a,e)=>a+e.sets.filter(s=>s.done).reduce((b,s)=>b+Number(s.weight||0)*Number(s.reps||0),0),0);
 const add=e=>{e.preventDefault();const name=adding.trim();if(!name)return;setWorkout({...workout,exercises:[...workout.exercises,exerciseFrom({name,sets:3,reps:'10',rest:90},history)]});setAdding('');};
 return <div className="live-workout">
  <div className="workout-progress"><div><span className="eyebrow">In progress · {mins(workout.startedAt,new Date())} min</span><h2>{workout.title}</h2></div><div><strong>{done}<small> / {total}</small></strong><span>sets done</span></div><div><strong>{n(volume)}<small> kg</small></strong><span>volume</span></div></div>
  <div className="fuel-track"><i style={{width:`${total?done/total*100:0}%`}}/></div>
  {seconds>0&&<button className="rest-timer st-rest" onClick={()=>setWorkout({...workout,restUntil:null})} aria-label="Skip rest">Rest {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')} <span>Skip</span></button>}
  {workout.exercises.map((e,i)=><section className="exercise-card" key={i}>
   <div className="exercise-heading"><span>{String(i+1).padStart(2,'0')}</span><div><h3>{e.name}</h3><p>{[e.target,`rest ${restLabel(e.rest)}`].filter(Boolean).join(' · ')}</p>{e.lastTime&&<p className="st-last">Last time {e.lastTime}</p>}{e.notes&&<p className="st-note">{e.notes}</p>}</div><button className="st-x" aria-label={`Remove ${e.name}`} onClick={()=>setWorkout({...workout,exercises:workout.exercises.filter((_,j)=>j!==i)})}>×</button></div>
   <div className="set-head"><span>SET</span><span>KG</span><span>REPS</span><span>DONE</span></div>
   {e.sets.map((s,si)=><div className={`set-row ${s.done?'set-done':''}`} key={si}><span>{si+1}</span>
    <input aria-label={`${e.name} set ${si+1} weight`} type="number" inputMode="decimal" min="0" step="0.5" value={s.weight} onChange={ev=>set(i,si,{weight:ev.target.value,done:false})} placeholder="0"/>
    <input aria-label={`${e.name} set ${si+1} reps`} type="number" inputMode="numeric" min="1" step="1" value={s.reps} onChange={ev=>set(i,si,{reps:ev.target.value,done:false})}/>
    <button aria-label={`${s.done?'Undo':'Complete'} ${e.name} set ${si+1}`} disabled={!validSet(s)} onClick={()=>set(i,si,{done:!s.done})}>{s.done?'✓':'○'}</button></div>)}
   <div className="st-setbtns"><button className="text-button" onClick={()=>ex(i,{sets:[...e.sets,{...(e.sets[e.sets.length-1]||{weight:'',reps:'10'}),done:false}]})}><Icon name="plus" size={16}/> Add set</button>{e.sets.length>1&&<button className="text-button" onClick={()=>ex(i,{sets:e.sets.slice(0,-1)})}>Remove last set</button>}</div>
  </section>)}
  <form className="st-add" onSubmit={add}><input list="st-names" value={adding} onChange={e=>setAdding(e.target.value)} placeholder="Add an exercise" aria-label="Add an exercise"/><datalist id="st-names">{names.map(x=><option key={x} value={x}/>)}</datalist><button className="secondary-action set-small-btn" disabled={!adding.trim()}>Add</button></form>
  <div className="workout-finish"><Confirm label="Discard workout" sure="Tap again to discard" onYes={onDiscard}/><button className="primary-action" disabled={!done} onClick={()=>onFinish({volume})}>Finish workout <Icon name="arrow" size={18}/></button></div>
 </div>;
}

function RoutineEditor({routine,onSave,onCancel,onDelete,names}){
 const [r,setR]=useState(routine);
 const ex=(i,patch)=>setR({...r,exercises:r.exercises.map((e,j)=>j===i?{...e,...patch}:e)});
 const move=(i,d)=>{const a=[...r.exercises],j=i+d;if(j<0||j>=a.length)return;[a[i],a[j]]=[a[j],a[i]];setR({...r,exercises:a});};
 const valid=r.name.trim()&&r.exercises.length&&r.exercises.every(e=>e.name.trim()&&Number(e.sets)>=1&&Number(e.sets)<=10&&String(e.reps).trim());
 return <section className="st-editor">
  <label className="set-field">Routine name<input value={r.name} onChange={e=>setR({...r,name:e.target.value})} placeholder="Push A"/></label>
  {r.exercises.map((e,i)=><div className="st-erow" key={i}>
   <label className="st-ename">Exercise<input list="st-names" value={e.name} onChange={v=>ex(i,{name:v.target.value})}/></label>
   <label>Sets<input type="number" inputMode="numeric" min="1" max="10" value={e.sets} onChange={v=>ex(i,{sets:v.target.value})}/></label>
   <label>Reps<input value={e.reps} onChange={v=>ex(i,{reps:v.target.value})} placeholder="8-10"/></label>
   <label>Target<input value={e.weight||''} onChange={v=>ex(i,{weight:v.target.value})} placeholder="60kg"/></label>
   <label>Rest (s)<input type="number" inputMode="numeric" min="0" step="15" value={e.rest??90} onChange={v=>ex(i,{rest:Number(v.target.value)})}/></label>
   <div className="st-eact"><button aria-label="Move up" onClick={()=>move(i,-1)} disabled={!i}>↑</button><button aria-label="Move down" onClick={()=>move(i,1)} disabled={i===r.exercises.length-1}>↓</button><button aria-label={`Remove ${e.name||'exercise'}`} onClick={()=>setR({...r,exercises:r.exercises.filter((_,j)=>j!==i)})}>×</button></div>
  </div>)}
  <datalist id="st-names">{names.map(x=><option key={x} value={x}/>)}</datalist>
  <button className="text-button" onClick={()=>setR({...r,exercises:[...r.exercises,{name:'',sets:3,reps:'10',weight:'',rest:90}]})}><Icon name="plus" size={16}/> Add exercise</button>
  <div className="modal-actions">{onDelete&&<Confirm label="Delete routine" sure="Tap again to delete" onYes={onDelete}/>}<button className="secondary-action" onClick={onCancel}>Cancel</button><button className="primary-action" disabled={!valid} onClick={()=>onSave({...r,name:r.name.trim(),exercises:r.exercises.map(e=>({...e,name:e.name.trim(),sets:Number(e.sets),reps:String(e.reps).trim(),rest:Number(e.rest)||90}))})}>Save routine</button></div>
 </section>;
}

// Each lift's best estimated max over its sessions.
function Trend({points}){
 const p=points.filter(x=>x.e1>0).slice(-12);if(p.length<2)return null;
 const lo=Math.min(...p.map(x=>x.e1)),hi=Math.max(...p.map(x=>x.e1)),w=120/(p.length-1),y=v=>34-(v-lo)/Math.max(1,hi-lo)*28;
 return <svg className="st-trend" viewBox="0 0 120 38" preserveAspectRatio="none" aria-hidden="true"><path d={p.map((x,i)=>`${i?'L':'M'}${(i*w).toFixed(1)} ${y(x.e1).toFixed(1)}`).join(' ')}/></svg>;
}

export default function Strength({userPrefs,onSavePrefs,plan,openCoach}){
 const routines=readRoutines(userPrefs),history=historyOf(userPrefs);
 const [tab,setTab]=useState('train'),[notice,setNotice]=useState(null),[editing,setEditing]=useState(null);
 const [workout,setWorkout]=useState(()=>{if(PREVIEW)return null;try{const w=JSON.parse(localStorage.getItem(DRAFT));return w?.exercises?w:null;}catch{return null;}});
 useEffect(()=>{if(PREVIEW)return;try{workout?localStorage.setItem(DRAFT,JSON.stringify(workout)):localStorage.removeItem(DRAFT);}catch{}},[workout]);
 const names=useMemo(()=>[...new Set([...routines.flatMap(r=>r.exercises.map(e=>e.name)),...history.flatMap(w=>(w.exercises||[]).map(e=>e.name))])].filter(Boolean).sort(),[routines,history]);
 const stats=useMemo(()=>progress(history),[history]);
 const up=nextUp(routines,history,plan);
 const saveRoutines=list=>onSavePrefs({...userPrefs,routines:list});
 const start=r=>{setWorkout({routineId:r?.id||null,title:r?.name||'Workout',startedAt:new Date().toISOString(),exercises:(r?.exercises||[]).map(e=>exerciseFrom(e,history))});setTab('train');setNotice(null);};
 const finish=({volume})=>{
  const record={routineId:workout.routineId,title:workout.title,date:localDate(new Date()),startedAt:workout.startedAt,endedAt:new Date().toISOString(),volume,
   exercises:workout.exercises.map(e=>({name:e.name,sets:e.sets.map(s=>({weight:Number(s.weight)||0,reps:Number(s.reps)||0,done:!!s.done}))}))};
  const bests=newBests(history,record);
  onSavePrefs({...userPrefs,strengthHistory:[...history,record].slice(-200)});
  setWorkout(null);setTab('history');
  setNotice(bests.length?`Saved. New bests: ${bests.join(' · ')} 🎉`:`Saved: ${record.exercises.reduce((a,e)=>a+e.sets.filter(s=>s.done).length,0)} sets, ${n(volume)} kg in ${mins(record.startedAt,record.endedAt)} min.`);
 };
 const last=id=>[...history].reverse().find(w=>w.routineId===id)?.date;
 const ask=p=>openCoach?.(p);

 return <div className="strength-page">
  {!workout&&<section className="strength-banner"><div><span className="eyebrow">Strength for running</span><h2>Lift to run better.</h2><p>Your routines, live sets with rest timers, and every lift you’ve logged.</p><button className="light-action" onClick={()=>ask(routines.length?'Look at my strength routines and recent sessions. What should I change?':'Build me a strength program that fits around my running. Ask me how many days I can lift first.')}><Icon name="coach" size={18}/> {routines.length?'Review with your coach':'Build with your coach'}</button></div><div className="sculpted-weight" aria-hidden="true"><i/><i/><i/><i/><i/></div></section>}
  {!workout&&<div className="strength-toolbar"><div className="apex-segments">{[['train','Train'],['routines','Routines'],['history','History'],['progress','Progress']].map(([id,l])=><button key={id} aria-pressed={tab===id} onClick={()=>{setTab(id);setEditing(null);}}>{l}</button>)}</div></div>}
  {notice&&<p className="save-notice" role="status">{notice}</p>}

  {workout&&<Live workout={workout} setWorkout={setWorkout} history={history} names={names} onFinish={finish} onDiscard={()=>{setWorkout(null);setNotice('Workout discarded.');}}/>}

  {!workout&&tab==='train'&&<div className="st-train">
   {up?<section className="st-next"><span className="eyebrow">Next up · {up.why}</span><h2>{up.routine.name}</h2><p>{up.routine.exercises.map(e=>e.name).join(' · ')}</p><button className="primary-action" onClick={()=>start(up.routine)}>Start {up.routine.name} <Icon name="arrow" size={18}/></button></section>
    :<section className="st-next"><span className="eyebrow">No routines yet</span><h2>Set up your lifting.</h2><p>Ask your coach for a program (push, pull and legs, upper/lower, or strength for running) and it saves straight here. Or make your own in Routines.</p><button className="primary-action" onClick={()=>ask('Build me a strength program that fits around my running. Ask me how many days I can lift first.')}>Build my program <Icon name="arrow" size={18}/></button></section>}
   {routines.length>0&&<section className="st-list"><div className="section-label"><div><span className="eyebrow">Your rotation</span><h2>Routines</h2></div></div>
    {routines.map(r=><div className="st-item" key={r.id}><span><b>{r.name}</b><small>{r.exercises.length} exercises{last(r.id)?` · last ${dayLabel(last(r.id))}`:''}</small></span><button className="secondary-action set-small-btn" onClick={()=>start(r)}>Start</button></div>)}</section>}
   <button className="text-button" onClick={()=>start(null)}><Icon name="plus" size={16}/> Start an empty workout</button>
  </div>}

  {!workout&&tab==='routines'&&<div className="st-train">
   {editing?<RoutineEditor key={editing.id} routine={editing} names={names} onCancel={()=>setEditing(null)}
     onDelete={routines.some(r=>r.id===editing.id)?()=>{saveRoutines(routines.filter(r=>r.id!==editing.id));setEditing(null);setNotice('Routine deleted.');}:null}
     onSave={r=>{saveRoutines(routines.some(x=>x.id===r.id)?routines.map(x=>x.id===r.id?r:x):[...routines,r]);setEditing(null);setNotice(`${r.name} saved.`);}}/>
   :<>{routines.map((r,i)=><section className="st-routine" key={r.id}>
     <div className="st-rhead"><div><span className="eyebrow">{String(i+1).padStart(2,'0')}</span><h2>{r.name}</h2></div><div className="st-eact"><button aria-label={`Move ${r.name} up`} disabled={!i} onClick={()=>{const a=[...routines];[a[i-1],a[i]]=[a[i],a[i-1]];saveRoutines(a);}}>↑</button><button aria-label={`Move ${r.name} down`} disabled={i===routines.length-1} onClick={()=>{const a=[...routines];[a[i+1],a[i]]=[a[i],a[i+1]];saveRoutines(a);}}>↓</button></div></div>
     {r.exercises.map((e,j)=><div className="st-ex" key={j}><span>{e.name}</span><small>{e.sets} × {e.reps}{e.weight?` · ${e.weight}`:''} · rest {restLabel(e.rest||90)}</small></div>)}
     <div className="st-rbtns"><button className="secondary-action set-small-btn" onClick={()=>setEditing(r)}>Edit</button><button className="text-button" onClick={()=>ask(`Improve my "${r.name}" routine using my recent sessions. Send the full updated routine.`)}>Ask coach to improve it</button></div>
    </section>)}
    <button className="secondary-action" onClick={()=>setEditing({id:uid(),name:'',exercises:[{name:'',sets:3,reps:'8-10',weight:'',rest:90}]})}><Icon name="plus" size={16}/> New routine</button></>}
  </div>}

  {!workout&&tab==='history'&&<section className="routine-library"><span className="eyebrow">Completed sessions</span><h2>History</h2>
   {history.length?[...history].reverse().map((w,i)=>{const idx=history.length-1-i;return <details className="workout-history" key={idx}><summary><div><span>{dayLabel(w.date)}{w.startedAt&&w.endedAt?` · ${mins(w.startedAt,w.endedAt)} min`:''}</span><h3>{w.title}</h3></div><strong>{n(w.volume)}<small> kg</small></strong></summary>
    {(w.exercises||[]).map((e,j)=><div key={j}><p>{e.name}</p><span>{(e.sets||[]).filter(s=>s.done).map(s=>`${s.weight}kg × ${s.reps}`).join(' · ')||'No completed sets'}</span></div>)}
    <Confirm label="Delete this workout" sure="Tap again to delete" onYes={()=>onSavePrefs({...userPrefs,strengthHistory:history.filter((_,k)=>k!==idx)})}/></details>;})
   :<p className="form-note">Finish your first workout to start your record.</p>}
  </section>}

  {!workout&&tab==='progress'&&<section className="routine-library"><span className="eyebrow">Best estimated max per lift</span><h2>Progress</h2>
   {stats.length?stats.map(p=><div className="st-prog" key={p.name}><span><b>{p.name}</b><small>Best {setLabel(p.best)}{p.bestE1?` · ~${Math.round(p.bestE1)} kg max`:''} · {p.sessions} session{p.sessions>1?'s':''} · last {dayLabel(p.last)}</small></span><Trend points={p.trend}/></div>)
   :<p className="form-note">Your lifts appear here after your first workout.</p>}
   {stats.length>0&&<p className="form-note">“Max” is an estimate from your best set (weight × reps), so you can compare sessions with different reps.</p>}
  </section>}
 </div>;
}
