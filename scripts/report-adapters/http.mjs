import {createHash} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
const hosts=['www.fws.gov','www.iowadnr.gov','forbes-bio-station.inhs.illinois.edu','uofi.box.com','uofi.app.box.com','app.box.com','api.box.com','mdc12.mdc.mo.gov','extra.mdc.mo.gov','www.dnr.state.mn.us','gfp.sd.gov','www.wlf.louisiana.gov','www.agfc.com','wetlandscenter.fhsu.edu','www.mdwfp.com','fw.ky.gov','www.in.gov','www.arcgis.com','www.tn.gov','www.ksoutdoors.gov','ksoutdoors.com','www.ksoutdoors.com','www.wildlifedepartment.com','wildlifedepartment.com'];
export function allowedUrl(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||!(hosts.includes(u.hostname)||u.hostname.endsWith('.boxcloud.com')))throw new Error('Source URL is outside the approved public hosts.');return u;}
export function createSourceFetch({rawRoot,maxRequests=90}={}){
  let requests=0;const cache=new Map(),cookies=new Map();
  const get=async(value,{binary=false,cacheKey=value,headers={}}={})=>{
    if(cache.has(cacheKey))return cache.get(cacheKey);
    let url=allowedUrl(value),response;const initialHost=url.hostname;
    if(Object.keys(headers).length&&!initialHost.endsWith('.boxcloud.com'))throw new Error('Download capability headers are only permitted on the public Box download host.');
    for(let redirects=0;redirects<6;redirects++){
      if(++requests>maxRequests)throw new Error('Daily source request limit reached.');
      response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(25000),headers:{'User-Agent':'HNTED-ReportChecks/1.0 (https://trinity-research.com/hnted/)',...(url.hostname===initialHost?headers:{}),...(cookies.has(url.hostname)?{Cookie:[...cookies.get(url.hostname)].map(([k,v])=>k+'='+v).join('; ')}:{})}});
      for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';',1)[0],split=pair.indexOf('=');if(split>0){if(!cookies.has(url.hostname))cookies.set(url.hostname,new Map());cookies.get(url.hostname).set(pair.slice(0,split),pair.slice(split+1));}}
      if([301,302,303,307,308].includes(response.status)){url=allowedUrl(new URL(response.headers.get('location'),url));await response.body?.cancel();continue;}
      break;
    }
    if(!response?.ok)throw new Error('Source HTTP '+response?.status);
    const max=binary?15000000:5000000,chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>max)throw new Error('Source exceeds bounded download size.');chunks.push(chunk);}
    const bytes=Buffer.concat(chunks),text=bytes.toString('utf8'),sha256=createHash('sha256').update(bytes).digest('hex'),result={bytes,text,url:String(url),checkedAt:new Date().toISOString(),sha256,contentType:response.headers.get('content-type')??''};
    if(rawRoot&&(binary||!url.hostname.endsWith('box.com'))){await mkdir(rawRoot,{recursive:true});await writeFile(new URL(sha256+(binary?'.pdf':'.html'),rawRoot),bytes);}
    cache.set(cacheKey,result);return result;
  };
  return get;
}
