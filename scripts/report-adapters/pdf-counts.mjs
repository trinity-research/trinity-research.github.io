// Pure, deliberately bounded adapters for the agency tables verified in autumn 2026.
// Extract with modern Poppler: pdftotext -layout input.pdf output.txt. Legacy Xpdf
// can detach labels/merge cells; ambiguous layouts fail instead of shifting columns.
export const IOWA_INDEX_URL='https://www.iowadnr.gov/things-do/hunting-trapping/types-hunting-trapping/migratory-game-bird-hunting/waterfowl-migration-survey';
export const INHS_INDEX_URL='https://forbes-bio-station.inhs.illinois.edu/research/waterfowl-aerial-inventories/';
const months=['January','February','March','April','May','June','July','August','September','October','November','December'];
const fail=message=>{throw new Error('PDF count adapter: '+message);};
function iso(year,month,day){
  const value=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||new Date(value+'T12:00:00Z').toISOString().slice(0,10)!==value)fail('invalid report date');
  return value;
}
function namedDate(value){const m=value.match(/\b([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})\b/);return m&&months.includes(m[1])?iso(+m[3],months.indexOf(m[1])+1,+m[2]):null;}
function numericDate(value){const m=value.match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\s*$/);return m?iso(m[3].length===2?2000+(+m[3]):+m[3],+m[1],+m[2]):null;}
function number(value){
  if(value==='--')return null;
  if(!/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(value))fail('unrecognized count cell '+value);
  const n=Number(value.replaceAll(',',''));if(!Number.isSafeInteger(n))fail('unsafe integer count');return n;
}
function percentage(value){const n=number(value);if(n!==null&&n>100)fail('percentage exceeds 100');return n;}
function textLines(text){if(typeof text!=='string'||!text.trim())fail('extracted text is empty');return text.replaceAll('\r','').replaceAll('\f','\n').split('\n');}
function dateCheck(found,expected,oldReport){
  if(!found)fail('report date missing');
  if(expected&&found!==expected)fail(`report date ${found} does not match candidate ${expected}`);
  if(oldReport.reportDate&&found<oldReport.reportDate)fail('candidate is older than saved report');
  return found;
}
// Date-dependent fields must not leak from the previous PDF into a new report.
function staticRecord(oldReport){
  const {id,reportDate,observationDate,observationPeriod,summary,observations,areas,quality,coverage,referenceBaseline,
    speciesCounts,speciesChangePercent,gooseSummary,otherBirdCounts,regions,provenance,notes,observer,overlaps,checkedAt,...rest}=oldReport;
  return structuredClone(rest);
}
function retainedArea(oldReport,name,region,ordinal){
  const candidates=(oldReport.areas??[]).filter(a=>a.name===name&&(!region||a.region===region));
  const old=candidates[ordinal]??{};
  const {allDucks,previousAllDucks,mallardCount,previousMallardCount,mallardCompositionPercent,
    otherDabblersCompositionPercent,diversCompositionPercent,gooseCount,previousGooseCount,
    darkGooseCompositionPercent,lightGooseCompositionPercent,wetPercent,icePercent,
    speciesCounts,otherBirdCounts,quality,date,...metadata}=old;
  return structuredClone(metadata);
}
function reconcile(rows,key,expected,label){
  const values=rows.map(r=>r[key]);
  if(expected!==null&&values.every(v=>v!==null)&&values.reduce((a,b)=>a+b,0)!==expected)fail(label+' do not reconcile');
}
const iowaSpecies={
  'Canada Goose':'canadaGoose','Greater White-fronted Goose':'greaterWhiteFrontedGoose','Snow Goose':'snowGoose',
  'Mallard':'mallard','Gadwall':'gadwall','American Wigeon':'americanWigeon','Northern Pintail':'northernPintail',
  'Green-winged Teal':'greenWingedTeal','Blue-winged Teal':'blueWingedTeal','Northern Shoveler':'northernShoveler',
  'Wood Duck':'woodDuck','Diving Ducks':'divingDucks'
};

