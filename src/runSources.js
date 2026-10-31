// APEX · where runs come from. Exactly one source feeds the app at a time (Strava, COROS or WHOOP),
// so the same run is never loaded twice from two services. Within that source, copies of the same
// session (e.g. Strava holding both the COROS and the WHOOP upload) are folded into one as well.
import {isConnected as stravaConnected,getActivityHistory} from './strava';
import {isCorosConnected,callCorosTool} from './coros';
import {isWhoopConnected,getWhoopWorkoutPage} from './whoop';

export const RUN_SOURCES={strava:'Strava',coros:'COROS',whoop:'WHOOP'};
export const RUN_NOTES={strava:'Runs, routes, splits and shoes',coros:'Runs and workouts straight from your watch',whoop:'Workouts with heart rate and strain (no maps)'};
const ORDER=['strava','coros','whoop'];
export const isRunSourceConnected=k=>k==='strava'?stravaConnected():k==='coros'?isCorosConnected():k==='whoop'?isWhoopConnected():false;
export const connectedRunSources=()=>ORDER.filter(isRunSourceConnected);
export function activeRunSource(settings){const c=connectedRunSources(),pick=settings?.runSource;return c.includes(pick)?pick:c[0]||null;}

// ── Duplicates ──
// Two sessions are the same one when their times overlap for most of the shorter one.
// The richer copy stays: a map beats none, distance beats none, heart rate beats none, recorded beats manual.
const span=a=>{const s=new Date(a.start_date).getTime(),d=(a.elapsed_time||a.moving_time||0)*1000;return [s,s+Math.max(d,60000)];};
const richness=a=>(a.map?.summary_polyline?8:0)+(a.distance>0?4:0)+(a.average_heartrate?2:0)+(a.manual?0:1);
export function dedupe(list){
 const sorted=[...list].sort((a,b)=>new Date(a.start_date)-new Date(b.start_date)),out=[];
 for(const a of sorted){
  const [s,e]=span(a);
  const i=out.findIndex(b=>{const [bs,be]=span(b),overlap=Math.min(e,be)-Math.max(s,bs);return overlap>0&&overlap>=.6*Math.min(e-s,be-bs);});
  if(i<0){out.push(a);continue;}
  if(richness(a)>richness(out[i]))out[i]={...a,duplicates:[...(out[i].duplicates||[]),out[i].id]};
  else out[i]={...out[i],duplicates:[...(out[i].duplicates||[]),a.id]};
 }
 return out.sort((a,b)=>new Date(b.start_date)-new Date(a.start_date));
}

// ── Device cache (COROS and WHOOP; Strava keeps its own) ──
const cacheKey=k=>`apex-runs-${k}-v1`;
const readCache=k=>{try{return JSON.parse(localStorage.getItem(cacheKey(k)))||null;}catch{return null;}};
const writeCache=(k,v)=>{try{localStorage.setItem(cacheKey(k),JSON.stringify(v));}catch{}};
export const clearRunCache=k=>{try{localStorage.removeItem(cacheKey(k));}catch{}};

// Local wall-clock time for an ISO instant and a "+01:00" / "Z" offset, in Strava's start_date_local style.
function localIso(iso,offset){
 const m=/^([+-])(\d\d):?(\d\d)$/.exec(offset||'');const mins=m?(m[1]==='-'?-1:1)*(+m[2]*60+ +m[3]):0;
 return new Date(new Date(iso).getTime()+mins*60000).toISOString().replace(/\.\d+Z$/,'Z');
}

