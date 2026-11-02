const DAY=86400000;
const stamp=key=>Date.parse(key+'T12:00:00Z');
const shift=(key,n)=>new Date(stamp(key)+n*DAY).toISOString().slice(0,10);
const days=(from,to)=>Math.round((stamp(to)-stamp(from))/DAY);

export function pointInRings(lon,lat,rings){
  let inside=false;
  for(const ring of rings){
    let part=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const [x,y]=ring[i],[a,b]=ring[j];
      // Boundaries are included; callers retain ambiguity between adjacent areas.
      const cross=(lon-x)*(b-y)-(lat-y)*(a-x);
      if(Math.abs(cross)<1e-10&&lon>=Math.min(x,a)&&lon<=Math.max(x,a)&&lat>=Math.min(y,b)&&lat<=Math.max(y,b))return true;
      if((y>lat)!==(b>lat)&&lon<(a-x)*(lat-y)/(b-y)+x)part=!part;
    }
    if(part)inside=!inside;
  }
  return inside;
}

export function stateAt(location,states){
  if(!Number.isFinite(location?.lat)||!Number.isFinite(location?.lon))return [];
  return states.filter(s=>location.lon>=s.bounds[0]&&location.lon<=s.bounds[2]&&location.lat>=s.bounds[1]&&location.lat<=s.bounds[3]&&pointInRings(location.lon,location.lat,s.rings));
}

export function inFeature(location,geometry){
  if(geometry?.type==='Polygon')return pointInRings(location.lon,location.lat,geometry.coordinates);
  if(geometry?.type==='MultiPolygon')return geometry.coordinates.some(rings=>pointInRings(location.lon,location.lat,rings));
  return false;
}

export function rasterValue(location,map){
  const x=Math.floor((location.lon-map.west)/map.step),y=Math.floor((map.north-location.lat)/map.step);
  if(x<0||y<0||x>=map.width||y>=map.height)return 0;
  let offset=0;
  for(const [count,value] of map.rows[y]){if(x<offset+count)return value;offset+=count;}
  return 0;
}

function geographicSource(layer,reason){return {source:layer.source,label:layer.sourceLabel,reason};}

function countyRut(location,state,layer){
  const found=layer.features.filter(f=>inFeature(location,f.geometry));
  if(found.length!==1)return {status:found.length?'ambiguous':'uncovered',state,source:geographicSource(layer,'A single source county could not be matched at this point.')};
  const p=found[0].properties,region=`${p.county} County, ${state.name}`;
  if(layer.state==='NC'&&!p.peak)return {status:'uncovered',state,regionLabel:region,source:geographicSource(layer,`The source lists ${p.samples} reproductive sample for this county and no peak date. No date has been assigned.`)};
  const low=p.lowSample===true;
  const profile={id:layer.state.toLowerCase()+'-'+p.GEOID,state:state.code,region,kind:layer.kind==='movement'?'movement':'breeding',source:layer.source,sourceLabel:layer.sourceLabel,sourceEdition:layer.edition,
    quality:layer.state==='NC'?`County conception estimate · ${p.samples} reproductive samples`:low?'County proxy · low sample; timing uncertain':'County movement proxy · historical data',
    original:layer.state==='NC'?`The agency's county estimate is ${p.originalDate}, based on ${p.samples} reproductive samples.`:`The agency map gives ${p.originalRange} as this county's peak movement week, inferred from historical collisions.`,
    interpretation:layer.state==='NC'?`The source date is an estimated conception peak. HNTED uses seven days on either side as a planning window. Sample size affects precision; this is not a measured movement interval.`:`The study pooled each county with its neighbors and smoothed weekly collisions. This is a historical movement proxy.${low?' The study identifies fewer than 100 pooled records here, so the app does not make a high-activity headline from this estimate.':''}`,
    suppressHeadline:low};
  if(p.peak)profile.peak=p.peak;else {profile.start=p.start;profile.end=p.end;}
  return {status:'covered',state,profile};
}

const texasNames={'Gulf Prairies':'Gulf Prairies and Marshes','Post Oak Savanah':'Post Oak Savannah','Piney Woods':'Pineywoods'};
function texasRut(location,state,texas,choiceId){
  const found=texas.regions.features.filter(f=>inFeature(location,f.geometry));
  if(found.length!==1)return {status:found.length?'ambiguous':'uncovered',state,source:geographicSource(texas.study,'An ecological region could not be matched at this point.')};
  const name=found[0].properties.Name,region=texasNames[name]??name;
  const choices=texas.study.choices.filter(c=>c.region===region);
  const selected=choices.find(c=>c.id===choiceId),peaks=choices.map(c=>c.peak).sort();
  if(!peaks.length)return {status:'uncovered',state,regionLabel:name+', Texas',source:geographicSource(texas.study,'This ecological region has no standalone study-area peak in the imported study. No neighboring region has been substituted.')};
  const profile={id:selected?.id??'tx-'+found[0].properties.RegionNum,state:'TX',region:region+', Texas'+(selected?' · '+selected.part:''),kind:'breeding',source:texas.study.source,sourceLabel:texas.study.sourceLabel,sourceEdition:texas.study.edition,
    quality:selected?'Historical study area · selected for this spot':'Broad envelope of regional study peaks',
    original:choices.map(c=>`${c.part}: ${c.peak.replace('-','/')}`).join('; ')+'. These are study-area breeding peaks, not the whole breeding season.',
    interpretation:selected?'You selected a named study area within the detected ecological region. HNTED uses seven days on either side of its published peak as a planning window. The study did not supply exact subregion boundary polygons.':'HNTED uses the earliest through latest published study-area peaks in this ecological region as a broad envelope, with a 14-day earlier planning lead. This does not mean every part of the region peaks throughout that range. Select a study area only if you can match it using the source map.'};
  if(selected||peaks.length===1)profile.peak=selected?.peak??peaks[0];else {profile.start=peaks[0];profile.end=peaks.at(-1);}
  return {status:'covered',state,profile,choices};
}

