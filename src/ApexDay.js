// APEX · Your day, one lap. The morning reading, the check-in, the best hour to
// run (from the hourly forecast), refuelling and bedtime, on one rail with a
// marker for where you are now.
import {Icon} from './ApexUI';
import {bestHour} from './ApexToday';

const hhmm=(h,m=0)=>`${String(((h%24)+24)%24).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
const NAME={Easy:'easy run','Long Run':'long run',Tempo:'tempo',Interval:'intervals',Recovery:'recovery run',Race:'race',Gym:'strength session'};

export function dayStops({now=new Date(),score,asleep,hrvDelta,sleepEnd,journal,session,tomorrow,todayRun,wx,usual=7,fmt}){
 const mins=now.getHours()*60+now.getMinutes(),stops=[];
 const wake=sleepEnd?new Date(sleepEnd):null,wakeMin=wake?wake.getHours()*60+wake.getMinutes():6*60+45;
 stops.push({key:'wake',at:wake?hhmm(wake.getHours(),wake.getMinutes()):'Morning',min:wakeMin,title:score!=null?`Recovery ${score}`:'Morning',sub:[asleep&&`Slept ${fmt.hm(asleep)}`,hrvDelta!=null&&`HRV ${hrvDelta>=0?'+':''}${hrvDelta}%`].filter(Boolean).join(' · ')||'Connect WHOOP to read your night',done:true});
 const j=journal,sore=j?.body?Object.entries(j.body).filter(([,v])=>v>0).length:0;
 stops.push({key:'checkin',at:j?'Done':'Now',min:wakeMin+10,title:j?'Checked in':'Check in',sub:j?[j.energy&&`Energy ${j.energy}/5`,sore?`${sore} sore spot${sore>1?'s':''}`:'Nothing sore'].filter(Boolean).join(' · '):'Twenty seconds: energy and anything sore.',done:!!j,action:j?null:'checkin'});
 const running=session&&!['Rest','Gym'].includes(session.type);
 if(todayRun){
  const t=new Date(todayRun.start_date_local||todayRun.start_date),h=todayRun.start_date_local?t.getUTCHours():t.getHours(),m=todayRun.start_date_local?t.getUTCMinutes():t.getMinutes();
  stops.push({key:'run',at:hhmm(h,m),min:h*60+m,title:`${fmt.km(todayRun.distance)} done`,sub:todayRun.name,done:true,go:['activity',todayRun.id]});
  stops.push({key:'fuel',at:hhmm(h+1,m),min:(h+1)*60+m,title:'Refuel',sub:'30–40 g protein and some carbs within the hour.',done:mins>(h+1)*60+m});
 }else if(running||session?.type==='Gym'){
  const best=running?bestHour(wx,usual):null,h=best?best.h:session?.type==='Gym'?17:usual;
  const kmTxt=parseFloat(session.dist)?`${parseFloat(session.dist)} km `:'';
  stops.push({key:'run',at:hhmm(h),min:h*60,title:session.type==='Gym'?'Strength':`${kmTxt}${NAME[session.type]||session.type.toLowerCase()}`,best,hours:running?wx?.hours:null,sub:best?`Best hour: feels ${Math.round(best.feels)}°, ${best.rain<20?'dry':`${best.rain}% rain`}${best.wind>20?`, ${Math.round(best.wind)} km/h wind`:''}.`:session.type==='Gym'?'Leave a rep in the tank.':'Forecast loads when you’re online.',done:false,go:['plan']});
  stops.push({key:'fuel',at:hhmm(h+1),min:(h+1)*60,title:'Refuel',sub:'30–40 g protein and some carbs within the hour.',done:false});
 }
 const hard=tomorrow&&['Interval','Tempo','Long Run','Race'].includes(tomorrow.type);
 const bedMin=wakeMin+24*60-(hard?8.75:8.25)*60,bh=Math.floor(bedMin/60)%24,bm=Math.round(bedMin%60/15)*15%60;
 stops.push({key:'bed',at:hhmm(bh,bm),min:Math.floor(bedMin/60)*60+bm,title:`In bed by ${hhmm(bh,bm)}`,sub:tomorrow&&tomorrow.type!=='Rest'?`${hard?'Eight and a half hours before':'Before'} tomorrow’s ${NAME[tomorrow.type]||tomorrow.type.toLowerCase()}.`:'A full night is the cheapest training there is.',done:false});
 stops.forEach(s=>{if(!s.done&&s.key!=='checkin'&&mins>=s.min+60)s.done=true;});
 const nowIdx=stops.findIndex(s=>!s.done);
 return stops.map((s,i)=>({...s,now:i===nowIdx}));
}

export function DayLap({stops,onAction,nav}){
 const done=stops.filter(s=>s.done).length,progress=stops.length>1?Math.min(1,(done-.5)/(stops.length-1)):0;
 return <section className="day-lap" aria-labelledby="day-title">
  <div className="section-head"><h2 id="day-title">Your day, <em>one lap.</em></h2></div>
  <ol className="dl-rail" style={{'--p':Math.max(0,progress)}}>
   {stops.map(s=><li key={s.key} className={`dl-stop${s.done?' is-done':''}${s.now?' is-now':''}`}>
    <time>{s.at}</time>
    {s.hours?.length?<button className="dl-run" onClick={()=>s.go&&nav(...s.go)}>
     <span className="label">Run window{s.best?` · best ${s.at}`:''}</span>
     <b>{s.title}</b>
     <span className="dl-hours" aria-hidden="true">{s.hours.filter(x=>x.h>=6&&x.h<=20).map(x=><i key={x.h} className={`${x.h===s.best?.h?'best':''}${x.rain>=40?' wet':''}${x.h<new Date().getHours()?' past':''}`} style={{height:`${18+Math.min(100,x.rain)*.82}%`}}/>)}</span>
     <span className="dl-scale" aria-hidden="true">{s.hours.filter(x=>x.h>=6&&x.h<=20).map(x=><span key={x.h}>{x.h%4===2?String(x.h).padStart(2,'0'):''}</span>)}</span>
     <span className="dl-key" aria-hidden="true">Bar height is chance of rain</span>
     <small>{s.sub}</small>
    </button>:<button className="dl-copy" onClick={()=>s.action?onAction(s.action):s.go?nav(...s.go):null} disabled={!s.action&&!s.go}>
     <b>{s.title}</b><small>{s.sub}</small>{s.action&&<Icon name="arrow" size={15}/>}
    </button>}
   </li>)}
  </ol>
 </section>;
}
