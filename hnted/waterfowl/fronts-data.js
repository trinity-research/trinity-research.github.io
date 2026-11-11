import {dateKey,zonedTime} from '../engine.js';

export const FRONT_TYPES={cold:{label:'Cold front',color:'#286ca2'},warm:{label:'Warm front',color:'#b74436'},stationary:{label:'Stationary front',color:'#286ca2'},occluded:{label:'Occluded front',color:'#805287'},trough:{label:'Trough / boundary',color:'#8b6838'},high:{label:'High pressure',color:'#286ca2'},low:{label:'Low pressure',color:'#b74436'}};
const validTime=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const publicUrl=value=>{const u=new URL(value);if(u.protocol!=='https:'||u.hostname!=='www.wpc.ncep.noaa.gov'||u.username||u.password||u.port)throw new Error('Invalid NOAA front source URL.');};
export function validateFronts(data){
  if(data?.schemaVersion!==1||!validTime(data.generatedAt)||!Array.isArray(data.frames)||!data.frames.length||data.frames.length>32)throw new Error('Invalid front-map snapshot.');
  const ids=new Set();let vertices=0;
  const point=p=>{if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90)throw new Error('Invalid front coordinates.');if(++vertices>100000)throw new Error('Front geometry exceeds its size limit.');};
  const line=points=>{if(!Array.isArray(points)||points.length<2||points.length>5000)throw new Error('Invalid front line.');points.forEach(point);};
  for(const frame of data.frames){
    if(!frame.id||ids.has(frame.id)||!['analysis','forecast'].includes(frame.kind)||!validTime(frame.validAt)||!validTime(frame.issuedAt)||!Array.isArray(frame.features)||frame.features.length>1000)throw new Error('Invalid or duplicate front-map frame.');
    if(Date.parse(frame.issuedAt)>Date.parse(data.generatedAt)+300000||Date.parse(frame.validAt)>Date.parse(data.generatedAt)+10*86400000)throw new Error('Implausible front-map source date.');
    ids.add(frame.id);publicUrl(frame.sourceUrl);
    for(const f of frame.features){
      const type=f.properties?.type;if(f.type!=='Feature'||!FRONT_TYPES[type])throw new Error('Unknown NOAA front type.');
      const g=f.geometry;
      if(['high','low'].includes(type)){if(g?.type!=='Point')throw new Error('Pressure center must be a point.');point(g.coordinates);if(f.properties.pressureHpa!==undefined&&(!Number.isFinite(f.properties.pressureHpa)||f.properties.pressureHpa<800||f.properties.pressureHpa>1100))throw new Error('Invalid pressure-center value.');}
      else if(g?.type==='LineString')line(g.coordinates);
      else if(g?.type==='MultiLineString'&&Array.isArray(g.coordinates)&&g.coordinates.length&&g.coordinates.length<100)g.coordinates.forEach(line);
      else throw new Error('Front boundary must be a line.');
    }
  }
  return data;
}
export function frontFramesForDay(data,key,zone){return (data?.frames??[]).filter(f=>dateKey(new Date(f.validAt),zone)===key).sort((a,b)=>Date.parse(a.validAt)-Date.parse(b.validAt)||a.kind.localeCompare(b.kind));}
export function chooseFrontFrame(data,key,zone,{requestedId,now=new Date()}={}){
  const frames=frontFramesForDay(data,key,zone),requested=frames.find(f=>f.id===requestedId);if(requested)return requested;
  const today=dateKey(now,zone),analysis=frames.filter(f=>f.kind==='analysis'&&Date.parse(f.validAt)<=+now+3600000).at(-1);
  if(key===today&&analysis&&+now-Date.parse(analysis.validAt)<=12*3600000)return analysis;
  const target=key===today?+now:+zonedTime(key,12,zone);
  return [...frames].sort((a,b)=>Math.abs(Date.parse(a.validAt)-target)-Math.abs(Date.parse(b.validAt)-target))[0]??null;
}
export function frontFrameStatus(data,frame,now=new Date()){
  if(!data||!frame)return {stale:false,drawable:false};
  const age=(+now-Date.parse(frame.validAt))/3600000,sourceAge=(+now-Date.parse(frame.issuedAt))/3600000,savedAge=(+now-Date.parse(data.generatedAt))/3600000;
  const expiredAnalysis=frame.kind==='analysis'&&age>12;
  return {stale:savedAge>12||sourceAge>36||expiredAnalysis,drawable:!expiredAnalysis,earlierForecast:frame.kind==='forecast'&&age>0};
}
// Break a dateline crossing instead of drawing a diagonal across North America.
export function frontLinePath(geometry,project){
  const lines=geometry.type==='MultiLineString'?geometry.coordinates:[geometry.coordinates];
  return lines.map(points=>points.map((p,i)=>{const [x,y]=project(p),move=i===0||Math.abs(p[0]-points[i-1][0])>180;return (move?'M':'L')+x.toFixed(2)+','+y.toFixed(2);}).join('')).join('');
}
