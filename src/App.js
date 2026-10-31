import {useState,useEffect,useCallback,useRef} from 'react';
import {isConnected,disconnect,exchangeCode,getAthlete,getStats,getAllGear} from './strava';
import {activeRunSource,connectedRunSources,loadRuns,RUN_SOURCES} from './runSources';
import {exchangeWhoopCode} from './whoop';
import {connectedSources,activeSource,connectSource,disconnectSource,pendingSource,finishConnect,getRecoveryData,available as recoveryAvailable,SOURCES} from './recoverySources';
import * as persistence from './supabase';
import {Frame,Home,SyncToast} from './ApexUI';
import Recovery from './ApexRecovery';
import Nutrition from './ApexNutrition';
import Training from './ApexTraining';
import Activity from './ApexActivity';
import Strength from './ApexStrength';
import Coach from './ApexCoach';
import Profile from './ApexProfile';
import Journal,{JournalPage} from './ApexJournal';
import {ProPage} from './ApexPro';
import Performance from './ApexPerformance';
import Settings,{readSettings,heartRate} from './ApexSettings';
import Shoes from './ApexShoes';
import {PREVIEW,NEW_USER,fixture,previewStore} from './ApexPreview';
import {PUBLIC,ownKey,setOwnKey} from './apexAccess';
import {session,onAuth} from './apexAuth';
import {setConnectionsUser,restoreConnections} from './apexConnections';
import {SignIn,NewPassword,Legal,Support,StravaGateDemo,ConnectRuns} from './ApexSignIn';
import {stravaCapacity} from './apexAuth';
import Onboarding from './ApexOnboarding';
import {sendWelcome} from './apexAuth';
import {isCorosConnected,isCorosCallback,finishCorosConnect,startCorosConnect,disconnectCoros} from './coros';
const {loadUserPrefs,saveUserPrefs,loadTrainingPlan,saveTrainingPlan}=PREVIEW?previewStore:persistence;

// Public build: sign in first, then the app runs against that user's private data.
// Owner build (REACT_APP_PUBLIC unset): straight into the app, exactly as before.
export default function App(){
 const [auth,setAuth]=useState(PUBLIC?undefined:null),[hash,setHash]=useState(window.location.hash),[ready,setReady]=useState(null);
 const [recovering,setRecovering]=useState(false);
 useEffect(()=>{if(!PUBLIC)return;let off=()=>{};session().then(s=>setAuth(s||null));onAuth((s,e)=>{setAuth(s||null);if(e==='PASSWORD_RECOVERY')setRecovering(true);}).then(f=>{off=f;});const h=()=>setHash(window.location.hash);window.addEventListener('hashchange',h);return()=>{off();window.removeEventListener('hashchange',h);};},[]);
 // Point the data layer at this user, then bring their Strava/WHOOP connections onto this device.
 const uid=auth?.user?.id;
 useEffect(()=>{if(!PUBLIC||!uid)return;let live=true;persistence.setUser(uid);setConnectionsUser(uid);restoreConnections().finally(()=>{if(live)setReady(uid);});return()=>{live=false;};},[uid]);
 if(PREVIEW&&/[?&]waitlist/.test(window.location.search))return <StravaGateDemo/>;// sample-mode screenshots only
 if(PREVIEW&&/[?&]support/.test(window.location.search))return <Support/>;
 if(PREVIEW&&/[?&]connect/.test(window.location.search)){const full=/[?&]full/.test(window.location.search);return <ConnectRuns connectStrava={async()=>full?'full':undefined} connectCoros={()=>{}} connectWhoop={()=>{}} onSkip={()=>{}}/>;}// sample-mode screenshots only
 if(PREVIEW&&/[?&]onboard/.test(window.location.search))return <Onboarding prefs={{}} onDone={()=>{}}/>;// sample-mode screenshots only
 if(!PUBLIC||PREVIEW)return <ApexApp/>;
 if(hash==='#privacy'||hash==='#terms')return <Legal kind={hash.slice(1)}/>;
 if(hash==='#support')return <Support/>;
 if(auth===undefined)return <div className="app-loading"><div/></div>;
 if(!auth)return <SignIn/>;
 if(recovering)return <NewPassword onDone={()=>setRecovering(false)}/>;
 if(ready!==uid)return <div className="app-loading"><div/></div>;
 return <ApexApp key={uid} account={auth.user}/>;
}

