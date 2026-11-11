// Discovery only: these functions return dates and structure, never agency prose,
// inferred counts, or a replacement for the separately reviewed field narrative.
const MN_URL = 'https://www.dnr.state.mn.us/hunting/waterfowl/report.html';
const SD_URL = 'https://gfp.sd.gov/migration-reports/';
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const fields = ['summary', 'habitat', 'migration', 'weather', 'activity'];
const sdRegions = ['Northeast', 'East Central', 'Southeast', 'Lower River/South Central', 'James River Valley', 'Pierre Area/Central SD'];

function inputHtml(html) {
  if (typeof html !== 'string' || html.length > 2_000_000 || !html.trim()) throw new Error('Missing or oversized northern report HTML.');
  return html;
}

function plain(value) {
  return value.replace(/<[^>]*>/g, ' ').replace(/&(?:nbsp|#160);/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
}

function date(year, month, day) {
  const result = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (result.getUTCFullYear() !== Number(year) || result.getUTCMonth() + 1 !== Number(month) || result.getUTCDate() !== Number(day)) throw new Error('Invalid northern report date.');
  return result.toISOString().slice(0, 10);
}

function checkDate(reportDate, today) {
  today ??= new Intl.DateTimeFormat('en-CA', {timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit'}).format(new Date());
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!match || date(match[1], match[2], match[3]) !== today) throw new Error('Invalid discovery check date.');
  if (reportDate > today) throw new Error('Future northern report date.');
}

function embeddedArray(html) {
  const assignments = [...html.matchAll(/\b(?:var|let|const)\s+weeklyWaterfowlReport\s*=\s*/g)];
  if (assignments.length !== 1) throw new Error('Minnesota report JSON assignment missing or ambiguous.');
  const start = assignments[0].index + assignments[0][0].length;
  if (html[start] !== '[') throw new Error('Minnesota report is not a JSON array.');
  let depth = 0, quoted = false, escaped = false;
  for (let index = start; index < html.length; index++) {
    const character = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '[') depth++;
    else if (character === ']' && --depth === 0) {
      if (!/^\s*;/.test(html.slice(index + 1))) throw new Error('Minnesota report JSON boundary changed.');
      // JSON.parse, rather than evaluating script, rejects expressions and code.
      return JSON.parse(html.slice(start, index + 1));
    }
  }
  throw new Error('Truncated Minnesota report JSON.');
}

export function discoverMinnesotaReport(html, {today} = {}) {
  inputHtml(html);
  const labels = [...plain(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')).matchAll(/Updated at (\d{1,2}):(\d{2}) (AM|PM) (CST|CDT) on (Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})/g)];
  if (labels.length !== 1) throw new Error('Minnesota human report-update date missing or ambiguous.');
  const [, hourText, minuteText, meridiem, zone, weekday, month, day, year] = labels[0];
  const hour = Number(hourText), minute = Number(minuteText);
  if (hour < 1 || hour > 12 || minute > 59) throw new Error('Invalid Minnesota report-update time.');
  const reportDate = date(year, months.indexOf(month) + 1, day);
  if (weekdays[new Date(reportDate + 'T12:00:00Z').getUTCDay()] !== weekday) throw new Error('Minnesota report-update weekday mismatch.');
  checkDate(reportDate, today);
  const sourceUpdatedAt = reportDate + 'T' + String(hour % 12 + (meridiem === 'PM' ? 12 : 0)).padStart(2, '0') + ':' + minuteText + ':00' + (zone === 'CST' ? '-06:00' : '-05:00');
  const records = embeddedArray(html);
  if (!Array.isArray(records) || records.length < 2 || records.length > 100) throw new Error('Minnesota report record count changed.');
  const seen = new Set();
  for (const record of records) {
    if (!record || typeof record !== 'object' || Array.isArray(record) || typeof record.area !== 'string' || !record.area.trim() || record.area.length > 200 || typeof record.region !== 'string' || !record.region.trim() || record.region.length > 200 || fields.some(field => typeof record[field] !== 'string' || record[field].length > 30_000)) throw new Error('Minnesota report record schema changed.');
    const key = record.area.trim().toLowerCase();
    if (seen.has(key)) throw new Error('Duplicate Minnesota reporting area.');
    seen.add(key);
  }
  const general = records.filter(record => record.area === 'General' && record.region === 'Statewide');
  if (general.length !== 1) throw new Error('Minnesota statewide record missing or ambiguous.');
  const offices = records.filter(record => record !== general[0]);
  const absent = record => fields.every(field => /^(?:no report(?: this week)?[.!]?)?$/i.test(plain(record[field])));
  return {
    sourceId: 'minnesota-dnr-field', url: MN_URL, title: 'Minnesota weekly field report',
    reportDate, datePrecision: 'report-updated', sourceUpdatedAt,
    reportingAreaCount: offices.length, noReportAreaCount: offices.filter(absent).length,
    statewideSummaryAvailable: !absent(general[0])
  };
}

export function discoverSouthDakotaReport(html, {today} = {}) {
  inputHtml(html);
  const years = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi)]
    .map(match => ({match, label: plain(match[1])})).filter(entry => /^\d{4} Waterfowl Report$/.test(entry.label));
  if (!years.length) throw new Error('South Dakota report-year heading missing.');
  const candidates = [];
  for (let index = 0; index < years.length; index++) {
    const {match, label} = years[index], year = Number(label.slice(0, 4));
    const start = match.index + match[0].length;
    const section = html.slice(start, years[index + 1]?.match.index ?? html.length);
    const weeks = [...section.matchAll(/<div\b[^>]*\bclass\s*=\s*["'][^"']*\bexpand-trigger\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)];
    for (let weekIndex = 0; weekIndex < weeks.length; weekIndex++) {
      const week = weeks[weekIndex], weekLabel = plain(week[1]);
      const parsed = /^Week of (January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2})$/.exec(weekLabel);
      if (!parsed) throw new Error('South Dakota report-week label changed.');
      const reportDate = date(year, months.indexOf(parsed[1]) + 1, parsed[2]);
      checkDate(reportDate, today);
      const body = section.slice(week.index + week[0].length, weeks[weekIndex + 1]?.index ?? section.length);
      const regions = [...body.matchAll(/<p\b[^>]*>\s*<(?:b|strong)\b[^>]*>([\s\S]*?)<\/(?:b|strong)>/gi)].map(region => plain(region[1]));
      candidates.push({reportDate, regions, hasContent: /<div\b[^>]*\bclass\s*=\s*["'][^"']*\bexpand-container\b/i.test(body)});
    }
  }
  if (!candidates.length) throw new Error('South Dakota report weeks missing.');
  candidates.sort((a, b) => b.reportDate.localeCompare(a.reportDate));
  if (candidates.length > 1 && candidates[0].reportDate === candidates[1].reportDate) throw new Error('Ambiguous newest South Dakota report week.');
  // An older week can omit a region without invalidating the newest issue.
  const latest = candidates[0];
  if (!latest.hasContent) throw new Error('South Dakota report-week content missing.');
  if (latest.regions.length !== sdRegions.length || sdRegions.some(region => !latest.regions.includes(region))) throw new Error('South Dakota regional report structure changed.');
  return {sourceId: 'south-dakota-gfp-field', url: SD_URL, title: 'South Dakota weekly field report', reportDate: latest.reportDate, datePrecision: 'report-week-label', reportingAreaCount: latest.regions.length};
}