// ── WHOOP ──
const WHOOP_TYPES={running:'Run','track & field':'Run',cycling:'Ride','mountain biking':'Ride',spin:'Ride',walking:'Walk',hiking:'Hike',rucking:'Hike',swimming:'Swim',rowing:'Rowing',yoga:'Yoga',weightlifting:'WeightTraining',powerlifting:'WeightTraining','functional fitness':'Crossfit',hiit:'HighIntensityIntervalTraining',elliptical:'Elliptical',stairmaster:'StairStepper',pilates:'Pilates',tennis:'Tennis',soccer:'Soccer',golf:'Golf',skiing:'AlpineSki',snowboarding:'Snowboard',boxing:'Workout'};
const titleCase=s=>String(s||'Workout').replace(/\b\w/g,c=>c.toUpperCase());
export function fromWhoop(w){
 const sec=Math.max(0,Math.round((new Date(w.end)-new Date(w.start))/1000)),sc=w.score||{},name=(w.sport_name||'').toLowerCase(),type=WHOOP_TYPES[name]||'Workout',dist=sc.distance_meter||0;
 return {id:`whoop-${w.id}`,source:'whoop',name:titleCase(w.sport_name),type,sport_type:type,start_date:new Date(w.start).toISOString(),start_date_local:localIso(w.start,w.timezone_offset),
  distance:dist,moving_time:sec,elapsed_time:sec,average_speed:dist&&sec?dist/sec:0,average_heartrate:sc.average_heart_rate||null,max_heartrate:sc.max_heart_rate||null,
  total_elevation_gain:sc.altitude_gain_meter||0,strain:sc.strain??null,calories:sc.kilojoule?Math.round(sc.kilojoule/4.184):null};
}
async function whoopHistory(onUpdate){
 const cached=readCache('whoop'),map=new Map((cached?.items||[]).map(a=>[a.id,a]));
 const emit=()=>{const list=[...map.values()].sort((a,b)=>new Date(b.start_date)-new Date(a.start_date));onUpdate?.(list);return list;};
 if(map.size)emit();
 const newest=cached?.items?.length?Math.max(...cached.items.map(a=>new Date(a.start_date).getTime())):0;
 let next=null,complete=!!cached?.complete;
 for(let page=0;page<40;page++){
  const d=await getWhoopWorkoutPage(next);
  const rows=(d.records||[]).filter(w=>w.score_state!=='UNSCORABLE'&&w.start&&w.end).map(fromWhoop);
  rows.forEach(a=>map.set(a.id,a));emit();
  next=d.next_token;
  if(!next){complete=true;break;}
  if(complete&&rows.length&&Math.min(...rows.map(a=>new Date(a.start_date).getTime()))<=newest)break;
 }
 const list=emit();writeCache('whoop',{complete,syncedAt:Date.now(),items:list});return list;
}

