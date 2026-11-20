// APEX · Fuel. Describe or photograph a meal and the AI splits it into items (your own numbers kept exactly),
// review and fix it, then it lands in the right meal of the day. Frequent meals are one tap; targets can be
// suggested from your weight and running.
import {useState,useRef} from 'react';
import {ProStrip} from './ApexPro';
import {usePlan} from './apexPlan';
import {Icon} from './ApexUI';
import {PREVIEW} from './ApexPreview';
import {estimateMeal,sumItems,MACROS,MEAL_TYPES,typeForTime,typeOf,frequentMeals,suggestTargets} from './food';

const fields=[['kcal','Energy','kcal'],['protein','Protein','g'],['carbs','Carbs','g'],['fat','Fat','g']];
const defaults={kcal:3000,protein:140,carbs:300,fat:80};
const blankItem={name:'',amount:'',kcal:'',protein:'',carbs:'',fat:'',source:'you'};
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const num=v=>Number(v||0).toLocaleString('en-GB',{maximumFractionDigits:1});
const validItem=i=>i.name.trim()&&MACROS.every(k=>i[k]!==''&&Number.isFinite(Number(i[k]))&&Number(i[k])>=0);
// Day totals always come from the meals, so they can't drift. Days logged as totals only keep their numbers.
const withTotals=e=>e.meals?.length?{...e,...Object.fromEntries(MACROS.map(k=>[k,String(Math.round(e.meals.reduce((a,m)=>a+(Number(m[k])||0),0)))]))}:e;

// The meal being reviewed: items you can edit, add or remove; the total is their sum.
function Review({meal,setMeal,onSave,onCancel,onFix,busy,editing,today}){
 const [fix,setFix]=useState('');
 const item=(i,patch)=>setMeal({...meal,items:meal.items.map((x,j)=>j===i?{...x,...patch}:x)});
 const total=sumItems(meal.items),ok=meal.name.trim()&&meal.items.length&&meal.items.every(validItem);
 return <div className="fd-review">
  <label className="fd-name">Meal<input value={meal.name} onChange={e=>setMeal({...meal,name:e.target.value})} placeholder="e.g. Beef mince pasta"/></label>
  <div className="fd-types" role="group" aria-label="Which meal">{MEAL_TYPES.map(t=><button key={t} aria-pressed={meal.type===t} onClick={()=>setMeal({...meal,type:t})}>{t}</button>)}</div>
  {meal.assumptions&&<p className="form-note">{meal.assumptions}</p>}
  <div className="fd-items">{meal.items.map((x,i)=><div className="fd-item" key={i}>
   <div className="fd-item-top"><input aria-label="Food" value={x.name} onChange={e=>item(i,{name:e.target.value})} placeholder="Food"/><input aria-label="Amount" className="fd-amt" value={x.amount} onChange={e=>item(i,{amount:e.target.value})} placeholder="Amount"/>{x.source==='you'&&<em className="fd-yours">Yours</em>}<button aria-label={`Remove ${x.name||'item'}`} onClick={()=>setMeal({...meal,items:meal.items.filter((_,j)=>j!==i)})}>×</button></div>
   <div className="fd-macros">{fields.map(([k,l,u])=><label key={k}>{l==='Energy'?'kcal':l}<input type="number" inputMode="decimal" min="0" step="any" value={x[k]} onChange={e=>item(i,{[k]:e.target.value,source:'you'})} aria-label={`${x.name} ${l} (${u})`}/></label>)}</div>
  </div>)}</div>
  <button className="text-button" onClick={()=>setMeal({...meal,items:[...meal.items,{...blankItem}]})}><Icon name="plus" size={16}/> Add an item</button>
  <div className="fd-total"><span>Total</span><strong>{num(total.kcal)} kcal</strong><small>{num(total.protein)} g protein · {num(total.carbs)} g carbs · {num(total.fat)} g fat</small></div>
  {onFix&&<div className="fd-fix"><input value={fix} onChange={e=>setFix(e.target.value)} placeholder="Something off? e.g. the mince was 520 kcal, and no cheese" aria-label="Correct the estimate"/><button className="secondary-action set-small-btn" disabled={busy||!fix.trim()} onClick={()=>{onFix(fix.trim());setFix('');}}>{busy?'Fixing…':'Fix it'}</button></div>}
  <div className="composer-actions"><button className="primary-action" disabled={!ok||busy} onClick={()=>onSave(total)}>{editing?'Save meal':today?'Add to today':'Add to day'} <Icon name="plus" size={17}/></button><button className="secondary-action" onClick={onCancel}>Cancel</button></div>
 </div>;
}

