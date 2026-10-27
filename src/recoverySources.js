// APEX · where sleep and recovery come from: WHOOP, Oura or Google Health (Fitbit, Pixel Watch).
// Every source is turned into the same shape as WHOOP's data, so Today, Recovery and the coach
// work the same whichever one a runner uses. WHOOP and Oura give their own score; Google Health
// doesn't have one, so Apex estimates it from overnight HRV, resting heart rate and sleep.
import {isWhoopConnected,disconnectWhoop,getWhoopAuthUrl,getWhoopData} from './whoop';
import {saveConnection,clearConnection,newerRefreshToken} from './apexConnections';

export const SOURCES={whoop:'WHOOP',oura:'Oura',google:'Google Health'};
export const SOURCE_NOTES={whoop:'Recovery, sleep and strain',oura:'Readiness and sleep from your ring',google:'Fitbit or Pixel Watch: sleep, HRV and resting heart rate'};
const CLIENT={oura:process.env.REACT_APP_OURA_CLIENT_ID,google:process.env.REACT_APP_GOOGLE_HEALTH_CLIENT_ID};
// A source shows up once its client ID is set on Netlify.
export const available=()=>['whoop',...['oura','google'].filter(k=>CLIENT[k])];

const get=k=>{try{return localStorage.getItem(k);}catch{return null;}};
const set=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,String(v));}catch{}};
const PENDING='recovery_pending';

export const isSourceConnected=k=>k==='whoop'?isWhoopConnected():!!get(`${k}_refresh_token`);
export const connectedSources=()=>available().filter(isSourceConnected);
// The chosen source if it's connected, otherwise the first connected one.
export function activeSource(settings){const c=connectedSources(),pick=settings?.recoverySource;return c.includes(pick)?pick:c[0]||null;}

export function connectSource(k){
 if(k==='whoop'){window.location.assign(getWhoopAuthUrl());return;}
 const state=`${k}_${Math.random().toString(36).slice(2,12)}`;set(PENDING,k);set(`${PENDING}_state`,state);
 const redirect=window.location.origin;
 const url=k==='oura'
  ?`https://cloud.ouraring.com/oauth/authorize?response_type=code&client_id=${CLIENT.oura}&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent('daily heartrate personal')}&state=${state}`
  :`https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${CLIENT.google}&redirect_uri=${encodeURIComponent(redirect)}&scope=${encodeURIComponent('https://www.googleapis.com/auth/googlehealth.sleep.readonly https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly')}&access_type=offline&prompt=consent&state=${state}`;
 window.location.assign(url);
}
export function disconnectSource(k){
 if(k==='whoop'){disconnectWhoop();return;}
 [`${k}_refresh_token`,`${k}_access_token`,`${k}_token_expiry`].forEach(x=>set(x,null));clearConnection(k);
}

