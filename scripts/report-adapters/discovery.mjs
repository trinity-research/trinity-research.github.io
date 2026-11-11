const entities={'&amp;':'&','&nbsp;':' ','&quot;':'"','&#039;':"'",'&ndash;':'–','&mdash;':'—'};
export const plain=html=>String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&(?:amp|nbsp|quot|ndash|mdash);|&#039;/g,v=>entities[v]).replace(/\s+/g,' ').trim();
export function links(html,base){return [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].flatMap(([,href,label])=>{try{const url=new URL(href.replaceAll('&amp;','&'),base);return url.protocol==='https:'?[{url:url.href,label:plain(label)}]:[];}catch{return [];}});}
const months={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
export function reportDate(text,{year,today}={}){
  let match=String(text).match(/\b(20\d{2})[-_/](\d{1,2})[-_/](\d{1,2})\b/),parts;
  if(match)parts=[+match[1],+match[2],+match[3]];
  else if((match=String(text).match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2}|\d{2})\b/)))parts=[+match[3]+(match[3].length===2?2000:0),+match[1],+match[2]];
  else if((match=String(text).match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:\s*[-–]\s*\d{1,2})?(?:,?\s+(20\d{2}))?/i)))parts=[+(match[3]??year),months[match[1].slice(0,3).toLowerCase()],+match[2]];
  if(!parts||parts.some(v=>!Number.isInteger(v))||parts[1]<1||parts[1]>12||parts[2]<1||parts[2]>31)return null;
  const date=parts.map((n,i)=>String(n).padStart(i?2:4,'0')).join('-');
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date||today&&date>today)return null;
  return date;
}
export function latestLink(html,base,{today,pattern,minimum='2000-01-01'}={}){
  const candidates=links(html,base).filter(a=>!pattern||pattern.test(a.label+' '+a.url)).map(a=>({...a,reportDate:reportDate(a.label,{year:+(a.url.match(/\/(20\d{2})(?:\/|-)/)?.[1]??today.slice(0,4)),today})??reportDate(a.url,{today})})).filter(a=>a.reportDate&&a.reportDate>=minimum&&a.reportDate<=today);
  candidates.sort((a,b)=>b.reportDate.localeCompare(a.reportDate));return candidates[0]??null;
}
export function oklahomaNotices(html,url,{today}){
  const starts=[...html.matchAll(/class=["'][^"']*masonry-item[^"']*["']/gi)].map(m=>m.index),areas=[];
  for(let i=0;i<starts.length;i++){
    const text=plain(html.slice(starts[i],starts[i+1]??html.length)),updated=text.match(/Updated\s*:?\s*([^]*?20\d{2})/i);
    if(!updated)continue;const date=reportDate(updated[1],{today});if(date)areas.push({reportDate:date,noReport:/\bno report\b/i.test(text),label:text.slice(0,100)});
  }
  if(!areas.length)throw new Error('Oklahoma dated area cards were not found.');
  areas.sort((a,b)=>b.reportDate.localeCompare(a.reportDate));
  return {url,reportDate:areas[0].reportDate,label:'Oklahoma area updates',areasChecked:areas.length,newestAreaCount:areas.filter(a=>a.reportDate===areas[0].reportDate).length,noReportAreas:areas.filter(a=>a.noReport).length};
}
export function inhsLinks(html,base,{today}){
  const rows=[...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>c[1])).filter(c=>c.length>=2);
  const find=column=>rows.map(c=>{const a=links(c[column],base)[0];return a?{...a,reportDate:reportDate(a.label,{today})}:null;}).filter(a=>a?.reportDate).sort((a,b)=>b.reportDate.localeCompare(a.reportDate))[0]??null;
  const datedRows=rows.map(c=>({cells:c,date:reportDate(plain(c[0]),{today})??reportDate(plain(c[1]),{today})})).filter(r=>r.date).sort((a,b)=>b.date.localeCompare(a.date));
  return {illinois:find(0),mississippi:find(1),mississippiWeatheredOut:datedRows[0]&&/weathered\s+out/i.test(plain(datedRows[0].cells[1]))?datedRows[0].date:null};
}
export function discoveryState({sourceId,name,indexUrl,checkedAt,candidate,record,weatheredOut=null,mode='review',prior=null}){
  const reportDate=record?.reportDate??null,newer=Boolean(candidate?.reportDate&&(!reportDate||candidate.reportDate>reportDate));
  return {sourceId,name,indexUrl,mode,attemptedAt:checkedAt,lastSuccessfulCheckAt:checkedAt,lastImportedAt:prior?.lastImportedAt??null,importedReportDate:reportDate,latestReportDate:candidate?.reportDate??reportDate,latestReportUrl:candidate?.url??record?.url??indexUrl,status:newer?'needs-review':record?'current':'no-current-report',message:weatheredOut?'Latest flight was weathered out; the previous completed survey remains dated.':newer?'A newer official report is available. Its data has not been imported yet.':record?'No newer report was found in the checked source.':'No current-season report located in this check.',...(weatheredOut?{noticeDate:weatheredOut}:{}),newerAvailable:newer};
}
