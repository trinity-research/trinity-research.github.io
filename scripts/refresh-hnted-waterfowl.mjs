import {spawnSync} from 'node:child_process';
import {readFile,writeFile,readdir,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),runtime=new URL('hnted/waterfowl/',root),startedAt=new Date().toISOString(),jobs=[];
const run=name=>spawnSync(process.execPath,[fileURLToPath(new URL(name,import.meta.url))],{cwd:root,stdio:'inherit',timeout:360000});
for(const [id,script]of [['weather','update-hnted-waterfowl-weather.mjs'],['conditions','update-hnted-waterfowl-conditions.mjs'],['tennessee','update-hnted-tennessee-waterfowl.mjs'],['reports','update-hnted-waterfowl-reports.mjs']]){
  const result=run(script);jobs.push({id,status:result.status===0?'success':'failed',checkedAt:new Date().toISOString()});
}
if(jobs.every(j=>j.status==='failed'))throw new Error('All refreshes failed; previous public snapshots are retained.');
if(run('build-hnted-waterfowl-reports.mjs').status!==0)throw new Error('Updated report bundle failed validation.');
if(run('verify-hnted-waterfowl.mjs').status!==0)throw new Error('Refreshed release failed validation.');
const conditions=JSON.parse(await readFile(new URL('data/conditions.json',runtime),'utf8')),keep=conditions.snowAnalysis?.image.split('/').at(-1);
for(const name of await readdir(new URL('data/',runtime)))if(/^snow-analysis-[a-f0-9]{12}\.png$/.test(name)&&name!==keep)await unlink(new URL('data/'+name,runtime));
await writeFile(new URL('data/update-status.json',runtime),JSON.stringify({startedAt,finishedAt:new Date().toISOString(),jobs})+'\n');
console.log('Refresh complete. Failed sources keep their previously saved dataset; successful datasets can have explicitly partial coverage.');
