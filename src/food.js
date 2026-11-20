// APEX · food estimates. The AI splits a meal into items; any number the athlete gives is kept exactly;
// the meal's total is always the sum of its items, worked out here (so it can never be less than one of its parts).
import {aiHeaders,ownKey,anthropicDirect,accessMessage} from './apexAccess';

export const MACROS=['kcal','protein','carbs','fat'];
export const FOOD_MODEL='claude-sonnet-5-5';
const round=(v,d=0)=>{const f=10**d;return Math.round((Number(v)||0)*f)/f;};
export const sumItems=items=>Object.fromEntries(MACROS.map(k=>[k,round((items||[]).reduce((a,i)=>a+(Number(i[k])||0),0),k==='kcal'?0:1)]));

const SCHEMA={type:'object',additionalProperties:false,required:['name','items','assumptions'],properties:{
 name:{type:'string'},assumptions:{type:'string'},
 items:{type:'array',items:{type:'object',additionalProperties:false,required:['name','amount','kcal','protein','carbs','fat','source'],properties:{
  name:{type:'string'},amount:{type:'string'},kcal:{type:'number'},protein:{type:'number'},carbs:{type:'number'},fat:{type:'number'},source:{type:'string',enum:['you','estimate']}}}}}};

const SYSTEM=`You are a sports dietitian estimating a meal for a UK runner. Split the meal into its items and return JSON.
Rules:
1. Any number the athlete gives (calories, protein, grams, a pack label, "500 kcal of mince") is used exactly for that item, with source "you". If they give calories but no macros, estimate macros that add up to those calories.
2. Estimate every other item from a realistic UK portion and say the amount ("180 g cooked", "1 tbsp", "1 large bowl"). Include oil, butter, sauces, cheese and drinks that are mentioned or clearly part of the dish. Don't invent sides that weren't mentioned.
3. Cooked foods are cooked weights unless they say raw. Think about how the dish is normally made.
4. Each item's numbers must agree: kcal is close to 4×protein + 4×carbs + 9×fat.
5. With a photo, judge the portion from the plate, cutlery and packaging.
6. "assumptions" is one short sentence on the biggest guesses, so the athlete knows what to correct.
7. "name" is a short name for the whole meal.`;

const textOf=data=>(data?.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('').replace(/```json|```/g,'').trim();
function clean(parsed){
 const items=(parsed?.items||[]).map(i=>({name:String(i.name||'').trim(),amount:String(i.amount||'').trim(),source:i.source==='you'?'you':'estimate',...Object.fromEntries(MACROS.map(k=>[k,Math.max(0,round(i[k],k==='kcal'?0:1))]))})).filter(i=>i.name);
 if(!items.length)throw new Error('The estimate came back empty. Add a little more detail, or add the meal manually.');
 return {name:String(parsed.name||items.map(i=>i.name).join(', ')).trim().slice(0,80),assumptions:String(parsed.assumptions||'').trim(),items};
}

// One call; with `previous` and `correction`, the athlete is fixing an earlier estimate.
export async function estimateMeal({text,photo,previous,correction}){
 const content=[];
 if(photo)content.push({type:'image',source:{type:'base64',media_type:photo.type,data:photo.data}});
 content.push({type:'text',text:text?`The meal: ${text}`:'Estimate the meal in the photo.'});
 const messages=[{role:'user',content}];
 if(previous){messages.push({role:'assistant',content:JSON.stringify(previous)});messages.push({role:'user',content:`Correction from the athlete: ${correction}\nApply it (their numbers are exact) and return the full updated JSON.`});}
 const req={system:SYSTEM,messages,format:SCHEMA};
 let data,res;
 if(ownKey()){
  const send=f=>anthropicDirect({model:FOOD_MODEL,max_tokens:4000,system:SYSTEM,messages,output_config:{effort:'low',...(f?{format:{type:'json_schema',schema:SCHEMA}}:{})}});
  res=await send(true);if(res.status===400)res=await send(false);
 }else res=await fetch('/.netlify/functions/claude-chat',{method:'POST',headers:await aiHeaders(),body:JSON.stringify(req)});
 data=await res.json().catch(()=>({}));
 if(!res.ok||data.error)throw new Error(accessMessage(data.code,'The food estimate could not be completed. Try again or add the meal manually.'));
 if(data.stop_reason==='refusal')throw new Error('That one couldn’t be estimated. Try describing it differently.');
 let parsed;try{parsed=JSON.parse(textOf(data));}catch{throw new Error('The estimate came back garbled. Try again, or add the meal manually.');}
 return clean(parsed);
}

// Breakfast before 11, lunch to 3, snack to 5, dinner to 9, then snack.
export const MEAL_TYPES=['Breakfast','Lunch','Dinner','Snacks'];
export const typeForTime=(d=new Date())=>{const h=d.getHours();return h<11?'Breakfast':h<15?'Lunch':h<17?'Snacks':h<21?'Dinner':'Snacks';};
// Meals logged before meal types existed: placed by the time they were logged ("13:15").
export const typeOf=m=>m.type||(()=>{const h=parseInt(String(m.time||'').split(':')[0],10);if(!Number.isFinite(h))return 'Snacks';const d=new Date();d.setHours(h);return typeForTime(d);})();

// Meals you eat often, most frequent first (last 30 days).
export function frequentMeals(log,days=30){
 const cut=new Date(Date.now()-days*864e5).toISOString().slice(0,10),by={};
 Object.entries(log||{}).filter(([d])=>d>=cut).forEach(([,e])=>(e.meals||[]).forEach(m=>{const k=m.name.trim().toLowerCase();if(!k)return;const x=by[k]||(by[k]={meal:m,n:0});x.n++;x.meal=m;}));
 return Object.values(by).sort((a,b)=>b.n-a.n).slice(0,8).map(x=>x.meal);
}

// A starting point for targets from body weight and running volume (sports-nutrition rules of thumb).
export function suggestTargets(weightKg,weeklyKm){
 if(!(weightKg>0))return null;
 const protein=Math.round(weightKg*1.8),fat=Math.round(weightKg*1),carbs=Math.round(weightKg*(4.5+Math.min(3.5,(weeklyKm||0)/20)));
 return {kcal:Math.round((protein*4+carbs*4+fat*9)/50)*50,protein,carbs,fat};
}