async function token(params){
 const r=await fetch('/.netlify/functions/health-token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params)});
 return r.json().catch(()=>({}));
}
function store(k,d){
 set(`${k}_access_token`,d.access_token);set(`${k}_token_expiry`,Date.now()+(d.expires_in||3600)*1000);
 if(d.refresh_token)set(`${k}_refresh_token`,d.refresh_token); // Google keeps the same refresh token; Oura sends a new one each time
 saveConnection(k);
}
// Called when the page loads with ?code=… after Oura or Google sends the user back.
export const pendingSource=()=>get(PENDING);
export async function finishConnect(code,state){
 const k=get(PENDING),expected=get(`${PENDING}_state`);set(PENDING,null);set(`${PENDING}_state`,null);
 if(!k||state!==expected)throw new Error('That connection didn’t complete. Please try again.');
 const d=await token({provider:k,grant_type:'authorization_code',code,redirect_uri:window.location.origin});
 if(!d.access_token||!d.refresh_token)throw new Error(`${SOURCES[k]} could not be connected. Please try again.`);
 store(k,d);return k;
}
const refreshing={};
async function access(k,retried=false){
 const t=get(`${k}_access_token`),exp=+get(`${k}_token_expiry`)||0;
 if(t&&Date.now()<exp-60000)return t;
 if(!refreshing[k])refreshing[k]=(async()=>{
  const d=await token({provider:k,grant_type:'refresh_token',refresh_token:get(`${k}_refresh_token`)});
  if(d.access_token){store(k,d);return d.access_token;}
  // Oura refresh tokens are single use: another device may have used ours first.
  const newer=!retried&&await newerRefreshToken(k);
  if(newer){set(`${k}_refresh_token`,newer);set(`${k}_token_expiry`,0);refreshing[k]=null;return access(k,true);}
  throw new Error(`${SOURCES[k]} needs reconnecting.`);
 })().finally(()=>{refreshing[k]=null;});
 return refreshing[k];
}
async function pull(k,path){
 const r=await fetch(`/.netlify/functions/health-data?provider=${k}&path=${encodeURIComponent(path)}`,{headers:{Authorization:`Bearer ${await access(k)}`}});
 if(!r.ok)throw new Error(`${SOURCES[k]} ${r.status}`);
 return r.json();
}

const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const daysAgo=n=>{const d=new Date();d.setDate(d.getDate()-n);return d;};
const ms=s=>s==null?null:Math.round(Number(s)*1000);
const mins=m=>m==null?null:Math.round(Number(m)*60000);
const empty={workouts:{records:[]},cycles:{records:[]}};

async function oura(){
 const q=`start_date=${ymd(daysAgo(31))}&end_date=${ymd(daysAgo(-1))}`;
 const [ready,sleep,daily]=await Promise.all([pull('oura',`daily_readiness?${q}`),pull('oura',`sleep?${q}`),pull('oura',`daily_sleep?${q}`)]);
 const sleepScore=Object.fromEntries((daily.data||[]).map(d=>[d.day,d.score]));
 // The main sleep of each day (the longest), shaped like WHOOP's.
 const main={};for(const s of sleep.data||[])if(!main[s.day]||(s.total_sleep_duration||0)>(main[s.day].total_sleep_duration||0))main[s.day]=s;
 const sleeps=Object.values(main).map(s=>({id:s.id,start:s.bedtime_start,end:s.bedtime_end,score:{
  stage_summary:{total_in_bed_time_milli:ms(s.time_in_bed),total_awake_time_milli:ms(s.awake_time),total_light_sleep_time_milli:ms(s.light_sleep_duration),total_rem_sleep_time_milli:ms(s.rem_sleep_duration),total_slow_wave_sleep_time_milli:ms(s.deep_sleep_duration)},
  sleep_performance_percentage:sleepScore[s.day]??null,sleep_efficiency_percentage:s.efficiency??null,respiratory_rate:s.average_breath??null}}));
 const recs=(ready.data||[]).map(r=>{const s=main[r.day];return {id:r.id,created_at:s?.bedtime_end||`${r.day}T07:00:00`,sleep_id:s?.id,score:{recovery_score:r.score??null,hrv_rmssd_milli:s?.average_hrv??null,resting_heart_rate:s?.lowest_heart_rate??null}};});
 const desc=(a,b)=>new Date(b.created_at||b.end)-new Date(a.created_at||a.end);
 return {source:'oura',recoveries:{records:recs.sort(desc)},sleeps:{records:sleeps.sort(desc)},...empty};
}

async function googleList(type,filter,pages=2){
 let out=[],pageToken='';
 for(let i=0;i<pages;i++){const d=await pull('google',`${type}/dataPoints?pageSize=${type==='sleep'?25:100}&filter=${encodeURIComponent(filter)}${pageToken?`&pageToken=${pageToken}`:''}`);out=out.concat(d.dataPoints||[]);if(!d.nextPageToken)break;pageToken=d.nextPageToken;}
 return out;
}
const dateKey=d=>d?`${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}`:null;
const mean=a=>a.reduce((x,y)=>x+y,0)/a.length,sd=a=>{const m=mean(a);return Math.sqrt(mean(a.map(x=>(x-m)**2)));};
// Estimated recovery, 1–99: tonight's HRV and resting HR against the runner's previous 4 weeks, nudged by sleep length.
export function estimateRecovery(day,hrv,rhr,asleepMin,history){
 const prior=history.filter(h=>h.day<day).slice(-28),H=prior.map(h=>h.hrv).filter(Number.isFinite),R=prior.map(h=>h.rhr).filter(Number.isFinite);
 if(!Number.isFinite(hrv)||H.length<5)return null;
 const zh=(hrv-mean(H))/Math.max(sd(H),mean(H)*.08),zr=Number.isFinite(rhr)&&R.length>=5?(mean(R)-rhr)/Math.max(sd(R),2):0;
 const sleepAdj=Number.isFinite(asleepMin)?Math.max(-9,Math.min(6,(asleepMin-420)/30*3)):0;
 return Math.max(1,Math.min(99,Math.round(55+18*(.6*zh+.4*zr)+sleepAdj)));
}
async function google(){
 const from=ymd(daysAgo(45));
 const [sleep,hrv,rhr]=await Promise.all([
  googleList('sleep',`sleep.interval.end_time >= "${daysAgo(31).toISOString()}"`),
  googleList('daily-heart-rate-variability',`daily_heart_rate_variability.date >= "${from}"`,1),
  googleList('daily-resting-heart-rate',`daily_resting_heart_rate.date >= "${from}"`,1)]);
 const byDay={};
 const day=k=>byDay[k]||(byDay[k]={day:k});
 hrv.forEach(p=>{const v=p.dailyHeartRateVariability;const k=dateKey(v?.date);if(k)day(k).hrv=Number(v.averageHeartRateVariabilityMilliseconds);});
 rhr.forEach(p=>{const v=p.dailyRestingHeartRate;const k=dateKey(v?.date);if(k)day(k).rhr=Number(v.beatsPerMinute);});
 const sleeps=[];
 for(const p of sleep){const s=p.sleep;if(!s?.interval?.endTime||s.metadata?.nap)continue;
  const st=Object.fromEntries((s.summary?.stagesSummary||[]).map(x=>[x.type,Number(x.minutes)]));
  const asleep=Number(s.summary?.minutesAsleep),period=Number(s.summary?.minutesInSleepPeriod);
  const rec={id:p.name,start:s.interval.startTime,end:s.interval.endTime,score:{
   stage_summary:{total_in_bed_time_milli:mins(period),total_awake_time_milli:mins(s.summary?.minutesAwake),total_light_sleep_time_milli:mins(st.LIGHT),total_rem_sleep_time_milli:mins(st.REM),total_slow_wave_sleep_time_milli:mins(st.DEEP)},
   sleep_performance_percentage:Number.isFinite(asleep)?Math.min(100,Math.round(asleep/480*100)):null,sleep_efficiency_percentage:asleep&&period?Math.round(asleep/period*100):null}};
  sleeps.push(rec);const k=ymd(new Date(s.interval.endTime));if(!day(k).sleep||asleep>(day(k).asleep||0)){day(k).sleep=rec;day(k).asleep=asleep;}}
 const days=Object.values(byDay).sort((a,b)=>a.day.localeCompare(b.day));
 const recs=days.filter(d=>Number.isFinite(d.hrv)||Number.isFinite(d.rhr)).map(d=>({id:d.day,created_at:d.sleep?.end||`${d.day}T07:00:00`,sleep_id:d.sleep?.id,estimated:true,
  score:{recovery_score:estimateRecovery(d.day,d.hrv,d.rhr,d.asleep,days),hrv_rmssd_milli:Number.isFinite(d.hrv)?d.hrv:null,resting_heart_rate:Number.isFinite(d.rhr)?d.rhr:null}}));
 const desc=(a,b)=>new Date(b.created_at||b.end)-new Date(a.created_at||a.end);
 return {source:'google',estimated:true,recoveries:{records:recs.sort(desc)},sleeps:{records:sleeps.sort(desc)},...empty};
}

export async function getRecoveryData(k){
 if(k==='whoop')return {source:'whoop',...(await getWhoopData())};
 if(k==='oura')return oura();
 if(k==='google')return google();
 return null;
}
