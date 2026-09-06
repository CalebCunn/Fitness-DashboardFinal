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
import {PREVIEW,fixture,previewStore} from './ApexPreview';
const {loadUserPrefs,saveUserPrefs,loadTrainingPlan,saveTrainingPlan}=PREVIEW?previewStore:persistence;

// Existing provider modules, OAuth callbacks, stored tokens and Supabase tables are retained.
export default function App(){
 const [activityId,setActivityId]=useState(null);
 const navigate=(id,activity=null)=>{setActivityId(activity);setPage(id==='races'?'races':id);};
 const [page,setPage]=useState('home'),[connected,setConnected]=useState(PREVIEW||isConnected()),[whoopOk,setWhoopOk]=useState(PREVIEW||isWhoopConnected());
 const [acts,setActs]=useState([]),[stats,setStats]=useState(null),[athlete,setAthlete]=useState(null),[gear,setGear]=useState([]),[whoop,setWhoop]=useState(null),[loading,setLoading]=useState(false),[whoopPending,setWhoopPending]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [savedPlan,setSavedPlan]=useState(null),[savedWorkout,setSavedWorkout]=useState(null),[userPrefs,setUserPrefs]=useState(null),[prefsReady,setPrefsReady]=useState(false);
 const [darkMode,setDarkMode]=useState(()=>localStorage.getItem('theme')==='dark');
 useEffect(()=>{localStorage.setItem('theme',darkMode?'dark':'light');},[darkMode]);
 useEffect(()=>{
  if(PREVIEW)return;
  const p=new URLSearchParams(window.location.search),code=p.get('code'),whoopP=localStorage.getItem('whoop_pending');if(!code)return;
  if(whoopP){setWhoopPending(true);exchangeWhoopCode(code).then(()=>setWhoopOk(true)).catch(()=>setError('WHOOP could not be connected. Please try again.')).finally(()=>{setWhoopPending(false);window.history.replaceState({},'','/');});}
  else if(!isConnected()){exchangeCode(code).then(()=>setConnected(true)).catch(()=>setError('Strava could not be connected. Please try again.')).finally(()=>window.history.replaceState({},'','/'));}
 },[]);
 useEffect(()=>{
  if(!connected)return;
  if(PREVIEW){setAthlete(fixture.athlete);setActs(fixture.activities);setStats(fixture.stats);setWhoop(fixture.whoop);return;}
  let active=true;setLoading(true);setError('');
  Promise.all([getAthlete(),getActivities(100)]).then(([a,activities])=>{if(active){setAthlete(a);setActs(activities);}return Promise.all([getStats(a.id),getAllGear(a)]);}).then(([s,g])=>{if(active){setStats(s);setGear(g.filter(Boolean));}}).catch(()=>{if(active)setError('Your activities could not finish syncing. Please try again.');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};
 },[connected,retry]);
 useEffect(()=>{if(PREVIEW||!whoopOk)return;let active=true;getWhoopData().then(d=>{if(active)setWhoop(d);}).catch(()=>{if(active)setError('WHOOP data could not be refreshed. Please try again.');});return()=>{active=false;};},[whoopOk,retry]);
 useEffect(()=>{let active=true;Promise.all([loadUserPrefs(),loadTrainingPlan()]).then(([p,plan])=>{if(!active)return;setUserPrefs(p||{});setSavedPlan(plan||p?.currentPlan||null);setSavedWorkout(p?.currentWorkout||null);}).finally(()=>{if(active)setPrefsReady(true);});return()=>{active=false;};},[]);
 const savePrefs=useCallback(p=>{setUserPrefs(p);saveUserPrefs(p);},[]);
 const savePlan=p=>{setSavedPlan(p);saveTrainingPlan(p);savePrefs({...userPrefs,currentPlan:p});};
 const saveWorkout=w=>{setSavedWorkout(w);savePrefs({...userPrefs,currentWorkout:w});};
 const connectWhoop=()=>{if(!PREVIEW)window.location.assign(getWhoopAuthUrl());};
 const stravaUrl=`https://www.strava.com/oauth/authorize?client_id=${process.env.REACT_APP_STRAVA_CLIENT_ID}&redirect_uri=${encodeURIComponent(window.location.origin)}&response_type=code&scope=read,activity:read_all`;
 if(!connected)return <>{error&&<p className="connection-error" role="alert">{error}</p>}<Welcome url={stravaUrl}/></>;
 const views={
  home:<Home acts={acts} whoop={whoop} whoopOk={whoopOk} connectWhoop={connectWhoop} athlete={athlete} plan={savedPlan} nav={navigate} userPrefs={userPrefs}/>,
  recovery:<Recovery whoop={whoop} whoopOk={whoopOk} connectWhoop={connectWhoop}/>,
  nutrition:<Nutrition userPrefs={userPrefs} onSavePrefs={savePrefs}/>,
  plan:<Training plan={savedPlan} onChange={savePlan} openCoach={()=>setPage('coach')}/>,
  activity:<Activity acts={acts} gear={gear} initialId={activityId}/>,
  gym:<Strength userPrefs={userPrefs} onSavePrefs={savePrefs} savedWorkout={savedWorkout} openCoach={()=>setPage('coach')}/>,
  coach:<Coach acts={acts} stats={stats} whoop={whoop} whoopOk={whoopOk} onPlanSaved={savePlan} onGymSaved={saveWorkout} userPrefs={{...userPrefs,currentPlan:savedPlan}}/>,
  profile:<Profile athlete={athlete} acts={acts} whoopOk={whoopOk} whoop={whoop} connectWhoop={connectWhoop} darkMode={darkMode} setDarkMode={setDarkMode} onDisconnect={()=>{if(PREVIEW)return;disconnect();setConnected(false);setActs([]);}} onDisconnectWhoop={()=>{if(PREVIEW)return;disconnectWhoop();setWhoopOk(false);setWhoop(null);}} userPrefs={userPrefs} onSavePrefs={savePrefs}/>
 };
 views.races=<Profile athlete={athlete} acts={acts} whoopOk={whoopOk} whoop={whoop} connectWhoop={connectWhoop} darkMode={darkMode} setDarkMode={setDarkMode} onDisconnect={()=>{if(!PREVIEW){disconnect();setConnected(false);}}} onDisconnectWhoop={()=>{if(!PREVIEW){disconnectWhoop();setWhoopOk(false);setWhoop(null);}}} userPrefs={userPrefs} onSavePrefs={savePrefs} racesOnly/>;
 return <Frame page={page} nav={navigate} athlete={athlete} dark={darkMode} setDark={setDarkMode} preview={PREVIEW}>{error&&<div className="sync-error" role="alert"><span>{error}</span><button onClick={()=>setRetry(retry+1)}>Retry sync</button></div>}{loading||!prefsReady||whoopPending?<div className="app-loading" role="status"><div/><p>{whoopPending?'Connecting WHOOP…':'Bringing your day together…'}</p></div>:(views[page]||views.home)}</Frame>;
}
