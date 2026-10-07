// Data adapter. Owner build: the existing single-user tables (user_id 'caleb'), unchanged.
// Public build (REACT_APP_PUBLIC=true): one private row per signed-in user in apex_data,
// protected by row-level security, via the user's own session.
import {client} from './apexAuth';
const PUBLIC=process.env.REACT_APP_PUBLIC==='true';
const COLUMN={user_prefs:'prefs',training_plan:'plan',chat_history:'messages'};
let uid=null;
export const setUser=id=>{uid=id;};
const URL=process.env.REACT_APP_SUPABASE_URL,KEY=process.env.REACT_APP_SUPABASE_KEY;
const headers={'Content-Type':'application/json',apikey:KEY,Authorization:`Bearer ${KEY}`};
const prefixOf=()=>PUBLIC?`apex-v3:${uid}:`:'apex-v2:caleb:',queues={};
let status={state:'idle',message:''};
export const getSaveStatus=()=>status;
function report(state,message){status={state,message};window.dispatchEvent(new Event('apex-save-status'));}
function read(table){try{return JSON.parse(localStorage.getItem(prefixOf()+table));}catch{return null;}}
function write(table,value){try{localStorage.setItem(prefixOf()+table,JSON.stringify(value));return true;}catch{return false;}}
async function requestPublic(table,options){
 const c=await client();if(!c||!uid)throw new Error('Not signed in.');const col=COLUMN[table];
 if(!options){const {data,error}=await c.from('apex_data').select(col).eq('user_id',uid).maybeSingle();if(error)throw new Error(error.message);return data&&data[col]!=null?[{[col]:data[col]}]:[];}
 const body=JSON.parse(options.body);const {data,error}=await c.from('apex_data').upsert({user_id:uid,[col]:body[col],updated_at:new Date().toISOString()},{onConflict:'user_id'}).select(col);
 if(error)throw new Error(error.message);return data;
}
async function request(table,options){if(PUBLIC)return requestPublic(table,options);if(!URL||!KEY)throw new Error('Cloud connection is not configured in this build.');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{const response=await fetch(`${URL}/rest/v1/${table}?user_id=eq.caleb`,{headers,...options,signal:controller.signal});if(!response.ok)throw new Error(`Cloud request failed (HTTP ${response.status}).`);return await response.json();}finally{clearTimeout(timer);}}
async function get(table){const local=read(table);if(local?.pending){report('pending','Changes saved on this device. Cloud sync needs retry.');return local.body;}try{const rows=await request(table);const body=rows?.[0]||null;if(body)write(table,{body,pending:false});if(!['user_prefs','training_plan','chat_history'].some(t=>read(t)?.pending))report('idle','');return body;}catch(error){report('pending',local?'Showing data saved on this device. Cloud sync unavailable.':'Cloud data could not load. '+(error.message||'Connection unavailable.'));if(!local)throw new Error('Cloud data could not load.');return local.body;}}
async function flush(table){const local=read(table);if(!local?.pending)return;report('saving','Saving changes…');try{const rows=await request(table,{method:'PATCH',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify({...local.body,updated_at:new Date().toISOString()})});if(!Array.isArray(rows)||rows.length!==1)throw new Error('No writable row.');const current=read(table);if(current?.revision===local.revision)write(table,{...current,pending:false});const pending=['user_prefs','training_plan','chat_history'].some(t=>read(t)?.pending);report(pending?'pending':'saved',pending?'Some changes still need cloud sync.':'Saved to cloud');}catch{report('pending','Saved on this device. Cloud sync failed — retry when connected.');}}
function patch(table,body){const value={body,pending:true,revision:Date.now()+Math.random()};if(!write(table,value)){report('error','This device could not save your changes. Free some browser storage and try again.');return Promise.resolve(false);}queues[table]=(queues[table]||Promise.resolve()).then(()=>flush(table));return queues[table];}
export function retryPendingSaves(){return Promise.all(['user_prefs','training_plan','chat_history'].map(table=>{queues[table]=(queues[table]||Promise.resolve()).then(()=>flush(table));return queues[table];}));}
export const loadChatHistory=async()=>(await get('chat_history'))?.messages||[];
export const saveChatHistory=messages=>patch('chat_history',{messages:messages.slice(-50)});
export const loadTrainingPlan=async()=>(await get('training_plan'))?.plan||null;
export const saveTrainingPlan=plan=>patch('training_plan',{plan});
export const loadUserPrefs=async()=>(await get('user_prefs'))?.prefs||null;
export const saveUserPrefs=prefs=>patch('user_prefs',{prefs});
