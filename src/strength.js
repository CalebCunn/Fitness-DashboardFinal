// APEX · Strength data: routines (Push A, Pull B…), logged sessions, bests, and the coach's program format.
// Lives in userPrefs, so it syncs: routines [{id,name,exercises:[{name,sets,reps,weight,rest,notes}]}],
// strengthHistory [{routineId,title,date,startedAt,endedAt,volume,exercises:[{name,sets:[{weight,reps,done}]}]}].
import {LIFTS} from './data';
import {localDate} from './apexDates';

const PUBLIC=process.env.REACT_APP_PUBLIC==='true';
export const uid=()=>Math.random().toString(36).slice(2,10);
const key=s=>String(s||'').trim().toLowerCase();

// Routines, with the old single list (lifts) and the old coach workout (currentWorkout) carried over until first edit.
export function readRoutines(userPrefs){
 if(Array.isArray(userPrefs?.routines))return userPrefs.routines;
 const out=[],lifts=userPrefs?.lifts||(PUBLIC?[]:LIFTS);
 if(lifts.length)out.push({id:'routine-1',name:'My routine',exercises:lifts.map(e=>({name:e.name,sets:Number(e.sets)||3,reps:String(e.reps||10),weight:e.weight||'',rest:90}))});
 const w=userPrefs?.currentWorkout;
 if(w?.exercises?.length&&!out.some(r=>key(r.name)===key(w.title)))out.push({id:'routine-2',name:w.title||'Coach workout',exercises:w.exercises.map(e=>({name:e.name,sets:Number(e.sets)||3,reps:String(e.reps||10),weight:e.weight||'',rest:90,notes:e.notes||''}))});
 return out;
}
export const historyOf=userPrefs=>userPrefs?.strengthHistory||[];

// "6-8" → 6 (what to pre-fill), "AMRAP"/"30s" → the text itself.
export const repsStart=r=>{const m=String(r||'').match(/\d+/);return m?m[0]:'10';};
export const restLabel=s=>{s=Number(s)||0;return s>=60?`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`:`${s}s`;};
// Estimated one-rep max (Epley). Only meaningful for loaded sets of 1–15 reps.
export const e1rm=(w,r)=>{w=Number(w);r=Number(r);return w>0&&r>=1&&r<=15?Math.round(w*(1+(r===1?0:r/30))*10)/10:0;};
// For ranking sets: load first; bodyweight sets (0 kg) rank by reps.
const score=s=>e1rm(s.weight,s.reps)||Number(s.reps)/1000;
export const setLabel=s=>Number(s.weight)>0?`${s.weight} kg × ${s.reps}`:`Bodyweight × ${s.reps}`;

// The last completed sets for an exercise, newest session first.
export function lastSets(history,name){
 for(let i=history.length-1;i>=0;i--){const e=history[i].exercises?.find(x=>key(x.name)===key(name));const done=e?.sets?.filter(s=>s.done);if(done?.length)return {date:history[i].date,sets:done};}
 return null;
}
// Per exercise: best set, best estimated max, and its trend across sessions (oldest first).
export function progress(history){
 const by={};
 history.forEach(w=>(w.exercises||[]).forEach(e=>{
  const done=(e.sets||[]).filter(s=>s.done&&s.kind!=='W'&&Number(s.reps)>0);if(!done.length)return;
  const k=key(e.name),p=by[k]||(by[k]={name:e.name,sessions:0,best:null,bestE1:0,bestScore:0,trend:[],last:null});
  const top=done.reduce((a,s)=>score(s)>score(a)?s:a,done[0]),v=e1rm(top.weight,top.reps),sc=score(top);
  p.sessions++;p.last=w.date;p.trend.push({date:w.date,e1:v||Number(top.reps),weight:Number(top.weight)||0,reps:Number(top.reps)});
  if(!p.best||sc>p.bestScore){p.bestScore=sc;p.bestE1=v;p.best={weight:Number(top.weight)||0,reps:Number(top.reps),date:w.date};}
 }));
 return Object.values(by).sort((a,b)=>String(b.last).localeCompare(String(a.last)));
}
// New bests in a just-finished session, compared with everything before it.
export function newBests(history,session){
 const before=Object.fromEntries(progress(history).map(p=>[key(p.name),p.bestScore]));
 return (session.exercises||[]).map(e=>{const done=(e.sets||[]).filter(s=>s.done&&s.kind!=='W'&&Number(s.reps)>0);if(!done.length)return null;const top=done.reduce((a,s)=>score(s)>score(a)?s:a,done[0]),was=before[key(e.name)];
  if(!was||score(top)<=was)return null;return `${e.name} ${setLabel(top)}`;}).filter(Boolean);
}

