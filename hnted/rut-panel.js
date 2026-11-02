import {lookupRut,rutOutlook} from './rut.js';
const $=id=>document.getElementById(id);
let context=null,bundle=null,loading=null,failed=false;
let choices={};try{const saved=JSON.parse(localStorage.getItem('hnted-rut-regions')??'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))choices=saved;}catch{}
const spotKey=location=>location.lat.toFixed(5)+','+location.lon.toFixed(5);
const esc=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clockDate=key=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(key+'T12:00:00Z'));
const range=(a,b)=>{
  const years=a.slice(0,4)!==b.slice(0,4)||a.slice(0,4)!==context.key.slice(0,4);
  const format=key=>years?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(key+'T12:00:00Z')):clockDate(key);
  return `${format(a)} - ${format(b)}`;
};

export function updateRutPanel(next){
  context=next;
  if(!bundle&&!loading&&!failed)load();
  render();
}

async function load(){
  loading=Promise.all(['us-states.json','rut-profiles.json','indiana-rut.geojson','state-priorities.json','ga-rut.geojson','nc-rut.geojson','texas-ecoregions.geojson','texas-study-peaks.json','rut-map-regions.json'].map(async name=>{
    const response=await fetch(new URL('./data/'+name,import.meta.url));
    if(!response.ok)throw new Error('Rut data unavailable');return response.json();
  }));
  render();
  try{
    const [states,profiles,indiana,priorities,ga,nc,txRegions,txStudy,rasters]=await loading;
    if(!Array.isArray(states.states)||!Array.isArray(profiles.profiles)||!Array.isArray(indiana.features)||!Array.isArray(priorities.states))throw new Error('Invalid local rut data');
    bundle={states:states.states,profiles,indiana,priorities,counties:{GA:ga,NC:nc},texas:{regions:txRegions,study:txStudy},rasters};failed=false;
  }catch{failed=true;}
  finally{loading=null;render();}
}