/** Returns an updated report. Exact mallard counts stay null: composition is rounded. */
export function parseIowaWeeklyPdf(text,{reportDate,oldReport={},url}={}){
  if(oldReport.sourceId&&oldReport.sourceId!=='iowa-dnr-migration')fail('saved report is not the Iowa source');
  const lines=textLines(text),joined=lines.join('\n');
  if(!/IOWA DEPARTMENT OF NATURAL RESOURCES/.test(joined)||!/Fall Migration Waterfowl Survey/.test(joined))fail('not an Iowa weekly migration report');
  const dates=[...joined.matchAll(/Week Ending:\s*([A-Za-z]+\s+\d{1,2},\s*\d{4})/g)].map(m=>namedDate(m[1]));
  if(dates.length!==1)fail('expected one Iowa table date');
  const date=dateCheck(dates[0],reportDate,oldReport);
  const start=lines.findIndex(l=>/^\s*Week\s+Dabblers\s+Week\s*$/.test(l));
  const header=lines.slice(Math.max(0,start-6),start+1).join('\n');
  if(start<0||!/Ducks\s+Geese/.test(header)||!/Survey Area\s+Abundance\s+Composition \(%\)\s+Abundance\s+Composition \(%\)/.test(header)||!/Total\s+Mallard\s+Divers\s+Total\s+Dark\s+Light/.test(header))fail('unsupported Iowa table header/layout; use modern Poppler -layout');
  const end=lines.findIndex((l,i)=>i>start&&(/% Change in count from/.test(l)||/^\s*Species\s*$/.test(l)));
  if(end<0)fail('Iowa species-change table missing');
  const areas=[];let total=null;
  for(const line of lines.slice(start+1,end).filter(l=>l.trim())){
    const m=line.match(/^\s*(.+?\S)\s+((?:--|[\d,]+)(?:\s+(?:--|[\d,]+)){8})\s*$/);
    if(!m)fail('unsupported Iowa row/layout: '+line.trim().slice(0,80));
    const name=m[1].trim(),cells=m[2].trim().split(/\s+/),[allDucks,previousAllDucks]=cells.slice(0,2).map(number);
    const row={name,allDucks,previousAllDucks,mallardCount:null,mallardCompositionPercent:percentage(cells[2]),
      otherDabblersCompositionPercent:percentage(cells[3]),diversCompositionPercent:percentage(cells[4]),
      gooseCount:number(cells[5]),previousGooseCount:number(cells[6]),darkGooseCompositionPercent:percentage(cells[7]),lightGooseCompositionPercent:percentage(cells[8])};
    if(name==='Total'){if(total)fail('duplicate Iowa total');total=row;}
    else {if(total||areas.some(a=>a.name===name))fail('duplicate or misplaced Iowa area');areas.push({...retainedArea(oldReport,name,null,0),...row});}
  }
  if(!total||!areas.length||total.allDucks===null)fail('Iowa table total/areas missing');
  for(const key of ['allDucks','previousAllDucks','gooseCount','previousGooseCount'])reconcile(areas,key,total[key],'Iowa '+key+' area counts');
  const speciesChangePercent={};
  for(const line of lines.slice(end)){
    const m=line.match(/^\s*(.+?\S)\s+([+-]?\d+(?:\.\d+)?|--)\s*$/);
    if(!m)continue;
    const key=iowaSpecies[m[1]];if(!key)fail('unrecognized Iowa species-change row '+m[1]);
    if(key in speciesChangePercent)fail('duplicate Iowa species-change row');
    speciesChangePercent[key]=m[2]==='--'?null:Number(m[2]);
  }
  if(Object.keys(speciesChangePercent).length!==Object.keys(iowaSpecies).length)fail('incomplete Iowa species-change rows');
  const missing=areas.filter(a=>a.allDucks===null),unpaired=areas.some(a=>a.allDucks===null||a.previousAllDucks===null);
  const quality=missing.length?{status:'incomplete',label:'Partial survey',note:'No current duck count is supplied for '+missing.map(a=>a.name).join(', ')+'. Missing observations remain unknown.'}:null;
  return {...staticRecord(oldReport),id:'iowa-'+date,type:'survey-counts',sourceId:'iowa-dnr-migration',
    title:oldReport.title??'Iowa fall migration waterfowl survey',reportDate:date,url:url??oldReport.url,
    datePrecision:'week-ending',observationPeriod:{weekEnding:date,exactStart:null,exactObservationTimes:null},
    summary:{allDucks:total.allDucks,previousAllDucks:total.previousAllDucks,mallardCount:null,previousMallardCount:null,
      mallardCompositionPercent:total.mallardCompositionPercent,mallardChangePercent:speciesChangePercent.mallard,
      allDucksChangePercent:total.previousAllDucks>0?Math.round((total.allDucks/total.previousAllDucks-1)*1000)/10:null,
      changePercentSource:'Mallard change is agency-reported; all-duck change is calculated from the printed current and previous table totals. Rounded composition is never converted to a count.'},
    speciesChangePercent,gooseSummary:{total:total.gooseCount,previousTotal:total.previousGooseCount,
      darkCompositionPercent:total.darkGooseCompositionPercent,lightCompositionPercent:total.lightGooseCompositionPercent},
    duckCompositionPercent:{mallard:total.mallardCompositionPercent,otherDabblers:total.otherDabblersCompositionPercent,divers:total.diversCompositionPercent},
    areas,coverage:{areaCount:areas.length,currentAreasReported:areas.length-missing.length,previousAreasReported:areas.filter(a=>a.previousAllDucks!==null).length,matchedAreaComparison:!unpaired},
    ...(quality?{quality}:oldReport.reportDate===date&&oldReport.quality?{quality:structuredClone(oldReport.quality)}:{}),
    provenance:{totals:'Fall Migration Waterfowl Survey table, Total row; Ducks abundance/composition columns.',areas:'Named survey-area rows, with all nine numeric/-- cells validated against the printed header.',speciesChange:'Species / % Change in count from Previous Week table; agency-reported figures.'},
    notes:['Exact mallard counts are not reported in this table. Rounded composition percentages must not be multiplied into an exact species count.',
      'DNR primary survey sites may aggregate nearby areas; this is a dated surveyed-area sum, not a complete statewide population estimate.',
      ...(unpaired?['At least one area lacks a current or previous observation. Total changes are not a matched-site comparison; missing values are not zero.']:[]),
      'Ducks and geese remain separate groups; species-change percentages are not counts.']};
}