// ── COROS (official COROS MCP: querySportRecords) ──
const COROS_TYPES={100:'Run',101:'Run',102:'TrailRun',103:'Run',104:'Hike',105:'Hike',106:'Run',200:'Ride',201:'Ride',202:'Ride',203:'Ride',204:'Ride',205:'Ride',299:'Ride',300:'Swim',301:'Swim',400:'Workout',402:'WeightTraining',500:'NordicSki',501:'AlpineSki',502:'Snowboard',503:'BackcountrySki',700:'Rowing',701:'Rowing',702:'Rowing',704:'Rowing',705:'Rowing',800:'Workout',900:'Walk',901:'Walk',10000:'Workout'};
const lower=o=>Object.fromEntries(Object.entries(o||{}).map(([k,v])=>[k.toLowerCase(),v]));
const pick=(o,...keys)=>{for(const k of keys){const v=o[k.toLowerCase()];if(v!=null&&v!=='')return v;}return null;};
// "42:10", "1:02:03", "1h 2m 3s" or a number of seconds.
function seconds(v){
 if(v==null)return 0;if(typeof v==='number')return v>200000?Math.round(v/1000):v;
 const s=String(v).trim();if(/^\d+(\.\d+)?$/.test(s))return +s;
 const c=s.split(':').map(Number);if(c.length>1&&c.every(Number.isFinite))return c.reduce((t,x)=>t*60+x,0);
 const h=/(\d+)\s*h/.exec(s),m=/(\d+)\s*m(?!s)/.exec(s),x=/(\d+)\s*s/.exec(s);return (h?+h[1]*3600:0)+(m?+m[1]*60:0)+(x?+x[1]:0);
}
function corosDate(v){
 if(v==null)return null;
 if(typeof v==='number')return new Date(v<1e11?v*1000:v);
 const s=String(v).trim();
 if(/^\d{8}$/.test(s))return new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T00:00:00Z`);
 if(/^\d{10,13}$/.test(s))return new Date(s.length===10?+s*1000:+s);
 const d=new Date(s.replace(' ','T'));return Number.isNaN(d.getTime())?null:d;
}
// The tool's records may come back as structured JSON or as JSON text; take the first list of objects found.
function corosRows(result){
 const tryJson=t=>{try{return JSON.parse(t);}catch{return null;}};
 const roots=[result?.structuredContent,...(result?.content||[]).filter(c=>c.type==='text').map(c=>tryJson(c.text))].filter(Boolean);
 const find=o=>{if(Array.isArray(o))return o.length&&typeof o[0]==='object'?o:null;if(o&&typeof o==='object')for(const v of Object.values(o)){const f=find(v);if(f)return f;}return null;};
 for(const r of roots){const f=find(r);if(f)return f;}
 return [];
}
export function fromCoros(raw){
 const o=lower(raw);
 const id=pick(o,'labelId','label_id','activityId','id');
 const start=corosDate(pick(o,'startTime','start_time','startTimestamp','startDate','date','activityDate'));
 if(!id||!start)return null;
 const code=+pick(o,'sportType','sport_type','sportTypeCode','mode')||null;
 const named=String(pick(o,'sportName','sport','sportTypeName','activityType')||'');
 const type=COROS_TYPES[code]||(/trail/i.test(named)?'TrailRun':/run/i.test(named)?'Run':/bike|cycl|ride/i.test(named)?'Ride':/walk/i.test(named)?'Walk':/swim/i.test(named)?'Swim':/strength|gym/i.test(named)?'WeightTraining':'Workout');
 let dist=+pick(o,'distanceMeters','distance_m','distanceKm','distance_km','distance')||0;
 if(o.distancekm!=null||o.distance_km!=null||(o.distance!=null&&dist<500&&!o.distancemeters))dist*=1000;// the tool reports km
 const moving=seconds(pick(o,'movingTime','duration','totalTime','workoutTime','time'));
 const elapsed=seconds(pick(o,'elapsedTime','totalElapsedTime'))||moving;
 return {id:`coros-${id}`,source:'coros',coros:{labelId:String(id),sportType:code},name:pick(o,'name','title')||named||type,type,sport_type:type,
  start_date:start.toISOString(),start_date_local:new Date(start.getTime()-start.getTimezoneOffset()*60000).toISOString().replace(/\.\d+Z$/,'Z'),distance:dist,moving_time:moving,elapsed_time:elapsed,
  average_speed:dist&&moving?dist/moving:0,average_heartrate:+pick(o,'avgHr','averageHeartRate','avgHeartRate','avg_hr')||null,max_heartrate:+pick(o,'maxHr','maxHeartRate','max_hr')||null,
  total_elevation_gain:+pick(o,'elevationGain','ascent','totalAscent','elevGain')||0,calories:+pick(o,'calories','calorie','kcal')||null};
}
const ymd=d=>d.toISOString().slice(0,10).replace(/-/g,'');
async function corosHistory(onUpdate){
 const cached=readCache('coros'),map=new Map((cached?.items||[]).map(a=>[a.id,a]));
 const emit=()=>{const list=[...map.values()].sort((a,b)=>new Date(b.start_date)-new Date(a.start_date));onUpdate?.(list);return list;};
 if(map.size)emit();
 // First sync: a year back in fortnights. After that, the last fortnight.
 const windows=cached?.complete?1:26,DAY=86400000;let end=new Date();
 for(let w=0;w<windows;w++){
  const start=new Date(end.getTime()-13*DAY);
  const {result}=await callCorosTool('querySportRecords',{startDate:ymd(start),endDate:ymd(end),limit:100});
  corosRows(result).map(fromCoros).filter(Boolean).forEach(a=>map.set(a.id,a));emit();
  end=new Date(start.getTime()-DAY);
 }
 const list=emit();writeCache('coros',{complete:true,syncedAt:Date.now(),items:list});return list;
}

// COROS laps become splits on the activity page (best effort: lap fields vary by watch).
export async function corosSplits(a){
 if(a.source!=='coros'||!a.coros?.labelId)return [];
 const {result}=await callCorosTool('queryActivityLapData',{labelId:a.coros.labelId,sportType:a.coros.sportType||100});
 return corosRows(result).map(lower).map(l=>{let d=+pick(l,'distanceMeters','distance')||0;if(d&&d<50)d*=1000;const t=seconds(pick(l,'time','duration','lapTime'));return {distance:d,moving_time:t,elapsed_time:t,average_speed:d&&t?d/t:0,average_heartrate:+pick(l,'avgHr','averageHeartRate','avgHeartRate')||null,elevation_difference:pick(l,'elevationGain','ascent')!=null?+pick(l,'elevationGain','ascent')-(+pick(l,'elevationLoss','descent')||0):null};}).filter(s=>s.distance>0&&s.moving_time>0);
}

// Loads the chosen source's history (cached copy first), with duplicates folded away.
export async function loadRuns(source,{onUpdate}={}){
 const up=list=>onUpdate?.(dedupe(list));
 const list=source==='strava'?await getActivityHistory({onUpdate:up}):source==='coros'?await corosHistory(up):source==='whoop'?await whoopHistory(up):[];
 return dedupe(list);
}
