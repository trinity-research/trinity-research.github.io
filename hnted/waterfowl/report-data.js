const count=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0;
export function referenceStates(report){return [...new Set(report.scope?.referenceStates??report.referenceStates??(report.scope?.state?[report.scope.state]:[]))];}
export function reportMetric(report,species='mallard'){
  if(report.type==='field-notes')return {value:null,unit:'narrative',label:'Regional field observations',change:null};
  const latest=report.observations?.at(-1),prior=report.observations?.at(-2),summary=report.summary??{};
  const value=species==='mallard'?(latest?.counts?.mallard??summary.mallardCount??null):(latest?.allDucks??summary.allDucks??null);
  const previous=species==='mallard'?(prior?.counts?.mallard??summary.previousMallardCount??null):(prior?.allDucks??summary.previousAllDucks??null);
  if(value===null&&species==='mallard'&&typeof summary.mallardCompositionPercent==='number')return {value:summary.mallardCompositionPercent,unit:'percent',label:'mallard share of the surveyed mix',change:summary.mallardChangePercent??null,changeUnit:'percent'};
  if(species==='allDucks'&&typeof summary.allDucksChangePercent==='number')return {value,unit:'count',label:'ducks (source total)',change:summary.allDucksChangePercent,changeUnit:'percent'};
  return {value,unit:'count',label:species==='mallard'?'mallards':'ducks (source total)',change:count(value)&&count(previous)?value-previous:null,changeUnit:'count'};
}

export function validateReports(data){
  if(!Array.isArray(data.sources)||!Array.isArray(data.reports)||!data.reports.length)throw new Error('Report sources and records are required.');
  const sources=new Set(),ids=new Set();
  for(const source of data.sources){if(!source.id||sources.has(source.id))throw new Error('Duplicate or missing report source.');sources.add(source.id);}
  const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  const validatePair=record=>{for(const key of ['mallardCount','allDucks'])if(record?.[key]!==undefined&&record[key]!==null&&!count(record[key]))throw new Error('Invalid non-negative count: '+key);if(count(record?.mallardCount)&&count(record?.allDucks)&&record.mallardCount>record.allDucks)throw new Error('Mallards exceed the all-duck count.');};
  const validateUrls=value=>{if(!value||typeof value!=='object')return;for(const [key,item] of Object.entries(value)){if(/^(url|reportUrl|indexUrl|sourceUrl|sourcePage|termsUrl)$/.test(key)&&typeof item==='string'){const u=new URL(item);if(u.protocol!=='https:'||u.username||u.password)throw new Error('Invalid source URL.');}else if(typeof item==='object')validateUrls(item);}};
  validateUrls(data);
  for(const report of data.reports){
    if(!report.id||ids.has(report.id))throw new Error('Duplicate or missing report id.');ids.add(report.id);
    if(!sources.has(report.sourceId))throw new Error('Unknown report source.');
    if(!validDate(report.reportDate))throw new Error('Invalid report date.');
    if(!report.title||!report.scope?.description||!report.url)throw new Error('Report title, scope, and URL are required.');
    if(!referenceStates(report).length)throw new Error('A report reference state is required.');
    validatePair(report.summary);
    for(const row of report.areas??[]){validatePair(row);if(row.date&&!validDate(row.date))throw new Error('Invalid area observation date.');for(const key of ['wetPercent','icePercent','mallardCompositionPercent'])if(row[key]!==undefined&&row[key]!==null&&(!count(row[key])||row[key]>100))throw new Error('Invalid percentage.');}
    for(const observation of report.observations??[])validatePair({mallardCount:observation.counts?.mallard,allDucks:observation.allDucks});
    if(report.type==='field-notes'&&(report.summary?.mallardCount!==null||report.summary?.allDucks!==null))throw new Error('Field narratives cannot supply inferred numeric totals.');
    for(const overlap of report.overlaps??[])if(overlap.status==='confirmed-same-site-date-and-values'){
      const other=data.reports.find(r=>r.id===overlap.reportId);if(!other)throw new Error('Confirmed overlap report missing.');
      if(reportMetric(other,'mallard').value!==overlap.mallardCount||reportMetric(other,'allDucks').value!==overlap.allDucks)throw new Error('Confirmed duplicate values disagree.');
    }
  }
  return data;
}

export function selectReports(reports,{state='',type='all'}={}){
  return reports.filter(r=>(!state||referenceStates(r).includes(state))&&(type==='all'||(type==='field-notes')===(r.type==='field-notes')));
}
