import {readFile,appendFile} from 'node:fs/promises';
import {updateHealth} from '../hnted/waterfowl/update-health.js';
const root=new URL('../',import.meta.url),runtime=new URL('hnted/waterfowl/',root);
const get=async name=>JSON.parse(await readFile(new URL('data/'+name,runtime),'utf8'));
const [weather,conditions,status]=await Promise.all([get('weather.json').catch(()=>null),get('conditions.json').catch(()=>null),get('update-status.json').catch(()=>null)]);
const health=updateHealth(weather,conditions,status),needed=process.env.GITHUB_EVENT_NAME==='workflow_dispatch'||health.needsRefresh;
let publishNeeded=false,liveError;
if(process.argv.includes('--live')||process.argv.includes('--probe-live')){
const attempts=process.argv.includes('--wait-live')?12:1;
for(let attempt=0;attempt<attempts;attempt++){try{
  const base='https://trinity-research.com/hnted/waterfowl/data/',stamp=Date.now();
  const fetchJson=async file=>{const response=await fetch(base+file+'?check='+stamp,{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('Live data HTTP '+response.status);return response.json();};
  const [liveWeather,liveConditions,liveStatus]=await Promise.all([fetchJson('weather.json'),fetchJson('conditions.json'),fetchJson('update-status.json')]);
  const behind=(actual,expected)=>!Number.isFinite(Date.parse(actual))||(Number.isFinite(Date.parse(expected))&&Date.parse(actual)<Date.parse(expected));
  if(behind(liveWeather.generatedAt,weather?.generatedAt)||behind(liveConditions.generatedAt,conditions?.generatedAt)||behind(liveStatus.finishedAt,status?.finishedAt))throw new Error('The live website is behind the saved refresh.');
  const liveHealth=updateHealth(liveWeather,liveConditions,liveStatus);if(liveHealth.overdue)throw new Error('The published observations are not current.');
  console.log('Live refresh dates and forecast coverage verified.');
  liveError=undefined;publishNeeded=false;break;
}catch(error){publishNeeded=true;liveError=error;console.log('Live publication check: '+error.message);if(attempt+1<attempts)await new Promise(resolve=>setTimeout(resolve,10000));}}
}
console.log(JSON.stringify({...health,needsRefresh:needed,publishNeeded},null,2));
if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,'needed='+needed+'\npublish='+publishNeeded+'\n');
if(process.argv.includes('--require-fresh')&&(health.overdue||health.failedJobs.length))throw new Error('Refresh health is not current: '+health.reasons.join(', '));
if(process.argv.includes('--live')&&liveError)throw liveError;
