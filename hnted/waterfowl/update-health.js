import {dateKey} from '../engine.js';
const HOUR=3600000;
export function updateHealth(weather,conditions,status,{now=new Date(),automatic=true}={}){
  const time=+now,age=value=>{const n=Date.parse(value);return Number.isFinite(n)&&n<=time+300000?Math.max(0,(time-n)/HOUR):null;};
  const ageHours=age(weather?.generatedAt),groundAgeHours=age(conditions?.generatedAt),today=dateKey(now,'America/Chicago');
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'America/Chicago',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now),part=type=>Number(parts.find(p=>p.type===type)?.value);
  const minutes=part('hour')*60+part('minute'),lastDay=ageHours===null?null:dateKey(new Date(weather.generatedAt),'America/Chicago');
  const dailyDue=automatic&&minutes>=257&&lastDay!==today;
  const failedJobs=(status?.jobs??[]).filter(j=>j.status==='failed').map(j=>j.id);
  const freshNws=(weather?.sites??[]).filter(s=>s.provider==='NWS'&&age(s.issuedAt)!==null&&age(s.issuedAt)<=24&&s.points?.some(p=>p.end>time&&p.start<=time+2*HOUR)).length;
  const agedSites=(weather?.sites??[]).filter(s=>age(s.issuedAt)===null||age(s.issuedAt)>24).map(s=>s.name??s.id);
  const reasons=[];
  if(ageHours===null||ageHours>24)reasons.push('weather-snapshot-overdue');
  if(freshNws<5)reasons.push('current-forecast-coverage');
  if(!conditions)reasons.push('ground-snapshot-unavailable');
  else if(groundAgeHours===null||groundAgeHours>24)reasons.push('ground-snapshot-overdue');
  if(conditions&&(conditions.gauges??[]).filter(g=>age(g.points?.at(-1)?.time)!==null&&age(g.points?.at(-1)?.time)<=24).length<2)reasons.push('river-observations-old');
  if(failedJobs.length)reasons.push('last-refresh-failed');
  if(age(status?.finishedAt)===null)reasons.push('refresh-status-unavailable');
  const partial=agedSites.length>0||(weather?.errors?.length??0)>0||(conditions?.errors?.length??0)>0;
  const partialRetry=partial&&ageHours!==null&&ageHours>=6;
  return {ageHours,groundAgeHours,freshNws,agedSites,failedJobs,partial,dailyDue,needsRefresh:dailyDue||reasons.length>0||partialRetry,overdue:reasons.length>0||(dailyDue&&minutes>=347),reasons,lastRefreshAt:weather?.generatedAt??null};
}
