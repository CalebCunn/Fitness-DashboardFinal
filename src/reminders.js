// APEX · reminders (iPhone app only). Scheduled on the phone itself, so no server is involved:
// a morning note with the day's planned session for the next week, and a countdown to the next race.
// Rescheduled every time the app opens or the plan, races or reminder settings change.
import {HAS_REMINDERS} from './native';
import {datedSessions} from './ApexTraining';
import {focusRace,raceDate} from './ApexGoals';
import {localDate,addDays} from './apexDates';

const KEY='apex-reminders',ASKED='apex-reminders-asked';
export const REMINDER_DEFAULTS={session:true,time:'07:00',race:true};
export function readReminders(){try{return {...REMINDER_DEFAULTS,...JSON.parse(localStorage.getItem(KEY)||'{}')};}catch{return REMINDER_DEFAULTS;}}
export function saveReminders(r){try{localStorage.setItem(KEY,JSON.stringify(r));}catch{}window.dispatchEvent(new Event('apex-reminders-changed'));}

let plugin=null;
// Loads the module, not the plugin: a plugin object looks like a promise, so awaiting it hangs.
const mod=()=>plugin||(plugin=import('@capacitor/local-notifications'));
const notes=async()=>({n:(await mod()).LocalNotifications});

export async function permission(){if(!HAS_REMINDERS)return 'denied';return (await (await notes()).n.checkPermissions()).display;}
export async function askPermission(){
 try{localStorage.setItem(ASKED,'1');}catch{}
 return (await (await notes()).n.requestPermissions()).display;
}
const asked=()=>{try{return localStorage.getItem(ASKED)==='1';}catch{return true;}};

const at=(day,hhmm)=>{const [h,m]=hhmm.split(':').map(Number);const d=new Date(day+'T00:00:00');d.setHours(h||0,m||0,0,0);return d;};
const distText=(s,mi)=>{const k=parseFloat(s.dist)||0;return k?`${mi?(k/1.609344).toFixed(1).replace(/\.0$/,''):k} ${mi?'mi':'km'} `:'';};
const BASE=7000;// our notification ids: 7000–7099

function build({plan,races,miles,r}){
 const out=[],now=Date.now(),today=localDate(new Date());
 if(r.session){
  const sessions=datedSessions(plan);
  for(let i=0;i<7;i++){
   const day=addDays(today,i),s=sessions.find(x=>x.date===day);
   if(!s||!s.type||s.type==='Rest'||s.done)continue;
   const when=at(day,r.time);if(when.getTime()<=now)continue;
   const pace=s.pace&&/\d/.test(s.pace)?`Aim for ${s.pace}${miles?'/mi':'/km'}.`:'';
   out.push({id:BASE+i,title:`Today: ${distText(s,miles)}${s.type.toLowerCase()}`,body:[pace,s.notes||''].filter(Boolean).join(' ')||'Open Apex for the details.',schedule:{at:when},extra:{page:'home'}});
  }
 }
 const race=r.race&&focusRace(races);
 if(race&&raceDate(race)){
  const name=race.name||'your race';
  [[7,'18:00',`One week to ${name}`,'The hard work is done. This week is about arriving fresh.'],
   [3,'18:00',`3 days to ${name}`,'Keep the runs short and easy. Sleep is training now.'],
   [1,'18:00',`Tomorrow: ${name}`,'Lay out your kit, eat a familiar dinner and get an early night.'],
   [0,'06:30','Race day 🏁',`Trust the training. Good luck at ${name}!`]].forEach(([before,time,title,body],i)=>{
   const when=at(addDays(race.date,-before),time);if(when.getTime()>now)out.push({id:BASE+50+i,title,body,schedule:{at:when},extra:{page:'races'}});
  });
 }
 return out;
}

// Replaces Apex's pending reminders with a fresh set. Asks for permission the first time there's a plan.
export async function scheduleReminders({plan,races=[],miles=false}){
 if(!HAS_REMINDERS)return;
 try{
  const {n}=await notes(),r=readReminders();
  let p=(await n.checkPermissions()).display;
  if(p==='prompt'&&!asked()&&(plan?.sessions?.length||focusRace(races)))p=await askPermission();
  const {notifications=[]}=await n.getPending();
  const ours=notifications.filter(x=>x.id>=BASE&&x.id<BASE+100);
  if(ours.length)await n.cancel({notifications:ours.map(x=>({id:x.id}))});
  if(p!=='granted')return;
  const list=build({plan,races,miles,r});
  if(list.length)await n.schedule({notifications:list});
 }catch{}
}

// Tapping a reminder opens the page it's about.
export async function onReminderTap(go){
 if(!HAS_REMINDERS)return;
 try{(await notes()).n.addListener('localNotificationActionPerformed',e=>{const page=e?.notification?.extra?.page;if(page)go(page);});}catch{}
}