const duckCodes=['MALL','ABDU','NOPI','BWTE','GWTE','AMWI','GADW','NSHO','LESC','RNDU','CANV','REDH','RUDU','COGO','BUFF','COME','HOME'];
const otherCodes=['CAGO','GWFG','LSGO','AWPE','AMCO','AD','IMM','DCCO','SWN'];
const headerCodes=['LOCATION','%WET','%ICE',...duckCodes,...otherCodes];
function birdFields(cells){
  if(cells.length!==27)fail('INHS count column number changed');
  const values=cells.map(number),speciesCounts=Object.fromEntries(duckCodes.map((code,i)=>[code,values[i]])),allDucks=values[17];
  if(allDucks!==null&&Object.values(speciesCounts).every(v=>v!==null)&&Object.values(speciesCounts).reduce((a,b)=>a+b,0)!==allDucks)fail('INHS duck species do not reconcile with TOTAL DUCKS');
  return {mallardCount:values[0],allDucks,speciesCounts,otherBirdCounts:Object.fromEntries(otherCodes.map((code,i)=>[code,values[18+i]]))};
}
/** Does not manufacture a prior-survey trend from the printed ten-year baseline. */
export function parseInhsInventoryPdf(text,{reportDate,oldReport={},sourceId=oldReport.sourceId,url}={}){
  const lines=textLines(text),joined=lines.join('\n');
  if(!/ILLINOIS NATURAL HISTORY SURVEY WATERFOWL AERIAL INVENTORY DATA/.test(joined))fail('not an INHS inventory');
  const m=joined.match(/UPPER (ILLINOIS|MISSISSIPPI) RIVER VALLEY\s+Date:\s*(\d{1,2}\/\d{1,2}\/\d{4})\s+Observer:\s*([^\n]+?)\s+BAEA/);
  if(!m)fail('INHS river/date/observer header missing');
  const river=m[1],expectedId=river==='ILLINOIS'?'inhs-illinois-river':'inhs-central-mississippi';
  if(sourceId&&sourceId!==expectedId)fail('INHS candidate river disagrees with PDF');
  sourceId=expectedId;const date=dateCheck(numericDate(m[2]),reportDate,oldReport);
  const headerIndex=lines.findIndex(l=>/^\s*LOCATION\s+%WET/.test(l));
  if(headerIndex<0)fail('INHS columns missing');
  const columns=lines[headerIndex].trim().split(/\s+/).filter(c=>c!=='TOTAL'&&c!=='DUCKS');
  if(columns.join('|')!==headerCodes.join('|')||!lines.slice(Math.max(0,headerIndex-1),headerIndex+2).join(' ').includes('DUCKS'))fail('unsupported INHS column order/layout; use modern Poppler -layout');
  if(/weathered\s*out|incomplete|not surveyed|recording failure|partial survey/i.test(joined))fail('qualified INHS survey requires review before numeric replacement');
  let region='Upper',total=null,baseline=null;const areas=[],regions=[],seen=new Map();
  const baselineIndex=lines.findIndex(l=>/10-Year Average/.test(l));
  if(baselineIndex<0)fail('INHS baseline section missing');
  for(const line of lines.slice(headerIndex+1,baselineIndex)){
    const trimmed=line.trim();if(!trimmed||trimmed==='DUCKS')continue;
    if(trimmed===`LOWER ${river} RIVER VALLEY`){region='Lower';continue;}
    const totalMatch=trimmed.match(/^TOTAL (UPPER|LOWER|ILLINOIS|MISSISSIPPI)\s+(.+)$/);
    if(totalMatch){
      const fields=birdFields(totalMatch[2].split(/\s+/));
      if(totalMatch[1]===river){if(total)fail('duplicate INHS total');total=fields;}
      else if(['UPPER','LOWER'].includes(totalMatch[1])){if(regions.some(r=>r.name===totalMatch[1]))fail('duplicate INHS region');regions.push({name:totalMatch[1],...fields});}
      else fail('INHS total names wrong river');
      continue;
    }
    const row=trimmed.match(/^(.+?\S)\s+((?:--|[\d,]+)(?:\s+(?:--|[\d,]+)){28})$/);
    if(!row||total)fail('unsupported INHS site row/layout: '+trimmed.slice(0,80));
    const name=row[1],cells=row[2].split(/\s+/),key=region+'|'+name,ordinal=seen.get(key)??0;seen.set(key,ordinal+1);
    const area={...retainedArea(oldReport,name,region,ordinal),id:`${sourceId}-${region.toLowerCase()}-${String(areas.length+1).padStart(2,'0')}`,
      name,region,wetPercent:percentage(cells[0]),icePercent:percentage(cells[1]),...birdFields(cells.slice(2))};
    areas.push(area);
  }
  if(!total||!areas.length||regions.length!==2||total.allDucks===null)fail('INHS total, regions or sites missing');
  for(const key of ['mallardCount','allDucks']){
    reconcile(areas,key,total[key],'INHS '+key+' site counts');reconcile(regions,key,total[key],'INHS '+key+' regional totals');
    for(const r of regions)reconcile(areas.filter(a=>a.region.toUpperCase()===r.name),key,r[key],'INHS '+r.name+' '+key+' site counts');
  }
  const baselineLines=lines.slice(baselineIndex),years=baselineLines.join(' ').match(/\b(\d{4})\s*-\s*(\d{4})\b/);
  const baselineRows=baselineLines.map(l=>l.trim()).filter(l=>/^[\d,]+(?:\s+(?:--|[\d,]+)){26}$/.test(l));
  if(!years||baselineRows.length!==1)fail('INHS baseline layout changed');
  // Rounded per-species averages can differ slightly from their printed group total.
  const baselineValues=baselineRows[0].split(/\s+/).map(number);
  baseline={label:`Printed 10-Year Average, ${years[1]}-${years[2]}`,mallardCount:baselineValues[0],allDucks:baselineValues[17],note:'Source-printed ten-year reference values, not a previous survey or previous week.'};
  const missing=areas.filter(a=>a.allDucks===null||Object.values(a.speciesCounts).some(v=>v===null));
  return {...staticRecord(oldReport),id:sourceId+'-'+date,type:'survey-counts',sourceId,
    title:oldReport.title??(river==='ILLINOIS'?'Illinois River aerial inventory':'Central Mississippi River aerial inventory'),
    reportDate:date,observationDate:date,datePrecision:'survey-date',url:url??oldReport.url,observer:m[3].trim(),
    summary:{mallardCount:total.mallardCount,allDucks:total.allDucks,previousMallardCount:null,previousAllDucks:null},
    speciesCounts:total.speciesCounts,otherBirdCounts:total.otherBirdCounts,areas,regions,referenceBaseline:baseline,
    ...(missing.length?{quality:{status:'incomplete',label:'Partial survey',note:'Some site count cells are missing; missing values remain unknown.'}}:oldReport.reportDate===date&&oldReport.quality?{quality:structuredClone(oldReport.quality)}:{}),
    provenance:{totals:`TOTAL ${river} row, MALL and TOTAL DUCKS columns; full printed bird columns retained by agency abbreviation.`,areas:'Named rows under UPPER/LOWER; all 29 cells checked against the column header and duck species/group totals.',baseline:'Printed 10-Year Average row, retained separately from prior survey counts.'},
    notes:['Duck-group totals exclude separately tabulated geese, coots, swans and other waterbirds.',
      'Repeated place names remain separate printed rows, distinguished by section and row ID.',
      'No previous-survey count is inferred from the printed ten-year average.',
      ...(river==='MISSISSIPPI'?['Central Mississippi means the river corridor, not the state of Mississippi. Some coverage may overlap Missouri surveys, including Shanks; do not sum sources as independent populations.']:[])]};
}