export function lookupRut(location,bundle,choiceId=null){
  const matches=stateAt(location,bundle.states);
  if(matches.length!==1)return {status:matches.length?'ambiguous':'uncovered',matches};
  const state=matches[0];
  const county=bundle.counties?.[state.code];
  if(county)return countyRut(location,state,county);
  if(state.code==='TX'&&bundle.texas)return texasRut(location,state,bundle.texas,choiceId);
  const raster=bundle.rasters?.maps?.find(m=>m.state===state.code);
  if(raster){
    const choices=raster.classes.map((p,i)=>({id:raster.id+'-'+(i+1),part:'Agency map band '+p.label}));
    const selected=choices.findIndex(c=>c.id===choiceId);
    const value=selected>=0?selected+1:rasterValue(location,raster);
    const source=geographicSource(raster,'The source map does not resolve a reliable single region at this spot. Check the agency map.');
    if(value===0)return {status:'uncovered',state,source,choices};
    if(value>=16)return {status:'ambiguous',state,source,choices,message:'The source map cannot distinguish one reliable date band here. You can match this spot on the agency map and select its band below.'};
    const period=raster.classes[value-1];
    return {status:'covered',state,choices,profile:{...raster.profile,id:raster.id+'-'+value,state:state.code,start:period.start,end:period.end,region:`${state.name} mapped breeding region${selected>=0?' · matched by you':''}`,source:raster.source,sourceLabel:raster.sourceLabel,
      quality:selected>=0?'Agency map band · selected for this spot':raster.profile.quality,
      original:selected>=0?`You matched this spot to the agency map's ${period.label} breeding-date band.`:`The agency map places this area in its ${period.label} breeding-date band.`,
      interpretation:raster.profile.interpretation+(selected>=0?' You selected this band from the agency map for the current spot. The app has not independently confirmed that manual match.':' Near a source date-band boundary, the app withholds a single-window prediction.')}};
  }
  if(state.code==='IN'){
    const counties=bundle.indiana.features.filter(f=>inFeature(location,f.geometry));
    if(counties.length!==1)return {status:counties.length?'ambiguous':'uncovered',state};
    const p=counties[0].properties;
    const match=/^(\d{1,2})-([A-Za-z]{3})$/.exec(p.DayMonth??'');
    const month={Sep:'09',Oct:'10',Nov:'11',Dec:'12',Jan:'01',Feb:'02'}[match?.[2]];
    if(!month)return {status:'uncovered',state};
    return {status:'covered',state,profile:{...bundle.profiles.indiana,id:'in-'+p.GEOID,state:'IN',region:p.NAME+' County, Indiana',peak:month+'-'+match[1].padStart(2,'0')}};
  }
  const profile=bundle.profiles.profiles.find(p=>p.state===state.code);
  if(profile)return {status:'covered',state,profile};
  return {status:'uncovered',state,source:bundle.profiles.regionalSources.find(p=>p.state===state.code)};
}

function validMonthDay(mmdd,year){
  if(!/^\d{2}-\d{2}$/.test(mmdd??''))return null;
  const key=year+'-'+mmdd;
  return Number.isFinite(stamp(key))&&new Date(stamp(key)).toISOString().slice(0,10)===key?key:null;
}

export function annualWindow(profile,year){
  let start,end,breedingStart=null,breedingEnd=null;
  if(profile.peak){
    const peak=validMonthDay(profile.peak,year);if(!peak)return null;
    start=shift(peak,-7);end=shift(peak,7);
  }else{
    const from=validMonthDay(profile.start,year),to=validMonthDay(profile.end,year+(profile.end<profile.start?1:0));
    if(!from||!to)return null;
    if(profile.kind==='breeding'){breedingStart=from;breedingEnd=to;start=shift(from,-14);end=to;}
    else {start=from;end=to;}
  }
  return {start,end,breedingStart,breedingEnd};
}

export function rutOutlook(key,profile){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(key)||!Number.isFinite(stamp(key))||new Date(stamp(key)).toISOString().slice(0,10)!==key)throw new Error('Invalid rut outlook date');
  const year=Number(key.slice(0,4));
  const candidates=[year-1,year,year+1].map(y=>annualWindow(profile,y)).filter(Boolean);
  if(!candidates.length)return {phase:'unavailable'};
  const active=candidates.find(w=>key>=w.start&&key<=w.end);
  const next=candidates.filter(w=>w.start>key).sort((a,b)=>a.start.localeCompare(b.start))[0];
  const previous=candidates.filter(w=>w.end<key).sort((a,b)=>b.end.localeCompare(a.end))[0];
  const tendingStart=validMonthDay(profile.tendingStart,year),tendingEnd=validMonthDay(profile.tendingEnd,year);
  if(tendingStart&&tendingEnd&&key>=tendingStart&&key<=tendingEnd)return {phase:'tending',start:tendingStart,end:tendingEnd,next};
  if(active)return {phase:'active',...active,breeding:!!active.breedingStart&&key>=active.breedingStart};
  if(next&&days(key,next.start)<=14)return {phase:'approaching',...next,daysUntil:days(key,next.start)};
  if(previous&&days(previous.end,key)<=14)return {phase:'past',...previous,daysSince:days(previous.end,key),next};
  return {phase:'outside',...(next??previous),next};
}
