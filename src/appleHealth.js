// APEX · Apple Health (iPhone app only). One connection gives both runs (workouts from an Apple Watch,
// or anything else that writes to Health) and recovery (sleep, HRV, resting heart rate).
// Workouts become Strava-shaped activities; sleep and recovery become WHOOP-shaped records,
// with an estimated score, the same as Google Health.
import {HAS_HEALTH} from './native';
import {estimateRecovery} from './recoverySources';

const FLAG='apple_health_connected';
const READ=['workouts','heartRate','restingHeartRate','heartRateVariability','sleep','distance'];
const get=k=>{try{return localStorage.getItem(k);}catch{return null;}};
const set=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,String(v));}catch{}};

// The plugin loads only inside the app, so the website never ships it. The module is passed around,
// never the plugin itself: a plugin object looks like a promise, so awaiting it hangs.
let plugin=null;
const mod=()=>plugin||(plugin=import('@capgo/capacitor-health'));

export const isHealthConnected=()=>HAS_HEALTH&&get(FLAG)==='1';
// iPhone asks once; a "no" can only be changed in the Settings app, so Apex can't tell yes from no.
export async function connectHealth(){
 const h=(await mod()).Health;
 const {available}=await h.isAvailable();
 if(!available)throw new Error('Apple Health isn’t available on this device.');
 await h.requestAuthorization({read:READ});
 set(FLAG,'1');
 window.dispatchEvent(new Event('apex-sources-changed'));
}
export function disconnectHealth(){set(FLAG,null);set(CACHE,null);window.dispatchEvent(new Event('apex-sources-changed'));}

// ── Runs ──
const TYPES={running:'Run',runningTreadmill:'Run',trackAndField:'Run',wheelchairRunPace:'Run',walking:'Walk',wheelchairWalkPace:'Walk',hiking:'Hike',snowshoeing:'Hike',
 cycling:'Ride',bikingStationary:'Ride',handCycling:'Ride',swimming:'Swim',swimmingPool:'Swim',swimmingOpenWater:'Swim',rowing:'Rowing',rowingMachine:'Rowing',
 functionalStrengthTraining:'WeightTraining',traditionalStrengthTraining:'WeightTraining',strengthTraining:'WeightTraining',weightlifting:'WeightTraining',coreTraining:'WeightTraining',
 yoga:'Yoga',pilates:'Pilates',highIntensityIntervalTraining:'HighIntensityIntervalTraining',crossTraining:'Crossfit',elliptical:'Elliptical',stairClimbing:'StairStepper',stairs:'StairStepper',
 crossCountrySkiing:'NordicSki',downhillSkiing:'AlpineSki',snowboarding:'Snowboard',tennis:'Tennis',soccer:'Soccer',golf:'Golf'};
const NAMES={Run:'Run',Walk:'Walk',Hike:'Hike',Ride:'Ride',Swim:'Swim',Rowing:'Row',WeightTraining:'Strength',Yoga:'Yoga',Pilates:'Pilates'};
const partOfDay=d=>{const h=d.getHours();return h<12?'Morning':h<17?'Afternoon':h<21?'Evening':'Night';};
const localIso=d=>new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().replace(/\.\d+Z$/,'Z');

export function fromHealth(w){
 const start=new Date(w.startDate),type=TYPES[w.workoutType]||'Workout',dist=w.totalDistance||0,sec=Math.round(w.duration||0);
 const laps=(w.workoutEvents||[]).filter(e=>e.distanceMeters>0&&e.durationSeconds>0).map(e=>({distance:e.distanceMeters,moving_time:Math.round(e.durationSeconds),elapsed_time:Math.round(e.durationSeconds),average_speed:e.distanceMeters/e.durationSeconds}));
 return {id:`health-${w.platformId||w.startDate}`,source:'health',name:`${partOfDay(start)} ${NAMES[type]||'Workout'}`,type,sport_type:type,trainer:w.workoutType==='runningTreadmill',
  start_date:start.toISOString(),start_date_local:localIso(start),distance:dist,moving_time:sec,elapsed_time:Math.round((new Date(w.endDate)-start)/1000)||sec,
  average_speed:dist&&sec?dist/sec:0,average_heartrate:null,max_heartrate:null,total_elevation_gain:0,calories:w.totalEnergyBurned?Math.round(w.totalEnergyBurned):null,
  device_name:w.sourceName||null,...(laps.length>1?{splits_metric:laps}:{})};
}

// Heart rate isn't on the workout itself: it's averaged from the watch's readings during it.
async function heartRate(h,a){
 const end=new Date(new Date(a.start_date).getTime()+a.elapsed_time*1000).toISOString();
 const {samples}=await h.readSamples({dataType:'heartRate',startDate:a.start_date,endDate:end,limit:5000});
 const v=(samples||[]).map(s=>s.value).filter(x=>x>30&&x<240);
 return v.length?{average_heartrate:Math.round(v.reduce((x,y)=>x+y,0)/v.length*10)/10,max_heartrate:Math.max(...v)}:{average_heartrate:0};
}