function render(){
  if(!context||!$('rut-card'))return;
  $('daily-title').textContent=context.lunarTitle;
  $('daily-copy').textContent=context.lunarCopy;
  $('rut-quality').textContent='';$('rut-card').dataset.phase='unavailable';
  $('rut-top-window').hidden=true;$('rut-information').hidden=true;
  $('rut-status').hidden=false;$('rut-status').textContent=loading?'Reading local rut information...':failed?'Rut information could not load. Refresh this page to retry.':'';
  if(!bundle)return;
  const choiceId=choices[spotKey(context.location)]??null;
  const match=lookupRut(context.location,bundle,choiceId);
  $('rut-region').textContent=match.regionLabel??match.state?.name??'Selected hunting spot';
  $('rut-region-picker-wrap').hidden=!match.choices||match.choices.length<2;
  if(match.choices?.length>1){$('rut-region-picker').innerHTML='<option value="">Use the automatic regional match</option>'+match.choices.map(c=>`<option value="${esc(c.id)}">${esc(c.part)}${c.peak?' · peak '+esc(c.peak.replace('-','/')):''}</option>`).join('');$('rut-region-picker').value=choiceId??'';}
  $('rut-details-link').hidden=!match.source;
  if(match.source){$('rut-details-link').href=match.source.source;$('rut-details-link').textContent='Open '+match.source.label+' →';}
  const activeStates=new Set([...bundle.profiles.profiles.map(p=>p.state),'GA','NC','TX',...bundle.rasters.maps.map(m=>m.state)]);
  const target=bundle.priorities.states;
  $('rut-coverage').innerHTML=target.map(s=>`<li><strong>${esc(s.state)}${s.code==='KS'?' · added by request':''}</strong><span>${activeStates.has(s.code)?['GA','NC'].includes(s.code)?'County data connected':bundle.rasters.maps.some(m=>m.state===s.code)?'Regional source map connected':s.code==='TX'?'Ecological-region study data connected':'Seasonal baseline connected':'Regional import in progress'}</span><small>${s.harvest.toLocaleString()} deer harvested${s.deerHunters!=null?' · '+s.deerHunters.toLocaleString()+' deer hunters':' · deer-hunter count unavailable'}</small></li>`).join('');
  if(match.status!=='covered'){
    $('rut-status').textContent=match.message??(match.status==='ambiguous'?'This spot is on or near a mapped boundary. A more specific regional match is needed.':match.source?.reason??'No verified rut calendar is connected for this spot yet.');
    $('rut-model').textContent='The launch list includes the original 20 high-harvest states plus Kansas. County, mapped-region, and broad seasonal estimates have different precision. Source boundaries or missing samples can leave an individual spot unresolved. Indiana county data is also connected.';
    return;
  }
  const p=match.profile,outlook=rutOutlook(context.key,p);
  $('rut-status').hidden=true;$('rut-information').hidden=false;
  $('rut-region').textContent=p.region;
  $('rut-quality').textContent=p.quality;
  $('rut-source').textContent=p.sourceLabel+' · '+p.sourceEdition;
  $('rut-source').href=p.source;
  $('rut-evidence').textContent=p.original??'The county dataset provides a long-term average peak date using deer-vehicle collisions as a rut indicator.';
  $('rut-interpretation').textContent=p.interpretation;
  const active=outlook.phase==='active',approaching=outlook.phase==='approaching',tending=outlook.phase==='tending';
  $('rut-card').dataset.phase=outlook.phase;
  $('rut-phase').textContent=p.suppressHeadline?'SOURCE TIMING HAS LIMITED SUPPORT':active?'RUT OPPORTUNITY WINDOW':approaching?'RUT WINDOW APPROACHING':tending?'BREEDING / TENDING PERIOD':outlook.phase==='past'?'PAST THE MAIN PLANNING WINDOW':'SEASONAL RUT OUTLOOK';
  $('rut-range').textContent=outlook.start&&outlook.end?range(outlook.start,outlook.end):'Timing unavailable';
  $('rut-timing-note').textContent=approaching?`Starts in ${outlook.daysUntil} ${outlook.daysUntil===1?'day':'days'} from the selected date.`:active?`The selected date falls in HNTED's seasonal planning window.${outlook.breeding?' The source breeding range is also active; bucks tending does may cover less ground.':''}`:tending?'The source describes a tending phase here. Bucks may stay close to individual does, so visible movement can ease.':outlook.phase==='past'?`The planning window ended ${outlook.daysSince} ${outlook.daysSince===1?'day':'days'} before this date. Other breeding can still occur.`:'Showing the next seasonal planning window. Individual properties and deer can differ.';
  $('rut-model').textContent='This outlook uses recurring regional timing. HNTED adds a 14-day searching lead to breeding ranges or seven days either side of a single peak date. Those are planning assumptions. The lunar index remains a separate calculation.';
  if(!p.suppressHeadline&&(active||approaching||tending)){
    $('rut-top-window').hidden=false;
    $('rut-top-badge').textContent=active?'RUT WINDOW ACTIVE':approaching?`RUT WINDOW IN ${outlook.daysUntil} ${outlook.daysUntil===1?'DAY':'DAYS'}`:'BREEDING / TENDING';
    $('rut-top-summary').textContent=p.region+' · '+range(outlook.start,outlook.end);
    $('daily-title').textContent=active?'Likely higher buck activity.':approaching?'Rut window approaching.':'Peak breeding can look quieter.';
    $('daily-copy').textContent=active?'Regional rut timing makes this a period worth watching for bucks. Use the wind and recent observations to choose your sit.':approaching?'A seasonal movement window is getting close. This is a good time to plan your sits and watch for changes in daylight visits.':'Bucks staying with receptive does can travel less. The rut can be underway even when you see less chasing.';
  }
}

if(typeof document!=='undefined')$('rut-region-picker')?.addEventListener?.('change',event=>{
  if(!context)return;const key=spotKey(context.location);
  if(event.target.value)choices[key]=event.target.value;else delete choices[key];
  try{localStorage.setItem('hnted-rut-regions',JSON.stringify(choices));}catch{}
  render();
});
