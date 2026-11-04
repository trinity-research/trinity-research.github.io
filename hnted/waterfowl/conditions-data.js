import {addDays} from '../engine.js';
const numeric=value=>['number','string'].includes(typeof value)&&String(value).trim()!==''&&Number.isFinite(Number(value))?Number(value):null;
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;

// The NCEI access service's metric output already uses Celsius and millimeters.
// Its flags differ from the scaling of the original fixed-width .dly files.
export function parseDailyCold(rows,{stationId,units,start,end}={}){
  if(units!=='metric'||!stationId||!validDate(start)||!validDate(end)||start>end)throw new Error('An explicit metric station/date request is required.');
  if(!Array.isArray(rows))throw new Error('Expected NCEI daily rows.');
  const selected=rows.filter(r=>r.STATION===stationId&&validDate(r.DATE)&&r.DATE>=start&&r.DATE<=end).sort((a,b)=>a.DATE.localeCompare(b.DATE));
  if(!selected.length)throw new Error('No daily observations for this station.');
  if(new Set(selected.map(r=>r.DATE)).size!==selected.length)throw new Error('Duplicate daily station dates.');
  const field=(row,key)=>{
    const raw=row[key+'_ATTRIBUTES']??null,[measurement='',quality='']=(raw??'').split(',');
    const value=numeric(row[key]),trace=measurement==='T'&&quality==='';
    return {value:quality||['P','A'].includes(measurement)||trace||value===-9999?null:value,trace,raw};
  };
  const days=selected.map(row=>{
    const min=field(row,'TMIN'),max=field(row,'TMAX'),snow=field(row,'SNOW'),depth=field(row,'SNWD');
    return {date:row.DATE,minC:min.value,maxC:max.value,snowfallMm:snow.value!==null&&snow.value>=0?snow.value:null,snowDepthMm:depth.value!==null&&depth.value>=0?depth.value:null,snowfallTrace:snow.trace,snowDepthTrace:depth.trace,flags:{TMIN:min.raw,TMAX:max.raw,SNOW:snow.raw,SNWD:depth.raw}};
  });
  const station=selected.at(-1),lat=numeric(station.LATITUDE),lon=numeric(station.LONGITUDE);
  if(lat===null||lon===null||Math.abs(lat)>90||Math.abs(lon)>180)throw new Error('Station coordinates are unavailable.');
  return {stationId,officialName:station.NAME,lat,lon,requestedStart:start,requestedEnd:end,days};
}

export function summarizeCold(site){
  const days=site.days??[],last=days.at(-1),lows=days.filter(d=>typeof d.minC==='number'),highs=days.filter(d=>typeof d.maxC==='number');
  let expectedDays=0;
  for(let d=site.requestedStart;validDate(d)&&d<=site.requestedEnd&&expectedDays<366;d=addDays(d,1))expectedDays++;
  return {last,reportedDays:days.length,expectedDays,lowDays:lows.length,belowFreezingDays:lows.filter(d=>d.minC<0).length,highDays:highs.length,allDayBelowFreezing:highs.filter(d=>d.maxC<0).length};
}

export function parseUsgsStage(payload,{stationId,seriesId}={}){
  if(!stationId||!seriesId||!Array.isArray(payload?.features))throw new Error('A USGS station and series are required.');
  const rows=payload.features.map(f=>f.properties).filter(p=>p?.monitoring_location_id==='USGS-'+stationId&&p.time_series_id===seriesId&&p.parameter_code==='00065'&&p.statistic_id==='00011'&&Number.isFinite(Date.parse(p.time)));
  if(!rows.length)throw new Error('No instantaneous river-stage observations.');
  const units=[...new Set(rows.map(p=>p.unit_of_measure))];
  if(units.length!==1||!['ft','m'].includes(units[0]))throw new Error('Unsupported or mixed river-stage units.');
  const points=rows.map(p=>({time:new Date(p.time).toISOString(),value:numeric(p.value),rawValue:p.value??null,approvalStatus:p.approval_status??'Unknown',qualifier:p.qualifier??null})).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time));
  if(new Set(points.map(p=>p.time)).size!==points.length)throw new Error('Duplicate stage observation timestamps.');
  return {unit:units[0],points};
}

// Match elapsed time in this station's same series and unit, never row position.
export function stageChange(gauge,{hours=24,toleranceMinutes=30}={}){
  const latest=gauge.points?.at(-1);if(!latest||typeof latest.value!=='number'||latest.qualifier)return null;
  const target=Date.parse(latest.time)-hours*3600000;
  const prior=gauge.points.filter(p=>typeof p.value==='number'&&!p.qualifier&&Date.parse(p.time)<Date.parse(latest.time)).sort((a,b)=>Math.abs(Date.parse(a.time)-target)-Math.abs(Date.parse(b.time)-target))[0];
  if(!prior||Math.abs(Date.parse(prior.time)-target)>toleranceMinutes*60000)return null;
  return {value:latest.value-prior.value,hours:(Date.parse(latest.time)-Date.parse(prior.time))/3600000,priorTime:prior.time,latestTime:latest.time};
}

export function validateConditions(data){
  if(!Array.isArray(data?.coldSites)||!Array.isArray(data?.gauges))throw new Error('Invalid ground-conditions snapshot.');
  const ids=new Set();
  for(const site of [...data.coldSites,...data.gauges]){
    if(!site.id||ids.has(site.id)||!site.name)throw new Error('Duplicate or missing observation-site identifier.');ids.add(site.id);
    if(!Number.isFinite(site.lat)||!Number.isFinite(site.lon)||Math.abs(site.lat)>90||Math.abs(site.lon)>180)throw new Error('Invalid observation coordinates.');
    for(const key of ['sourceUrl','sourcePage']){if(!site[key])continue;const url=new URL(site[key]);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Invalid observation source URL.');}
  }
  for(const site of data.coldSites){
    if(!validDate(site.requestedStart)||!validDate(site.requestedEnd)||!site.days?.length)throw new Error('Invalid daily observation period.');
    for(const day of site.days){if(!validDate(day.date)||day.date<site.requestedStart||day.date>site.requestedEnd)throw new Error('Daily observation outside its request.');for(const key of ['minC','maxC','snowfallMm','snowDepthMm'])if(day[key]!==null&&!Number.isFinite(day[key]))throw new Error('Invalid daily value.');}
  }
  for(const gauge of data.gauges){
    if(gauge.parameterCode!=='00065'||!['ft','m'].includes(gauge.unit)||!gauge.points?.length)throw new Error('Invalid river-stage series.');
    for(const point of gauge.points)if(!Number.isFinite(Date.parse(point.time))||(point.value!==null&&!Number.isFinite(point.value)))throw new Error('Invalid river-stage observation.');
  }
  if(data.snowAnalysis){const snow=data.snowAnalysis;if(!Number.isFinite(Date.parse(snow.validAt))||!Number.isFinite(Date.parse(snow.issuedAt))||!/^data\/snow-analysis-[a-f0-9]{12}\.png$/.test(snow.image)||snow.width!==960||snow.height!==760||snow.unit!=='in'||!Array.isArray(snow.legend)||!snow.legend.length||!Array.isArray(snow.extent3857)||snow.extent3857.length!==4||!snow.extent3857.every(Number.isFinite))throw new Error('Invalid dated snow-analysis raster.');}
  return data;
}
