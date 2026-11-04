import {reportMetric,referenceStates} from './report-data.js';
import {dateKey} from '../engine.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>typeof value==='number'&&Number.isFinite(value)?value.toLocaleString('en-US'):'—';
const signed=value=>`${value>=0?'+':''}${number(value)}`;
const date=(key,options={month:'short',day:'numeric'})=>new Intl.DateTimeFormat('en-US',{...options,timeZone:'UTC'}).format(new Date(key+'T12:00:00Z'));
function reportDate(report){
  const period=report.observationPeriod;
  if(period?.start&&period?.end)return `Surveyed ${date(period.start)}–${date(period.end,{month:'short',day:'numeric',year:'numeric'})} · dates vary by area`;
  const prefix=report.datePrecision==='report-week-label'?'Week of ':report.datePrecision==='week-ending'?'Week ending ':report.datePrecision==='report-updated'?'Report updated ':report.datePrecision==='publication-date'?'Published ':'';
  return prefix+date(report.reportDate,{month:'short',day:'numeric',year:'numeric'});
}
function areaTable(report){
  if(!report.areas?.length)return '';
  const composition=report.areas.some(r=>r.mallardCompositionPercent!==undefined),habitat=report.areas.some(r=>r.wetPercent!==undefined),dates=report.areas.some(r=>r.date),regions=report.areas.some(r=>r.region);
  return `<div class="report-table-scroll"><table><caption>${esc(report.scope.name)} · source rows</caption><thead><tr><th scope="col">Area</th>${regions?'<th scope="col">Section</th>':''}${dates?'<th scope="col">Survey date</th>':''}<th scope="col">All ducks</th><th scope="col">${composition?'Mallard %':'Mallards'}</th>${habitat?'<th scope="col">Wet %</th><th scope="col">Ice %</th>':''}</tr></thead><tbody>${report.areas.map(row=>`<tr><th scope="row">${esc(row.name)}</th>${regions?`<td>${esc(row.region)}</td>`:''}${dates?`<td>${row.date?date(row.date):'—'}</td>`:''}<td>${number(row.allDucks)}</td><td>${number(composition?row.mallardCompositionPercent:row.mallardCount)}</td>${habitat?`<td>${number(row.wetPercent)}</td><td>${number(row.icePercent)}</td>`:''}</tr>`).join('')}</tbody></table></div><p class="small-copy">— means not recorded. An observed zero remains 0. Named rows and source sections are preserved.</p>`;
}
function history(report,species){
  if(!report.observations?.length)return '';
  const value=o=>species==='mallard'?o.counts?.mallard:o.allDucks,values=report.observations.map(value).filter(n=>typeof n==='number'),max=Math.max(1,...values);
  return `<div class="mini-history" aria-label="Dated agency estimates">${report.observations.map(o=>`<div><b>${number(value(o))}</b><i style="height:${typeof value(o)==='number'?Math.max(2,value(o)/max*44):0}px"></i><small>${date(o.weekOf)}</small></div>`).join('')}</div>`;
}
function context(report,species){
  if(report.sourceId==='iowa-dnr-migration')return species==='mallard'?`The report's ${number(report.summary.allDucks)} total ducks increased while mallard counts decreased.`:`Mallards were ${report.summary.mallardCompositionPercent}% of the mix; their reported count changed ${report.summary.mallardChangePercent}% from the previous week.`;
  const duplicate=report.overlaps?.find(o=>o.status==='confirmed-same-site-date-and-values');
  if(duplicate)return 'Includes the Loess Bluffs count shown in its own card. These reports overlap and are not added together.';
  return report.areas?.length?`${report.areas.length} named source rows. ${report.scope.description}`:report.scope.description;
}
export function renderReportCards(reports,{species='mallard',today=dateKey(new Date(),'America/Chicago'),sources=[]}={}){
  return reports.map(report=>{
    const source=sources.find(s=>s.id===report.sourceId),metric=reportMetric(report,species),age=Math.max(0,Math.round((Date.parse(today)-Date.parse(report.reportDate))/86400000));
    const fields=report.type==='field-notes',state=referenceStates(report).join(' / '),sourceName=source?.name??report.sourceId;
    let body;
    if(fields){
      body=`<h4 class="field-headline">${esc(report.headline)}</h4><p class="report-context">${esc(report.summaryNote)}</p>${report.observationPeriodLabel?`<p class="small-copy">${esc(report.observationPeriodLabel)}</p>`:''}<ul class="field-regions">${report.regions.slice(0,2).map(r=>`<li><strong>${esc(r.name)}</strong><span>${esc(r.note??'No report supplied.')}</span></li>`).join('')}</ul>`;
    }else{
      const change=metric.change===null?'':metric.changeUnit==='percent'?`${species==='mallard'?'Mallard count':'All-duck count'} ${signed(metric.change)}% from the previous week. Agency-reported change.`:`${signed(metric.change)} ${metric.label} from the previous report week.`;
      const habitat=report.observations?.at(-1)?.habitat;
      body=`<div class="report-number"><strong class="${metric.value===null?'metric-unavailable':''}">${metric.value===null?'Not reported':number(metric.value)+(metric.unit==='percent'?'%':'')}</strong><span>${esc(metric.label)}</span></div>${change?`<p class="report-change">${esc(change)}</p>`:''}${history(report,species)}<p class="report-context">${esc(context(report,species))}</p>${habitat?`<div class="habitat-line"><span><strong>${number(habitat.floodedAcres)}</strong> acres flooded</span><span><strong>${number(habitat.frozenWetlandPercent)}%</strong> wetlands frozen</span><span>Habitat <strong>${esc(habitat.condition)}</strong></span></div><p class="small-copy">Habitat figures belong to this refuge and report week.</p>`:''}`;
    }
    if(report.quality?.status==='incomplete')body=`<p class="report-quality"><strong>${esc(report.quality.label??'Partial survey')}</strong> ${esc(report.quality.note)}</p>${body}`;
    const baseline=report.referenceBaseline,baselineValue=species==='mallard'?baseline?.mallardCount:baseline?.allDucks;
    const comparisons=report.comparisons?.fiveYearAverage,comparisonValue=species==='mallard'?comparisons?.mallardCount:comparisons?.allDucks;
    const provenance=typeof report.provenance==='string'?report.provenance:Object.values(report.provenance??{}).join(' ');
    return `<article id="report-${esc(report.id)}" class="report-card${fields?' field-report-card':''}" tabindex="-1"><div class="report-meta"><span>${fields?'FIELD NOTES':'SURVEY COUNTS'} / ${esc(state)}</span><span>${age} days old</span></div><h3>${esc(report.title)}</h3><p class="report-scope">${esc(reportDate(report))}</p>${body}<p class="report-agency">${esc(sourceName)}</p><a class="source-link" href="${esc(report.url)}" target="_blank" rel="noreferrer">Read the original report ↗</a><details><summary>${fields?'See regional notes and source scope':'See source areas, scope, and comparisons'}</summary><p>${esc(report.scope.description)}</p><p>${esc(report.method)}</p>${fields?`<ul class="field-regions">${report.regions.map(r=>`<li><strong>${esc(r.name)}</strong><span>${esc(r.note??'No report supplied.')}</span></li>`).join('')}</ul>`:areaTable(report)}${baseline?`<p><strong>Historical reference:</strong> ${number(baselineValue)} ${esc(metric.label)}. ${esc(baseline.label)}. ${esc(baseline.note)}</p>`:''}${comparisons?`<p><strong>Published five-year reference:</strong> ${number(comparisonValue)} ${esc(metric.label)}. ${esc(report.comparisons.basis)}</p>`:''}${(report.notes??[]).map(note=>`<p>${esc(note)}</p>`).join('')}<p>${esc(provenance)}</p></details></article>`;
  }).join('');
}
