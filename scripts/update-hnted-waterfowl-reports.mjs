import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dateKey} from '../hnted/engine.js';
import {validateReports,reconcileOverlaps} from '../hnted/waterfowl/report-data.js';
import {REPORT_FILES,PROFILES} from './report-adapters/profiles.mjs';
import {createSourceFetch} from './report-adapters/http.mjs';
import {latestLink,links,plain,oklahomaNotices,discoveryState} from './report-adapters/discovery.mjs';
import * as pdf from './report-adapters/pdf-counts.mjs';
import * as refuge from './report-adapters/refuge-counts.mjs';
import {discoverMinnesotaReport,discoverSouthDakotaReport} from './report-adapters/northern-notices.mjs';
const root=new URL('../',import.meta.url),raw=new URL('.hnted-runtime/waterfowl/',root),stateFile=new URL('data/hnted-waterfowl/waterfowl-monitoring.json',root),startedAt=new Date().toISOString(),today=dateKey(new Date(),'America/Chicago');
const seasonYear=+today.slice(0,4)-(+today.slice(5,7)<8?1:0),minimum=seasonYear+'-08-01';
const get=createSourceFetch({rawRoot:raw}),docs=await Promise.all(REPORT_FILES.map(async name=>({name,data:JSON.parse(await readFile(new URL('data/hnted-waterfowl/'+name,root),'utf8'))})));
const prior=await readFile(stateFile,'utf8').then(JSON.parse).catch(()=>({sources:[]})),states=[];
const currentCandidate=list=>list.filter(c=>c.reportDate>=minimum&&c.reportDate<=today).sort((a,b)=>b.reportDate.localeCompare(a.reportDate))[0]??null;
const extractPdf=async download=>{
  if(download.bytes.subarray(0,4).toString()!=='%PDF')throw new Error('Source did not return a PDF.');
  const file=new URL(download.sha256+'.pdf',raw);await mkdir(raw,{recursive:true});await writeFile(file,download.bytes);
  const command=process.env.HNTED_PDFTOTEXT??'pdftotext';
  return execFileSync(command,['-layout','-enc','UTF-8',fileURLToPath(file),'-'],{encoding:'utf8',timeout:30000,maxBuffer:12000000,windowsHide:true});
};
const log=(id,message)=>console.log(id+': '+message);
for(const profile of PROFILES){
  const doc=docs.find(d=>d.data.sources.some(s=>s.id===profile.id));
  const pending=docs.flatMap(d=>d.data.pendingSources??[]).find(s=>(s.sourceId??s.id)===profile.id);
  const source=doc?.data.sources.find(s=>s.id===profile.id)??pending;
  const recordDoc=docs.find(d=>d.data.reports?.some(r=>r.sourceId===profile.id)),record=recordDoc?.data.reports.find(r=>r.sourceId===profile.id);
  const previous=prior.sources.find(s=>s.sourceId===profile.id),indexUrl=source?.indexUrl??source?.url;
  const base={sourceId:profile.id,name:source?.name??profile.id,indexUrl,mode:profile.mode,attemptedAt:new Date().toISOString(),lastSuccessfulCheckAt:previous?.lastSuccessfulCheckAt??source?.lastAutomaticCheckAt??source?.retrievedAt??null,lastImportedAt:previous?.lastImportedAt??null,importedReportDate:record?.reportDate??null,lastContentReviewAt:record?.checkedAt??recordDoc?.data.checkedAt??null,latestReportDate:previous?.latestReportDate??record?.reportDate??null,latestReportUrl:previous?.latestReportUrl??record?.url??indexUrl};
  let state={...base},page,candidate=null,download,imported,notice=null;
  try{
    if(!source||!indexUrl)throw new Error('Reviewed source configuration missing.');
    if(profile.kind==='tennessee'){
      const checked=source.lastAutomaticCheckAt;
      if(!checked||Date.now()-Date.parse(checked)>3600000)throw new Error('The separate Tennessee check has not succeeded in this refresh.');
      state={...state,status:'current',lastSuccessfulCheckAt:checked,lastImportedAt:record.checkedAt,latestReportDate:record.reportDate,latestReportUrl:record.url,newerAvailable:false,message:'The daily Tennessee adapter checked the latest Black Bayou ground survey.'};
      states.push(state);continue;
    }
    page=await get(indexUrl);
    if(/page not found|access denied|verify you are human|request unsuccessful/i.test(plain(page.text)))throw new Error('The agency returned an unavailable or verification page.');
    if(profile.kind==='restricted'){
      if(source.termsUrl)await get(source.termsUrl);
      state={...state,status:'restricted',lastSuccessfulCheckAt:page.checkedAt,message:'Official link checked. Underlying count reuse still requires permission; no count data is queried or imported.',newerAvailable:false};
      states.push(state);continue;
    }
    if(profile.kind==='loess'){
      const listing=await get(refuge.loessCollectionSearchUrl(page.text));
      const latest=currentCandidate(refuge.parseLoessListing(JSON.parse(listing.text)));
      if(!latest)throw new Error('No dated current-season refuge report was found.');
      const landing=await get(latest.landingUrl);candidate={...latest,url:refuge.loessPdfUrl(landing.text,latest.landingUrl)};
    }else if(profile.kind==='iowa')candidate=currentCandidate(pdf.discoverIowaReports(page.text,indexUrl));
    else if(['illinois','mississippi-river'].includes(profile.kind)){
      const candidates=pdf.discoverInhsReports(page.text,indexUrl).filter(c=>c.sourceId===profile.id);
      candidate=currentCandidate(candidates.filter(c=>c.status==='available'));
      const missed=currentCandidate(candidates.filter(c=>c.status==='weathered-out'));
      if(missed&&(!candidate||missed.reportDate>candidate.reportDate))notice=missed.reportDate;
    }else if(profile.kind==='missouri'){
      page=await get(refuge.MISSOURI_VIEWER_URL);
      const view=refuge.parseMissouriViewer(page.text);candidate={reportDate:view.reportDate,url:refuge.MISSOURI_VIEWER_URL,csvUrl:view.csvUrl};
    }else if(profile.kind==='minnesota')candidate=discoverMinnesotaReport(page.text,{today});
    else if(profile.kind==='south-dakota')candidate=discoverSouthDakotaReport(page.text,{today});
    else if(profile.kind==='oklahoma')candidate=oklahomaNotices(page.text,indexUrl,{today});
    else candidate=latestLink(page.text,indexUrl,{today,minimum,pattern:new RegExp(profile.pattern,'i')});
    if(candidate&&(!candidate.reportDate||candidate.reportDate>today||candidate.reportDate<minimum))throw new Error('Candidate date is outside the current reporting season.');
    state=discoveryState({...base,checkedAt:page.checkedAt,candidate,record,weatheredOut:notice,prior:previous});
    state.lastContentReviewAt=base.lastContentReviewAt;
    if(candidate?.areasChecked)state.message='Area entries have mixed dates. '+candidate.newestAreaCount+' of '+candidate.areasChecked+' have the newest update; '+candidate.noReportAreas+' explicitly say no report. Counts require a separate validated importer.';
    if(!candidate){
      if(record)state.status='date-unverified';
      const relevant=links(page.text,indexUrl).filter(a=>new RegExp(profile.pattern??'waterfowl|survey|report','i').test(a.label+' '+a.url));
      if(!relevant.length)throw new Error('The agency report index format was not recognized.');
      state.message=record?'The index was readable, but no newer dated current-season report link was identified. The saved observation date is retained.':'No dated current-season report was located on the checked index.';
      // New undated publications are notices only, never newly dated observations.
      if(profile.id==='agfc-habitat-news'&&relevant.find(a=>/habitat|wetland|drought/i.test(a.label)&&a.url!==record?.url)){
        const link=relevant.find(a=>/habitat|wetland|drought/i.test(a.label)&&a.url!==record?.url);state.status='review-link';state.latestReportUrl=link.url;state.message='A relevant habitat-news link needs review; its observation date is not verified.';
      }
    }
    if(candidate&&record&&candidate.reportDate<record.reportDate){state.status='needs-review';state.message='The source currently lists an older report than our saved observation. The newer saved observation was retained.';}
    if(candidate&&profile.mode==='automatic-import'&&(!record||candidate.reportDate>=record.reportDate)){
      try{
        if(profile.kind==='missouri'){
          download=await get(candidate.csvUrl);imported=refuge.parseMissouriCsv(download.text,record,candidate.reportDate);
        }else{
          let pdfUrl=candidate.url,headers={};
          if(['illinois','mississippi-river'].includes(profile.kind)){
            const share=await get(candidate.url),resolved=pdf.boxPdfUrl(share.text,candidate.url);
            pdfUrl=resolved.url;headers=resolved.headers;
          }
          download=await get(pdfUrl,{binary:true,headers});const text=await extractPdf(download);
          if(profile.kind==='loess')imported=refuge.parseLoessBluffsText(text,record,candidate.reportDate,candidate.url);
          else if(profile.kind==='iowa')imported=pdf.parseIowaWeeklyPdf(text,{reportDate:candidate.reportDate,oldReport:record,url:candidate.url});
          else imported=pdf.parseInhsInventoryPdf(text,{reportDate:candidate.reportDate,oldReport:record,sourceId:profile.id,url:candidate.url});
        }
        if(imported.reportDate!==candidate.reportDate||imported.sourceId!==profile.id)throw new Error('Imported report identity or date differs from the source candidate.');
        imported.checkedAt=download.checkedAt;
        recordDoc.data.reports[recordDoc.data.reports.indexOf(record)]=imported;
        Object.assign(source,{reportUrl:candidate.url,retrievedAt:download.checkedAt,lastReportSha256:download.sha256,documentSha256:download.sha256,verification:'Automatically parsed with date, schema, units, missing-value and count-reconciliation checks.'});
        Object.assign(state,{status:'current',lastImportedAt:download.checkedAt,lastContentReviewAt:download.checkedAt,importedReportDate:imported.reportDate,newerAvailable:false,message:notice?'The newest listed flight was weathered out. This is the latest completed survey.':'Latest dated official report imported and validated.',reportSha256:download.sha256});
      }catch(error){state.status='needs-review';state.message='The latest report was located, but its count table could not be verified for automatic import. Saved counts were retained.';state.failureReason=/ENOENT|Command failed/.test(error.message)?'PDF extraction unavailable or unsuccessful.':String(error.message).slice(0,220);state.retryable=/HTTP|timeout|fetch failed|ENOENT/.test(error.message);log(profile.id,'import held: '+state.failureReason);}
    }
    Object.assign(source,{lastAutomaticCheckAt:page.checkedAt});
    states.push(state);log(profile.id,state.status+' '+(candidate?.reportDate??'no current dated report'));
  }catch(error){
    states.push({...state,status:/HTTP (403|405)/.test(error.message)?'access-blocked':'check-failed',lastSuccessfulCheckAt:base.lastSuccessfulCheckAt,newerAvailable:previous?.newerAvailable??false,message:'Source check unavailable: '+String(error.message).slice(0,220)+'. The last saved report is retained.'});
    log(profile.id,'unavailable: '+String(error.message).slice(0,220));
  }
}
const combined={sources:docs.flatMap(d=>d.data.sources),reports:docs.flatMap(d=>d.data.reports??[])};
reconcileOverlaps(combined);validateReports(combined);
for(const doc of docs){const file=new URL('data/hnted-waterfowl/'+doc.name,root),pending=new URL('data/hnted-waterfowl/'+doc.name.replace('.json','.pending.json'),root);await writeFile(pending,JSON.stringify(doc.data,null,2)+'\n');await rename(pending,file);}
const monitoring={schemaVersion:1,startedAt,checkedAt:new Date().toISOString(),targetIntervalHours:6,policy:'Scheduled official-source checks with a six-hour target; strict numeric imports where supported, dated notices otherwise. Check dates are separate from observation dates.',sources:states};
const pendingFile=new URL('data/hnted-waterfowl/waterfowl-monitoring.pending.json',root);await writeFile(pendingFile,JSON.stringify(monitoring,null,2)+'\n');await rename(pendingFile,stateFile);
const readable=states.filter(s=>!['access-blocked','check-failed'].includes(s.status)&&Number.isFinite(Date.parse(s.lastSuccessfulCheckAt))).length;
console.log('Report source sweep complete: '+states.length+' sources; '+readable+' readable; '+states.filter(s=>s.status==='needs-review'||s.status==='review-link').length+' awaiting import/review.');
if(readable<Math.ceil(PROFILES.length/2))throw new Error('Most source checks failed. Per-source failures and saved observations are retained for recovery.');
