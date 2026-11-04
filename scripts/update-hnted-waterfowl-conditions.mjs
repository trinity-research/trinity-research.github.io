// Bounded manual refresh of public sample observations. No schedule is enabled.
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dateKey,addDays} from '../hnted/engine.js';
import {parseDailyCold,parseUsgsStage,validateConditions} from '../hnted/waterfowl/conditions-data.js';
const root=new URL('../',import.meta.url),out=new URL('hnted/waterfowl/data/',root),raw=new URL('.hnted-runtime/waterfowl/',root);
await Promise.all([mkdir(out,{recursive:true}),mkdir(raw,{recursive:true})]);
const headers={'User-Agent':'HNTED-Waterfowl/0.2 (https://trinity-research.com/hnted/)','Accept':'application/json'};
const allowed=new Set(['www.ncei.noaa.gov','api.waterdata.usgs.gov','mapservices.weather.noaa.gov']);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function get(address,file,{binary=false}={}){
  const url=new URL(address);if(url.protocol!=='https:'||!allowed.has(url.hostname)||url.port||url.username||url.password)throw new Error('Unsupported observation endpoint.');
  if(process.argv.includes('--from-saved')){const meta=JSON.parse(await readFile(new URL(file+'.provenance.json',raw),'utf8')),bytes=new Uint8Array(await readFile(new URL(file,raw)));if(meta.url!==String(url)||meta.sha256!==sha(bytes))throw new Error('Saved response does not match this request and hash.');return {...meta,data:binary?bytes:JSON.parse(new TextDecoder().decode(bytes))};}
  const response=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw new Error('Observation HTTP '+response.status+' at '+url.hostname);
  const bytes=new Uint8Array(await response.arrayBuffer());if(bytes.length>5000000)throw new Error('Observation response exceeds the bounded sample size.');
  const meta={url:String(url),retrievedAt:new Date().toISOString(),sha256:sha(bytes)};
  await writeFile(new URL(file,raw),bytes);await writeFile(new URL(file+'.provenance.json',raw),JSON.stringify(meta,null,2));
  const data=binary?bytes:JSON.parse(new TextDecoder().decode(bytes));if(data.error)throw new Error('Observation provider returned an error.');
  return {...meta,data};
}
const coldSites=[],gauges=[],errors=[],end=addDays(dateKey(new Date(),'America/Chicago'),-1),start=addDays(end,-9);
const cold=[{stationId:'USW00014914',id:'cold-fargo',name:'Fargo, ND'},{stationId:'USW00024025',id:'cold-pierre',name:'Pierre, SD'},{stationId:'USW00014942',id:'cold-omaha',name:'Omaha, NE'}];
try{
  const url=new URL('https://www.ncei.noaa.gov/access/services/data/v1');
  url.search=new URLSearchParams({dataset:'daily-summaries',stations:cold.map(s=>s.stationId).join(','),startDate:start,endDate:end,dataTypes:'TMIN,TMAX,SNOW,SNWD',units:'metric',includeAttributes:'true',includeStationLocation:'true',includeStationName:'true',format:'json'});
  const result=await get(url,'conditions-ncei-daily.json');
  for(const site of cold){try{coldSites.push({...site,...parseDailyCold(result.data,{stationId:site.stationId,units:'metric',start,end}),zone:'America/Chicago',sourceUrl:result.url,retrievedAt:result.retrievedAt,sha256:result.sha256,coordinateSource:'NOAA NCEI daily-summaries station metadata'});}catch(error){errors.push({id:site.id,message:error.message});}}
  console.log('NOAA daily history: '+coldSites.length+' public stations.');
}catch(error){errors.push({id:'ncei-daily',message:error.message});console.log(error.message);}

const usgs='https://api.waterdata.usgs.gov/ogcapi/v1/collections/';
for(const site of [{stationId:'05054000',id:'water-fargo',name:'Red River at Fargo, ND',shortName:'Fargo river'},{stationId:'06891000',id:'water-lecompton',name:'Kansas River at Lecompton, KS',shortName:'Lecompton'},{stationId:'07164500',id:'water-tulsa',name:'Arkansas River at Tulsa, OK',shortName:'Tulsa river'},{stationId:'07381490',id:'water-simmesport',name:'Atchafalaya River at Simmesport, LA',shortName:'Simmesport'}]){
  try{
    const station=await get(usgs+'monitoring-locations/items/USGS-'+site.stationId+'?f=json','conditions-'+site.stationId+'-site.json');
    const latest=await get(usgs+'latest-continuous/items?'+new URLSearchParams({f:'json',monitoring_location_id:'USGS-'+site.stationId,parameter_code:'00065',limit:'10'}),'conditions-'+site.stationId+'-latest.json');
    if(latest.data.links?.some(l=>l.rel==='next'))throw new Error('Truncated latest-series response.');
    const candidates=latest.data.features?.map(f=>f.properties).filter(p=>p.monitoring_location_id==='USGS-'+site.stationId&&p.parameter_code==='00065'&&p.statistic_id==='00011');
    if(candidates?.length!==1)throw new Error('A unique instantaneous stage series was not supplied.');
    const p=candidates[0],seriesId=p.time_series_id;
    const metadata=await get(usgs+'time-series-metadata/items/'+seriesId+'?f=json','conditions-'+site.stationId+'-metadata.json');
    const m=metadata.data.properties;
    if(m?.primary!=='Primary'||m.parameter_code!=='00065'||m.statistic_id!=='00011'||m.computation_identifier!=='Instantaneous'||m.unit_of_measure!==p.unit_of_measure)throw new Error('Stage series metadata does not match.');
    const last=Date.parse(p.time);if(!Number.isFinite(last))throw new Error('No stage observation time.');
    const range=new Date(last-48*3600000).toISOString()+'/'+new Date(last).toISOString();
    const history=await get(usgs+'continuous/items?'+new URLSearchParams({f:'json',time_series_id:seriesId,time:range,limit:'1000'}),'conditions-'+site.stationId+'-history.json');
    if(history.data.links?.some(l=>l.rel==='next'))throw new Error('Truncated stage history; previous snapshot is not extrapolated.');
    const normalized=parseUsgsStage(history.data,{stationId:site.stationId,seriesId}),[lon,lat]=station.data.geometry?.coordinates??[];
    if(Date.parse(normalized.points.at(-1).time)!==last)throw new Error('History does not include the selected latest observation.');
    gauges.push({...site,officialName:station.data.properties.monitoring_location_name,lat,lon,zone:'America/Chicago',parameterCode:'00065',seriesId,...normalized,sourcePage:'https://waterdata.usgs.gov/monitoring-location/USGS-'+site.stationId+'/',sourceUrl:history.url,retrievedAt:history.retrievedAt,sha256:history.sha256,provenance:{station:{url:station.url,sha256:station.sha256},series:{url:metadata.url,sha256:metadata.sha256},latest:{url:latest.url,sha256:latest.sha256}},scope:'A public river gauge at this named location. Local channels, reservoirs, and pumping can affect how this relates to nearby wetlands.'});
    console.log(site.name+': '+normalized.points.length+' stage observations.');
  }catch(error){errors.push({id:site.id,message:error.message});console.log(site.name+': '+error.message);}
}

