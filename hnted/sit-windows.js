import {localParts} from './engine.js';

// Keep both daily major periods. A stronger morning must not hide the evening.
// Sunrise/sunset overlap gives context without changing the original lunar range.
export function sitWindows(forecast,zone){
  const major=forecast.periods.filter(period=>period.major);
  const daylightKnown=Number.isFinite(+forecast.sun.sunrise)&&Number.isFinite(+forecast.sun.sunset);
  return [...(major.length?major:forecast.periods)].sort((a,b)=>a.time-b.time).map(period=>{
    const hour=localParts(period.time,zone).hour;
    const label=hour<4?'Overnight':hour<12?'Morning':hour<17?'Afternoon':hour<21?'Evening':'Overnight';
    const start=Math.max(+period.start,+forecast.start,+forecast.sun.sunrise);
    const end=Math.min(+period.end,+forecast.end,+forecast.sun.sunset);
    return {...period,label,daylightKnown,daylight:daylightKnown&&end>start?{start:new Date(start),end:new Date(end)}:null};
  });
}
