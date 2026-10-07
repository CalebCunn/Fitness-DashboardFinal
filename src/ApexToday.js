// APEX · Today's call. Turns recovery, form, the plan, your zones, your shoes and
// the weather into one plain verdict for the morning, plus the details you need
// at the door: a heart-rate cap, the shoe to wear and a heat-adjusted pace.
import {useEffect,useRef,useState} from 'react';
import {localDate,addDays} from './apexDates';

const isRun=a=>a.type==='Run'||a.sport_type==='Run'||a.sport_type==='TrailRun';
const HARD=['Interval','Tempo','Long Run'];

// ── Weather at your usual run time (Open-Meteo, no key, no location prompt:
// it uses where your latest run started) ──
const WX_KEY='apex-weather-v2';
function usualHour(acts){
 const hrs=acts.filter(isRun).slice(0,20).map(a=>{const d=new Date(a.start_date_local||a.start_date);return a.start_date_local?d.getUTCHours():d.getHours();}).sort((a,b)=>a-b);
 return hrs.length?hrs[Math.floor(hrs.length/2)]:7;
}
const WX_WORDS=[[0,'Clear'],[1,'Mostly clear'],[2,'Partly cloudy'],[3,'Overcast'],[45,'Fog'],[51,'Drizzle'],[61,'Rain'],[66,'Freezing rain'],[71,'Snow'],[80,'Showers'],[95,'Thunder']];
const wxWord=c=>{let w='—';WX_WORDS.forEach(([k,v])=>{if(c>=k)w=v;});return w;};

export function useWeather(acts){
 const [wx,setWx]=useState(null);
 const spot=acts.find(a=>Array.isArray(a.start_latlng)&&a.start_latlng.length===2)?.start_latlng;
 const hour=usualHour(acts),today=localDate(new Date());
 useEffect(()=>{
  if(!spot)return;
  let alive=true;
  try{const c=JSON.parse(sessionStorage.getItem(WX_KEY));if(c&&c.day===today&&c.hour===hour){setWx(c);return;}}catch{}
  const url=`https://api.open-meteo.com/v1/forecast?latitude=${spot[0].toFixed(3)}&longitude=${spot[1].toFixed(3)}&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code&timezone=auto&forecast_days=2`;
  fetch(url).then(r=>r.ok?r.json():null).then(d=>{
   if(!alive||!d?.hourly?.time)return;
   const now=new Date(),target=now.getHours()>hour?now.getHours()+1:hour;
   const key=`${today}T${String(Math.min(23,target)).padStart(2,'0')}:00`,i=Math.max(0,d.hourly.time.indexOf(key));
   const hours=d.hourly.time.map((t,j)=>t.startsWith(today)?{h:+t.slice(11,13),temp:d.hourly.temperature_2m[j],feels:d.hourly.apparent_temperature[j],rain:d.hourly.precipitation_probability?.[j]??0,wind:d.hourly.wind_speed_10m?.[j]??0,word:wxWord(d.hourly.weather_code?.[j]??0)}:null).filter(x=>x&&x.h>=5&&x.h<=21);
   const v={day:today,hour,at:d.hourly.time[i]?.slice(11,16),temp:d.hourly.temperature_2m[i],feels:d.hourly.apparent_temperature[i],rain:d.hourly.precipitation_probability?.[i],wind:d.hourly.wind_speed_10m?.[i],word:wxWord(d.hourly.weather_code?.[i]??0),hours};
   setWx(v);try{sessionStorage.setItem(WX_KEY,JSON.stringify(v));}catch{}
  }).catch(()=>{});
  return()=>{alive=false;};
 },[spot?.[0],spot?.[1],hour,today]);// eslint-disable-line
 return wx;
}

// Roughly 1.5 to 2 s/km slower per °C above 15°C (feels-like), a common rule of thumb.
export function heatCost(feels){if(!Number.isFinite(feels)||feels<=15)return 0;return Math.round((feels-15)*1.8);}

// Top of zone 2 from your heart-rate settings: the easy-day ceiling.
export function easyCap(hr){
 if(!hr?.max)return null;
 return hr.model==='max'||!hr.rest?Math.round(hr.max*.7):Math.round(hr.rest+.7*(hr.max-hr.rest));
}