let snowAnalysis=null;
try{
  const base='https://mapservices.weather.noaa.gov/raster/rest/services/snow/NOHRSC_Snow_Analysis/MapServer';
  const footprintUrl=base+'/2/query?'+new URLSearchParams({where:'1=1',outFields:'objectid,name,idp_validtime,idp_issueddate,idp_ingestdate',returnGeometry:'false',f:'json'});
  const before=await get(footprintUrl,'conditions-nohrsc-before.json'),a=before.data.features?.[0]?.attributes;
  if(before.data.features?.length!==1||!Number.isFinite(a?.idp_validtime)||!Number.isFinite(a?.idp_issueddate))throw new Error('Snow analysis valid time is unavailable.');
  const R=6378137,scale=R*Math.PI/180/24,north=R*Math.log(Math.tan(Math.PI/4+53*Math.PI/360)),extent=[-115*Math.PI/180*R,north-760*scale,-75*Math.PI/180*R,north];
  const exportUrl=base+'/export?'+new URLSearchParams({bbox:extent.join(','),bboxSR:'3857',imageSR:'3857',size:'960,760',transparent:'true',format:'png32',layers:'show:3',f:'image'});
  const raster=await get(exportUrl,'conditions-nohrsc-map.png',{binary:true});
  if(![137,80,78,71,13,10,26,10].every((n,i)=>raster.data[i]===n))throw new Error('Snow map is not a PNG.');
  const after=await get(footprintUrl,'conditions-nohrsc-after.json'),b=after.data.features?.[0]?.attributes;
  if(a.objectid!==b?.objectid||a.idp_validtime!==b.idp_validtime)throw new Error('Snow analysis changed during refresh; retry the manual refresh.');
  const legend=await get(base+'/legend?f=json','conditions-nohrsc-legend.json'),depth=legend.data.layers?.find(l=>l.layerId===3);
  if(!depth?.legend?.length)throw new Error('Snow-depth legend unavailable.');
  const image='snow-analysis-'+raster.sha256.slice(0,12)+'.png';await writeFile(new URL(image,out),raster.data);
  snowAnalysis={id:'nohrsc-snow-analysis',name:'NOAA National Snow Analysis',validAt:new Date(a.idp_validtime).toISOString(),issuedAt:new Date(a.idp_issueddate).toISOString(),ingestedAt:new Date(a.idp_ingestdate).toISOString(),retrievedAt:raster.retrievedAt,sourceUrl:base,metadataUrl:footprintUrl,exportUrl,metadataSha256:before.sha256,image:'data/'+image,sha256:raster.sha256,extent3857:extent,width:960,height:760,unit:'in',method:'NOHRSC modeled snow-depth analysis assimilating observations. Latest available U.S. raster; independent of forecast dates.',legend:depth.legend.map(l=>({label:l.label,imageData:l.imageData,contentType:l.contentType}))};
  console.log('NOAA snow analysis valid '+snowAnalysis.validAt+'.');
}catch(error){errors.push({id:'nohrsc-snow-analysis',message:error.message});console.log('Snow map: '+error.message);}

if(coldSites.length<2||gauges.length<2)throw new Error('Insufficient ground-data coverage; keeping the previous conditions snapshot.');
const result=validateConditions({schemaVersion:1,generatedAt:new Date().toISOString(),mode:'manually-refreshed-public-observations',coldSites,gauges,snowAnalysis,errors,attribution:[{name:'NOAA NCEI daily summaries',url:'https://www.ncei.noaa.gov/access'},{name:'NOAA National Snow Analysis',url:'https://www.nohrsc.noaa.gov/nsa/'},{name:'U.S. Geological Survey',url:'https://api.waterdata.usgs.gov/docs/ogcapi/'}]});
await writeFile(new URL('conditions.pending.json',out),JSON.stringify(result)+'\n');await rename(new URL('conditions.pending.json',out),new URL('conditions.json',out));
console.log('Saved ground conditions. No schedule or migration rating enabled.');
