import {useState,useEffect,useRef} from 'react';
import {Icon} from './ApexUI';
import {fPace} from './data';
import * as persistence from './supabase';
import {PREVIEW,previewStore} from './ApexPreview';
const {loadChatHistory,saveChatHistory}=PREVIEW?previewStore:persistence;
const appFetch=(...args)=>fetch(...args);
export default function CoachScreen({acts,stats,whoop,whoopOk,onPlanSaved,onGymSaved,userPrefs,T}){
  const [msgs,setMsgs]=useState([{role:"assistant",content:"Let’s make the next step a good one. What would you like to work on?"}]);
  const [loaded,setLoaded]=useState(false);
  const [input,setInput]=useState("");
  const [sending,setSending]=useState(false);
  const [imgs,setImgs]=useState([]);
  const bottom=useRef(null);
  const fileRef=useRef(null);
  useEffect(()=>{loadChatHistory().then(m=>{if(m?.length>0)setMsgs(m);setLoaded(true);}).catch(()=>setLoaded(true));},[]);
  useEffect(()=>{if(msgs.length>1)bottom.current?.scrollIntoView({behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth",block:"nearest"});},[msgs]);
  useEffect(()=>{if(loaded)saveChatHistory(msgs);},[msgs,loaded]);

  const handleFiles=e=>{Array.from(e.target.files).forEach(f=>{const r2=new FileReader();r2.onload=ev=>setImgs(p=>[...p,{b64:ev.target.result.split(",")[1],type:f.type,preview:ev.target.result}].slice(0,3));r2.readAsDataURL(f);});};

  const extractPlan=text=>{
    if(!text.includes("PLAN_START")||!text.includes("PLAN_END"))return null;
    try{
      const sec=text.split("PLAN_START")[1].split("PLAN_END")[0].trim();
      const lines=sec.split("\n").map(l=>l.trim()).filter(Boolean);
      let title="Training Plan";const sessions=[];
      for(const l of lines){if(l.startsWith("TITLE:")){title=l.replace("TITLE:","").trim();continue;}const pts=l.split("|").map(p=>p.trim());if(pts.length>=4)sessions.push({day:pts[0],type:pts[1],dist:pts[2],pace:pts[3],shoe:pts[4]||"",notes:pts[5]||""});}
      if(sessions.length>=3){const st=new Date();st.setHours(0,0,0,0);sessions.forEach((s,i)=>{const d=new Date(st);d.setDate(st.getDate()+i);s.date=d.toISOString().split("T")[0];});return{title,startDate:new Date().toISOString().split("T")[0],sessions};}
    }catch{}return null;
  };
  const extractGym=text=>{
    if(!text.includes("GYM_START")||!text.includes("GYM_END"))return null;
    try{const sec=text.split("GYM_START")[1].split("GYM_END")[0].trim();const lines=sec.split("\n").map(l=>l.trim()).filter(Boolean);let title="Gym Session";const exercises=[];for(const l of lines){if(l.startsWith("TITLE:")){title=l.replace("TITLE:","").trim();continue;}const pts=l.split("|").map(p=>p.trim());if(pts.length>=3){const m=pts[1].match(/(\d+)[xX](\d+)/);exercises.push({name:pts[0],sets:m?parseInt(m[1]):3,reps:m?parseInt(m[2]):10,weight:pts[2],notes:pts[3]||""});}}return exercises.length>0?{title,exercises,date:new Date().toISOString().split("T")[0]}:null;}catch{}return null;
  };
  const clean=text=>{let o=text;if(o.includes("PLAN_START")&&o.includes("PLAN_END")){const b=o.split("PLAN_START")[0].trim();const a=o.split("PLAN_END")[1]?.trim()||"";o=(b+(a?"\n\n"+a:"")).trim();}if(o.includes("GYM_START")&&o.includes("GYM_END")){const b=o.split("GYM_START")[0].trim();const a=o.split("GYM_END")[1]?.trim()||"";o=(b+(a?"\n\n"+a:"")).trim();}return o;};

  const buildCtx=()=>{
    const runs=acts.filter(a=>a.type==="Run").slice(0,5),ytd=stats?.ytd_run_totals||{};
    const rec=whoop?.recoveries?.records?.[0],sleep=whoop?.sleeps?.records?.[0];
    const recScore=rec?Math.round(rec.score?.recovery_score||0):null;
    const slScore=sleep?Math.round(sleep.score?.sleep_performance_percentage||0):null;
    const recs7=(whoop?.recoveries?.records||[]).slice(0,7).map(r=>`${new Date(r.created_at).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}: ${Math.round(r.score?.recovery_score||0)}% rec, HRV ${Math.round(r.score?.hrv_rmssd_milli||0)}ms, RHR ${Math.round(r.score?.resting_heart_rate||0)}`).join("\n");
    const nut=Object.entries(userPrefs?.nutrition||{}).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,7).map(([d,e])=>`${new Date(d).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short"})}: ${[e.kcal&&e.kcal+"kcal",e.protein&&e.protein+"g P",e.carbs&&e.carbs+"g C"].filter(Boolean).join(", ")}`).join("\n");
    const planSummary=userPrefs?.currentPlan?.sessions?.map((s,i)=>{const d=new Date(s.date||userPrefs.currentPlan.startDate||new Date());if(!s.date)d.setDate(d.getDate()+i);return`${d.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"})}: ${s.type}${s.dist&&s.dist!=="0km"?" "+s.dist:""}${s.pace&&s.pace!=="N/A"?" at "+s.pace:""}${s.done?" (DONE)":""}`;}).join("\n")||"No active plan";
    return `You are a personal running coach and performance advisor for Caleb Cunningham. Write in plain sentences. Never use double dashes, markdown headers, or bullet lists. Never plan more than 2 weeks at a time.

TODAY: ${new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"})} at ${new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})} UK time. Use this exact date for all planning — attach real calendar dates to every session.

CALEB: 20yo, graphic design student, Kingston University. Started running Jul 2024. VO2 Max 67, threshold 3:57/km, max HR 208. PBs: 5K 18:42, 10K 40:52, HM 1:32:48, Marathon 3:48:59 (London Apr 2026). Target: Berlin 28 Sep 2026 Sub 3:20, Seville Feb 2027 Sub 3:00. Running all 6 World Majors for charity. Brother Noah has Duchenne Muscular Dystrophy.

COACHING NOTE: CV fitness is ahead of structural fitness. Berlin block focus is hitting 25-30km long runs he never hit in London build. Recovery-aware planning is essential.

TODAY'S DATA: Recovery ${recScore!==null?recScore+"%":"unknown"}${slScore!==null?", sleep "+slScore+"%":""}${recScore!==null&&recScore<34?" — LOW RECOVERY, rest or easy only.":""}

WHOOP 7 DAYS:\n${recs7||"Not connected"}

STRAVA: YTD ${ytd.distance?(ytd.distance/1000).toFixed(1):"unknown"}km, ${ytd.count??"unknown"} runs.
RECENT RUNS:\n${runs.map(r=>`${r.name} (${new Date(r.start_date_local).toLocaleDateString("en-GB")}): ${(r.distance/1000).toFixed(2)}km at ${fPace(r.average_speed)}/km${r.average_heartrate?" "+Math.round(r.average_heartrate)+"bpm":""}`).join("\n")}

NUTRITION (7 days):\n${nut||"None logged"}

CURRENT PLAN:\n${planSummary}

SHOES: Metaspeed Sky Tokyo Green (race), Red (carbon trainer), Vaporfly 3&4 (intervals), ZoomFly 5 (training), Novablast 5+Superfeet (easy/long), Evo SL (daily/tempo).
SAVED PREFERENCES: ${JSON.stringify({races:userPrefs?.races,nutritionTargets:userPrefs?.nutritionTargets,lifts:userPrefs?.lifts})}. Prefer these saved settings over any older profile notes.
GYM: Chest focus. Smith flat bench 20kg/side 3x10, incline 15kg/side 3x10, pec deck 73kg 3x12, preacher curl 39kg 3x10, hammer curl 16kg 3x12, lateral raises 8-10kg 3x15. Weight 58-61kg target 65kg.

PLAN FORMAT (use this exactly when building a plan):
PLAN_START
TITLE: [title]
[Day] | [Type] | [Xkm] | [pace range]/km | [Shoe] | [detailed description]
(7 or 14 rows, one per day, rest: Mon | Rest | 0km | N/A | N/A | Rest day)
PLAN_END

GYM FORMAT:
GYM_START
TITLE: [title]
[Exercise] | [S]x[R] | [Weight] | [Notes]
GYM_END`;
  };

  const send=async()=>{
    if((!input.trim()&&!imgs.length)||sending)return;
    if(PREVIEW){setMsgs(p=>[...p,{role:"user",content:input},{role:"assistant",content:"This preview keeps your live AI service disconnected. In your deployed app, this conversation uses your existing Claude connection."}]);setInput("");return;}
    const content=[];
    imgs.forEach(img=>content.push({type:"image",source:{type:"base64",media_type:img.type,data:img.b64}}));
    if(input.trim())content.push({type:"text",text:input.trim()});
    const userMsg={role:"user",content:imgs.length?content:input.trim()};
    const display={role:"user",content:input.trim()||(imgs.length?`${imgs.length} image${imgs.length>1?"s":""}`:""),previews:imgs.map(i=>i.preview)};
    setMsgs(p=>[...p,display]);setInput("");setImgs([]);setSending(true);
    try{
      const apiMsgs=[...msgs,userMsg].map(m=>({role:m.role,content:m.content}));
      const res=await appFetch("/.netlify/functions/claude-chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({system:buildCtx(),messages:apiMsgs})});
      const data=await res.json();
      if(!res.ok||data.error)throw new Error("The coach is unavailable. Please try again.");
      const reply=data.content?.[0]?.text||"No reply was returned. Please try again.";
      const plan=extractPlan(reply),gym=extractGym(reply),cleaned=clean(reply);
      setMsgs(p=>[...p,{role:"assistant",content:cleaned||"Here’s a starting point to review.",plan,gym}]);
    }catch{setMsgs(p=>[...p,{role:"assistant",content:"Something went wrong. Try again."}]);}
    setSending(false);
  };

  const CHIPS=["How is my recovery?","Plan my next week","Give me a gym session","Help me prepare for my next race","Analyse my recent training"];

  return <div className="coach-studio"><aside className="coach-context"><div className="coach-emblem"><Icon name="coach" size={43}/></div><span className="eyebrow">A CONVERSATION WITH CONTEXT</span><h2>A clearer way<br/>forward.</h2><p>Make space for the bigger picture. Shape your training, fuel and recovery around your life.</p><div className="context-signals"><div><Icon name="activity" size={18}/><span>Recent activities</span><strong>{acts.length}</strong></div><div><Icon name="recovery" size={18}/><span>WHOOP recovery</span><strong>{whoop?.recoveries?.records?.[0]?.score?.recovery_score??'—'}%</strong></div><div><Icon name="plan" size={18}/><span>Training plan</span><strong>{userPrefs?.currentPlan?'Available':'Not set'}</strong></div></div><span className="eyebrow context-prompt-label">A PLACE TO START</span><div className="coach-prompts">{CHIPS.map(c=><button key={c} onClick={()=>{setInput(c);document.getElementById('coach-input')?.focus();}}>{c}<Icon name="arrow" size={16}/></button>)}</div></aside><section className="coach-conversation"><div className="conversation-top"><div><Icon name="coach" size={20}/><span>APEX Coach</span><small>Powered by Claude</small></div><button className="text-button" onClick={()=>{setMsgs([{role:'assistant',content:'A fresh start. What would you like to work on?'}]);}}>New conversation</button></div><div className="conversation-messages">{msgs.map((m,i)=><article key={i} className={`coach-message ${m.role==='user'?'from-you':'from-coach'}`}><span className="message-author">{m.role==='user'?'YOU':'APEX'}</span>{m.previews?.length>0&&<div className="message-images">{m.previews.map((src,j)=><img key={j} src={src} alt="Attached to conversation"/>)}</div>}<p>{typeof m.content==='string'?m.content:'Image attached'}</p>{m.plan&&<div className="coach-proposal"><span className="eyebrow">PROPOSED TRAINING PLAN</span><h3>{m.plan.title}</h3><p>{m.plan.sessions.length} sessions · replaces your current plan when applied</p><details><summary>Review sessions</summary>{m.plan.sessions.map((session,j)=><div key={j}><strong>{session.date} · {session.type}</strong><span>{session.dist} · {session.pace}</span><p>{session.notes}</p></div>)}</details><button className="primary-action" disabled={m.applied} onClick={()=>{onPlanSaved(m.plan);setMsgs(msgs.map((msg,j)=>j===i?{...msg,applied:true}:msg));}}>{m.applied?'Plan applied':'Apply to my training'}</button></div>}{m.gym&&<div className="coach-proposal"><span className="eyebrow">PROPOSED WORKOUT</span><h3>{m.gym.title}</h3>{m.gym.exercises.map((e,j)=><p key={j}>{e.name} · {e.sets} × {e.reps} · {e.weight}</p>)}<button className="primary-action" disabled={m.gymApplied} onClick={()=>{onGymSaved(m.gym);setMsgs(msgs.map((msg,j)=>j===i?{...msg,gymApplied:true}:msg));}}>{m.gymApplied?'Added to strength':'Add to strength'}</button></div>}</article>)}{sending&&<div className="coach-thinking" role="status"><i/><i/><i/><span>Considering your question…</span></div>}<div ref={bottom}/></div><div className="coach-compose">{imgs.length>0&&<div className="message-images">{imgs.map((img,i)=><button key={i} onClick={()=>setImgs(imgs.filter((_,j)=>j!==i))} aria-label={`Remove image ${i+1}`}><img src={img.preview} alt="Attachment preview"/><span>×</span></button>)}</div>}<textarea id="coach-input" aria-label="Message your coach" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}} placeholder="What’s on your mind?" rows={3}/><div><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={handleFiles}/><button className="secondary-action" onClick={()=>fileRef.current.click()} aria-label="Attach an image"><Icon name="plus" size={18}/></button><span>Shift + Enter for a new line</span><button className="primary-action" disabled={sending||(!input.trim()&&!imgs.length)} onClick={send}>Send <Icon name="arrow" size={18}/></button></div></div><p className="coach-note">AI suggestions are a starting point. Review plans before applying them.</p></section></div>;
}
