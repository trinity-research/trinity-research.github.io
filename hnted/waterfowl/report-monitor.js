const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when=(value,zone)=>{const time=Date.parse(value);return Number.isFinite(time)?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short',timeZone:zone}).format(time):'not recorded';};
const day=value=>/^\d{4}-\d{2}-\d{2}$/.test(value??'')?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z')):'not verified';
const unavailable=source=>['access-blocked','check-failed'].includes(source.status);
const attention=source=>['needs-review','review-link','date-unverified'].includes(source.status);
export function validateMonitoring(monitoring){
  if(monitoring===null||monitoring===undefined)return null;
  if(monitoring.schemaVersion!==1||!Number.isFinite(Date.parse(monitoring.checkedAt))||!Array.isArray(monitoring.sources)||!monitoring.sources.length)throw new Error('Invalid source-check snapshot.');
  const seen=new Set(),statuses=['current','needs-review','review-link','date-unverified','restricted','no-current-report','access-blocked','check-failed'];
  for(const source of monitoring.sources){
    if(!source.sourceId||seen.has(source.sourceId)||!statuses.includes(source.status)||!Number.isFinite(Date.parse(source.attemptedAt)))throw new Error('Invalid or duplicate source-check record.');
    seen.add(source.sourceId);
    for(const key of ['indexUrl','latestReportUrl'])if(source[key]){const url=new URL(source[key]);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Invalid source-check link.');}
    if(source.status==='current'&&!Number.isFinite(Date.parse(source.lastSuccessfulCheckAt)))throw new Error('A current source requires a successful check time.');
  }
  return monitoring;
}
export function sourceCheckLabel(source){
  return {current:source.mode==='automatic-import'?'Latest report imported':'No newer dated report found','needs-review':source.newerAvailable?'Newer report available':'Import needs review','review-link':'Source link needs review','date-unverified':'Latest report date unverified',restricted:'Official dashboard link only','no-current-report':'No current-season report located','access-blocked':'Source access unavailable','check-failed':'Source check failed'}[source.status]??'Check pending';
}
export function checksSummary(monitoring,{zone='America/Chicago'}={}){
  if(!monitoring?.sources?.length)return 'Automatic source checks have not completed for this saved release. Previously reviewed reports remain dated.';
  const sources=monitoring.sources,missing=sources.filter(unavailable).length,review=sources.filter(attention).length;
  return 'Source sweep '+when(monitoring.checkedAt,zone)+': '+sources.length+' sources attempted; '+missing+' unavailable; '+review+' awaiting import or review. Source-check dates are separate from survey dates.';
}
export function renderReportCheck(source,{zone='America/Chicago'}={}){
  if(!source)return '<p class="report-check">Manual record · automatic source check not recorded.</p>';
  const failed=unavailable(source),label=sourceCheckLabel(source),link=source.latestReportUrl??source.indexUrl;
  return '<div class="report-check'+(failed||attention(source)?' report-check-attention':'')+'"><strong>'+esc(label)+'</strong><span>'+(failed?'Last attempted '+esc(when(source.attemptedAt,zone))+' · last successful check '+esc(when(source.lastSuccessfulCheckAt,zone)):'Source checked '+esc(when(source.lastSuccessfulCheckAt,zone)))+'</span>'+(source.newerAvailable?'<a href="'+esc(link)+'" target="_blank" rel="noreferrer">Read newer source report · '+esc(day(source.latestReportDate))+' ↗</a>':'')+(source.noticeDate?'<span>Flight '+esc(day(source.noticeDate))+' weathered out; saved survey date retained.</span>':'')+'</div>';
}
export function renderSourceChecks(monitoring,{zone='America/Chicago'}={}){
  if(!monitoring?.sources?.length)return '';
  const rank=s=>attention(s)?0:unavailable(s)?1:s.status==='restricted'?2:3;
  return [...monitoring.sources].sort((a,b)=>rank(a)-rank(b)).map(s=>'<li><a href="'+esc(s.latestReportUrl??s.indexUrl)+'" target="_blank" rel="noreferrer">'+esc(s.name)+'</a><strong class="source-check-label">'+esc(sourceCheckLabel(s))+'</strong><p>'+esc(s.message)+'</p><small>'+(s.importedReportDate?'Saved observation/report date '+esc(day(s.importedReportDate))+'. ':'')+(s.latestReportDate?'Latest identified source report '+esc(day(s.latestReportDate))+'. ':'')+'</small>'+renderReportCheck(s,{zone})+'</li>').join('');
}