// What to train next: today's planned gym session if it names a routine, else the routine after the last one done.
export function nextUp(routines,history,plan){
 if(!routines.length)return null;
 const today=localDate(new Date()),gym=(plan?.sessions||[]).find(s=>s.date===today&&s.type==='Gym'&&!s.done);
 if(gym){const text=key(`${gym.notes||''} ${gym.title||''}`);const named=[...routines].sort((a,b)=>b.name.length-a.name.length).find(r=>text.includes(key(r.name)));if(named)return {routine:named,why:'On your plan today'};}
 const last=[...history].reverse().find(w=>w.routineId&&routines.some(r=>r.id===w.routineId));
 if(!last)return {routine:routines[0],why:'First in your rotation'};
 const i=routines.findIndex(r=>r.id===last.routineId);
 return {routine:routines[(i+1)%routines.length],why:`Last time: ${routines[i].name}`};
}

// ── Coach format ──
// ROUTINES_START
// PROGRAM: Push Pull Legs, 4 days
// ROUTINE: Push A
// Bench Press | 4x6-8 | 70kg | 150s | Pause the first rep
// ROUTINES_END
// The older single-session GYM_START block is read the same way, as one routine.
const REST=/^(\d+)\s*(s|sec|secs|seconds)?$|^(\d+)\s*(m|min|mins)$|^(\d+):(\d\d)$/i;
const toRest=t=>{const m=String(t||'').trim().match(REST);if(!m)return null;if(m[1])return +m[1];if(m[3])return +m[3]*60;return +m[5]*60+ +m[6];};
function exerciseLine(l){
 const p=l.replace(/^[-*•\d.)\s]+(?=[A-Za-z])/,'').split('|').map(x=>x.trim());if(p.length<2||!p[0])return null;
 const m=p[1].match(/(\d+)\s*[xX×]\s*([\w–\-–\s]+)/);if(!m)return null;
 let rest=null,notes='';const extra=p.slice(3);
 if(extra.length&&toRest(extra[0])!=null){rest=toRest(extra[0]);notes=extra.slice(1).join(' | ');}else notes=extra.join(' | ');
 return {name:p[0],sets:Math.min(10,+m[1]||3),reps:m[2].replace('–','-').trim(),weight:p[2]&&!/^n\/?a$/i.test(p[2])?p[2]:'',rest:rest||90,notes,...(/^superset/i.test(notes)?{superset:true}:{})};
}
export function parseProgram(text){
 const block=(a,b)=>text.includes(a)&&text.includes(b)?text.split(a)[1].split(b)[0]:null;
 const body=block('ROUTINES_START','ROUTINES_END')??block('GYM_START','GYM_END');if(body==null)return null;
 let program='';const routines=[];let cur=null;
 for(const raw of body.split('\n')){const l=raw.trim();if(!l)continue;
  if(/^PROGRAM:/i.test(l)){program=l.replace(/^PROGRAM:/i,'').trim();continue;}
  if(/^(ROUTINE|TITLE):/i.test(l)){cur={id:uid(),name:l.replace(/^(ROUTINE|TITLE):/i,'').split('|')[0].trim()||`Session ${routines.length+1}`,exercises:[]};routines.push(cur);continue;}
  const e=exerciseLine(l);if(e){if(!cur){cur={id:uid(),name:'Strength session',exercises:[]};routines.push(cur);}cur.exercises.push(e);}
 }
 const ok=routines.filter(r=>r.exercises.length);
 return ok.length?{program,routines:ok}:null;
}
// Saving a coach program: a routine with the same name is replaced in place, new ones are added (or everything replaced).
export function mergeRoutines(existing,incoming,replaceAll=false){
 if(replaceAll)return incoming;
 const out=[...existing];
 incoming.forEach(r=>{const i=out.findIndex(x=>key(x.name)===key(r.name));if(i>=0)out[i]={...r,id:out[i].id};else out.push(r);});
 return out;
}

// What the coach sees: the routines, the last sessions (best set per exercise) and bests.
export function strengthContext(userPrefs){
 const routines=readRoutines(userPrefs),history=historyOf(userPrefs);
 const r=routines.map(x=>`ROUTINE: ${x.name}\n${x.exercises.map(e=>`${e.name} | ${e.sets}x${e.reps} | ${e.weight||'N/A'} | ${e.rest||90}s${e.superset?' | Superset with next':e.notes?` | ${e.notes}`:''}`).join('\n')}`).join('\n');
 const recent=history.slice(-10).reverse().map(w=>{const ex=(w.exercises||[]).map(e=>{const d=(e.sets||[]).filter(s=>s.done);return d.length?`${e.name} ${d.map(s=>`${s.kind?s.kind+':':''}${s.weight}×${s.reps}`).join(', ')}`:null;}).filter(Boolean);return `${w.date} ${w.title}: ${ex.join('; ')||'no completed sets'}`;}).join('\n');
 const bests=progress(history).slice(0,15).map(p=>`${p.name}: best ${setLabel(p.best)}${p.bestE1?` (e1RM ${p.bestE1})`:''}, ${p.sessions} sessions, last ${p.last}`).join('\n');
 const muscles=weeklyMuscleSets(history).map(([m,n])=>`${m} ${n}`).join(', ');
 return `STRENGTH ROUTINES (the athlete's saved routines; the app rotates through them in this order):\n${r||'None yet'}\nRECENT STRENGTH SESSIONS (newest first, completed sets as kg×reps):\n${recent||'None logged'}\nSTRENGTH BESTS:\n${bests||'None yet'}\nWORKING SETS PER MUSCLE, LAST 7 DAYS (W: warm-up, D: drop, F: failure above): ${muscles||'none'}`;
}

