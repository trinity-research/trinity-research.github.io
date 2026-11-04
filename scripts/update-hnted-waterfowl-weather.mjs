// Manual prototype refresh. No scheduled job is enabled by this script.
import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseNwsHourly,parseEcccHourly} from '../hnted/waterfowl/weather-data.js';
const root=new URL('../',import.meta.url),out=new URL('hnted/waterfowl/data/',root);
const towns=JSON.parse(await readFile(new URL('hnted/data/us-towns.json',root),'utf8'));
const samples=[['Fargo','ND'],['Pierre','SD'],['Omaha','NE'],['Great Bend','KS'],['Oklahoma City','OK'],['Memphis','TN'],['Shreveport','LA']].map(([name,state])=>{const p=towns.places.find(p=>p[0]===name&&p[1]===state);if(!p)throw new Error(`Town missing: ${name}`);return {id:state.toLowerCase(),name:`${name}, ${state}`,lat:p[2],lon:p[3],zone:p[4],provider:'NWS',coordinateSource:'Bundled GeoNames cities500, CC BY 4.0'};});
const headers={'User-Agent':'HNTED-Waterfowl/0.1 (https://trinity-research.com/hnted/)',Accept:'application/geo+json'};
const allowed=new Set(['api.weather.gov','api.weather.gc.ca']);
const raw=new URL('.hnted-runtime/waterfowl/',root);
await mkdir(raw,{recursive:true});
async function get(address,file){
  const url=new URL(address);if(url.protocol!=='https:'||!allowed.has(url.hostname)||url.username||url.password||url.port)throw new Error('Unsupported weather endpoint.');
  let response;
  for(let attempt=0;attempt<3;attempt++){
    response=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(20000)});
    if(response.ok)break;
    if(attempt===2||![429,500,502,503,504].includes(response.status))throw new Error(`Weather HTTP ${response.status}: ${url.pathname}`);
    await new Promise(resolve=>setTimeout(resolve,1200*(attempt+1)));
  }
  const text=await response.text();await writeFile(new URL(file,raw),text);
  return {data:JSON.parse(text),url:String(url),retrievedAt:new Date().toISOString(),sha256:createHash('sha256').update(text).digest('hex')};
}
const sites=[],errors=[];
for(const site of samples){
  try{
    const p=await get(`https://api.weather.gov/points/${site.lat.toFixed(4)},${site.lon.toFixed(4)}`,`${site.id}-point.json`);
    const h=await get(p.data.properties.forecastHourly,`${site.id}-hourly.json`),normalized=parseNwsHourly(h.data);
    sites.push({...site,...normalized,sourceUrl:h.url,retrievedAt:h.retrievedAt,sha256:h.sha256,geometry:h.data.geometry,gridUrl:p.data.properties.forecastGridData,locationDescription:p.data.properties.relativeLocation?.properties?.city??null});
    console.log(`${site.name}: ${normalized.points.length} NWS periods.`);
  }catch(error){errors.push({id:site.id,name:site.name,error:error.message});console.log(`${site.name}: unavailable (${error.message}).`);}
}
// City Page Weather's hourly horizon is short; later days remain unavailable.
for(const sample of [{expected:'Winnipeg',bbox:'-97.4,49.7,-96.9,50.1',zone:'America/Winnipeg'},{expected:'Regina',bbox:'-104.8,50.3,-104.4,50.6',zone:'America/Regina'}]){
  try{
    const h=await get(`https://api.weather.gc.ca/collections/citypageweather-realtime/items?bbox=${sample.bbox}&limit=5&f=json`,`${sample.expected.toLowerCase()}.json`);
    const feature=h.data.features?.find(f=>f.properties.name?.en===sample.expected);if(!feature)throw new Error('Expected Canadian city not returned.');
    const normalized=parseEcccHourly(feature),[lon,lat]=feature.geometry.coordinates;
    sites.push({id:feature.properties.identifier,name:`${sample.expected}, Canada`,lat,lon,zone:sample.zone,provider:'ECCC',...normalized,sourceUrl:h.url,sourcePage:feature.properties.url?.en,retrievedAt:h.retrievedAt,sha256:h.sha256,coordinateSource:'ECCC City Page Weather feature geometry',geometry:feature.geometry});
    console.log(`${sample.expected}: ${normalized.points.length} ECCC hours.`);
  }catch(error){errors.push({id:sample.expected,error:error.message});console.log(`${sample.expected}: unavailable (${error.message}).`);}
}
if(sites.filter(s=>s.provider==='NWS').length<5)throw new Error('Insufficient U.S. pilot coverage; keeping the previous snapshot.');
const data={schemaVersion:1,generatedAt:new Date().toISOString(),mode:'manually-refreshed-snapshot',scope:'Nine named sample points; not a continuous weather grid or a migration forecast.',units:{temperature:'C',wind:'km/h',time:'UTC milliseconds'},attribution:[{name:'National Weather Service',url:'https://www.weather.gov/documentation/services-web-api'},{name:'Data Source: Environment and Climate Change Canada',url:'https://eccc-msc.github.io/open-data/licence/readme_en/'}],limitations:['No migration score or arrival forecast is calculated.','This file contains forecasts; dated snow analysis and observed cold/river history are bundled separately in conditions.json.','No winds aloft or mapped front product is connected.','NWS gridded pressure was empty in the audited sample; no pressure values are inferred.','Canadian City Page hourly coverage is about 24 hours; missing later days stay unavailable.','ECCC timestamped forecasts are represented as one-hour samples, not provider-defined accumulation intervals.'],sites,errors};
await mkdir(out,{recursive:true});const temporary=new URL('weather.pending.json',out);
await writeFile(temporary,JSON.stringify(data)+'\n');await rename(temporary,new URL('weather.json',out));
console.log(`Saved ${sites.length} verified weather samples. No schedule enabled.`);