// The shoe to wear: matches the session to each pair's role, then prefers the
// pair with the most life left.
const ROLE_FOR={Easy:['Daily trainer','Recovery','Long run'],'Long Run':['Long run','Daily trainer'],Tempo:['Tempo','Race'],Interval:['Race','Tempo'],Rest:[],Gym:[]};
export function shoeToWear(shoes,type){
 const live=shoes.filter(s=>!s.retired&&s.km<s.limit);
 if(!live.length||!ROLE_FOR[type]?.length&&type)return null;
 const roles=ROLE_FOR[type]||['Daily trainer'];
 const match=live.filter(s=>roles.includes(s.role)).sort((a,b)=>roles.indexOf(a.role)-roles.indexOf(b.role)||(a.km/a.limit)-(b.km/b.limit));
 return match[0]||live.filter(s=>!['Race'].includes(s.role)).sort((a,b)=>(b.last||'').localeCompare(a.last||''))[0]||null;
}

// The verdict. Deterministic, so it never invents anything: every clause comes
// from a number you can see on the screen.
export function todaysCall({score,tsb,session,todayRun,cap,sessions=[],today}){
 const type=session?.type,hard=HARD.includes(type),capTxt=cap?`under ${cap} bpm`:'conversational';
 const nextFree=()=>{for(let i=1;i<=6;i++){const k=addDays(today,i);if(!sessions.some(s=>s.date===k&&s.type!=='Rest'))return new Date(k+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long'});}return 'later in the week';};
 if(todayRun)return {tone:'done',head:'Done for today.',line:`Recover well: eat within the hour and get to bed on time.${session&&session.type!=='Rest'?'':' It wasn’t on the plan, so tomorrow stays as written.'}`};
 if(type==='Rest')return score!=null&&score>=67?{tone:'rest',head:'Rest day. Trust it.',line:'You feel fresh because the rest is working. Walk, stretch, sleep.'}:{tone:'rest',head:'Rest day.',line:'Recovery is part of the work. Easy movement only.'};
 if(type==='Gym')return score!=null&&score<34?{tone:'swap',head:'Go light in the gym.',line:'Recovery is low. Drop a set from each lift and skip anything to failure.'}:{tone:'go',head:'Strength day.',line:'Lift well. Leave a rep in the tank so your legs are fresh for running.'};
 if(!session)return score==null?{tone:'free',head:'Nothing planned.',line:'Add a session, or ask your coach to build your week.'}:score>=50?{tone:'free',head:'Free day. You’re up for it.',line:`If you run, keep it easy: 30 to 45 minutes, ${capTxt}.`}:{tone:'free',head:'Free day. Take it.',line:'Recovery is middling. Rest, or a short walk.'};
 if(score==null)return hard?{tone:'go',head:`${type==='Long Run'?'Long run':type} today.`,line:'No recovery reading yet. Warm up properly and judge it by how the first 10 minutes feel.'}:{tone:'go',head:'Easy today.',line:`Keep it ${capTxt}.`};
 if(score<34)return hard?{tone:'swap',head:'Swap it.',line:`Recovery is low (${score}). Run easy or rest today and move the ${type==='Long Run'?'long run':type.toLowerCase()} to ${nextFree()}.`}:{tone:'swap',head:'Shorten it.',line:`Recovery is low (${score}). Cut it to 20 to 30 minutes, ${capTxt}, or rest.`};
 if(score<67)return hard?{tone:'care',head:'Go, but cap it.',line:`Middling recovery (${score}). Hold the target pace, not faster, and stop the reps if your form falls apart.`}:{tone:'go',head:'Easy means easy.',line:`Keep it ${capTxt}. It’s what lets the hard days count.`};
 if(tsb!=null&&tsb<-30)return {tone:'care',head:hard?'Green light, but you’re loaded.':'Easy means easy.',line:`Recovery is good (${score}) but fatigue has stacked up (form ${Math.round(tsb)}). ${hard?'Run it as written, no extras.':`Keep it ${capTxt}.`}`};
 return hard?{tone:'go',head:'Green light.',line:`Recovery ${score}${tsb!=null?` and form ${tsb>=0?'+':''}${Math.round(tsb)}`:''}: a good day to hit it. Warm up well and run the targets.`}:{tone:'go',head:'Green light. Easy means easy.',line:`You’re fresh (${score}). Bank it: keep this one ${capTxt}.`};
}

export function coachDraft({score,energy,session,call,wx}){
 const bits=[score!=null?`Recovery ${score}`:null,energy?`energy ${energy}/5`:null,wx?`${Math.round(wx.feels)}°C at ${wx.at}`:null].filter(Boolean).join(', ');
 const plan=session&&session.type!=='Rest'?`${parseFloat(session.dist)?`${session.dist} `:''}${session.type.toLowerCase()} planned`:'nothing planned';
 return `${bits?bits+'. ':''}I’ve got ${plan} today. APEX says “${call.head}” Does that sound right, or should I change anything?`;
}

export const yesterdayKey=()=>addDays(localDate(new Date()),-1);

// ── The morning race: recovery, sleep, form and the week as four lanes. ──
// Each runner sits as far down the straight as that number allows; the ones
// past 70% are leading and get the gold dot. The headline reads the race.
export function laneRace({score,asleepMs,tsb,weekM,plannedKm,fmt}){
 const clamp=t=>Math.max(0,Math.min(1,t));
 const lanes=[
  score!=null&&{key:'recovery',label:'Recovery',t:score/100,value:String(score),go:'recovery'},
  asleepMs&&{key:'sleep',label:'Sleep',t:asleepMs/(8*3600000),value:fmt.hm(asleepMs),go:'recovery'},
  tsb!=null&&{key:'form',label:'Form',t:(tsb+35)/55,value:`${tsb>=0?'+':''}${Math.round(tsb)}`,go:'performance'},
  {key:'week',label:'Week',t:plannedKm?weekM/(plannedKm*1000):0,value:plannedKm?`${fmt.km(weekM)} / ${Math.round(plannedKm)} km`:`${fmt.km(weekM)} km`,go:'plan',quiet:!plannedKm},
 ].filter(Boolean).map(l=>({...l,t:clamp(l.t),lead:l.key!=='week'&&clamp(l.t)>=.7}));
 const scored=lanes.filter(l=>l.key!=='week'),leads=scored.filter(l=>l.lead).length;
 const head=!scored.length?['Your morning,','in four lanes.']:leads===scored.length?['Readiness','is winning.']:leads*2>=scored.length?['Mostly','ready.']:leads?['Hold','back today.']:['A slow','start today.'];
 return {lanes,head};
}

export function LaneRace({race,onOpen}){
 return <div className="lanes" role="list">
  <i className="lanes-finish" aria-hidden="true"/>
  {race.lanes.map((l,i)=><button key={l.key} role="listitem" className={`lane${l.lead?' is-lead':''}`} style={{'--t':l.t}} onClick={()=>onOpen?.(l.go)} aria-label={`${l.label} ${l.value}${l.lead?', leading':''}`}>
   <span className="lane-n">{i+1}</span><span className="lane-l">{l.label}</span>
   <span className="lane-run" aria-hidden="true"><i/><b/></span>
   <span className="lane-v">{l.value}</span>
  </button>)}
 </div>;
}

// ── Make the call: the recommendation and its alternatives as swipeable cards. ──
const NAME={Easy:'easy','Long Run':'long run',Tempo:'tempo',Interval:'intervals',Recovery:'recovery run',Race:'race'};
export function nextFreeDay(sessions,today){for(let i=1;i<=6;i++){const k=addDays(today,i);if(!sessions.some(s=>s.date===k&&s.type!=='Rest'))return new Date(k+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long'});}return 'later in the week';}
const km1=k=>k%1?k.toFixed(1):String(k);

export function callOptions({session,call,score,cap,sessions=[],today,todayRun,hasPlan}){
 if(todayRun)return [];
 const type=session?.type,capTxt=cap?`under ${cap} bpm`:'conversational';
 const rest=line=>({key:'rest',kind:'rest',title:'Rest today',line});
 let opts=[],rec=0;
 if(type==='Rest'||(!session&&score==null&&!hasPlan))return [];
 if(!session){
  opts=[{key:'easy',kind:'easier',title:'30–45 min easy',line:`Keep it ${capTxt}. Flat, relaxed, done.`},rest('Take the free day. A walk and an early night.')];
  rec=score>=50?0:1;
 }else if(type==='Gym'){
  opts=[{key:'plan',kind:'plan',title:'Strength',line:'As written. Leave a rep in the tank on every set.'},{key:'easier',kind:'easier',title:'Light strength',line:'Drop a set from each lift and skip anything to failure.'},rest('Skip the gym today and slot it in later this week.')];
  rec=call.tone==='swap'?1:0;
 }else{
  const k=parseFloat(session.dist)||0,name=NAME[type]||type.toLowerCase(),hard=['Interval','Tempo','Long Run'].includes(type),free=nextFreeDay(sessions,today);
  opts=[
   {key:'plan',kind:'plan',title:k?`${km1(k)} km ${name}`:name[0].toUpperCase()+name.slice(1),line:'As written on your plan.'},
   hard?{key:'easier',kind:'easier',title:`${km1(Math.max(3,Math.round(k*.7)))||6} km easy`,line:`Keep the habit, skip the cost: ${capTxt}. Move the ${name} to ${free}.`}
       :{key:'easier',kind:'easier',title:`${km1(Math.max(3,Math.round(k*.6)))} km very easy`,line:`Shorter and slower: ${capTxt}, flat route, no strides.`},
   rest(hard?`Move the ${name} to ${free}. Walk, stretch, sleep.`:'Take the day. A walk and an early night.'),
  ];
  rec=call.tone==='swap'?1:0;
 }
 return opts.map((o,i)=>({...o,recommended:i===rec,line:i===rec?`${call.head} ${call.line}`:o.line,tag:`${i===rec?'Recommended':'Option'} · ${{plan:'as planned',easier:'easier',rest:'rest'}[o.kind]}`}));
}

export function CallDeck({options,chosen,onChoose,why=[]}){
 const [at,setAt]=useState(0),track=useRef(null),startIdx=Math.max(0,options.findIndex(o=>o.key===(chosen||options.find(x=>x.recommended)?.key)));
 // Open on the recommended (or chosen) card, without animating.
 useEffect(()=>{const el=track.current,card=el?.children?.[startIdx];if(el&&card){el.scrollLeft=card.offsetLeft-el.firstChild.offsetLeft;setAt(startIdx);}},[startIdx]);
 const onScroll=e=>{const el=e.currentTarget,w=el.firstChild?.offsetWidth||1;setAt(Math.round(el.scrollLeft/(w+12)));};
 const pick=chosen||options.find(o=>o.recommended)?.key;
 return <div className="call-deck">
  <div className="call-head"><span className="label">Today’s call</span><span className="label">{options.length>1?'Swipe for options':''}</span></div>
  <div className="call-track" ref={track} onScroll={onScroll} role="radiogroup" aria-label="Today’s call">
   {options.map(o=><article key={o.key} className={`call-card is-${o.kind}${o.recommended?' is-rec':''}${pick===o.key?' is-picked':''}`}>
    <span className="label">{o.tag}</span>
    <h3>{o.title}</h3>
    <p>{o.line}</p>
    <footer>
     {o.recommended&&why.length>0&&<span className="call-why">{why.map(w=><b key={w}>{w}</b>)}</span>}
     <button role="radio" aria-checked={pick===o.key} className="call-pick" onClick={()=>onChoose(o.key)}>{pick===o.key?'Your call':'Choose'}</button>
    </footer>
   </article>)}
  </div>
  {options.length>1&&<div className="call-dots" aria-hidden="true">{options.map((o,i)=><i key={o.key} className={i===at?'on':''}/>)}</div>}
 </div>;
}

// The best hour to run today: dry first, then close to 10°C feels-like, then calm,
// with a small pull towards the hour you usually run. Only hours still ahead.
export function bestHour(wx,usual=7,from=new Date().getHours()){
 const hrs=(wx?.hours||[]).filter(x=>x.h>=Math.max(5,from)&&x.h<=20);
 if(!hrs.length)return null;
 const cost=x=>x.rain*.6+Math.abs(x.feels-10)*2.2+x.wind*.25+Math.abs(x.h-usual)*1.2;
 return hrs.reduce((b,x)=>cost(x)<cost(b)?x:b);
}
export {usualHour};
