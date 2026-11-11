// Pure, fail-closed adapters. Fetching, hashes and publication belong to the refresh runner.
export const LOESS_COLLECTION_URL = 'https://www.fws.gov/library/collections/loess-bluffs-2026-waterfowl-and-bald-eagle-surveys';
export const MISSOURI_VIEWER_URL = 'https://mdc12.mdc.mo.gov/Applications/PublicReportViewer/ReportView/ReportViewer.aspx?report=400';

const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
const numeric = '(?:0|[1-9]\\d*|[1-9]\\d{0,2}(?:,\\d{3})+)';
const clone = value => structuredClone(value);
const plain = html => decodeEntities(String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();
function requireValue(ok, message) { if (!ok) throw new Error(message); }
function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_,entity) => {
    const e=entity.toLowerCase();
    if(e[0]==='#') { const n=e[1]==='x'?parseInt(e.slice(2),16):Number(e.slice(1)); return n>0&&n<=0x10ffff?String.fromCodePoint(n):' '; }
    return {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[e];
  });
}
function isoDate(value) {
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(value),`Invalid report date: ${value}`);
  const date=new Date(`${value}T00:00:00Z`);
  requireValue(Number.isFinite(+date)&&date.toISOString().slice(0,10)===value,`Invalid calendar date: ${value}`);
  return value;
}
function slashDate(value) {
  const match=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  requireValue(match,`Invalid observation date: ${value}`);
  return isoDate(`${match[3]}-${match[1].padStart(2,'0')}-${match[2].padStart(2,'0')}`);
}
function namedDate(value) {
  const match=/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(value.trim());
  requireValue(match&&months.includes(match[1].toLowerCase()),`Invalid named date: ${value}`);
  return isoDate(`${match[3]}-${String(months.indexOf(match[1].toLowerCase())+1).padStart(2,'0')}-${match[2].padStart(2,'0')}`);
}
function count(value, label, missing=false) {
  const text=String(value??'').trim();
  if(missing&&/^(?:|N\/?A|[-—])$/i.test(text))return null;
  requireValue(new RegExp(`^${numeric}$`).test(text),`Invalid count for ${label}: ${text}`);
  const n=Number(text.replaceAll(',',''));
  requireValue(Number.isSafeInteger(n)&&n>=0,`Unsafe count for ${label}`);
  return n;
}
function pair(allDucks,mallards,label) {
  requireValue(allDucks===null||mallards===null||mallards<=allDucks,`Mallards exceed all ducks: ${label}`);
}
function officialUrl(value,base,host) {
  const url=new URL(decodeEntities(value),base);
  requireValue(url.protocol==='https:'&&url.hostname===host&&!url.username&&!url.password,`Unexpected official URL: ${url}`);
  return url.href;
}
function existingRecord(existing,sourceId,reportDate) {
  requireValue(existing&&existing.sourceId===sourceId,`Expected existing record for ${sourceId}`);
  isoDate(reportDate);
  requireValue(!existing.reportDate||reportDate>=existing.reportDate,'Refusing an older report');
  return clone(existing);
}

/** Discover the public search endpoint from the collection's own embedded config. */
export function loessCollectionSearchUrl(html) {
  const match=/var\s+fws_search_app_config\s*=\s*({[^\n]+?})\s*;/.exec(html);
  requireValue(match,'FWS collection search configuration not found');
  const config=JSON.parse(match[1]);
  requireValue(config.id==='library_collections_content','Unexpected FWS search index');
  const nid=config.app?.contextualFilters?.nid;
  requireValue(Array.isArray(nid)&&nid.length===1&&/^\d+$/.test(nid[0]),'Missing collection identifier');
  const url=new URL(`/fws_search/${config.id}`,'https://www.fws.gov');
  const defaults=config.app?.serviceDefaults??{};
  for(const key of ['view_mode','$orderby','print_view_mode'])if(defaults[key]!==undefined)url.searchParams.set(key,String(defaults[key]));
  url.searchParams.set('$top','100');
  url.searchParams.set('nid',JSON.stringify(nid));
  return url.href;
}