// Existing provider modules, OAuth callbacks, stored tokens and Supabase tables are retained.
function ApexApp({account}={}){
 const [loadFailure,setLoadFailure]=useState(null),[loadAttempt,setLoadAttempt]=useState(0);
 const [saveStatus,setSaveStatus]=useState(persistence.getSaveStatus());
 useEffect(()=>{if(PREVIEW)return;const update=()=>setSaveStatus(persistence.getSaveStatus());window.addEventListener('apex-save-status',update);return()=>window.removeEventListener('apex-save-status',update);},[]);
 const [activityId,setActivityId]=useState(null);
 const navigate=(id,activity=null)=>{setActivityId(activity);if(window.location.hash!=='#'+id)window.history.pushState({},'', '#'+id);setPage(id);};
 useEffect(()=>{const back=()=>{const id=window.location.hash.slice(1);setPage(['home','plan','activity','performance','recovery','nutrition','gym','coach','profile','races','journal','settings','shoes'].includes(id)?id:'home');};window.addEventListener('popstate',back);back();return()=>window.removeEventListener('popstate',back);},[]);
 const [page,setPage]=useState(()=>/[?&]pro=1/.test(window.location.search)?'settings':'home'),[connected,setConnected]=useState(PREVIEW||isConnected()),[whoopOk,setWhoopOk]=useState((PREVIEW&&!NEW_USER)||connectedSources().length>0),[sourcesTick,setSourcesTick]=useState(0);
 const [acts,setActs]=useState([]),[stats,setStats]=useState(null),[athlete,setAthlete]=useState(null),[gear,setGear]=useState([]),[whoop,setWhoop]=useState(null),[loading,setLoading]=useState(false),[whoopPending,setWhoopPending]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const hasActs=useRef(false);useEffect(()=>{hasActs.current=acts.length>0;},[acts]);
 const [savedPlan,setSavedPlan]=useState(null),[savedWorkout,setSavedWorkout]=useState(null),[userPrefs,setUserPrefs]=useState(null),[prefsReady,setPrefsReady]=useState(false);
 // Appearance: 'light', 'dark' or 'auto' (follow the phone).
 const [theme,setTheme]=useState(()=>{const t=localStorage.getItem('theme');return t==='light'||t==='dark'?t:'auto';});
 const [systemDark,setSystemDark]=useState(()=>!!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
 useEffect(()=>{const m=window.matchMedia?.('(prefers-color-scheme: dark)');if(!m)return;const f=e=>setSystemDark(e.matches);m.addEventListener?.('change',f);return()=>m.removeEventListener?.('change',f);},[]);
 const darkMode=theme==='auto'?systemDark:theme==='dark';
 const setDarkMode=d=>setTheme(d?'dark':'light');
 const [corosOk,setCorosOk]=useState(()=>!PREVIEW&&isCorosConnected()),[corosError,setCorosError]=useState('');
 const connectCoros=()=>{if(PREVIEW)return;setCorosError('');startCorosConnect().catch(e=>{setCorosError(e.message||'COROS could not be reached. Please try again.');navigate('profile');});};
 const disconnectCorosNow=()=>{disconnectCoros();setCorosOk(false);};
 useEffect(()=>{localStorage.setItem('theme',theme);const green=readSettings(userPrefs).look!=='swiss',c=darkMode?(green?'#0F3D2F':'#0C0E17'):(green?'#F3EDE2':'#F5F4F0');document.documentElement.style.background=c;document.documentElement.style.colorScheme=darkMode?'dark':'light';document.getElementById('apex-theme-color')?.setAttribute('content',c);},[darkMode,theme,userPrefs]);
 useEffect(()=>{
  if(PREVIEW)return;
  if(isCorosCallback()){finishCorosConnect().then(()=>{setCorosOk(true);setCorosError('');}).catch(e=>setCorosError(e.message||'COROS could not be connected.')).finally(()=>{window.history.replaceState({},'','/#profile');setPage('profile');});return;}
  const p=new URLSearchParams(window.location.search),code=p.get('code'),whoopP=localStorage.getItem('whoop_pending');if(!code)return;
  const other=pendingSource();if(other){setWhoopPending(true);finishConnect(code,p.get('state')).then(k=>{setWhoopOk(true);setSourcesTick(t=>t+1);setPage('profile');window.history.replaceState({},'','/#profile');}).catch(e=>{setError(e.message);window.history.replaceState({},'','/');}).finally(()=>setWhoopPending(false));return;}
  if(whoopP){setWhoopPending(true);exchangeWhoopCode(code).then(()=>setWhoopOk(true)).catch(()=>setError('WHOOP could not be connected. Please try again.')).finally(()=>{setWhoopPending(false);window.history.replaceState({},'','/');});}
  else if(!isConnected()){exchangeCode(code).then(()=>setConnected(true)).catch(()=>setError('Strava could not be connected. Please try again.')).finally(()=>window.history.replaceState({},'','/'));}
 },[]);
// Runs come from one source only (Strava, COROS or WHOOP), so nothing is ever loaded twice.
 const runSource=PREVIEW?'strava':activeRunSource(readSettings(userPrefs));
 const lastSource=useRef(runSource);
 useEffect(()=>{
  if(PREVIEW){if(connected){setGear(fixture.gear||[]);setAthlete(fixture.athlete);setActs(fixture.activities);setStats(fixture.stats);setWhoop(fixture.whoop);}return;}
  if(lastSource.current!==runSource){lastSource.current=runSource;setActs([]);hasActs.current=false;}
  if(!runSource){setActs([]);return;}
  // With two sources connected, wait for saved settings so the runner's pick is the one loaded.
  if(!prefsReady&&connectedRunSources().length>1)return;
  // Full-screen loader only the first time; a pull-to-refresh keeps the page on screen.
  let active=true;if(!hasActs.current)setLoading(true);setError('');
  // History opens instantly from this device, then syncs newer (or, the first time, all older) activities.
  loadRuns(runSource,{onUpdate:list=>{if(active){setActs(list);setLoading(false);}}}).catch(()=>{if(active)setError(`Your ${RUN_SOURCES[runSource]} activities could not finish syncing. Please try again.`);}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[runSource,retry,prefsReady,connected,corosOk]);
 // Strava profile, stats and shoes, when Strava is connected.
 useEffect(()=>{
  if(PREVIEW||!connected){if(!PREVIEW){setAthlete(null);setStats(null);setGear([]);}return;}
  let active=true;
  getAthlete().then(a=>{if(active)setAthlete(a);return Promise.all([getStats(a.id),getAllGear(a)]);}).then(([s,g])=>{if(active){setStats(s);setGear(g.filter(Boolean));}}).catch(()=>{if(active)setError('Your Strava profile could not load. Please try again.');});return()=>{active=false;};
 },[connected,retry]);
 // Sleep and recovery come from whichever source is chosen (WHOOP, Oura or Google Health).
 const recSource=PREVIEW?null:activeSource(readSettings(userPrefs));
 useEffect(()=>{if(PREVIEW||!whoopOk||!recSource)return;let active=true;const name=SOURCES[recSource];const load=()=>getRecoveryData(recSource).then(d=>{if(active){setWhoop(d);setError(e=>e.startsWith(name)?'':e);}});
  // One quiet retry before showing anything: a phone waking up often has no signal for a second.
  load().catch(()=>new Promise(r=>setTimeout(r,1500)).then(()=>active&&load())).catch(()=>{if(active)setError(`${name} data could not be refreshed. Pull down to try again.`);});return()=>{active=false;};},[whoopOk,retry,recSource,sourcesTick]);
 useEffect(()=>{let active=true;setPrefsReady(false);Promise.allSettled([loadUserPrefs(),loadTrainingPlan()]).then(([prefsResult,planResult])=>{if(!active)return;const p=prefsResult.status==='fulfilled'?prefsResult.value:null;if(prefsResult.status==='fulfilled'){setUserPrefs(p||{});setSavedWorkout(p?.currentWorkout||null);}if(planResult.status==='fulfilled')setSavedPlan(planResult.value||p?.currentPlan||null);else if(p?.currentPlan)setSavedPlan(p.currentPlan);const failed={prefs:prefsResult.status==='rejected',plan:planResult.status==='rejected'&&!p?.currentPlan};setLoadFailure(failed.prefs||failed.plan?failed:null);setPrefsReady(true);});return()=>{active=false;};},[loadAttempt]);
 // A key saved to the account reaches every device the user signs in on.
 useEffect(()=>{if(PUBLIC&&userPrefs?.aiKey&&!ownKey())setOwnKey(userPrefs.aiKey);},[userPrefs?.aiKey]);
 // Another device saved journal entries this one didn't have: show them too.
 useEffect(()=>{const on=e=>setUserPrefs(e.detail);window.addEventListener('apex-prefs-merged',on);return()=>window.removeEventListener('apex-prefs-merged',on);},[]);
 const savePrefs=useCallback(p=>{if(!prefsReady||loadFailure?.prefs)return;setUserPrefs(p);saveUserPrefs(p);},[prefsReady,loadFailure]);
 const savePlan=p=>{if(!prefsReady||loadFailure)return;setSavedPlan(p);saveTrainingPlan(p);savePrefs({...userPrefs,currentPlan:p});};
 const saveWorkout=w=>{if(!prefsReady||loadFailure?.prefs)return;setSavedWorkout(w);savePrefs({...userPrefs,currentWorkout:w});};
 // With more than one source available, connecting starts on the You page so the runner can pick.
 const connectWhoop=()=>{if(PREVIEW)return;recoveryAvailable().length>1?navigate('profile'):connectSource('whoop');};
 const onSourceChange=()=>{const left=connectedSources();setWhoopOk(left.length>0);if(!left.length)setWhoop(null);setSourcesTick(t=>t+1);};
 const [runsSkipped,setRunsSkipped]=useState(false);
 // Strava has a limited number of places while it reviews Apex: 'full' when none are free.
 const connectStrava=async()=>{if(PREVIEW)return;if(PUBLIC){const c=await stravaCapacity().catch(()=>({open:true}));if(!c.open)return 'full';}window.location.assign(stravaUrl);};
 const stravaUrl=`https://www.strava.com/oauth/authorize?client_id=${process.env.REACT_APP_STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(window.location.origin)}&response_type=code&scope=read,activity:read_all`;
 // Public build: a quick first-run setup before connecting Strava (skipped if saved data couldn't load).
 if(PUBLIC&&!PREVIEW&&!loadFailure?.prefs){
  if(!prefsReady)return <div className="app-loading"><div/></div>;
  if(!userPrefs?.onboarded)return <Onboarding prefs={userPrefs} onDone={p=>{savePrefs(p);sendWelcome(p.profile?.name);}}/>;
 }
 // No runs source yet: choose one (or skip) once. Skipping is remembered on the account.
 if(!PREVIEW&&!runSource&&!runsSkipped&&!userPrefs?.runsChosen&&prefsReady)return <ConnectRuns error={error} connectStrava={connectStrava} connectCoros={connectCoros} connectWhoop={()=>connectSource('whoop')} onSkip={()=>{setRunsSkipped(true);if(!loadFailure?.prefs)savePrefs({...userPrefs,runsChosen:true});}}/>;
 const me=athlete||(userPrefs?.profile?.name?{firstname:userPrefs.profile.name.split(' ')[0],lastname:userPrefs.profile.name.split(' ').slice(1).join(' ')}:null);
 // Activity types you've hidden (WHOOP walks by default) are left out everywhere except Settings.
 const hidden=readSettings(userPrefs).hiddenTypes,shownActs=acts.filter(a=>!hidden.includes(a.sport_type||a.type));
 const views={
  home:<Home gear={gear} onSavePrefs={savePrefs} prefsUnavailable={!!loadFailure?.prefs} planUnavailable={!!loadFailure?.plan} acts={shownActs} whoop={whoop} whoopOk={whoopOk} connectWhoop={connectWhoop} athlete={me} plan={savedPlan} nav={navigate} userPrefs={userPrefs} checkin={<Journal userPrefs={userPrefs} onSavePrefs={savePrefs} plan={savedPlan} nav={navigate}/>}/>,
  recovery:<><Recovery whoop={whoop} whoopOk={whoopOk} connectWhoop={connectWhoop}/>{!loadFailure?.prefs&&<Journal userPrefs={userPrefs} onSavePrefs={savePrefs} plan={savedPlan} nav={navigate}/>}</>,
  journal:<JournalPage userPrefs={userPrefs} onSavePrefs={savePrefs}/>,
  shoes:<Shoes gear={gear} acts={shownActs} userPrefs={userPrefs} onSavePrefs={savePrefs}/>,
  settings:<Settings userPrefs={userPrefs} onSavePrefs={savePrefs} acts={acts} whoop={whoop} gear={gear} theme={theme} setTheme={setTheme} nav={navigate}/>,
  performance:<ProPage feature="performance" nav={navigate}><Performance acts={shownActs} gear={gear} whoop={whoop} userPrefs={userPrefs} nav={navigate}/></ProPage>,
  nutrition:<Nutrition userPrefs={userPrefs} onSavePrefs={savePrefs}/>,
  plan:<Training acts={shownActs} races={userPrefs?.races} openRaces={()=>navigate('races')} plan={savedPlan} onChange={savePlan} openCoach={()=>navigate('coach')}/>,
  activity:<Activity source={runSource} acts={shownActs} gear={gear} initialId={activityId} nav={navigate} userPrefs={userPrefs} onSavePrefs={savePrefs} settings={readSettings(userPrefs)} hr={heartRate(readSettings(userPrefs),shownActs,whoop)}/>,
  gym:<Strength userPrefs={userPrefs} onSavePrefs={savePrefs} savedWorkout={savedWorkout} openCoach={()=>navigate('coach')}/>,
  coach:<Coach whoop={whoop} onPlanSaved={savePlan} onGymSaved={saveWorkout} userPrefs={{...userPrefs,currentPlan:savedPlan}} corosOk={corosOk} connectCoros={connectCoros}/>,
  profile:<Profile athlete={me} runSource={runSource} stravaOk={connected} connectStrava={connectStrava} acts={shownActs} whoopOk={whoopOk} whoop={whoop} connectWhoop={connectWhoop} corosOk={corosOk} connectCoros={connectCoros} onDisconnectCoros={disconnectCorosNow} corosError={corosError} darkMode={darkMode} setDarkMode={setDarkMode} onDisconnect={()=>{if(PREVIEW)return;disconnect();setConnected(false);}} onSourceChange={onSourceChange} userPrefs={userPrefs} onSavePrefs={savePrefs}/>
 };
 views.races=<Profile athlete={me} acts={shownActs} whoopOk={whoopOk} whoop={whoop} connectWhoop={connectWhoop} darkMode={darkMode} setDarkMode={setDarkMode} onDisconnect={()=>{if(!PREVIEW){disconnect();setConnected(false);}}} onSourceChange={onSourceChange} userPrefs={userPrefs} onSavePrefs={savePrefs} racesOnly/>;
 const blocked=loadFailure&&((loadFailure.prefs&&['journal','nutrition','gym','profile','races','settings','shoes'].includes(page))||(['plan','coach'].includes(page)&&(loadFailure.prefs||loadFailure.plan)));
 return <Frame page={page} nav={navigate} athlete={me} dark={darkMode} preview={PREVIEW} settings={readSettings(userPrefs)} onRefresh={()=>{setError('');setRetry(r=>r+1);}}>{loadFailure&&prefsReady&&<div className="sync-error" role="alert"><span>Some saved data is unavailable. Connected activities and recovery are still available.</span><button onClick={()=>setLoadAttempt(x=>x+1)}>Retry saved data</button></div>}{!PREVIEW&&!loadFailure&&<SyncToast status={saveStatus} onRetry={()=>persistence.retryPendingSaves()}/>}{error&&<div className="sync-error is-float" role="alert"><span>{error}</span><span className="sync-actions"><button onClick={()=>{setError('');setRetry(retry+1);}}>Retry</button><button aria-label="Dismiss" onClick={()=>setError('')}>×</button></span></div>}{loading||!prefsReady||whoopPending?<div className="app-loading" role="status"><svg viewBox="0 0 120 78" aria-hidden="true">{[18,26,34].map(r=><path key={r} d={`M120,${39+r} H40 A${r},${r} 0 0 1 40,${39-r} H120`}/>)}<path className="loading-lap" d="M100,61 H40 A22,22 0 0 1 40,17 H120"/></svg><p>{whoopPending?'Connecting…':'Bringing your day together…'}</p></div>:blocked?<section className="daily-review"><h2>Your saved records are temporarily unavailable.</h2><p>This section will reopen when its data loads. Your existing records have not been replaced.</p><button className="secondary-action" onClick={()=>navigate('activity')}>View connected activities</button></section>:(views[page]||views.home)}</Frame>;
}
