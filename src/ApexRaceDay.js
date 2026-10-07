// APEX · Race week and race day. In the seven days before your goal race, Today
// opens on the race: what to do each day, then on the morning itself a live
// countdown to the gun, your morning timeline and an even-pace band.
import {useEffect,useState} from 'react';

// "3:00" or "1:29" read as h:mm; "19:30" or "45:00" as mm:ss; "2:59:30" as h:mm:ss.
const parseTarget=t=>{const m=String(t||'').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);if(!m)return null;if(m[3]!=null)return +m[1]*3600+ +m[2]*60+ +m[3];return +m[1]>=10?+m[1]*60+ +m[2]:+m[1]*3600+ +m[2]*60;};
const clock=s=>{s=Math.max(0,Math.round(s));const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`:`${m}:${String(x).padStart(2,'0')}`;};
const hhmm=d=>d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});

export function raceWindow(goal,today){
 if(!goal?.date||!/^\d{4}-\d{2}-\d{2}$/.test(goal.date))return null;
 const days=Math.round((new Date(goal.date+'T12:00:00')-new Date(today+'T12:00:00'))/86400000);
 return days>=0&&days<=7?days:null;
}

export function paceBand(goal){
 const km=parseFloat(goal?.distance)||42.195,target=parseTarget(goal?.target);
 if(!target)return null;
 const per=target/km,marks=[[5,'5K'],[10,'10K'],[21.0975,'Half'],[30,'30K'],[km,'Finish']].filter(([k])=>k<=km+.01).filter((x,i,a)=>x[0]<km-.5||i===a.length-1);
 return {per,rows:marks.map(([k,l])=>({label:l,at:clock(per*k)}))};
}

const WEEK=[
 [7,'Taper starts','Cut volume by a third. Keep one short session with race-pace kilometres.'],
 [5,'Sharpen','A few kilometres at race pace, then nothing hard after today.'],
 [3,'Easy and short','30 minutes easy with 4 strides. Start sleeping well now; the night before matters less.'],
 [2,'Carb load','8–10 g of carbs per kg today and tomorrow. Plenty of water, less fibre.'],
 [1,'Shakeout','15 minutes easy with 4 strides. Lay out kit, pin your bib, charge your watch.'],
];

export function RaceDay({goal,days,wx,nav}){
 const [now,setNow]=useState(()=>new Date());
 useEffect(()=>{if(days!==0)return;const t=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(t);},[days]);
 const band=paceBand(goal),[h,m]=(goal.time||'09:00').split(':').map(Number),gun=new Date(goal.date+'T12:00:00');gun.setHours(h||9,m||0,0,0);
 const left=(gun-now)/1000;
 const morning=[[-180,'Breakfast','2–3 g of carbs per kg, nothing new.'],[-60,'Arrive','Toilet, bag drop, find your pen.'],[-30,'Warm up','8 minutes jog, 4 strides.'],[-15,'Gel and water','A gel and a few sips.'],[0,'Gun','Start at goal pace, not faster.']].map(([mins,title,sub])=>({at:new Date(gun.getTime()+mins*60000),title,sub}));
 const nowIdx=morning.findIndex(x=>x.at>now);
 const weekTip=WEEK.find(([d])=>d===days)||WEEK.find(([d])=>d<days)||WEEK[WEEK.length-1];
 return <section className="poster race-day" aria-label={`${goal.name}, ${days?`${days} days to go`:'race day'}`}>
  <div className="poster-meta"><span>{days?'Race week':'Race day'}</span><span>{goal.distance?`${goal.distance} km`:'Race'}</span><span>{goal.target||'Your race'}</span></div>
  <div className="rd-top">
   <span className="label">{goal.name}{days?'':` · gun ${hhmm(gun)}`}</span>
   <h2 className="rd-head">{days?<>{goal.name.split(' ')[0]}, <em>{days===1?'tomorrow.':`in ${days} days.`}</em></>:<>{goal.name.split(' ')[0]}, <em>today.</em></>}</h2>
   <b className={`rd-count${days?'':' is-clock'}`}>{days?days:left>0?clock(left):'Go'}</b>
   {days>0&&<small className="rd-unit">{days===1?'day to go':'days to go'}</small>}
  </div>
  {days>0?<div className="rd-tip"><span className="label">Today · {weekTip[1]}</span><p>{weekTip[2]}</p></div>
  :<ol className="rd-morning">{morning.map((x,i)=><li key={x.title} className={i<nowIdx||nowIdx<0?'is-done':i===nowIdx?'is-now':''}><time>{hhmm(x.at)}</time><span><b>{x.title}</b><small>{x.sub}</small></span><em>{i===nowIdx?'next':i<nowIdx||nowIdx<0?'done':''}</em></li>)}</ol>}
  {wx&&!days&&<p className="rd-wx">Now {Math.round(wx.temp)}°, feels {Math.round(wx.feels)}° · {wx.word}</p>}
  {band&&<button className="rd-band" onClick={()=>nav('performance')}><span className="label">Pace band · even · {clock(band.per)} /km</span><span className="rd-band-rows">{band.rows.map(r=><span key={r.label}><b>{r.at}</b><small>{r.label}</small></span>)}</span></button>}
 </section>;
}