/** Survey dates come from linked document titles, not guessed filenames/publication times. */
export function parseLoessListing(input) {
  const data=typeof input==='string'?JSON.parse(input):input;
  requireValue(Array.isArray(data?.list),'Invalid FWS collection response');
  requireValue(data._meta?.total===undefined||data._meta.total<=data.list.length,'FWS collection response is incomplete; request all entries before selecting newest');
  const records=new Map();
  for(const row of data.list) {
    requireValue(typeof row==='string','Invalid FWS collection entry');
    for(const anchor of row.matchAll(/<a\b[^>]*\bhref=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const title=plain(anchor[2]);
      const match=/^Loess Bluffs Waterfowl Survey (\d{1,2})-(\d{1,2})-(\d{4})$/i.exec(title);
      if(!match)continue;
      const reportDate=slashDate(`${match[1]}/${match[2]}/${match[3]}`);
      const landingUrl=officialUrl(anchor[1],'https://www.fws.gov','www.fws.gov');
      requireValue(new URL(landingUrl).pathname.startsWith('/media/'),'Unexpected FWS landing path');
      requireValue(!records.has(reportDate)||records.get(reportDate).landingUrl===landingUrl,'Conflicting FWS survey links');
      records.set(reportDate,{reportDate,landingUrl,title});
    }
  }
  requireValue(records.size>0,'No linked Loess Bluffs waterfowl surveys');
  return [...records.values()].sort((a,b)=>b.reportDate.localeCompare(a.reportDate));
}

export function loessPdfUrl(html,landingUrl) {
  officialUrl(landingUrl,'https://www.fws.gov','www.fws.gov');
  const links=[];
  for(const match of html.matchAll(/\bhref=["']([^"']+\.pdf(?:\?[^"']*)?)["']/gi)) {
    const url=officialUrl(match[1],landingUrl,'www.fws.gov');
    if(/^\/sites\/default\/files\/documents\/.*\/loess[_-]bluffs[_-]waterfowl[_-]survey[_\d-]+\.pdf$/i.test(new URL(url).pathname))links.push(url);
  }
  const unique=[...new Set(links)];
  requireValue(unique.length===1,'Missing or ambiguous official Loess Bluffs PDF link');
  return unique[0];
}

/** URLs are exposed public export links, transient and not suitable for stored source URLs. */
export function parseMissouriViewer(html) {
  const text=plain(html);
  requireValue(text.includes('Missouri Waterfowl and Habitat Survey'),'Not the Missouri abundance report');
  const date=/Comments as of:\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i.exec(text);
  requireValue(date,'Missouri report week label not found');
  const reportDate=namedDate(date[1]);
  const availableReportDates=[];
  for(const m of html.matchAll(/<option\b[^>]*>([\s\S]*?)<\/option>/gi)) {
    const value=plain(m[1]);
    if(/^[A-Za-z]+\s+\d{1,2},?\s+\d{4}$/.test(value))availableReportDates.push(namedDate(value));
  }
  const dates=[...new Set(availableReportDates)].sort();
  requireValue(dates.length>0&&dates.at(-1)===reportDate,'Missouri viewer did not render its newest available week');
  const match=/"ExportUrlBase":"((?:[^"\\]|\\.)*)"/.exec(html);
  requireValue(match,'Missouri public export URL not found');
  const exportBase=officialUrl(JSON.parse(`"${match[1]}"`),MISSOURI_VIEWER_URL,'mdc12.mdc.mo.gov');
  requireValue(new URL(exportBase).pathname.endsWith('/Reserved.ReportViewerWebControl.axd')&&/[?&]Format=$/.test(exportBase),'Unexpected Missouri export endpoint');
  return {reportDate,availableReportDates:dates,csvUrl:`${exportBase}CSV`,pdfUrl:`${exportBase}PDF`};
}

const loessFirst=[
  ['Greater White-fronted Goose','greaterWhiteFrontedGoose',false],['Snow Goose','snowGoose',false],
  ["Ross's Goose",'rossGoose',false],['Canada Goose','canadaGoose',false],['Trumpeter Swan','trumpeterSwan',false],['Tundra Swan','tundraSwan',false],
  ['Wood Duck','woodDuck'],['Gadwall','gadwall'],['American Wigeon','americanWigeon'],['American Black Duck','americanBlackDuck'],
  ['Mallard','mallard'],['Blue-winged Teal','blueWingedTeal'],['Cinnamon Teal','cinnamonTeal'],['Northern Shoveler','northernShoveler']
];
const loessSecond=[
  ['Northern Pintail','northernPintail'],['Green-winged Teal','greenWingedTeal'],['Canvasback','canvasback'],['Redhead','redhead'],
  ['Ring-necked Duck','ringNeckedDuck'],['Scaup','scaupGroup'],['Bufflehead','bufflehead'],['Common Goldeneye','commonGoldeneye'],
  ['Hooded Merganser','hoodedMerganser'],['Common Merganser','commonMerganser'],['Red-breasted Merganser','redBreastedMerganser'],['Ruddy Duck','ruddyDuck'],
  ['Pied-billed Grebe','piedBilledGrebe',false],['Horned Grebe','hornedGrebe',false],['Eared Grebe','earedGrebe',false],['American Coot','americanCoot',false]
];
const escapeRegex=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const dateTokens=text=>[...text.matchAll(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g)].map(m=>slashDate(m[0]));
function sameDates(block,dates,label) {
  const actual=dateTokens(block);
  requireValue(actual.length===dates.length&&actual.every((date,i)=>date===dates[i]),`Changed or mismatched date columns in ${label}`);
}

