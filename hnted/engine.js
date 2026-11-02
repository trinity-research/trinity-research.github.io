// Rating weights and smoothing recovered from Time2Hunt Lite 4.1's HuntingScoreUtil.
// Astronomy inputs use the locally bundled SunCalc 1.9.0. No calculation API is used.
const HOUR = 3600000;
const DEG = Math.PI / 180;
const clamp = (x,min,max) => Math.min(max,Math.max(min,x));
const formatters = new Map();

export function localParts(date, zone) {
  if (!formatters.has(zone)) formatters.set(zone, new Intl.DateTimeFormat('en-CA', {timeZone:zone, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
  return Object.fromEntries(formatters.get(zone).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
}
export function dateKey(date = new Date(), zone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const p=localParts(date,zone);
  return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;
}
export function addDays(key, count) {
  const d=new Date(key+'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+count); return d.toISOString().slice(0,10);
}
export function zonedTime(key, hour, zone, minute=0) {
  const [y,m,d]=key.split('-').map(Number), wall=Date.UTC(y,m-1,d,hour,minute);
  let value=wall;
  for(let i=0;i<4;i++) {
    const p=localParts(new Date(value),zone);
    const represented=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);
    const next=wall-(represented-value);
    if(Math.abs(next-value)<1000) return new Date(next);
    value=next;
  }
  return new Date(value);
}
export function timeScore(apex, sunrise, sunset) {
  if(Math.abs(sunrise-apex)<=1 || Math.abs(sunset-apex)<=1) return 100;
  if((Math.abs(sunrise-apex)<=2 && apex>sunrise)||(Math.abs(sunset-apex)<=2 && apex<sunset)) return 80;
  if(Math.abs(sunrise-apex)<=2 || Math.abs(sunset-apex)<=2) return 40;
  return apex>sunrise && apex<sunset ? 60 : 0;
}
export function hourlyScore(hour, moon, perigee, sunrise, sunset) {
  const [rise,set,over,altitude,under]=moon;
  const curve=d=>100-100*(60*d)**2/22500;
  const lunar=Math.max(curve(Math.abs(over-hour)),curve(Math.abs(under-hour))*.75,curve(Math.min(Math.abs(rise-hour),Math.abs(set-hour)))*.2);
  const lunarScore=(lunar<0?0:(Math.round(100*altitude)+lunar+perigee)/3)*.75;
  const solar=Math.max(0,curve(Math.min(Math.abs(sunrise-hour),Math.abs(sunset-hour)))*.25,curve(Math.abs((sunset-sunrise)/2+sunrise-hour))*.15);
  return Math.round(lunarScore+solar);
}
export function hourlyScores(moon,perigee,sunrise,sunset) {
  const scores=Array.from({length:24},(_,hour)=>Math.max(1,hourlyScore(hour,moon,perigee,sunrise,sunset)));
  for(let h=1;h<24;h++) if(Math.trunc(scores[h-1]/scores[h])>=2) scores[h]=Math.round(scores[h-1]*.7);
  for(let h=22;h>=0;h--) if(Math.trunc(scores[h+1]/scores[h])>=2) scores[h]=Math.round(scores[h+1]*.7);
  return scores.map(s=>clamp(s,1,100));
}

// Find lunar horizon crossings and altitude extrema in the location's actual day.
// Adjacent days supply scoring inputs when there is no rise or set on this date.
function lunarEvents(start,end,lat,lon,SC) {
  const height=t=>SC.getMoonPosition(new Date(t),lat,lon).altitude;
  const events={rise:[],set:[],over:[],under:[]};
  const step=HOUR/3, samples=[];
  for(let t=+start-30*HOUR;t<=+end+30*HOUR;t+=step) samples.push({t,y:height(t)});
  for(let i=1;i<samples.length;i++) {
    const a=samples[i-1],b=samples[i];
    if((a.y-.133*DEG)*(b.y-.133*DEG)<0) {
      let lo=a.t,hi=b.t;
      for(let j=0;j<18;j++) { const mid=(lo+hi)/2; if((height(mid)-.133*DEG)*(a.y-.133*DEG)>0) lo=mid; else hi=mid; }
      events[b.y>a.y?'rise':'set'].push(new Date((lo+hi)/2));
    }
    if(i<2) continue;
    const prev=samples[i-2],middle=a,next=b;
    const isMax=middle.y>prev.y && middle.y>next.y, isMin=middle.y<prev.y && middle.y<next.y;
    if(isMax||isMin) {
      let lo=prev.t,hi=next.t;
      for(let j=0;j<23;j++) { const l=lo+(hi-lo)/3,r=hi-(hi-lo)/3; if((height(l)<height(r))===isMax) lo=l; else hi=r; }
      events[isMax?'over':'under'].push(new Date((lo+hi)/2));
    }
  }
  return events;
}

export function forecast(key, location, twilight='civil', SC=globalThis.SunCalc) {
  const {lat,lon,zone}=location;
  if(!SC || !Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180) throw new Error('A valid location is required.');
  const noon=zonedTime(key,12,zone),start=zonedTime(key,0,zone),end=zonedTime(addDays(key,1),0,zone);
  const sun=SC.getTimes(noon,lat,lon);
  const valid=d=>d instanceof Date && Number.isFinite(+d);
  const inDay=d=>valid(d)&&d>=start&&d<end;
  const hours=d=>{const p=localParts(d,zone);return p.hour+p.minute/60+p.second/3600;};
  const events=lunarEvents(start,end,lat,lon,SC);
  const moon={};
  for(const kind of Object.keys(events)) moon[kind]=events[kind].find(inDay)??null;
  const nearest=kind=>events[kind].reduce((a,b)=>!a||Math.abs(b-noon)<Math.abs(a-noon)?b:a,null);
  const scoreHour=kind=>{const d=moon[kind]||nearest(kind);return d?hours(d)+(dateKey(d,zone)<key?-24:dateKey(d,zone)>key?24:0):Infinity;};
  const over=moon.over||nearest('over');
  const altitude=over?clamp(Math.sin(SC.getMoonPosition(over,lat,lon).altitude),0,1):0;
  const distance=SC.getMoonPosition(noon,lat,lon).distance;
  const perigee=clamp(Math.round((406000-distance)/43000*100),0,100);
  const illumination=SC.getMoonIllumination(noon);
  const polar=!valid(sun.sunrise)||!valid(sun.sunset);
  const moonInputs=[scoreHour('rise'),scoreHour('set'),scoreHour('over'),altitude,scoreHour('under')];
  const scores=polar?null:hourlyScores(moonInputs,perigee,hours(sun.sunrise),hours(sun.sunset));
  const daily=polar?null:clamp(Math.trunc((timeScore(moonInputs[2],hours(sun.sunrise),hours(sun.sunset))+Math.round(100*altitude)+Math.trunc(perigee))/3),0,100);
  let dawn=sun.dawn,dusk=sun.dusk;
  if(twilight==='nautical') {dawn=sun.nauticalDawn;dusk=sun.nauticalDusk;}
  if(twilight==='astronomical') {dawn=sun.nightEnd;dusk=sun.night;}
  if(['30','45'].includes(twilight)) {dawn=new Date(+sun.sunrise-Number(twilight)*60000);dusk=new Date(+sun.sunset+Number(twilight)*60000);}
  const duration=(60+daily*.3)*60000;
  const periods=Object.entries(moon).filter(([,d])=>d).map(([kind,time])=>({kind,time,start:new Date(+time-duration/(kind==='over'||kind==='under'?1:2)),end:new Date(+time+duration/(kind==='over'||kind==='under'?1:2)),major:kind==='over'||kind==='under'})).sort((a,b)=>a.time-b.time);
  const phase=illumination.phase;
  const phaseName=phase<.025||phase>.975?'New moon':phase<.225?'Waxing crescent':phase<.275?'First quarter':phase<.475?'Waxing gibbous':phase<.525?'Full moon':phase<.725?'Waning gibbous':phase<.775?'Last quarter':'Waning crescent';
  return {key,start,end,noon,sun,moon,dawn,dusk,scores,daily,illumination,phaseName,periods,perigee,distance,polar,daylight:valid(sun.sunrise)&&valid(sun.sunset)?(+sun.sunset-sun.sunrise)/HOUR:null};
}
