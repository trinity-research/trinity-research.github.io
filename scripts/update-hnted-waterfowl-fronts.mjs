import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {validateFronts} from '../hnted/waterfowl/fronts-data.js';
import {WPC_ANALYSIS_URL,WPC_FORECAST_URL,parseWpcSurfaceBulletin,parseWpcForecastBulletin} from './wpc-fronts.mjs';
const root=new URL('../',import.meta.url),out=new URL('hnted/waterfowl/data/fronts.json',root),raw=new URL('.hnted-runtime/waterfowl/',root);
const previous=await readFile(out,'utf8').then(JSON.parse).then(validateFronts).catch(()=>null),frames=[],errors=[];
const headers={'User-Agent':'HNTED-FrontMaps/1.0 (https://trinity-research.com/hnted/)','Accept':'text/plain'};
for(const [kind,url,parse] of [['analysis',WPC_ANALYSIS_URL,text=>[parseWpcSurfaceBulletin(text,{allowPartialFeatures:true})]],['forecast',WPC_FORECAST_URL,parseWpcForecastBulletin]]){
  try{
    const parsedUrl=new URL(url);if(parsedUrl.protocol!=='https:'||parsedUrl.hostname!=='www.wpc.ncep.noaa.gov')throw new Error('Unsupported front-map host.');
    let response;
    for(let attempt=0;attempt<3;attempt++){
      response=await fetch(url,{headers,redirect:'error',signal:AbortSignal.timeout(25000)});
      if(response.ok)break;
      if(attempt===2||![429,500,502,503,504].includes(response.status))throw new Error('NOAA front bulletin HTTP '+response.status);
      await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));
    }
    const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>500000)throw new Error('NOAA bulletin exceeds the size limit.');chunks.push(chunk);}
    const bytes=Buffer.concat(chunks),text=bytes.toString('utf8'),sha256=createHash('sha256').update(bytes).digest('hex'),retrievedAt=new Date().toISOString(),next=parse(text);
    if(!next.length||next.some(f=>f.kind!==kind))throw new Error('The bulletin did not contain the expected frame kind.');
    const prior=previous?.frames.filter(f=>f.kind===kind)??[];
    if(prior.length&&Math.max(...next.map(f=>Date.parse(f.issuedAt)))<Math.max(...prior.map(f=>Date.parse(f.issuedAt))))throw new Error('NOAA returned an older source issue; saved frames retained.');
    if(kind==='analysis'&&next.some(f=>Date.parse(f.validAt)<Date.now()-12*3600000||Date.parse(f.validAt)>Date.now()+3600000))throw new Error('NOAA analysis is outside the current time window.');
    if(kind==='forecast'&&!next.some(f=>Date.parse(f.validAt)>Date.now()))throw new Error('NOAA forecast bulletin has no future positions.');
    next.forEach(f=>Object.assign(f,{sourceUrl:url,retrievedAt,sha256}));
    validateFronts({schemaVersion:1,generatedAt:retrievedAt,frames:next});
    await mkdir(raw,{recursive:true});await writeFile(new URL('wpc-'+kind+'-'+sha256+'.txt',raw),bytes);
    frames.push(...next);console.log('NOAA '+kind+': '+next.length+' frames; '+next.reduce((n,f)=>n+f.features.length,0)+' features.');
  }catch(error){errors.push({id:kind,message:String(error.message).slice(0,220)});frames.push(...(previous?.frames.filter(f=>f.kind===kind)??[]));console.log('NOAA '+kind+': '+error.message);}
}
if(errors.length===2||!frames.length)throw new Error('Front map could not refresh; the previous saved file is retained.');
const data=validateFronts({schemaVersion:1,generatedAt:new Date().toISOString(),provider:'NOAA Weather Prediction Center',sourcePage:'https://www.wpc.ncep.noaa.gov/basicwx/basicwx_ndfd.php',scope:'Analyzed and forecast surface fronts and pressure centers. Positions apply only at their stated valid time; no local front-arrival estimate or duck movement forecast is inferred.',frames:frames.sort((a,b)=>Date.parse(a.validAt)-Date.parse(b.validAt)),errors});
const pending=new URL('hnted/waterfowl/data/fronts.pending.json',root);await mkdir(new URL('hnted/waterfowl/data/',root),{recursive:true});await writeFile(pending,JSON.stringify(data)+'\n');await rename(pending,out);
console.log('Saved '+frames.length+' dated NOAA front-map positions.');