// Some Poppler builds detach the labels from their numeric rows. Read numeric
// columns in their printed order, only after checking the complete ordered row
// labels, four date headers, numeric column separation and exact row counts.
function layoutTable(block,labels,dates,label) {
  sameDates(block,dates,label);
  const normalized=block.replaceAll('’',"'");
  let cursor=0;
  for(const name of labels) {
    const re=new RegExp(`^\\s*${escapeRegex(name)}(?=\\s|$)`,'gm');
    const found=[...normalized.matchAll(re)];
    requireValue(found.length===1&&found[0].index>=cursor,`Missing, duplicate or reordered ${label} row: ${name}`);
    cursor=found[0].index+found[0][0].length;
  }
  const tokens=[];
  for(const line of normalized.split(/\r?\n/)) {
    const masked=line.replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,m=>' '.repeat(m.length));
    for(const m of masked.matchAll(/(?<![\w.,-])\d[\d,]*(?![\w.,])/g))tokens.push({value:count(m[0],label),end:m.index+m[0].length});
    requireValue(!/(?<!\w)-\d/.test(masked),`Negative count in ${label}`);
  }
  requireValue(tokens.length===labels.length*dates.length,`Incomplete numeric rows in ${label}`);
  const positions=[...new Set(tokens.map(t=>t.end))].sort((a,b)=>a-b);
  const gaps=positions.slice(1).map((position,i)=>({gap:position-positions[i],cut:(position+positions[i])/2})).sort((a,b)=>b.gap-a.gap);
  const selected=gaps.slice(0,dates.length-1);
  requireValue(selected.length===dates.length-1&&selected.every(g=>g.gap>=5),'Ambiguous numeric columns');
  const cuts=selected.map(g=>g.cut).sort((a,b)=>a-b);
  const columns=dates.map(()=>[]);
  for(const token of tokens)columns[cuts.filter(c=>token.end>c).length].push(token.value);
  requireValue(columns.every(c=>c.length===labels.length),`Unequal numeric columns in ${label}`);
  return labels.map((_,r)=>columns.map(c=>c[r]));
}

