// Compatibility adapter for the existing single-user tables. No schema migration.
const URL=process.env.REACT_APP_SUPABASE_URL,KEY=process.env.REACT_APP_SUPABASE_KEY;
const headers={'Content-Type':'application/json',apikey:KEY,Authorization:`Bearer ${KEY}`};
const prefix='apex-v2:caleb:',queues={};
let status={state:'idle',message:''};
export const getSaveStatus=()=>status;
function report(state,message){status={state,message};window.dispatchEvent(new Event('apex-save-status'));}
function read(table){try{return JSON.parse(localStorage.getItem(prefix+table));}catch{return null;}}
function write(table,value){try{localStorage.setItem(prefix+table,JSON.stringify(value));return true;}catch{return false;}}
async function request(table,options){if(!URL||!KEY)throw new Error('Cloud connection is not configured.');const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{const response=await fetch(`${URL}/rest/v1/${table}?user_id=eq.caleb`,{headers,...options,signal:controller.signal});if(!response.ok)throw new Error('Cloud save unavailable.');return await response.json();}finally{clearTimeout(timer);}}
async function get(table){const local=read(table);if(local?.pending){report('pending','Changes saved on this device. Cloud sync needs retry.');return local.body;}try{const rows=await request(table);const body=rows?.[0]||null;if(body)write(table,{body,pending:false});return body;}catch{report('pending',local?'Showing data saved on this device. Cloud sync unavailable.':'Cloud data could not load. Check your connection before making changes.');if(!local)throw new Error('Cloud data could not load.');return local.body;}}
async function flush(table){const local=read(table);if(!local?.pending)return;report('saving','Saving changes…');try{const rows=await request(table,{method:'PATCH',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify({...local.body,updated_at:new Date().toISOString()})});if(!Array.isArray(rows)||rows.length!==1)throw new Error('No writable row.');const current=read(table);if(current?.revision===local.revision)write(table,{...current,pending:false});const pending=['user_prefs','training_plan','chat_history'].some(t=>read(t)?.pending);report(pending?'pending':'saved',pending?'Some changes still need cloud sync.':'Saved to cloud');}catch{report('pending','Saved on this device. Cloud sync failed — retry when connected.');}}
function patch(table,body){const value={body,pending:true,revision:Date.now()+Math.random()};if(!write(table,value)){report('error','This device could not save your changes. Free some browser storage and try again.');return Promise.resolve(false);}queues[table]=(queues[table]||Promise.resolve()).then(()=>flush(table));return queues[table];}
export function retryPendingSaves(){return Promise.all(['user_prefs','training_plan','chat_history'].map(table=>{queues[table]=(queues[table]||Promise.resolve()).then(()=>flush(table));return queues[table];}));}
export const loadChatHistory=async()=>(await get('chat_history'))?.messages||[];
export const saveChatHistory=messages=>patch('chat_history',{messages:messages.slice(-50)});
export const loadTrainingPlan=async()=>(await get('training_plan'))?.plan||null;
export const saveTrainingPlan=plan=>patch('training_plan',{plan});
export const loadUserPrefs=async()=>(await get('user_prefs'))?.prefs||null;
export const saveUserPrefs=prefs=>patch('user_prefs',{prefs});
