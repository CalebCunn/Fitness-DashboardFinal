import {useState,useEffect,useCallback} from 'react';
import {isConnected,disconnect,exchangeCode,getAthlete,getStats,getActivities,getAllGear} from './strava';
import {isWhoopConnected,disconnectWhoop,exchangeWhoopCode,getWhoopAuthUrl,getWhoopData} from './whoop';
import * as persistence from './supabase';
import {Frame,Home,Welcome} from './ApexUI';
import Recovery from './ApexRecovery';
import Nutrition from './ApexNutrition';
import Training from './ApexTraining';
import Activity from './ApexActivity';
import Strength from './ApexStrength';
import Coach from './ApexCoach';
import Profile from './ApexProfile';
import Journal from './ApexJournal';
import Performance from './ApexPerformance';
import Settings,{readSettings,heartRate} from './ApexSettings';
import {PREVIEW,fixture,previewStore} from './ApexPreview';
import {isCorosConnected,isCorosCallback,finishCorosConnect,startCorosConnect,disconnectCoros} from './coros';
const {loadUserPrefs,saveUserPrefs,loadTrainingPlan,saveTrainingPlan}=PREVIEW?previewStore:persistence;

// Existing provider modules, OAuth callbacks, stored tokens and Supabase tables are retained.
export default function App(){
 const [loadFailure,setLoadFailure]=useState(null),[loadAttempt,setLoadAttempt]=useState(0);
 const [saveStatus,setSaveStatus]=useState(persistence.getSaveStatus());
 useEffect(()=>{if(PREVIEW)return;const update=()=>setSaveStatus(persistence.getSaveStatus());window.addEventListener('apex-save-status',update);return()=>window.removeEventListener('apex-save-status',update);},[]);
 const [activityId,setActivityId]=useState(null);
 const navigate=(id,activity=null)=>{setActivityId(activity);if(window.location.hash!=='#'+id)window.history.pushState({},'', '#'+id);setPage(id);};
 useEffect(()=>{const back=()=>{const id=window.location.hash.slice(1);setPage(['home','plan','activity','performance','recovery','nutrition','gym','coach','profile','races','settings'].includes(id)?id:'home');};window.addEventListener('popstate',back);back();return()=>window.removeEventListener('popstate',back);},[]);
 const [page,setPage]=useState('home'),[connected,setConnected]=useState(PREVIEW||isConnected()),[whoopOk,setWhoopOk]=useState(PREVIEW||isWhoopConnected());
 const [acts,setActs]=useState([]),[stats,setStats]=useState(null),[athlete,setAthlete]=useState(null),[gear,setGear]=useState([]),[whoop,setWhoop]=useState(null),[loading,setLoading]=useState(false),[whoopPending,setWhoopPending]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
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
 useEffect(()=>{localStorage.setItem('theme',theme);const c=darkMode?'#0C0E17':'#F5F4F0';document.documentElement.style.background=c;document.documentElement.style.colorScheme=darkMode?'dark':'light';document.getElementById('apex-theme-color')?.setAttribute('content',c);},[darkMode,theme]);
 useEffect(()=>{
  if(PREVIEW)return;
  if(isCorosCallback()){finishCorosConnect().then(()=>{setCorosOk(true);setCorosError('');}).catch(e=>setCorosError(e.message||'COROS could not be connected.')).finally(()=>{window.history.replaceState({},'','/#profile');setPage('profile');});return;}
  const p=new URLSearchParams(window.location.search),code=p.get('code'),whoopP=localStorage.getItem('whoop_pending');if(!code)return;
  if(whoopP){setWhoopPending(true);exchangeWhoopCode(code).then(()=>setWhoopOk(true)).catch(()=>setError('WHOOP could not be connected. Please try again.')).finally(()=>{setWhoopPending(false);window.history.replaceState({},'','/');});}
  else if(!isConnected()){exchangeCode(code).then(()=>setConnected(true)).catch(()=>setError('Strava could not be connected. Please try again.')).finally(()=>window.history.replaceState({},'','/'));}
 },[]);
 useEffect(()=>{
  if(!connected)return;
  if(PREVIEW){setGear(fixture.gear||[]);setAthlete(fixture.athlete);setActs(fixture.activities);setStats(fixture.stats);setWhoop(fixture.whoop);return;}
  let active=true;setLoading(true);setError('');
  Promise.all([getAthlete(),getActivities(100)]).then(([a,activities])=>{if(active){setAthlete(a);setActs(activities);}return Promise.all([getStats(a.id),getAllGear(a)]);}).then(([s,g])=>{if(active){setStats(s);setGear(g.filter(Boolean));}}).catch(()=>{if(active)setError('Your activities could not finish syncing. Please try again.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};
 },[connected,retry]);
 useEffect(()=>{if(PREVIEW||!whoopOk)return;let active=true;getWhoopData().then(d=>{if(active)setWhoop(d);}).catch(()=>{if(active)setError('WHOOP data could not be refreshed. Please try again.');});return()=>{active=false;};},[whoopOk,retry]);
 useEffect(()=>{let active=true;setPrefsReady(false);Promise.allSettled([loadUserPrefs(),loadTrainingPlan()]).then(([prefsResult,planResult])=>{if(!active)return;const p=prefsResult.status==='fulfilled'?prefsResult.value:null;if(prefsResult.status==='fulfilled'){setUserPrefs(p||{});setSavedWorkout(p?.currentWorkout||null);}if(planResult.status==='fulfilled')setSavedPlan(planResult.value||p?.currentPlan||null);else if(p?.currentPlan)setSavedPlan(p.currentPlan);const failed={prefs:prefsResult.status==='rejected',plan:planResult.status==='rejected'&&!p?.currentPlan};setLoadFailure(failed.prefs||failed.plan?failed:null);setPrefsReady(true);});return()=>{active=false;};},[loadAttempt]);
 const savePrefs=useCallback(p=>{if(!prefsReady||loadFailure?.prefs)return;setUserPrefs(p);saveUserPrefs(p);},[prefsReady,loadFailure]);
 const savePlan=p=>{if(!prefsReady||loadFailure)return;setSavedPlan(p);saveTrainingPlan(p);savePrefs({...userPrefs,currentPlan:p});};
 const saveWorkout=w=>{if(!prefsReady||loadFailure?.prefs)return;setSavedWorkout(w);savePrefs({...userPrefs,currentWorkout:w});};
 const connectWhoop=()=>{if(!PREVIEW)window.location.assign(getWhoopAuthUrl());};
 const stravaUrl=`https://www.strava.com/oauth/authorize?client_id=${process.env.REACT_APP_STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(window.location.origin)}&response_type=code&scope=read,activity:read_all`;
 if(!connected)return <>{error&&<p className="connection-error" role="alert">{error}</p>}<Welcome url={stravaUrl}/></>;
 const views={
  home:<Home gear={gear} prefsUnavailable={!!loadFailure?.prefs} planUnavailable={!!loadFailure?.plan} acts={acts} whoop={whoop} whoopOk={whoopOk} connectWhoop={connectWhoop} athlete={athlete} plan={savedPlan} nav={navigate} userPrefs={userPrefs} checkin={<Journal userPrefs={userPrefs} onSavePrefs={savePrefs} plan={savedPlan} nav={navigate}/>}/>,
  recovery:<><Recovery whoop={whoop} whoopOk={whoopOk} connectWhoop={connectWhoop}/>{!loadFailure?.prefs&&<Journal userPrefs={userPrefs} onSavePrefs={savePrefs} plan={savedPlan} nav={navigate}/>}</>,
  settings:<Settings userPrefs={userPrefs} onSavePrefs={savePrefs} acts={acts} whoop={whoop} gear={gear} theme={theme} setTheme={setTheme}/>,
  performance:<Performance acts={acts} gear={gear} whoop={whoop} userPrefs={userPrefs} nav={navigate}/>,
  nutrition:<Nutrition userPrefs={userPrefs} onSavePrefs={savePrefs}/>,
  plan:<Training acts={acts} races={userPrefs?.races} openRaces={()=>navigate('races')} plan={savedPlan} onChange={savePlan} openCoach={()=>navigate('coach')}/>,
  activity:<Activity acts={acts} gear={gear} initialId={activityId} nav={navigate} settings={readSettings(userPrefs)} hr={heartRate(readSettings(userPrefs),acts,whoop)}/>,
  gym:<Strength userPrefs={userPrefs} onSavePrefs={savePrefs} savedWorkout={savedWorkout} openCoach={()=>navigate('coach')}/>,
  coach:<Coach whoop={whoop} onPlanSaved={savePlan} onGymSaved={saveWorkout} userPrefs={{...userPrefs,currentPlan:savedPlan}} corosOk={corosOk} connectCoros={connectCoros}/>,
  profile:<Profile athlete={athlete} acts={acts} whoopOk={whoopOk} whoop={whoop} connectWhoop={connectWhoop} corosOk={corosOk} connectCoros={connectCoros} onDisconnectCoros={disconnectCorosNow} corosError={corosError} darkMode={darkMode} setDarkMode={setDarkMode} onDisconnect={()=>{if(PREVIEW)return;disconnect();setConnected(false);setActs([]);}} onDisconnectWhoop={()=>{if(PREVIEW)return;disconnectWhoop();setWhoopOk(false);setWhoop(null);}} userPrefs={userPrefs} onSavePrefs={savePrefs}/>
 };
 views.races=<Profile athlete={athlete} acts={acts} whoopOk={whoopOk} whoop={whoop} connectWhoop={connectWhoop} darkMode={darkMode} setDarkMode={setDarkMode} onDisconnect={()=>{if(!PREVIEW){disconnect();setConnected(false);}}} onDisconnectWhoop={()=>{if(!PREVIEW){disconnectWhoop();setWhoopOk(false);setWhoop(null);}}} userPrefs={userPrefs} onSavePrefs={savePrefs} racesOnly/>;
 const blocked=loadFailure&&((loadFailure.prefs&&['nutrition','gym','profile','races','settings'].includes(page))||(['plan','coach'].includes(page)&&(loadFailure.prefs||loadFailure.plan)));
 return <Frame page={page} nav={navigate} athlete={athlete} dark={darkMode} preview={PREVIEW} settings={readSettings(userPrefs)}>{loadFailure&&prefsReady&&<div className="sync-error" role="alert"><span>Some saved data is unavailable. Connected activities and recovery are still available.</span><button onClick={()=>setLoadAttempt(x=>x+1)}>Retry saved data</button></div>}{!PREVIEW&&!loadFailure&&saveStatus.message&&<div className={'persistence-status '+saveStatus.state} role="status"><span>{saveStatus.message}</span>{saveStatus.state==='pending'&&<button onClick={()=>persistence.retryPendingSaves()}>Retry cloud sync</button>}</div>}{error&&<div className="sync-error" role="alert"><span>{error}</span><button onClick={()=>setRetry(retry+1)}>Retry sync</button></div>}{loading||!prefsReady||whoopPending?<div className="app-loading" role="status"><div/><p>{whoopPending?'Connecting WHOOP…':'Bringing your day together…'}</p></div>:blocked?<section className="daily-review"><h2>Your saved records are temporarily unavailable.</h2><p>This section will reopen when its data loads. Your existing records have not been replaced.</p><button className="secondary-action" onClick={()=>navigate('activity')}>View connected activities</button></section>:(views[page]||views.home)}</Frame>;
}
