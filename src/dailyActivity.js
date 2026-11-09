// APEX · Daily activity: steps, active calories, heart rate through the day, exercise minutes and strain.
// Whichever source has it, best first: Apple Health (iPhone app), then Oura, then WHOOP (no steps, but strain).
// Every source becomes the same shape:
//   {source, days:[{day, steps, activeKcal, distanceM, avgHr, minHr, maxHr, restingHr, exerciseMin, strain}] newest first,
//    hours:[{h, steps, avgHr, minHr, maxHr}] for today (Apple Health and Oura only)}
import {isHealthConnected,healthModule} from './appleHealth';
import {isSourceConnected,pullHealthData} from './recoverySources';

const DAY=86400000;
export const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const midnight=(n=0)=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-n);return d;};
const num=v=>Number.isFinite(v)?v:null;
const newestFirst=days=>Object.values(days).sort((a,b)=>b.day.localeCompare(a.day));

export const dailySource=whoop=>isHealthConnected()?'health':isSourceConnected('oura')?'oura':whoop?.source==='whoop'||isSourceConnected('whoop')?'whoop':null;
export const DAILY_NAMES={health:'Apple Health',oura:'Oura',whoop:'WHOOP'};

// ── Apple Health ── statistics per day (14) and per hour (today), straight from the phone.
async function health(){
 const h=(await healthModule()).Health,end=new Date().toISOString(),from=midnight(13).toISOString(),today=midnight(0).toISOString();
 await h.requestAuthorization({read:['steps','calories','distance','heartRate','restingHeartRate','exerciseTime']}).catch(()=>{});// asks only for types not asked before
 const agg=(dataType,bucket,aggregation,start)=>h.queryAggregated({dataType,bucket,aggregation,startDate:start,endDate:end}).then(r=>r.samples||[]).catch(()=>[]);
 const [steps,kcal,dist,hr,rhr,hSteps,hHr,ex]=await Promise.all([
  agg('steps','day','sum',from),agg('calories','day','sum',from),agg('distance','day','sum',from),
  agg('heartRate','day',['average','min','max'],from),agg('restingHeartRate','day','average',from),
  agg('steps','hour','sum',today),agg('heartRate','hour',['average','min','max'],today),
  h.readSamples({dataType:'exerciseTime',startDate:midnight(6).toISOString(),endDate:end,limit:20000}).then(r=>r.samples||[]).catch(()=>[])]);
 const days={},day=s=>{const k=ymd(new Date(s.startDate));return days[k]||(days[k]={day:k});};
 steps.forEach(s=>{day(s).steps=Math.round(s.value);});
 kcal.forEach(s=>{day(s).activeKcal=Math.round(s.value);});
 dist.forEach(s=>{day(s).distanceM=Math.round(s.value);});
 hr.forEach(s=>{const d=day(s),v=s.values||{};d.avgHr=num(Math.round(v.average??s.value));d.minHr=num(Math.round(v.min));d.maxHr=num(Math.round(v.max));});
 rhr.forEach(s=>{day(s).restingHr=Math.round(s.value);});
 ex.forEach(s=>{const d=day(s);d.exerciseMin=Math.round((d.exerciseMin||0)+s.value);});
 const hours=Array.from({length:24},(_,i)=>({h:i}));
 hSteps.forEach(s=>{hours[new Date(s.startDate).getHours()].steps=Math.round(s.value);});
 hHr.forEach(s=>{const x=hours[new Date(s.startDate).getHours()],v=s.values||{};x.avgHr=num(Math.round(v.average??s.value));x.minHr=num(Math.round(v.min));x.maxHr=num(Math.round(v.max));});
 return {source:'health',days:newestFirst(days),hours};
}