// ── Set types ── W warm-up, D drop set, F to failure. Warm-ups don't count towards volume or bests.
export const SET_KINDS=['','W','D','F'];
export const SET_KIND_NAMES={'':'Working set',W:'Warm-up',D:'Drop set',F:'To failure'};
export const working=s=>s.done&&s.kind!=='W';

// ── Progression ── hit the top of the rep range on every working set last time → add load.
export const topReps=r=>{const m=String(r||'').match(/(\d+)\s*[-–]\s*(\d+)/);return m?+m[2]:(String(r).match(/\d+/)?+String(r).match(/\d+/)[0]:null);};
const lower=/squat|deadlift|rdl|leg press|hip thrust|lunge|split squat|step.?up|calf/i,dumbbell=/\bdb\b|dumbbell/i;
export const increment=name=>dumbbell.test(name)?2:lower.test(name)?5:2.5;
export function suggestion(history,e){
 const last=lastSets(history,e.name);if(!last)return null;
 const sets=last.sets.filter(s=>s.kind!=='W'),top=topReps(e.reps),w=Math.max(...sets.map(s=>Number(s.weight)||0));
 if(!top||!w||sets.length<(Number(e.sets)||1)||!sets.every(s=>Number(s.reps)>=top&&Number(s.weight)>=w))return null;
 const next=Math.round((w+increment(e.name))*4)/4;
 return {weight:next,reps:String(e.reps).match(/\d+/)?.[0]||String(top),why:`You hit ${top} on every set at ${w} kg last time`};
}

// ── Plates ── per side, for barbell lifts (20 kg bar).
const barbell=/barbell|bench press|\bbench\b|squat|deadlift|overhead press|\bohp\b|military|bent.?over row|barbell row|hip thrust|good morning/i;
export const isBarbell=name=>barbell.test(name)&&!/\bdb\b|dumbbell|machine|smith|cable|goblet|split|bulgarian|hack|leg press/i.test(name);
export function plates(total,bar=20){
 let side=(Number(total)-bar)/2;if(!(side>0))return null;const out=[];
 for(const p of [25,20,15,10,5,2.5,1.25]){while(side>=p-1e-9){out.push(p);side-=p;}}
 return side>0.01?null:out;
}

// ── Muscles ── rough groups by exercise name, for weekly sets per muscle.
const MUSCLES=[['Chest',/bench|chest|pec|fly|push.?up|dip/i],['Back',/row|pull.?up|chin|pulldown|lat\b|deadlift|face pull|shrug/i],['Shoulders',/overhead|shoulder|lateral|raise|ohp|military|arnold|face pull|rear delt/i],
 ['Biceps',/curl(?!.*leg)|bicep|chin/i],['Triceps',/tricep|pushdown|skull|dip|close.?grip|extension(?!.*leg)/i],['Quads',/squat|leg press|lunge|step.?up|leg extension|split/i],
 ['Hamstrings',/rdl|romanian|deadlift|leg curl|hamstring|good morning|nordic/i],['Glutes',/hip thrust|glute|squat|lunge|split|deadlift|step.?up/i],['Calves',/calf/i],['Core',/plank|crunch|ab\b|abs|core|pallof|dead.?bug|hollow|leg raise|russian/i]];
export const musclesOf=name=>MUSCLES.filter(([,re])=>re.test(name)).map(([m])=>m);
export function weeklyMuscleSets(history,days=7){
 const cut=localDate(new Date(Date.now()-(days-1)*864e5)),by={};
 history.filter(w=>w.date>=cut).forEach(w=>(w.exercises||[]).forEach(e=>{const n=(e.sets||[]).filter(working).length;if(n)musclesOf(e.name).forEach(m=>{by[m]=(by[m]||0)+n;});}));
 return Object.entries(by).sort((a,b)=>b[1]-a[1]);
}
// Every session of one lift, newest first.
export const exerciseLog=(history,name)=>[...history].reverse().map(w=>{const e=(w.exercises||[]).find(x=>key(x.name)===key(name));const s=e?.sets?.filter(x=>x.done);return s?.length?{date:w.date,title:w.title,sets:s}:null;}).filter(Boolean);
