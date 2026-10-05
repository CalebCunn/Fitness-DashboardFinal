import {Icon} from './ApexUI';
import Goals from './ApexGoals';
import {PersonalSettings} from './ApexJournal';
import {useState} from 'react';
import {refreshToolCatalog,corosRegion,corosSession} from './coros';
import {PREVIEW} from './ApexPreview';
export default function Profile({athlete,acts=[],whoopOk,whoop,connectWhoop,corosOk=false,connectCoros,onDisconnectCoros,corosError,darkMode,setDarkMode,onDisconnect,onDisconnectWhoop,userPrefs,onSavePrefs,racesOnly=false}){
 const races=userPrefs?.races||[],completed=races.filter(r=>r.done).length;
 return <div className="profile-page">{!racesOnly&&<><section className="profile-identity"><div className="profile-monogram">{athlete?.firstname?.[0]||'A'}</div><div><span className="eyebrow">APEX athlete</span><h2>{athlete?.firstname?[athlete.firstname,athlete.lastname].filter(Boolean).join(' '):'Your space'}</h2><p>Runner, 5 km to the marathon.</p></div><div className="identity-stat"><strong>{acts.length}</strong><span>activities loaded</span></div></section><div className="profile-columns"><section className="connections-panel"><h2>Connections</h2>{[{name:'Strava',sub:'Running and activities',icon:'activity',connected:true,action:onDisconnect,label:'Disconnect'},{name:'WHOOP',sub:whoop?.recoveries?.records?.length?'Sleep, recovery and strain':'Sleep and recovery',icon:'recovery',connected:whoopOk,action:whoopOk?onDisconnectWhoop:connectWhoop,label:whoopOk?'Disconnect':'Connect'}].map(c=><div className="connection-row" key={c.name}><span className="connection-icon"><Icon name={c.icon}/></span><div><h3>{c.name}</h3><p>{c.sub}</p><span className={c.connected?'connection-ready':''}>{c.connected?'Connected':'Not connected'}</span></div><button className="text-button" onClick={c.action}>{c.label}</button></div>)}<CorosRow corosOk={corosOk} connect={connectCoros} disconnect={onDisconnectCoros} error={corosError}/><div className="appearance-row"><div><h3>Appearance</h3><p>Light or dark. The sky stays the same.</p></div><button role="switch" aria-checked={darkMode} aria-label="Dark appearance" className={darkMode?'appearance-toggle on':'appearance-toggle'} onClick={()=>setDarkMode(!darkMode)}><i/></button></div></section><section className="ambition-card"><span className="eyebrow">Races</span><h2>Finish lines</h2><div className="race-rings" aria-hidden="true"><i/><i/><i/></div><div><strong>{completed}<small> / {races.length}</small></strong><span>races marked complete</span></div><p>Add, edit and choose your primary race below.</p></section></div></>}<>{!racesOnly&&<PersonalSettings userPrefs={userPrefs} onSavePrefs={onSavePrefs}/>}</><Goals userPrefs={userPrefs} onSavePrefs={onSavePrefs}/></div>;
}

function CorosRow({corosOk,connect,disconnect,error}){
 const [check,setCheck]=useState(null),[busy,setBusy]=useState(false);
 const session=corosSession();
 const run=async()=>{setBusy(true);setCheck(null);try{const tools=await refreshToolCatalog();const names=tools.map(t=>t.name);setCheck({ok:true,count:names.length,reads:names.filter(n=>/^(query|get|analyze)/.test(n)).length,writes:names.filter(n=>/^(create|update|schedule)/.test(n)).length});}catch(e){setCheck({ok:false,message:e.message});}setBusy(false);};
 return <div className="connection-row coros-row">
  <span className="connection-icon"><Icon name="coros"/></span>
  <div>
   <h3>COROS</h3>
   <p>{corosOk?`Official COROS MCP${corosRegion()?' · '+corosRegion()+' server':''}. Your coach can read activities, sleep, HRV and training load, and save workouts when you allow it.`:'Connect with the official COROS MCP. Sign in on COROS, then your coach can read your COROS data.'}</p>
   <span className={corosOk?'connection-ready':''}>{corosOk?`Connected${session?.connectedAt?' since '+new Date(session.connectedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short'}):''}`:'Not connected'}</span>
   {error&&<p className="form-error" role="alert">{error}</p>}
   {check&&<p className={check.ok?'form-note':'form-error'} role="status">{check.ok?`Connection working. ${check.count} COROS tools available (${check.reads} read, ${check.writes} save).`:check.message}</p>}
   {corosOk&&!PREVIEW&&<button className="text-button" disabled={busy} onClick={run}>{busy?'Checking…':'Check connection'}</button>}
  </div>
  <button className="text-button" onClick={corosOk?disconnect:connect}>{corosOk?'Disconnect':'Connect'}</button>
 </div>;
}
