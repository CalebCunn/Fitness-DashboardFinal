// APEX · Free or Pro. Your own site (owner build) is always Pro; the public site reads the account's plan.
// Nothing is locked until payments are set up (REACT_APP_STRIPE_PAYMENT_LINK), so no one is stuck behind a paywall they can't pay.
import {useEffect,useState} from 'react';
import {accountSummary} from './apexAuth';
import {PREVIEW} from './ApexPreview';
const PUBLIC=process.env.REACT_APP_PUBLIC==='true';
export const PAYWALL=PUBLIC&&!!process.env.REACT_APP_STRIPE_PAYMENT_LINK;
const preview=()=>PREVIEW&&typeof window!=='undefined'&&/[?&]free\b/.test(window.location.search)?'free':'pro';
let plan=!PAYWALL?'pro':PREVIEW?preview():null,loading=null;const subs=new Set();
export function refreshPlan(){if(!PAYWALL||PREVIEW)return Promise.resolve(plan);
 loading=accountSummary().then(m=>{plan=m?.plan||'free';subs.forEach(f=>f(plan));return plan;}).catch(()=>{plan=plan||'free';subs.forEach(f=>f(plan));return plan;});return loading;}
// { pro, ready } — "ready" is false until the plan has loaded, so nothing flashes locked.
export function usePlan(){
 const [p,setP]=useState(plan);
 useEffect(()=>{subs.add(setP);if(plan==null&&!loading)refreshPlan();return()=>subs.delete(setP);},[]);
 return {pro:p==='pro',ready:p!=null};
}
