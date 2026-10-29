// APEX · what a Free account sees where a Pro feature lives: what it does, and one way to unlock it.
import {Icon} from './ApexUI';
import {usePlan} from './apexPlan';
export const PRO_FEATURES={
 performance:['Performance','Race predictor, PB wall, form and your pace band, worked out from every run.'],
 raceday:['Race day mode','Race week and race morning planned for you: breakfast, warm-up, gel, the gun, and a pace band for every split.'],
 ghost:['Race your ghost','You’ve run this route before. Race the runner you were, second by second.'],
 fuel:['Meal photos','Snap or describe a meal and Apex estimates calories, protein and carbs.'],
};
const LIST=['Coach: 400 messages a month','Performance: predictor, PBs, form','Race day mode','Race your ghost','Meal photo estimates'];
function goPro(nav){if(nav)nav('settings');else{window.history.pushState({},'','#settings');window.dispatchEvent(new PopStateEvent('popstate'));}setTimeout(()=>document.getElementById('set-account')?.scrollIntoView({behavior:'smooth',block:'start'}),80);}
// A whole page behind Pro.
export function ProPage({feature,nav,children}){
 const {pro,ready}=usePlan();if(!ready)return <div className="app-loading"><div/></div>;if(pro)return children;
 const [title,line]=PRO_FEATURES[feature];
 return <section className="pro-lock"><span className="pro-tag">Pro</span><h2>{title}</h2><p>{line}</p>
  <ul>{LIST.map(x=><li key={x}><Icon name="check" size={16}/>{x}</li>)}</ul>
  <button className="primary-action" onClick={()=>goPro(nav)}>Unlock with Pro <Icon name="arrow" size={18}/></button></section>;
}
// A small strip in place of a Pro feature inside a free page.
export function ProStrip({feature,nav,children}){
 const {pro,ready}=usePlan();if(!ready)return null;if(pro)return children;
 const [title,line]=PRO_FEATURES[feature];
 return <button className="pro-strip" onClick={()=>goPro(nav)}><span className="pro-tag">Pro</span><span><b>{title}</b><small>{line}</small></span><Icon name="chevron" size={16}/></button>;
}
