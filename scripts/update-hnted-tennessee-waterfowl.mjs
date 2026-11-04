import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dateKey} from '../hnted/engine.js';
import {latestBlackBayou} from '../hnted/waterfowl/tennessee-data.js';
import {validateReports} from '../hnted/waterfowl/report-data.js';
const root=new URL('../',import.meta.url),file=new URL('data/hnted-waterfowl/waterfowl-east-tn-in.json',root),raw=new URL('.hnted-runtime/waterfowl/',root);
const service='https://services3.arcgis.com/PWXNAH2YKmZY7lBq/arcgis/rest/services/service_e17e08b94e004c26ba2a532f36ad411b/FeatureServer/0';
await mkdir(raw,{recursive:true});
async function get(address,name){
  const url=new URL(address);if(url.protocol!=='https:'||!['www.arcgis.com','services3.arcgis.com'].includes(url.hostname)||url.username||url.password)throw new Error('Unsupported TWRA source.');
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{'User-Agent':'HNTED-Waterfowl/0.3 (https://trinity-research.com/hnted/)'}});if(!response.ok)throw new Error('TWRA source HTTP '+response.status);
  const text=await response.text();if(text.length>3000000)throw new Error('TWRA response exceeds bounded size.');
  const data=JSON.parse(text);if(data.error)throw new Error('TWRA provider error.');
  const result={data,url:String(url),retrievedAt:new Date().toISOString(),sha256:createHash('sha256').update(text).digest('hex')};await writeFile(new URL(name,raw),text);return result;
}
// Public dashboard metadata must still link the audited service and retain its reuse terms.
for(const id of ['5a158cd3c7194625838f3b1048959ce3','bec56da3571b421cb8175400250535dd']){const item=await get('https://www.arcgis.com/sharing/rest/content/items/'+id+'?f=json','twra-item-'+id+'.json');if(item.data.licenseInfo?.trim())throw new Error('TWRA reuse terms changed; review before importing.');}
const map=await get('https://www.arcgis.com/sharing/rest/content/items/cc171202334948c1b0f7c3bd84ba1f8e/data?f=json','twra-webmap-refresh.json');if(!JSON.stringify(map.data).includes(service))throw new Error('Official service linkage changed.');
const today=dateKey(new Date(),'America/Chicago'),year=Number(today.slice(0,4))-(Number(today.slice(5,7))<8?1:0);
const fields=['objectid','DateSurveyed','DateRange','AreaSurveyed','SurveyType','StateSurveyed','Mallard','DuckTotals','WaterLevel_Conditions','BlackDuck','WoodDuck','Gadwall','Wigeon','Pintail','B_Wteal','G_Wteal','Shoveler','UnidDabbler','DabblerTotal','DiverTotal','SeaDuckTotal','MerganserTotal'];
const query=service+'/query?'+new URLSearchParams({where:`DateSurveyed >= TIMESTAMP '${year}-08-01 00:00:00'`,outFields:fields.join(','),orderByFields:'DateSurveyed DESC,AreaSurveyed',resultRecordCount:'1000',returnGeometry:'false',f:'json'});
const result=await get(query,'twra-daily-refresh.json'),latest=latestBlackBayou(result.data,{today}),document=JSON.parse(await readFile(file,'utf8'));
const report=document.reports.find(r=>r.sourceId==='twra-refuge-counts');if(!report)throw new Error('Reviewed TWRA report template missing.');
const source=document.sources.find(s=>s.id===report.sourceId);
Object.assign(source,{retrievedAt:result.retrievedAt,documentSha256:result.sha256,lastAutomaticCheckAt:result.retrievedAt,verification:'Latest Black Bayou ground-survey row from the bounded current-season official service. Numbered duplicate count fields are excluded.'});
Object.assign(report,{id:'twra-black-bayou-'+latest.date,reportDate:latest.date,checkedAt:result.retrievedAt,summary:{...report.summary,mallardCount:latest.mallardCount,allDucks:latest.allDucks},method:'TWRA refuge inventory recorded as a ground survey. Actual survey dates are retained; a daily source check does not create a new observation.'});
report.scope.description='Latest reported ground survey at Black Bayou Refuge in the queried reporting season. This is one refuge, not statewide Tennessee coverage; the state outline is a report reference.';
report.areas=[{id:'twra-row-'+latest.objectId,name:'Black Bayou Refuge',date:latest.date,mallardCount:latest.mallardCount,allDucks:latest.allDucks,surveyType:'ground',counts:latest.counts,sourceGroupCounts:latest.sourceGroupCounts,sourceWaterConditionText:latest.sourceWaterConditionText,waterConditionNote:'The source does not define this percentage; no flooded-acre estimate is inferred.'}];
report.provenance='Official TWRA-linked feature service row '+latest.objectId+'. Original Mallard and DuckTotals fields. Source response SHA256 '+result.sha256+'.';
report.notes=report.notes.filter(n=>!n.includes('No previous comparable'));report.notes.push('No prior-count trend is calculated by this adapter.');
validateReports(document);
const pending=new URL('data/hnted-waterfowl/waterfowl-east-tn-in.pending.json',root);await writeFile(pending,JSON.stringify(document,null,2)+'\n');await rename(pending,file);
console.log('TWRA checked: Black Bayou survey '+latest.date+'; '+latest.allDucks+' ducks, '+latest.mallardCount+' mallards. Other agency reports retain their reviewed records.');