export default function Nutrition({userPrefs,onSavePrefs,acts=[]}){
 const today=ymd(new Date());
 const [selectedDate,setSelectedDate]=useState(today),[editIndex,setEditIndex]=useState(null),[undoMeal,setUndoMeal]=useState(null);
 const log=userPrefs?.nutrition||{},entry=log[selectedDate]||{kcal:'0',protein:'0',carbs:'0',fat:'0',meals:[]};
 const targets={...defaults,...userPrefs?.nutritionTargets};
 const fuel=usePlan();
 const [tab,setTab]=useState('today'),[text,setText]=useState(''),[photo,setPhoto]=useState(null),[meal,setMeal]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[weight,setWeight]=useState('');
 const [targetDraft,setTargetDraft]=useState(targets),file=useRef(null);
 const saveDay=(date,e)=>onSavePrefs({...userPrefs,nutrition:{...log,[date]:withTotals(e)}});
 const reset=()=>{setMeal(null);setEditIndex(null);setText('');setPhoto(null);setError('');};

 const estimate=async(fix)=>{setError('');if(PREVIEW){setError('AI is connected only in your live app. Add items yourself to try it here.');setMeal({name:text.slice(0,40)||'Meal',type:typeForTime(),items:[{...blankItem,name:text||'Food'}]});return;}
  setBusy(true);try{const r=await estimateMeal(fix?{text,photo,previous:{name:meal.name,items:meal.items},correction:fix}:{text,photo});setMeal(m=>({...r,type:m?.type||typeForTime()}));}
  catch(e){setError(e.message||'Unable to estimate this meal.');}finally{setBusy(false);}};
 const save=total=>{
  const old=editIndex!==null?entry.meals[editIndex]:null;
  const m={name:meal.name.trim(),type:meal.type||typeForTime(),time:old?.time||new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}),...total,items:meal.items.map(i=>({...i,...Object.fromEntries(MACROS.map(k=>[k,Number(i[k])||0]))}))};
  saveDay(selectedDate,{...entry,meals:old?entry.meals.map((x,i)=>i===editIndex?m:x):[...(entry.meals||[]),m]});
  setNotice(old?'Meal updated.':`${m.name} added to ${m.type.toLowerCase()}.`);reset();
 };
 const remove=i=>{setUndoMeal({meal:entry.meals[i],date:selectedDate});saveDay(selectedDate,{...entry,meals:entry.meals.filter((_,j)=>j!==i)});setNotice('Meal removed.');};
 const open=(m,i=null)=>{setEditIndex(i);setMeal({name:m.name,type:i===null?typeForTime():typeOf(m),assumptions:'',items:m.items?.length?m.items.map(x=>({...x})):[{...blankItem,name:m.name,...Object.fromEntries(MACROS.map(k=>[k,m[k]??'']))}]});setError('');window.scrollTo?.(0,0);};
 const upload=e=>{const f=e.target.files?.[0];if(!f)return;if(!['image/jpeg','image/png','image/webp','image/gif'].includes(f.type)||f.size>4*1024*1024){setError('Choose a JPG, PNG, WebP or GIF smaller than 4 MB.');return;}const r=new FileReader();r.onload=()=>{setPhoto({url:r.result,data:r.result.split(',')[1],type:f.type});setError('');};r.readAsDataURL(f);};
 const go=n=>{const d=new Date(selectedDate+'T12:00:00');d.setDate(d.getDate()+n);const k=ymd(d);if(k>today)return;setSelectedDate(k);reset();};
 const recent=frequentMeals(log);
 const latestWeight=[...(userPrefs?.weightLog||[])].sort((a,b)=>a.date.localeCompare(b.date)).pop()?.weight;
 const weekKm=acts.filter(a=>/run/i.test(a.sport_type||a.type||'')&&Date.now()-new Date(a.start_date)<7*864e5).reduce((s,a)=>s+(a.distance||0),0)/1000;
 const suggestion=suggestTargets(Number(latestWeight),weekKm);
 const byType=MEAL_TYPES.map(t=>[t,(entry.meals||[]).map((m,i)=>[m,i]).filter(([m])=>typeOf(m)===t)]).filter(([,list])=>list.length);

 return <div className="nutrition-app"><div className="apex-segments" role="tablist" aria-label="Nutrition views">{[['today','Today'],['history','History'],['targets','Your targets']].map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</div>
 {notice&&<p className="save-notice" role="status">{notice}</p>}{undoMeal&&<button className="text-button" onClick={()=>{const source=log[undoMeal.date]||{};saveDay(undoMeal.date,{...source,meals:[...(source.meals||[]),undoMeal.meal]});setUndoMeal(null);setNotice('Meal restored.');}}>Undo meal deletion</button>}
 {tab==='today'&&<><div className="food-date" role="group" aria-label="Food diary date"><button className="glass-button" aria-label="Previous day" onClick={()=>go(-1)}>‹</button><span>{selectedDate===today?'Today':new Date(selectedDate+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'})}</span><button className="glass-button" aria-label="Next day" disabled={selectedDate>=today} onClick={()=>go(1)}>›</button></div>
 <div className="nutrition-overview"><div className="energy-summary"><span className="eyebrow">{selectedDate===today?'Today so far':'That day'}</span><strong>{Number(entry.kcal||0).toLocaleString()}<small>kcal</small></strong><p>{Number(entry.kcal||0)>targets.kcal?`${(Number(entry.kcal)-targets.kcal).toLocaleString()} kcal over your target`:`${Math.max(0,targets.kcal-Number(entry.kcal||0)).toLocaleString()} kcal to your target`}</p><div className="energy-orbit" aria-hidden="true" style={{'--progress':`${Math.min(100,Number(entry.kcal||0)/targets.kcal*100)}%`}}/></div><div className="macro-summary">{fields.slice(1).map(([k,label,u])=><div key={k} className={'macro-row macro-'+k}><div><span>{label}</span><strong>{entry[k]||0}<small> / {targets[k]} {u}</small></strong></div><div className="fuel-track"><i style={{width:`${Math.min(100,Number(entry[k]||0)/targets[k]*100)}%`}}/></div></div>)}</div></div>
 <div className="nutrition-columns"><section className="food-composer"><h2>{editIndex!==null?'Edit meal':'Log a meal'}</h2>
  {meal?<Review meal={meal} setMeal={setMeal} busy={busy} editing={editIndex!==null} today={selectedDate===today} onSave={save} onCancel={reset} onFix={fuel.pro&&!PREVIEW&&(text||photo)?f=>estimate(f):null}/>
  :<>{fuel.ready&&!fuel.pro&&<ProStrip feature="fuel"/>}
   {fuel.pro&&<><textarea aria-label="Describe your meal" placeholder="Beef mince pasta: 520 kcal of mince (I weighed it), about 100 g dry pasta, a jar of tomato sauce shared between two" value={text} onChange={e=>setText(e.target.value)} rows={4}/>
    {photo&&<div className="food-photo"><img src={photo.url} alt="Meal to estimate"/><button onClick={()=>setPhoto(null)}>Remove photo</button></div>}
    <div className="composer-actions"><input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={upload} hidden/><button className="secondary-action" onClick={()=>file.current.click()}><Icon name="plus" size={17}/> Add photo</button><button className="primary-action" disabled={busy||(!text.trim()&&!photo)} onClick={()=>estimate()}>{busy?'Estimating…':'Estimate meal'}<Icon name="arrow" size={17}/></button></div>
    <p className="form-note">Give any numbers you know (calories, grams, a label) and they’re used exactly. You check every item before it’s added.</p></>}
   <button className="text-button" onClick={()=>open({name:'',items:[{...blankItem}]})}><Icon name="plus" size={16}/> Add a meal yourself</button>
   {recent.length>0&&<div className="fd-recent"><span className="eyebrow">Quick add</span><div>{recent.map(m=><button key={m.name} onClick={()=>open(m)}><b>{m.name}</b><small>{num(m.kcal)} kcal</small></button>)}</div></div>}</>}
  {error&&<p className="form-error" role="alert">{error}</p>}</section>
 <section className="food-diary"><div className="stage-top"><span className="eyebrow">Diary</span><span>{entry.meals?.length||0} meals</span></div><h2>Meals</h2>
  {byType.length?byType.map(([t,list])=><div key={t} className="fd-group"><div className="fd-group-head"><span>{t}</span><span>{num(list.reduce((a,[m])=>a+(Number(m.kcal)||0),0))} kcal</span></div>
   {list.map(([m,i])=><div className="diary-meal" key={i}><div className="meal-number">{m.time}</div><div><h3>{m.name}</h3><p>{num(m.kcal)} kcal <span>·</span> {num(m.protein)}g protein{m.items?.length>1?<><span>·</span> {m.items.length} items</>:null}</p></div><div className="meal-tools"><button aria-label={`Edit ${m.name}`} onClick={()=>open(m,i)}>Edit</button><button aria-label={`Repeat ${m.name}`} onClick={()=>open(m)}>Repeat</button><button aria-label={`Remove ${m.name}`} onClick={()=>remove(i)}>×</button></div></div>)}</div>)
  :<p className="form-note">{Number(entry.kcal)>0?'Logged as daily totals.':'Start with your first meal. Every entry helps complete the picture.'}</p>}</section></div>
 <section className="weight-strip"><div><span className="eyebrow">Body weight</span><h2>Weigh in</h2></div><div><label htmlFor="weight-entry">Today’s weight (kg)</label><div className="weight-input"><input id="weight-entry" type="number" min="1" step="0.1" value={weight} onChange={e=>setWeight(e.target.value)} placeholder="e.g. 60.5"/><button className="primary-action" disabled={!Number(weight)||Number(weight)<=0} onClick={()=>{onSavePrefs({...userPrefs,weightLog:[...(userPrefs?.weightLog||[]).filter(w=>w.date!==today),{date:today,weight:Number(weight)}].slice(-120)});setWeight('');setNotice('Weight added to your log.');}}>Save</button></div></div></section></>}
 {tab==='history'&&<><WeightTrend entries={userPrefs?.weightLog||[]}/><section className="food-diary history-panel"><h2>Recent days</h2>{Object.entries(log).sort(([a],[b])=>b.localeCompare(a)).slice(0,30).map(([date,e])=><div className="history-row" key={date}><div><h3>{new Date(date+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})}</h3><p>{e.meals?.map(m=>m.name).join(' · ')||'Daily totals'}</p></div><strong>{Number(e.kcal||0).toLocaleString()}<small> kcal</small></strong><button className="text-button" onClick={()=>{setSelectedDate(date);setTab('today');reset();}}>Open day</button></div>)}{Object.keys(log).length===0&&<p>No meals logged yet.</p>}</section></>}
 {tab==='targets'&&<section className="food-composer target-panel"><h2>Daily targets</h2>
  {suggestion?<div className="fd-suggest"><p>For <b>{latestWeight} kg</b> and <b>{Math.round(weekKm)} km</b> of running this week, a good starting point is <b>{suggestion.kcal.toLocaleString()} kcal</b>, {suggestion.protein} g protein, {suggestion.carbs} g carbs and {suggestion.fat} g fat.</p><button className="secondary-action set-small-btn" onClick={()=>setTargetDraft(suggestion)}>Use these</button></div>
   :<p className="form-note">Log your weight on Today and Apex can suggest targets from your weight and running.</p>}
  <div className="meal-fields"><div>{fields.map(([k,label,u])=><label key={k}>{label} ({u})<input type="number" min="1" value={targetDraft[k]} onChange={e=>setTargetDraft({...targetDraft,[k]:e.target.value})}/></label>)}</div><button className="primary-action" disabled={fields.some(([k])=>!Number.isFinite(Number(targetDraft[k]))||Number(targetDraft[k])<=0)} onClick={()=>{onSavePrefs({...userPrefs,nutritionTargets:Object.fromEntries(fields.map(([k])=>[k,Number(targetDraft[k])]))});setNotice('Daily targets updated.');}}>Save targets</button></div>
  <p className="form-note">Suggestions use common sports-nutrition guides (about 1.8 g protein per kg, more carbs as your running goes up). They’re a starting point, not medical advice.</p></section>}
 </div>;
}

function WeightTrend({entries}){const points=entries.filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&Number(x.weight)>0).sort((a,b)=>a.date.localeCompare(b.date)).slice(-14),values=points.map(p=>Number(p.weight));if(!points.length)return <section className="weight-history"><h2>Your weight over time</h2><p>Log your weight to start a record of your progress.</p></section>;const min=Math.min(...values)-.5,max=Math.max(...values)+.5,first=new Date(points[0].date+'T12:00:00').getTime(),last=new Date(points[points.length-1].date+'T12:00:00').getTime(),path=points.map((p,i)=>`${i?'L':'M'}${20+(new Date(p.date+'T12:00:00').getTime()-first)/(last-first||1)*460},${110-(Number(p.weight)-min)/(max-min)*90}`).join(' ');return <section className="weight-history"><span className="eyebrow">Latest weight</span><h2>{values[values.length-1]} <small>kg</small></h2>{points.length>1&&<svg viewBox="0 0 500 130" role="img" aria-label={`Weight from ${values[0]} to ${values[values.length-1]} kilograms between ${points[0].date} and ${points[points.length-1].date}`}><path d={path} fill="none" stroke="currentColor" strokeWidth="3"/></svg>}<p>{points[0].date} → {points[points.length-1].date} · {points.length} readings. Individual measurements fluctuate.</p><details><summary>View measurements</summary>{points.map((p,i)=><p key={i}>{p.date} · {p.weight} kg</p>)}</details></section>;}
