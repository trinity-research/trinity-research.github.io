import {dateKey,addDays,zonedTime} from '../engine.js';

const HOUR=3600000;
const finite=value=>typeof value==='number'&&Number.isFinite(value)?value:null;
const percentage=value=>finite(value)!==null&&value>=0&&value<=100?value:null;
const directions=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
export const bearing=direction=>directions.includes(direction)?directions.indexOf(direction)*22.5:null;
export const celsius=(value,unit)=>finite(value)===null?null:unit==='F'?(value-32)*5/9:unit==='C'?value:null;

export function windRange(value){
  if(typeof value!=='string')return {low:null,high:null};
  const match=value.match(/^(\d+(?:\.\d+)?)(?: to (\d+(?:\.\d+)?))? (mph|km\/h|kph|kt)$/);
  if(!match)return {low:null,high:null};
  const multiplier=match[3]==='mph'?1.609344:match[3]==='kt'?1.852:1;
  return {low:Number(match[1])*multiplier,high:Number(match[2]??match[1])*multiplier};
}

export function parseNwsHourly(payload){
  if(!Array.isArray(payload?.properties?.periods)||!payload.properties.periods.length)throw new Error('No NWS hourly periods.');
  const points=payload.properties.periods.map(p=>{
    const start=Date.parse(p.startTime),end=Date.parse(p.endTime),wind=windRange(p.windSpeed);
    return {start,end,temperatureC:celsius(p.temperature,p.temperatureUnit),windLowKph:wind.low,windHighKph:wind.high,windFrom:p.windDirection??null,rainChance:percentage(p.probabilityOfPrecipitation?.value)};
  }).filter(p=>Number.isFinite(p.start)&&Number.isFinite(p.end)&&p.end>p.start).sort((a,b)=>a.start-b.start);
  if(!points.length)throw new Error('No valid NWS intervals.');
  return {issuedAt:payload.properties.updateTime??null,points};
}

export function parseEcccHourly(feature){
  const group=feature?.properties?.hourlyForecastGroup;
  if(!Array.isArray(group?.hourlyForecasts)||!group.hourlyForecasts.length)throw new Error('No ECCC hourly forecasts.');
  const points=group.hourlyForecasts.map(p=>{
    const start=Date.parse(p.timestamp),speed=p.wind?.speed;
    const wind=speed?.units?.en==='km/h'?finite(speed.value?.en):null;
    return {start,end:start+HOUR,temperatureC:celsius(p.temperature?.value?.en,p.temperature?.units?.en),windLowKph:wind,windHighKph:wind,windFrom:p.wind?.direction?.value?.en??null,rainChance:p.lop?.units?.en==='%'?percentage(p.lop.value?.en):null};
  }).filter(p=>Number.isFinite(p.start)).sort((a,b)=>a.start-b.start);
  if(!points.length)throw new Error('No valid ECCC hours.');
  return {issuedAt:group.timestamp?.en??null,points};
}

// Summaries use actual UTC intervals inside the selected location's calendar day.
// A partial first day never masquerades as a complete daily minimum or maximum.
export function summarizeDay(points,key,zone){
  const start=+zonedTime(key,0,zone),end=+zonedTime(addDays(key,1),0,zone);
  const selected=points.map(p=>({...p,overlap:Math.max(0,Math.min(p.end,end)-Math.max(p.start,start))})).filter(p=>p.overlap>0);
  if(!selected.length)return null;
  const temps=selected.filter(p=>finite(p.temperatureC)!==null);
  const wind=selected.filter(p=>finite(p.windHighKph)!==null);
  const rain=selected.map(p=>p.rainChance).filter(p=>finite(p)!==null);
  let x=0,y=0,totalWind=0;
  for(const p of wind){const angle=bearing(p.windFrom);if(angle===null)continue;const weight=(p.windLowKph+p.windHighKph)/2*p.overlap/HOUR;x+=Math.sin(angle*Math.PI/180)*weight;y+=Math.cos(angle*Math.PI/180)*weight;totalWind+=weight;}
  const concentration=totalWind?Math.hypot(x,y)/totalWind:0;
  const direction=concentration>=.25?directions[Math.round(((Math.atan2(x,y)*180/Math.PI+360)%360)/22.5)%16]:null;
  // Merge intervals to avoid double-counting duplicate or overlapping records.
  const coverage=rows=>{let hours=0,last=start;for(const p of [...rows].sort((a,b)=>a.start-b.start)){const a=Math.max(start,p.start,last),b=Math.min(end,p.end);if(b>a){hours+=(b-a)/HOUR;last=b;}}return hours;};
  const hours=coverage(selected),temperatureHours=coverage(temps);
  const min=temps.length?Math.min(...temps.map(p=>p.temperatureC)):null,max=temps.length?Math.max(...temps.map(p=>p.temperatureC)):null;
  return {key,hours,expectedHours:(end-start)/HOUR,complete:hours===(end-start)/HOUR,temperatureHours,temperatureComplete:temperatureHours===(end-start)/HOUR,minC:min,maxC:max,freezeHours:temps.length?coverage(temps.filter(p=>p.temperatureC<0)):null,windHighKph:wind.length?Math.max(...wind.map(p=>p.windHighKph)):null,windFrom:direction,rainChanceMax:rain.length?Math.max(...rain):null,start:new Date(Math.max(start,Math.min(...selected.map(p=>p.start)))).toISOString(),end:new Date(Math.min(end,Math.max(...selected.map(p=>p.end)))).toISOString()};
}

export function snapshotState(snapshot,now=new Date()){
  const generated=Date.parse(snapshot?.generatedAt),age=+now-generated;
  if(!Number.isFinite(generated)||age< -5*60000)return {label:'Snapshot date unavailable',stale:true};
  const issues=(snapshot.sites??[]).map(s=>Date.parse(s.issuedAt)).filter(Number.isFinite);
  const oldest=issues.length?Math.min(...issues):NaN;
  return {label:age>86400000?'Saved snapshot · refresh needed':'Saved weather snapshot',stale:age>86400000||!Number.isFinite(oldest)||+now-oldest>86400000,ageHours:Math.max(0,age/HOUR)};
}

export function availableDates(snapshot,zone){
  const key=dateKey(new Date(snapshot.generatedAt),zone);
  return Array.from({length:5},(_,i)=>addDays(key,i));
}

export function nearestSite(spot,sites){
  const radians=x=>x*Math.PI/180;
  return sites.map(s=>{const a=Math.sin(radians(s.lat-spot.lat)/2)**2+Math.cos(radians(spot.lat))*Math.cos(radians(s.lat))*Math.sin(radians(s.lon-spot.lon)/2)**2;return {site:s,distanceKm:6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))};}).sort((a,b)=>a.distanceKm-b.distanceKm)[0]??null;
}