/** Input must be pdftotext -layout output for the complete two-page report. */
export function parseLoessBluffsText(text,existing,reportDate,documentUrl) {
  const result=existingRecord(existing,'usfws-loess-bluffs',reportDate);
  requireValue(documentUrl||reportDate===existing.reportDate,'A fresh discovered PDF URL is required for a new Loess report');
  const url=officialUrl(documentUrl??existing.url,LOESS_COLLECTION_URL,'www.fws.gov');
  requireValue(new URL(url).pathname.endsWith('.pdf'),'Loess source must be the discovered PDF URL');
  requireValue(/Loess Bluffs National Wildlife Refuge.*Habitat, Waterfowl and Eagle Survey Report/.test(text),'Not a Loess Bluffs survey report');
  const date=/^Date:\s*(\d{4}-\d{2}-\d{2})\s*$/m.exec(text);
  requireValue(date&&date[1]===reportDate,'Loess PDF date disagrees with linked report');
  const habitat=text.split('Habitat Conditions Summary:')[1]?.split('Waterfowl Species Summary:')[0];
  const waterfowl=text.split('Waterfowl Species Summary:')[1]?.split('Species Group Summary:')[0];
  const group=text.split('Species Group Summary:')[1]?.split('Eagles Summary:')[0];
  requireValue(habitat&&waterfowl&&group,'Loess report sections missing');
  const dates=dateTokens(habitat);
  requireValue(dates.length===4&&new Set(dates).size===4&&dates.every((d,i)=>i===0||d>dates[i-1])&&dates.at(-1)===reportDate,'Invalid four-week Loess history');
  // The continuation page has its own Species header; never join its columns
  // to page 1 without checking that the dates and full known row sets agree.
  const headers=[...waterfowl.matchAll(/(?:\f|\n)\s*Species\s+Number of/g)];
  requireValue(headers.length===2,'Loess species continuation header missing or changed');
  const split=headers[1].index;
  const first=layoutTable(waterfowl.slice(0,split),loessFirst.map(r=>r[0]),dates,'first species table');
  const second=layoutTable(waterfowl.slice(split),loessSecond.map(r=>r[0]),dates,'second species table');
  const groups=layoutTable(group,['Geese','Dabblers','Divers','All Ducks','Shorebirds'],dates,'species group table');
  const conditionRows=[...habitat.matchAll(/^[ \t]*Habitat(?:[ \t]+Conditions Rating)?[ \t]+(.+)$/gm)].map(m=>m[1].trim().split(/\s{2,}/)).filter(values=>values.length===4&&!values.some(v=>v.includes('/')));
  requireValue(conditionRows.length===1,'Habitat condition row missing or ambiguous');
  const conditions=conditionRows[0];
  requireValue(conditions?.length===4&&conditions.every(c=>/^[A-Za-z][A-Za-z -]*$/.test(c)),'Invalid habitat condition row');
  const acres=/^[ \t]*Acres of wetlands(?: flooded)?[ \t]+(.+)$/m.exec(habitat)?.[1].trim().split(/\s+/);
  const frozen=/^[ \t]*Percentage of(?: Wetlands Frozen)?[ \t]+(.+)$/m.exec(habitat)?.[1].trim().split(/\s+/);
  requireValue(acres?.length===4&&frozen?.length===4,'Missing habitat numeric columns');
  const observations=dates.map((weekOf,i)=>{
    const counts={},otherBirdCounts={};
    for(const [rows,values] of [[loessFirst,first],[loessSecond,second]])for(let r=0;r<rows.length;r++)(rows[r][2]===false?otherBirdCounts:counts)[rows[r][1]]=values[r][i];
    const allDucks=groups[3][i];
    const speciesDuckSum=Object.values(counts).reduce((a,b)=>a+b,0);
    requireValue(groups[1][i]+groups[2][i]===allDucks,`Loess duck groups do not reconcile for ${weekOf}`);
    pair(allDucks,counts.mallard,weekOf);
    requireValue(/^\d+(?:\.\d+)?%$/.test(frozen[i]),'Invalid frozen-wetland percentage');
    const frozenWetlandPercent=Number(frozen[i].slice(0,-1));
    requireValue(frozenWetlandPercent<=100,'Frozen-wetland percentage exceeds 100');
    return {weekOf,counts,otherBirdCounts,allDucks,habitat:{condition:conditions[i],floodedAcres:count(acres[i],'flooded acres'),frozenWetlandPercent},validation:{speciesDuckSum,groupDuckSum:groups[1][i]+groups[2][i],publishedTotalMatchesSpecies:speciesDuckSum===allDucks,publishedTotalMatchesGroups:true}};
  });
  const history=new Map((result.observations??[]).map(o=>[o.weekOf,o]));
  for(const observation of observations)history.set(observation.weekOf,observation);
  result.id=`loess-bluffs-${reportDate}`;
  result.type='survey-counts';
  result.reportDate=reportDate;
  result.url=url;
  result.referenceStates=['MO'];
  result.observations=[...history.values()].sort((a,b)=>a.weekOf.localeCompare(b.weekOf));
  requireValue(result.observations.at(-1).weekOf===reportDate,'Existing Loess observations are newer than this report');
  result.provenance={...result.provenance,species:`PDF pages 1-2, Waterfowl Species Summary; four columns ${dates.join(', ')}.`,groups:'PDF page 2, Species Group Summary; All Ducks equals Dabblers + Divers; independent species sums retained in observation validation.',habitat:'PDF page 1, Habitat Conditions Summary; dates, condition, flooded acres and frozen percent retained.'};
  result.notes=(result.notes??[]).filter(n=>!n.startsWith('Published species-total check:'));
  for(const o of result.observations.filter(o=>o.validation?.publishedTotalMatchesSpecies===false))result.notes.push(`Published species-total check: ${o.weekOf} duck species sum ${o.validation.speciesDuckSum}, while the agency All Ducks total is ${o.allDucks}; both source values are retained.`);
  return result;
}

