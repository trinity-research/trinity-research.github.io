import {dateKey,zonedTime} from '../engine.js';
import {findTowns} from '../town-search.js';
import {summarizeDay,snapshotState,availableDates,nearestSite} from './weather-data.js';
import {referenceStates,selectReports,validateReports} from './report-data.js';
import {renderReportCards} from './report-cards.js';
import {validateConditions} from './conditions-data.js';
import {renderColdCards,renderGaugeCards} from './conditions-cards.js';
import {updateHealth} from './update-health.js';
import {checksSummary,renderSourceChecks,validateMonitoring} from './report-monitor.js';
import {createSnapshotRefresher} from './snapshot-refresh.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('en-US'):'—';
const temp=value=>typeof value==='number'&&Number.isFinite(value)?`${Math.round(value*9/5+32)}°`:'—';
const mph=value=>typeof value==='number'&&Number.isFinite(value)?Math.round(value/1.609344):null;
const formatDate=(key,options={month:'short',day:'numeric'})=>new Intl.DateTimeFormat('en-US',{...options,timeZone:'UTC'}).format(new Date(key+'T12:00:00Z'));
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const validSpot=p=>{try{return p&&typeof p.name==='string'&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180&&Boolean(new Intl.DateTimeFormat('en',{timeZone:p.zone}));}catch{return false;}};
const savedWaterfowl=read('hnted-waterfowl-spot',null),savedDeer=read('t2h-location',null);
let spot=validSpot(savedWaterfowl)?savedWaterfowl:validSpot(savedDeer)?savedDeer:{name:'Shreveport, LA',lat:32.52515,lon:-93.75018,zone:'America/Chicago',sample:true};
let weather,surveys,geography,conditions,key,dates,selectedSite,view='map',species='mallard',reportState='',reportType='all',zoom=1,viewCentre=[480,380],searchGeneration=0;
let release={audience:'local',automaticWeatherConditions:false,automaticReports:[]},refreshState;
let snapshotRefresher,lastWebsiteCheckAt,websiteCheckFailed=false;
const getJson=async path=>{const response=await fetch(path+'?check='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new Error(`${path}: HTTP ${response.status}`);return response.json();};
const refreshNote=()=>{const failed=refreshState?.jobs?.some(j=>j.status==='failed');return (release.audience==='local'?'Local preview uses the saved files on this computer; the live guide updates separately.':release.automaticWeatherConditions?'Forecast collection targets every '+(release.weatherRefreshIntervalHours??3)+' hours through the cloud routine; scheduled checks can run late.':'This is a saved snapshot, refreshed manually.')+(failed?' Some sources could not refresh; check their saved dates.':'');};
const NS='http://www.w3.org/2000/svg';
function svg(tag,attributes={},text){const element=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attributes))element.setAttribute(k,String(v));if(text!==undefined)element.textContent=text;return element;}
const merc=lat=>Math.log(Math.tan(Math.PI/4+Math.min(80,Math.max(-80,lat))*Math.PI/360));
const project=([lon,lat])=>[(lon+115)*24,(merc(53)-merc(lat))*24*180/Math.PI];
function geoPath(geometry){
  const line=coords=>coords.map((p,i)=>{const [x,y]=project(p);return `${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`;}).join('');
  if(geometry.type==='Polygon')return geometry.coordinates.map(r=>line(r)+'Z').join('');
  if(geometry.type==='MultiPolygon')return geometry.coordinates.map(p=>p.map(r=>line(r)+'Z').join('')).join('');
  if(geometry.type==='LineString')return line(geometry.coordinates);
  if(geometry.type==='MultiLineString')return geometry.coordinates.map(line).join('');
  return '';
}
function dayFor(site){return summarizeDay(site.points,key,site.zone);}
function actualTime(value,zone=spot.zone){if(value===null||value===undefined||value==='')return 'Unavailable';const d=new Date(value);return Number.isFinite(+d)?new Intl.DateTimeFormat('en-US',{timeZone:zone,month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(d):'Unavailable';}
function renderRefreshStatus(){
  if(!weather)return;
  const state=snapshotState(weather),health=updateHealth(weather,conditions,refreshState,{automatic:release.automaticWeatherConditions,weatherRefreshIntervalHours:release.weatherRefreshIntervalHours??3,monitoring:surveys?.monitoring,requireReportChecks:release.automaticReportChecks===true}),updated=actualTime(weather.generatedAt);
  const warning=websiteCheckFailed?'Could not check for updates; showing the last loaded data. ':health.ageHours===null?'The refresh date is unavailable. ':health.overdue?'An update is overdue or a source needs attention. ':health.agedSites.length?health.agedSites.length+' forecast source(s) have older issue dates. ':health.weatherIntervalDue?'A newer forecast collection is due. ':'';
  $('load-status').textContent=`Forecasts saved ${updated}. ${warning}${refreshNote()}${lastWebsiteCheckAt?' Page checked '+actualTime(lastWebsiteCheckAt)+'.':''}`;
  $('load-status').classList.toggle('stale',websiteCheckFailed||health.overdue||state.stale);$('live-guide-link').hidden=release.audience!=='local';
}
const mapSize=()=>matchMedia('(max-width:580px)').matches?[620,840]:[960,760];
function setViewBox(){const [width,height]=mapSize(),w=width/zoom,h=height/zoom;$('field-map').setAttribute('viewBox',`${viewCentre[0]-w/2} ${viewCentre[1]-h/2} ${w} ${h}`);$('field-map').dataset.zoomed=String(zoom>1);}
function renderMap(){
  const map=$('field-map');while(map.lastChild&&map.lastChild.tagName!=='desc')map.lastChild.remove();
  const unitScale=mapSize()[0]/zoom/(map.getBoundingClientRect().width||960);
  map.style.setProperty('--label-size',`${11*unitScale}px`);map.style.setProperty('--value-size',`${12*unitScale}px`);map.style.setProperty('--state-size',`${10*unitScale}px`);
  const base=svg('g',{'aria-hidden':'true'});map.append(base);
  for(const lat of [30,35,40,45,50]){const y=project([-115,lat])[1];base.append(svg('path',{d:`M0,${y}H960`,class:'graticule'}));}
  for(const lon of [-110,-100,-90,-80]){const x=project([lon,40])[0];base.append(svg('path',{d:`M${x},0V760`,class:'graticule'}));}
  for(const f of geography.features)base.append(svg('path',{d:geoPath(f.geometry),class:f.properties.kind==='country'?'land':f.properties.kind==='lake'?'lake':f.properties.kind==='river'?'river':'state','fill-rule':'evenodd'}));
  if($('snow-layer').checked&&conditions?.snowAnalysis)base.append(svg('image',{href:conditions.snowAnalysis.image,x:0,y:0,width:960,height:760,preserveAspectRatio:'none',opacity:.8}));
  for(const f of geography.features.filter(f=>f.properties.kind==='state')){const p=f.properties,[x,y]=project([p.lon,p.lat]);if(x>24&&x<935&&y>60&&y<720)base.append(svg('text',{x,y,class:'state-label'},p.code));}
  const canada=project([-105,51.7]);base.append(svg('text',{x:canada[0],y:canada[1],class:'country-label'},'CANADA'));
  if($('reports-layer').checked){
    const reports=selectReports(surveys.reports,{state:reportState,type:reportType});
    const states=[...new Set(reports.filter(r=>!r.scope.marker).flatMap(referenceStates))];
    for(const code of states){
      const state=geography.features.find(f=>f.properties.code===code);if(!state)continue;
      const group=svg('g',{class:'map-marker reference-marker',role:'link',tabindex:0,'aria-label':state.properties.name+' report reference. State outline is not a survey boundary. Read reports.'});
      group.append(svg('path',{d:geoPath(state.geometry),class:'report-reference'}));
      const [x,y]=project([state.properties.lon,state.properties.lat]);
      const nearWeather=$('weather-layer').checked&&weather.sites.some(s=>{const [sx,sy]=project([s.lon,s.lat]);return Math.hypot(sx-x,sy-y)<65*unitScale;});
      const labelY=Math.min(y+(nearWeather?45:18)*unitScale,715);
      group.append(svg('text',{x,y:labelY,class:'report-label','text-anchor':'middle',style:'font-size:'+10*unitScale+'px'},code+' reports'));
      const action=()=>openReportState(code);group.addEventListener('click',action);group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();action();}});map.append(group);
    }
    for(const report of reports){if(!report.scope.marker)continue;const [x,y]=project([report.scope.marker.lon,report.scope.marker.lat]);const g=svg('g',{class:'map-marker survey-marker',role:'link',tabindex:0,'aria-label':`${report.scope.name}, report week of ${report.reportDate}. Read survey below.`});g.append(svg('rect',{x:x-12,y:y-12,width:24,height:24,rx:3,fill:'#9b793b',class:'marker-ring'}),svg('text',{x:x+18,y:y+4,class:'marker-label'},'Loess Bluffs · report'));const action=()=>openReportState(report.scope.state);g.addEventListener('click',action);g.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();action();}});map.append(g);}
  }
  if($('weather-layer').checked){
    for(const site of weather.sites){const summary=dayFor(site),[x,y]=project([site.lon,site.lat]);const hasTemperature=typeof summary?.minC==='number',cold=hasTemperature&&summary.minC<0,radius=18*unitScale;
      const g=svg('g',{class:`map-marker${selectedSite.id===site.id?' is-selected':''}`,role:'button',tabindex:0,'aria-pressed':String(selectedSite.id===site.id),'aria-label':`${site.name}: ${summary?temp(summary.minC)+' Fahrenheit minimum in '+summary.hours+' available forecast hours':'no hourly coverage on this date'}. Inspect weather.`});
      g.append(svg('circle',{cx:x,cy:y,r:radius,fill:hasTemperature?(cold?'#427684':'#6a8565'):'#999e8f',class:'marker-ring'}),svg('text',{x,y:y+4*unitScale,'text-anchor':'middle',class:'marker-value','aria-hidden':'true'},hasTemperature?temp(summary.minC):'—'));
      const left=site.id==='sd'||site.id==='ks',dx=(left?-1:1)*(radius+8*unitScale);
      g.append(svg('text',{x:x+dx,y:y+4*unitScale,'text-anchor':left?'end':'start',class:'marker-label','aria-hidden':'true'},site.name.split(',')[0]));
      const action=()=>{selectedSite=site;renderWeather();renderMap();renderList();};g.addEventListener('click',action);g.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();action();const target=[...map.querySelectorAll('[aria-pressed]')].find(el=>el.getAttribute('aria-pressed')==='true');target?.focus({preventScroll:true});}});map.append(g);
    }
  }
  if($('spot-layer').checked){
    const [x,y]=project([spot.lon,spot.lat]);
    if(x>0&&x<960&&y>0&&y<760){
      const nearWeather=$('weather-layer').checked&&weather.sites.some(site=>{const [sx,sy]=project([site.lon,site.lat]);return Math.hypot(sx-x,sy-y)<44*unitScale;});
      const px=x-(nearWeather?34*unitScale:0),py=y-(nearWeather?34*unitScale:0),u=unitScale;
      const g=svg('g',{class:'spot-marker','aria-hidden':'true'});
      if(nearWeather)g.append(svg('path',{d:`M${px},${py+2*u}L${x-16*u},${y-16*u}`,fill:'none',stroke:'#253e31','stroke-width':1.5,'vector-effect':'non-scaling-stroke'}));
      g.append(svg('path',{d:`M${px},${py+2*u}l${-8*u},${-16*u}a${10*u},${10*u} 0 1 1 ${16*u},0Z`,fill:'#253e31',stroke:'#fff8e7','stroke-width':2,'vector-effect':'non-scaling-stroke'}),svg('circle',{cx:px,cy:py-19*u,r:2.5*u,fill:'#f4edd2'}),svg('text',{x:px-13*u,y:py-17*u,'text-anchor':'end',style:`font-size:${11*u}px`},'My spot'));
      map.append(g);
    }
  }
  for(const [enabled,sites,symbol] of [[$('snow-layer').checked,conditions?.coldSites??[],'S'],[$('water-layer').checked,conditions?.gauges??[],'W']]){
    if(!enabled)continue;
    for(const site of sites){
      const [x,y]=project([site.lon,site.lat]),near=$('weather-layer').checked&&weather.sites.some(s=>{const [sx,sy]=project([s.lon,s.lat]);return Math.hypot(sx-x,sy-y)<55*unitScale;});
      const px=x+(near?(symbol==='S'?30:-30)*unitScale:0),py=y+(near?(symbol==='S'?-29:29)*unitScale:0),u=unitScale;
      const g=svg('g',{class:'map-marker ground-marker',role:'link',tabindex:0,'aria-label':site.name+(symbol==='S'?' daily cold and snow history.':' river stage.')+' Read dated observations below.'});
      if(near)g.append(svg('path',{d:`M${x},${y}L${px},${py}`,class:'ground-leader'}));
      g.append(svg('circle',{cx:px,cy:py,r:10*u,class:'ground-ring marker-ring'}),svg('text',{x:px,y:py+3.5*u,'text-anchor':'middle',class:'ground-symbol',style:'font-size:'+10*u+'px'},symbol));
      g.append(svg('text',{x:px,y:py-16*u,'text-anchor':'middle',class:'marker-label'},symbol==='S'?'Cold history':site.shortName));
      const action=()=>{const card=$('condition-'+site.id);card?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});card?.focus({preventScroll:true});};
      g.addEventListener('click',action);g.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();action();}});map.append(g);
    }
  }
  $('snow-status').hidden=!$('snow-layer').checked;
  $('snow-status').textContent=conditions?.snowAnalysis?'NOAA snow analysis · '+actualTime(conditions.snowAnalysis.validAt)+' · stays on this analysis date as you change forecast days.':'Snow raster unavailable. Daily station records are shown below.';
  $('snow-legend').hidden=!$('snow-layer').checked||!conditions?.snowAnalysis;
  $('map-date').textContent=`${formatDate(key,{weekday:'short',month:'short',day:'numeric',year:'numeric'})} · dates local to each sample`;
  setViewBox();
}
function renderList(){
  $('sample-list').innerHTML=weather.sites.map(s=>{const d=dayFor(s);return `<button class="sample-row" data-site="${esc(s.id)}" aria-pressed="${s.id===selectedSite.id}"><span>${esc(s.name)}<small>${esc(s.provider)} · ${esc(s.zone)}</small></span><span>${d?`${temp(d.minC)} / ${temp(d.maxC)} F`:'No hourly coverage'}<small>${d?`${number(d.hours)} of ${number(d.expectedHours)} hours`:'Outside this feed’s range'}</small></span></button>`;}).join('');
  for(const button of $('sample-list').querySelectorAll('[data-site]'))button.addEventListener('click',()=>{selectedSite=weather.sites.find(s=>s.id===button.dataset.site);renderWeather();renderMap();renderList();$('sample-list').querySelector(`[data-site="${CSS.escape(selectedSite.id)}"]`)?.focus();});
  if(!$('weather-layer').checked)$('sample-list').innerHTML='<p class="small-copy">Weather samples are hidden. Turn on the weather layer to show the list.</p>';
}
function renderWeather(){
  const s=selectedSite,d=dayFor(s);$('weather-title').textContent=s.name;$('weather-provider').textContent=s.provider;
  $('weather-interval').textContent=d?`${formatDate(key,{weekday:'long',month:'short',day:'numeric'})} · ${d.temperatureComplete?'Full day':number(d.temperatureHours)+' forecast hours'} · ${s.zone}`:`${formatDate(key)} · no hourly coverage`;
  if(d){const wind=mph(d.windHighKph);$('weather-content').innerHTML=`<div class="temperature-main"><strong>${temp(d.minC)}</strong><span>low / ${temp(d.maxC)} high °F${d.temperatureComplete?'':'<br>in available hours'}</span></div><dl class="weather-stats"><div><dt>Wind from</dt><dd>${esc(d.windFrom??'Variable / unknown')}</dd></div><div><dt>Wind up to</dt><dd>${wind===null?'—':wind+' mph'}</dd></div><div><dt>Peak hourly rain chance</dt><dd>${d.rainChanceMax===null?'—':number(d.rainChanceMax)+'%'}</dd></div><div><dt>Forecast below 32°F</dt><dd>${d.freezeHours===null?'—':number(d.freezeHours)+' hours'}</dd></div></dl>`;}
  else $('weather-content').innerHTML='<p class="no-hours">No hours available for this date.</p><p class="small-copy">This saved feed does not cover the selected day. We haven’t filled the gap with another day’s weather.</p>';
  const nearest=nearestSite(spot,[s]);$('weather-scope').textContent=`City reference · ${Math.round(nearest.distanceKm/1.609344).toLocaleString()} miles from your selected spot. This is sample weather, not a forecast for your property.`;
  $('weather-source').href=s.sourcePage??s.sourceUrl;$('weather-issued').textContent=`Issued ${actualTime(s.issuedAt,s.zone)}. Retrieved ${actualTime(s.retrievedAt,s.zone)}.`;
}
function renderSun(){
  $('sun-location').textContent=`${spot.sample?'Sample spot · ':''}${spot.name} · ${formatDate(key)}`;
  try{const time=d=>d instanceof Date&&Number.isFinite(+d)?new Intl.DateTimeFormat('en-US',{timeZone:spot.zone,hour:'numeric',minute:'2-digit'}).format(d):'Unavailable';
    const noon=zonedTime(key,12,spot.zone),sun=SunCalc.getTimes(noon,spot.lat,spot.lon),illumination=SunCalc.getMoonIllumination(noon);
    $('sunrise').textContent=time(sun.sunrise);$('sunset').textContent=time(sun.sunset);$('dawn').textContent=`Dawn ${time(sun.dawn)}`;$('dusk').textContent=`Dusk ${time(sun.dusk)}`;
    $('moon-phase').textContent=illumination.phase<.03||illumination.phase>.97?'New moon':illumination.phase<.22?'Waxing crescent':illumination.phase<.28?'First quarter':illumination.phase<.47?'Waxing gibbous':illumination.phase<.53?'Full moon':illumination.phase<.72?'Waning gibbous':illumination.phase<.78?'Last quarter':'Waning crescent';
    $('moon-light').textContent=`${Math.round(illumination.fraction*100)}% illuminated · ${spot.zone}`;
    // Use a neutral moon symbol; illumination is stated numerically alongside it.
    $('moon-shadow').setAttribute('d','M20 4a16 16 0 0 0 0 32a13 16 0 0 1 0-32Z');
  }catch{for(const id of ['sunrise','sunset','dawn','dusk','moon-phase','moon-light'])$(id).textContent='Unavailable for this spot/date';}
}
function renderDays(){
  $('date-zone').textContent=`Dates at your spot · ${spot.zone}`;
  $('day-picker').innerHTML=dates.map((date,index)=>`<button class="day-button" data-date="${date}" aria-pressed="${date===key}"><span><strong>${index===0?'Snapshot day':formatDate(date,{weekday:'long'})}</strong><small>${formatDate(date)}${index>2?' · longer range':''}</small></span><span class="day-index" aria-hidden="true">${String(index+1).padStart(2,'0')}</span></button>`).join('');
  for(const button of $('day-picker').querySelectorAll('[data-date]'))button.addEventListener('click',()=>{key=button.dataset.date;render();$('day-picker').querySelector(`[data-date="${key}"]`)?.focus();});
}
function renderReports(){
  const selected=selectReports(surveys.reports,{state:reportState,type:reportType});
  $('report-cards').innerHTML=selected.length?renderReportCards(selected,{species,today:dateKey(new Date(),spot.zone),sources:surveys.sources,monitoring:surveys.monitoring,zone:spot.zone}):'<p class="report-empty">No reports match these filters. Try all report types or another reference state.</p>';
  $('reports-checked').textContent=selected.length+' of '+surveys.reports.length+' dated reports. Each keeps its own observation date.';
  $('report-count').textContent=surveys.reports.length+' dated reports';
  const fields=surveys.reports.filter(r=>r.type==='field-notes').length;
  $('report-breakdown').textContent=(surveys.reports.length-fields)+' survey reports and '+fields+' regional field reports.';
  const pending=surveys.pendingSources??[];
  $('source-statuses').hidden=!pending.length&&!surveys.monitoring?.sources?.length;
  $('source-status-summary').textContent=checksSummary(surveys.monitoring,{zone:spot.zone});
  const checks=surveys.monitoring?.sources??[],newer=checks.filter(s=>s.newerAvailable).length,unavailable=checks.filter(s=>['access-blocked','check-failed'].includes(s.status)).length;
  $('report-checks-link').textContent=checks.length?(newer?newer+' newer source reports':checks.length+' source checks')+(unavailable?' · '+unavailable+' checks unavailable':'')+' ↓':'See agency report checks ↓';
  $('source-checks-toggle').textContent='See '+(surveys.monitoring?.sources?.length??pending.length)+' source checks';
  $('source-status-list').innerHTML=surveys.monitoring?.sources?.length?renderSourceChecks(surveys.monitoring,{zone:spot.zone}):pending.map(s=>'<li><a href="'+esc(s.url??s.indexUrl)+'" target="_blank" rel="noreferrer">'+esc(s.name)+'</a><p>'+esc(s.note??s.reason??'Current report import is pending.')+'</p><small>Last reviewed '+esc(actualTime(s.checkedAt))+'</small></li>').join('');
}
function renderConditions(){
  if(!conditions){$('conditions-status').textContent='Ground observations unavailable in this saved snapshot.';$('cold-cards').innerHTML='<p>Refresh the public ground-data snapshot to load observations.</p>';$('ground-count').textContent='Ground observations unavailable';return;}
  $('conditions-status').textContent='Sources checked '+actualTime(conditions.generatedAt)+'.';
  $('conditions-summary').textContent='Daily cold history can arrive several days after the weather happened. Its record date is separate from today’s forecast and the last source check. Snow analysis and river readings also keep their actual observation times.'+(conditions.errors?.length?' '+conditions.errors.length+' source retrievals were unavailable; coverage is partial.':'');
  $('cold-cards').innerHTML=renderColdCards(conditions.coldSites,{today:dateKey(new Date(),spot.zone)});
  $('gauge-cards').innerHTML=renderGaugeCards(conditions.gauges);
  $('ground-count').textContent=conditions.coldSites.length+' cold-history stations · '+conditions.gauges.length+' river gauges';
  const snow=conditions.snowAnalysis;
  $('snow-legend').innerHTML=snow?'<strong>NOAA snow depth · inches</strong><div>'+snow.legend.filter(l=>l.contentType==='image/png'&&/^[A-Za-z0-9+/=]+$/.test(l.imageData)).map(l=>'<span><img alt="" src="data:image/png;base64,'+l.imageData+'">'+esc(l.label)+'</span>').join('')+'</div><p>Transparent areas include the shallowest class (under 0.39 in) and missing coverage. Read the source date above; this is modeled snow analysis.</p>':'';
}
function openReportState(state){
  reportState=state;$('report-state').value=state;renderReports();renderMap();
  $('reports').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  $('reports-title').tabIndex=-1;$('reports-title').focus({preventScroll:true});
}
function render(){renderDays();renderMap();renderList();renderWeather();renderSun();renderReports();renderConditions();}
function setSpot(next){
  if(!validSpot(next))return;
  spot=next;try{localStorage.setItem('hnted-waterfowl-spot',JSON.stringify(spot));}catch{$('spot-detail').textContent='Location lasts for this visit only';}
  selectedSite=nearestSite(spot,weather.sites).site;dates=availableDates(weather,spot.zone);if(!dates.includes(key))key=dates[0];
  $('spot-name').textContent=spot.name;$('spot-detail').textContent=`${spot.sample?'Sample spot · ':''}${spot.lat.toFixed(3)}°, ${spot.lon.toFixed(3)}° · change`;
  $('location-dialog').close();render();
}
async function load(){
  try{
    const get=getJson;
    [weather,surveys,geography]=await Promise.all([get('data/weather.json'),get('data/surveys.json'),get('data/basemap.geojson')]);
    try{release=await get('data/release.json');}catch{}
    try{refreshState=await get('data/update-status.json');}catch{}
    try{conditions=validateConditions(await get('data/conditions.json'));}catch{conditions=null;}
    $('snow-layer').disabled=!conditions?.coldSites?.length&&!conditions?.snowAnalysis;$('water-layer').disabled=!conditions?.gauges?.length;
    if(!weather.sites?.length||!surveys.reports?.length||!geography.features?.length)throw new Error('Incomplete prototype data.');
    validateReports(surveys);
    validateMonitoring(surveys.monitoring);
    for(const code of [...new Set(surveys.reports.flatMap(referenceStates))].sort()){const option=document.createElement('option');option.value=code;option.textContent=geography.features.find(f=>f.properties.code===code)?.properties.name??code;$('report-state').append(option);}
    dates=availableDates(weather,spot.zone);key=dates[0];selectedSite=nearestSite(spot,weather.sites).site;
    $('spot-name').textContent=spot.name;$('spot-detail').textContent=`${spot.sample?'Sample spot · ':''}${spot.lat.toFixed(3)}°, ${spot.lon.toFixed(3)}° · change`;
    const updated=actualTime(weather.generatedAt);
    if(release.audience==='public'){$('edition-badge').textContent='PUBLIC FIELD STUDY';$('study-copy').textContent='Weather to the north, ground observations, and dated bird reports in one place. We’re building and testing the migration outlook.';}
    lastWebsiteCheckAt=new Date().toISOString();websiteCheckFailed=false;renderRefreshStatus();$('app-content').hidden=false;$('reload-data').disabled=false;
    $('snapshot-detail').textContent=`Weather snapshot saved ${updated}. ${weather.sites.length} named samples. ${weather.errors.length?weather.errors.length+' sample retrievals failed. ':''}No migration scores have been calculated.`;
    $('sample-count').textContent=`${weather.sites.length} weather samples`;
    $('sample-breakdown').textContent=`${weather.sites.filter(s=>s.provider==='NWS').length} U.S. cities and ${weather.sites.filter(s=>s.provider==='ECCC').length} Canadian cities in this snapshot.`;
    $('location-open').disabled=false;
    const saved=read('t2h-spots',[]),choices=Array.isArray(saved)?saved.filter(validSpot).slice(0,30):[];
    const sampleChoices=weather.sites.map(s=>({name:s.name,lat:s.lat,lon:s.lon,zone:s.zone,sample:true}));
    for(const [index,s] of [...choices,...sampleChoices].entries()){const o=document.createElement('option');o.value=String(index);o.textContent=`${s.sample?'Sample':'Saved'} · ${s.name}`;$('sample-spot').append(o);}
    $('sample-spot').addEventListener('change',event=>{if(event.target.value!=='')setSpot([...choices,...sampleChoices][Number(event.target.value)]);event.target.value='';});
    render();
    snapshotRefresher=createSnapshotRefresher({initialVersion:refreshState?.finishedAt,initialTimes:{weather:weather.generatedAt,surveys:surveys.generatedAt,conditions:conditions?.generatedAt},readStatus:()=>getJson('data/update-status.json'),readSnapshot:async()=>{
      const [nextWeather,nextSurveys,nextConditions]=await Promise.all([getJson('data/weather.json'),getJson('data/surveys.json'),getJson('data/conditions.json')]);
      if(!nextWeather.sites?.length||!Number.isFinite(Date.parse(nextWeather.generatedAt)))throw new Error('Forecast data is incomplete.');
      validateReports(nextSurveys);validateMonitoring(nextSurveys.monitoring);validateConditions(nextConditions);
      return {weather:nextWeather,surveys:nextSurveys,conditions:nextConditions};
    },onUpdate:(next,status)=>{
      const oldSite=selectedSite?.id;
      weather=next.weather;surveys=next.surveys;conditions=next.conditions;refreshState=status;
      $('snow-layer').disabled=!conditions.coldSites?.length&&!conditions.snowAnalysis;$('water-layer').disabled=!conditions.gauges?.length;
      dates=availableDates(weather,spot.zone);if(!dates.includes(key))key=dates[0];
      selectedSite=weather.sites.find(s=>s.id===oldSite)??nearestSite(spot,weather.sites).site;
      render();
      $('snapshot-detail').textContent=`Weather snapshot saved ${actualTime(weather.generatedAt)}. ${weather.sites.length} named samples. No migration scores have been calculated.`;
    }});
  }catch(error){$('load-status').textContent=`The saved data could not be opened. Reload this page or try again shortly. ${release.audience==='local'?error.message:''}`;$('load-status').classList.add('stale');}
}
async function checkPublishedData(force=false){
  if(!snapshotRefresher||(!force&&$('location-dialog').open))return;
  $('reload-data').disabled=true;$('reload-data').textContent='Checking updates…';
  try{const result=await snapshotRefresher.check({force});if(!result.skipped){lastWebsiteCheckAt=new Date(result.checkedAt).toISOString();websiteCheckFailed=false;}}
  catch{websiteCheckFailed=true;}
  finally{$('reload-data').disabled=false;$('reload-data').textContent='Check for updates';renderRefreshStatus();}
}
for(const id of ['weather-layer','reports-layer','spot-layer','snow-layer','water-layer'])$(id).addEventListener('change',()=>{renderMap();renderList();});
$('species').addEventListener('change',event=>{species=event.target.value;renderReports();});
$('report-state').addEventListener('change',event=>{reportState=event.target.value;renderReports();renderMap();});
$('report-type').addEventListener('change',event=>{reportType=event.target.value;renderReports();renderMap();});
for(const choice of ['map','list'])$(choice+'-view').addEventListener('click',()=>{view=choice;$('map-wrap').hidden=view!=='map';$('sample-list').hidden=view!=='list';$('map-view').setAttribute('aria-pressed',String(view==='map'));$('list-view').setAttribute('aria-pressed',String(view==='list'));});
$('zoom-in').addEventListener('click',()=>{zoom=Math.min(3,zoom+.5);renderMap();});$('zoom-out').addEventListener('click',()=>{zoom=Math.max(1,zoom-.5);if(zoom===1)viewCentre=[480,380];renderMap();});$('zoom-reset').addEventListener('click',()=>{zoom=1;viewCentre=[480,380];renderMap();});
let drag;
$('field-map').addEventListener('pointerdown',event=>{if(zoom===1||event.target.closest('.map-marker'))return;event.preventDefault();drag={x:event.clientX,y:event.clientY,centre:[...viewCentre]};$('field-map').setPointerCapture(event.pointerId);});
$('field-map').addEventListener('pointermove',event=>{if(!drag)return;const rect=$('field-map').getBoundingClientRect(),ratio=(mapSize()[0]/zoom)/rect.width;viewCentre=[Math.max(100,Math.min(860,drag.centre[0]-(event.clientX-drag.x)*ratio)),Math.max(80,Math.min(680,drag.centre[1]-(event.clientY-drag.y)*ratio))];setViewBox();});
for(const event of ['pointerup','pointercancel'])$('field-map').addEventListener(event,()=>{drag=null;});
$('location-open').addEventListener('click',()=>{$('latitude').value=spot.lat;$('longitude').value=spot.lon;$('time-zone').value=spot.zone;$('location-dialog').showModal();});
$('location-dialog').addEventListener('close',()=>{searchGeneration++;$('town-status').textContent='';$('town-results').replaceChildren();});
$('town-form').addEventListener('submit',async event=>{event.preventDefault();const generation=++searchGeneration;$('town-status').textContent='Searching the local town index…';$('town-results').replaceChildren();try{const results=await findTowns($('town-query').value);if(generation!==searchGeneration)return;$('town-status').textContent=results.length?'Choose your town below.':'No match. Try a town and state, or enter coordinates.';for(const t of results){const b=document.createElement('button');b.textContent=`${t.name}, ${t.admin1}`;b.addEventListener('click',()=>setSpot({name:`${t.name}, ${t.admin1}`,lat:t.latitude,lon:t.longitude,zone:t.timezone}));$('town-results').append(b);}}catch{if(generation===searchGeneration)$('town-status').textContent='Town index unavailable. You can enter coordinates below.';}});
$('coords-form').addEventListener('submit',event=>{event.preventDefault();const lat=Number($('latitude').value),lon=Number($('longitude').value),zone=$('time-zone').value.trim(),next={name:'My hunting spot',lat,lon,zone};if(!validSpot(next)){$('coords-status').textContent='Enter valid coordinates and an IANA time zone such as America/Chicago.';return;}$('coords-status').textContent='';setSpot(next);});
new ResizeObserver(()=>{if(weather&&geography)renderMap();}).observe($('map-wrap'));
$('reload-data').addEventListener('click',()=>checkPublishedData(true));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){renderRefreshStatus();checkPublishedData();}});
window.addEventListener('pageshow',event=>{if(event.persisted)checkPublishedData();});
setInterval(()=>{if(document.visibilityState==='visible')renderRefreshStatus();},60000);
setInterval(()=>{if(document.visibilityState==='visible')checkPublishedData();},900000);
load();
