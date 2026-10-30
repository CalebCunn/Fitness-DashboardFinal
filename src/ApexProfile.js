import {Icon} from './ApexUI';
import Goals from './ApexGoals';
import {PersonalSettings} from './ApexJournal';
import {useState} from 'react';
import {refreshToolCatalog,corosRegion,corosSession} from './coros';
import {PREVIEW} from './ApexPreview';
import {available,isSourceConnected,connectSource,disconnectSource,connectedSources,activeSource,SOURCES,SOURCE_NOTES} from './recoverySources';
export default function Profile({athlete,acts=[],whoopOk,whoop,connectWhoop,corosOk=false,connectCoros,onDisconnectCoros,onSourceChange,corosError,darkMode,setDarkMode,onDisconnect,onDisconnectWhoop,userPrefs,onSavePrefs,racesOnly=false}){
 const races=userPrefs?.races||[];
 return <div className="profile-page">{!racesOnly&&<><section className="profile-identity"><div className="profile-monogram">{athlete?.firstname?.[0]||'A'}</div><div><span className="eyebrow">APEX athlete</span><h2>{athlete?.firstname?[athlete.firstname,athlete.lastname].filter(Boolean).join(' '):'Your space'}</h2><p>{userPrefs?.profile?.focus||(races.find(r=>r.next&&!r.done)?.name?`Training for ${races.find(r=>r.next&&!r.done).name}`:'Runner')}</p></div><div className="identity-stat"><strong>{acts.length.toLocaleString('en-GB')}</strong><span>activities synced from Strava</span></div></section><div className="profile-columns"><section className="connections-panel"><h2>Connections</h2>{[{name:'Strava',sub:'Running and activities',icon:'activity',connected:true,action:onDisconnect,label:'Disconnect'},...available().map(k=>{const on=!PREVIEW?isSourceConnected(k):k==='whoop'&&whoopOk;return {name:SOURCES[k],sub:SOURCE_NOTES[k],icon:'recovery',connected:on,action:()=>{if(PREVIEW)return;if(on){disconnectSource(k);onSourceChange?.();}else connectSource(k);},label:on?'Disconnect':'Connect'};})].map(c=><div className="connection-row" key={c.name}><span className="connection-icon"><Icon name={c.icon}/></span><div><h3>{c.name}</h3><p>{c.sub}</p><span className={c.connected?'connection-ready':''}>{c.connected?'Connected':'Not connected'}</span></div><button className="text-button" onClick={c.action}>{c.label}</button></div>)}<SourcePicker userPrefs={userPrefs} onSavePrefs={onSavePrefs} onSourceChange={onSourceChange}/><CorosRow corosOk={corosOk} connect={connectCoros} disconnect={onDisconnectCoros} error={corosError}/><div className="connection-row is-soon"><span className="connection-icon"><Icon name="coros"/></span><div><h3>Garmin</h3><p>Runs, sleep, HRV and Body Battery from your Garmin watch.</p><span>Coming soon</span></div><span className="soon-pill">Soon</span></div></section></div></>}{!racesOnly&&<PersonalSettings userPrefs={userPrefs} onSavePrefs={onSavePrefs}/>}{racesOnly&&<Goals userPrefs={userPrefs} onSavePrefs={onSavePrefs}/>}</div>;
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

// With two or more sleep and recovery sources connected, the runner picks which one Apex reads.
function SourcePicker({userPrefs,onSavePrefs,onSourceChange}){
 const on=PREVIEW?[]:connectedSources();if(on.length<2)return null;
 const cur=activeSource(userPrefs?.settings);
 return <div className="source-picker"><h3>Sleep and recovery from</h3><p>Apex reads one source for your recovery score, sleep, HRV and resting heart rate.</p>
  <div className="apex-segments">{on.map(k=><button key={k} className={cur===k?'active':''} aria-pressed={cur===k} onClick={()=>{onSavePrefs({...userPrefs,settings:{...(userPrefs?.settings||{}),recoverySource:k}});onSourceChange?.();}}>{SOURCES[k]}</button>)}</div></div>;
}