const plain=html=>html.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
function anchors(html){return [...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({href:m[1].replaceAll('&amp;','&'),label:plain(m[2])}));}
function publicUrl(href,base,hosts){try{const u=new URL(href,base);return u.protocol==='https:'&&!u.username&&!u.password&&hosts.includes(u.hostname)?u.href:null;}catch{return null;}}
const newestFirst=(a,b)=>(b.reportDate??'').localeCompare(a.reportDate??'');
/** Candidates are dated official links; download and PDF-date validation remain caller responsibilities. */
export function discoverIowaReports(html,indexUrl=IOWA_INDEX_URL){
  const candidates=[];
  for(const a of anchors(html)){
    if(!/Waterfowl Migration Report for Week of /i.test(a.label))continue;
    const reportDate=namedDate(a.label),url=publicUrl(a.href,indexUrl,['www.iowadnr.gov','iowadnr.gov']);
    if(!reportDate||!url||!/(\/media\/\d+\/download|\.pdf(?:\?|$))/.test(url))fail('invalid official Iowa candidate');
    if(!candidates.some(c=>c.reportDate===reportDate&&c.url===url))candidates.push({sourceId:'iowa-dnr-migration',reportDate,url,status:'available',label:a.label});
  }
  if(!candidates.length)fail('no official Iowa report links found');return candidates.sort(newestFirst);
}
/** Returns available PDFs AND explicit weathered-out entries (url:null), never zero-count records. */
export function discoverInhsReports(html,indexUrl=INHS_INDEX_URL){
  const tables=[...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map(m=>m[1]);
  const table=tables.find(t=>/Illinois River/.test(t)&&/Central Mississippi River/.test(t));
  if(!table)fail('INHS two-river report table missing');
  const candidates=[];
  for(const row of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]);if(cells.length<2)continue;
    const dated=cells.slice(0,2).map(c=>anchors(c).map(a=>({...a,reportDate:numericDate(a.label)})).find(a=>a.reportDate));
    for(const [i,sourceId] of ['inhs-illinois-river','inhs-central-mississippi'].entries()){
      const label=plain(cells[i]);if(!label)continue;
      if(/weathered\s*out/i.test(label)){candidates.push({sourceId,reportDate:dated[1-i]?.reportDate??null,url:null,status:'weathered-out',label,dateBasis:dated[1-i]?'paired-index-row':'not-supplied'});continue;}
      const a=dated[i];if(!a)fail('unrecognized INHS date cell '+label);
      const url=publicUrl(a.href,indexUrl,['uofi.box.com','uofi.app.box.com']);
      if(!url||!/^\/s\/[a-z0-9]+$/i.test(new URL(url).pathname))fail('invalid official INHS report link');
      candidates.push({sourceId,reportDate:a.reportDate,url,status:'available',label});
    }
  }
  if(!candidates.some(c=>c.status==='available'))fail('no INHS report links found');return candidates.sort(newestFirst);
}