/** Minimal RFC 4180 reader: quoted newlines/commas and escaped quotes are data. */
function csvRows(text) {
  const rows=[];let row=[],cell='',quoted=false,afterQuote=false;
  const source=text.replace(/^\uFEFF/,'');
  for(let i=0;i<source.length;i++) {
    const c=source[i];
    if(quoted) { if(c==='"'&&source[i+1]==='"'){cell+='"';i++;} else if(c==='"'){quoted=false;afterQuote=true;}else cell+=c;continue; }
    if(c==='"'){requireValue(cell===''&&!afterQuote,'Invalid CSV quote');quoted=true;continue;}
    if(c===','||c==='\n'||c==='\r') {
      row.push(cell);cell='';afterQuote=false;
      if(c!==','){rows.push(row);row=[];if(c==='\r'&&source[i+1]==='\n')i++;}
    } else {requireValue(!afterQuote,'Unexpected text after CSV quote');cell+=c;}
  }
  requireValue(!quoted,'Unterminated CSV field');
  if(cell!==''||row.length||afterQuote){row.push(cell);rows.push(row);}
  return rows;
}
const missouriKeys={'Gadwalls':'gadwall','Mallards':'mallard','Mixed Dabblers':'mixedDabblers','Mixed Divers':'mixedDivers','Mixed Ducks':'mixedDucks','Pintails':'northernPintail','Ring-Necked Ducks':'ringNeckedDuck','Shovelers':'northernShoveler','Teal':'tealGroup','Wigeon':'wigeonGroup'};
function composition(text,label) {
  const rows=[];
  for(const line of text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)) {
    const match=/^([^:]+):\s*(.*)$/.exec(line);
    requireValue(match,`Invalid composition row in ${label}`);
    requireValue(!rows.some(r=>r.label===match[1]),`Duplicate species row in ${label}`);
    rows.push({label:match[1],count:count(match[2],`${label} ${match[1]}`,true)});
  }
  return rows;
}
function summaryCount(text,re,label) { const m=re.exec(text);requireValue(m,`Missing Missouri ${label}`);return count(m[1],label); }

