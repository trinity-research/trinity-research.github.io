import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),runtime=new URL('hnted/waterfowl/',root);
const {validateReports}=await import(new URL('report-data.js',runtime));
const {validateConditions}=await import(new URL('conditions-data.js',runtime));
const {validateMonitoring}=await import(new URL('report-monitor.js',runtime));
const reports=validateReports(JSON.parse(await readFile(new URL('data/surveys.json',runtime),'utf8')));
validateMonitoring(reports.monitoring);
const conditions=validateConditions(JSON.parse(await readFile(new URL('data/conditions.json',runtime),'utf8')));
const weather=JSON.parse(await readFile(new URL('data/weather.json',runtime),'utf8'));
if(weather.sites?.filter(s=>s.provider==='NWS').length<5||!Number.isFinite(Date.parse(weather.generatedAt)))throw new Error('Weather coverage is incomplete.');
for(const site of weather.sites){if(!site.points?.length||!Number.isFinite(site.lat)||!Number.isFinite(site.lon))throw new Error('Invalid weather site.');for(const p of site.points)if(!Number.isFinite(p.start)||p.end<=p.start)throw new Error('Invalid forecast interval.');}
if(conditions.coldSites.length<2||conditions.gauges.length<2)throw new Error('Ground coverage is incomplete.');
if(conditions.snowAnalysis){const snow=conditions.snowAnalysis,bytes=await readFile(new URL(snow.image,runtime));if(createHash('sha256').update(bytes).digest('hex')!==snow.sha256)throw new Error('Snow raster hash mismatch.');}
const html=await readFile(new URL('index.html',runtime),'utf8'),ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);if(ids.length!==new Set(ids).size)throw new Error('Duplicate page IDs.');
for(const file of ['app.js','weather-data.js','report-data.js','report-cards.js','conditions-data.js','conditions-cards.js','tennessee-data.js','update-health.js','report-monitor.js']){const text=await readFile(new URL(file,runtime),'utf8');for(const [,relative]of text.matchAll(/from\s+['"]([^'"]+)['"]/g))if(relative.startsWith('.'))await access(new URL(relative,new URL(file,runtime)));if(file==='app.js')for(const [,id]of text.matchAll(/\$\('([^']+)'\)/g))if(!ids.includes(id))throw new Error('Missing page ID '+id);}
console.log('Verified '+weather.sites.length+' weather samples, '+reports.reports.length+' dated reports, '+conditions.coldSites.length+' daily stations, '+conditions.gauges.length+' gauges, and runtime assets.');