function assignedJson(html,name){
  const index=html.indexOf(name);if(index<0)fail('public Box metadata missing');
  const after=html.slice(index+name.length),assignment=after.match(/^\s*=\s*/);if(!assignment)fail('public Box metadata assignment changed');
  const text=after.slice(assignment[0].length);if(text[0]!=='{')fail('public Box metadata is not JSON');
  let depth=0,inString=false,escaped=false;
  for(let i=0;i<text.length;i++){
    const char=text[i];
    if(inString){if(escaped)escaped=false;else if(char==='\\')escaped=true;else if(char==='"')inString=false;continue;}
    if(char==='"')inString=true;
    else if(char==='{')depth++;
    else if(char==='}'&&--depth===0){try{return JSON.parse(text.slice(0,i+1));}catch{fail('public Box metadata is invalid JSON');}}
  }
  fail('public Box metadata is truncated');
}

/**
 * Resolve only a public, download-enabled university Box share. The returned
 * headers contain the share's short-lived anonymous read token: use in memory
 * for this download, never log/persist them or put them in report provenance.
 * No session cookie or user credential is read, and a disabled download fails.
 */
export function boxPdfUrl(html,shareUrl){
  const shared=publicUrl(shareUrl,INHS_INDEX_URL,['uofi.box.com','uofi.app.box.com']);
  const slug=shared&&new URL(shared).pathname.match(/^\/s\/([a-z0-9]+)$/i)?.[1];
  if(!slug)fail('not a public university Box share');
  const data=assignedJson(html,'Box.prefetchedData'),meta=data.preview_metadata;
  if(meta?.permissions?.can_download!==true||meta.is_download_available!==true||meta.extension!=='pdf')fail('public Box PDF download is not enabled');
  const token=data.preview_prefetch_token_map?.[meta.id]?.read;
  const url=publicUrl(meta.authenticated_download_url,'https://public.boxcloud.com/',['public.boxcloud.com']);
  if(typeof token!=='string'||!token||!url||!new URL(url).pathname.startsWith('/api/2.0/files/'))fail('public Box download metadata changed');
  if(typeof meta.name!=='string'||!meta.name.toLowerCase().endsWith('.pdf'))fail('public Box filename is not PDF');
  return {url,filename:meta.name,headers:{Authorization:'Bearer '+token,BoxApi:'shared_link=https://uofi.app.box.com/s/'+slug}};
}
