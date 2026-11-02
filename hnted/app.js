import {forecast,dateKey,addDays,zonedTime,localParts} from './engine.js';
import {updateRutPanel} from './rut-panel.js';
import {sitWindows} from './sit-windows.js';
import {findTowns} from './town-search.js';
const $=id=>document.getElementById(id);
const esc=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const browserZone=Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago';
const sample={name:'Ozark, Missouri',lat:37.0209,lon:-93.206,zone:'America/Chicago',sample:true};
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function validSpot(s){try{return s&&typeof s.name==='string'&&Number.isFinite(s.lat)&&Math.abs(s.lat)<=90&&Number.isFinite(s.lon)&&Math.abs(s.lon)<=180&&!!new Intl.DateTimeFormat('en',{timeZone:s.zone});}catch{return false;}}
const loaded=read('t2h-location',null);
let location=validSpot(loaded)?loaded:sample;
let key=dateKey(new Date(),location.zone);
let saved=read('t2h-spots',[]); saved=Array.isArray(saved)?saved.filter(validSpot).slice(0,30):[];
const loadedPrefs=read('t2h-prefs',{});
let prefs={time:['12','24'].includes(loadedPrefs?.time)?loadedPrefs.time:'12',twilight:['civil','nautical','astronomical','30','45'].includes(loadedPrefs?.twilight)?loadedPrefs.twilight:'civil'};
let selectedHour=null,current=null,toastTimer,searchAbort;
const cache=new Map();
function persist(name,value){try{localStorage.setItem(name,JSON.stringify(value));}catch{toast('Your browser could not save this change. It will last for this visit.');}}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000);}
function time(date,compact=false){if(!(date instanceof Date)||!Number.isFinite(+date))return '—';return new Intl.DateTimeFormat('en-US',{timeZone:location.zone,hour:'numeric',minute:'2-digit',hour12:prefs.time==='12'}).format(date).replace(/\s?(AM|PM)/,(_,s)=>compact?s.toLowerCase():' '+s);}
function range(start,end){const suffix=dateKey(start,location.zone)<key?' (starts previous day)':dateKey(end,location.zone)>key?' (ends next day)':'';return `${time(start,true)} – ${time(end,true)}${suffix}`;}
function rating(score){return score===null?'Unavailable':score>=75?'Excellent':score>=60?'Very good':score>=45?'Good':score>=25?'Fair':'Quiet';}
function getForecast(date){const id=[date,location.lat,location.lon,location.zone,prefs.twilight].join('|');if(!cache.has(id))cache.set(id,forecast(date,location,prefs.twilight));return cache.get(id);}
function average(values){return values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null;}
function render(){
  try {current=getForecast(key);} catch(error){toast('Could not calculate this forecast. Choose a valid location and date.');return;}
  const f=current,now=new Date(),isToday=key===dateKey(now,location.zone);
  $('location-name').textContent=location.name;
  $('location-coords').textContent=`${Math.abs(location.lat).toFixed(3)}° ${location.lat<0?'S':'N'} · ${Math.abs(location.lon).toFixed(3)}° ${location.lon<0?'W':'E'}`;
  $('timezone-display').textContent=`${location.zone.replaceAll('_',' ')} · local times`;
  $('date-label').textContent=new Intl.DateTimeFormat('en-US',{timeZone:location.zone,weekday:'long',month:'short',day:'numeric',year:'numeric'}).format(f.noon);
  $('date-input').value=key;$('example-banner').hidden=!location.sample;
  $('daily-score').textContent=f.daily??'—';$('score-dial').style.setProperty('--score',f.daily??0);
  $('daily-title').textContent=f.daily===null?'No lunar rating today.':f.daily>=75?'Strong lunar alignment.':f.daily>=55?'Moderate lunar alignment.':f.daily>=35?'Some lunar alignment.':'Limited lunar alignment.';
  $('daily-copy').textContent=f.polar?'Continuous daylight or darkness today. Sun-based hunting ratings are unavailable.':'An index of sun and moon timing—not the chance of seeing a deer. Read it alongside weather and your knowledge of this spot.';
  updateRutPanel({key,location:{...location},lunarTitle:$('daily-title').textContent,lunarCopy:$('daily-copy').textContent});
  const daylightMinutes=Math.round((f.daylight??0)*60);
  const daylight=f.daylight===null?'No sunrise / sunset':`${Math.floor(daylightMinutes/60)}h ${daylightMinutes%60}m daylight`;
  $('daylight-short').textContent=daylight;$('daylight-length').textContent=f.daylight===null?'':daylight.replace(' daylight',' of light');
  $('phase-short').textContent=f.phaseName;
  const windows=sitWindows(f,location.zone);
  $('sit-windows').innerHTML=windows.length?windows.map(p=>{
    const event={over:'Moon overhead',under:'Moon underfoot',rise:'Moonrise',set:'Moonset'}[p.kind];
    const daylight=p.daylight?`Daylight: ${range(p.daylight.start,p.daylight.end)}`:p.daylightKnown?'Outside sunrise–sunset':'Daylight times unavailable';
    return `<li class="sit-window"><div class="sit-window-heading"><span>${esc(p.label)}</span><span class="period-pill">${p.major?'MAJOR PERIOD':'MINOR PERIOD'}</span></div><h3>${esc(range(p.start,p.end))}</h3><p>${event} at ${esc(time(p.time))}</p><p class="sit-daylight">${esc(daylight)}</p></li>`;
  }).join(''):'<li class="sit-window-empty">No lunar event today. Check the sun and hourly chart for this date.</li>';
  for(const [id,from,to] of [['am-score',0,12],['pm-score',12,24]]){
    const list=f.scores?.filter((s,h)=>h>=from&&h<to&&SunCalc.getPosition(zonedTime(key,h,location.zone),location.lat,location.lon).altitude>-.833*Math.PI/180)??[];
    const score=average(list);$(id).textContent=score===null?'No daylight':`${rating(score)} · ${score}`;
  }
  renderChart();
  for(const id of ['sunrise','sunset'])$(id).textContent=time(f.sun[id]);
  $('dawn').textContent=time(f.dawn);$('dusk').textContent=time(f.dusk);
  const twilightLabels={civil:['Civil dawn','Civil dusk'],nautical:['Nautical dawn','Nautical dusk'],astronomical:['Astronomical dawn','Astronomical dusk'],'30':['30 min before sunrise','30 min after sunset'],'45':['45 min before sunrise','45 min after sunset']};
  [$('dawn-label').textContent,$('dusk-label').textContent]=twilightLabels[prefs.twilight];
  $('solar-note').textContent=f.polar?'No sunrise or sunset on this date at this latitude.':'Times follow the selected location’s time zone.';
  $('moon-phase').textContent=f.phaseName;$('moon-illumination').textContent=`${Math.round(f.illumination.fraction*100)}% illuminated`;
  $('moon-distance').textContent=`${Math.round(f.distance).toLocaleString()} km from Earth`;
  for(const [id,kind] of [['moonrise','rise'],['moonset','set'],['moonover','over'],['moonunder','under']]){$(id).textContent=time(f.moon[kind]);$(id).title=f.moon[kind]?'':'No event on this date';}
  drawMoon(f.illumination.phase);
  $('periods-list').innerHTML=f.periods.length?f.periods.map(p=>`<div class="period-item ${p.major?'major':''}"><span class="period-point"></span><div class="period-copy"><div><strong>${esc(time(p.time))}</strong><small>${p.major?'MAJOR':'MINOR'}</small></div><p>${esc(range(p.start,p.end))}</p></div></div>`).join(''):'<p class="empty-text">No lunar events occur here on this date.</p>';
  const week=Array.from({length:7},(_,i)=>getForecast(addDays(key,i)));
  $('week-grid').innerHTML=week.map((d,i)=>`<button class="week-day ${i===0?'active':''}" data-date="${d.key}" aria-label="${esc(new Intl.DateTimeFormat('en-US',{timeZone:location.zone,dateStyle:'full'}).format(d.noon))}: ${rating(d.daily)}${d.daily===null?'':`, ${d.daily} out of 100`}" ${i===0?'aria-current="date"':''}><span>${esc(new Intl.DateTimeFormat('en-US',{timeZone:location.zone,weekday:'short',day:'numeric'}).format(d.noon))}</span><strong>${d.daily??'—'}</strong><small>${rating(d.daily)}</small><div class="week-meter"><i style="width:${d.daily??0}%"></i></div></button>`).join('');
  $('today').disabled=false;$('today').setAttribute('aria-label',isToday?'Today is selected':'Go to today');
}
function renderChart(){
  const f=current;
  if(!f.scores){$('hourly-chart').innerHTML='<p class="unavailable">Hourly ratings need sunrise and sunset. Neither occurs here on this date.</p>';$('chart-hours').innerHTML='';$('chart-insight').textContent='Try another date or location.';return;}
  const now=new Date(),today=key===dateKey(now,location.zone),currentHour=localParts(now,location.zone).hour;
  $('hourly-chart').innerHTML=f.scores.map((score,h)=>{
    const d=zonedTime(key,h,location.zone),daylight=SunCalc.getPosition(d,location.lat,location.lon).altitude>-.833*Math.PI/180;
    return `<button class="hour-column ${daylight?'daylight':''} ${selectedHour===h?'selected':''}" data-hour="${h}" aria-label="${esc(time(d))}: ${score} out of 100, ${daylight?'daylight':'night'}" aria-pressed="${selectedHour===h}"><span class="hour-bar" style="height:${score}%"><span class="hour-value">${score}</span></span>${today&&currentHour===h?'<span class="current-dot"></span>':''}</button>`;
  }).join('');
  $('chart-hours').innerHTML=f.scores.map((_,h)=>`<span>${h%3===0?(prefs.time==='24'?String(h).padStart(2,'0'):h===0?'12a':h===12?'12p':h>12?(h-12)+'p':h+'a'):''}</span>`).join('');
  const top=f.scores.indexOf(Math.max(...f.scores));
  $('chart-insight').textContent=selectedHour===null?`Strongest hourly rating: ${time(zonedTime(key,top,location.zone))} · ${f.scores[top]}/100`:`${time(zonedTime(key,selectedHour,location.zone))} · ${f.scores[selectedHour]}/100 · ${rating(f.scores[selectedHour])} activity`;
  $('chart-selection').textContent=selectedHour===null?'Tap a bar to explore':`${time(zonedTime(key,selectedHour,location.zone))} · ${f.scores[selectedHour]}/100`;
}
function drawMoon(phase){
  const waxing=phase<.5,k=Math.cos(2*Math.PI*phase),r=Math.abs(k)*43;
  const path=waxing?`M50 7 A43 43 0 0 1 50 93 A${r} 43 0 0 ${k>0?0:1} 50 7Z`:`M50 7 A43 43 0 0 0 50 93 A${r} 43 0 0 ${k>0?1:0} 50 7Z`;
  $('moon-lit').setAttribute('d',path);$('moon-drawing').setAttribute('aria-label',`${current.phaseName}, ${Math.round(current.illumination.fraction*100)} percent illuminated`);
}
function renderSaved(){
  $('saved-count').textContent=saved.length;
  $('saved-locations').innerHTML=saved.length?saved.map((s,i)=>`<div class="saved-item"><button data-spot="${i}">${esc(s.name)}<small>${s.lat.toFixed(3)}°, ${s.lon.toFixed(3)}° · ${esc(s.zone.replaceAll('_',' '))}</small></button><button class="icon-button" data-delete="${i}" aria-label="Remove ${esc(s.name)} from saved spots">×</button></div>`).join(''):'<p class="empty-text">Keep your favorite spots close. Pick a location, then save it here.</p>';
}
function openLocation(){renderSaved();$('location-status').textContent='';$('manual-zone').value=location.zone;$('location-dialog').showModal();}
function chooseSpot(spot){location={name:spot.name,lat:spot.lat,lon:spot.lon,zone:spot.zone};key=dateKey(new Date(),location.zone);selectedHour=null;cache.clear();persist('t2h-location',location);$('location-dialog').close();render();toast(`Forecast updated for ${location.name}`);}
for(const id of ['location-open','choose-location','saved-nav'])$(id).addEventListener('click',openLocation);
$('settings-open').addEventListener('click',()=>{$('time-format').value=prefs.time;$('twilight').value=prefs.twilight;$('settings-dialog').showModal();});
$('about-open').addEventListener('click',()=>$('about-dialog').showModal());
document.querySelectorAll('.close-dialog').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}}));
for(const [id,delta]of [['prev-day',-1],['next-day',1]])$(id).addEventListener('click',()=>{const next=addDays(key,delta);if(next<'1900-01-01'||next>'2100-12-31')return;key=next;selectedHour=null;render();});
$('today').addEventListener('click',()=>{key=dateKey(new Date(),location.zone);selectedHour=null;render();});
$('date-input').addEventListener('change',e=>{if(e.target.validity.valid&&/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)){key=e.target.value;selectedHour=null;render();}});
$('week-grid').addEventListener('click',e=>{const b=e.target.closest('[data-date]');if(b){key=b.dataset.date;selectedHour=null;render();$('forecast').scrollIntoView({behavior:'smooth'});}});
$('hourly-chart').addEventListener('click',e=>{const b=e.target.closest('[data-hour]');if(b){selectedHour=Number(b.dataset.hour);renderChart();$('hourly-chart').querySelector(`[data-hour="${selectedHour}"]`).focus({preventScroll:true});}});
for(const [id,name]of [['time-format','time'],['twilight','twilight']])$(id).addEventListener('change',e=>{prefs[name]=e.target.value;persist('t2h-prefs',prefs);render();});
$('save-current').addEventListener('click',()=>{if(saved.some(s=>Math.abs(s.lat-location.lat)<.0001&&Math.abs(s.lon-location.lon)<.0001)){toast('This spot is already saved.');return;}if(saved.length>=30){toast('You can save up to 30 spots. Remove one to add another.');return;}saved.push({...location,sample:false});persist('t2h-spots',saved);renderSaved();toast('Spot saved on this device.');});
$('saved-locations').addEventListener('click',e=>{const load=e.target.closest('[data-spot]'),remove=e.target.closest('[data-delete]');if(load)chooseSpot(saved[Number(load.dataset.spot)]);if(remove){saved.splice(Number(remove.dataset.delete),1);persist('t2h-spots',saved);renderSaved();}});
$('coordinate-form').addEventListener('submit',e=>{e.preventDefault();const spot={name:$('manual-name').value.trim(),lat:Number($('manual-lat').value),lon:Number($('manual-lon').value),zone:$('manual-zone').value.trim()};if(!spot.name||!validSpot(spot)){$('location-status').textContent='Enter valid coordinates and an IANA time zone such as America/Chicago.';return;}chooseSpot(spot);});
$('use-gps').addEventListener('click',()=>{
  if(!navigator.geolocation){$('location-status').textContent='Location is unavailable in this browser. Search for a town or enter coordinates instead.';return;}
  const button=$('use-gps');button.disabled=true;button.textContent='◎ Finding your location…';$('location-status').textContent='';
  navigator.geolocation.getCurrentPosition(position=>{button.disabled=false;button.textContent='◎ Use my current location';chooseSpot({name:'Current location',lat:position.coords.latitude,lon:position.coords.longitude,zone:browserZone});toast(`Using your device’s time zone: ${browserZone}. You can adjust it with manual coordinates.`);},error=>{button.disabled=false;button.textContent='◎ Use my current location';$('location-status').textContent=error.code===1?'Location permission was declined. Search for a town or enter coordinates instead.':'Could not get a GPS fix. Try again outdoors, search for a town, or enter coordinates.';},{enableHighAccuracy:true,timeout:15000,maximumAge:300000});
});
$('search-form').addEventListener('submit',async e=>{
  e.preventDefault();const query=$('place-search').value.trim();if(query.length<2)return;
  searchAbort?.abort();searchAbort=new AbortController();const controller=searchAbort;
  const button=e.target.querySelector('button');button.disabled=true;button.textContent='Searching…';$('search-results').replaceChildren();$('location-status').textContent='Searching for places…';
  const timeout=setTimeout(()=>controller.abort(),12000);
  try{
    const towns=await findTowns(query);if(controller.signal.aborted)return;
    const results=towns.filter(p=>validSpot({name:p.name,lat:p.latitude,lon:p.longitude,zone:p.timezone}));
    $('location-status').textContent=results.length?'Select a location below.':'No matching town. Try a nearby U.S. town and state, use GPS, or enter coordinates.';
    for(const p of results){const b=document.createElement('button');b.className='search-result';b.textContent=[p.name,p.admin1,p.country].filter(Boolean).join(', ');const detail=document.createElement('span');detail.textContent=`${p.latitude.toFixed(3)}°, ${p.longitude.toFixed(3)}° · ${p.timezone}`;b.append(detail);b.addEventListener('click',()=>chooseSpot({name:[p.name,p.admin1].filter(Boolean).join(', '),lat:p.latitude,lon:p.longitude,zone:p.timezone}));$('search-results').append(b);}
  }catch(error){$('location-status').textContent='The town list could not load. You can still use GPS or enter coordinates manually.';}
  finally{clearTimeout(timeout);button.disabled=false;button.textContent='Search';}
});
try{$('timezones').innerHTML=Intl.supportedValuesOf('timeZone').map(z=>`<option value="${z}"></option>`).join('');}catch{}
renderSaved();render();