// ── Oura ── daily activity, plus today's heart rate readings bucketed by hour.
async function oura(){
 const q=`start_date=${ymd(midnight(13))}&end_date=${ymd(new Date(Date.now()+DAY))}`;
 const [act,hr]=await Promise.all([pullHealthData('oura',`daily_activity?${q}`),
  pullHealthData('oura',`heartrate?start_datetime=${midnight(0).toISOString()}&end_datetime=${new Date().toISOString()}`).catch(()=>({data:[]}))]);
 const days={};
 (act.data||[]).forEach(a=>{days[a.day]={day:a.day,steps:a.steps??null,activeKcal:a.active_calories??null,distanceM:a.equivalent_walking_distance??null,exerciseMin:Math.round(((a.high_activity_time||0)+(a.medium_activity_time||0))/60)};});
 const hours=Array.from({length:24},(_,i)=>({h:i,v:[]}));
 (hr.data||[]).forEach(r=>{if(r.bpm)hours[new Date(r.timestamp).getHours()].v.push(r.bpm);});
 const all=hours.flatMap(x=>x.v),today=ymd(new Date());
 if(all.length&&days[today])Object.assign(days[today],{avgHr:Math.round(all.reduce((a,b)=>a+b,0)/all.length),minHr:Math.min(...all),maxHr:Math.max(...all)});
 return {source:'oura',days:newestFirst(days),hours:hours.map(({h,v})=>v.length?{h,avgHr:Math.round(v.reduce((a,b)=>a+b,0)/v.length),minHr:Math.min(...v),maxHr:Math.max(...v)}:{h})};
}

// ── WHOOP ── one cycle a day: strain, calories and heart rate (WHOOP doesn't share steps).
export function fromWhoopCycles(whoop){
 const recs=whoop?.recoveries?.records||[],rhrOf=c=>recs.find(r=>r.cycle_id===c.id)?.score?.resting_heart_rate;
 const days={};
 (whoop?.cycles?.records||[]).forEach(c=>{const s=c.score||{},k=ymd(new Date(c.start));if(days[k])return;
  days[k]={day:k,strain:num(s.strain),activeKcal:s.kilojoule?Math.round(s.kilojoule/4.184):null,avgHr:num(s.average_heart_rate),maxHr:num(s.max_heart_rate),restingHr:num(rhrOf(c))};});
 return {source:'whoop',days:newestFirst(days),hours:[]};
}

export async function loadDaily(whoop){
 const k=dailySource(whoop);
 if(k==='health')return health();
 if(k==='oura')return oura();
 if(k==='whoop')return fromWhoopCycles(whoop);
 return null;
}

// Sample data for the design preview.
export function sampleDaily(){
 const now=new Date(),days=Array.from({length:14},(_,i)=>{const s=[11240,8420,13905,6210,9875,15320,7790,10460,12010,5930,9020,14100,8800,10230][i];
  return {day:ymd(midnight(i)),steps:i?s:Math.round(s*Math.min(1,(now.getHours()+1)/20)),activeKcal:Math.round(s*.052),distanceM:Math.round(s*.78),avgHr:[72,68,75,66,70,78,67,71,73,64,69,76,68,70][i],minHr:48+i%4,maxHr:[168,121,174,118,152,181,126,160,165,112,140,177,130,150][i],restingHr:[51,52,50,53,51,49,52,51,50,54,52,49,51,50][i],exerciseMin:[48,12,71,8,35,92,15,40,55,6,30,84,20,38][i]};});
 const hours=Array.from({length:24},(_,h)=>h>now.getHours()?{h}:{h,steps:h<6?0:[0,0,0,0,0,0,420,1310,680,240,390,520,880,610,300,260,450,1720,2380,640,380,210,90,20][h],avgHr:h<6?52+h%3:[0,0,0,0,0,0,64,88,74,70,69,72,80,73,70,68,71,128,141,84,76,70,64,58][h],minHr:h<6?48:60,maxHr:h<6?58:[0,0,0,0,0,0,78,121,95,84,82,90,104,92,85,80,88,162,171,110,92,84,76,66][h]});
 return {source:'health',days,hours};
}