export function parseMissouriCsv(text,existing,reportDate) {
  const result=existingRecord(existing,'mdc-waterfowl-counts',reportDate);
  const rows=csvRows(text);
  requireValue(rows[0]?.[0]==='Textbox1'&&rows[0]?.[1]==='Comment','Unexpected Missouri survey CSV header');
  const meta=rows[1]?.join('\n')??'';
  requireValue(meta.includes('Coordinated statewide surveys of Conservation Area wetlands and National Wildlife Refuges'),'Not the coordinated abundance survey');
  const date=/Comments as of:\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/.exec(meta);
  requireValue(date&&namedDate(date[1])===reportDate,'Missouri CSV report week disagrees with viewer');
  const allDucks=summaryCount(meta,new RegExp(`statewide tally for this week is (${numeric}) ducks`,'i'),'all-duck total');
  const mallardCount=summaryCount(meta,new RegExp(`Our estimate of (${numeric}) mallards`,'i'),'mallard total');
  pair(allDucks,mallardCount,'Missouri summary');
  const header=rows.findIndex(r=>r[0]==='Area'&&r[1]==='Date'&&r[2]==='Ducks');
  requireValue(header>=0&&rows[header].length===7&&rows[header][4]==='Canada_Geese'&&rows[header][5]==='Snow_Geese','Missouri area table header missing or changed');
  const areas=[];
  for(const row of rows.slice(header+1)) {
    if(row.every(c=>!c.trim()))continue;
    requireValue(row.length===7&&row[0].trim(),'Unexpected Missouri area row');
    const name=row[0].trim();
    requireValue(!areas.some(a=>a.name===name),`Duplicate Missouri area: ${name}`);
    const date=slashDate(row[1].trim());
    const counts={};
    const speciesComposition=composition(row[3],name);
    for(const species of speciesComposition)if(missouriKeys[species.label])counts[missouriKeys[species.label]]=species.count;
    const mallards=counts.mallard??null;
    const ducks=count(row[2],`${name} ducks`,true);
    pair(ducks,mallards,name);
    const old=result.areas?.find(a=>a.name===name);
    const area={...clone(old??{}),name,date,allDucks:ducks,mallardCount:mallards,counts,speciesComposition,canadaGeese:count(row[4],`${name} Canada geese`,true),snowGeese:count(row[5],`${name} snow geese`,true),otherSpeciesComposition:composition(row[6],`${name} other birds`),surveyGeometry:old?.surveyGeometry??null,marker:old?.marker??null};
    if(old?.overlapReportId&&(old.date!==date||old.allDucks!==ducks||old.mallardCount!==mallards))delete area.overlapReportId;
    areas.push(area);
  }
  requireValue(areas.length>0,'Missouri report has no area counts');
  const dates=areas.map(a=>a.date).sort();
  requireValue(dates.every(d=>Math.abs(Date.parse(d)-Date.parse(reportDate))<=7*86400000),'Area dates are outside the survey week');
  const missingAreaCounts=areas.filter(a=>a.allDucks===null||a.mallardCount===null).length;
  const areaAllDucksSum=areas.reduce((n,a)=>n+(a.allDucks??0),0);
  const areaMallardSum=areas.reduce((n,a)=>n+(a.mallardCount??0),0);
  requireValue(areaAllDucksSum<=allDucks&&areaMallardSum<=mallardCount,'Missouri area sums exceed published totals');
  if(!areas.some(a=>a.allDucks===null))requireValue(areaAllDucksSum===allDucks,'Missouri area duck sum differs from published total');
  if(!areas.some(a=>a.mallardCount===null))requireValue(areaMallardSum===mallardCount,'Missouri area mallard sum differs from published total');
  const comparisons={basis:'Agency-reported comparisons for surveyed areas, not week-over-week changes.'};
  for(const [key,years] of [['fiveYearAverage','five-year'],['twentyYearAverage','20-year']]) {
    const d=new RegExp(`(-?\\d+(?:\\.\\d+)?)% (less|more|greater) than the previous ${years} average of (${numeric}) ducks`,'i').exec(meta);
    const m=new RegExp(`(-?\\d+(?:\\.\\d+)?)% (less|more|greater) than the (?:previous )?${years} estimate of (${numeric}) mallards`,'i').exec(meta);
    // No stale comparison is carried forward if the agency changes this text.
    requireValue(d&&m,`Missing Missouri ${years} comparison`);
    const percent=match=>(match[2].toLowerCase()==='less'?-1:1)*Math.abs(Number(match[1]));
    comparisons[key]={allDucks:count(d[3],`${years} ducks`),mallardCount:count(m[3],`${years} mallards`),allDucksPercentChange:percent(d),mallardPercentChange:percent(m)};
  }
  result.id=`missouri-${reportDate}`;result.type='survey-counts';result.reportDate=reportDate;result.referenceStates=['MO'];
  result.url=MISSOURI_VIEWER_URL;
  result.summary={allDucks,mallardCount,areaCount:areas.length,previousAllDucks:null,previousMallardCount:null};
  result.areas=areas;result.comparisons=comparisons;
  result.observationPeriod={start:dates[0],end:dates.at(-1),datesVaryByArea:new Set(dates).size>1};
  if(result.scope)result.scope.description=`${areas.length} listed conservation areas and refuges; not a census of every wetland or duck in Missouri.`;
  result.provenance={...result.provenance,summary:`Report comments labelled ${reportDate}; factual values from the public CSV export.`,areas:'Specific Area Results; each row retains its actual date and original species/group labels.'};
  delete result.provenance.latestCheck;
  result.overlaps=(result.overlaps??[]).filter(o=>areas.some(a=>a.name===o.areaName)).map(o=>{
    if(o.status!=='confirmed-same-site-date-and-values')return o;
    const area=areas.find(a=>a.name===o.areaName);
    const old=existing.areas?.find(a=>a.name===o.areaName);
    return {...o,allDucks:area.allDucks,mallardCount:area.mallardCount,observationDate:area.date,...(old?.date!==area.date||o.allDucks!==area.allDucks||o.mallardCount!==area.mallardCount?{status:'same-site-observation-needs-reconciliation'}:{})};
  });
  result.validation={areaAllDucksSum,areaMallardSum,publishedTotalsMatchAreaSums:missingAreaCounts===0&&areaAllDucksSum===allDucks&&areaMallardSum===mallardCount,missingAreaCounts};
  result.notes=[...new Set((result.notes??[]).filter(n=>!/^Report date labels (?:the agency survey week|the survey week)/.test(n)))];
  result.notes.push('Report date labels the agency survey week; individual area dates are retained separately.');
  if(missingAreaCounts)result.quality={status:'incomplete',description:'Some listed area or species counts are missing; blanks are unknown, not zero.'};
  else if(result.quality?.status==='incomplete')delete result.quality;
  return result;
}
