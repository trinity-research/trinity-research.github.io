import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {validateReports,referenceStates,reconcileOverlaps} from '../hnted/waterfowl/report-data.js';
const root=new URL('../',import.meta.url),inputs=['waterfowl-surveys.json','waterfowl-illinois.json','waterfowl-missouri.json','waterfowl-northern.json','waterfowl-southern.json','waterfowl-source-status.json','waterfowl-additional.json','waterfowl-east-tn-in.json','waterfowl-east-ky-ms.json'];
const sources=[],reports=[],pendingSources=[];
for(const name of inputs){
  let document;
  try{document=JSON.parse(await readFile(new URL('data/hnted-waterfowl/'+name,root),'utf8'));}catch(error){if(error.code==='ENOENT'&&name==='waterfowl-southern.json')continue;throw error;}
  sources.push(...document.sources);
  for(const record of document.reports??[])reports.push({...record,type:record.type??'survey-counts',checkedAt:record.checkedAt??document.checkedAt,scope:{...record.scope,referenceStates:referenceStates(record)}});
  pendingSources.push(...(document.pendingSources??[]).map(record=>({...record,checkedAt:record.checkedAt??document.checkedAt})));
}
const checkedAt=reports.map(r=>r.checkedAt).filter(Boolean).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1);
const monitoring=await readFile(new URL('data/hnted-waterfowl/waterfowl-monitoring.json',root),'utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
const result={schemaVersion:2,generatedAt:new Date().toISOString(),checkedAt,status:'validated-official-reports-with-source-checks',scopeNote:'Separate dated surveys and regional narratives. Reports can overlap; no combined flyway population or migration score is calculated.',sources,reports,pendingSources,monitoring};
reconcileOverlaps(result);
validateReports(result);
const out=new URL('hnted/waterfowl/data/',root);await mkdir(out,{recursive:true});
await writeFile(new URL('surveys.pending.json',out),JSON.stringify(result)+'\n');await rename(new URL('surveys.pending.json',out),new URL('surveys.json',out));
console.log(`Built ${reports.length} dated reports (${reports.filter(r=>r.type!=='field-notes').length} surveys, ${reports.filter(r=>r.type==='field-notes').length} field reports). No cross-report counts were added.`);