const CACHE='apex-runs-health-v1',HR_RUNS=80,DAY=86400000;
// A year of workouts (cached copy first), then heart rate for the most recent ones, newest first.
export async function healthHistory(onUpdate){
 let cached=null;try{cached=JSON.parse(get(CACHE));}catch{}
 const map=new Map((cached?.items||[]).map(a=>[a.id,a]));
 const emit=()=>{const list=[...map.values()].sort((a,b)=>new Date(b.start_date)-new Date(a.start_date));onUpdate?.(list);return list;};
 if(map.size)emit();
 const h=(await mod()).Health;
 const from=cached?.complete?Math.max(...[...map.values()].map(a=>new Date(a.start_date).getTime()))-3*DAY:Date.now()-365*DAY;
 const {workouts}=await h.queryWorkouts({startDate:new Date(from).toISOString(),endDate:new Date().toISOString(),limit:5000,ascending:false});
 for(const w of workouts||[]){const a=fromHealth(w);const old=map.get(a.id);map.set(a.id,old?{...a,average_heartrate:old.average_heartrate,max_heartrate:old.max_heartrate}:a);}
 let list=emit();
 const missing=list.slice(0,HR_RUNS).filter(a=>a.average_heartrate==null);
 for(let i=0;i<missing.length;i++){
  const a=missing[i];try{map.set(a.id,{...a,...await heartRate(h,a)});}catch{}
  if(i%10===9||i===missing.length-1)list=emit();
 }
 set(CACHE,JSON.stringify({complete:true,syncedAt:Date.now(),items:list}));
 return list;
}

// ── Sleep and recovery ──
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const iso=ms=>new Date(ms).toISOString();
// Health stores sleep as many short stage samples, sometimes from both the phone and the watch.
// A night is every sample from one source ending that morning (gaps under 2 hours join up);
// the source with the most sleep that night wins.
function nights(samples){
 const bySource={};
 for(const s of samples){const k=s.sourceId||s.sourceName||'?';(bySource[k]||(bySource[k]=[])).push({...s,st:new Date(s.startDate).getTime(),en:new Date(s.endDate).getTime()});}
 const best={};
 for(const list of Object.values(bySource)){
  list.sort((a,b)=>a.st-b.st);
  const groups=[];for(const s of list){const g=groups[groups.length-1];if(g&&s.st-g.en<2*3600000){g.items.push(s);g.en=Math.max(g.en,s.en);}else groups.push({st:s.st,en:s.en,items:[s]});}
  for(const g of groups){
   const m={inBed:0,awake:0,light:0,rem:0,deep:0,asleep:0};g.items.forEach(s=>{m[s.sleepState||'asleep']=(m[s.sleepState||'asleep']||0)+(s.en-s.st)/60000;});
   const asleep=m.light+m.rem+m.deep+m.asleep;if(asleep<180)continue;// naps and stray samples
   const day=ymd(new Date(g.en));if(!best[day]||asleep>best[day].asleep)best[day]={day,st:g.st,en:g.en,asleep,m};
  }
 }
 return Object.values(best);
}
const msOf=m=>m==null?null:Math.round(m*60000);
export async function healthRecovery(){
 const h=(await mod()).Health,end=new Date().toISOString(),from=d=>new Date(Date.now()-d*DAY).toISOString();
 const [sleep,hrv,rhr]=await Promise.all([
  h.readSamples({dataType:'sleep',startDate:from(32),endDate:end,limit:20000}),
  h.readSamples({dataType:'heartRateVariability',startDate:from(45),endDate:end,limit:5000}),
  h.readSamples({dataType:'restingHeartRate',startDate:from(45),endDate:end,limit:500})]);
 const byDay={},day=k=>byDay[k]||(byDay[k]={day:k});
 // HRV: the average of the day's readings (Apple Watch takes several, mostly overnight).
 const hv={};(hrv.samples||[]).forEach(s=>{const k=ymd(new Date(s.startDate));(hv[k]||(hv[k]=[])).push(s.value);});
 Object.entries(hv).forEach(([k,v])=>{day(k).hrv=v.reduce((x,y)=>x+y,0)/v.length;});
 (rhr.samples||[]).forEach(s=>{day(ymd(new Date(s.startDate))).rhr=s.value;});
 const sleeps=nights(sleep.samples||[]).map(n=>{const inBed=(n.en-n.st)/60000;const rec={id:`health-sleep-${n.day}`,start:iso(n.st),end:iso(n.en),score:{
  stage_summary:{total_in_bed_time_milli:msOf(inBed),total_awake_time_milli:msOf(n.m.awake),total_light_sleep_time_milli:msOf(n.m.light+n.m.asleep),total_rem_sleep_time_milli:msOf(n.m.rem),total_slow_wave_sleep_time_milli:msOf(n.m.deep)},
  sleep_performance_percentage:Math.min(100,Math.round(n.asleep/480*100)),sleep_efficiency_percentage:Math.round(Math.min(1,n.asleep/inBed)*100)}};
  day(n.day).sleep=rec;day(n.day).asleep=n.asleep;return rec;});
 const days=Object.values(byDay).sort((a,b)=>a.day.localeCompare(b.day));
 const recs=days.filter(d=>Number.isFinite(d.hrv)||Number.isFinite(d.rhr)).map(d=>({id:`health-${d.day}`,created_at:d.sleep?.end||`${d.day}T07:00:00`,sleep_id:d.sleep?.id,estimated:true,
  score:{recovery_score:estimateRecovery(d.day,d.hrv,d.rhr,d.asleep,days),hrv_rmssd_milli:Number.isFinite(d.hrv)?Math.round(d.hrv*10)/10:null,resting_heart_rate:Number.isFinite(d.rhr)?Math.round(d.rhr):null}}));
 const desc=(a,b)=>new Date(b.created_at||b.end)-new Date(a.created_at||a.end);
 return {source:'health',estimated:true,recoveries:{records:recs.sort(desc)},sleeps:{records:sleeps.sort(desc)},workouts:{records:[]},cycles:{records:[]}};
}
