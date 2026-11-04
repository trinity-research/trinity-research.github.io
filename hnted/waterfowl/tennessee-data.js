import {dateKey} from '../engine.js';
const fields={Mallard:'mallard',BlackDuck:'blackDuck',WoodDuck:'woodDuck',Gadwall:'gadwall',Wigeon:'wigeon',Pintail:'northernPintail',B_Wteal:'blueWingedTeal',G_Wteal:'greenWingedTeal',Shoveler:'northernShoveler',UnidDabbler:'unidentifiedDabbler'};
const count=value=>value===null?null:typeof value==='number'&&Number.isInteger(value)&&value>=0?value:(()=>{throw new Error('Invalid TWRA count.');})();
export function latestBlackBayou(payload,{today=dateKey(new Date(),'America/Chicago')}={}){
  if(payload?.error||payload?.exceededTransferLimit||!Array.isArray(payload?.features))throw new Error('Incomplete TWRA response.');
  const rows=payload.features.map(f=>f.attributes).filter(a=>a?.AreaSurveyed==='Black Bayou'&&a.SurveyType==='ground'&&a.StateSurveyed?.toLowerCase()==='tn');
  if(!rows.length)throw new Error('No current-season Black Bayou ground survey.');
  for(const row of rows)if(!Number.isFinite(row.DateSurveyed)||dateKey(new Date(row.DateSurveyed),'America/Chicago')>today)throw new Error('Invalid or future survey date.');
  rows.sort((a,b)=>b.DateSurveyed-a.DateSurveyed);
  const a=rows[0],date=dateKey(new Date(a.DateSurveyed),'America/Chicago');
  if(rows.filter(r=>dateKey(new Date(r.DateSurveyed),'America/Chicago')===date).length!==1)throw new Error('Ambiguous same-day refuge observations.');
  const mallardCount=count(a.Mallard),allDucks=count(a.DuckTotals),counts=Object.fromEntries(Object.entries(fields).map(([key,name])=>[name,count(a[key])]));
  if(mallardCount===null||allDucks===null||mallardCount>allDucks)throw new Error('Required refuge counts are unavailable.');
  const known=Object.values(counts).filter(n=>n!==null).reduce((sum,n)=>sum+n,0);
  if(known>allDucks)throw new Error('Known duck species exceed the source total.');
  return {date,objectId:a.objectid,mallardCount,allDucks,counts,sourceGroupCounts:{dabblers:count(a.DabblerTotal),divers:count(a.DiverTotal),seaDucks:count(a.SeaDuckTotal),mergansers:count(a.MerganserTotal)},sourceWaterConditionText:a.WaterLevel_Conditions??null};
}
