// Pure decoders for NOAA's public coded bulletins. No provider code is executed.
export const WPC_ANALYSIS_URL='https://www.wpc.ncep.noaa.gov/discussions/codsus_hr';
export const WPC_FORECAST_URL='https://www.wpc.ncep.noaa.gov/basicwx/coded_srp.txt';
export const WPC_COORDINATE_GUIDE='https://www.wpc.ncep.noaa.gov/html/read_coded_bull_hr.shtml';
const codes={COLD:'cold',WARM:'warm',STNRY:'stationary',OCFNT:'occluded',TROF:'trough',HIGHS:'high',LOWS:'low'};
const months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const weekdays=['SUN','MON','TUE','WED','THU','FRI','SAT'];
const offsets={UTC:0,GMT:0,EST:5,EDT:4,CST:6,CDT:5,MST:7,MDT:6,PST:8,PDT:7};
const HOUR=3600000;

function utc(year,month,day,hour=0,minute=0){
  const value=new Date(Date.UTC(year,month-1,day,hour,minute));
  if(year<2000||year>2100||value.getUTCFullYear()!==year||value.getUTCMonth()!==month-1||value.getUTCDate()!==day||value.getUTCHours()!==hour||value.getUTCMinutes()!==minute)throw new Error('Invalid WPC calendar date or time.');
  return +value;
}
function source(value,expected){
  const url=new URL(value);
  if(url.protocol!=='https:'||url.hostname!=='www.wpc.ncep.noaa.gov'||url.username||url.password||url.port||url.pathname!==new URL(expected).pathname)throw new Error('Unrecognized WPC bulletin source URL.');
  return url.href;
}
function issueTime(line){
  const m=line.match(/^(\d{3,4}) (AM|PM) (UTC|GMT|EST|EDT|CST|CDT|MST|MDT|PST|PDT) (SUN|MON|TUE|WED|THU|FRI|SAT) (JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC) (\d{1,2}) (\d{4})$/);
  if(!m)throw new Error('WPC bulletin issue time is missing or unrecognized.');
  const digits=m[1],hour=Number(digits.slice(0,-2)),minute=Number(digits.slice(-2)),year=+m[7],month=months.indexOf(m[5])+1,day=+m[6];
  if(hour<1||hour>12||minute>59)throw new Error('Invalid WPC issue clock.');
  const calendar=utc(year,month,day);
  if(weekdays[new Date(calendar).getUTCDay()]!==m[4])throw new Error('WPC issue weekday disagrees with its date.');
  return new Date(utc(year,month,day,hour%12+(m[2]==='PM'?12:0),minute)+offsets[m[3]]*HOUR).toISOString();
}
function coordinate(token,{center=false}={}){
  // The official high-resolution encoding is latitude in the first three
  // digits, then west longitude, both in tenths of a degree. Forecast pressure
  // centers sometimes omit longitude's leading zero; no sign is inferred from
  // the current map extent or from visitor coordinates.
  if(!(center?/^\d{6,7}$/:/^\d{7}$/).test(token))throw new Error('Invalid WPC coded coordinate.');
  const lat=Number(token.slice(0,3))/10,lon=Number(token.slice(3))/10;
  if(lat<=0||lat>90||lon<=0||lon>180)throw new Error('WPC coordinate is outside the documented northern/western hemisphere.');
  return [-lon,lat];
}
function validAnalysis(token,issuedAt){
  const match=token.match(/^VALID (\d{2})(\d{2})(\d{2})Z$/);
  if(!match)throw new Error('WPC analysis valid time is unrecognized.');
  const issued=Date.parse(issuedAt),year=new Date(issued).getUTCFullYear(),hour=+match[3];
  if(hour%3)throw new Error('WPC analysis valid hour is outside the three-hour cycle.');
  const candidates=[];
  for(const y of [year-1,year,year+1])try{candidates.push(utc(y,+match[1],+match[2],hour));}catch{}
  candidates.sort((a,b)=>Math.abs(a-issued)-Math.abs(b-issued));
  const value=candidates[0];
  if(!Number.isFinite(value)||value<issued-36*HOUR||value>issued+3*HOUR)throw new Error('WPC analysis valid time does not match its issue date.');
  return new Date(value).toISOString();
}
function validForecast(line,issuedAt){
  const m=line.match(/^SURFACE PROG VALID (\d{4})(\d{2})(\d{2})(\d{2})(\d{2})Z$/);
  if(!m)throw new Error('WPC forecast valid time is unrecognized.');
  const value=utc(+m[1],+m[2],+m[3],+m[4],+m[5]),issued=Date.parse(issuedAt);
  if(value<issued-12*HOUR||value>issued+120*HOUR)throw new Error('WPC forecast valid time is outside the short-range bulletin.');
  return new Date(value).toISOString();
}
function features(groups,id){
  const result=[];
  for(const group of groups){
    const type=codes[group.code];
    if(type==='high'||type==='low'){
      if(group.tokens.length%2)throw new Error('Incomplete WPC pressure-center pair.');
      for(let i=0;i<group.tokens.length;i+=2){
        const pressure=group.tokens[i];
        if(!/^\d{3,4}$/.test(pressure)||+pressure<800||+pressure>1100)throw new Error('Invalid WPC central pressure.');
        result.push({type:'Feature',id:id+'-'+type+'-'+result.length,geometry:{type:'Point',coordinates:coordinate(group.tokens[i+1],{center:true})},properties:{type,sourceCode:group.code,pressureHpa:+pressure}});
      }
    }else{
      if(group.tokens.length<2||group.tokens.length>1000)throw new Error('Incomplete or oversized WPC front line.');
      const coordinates=group.tokens.map(t=>coordinate(t)).filter((p,i,a)=>!i||p[0]!==a[i-1][0]||p[1]!==a[i-1][1]);
      if(coordinates.length<2)throw new Error('Degenerate WPC front line.');
      result.push({type:'Feature',id:id+'-'+type+'-'+result.length,geometry:{type:'LineString',coordinates},properties:{type,sourceCode:group.code}});
    }
  }
  if(!result.some(f=>f.geometry.type==='LineString')||result.length>1000)throw new Error('WPC bulletin has no complete front lines or exceeds the feature limit.');
  return result;
}
function parse(text,{kind,sourceUrl}){
  if(typeof text!=='string'||text.length>250000||/[<>\0]/.test(text))throw new Error('Invalid WPC plain-text bulletin.');
  const lines=text.replace(/\r/g,'').split('\n').map(line=>line.trim().replace(/\s+/g,' ')).filter(Boolean);
  if(lines[0]!=='CODED SURFACE FRONTAL POSITIONS'+(kind==='forecast'?' FORECAST':'')||lines[1]!=='NWS WEATHER PREDICTION CENTER COLLEGE PARK MD')throw new Error('Unrecognized WPC bulletin header.');
  const issuedAt=issueTime(lines[2]),frames=[];let validAt=null,groups=[],group=null,ended=false;
  const flushGroup=()=>{if(group){groups.push(group);group=null;}};
  const flushFrame=()=>{
    flushGroup();if(!validAt)return;
    const id='wpc-'+kind+'-'+validAt.replace(/[-:]/g,'').slice(0,13).replace('T','');
    frames.push({id,kind,issuedAt,validAt,sourceUrl,features:features(groups,id)});groups=[];
  };
  for(const line of lines.slice(3)){
    if(ended)throw new Error('Unexpected content after WPC bulletin terminator.');
    if(line==='$$'){flushFrame();validAt=null;ended=true;continue;}
    if(line.startsWith(kind==='forecast'?'SURFACE PROG VALID ':'VALID ')){
      flushFrame();validAt=kind==='forecast'?validForecast(line,issuedAt):validAnalysis(line,issuedAt);continue;
    }
    if(!validAt)throw new Error('WPC geometry appears before a valid time.');
    const parts=line.split(' '),code=parts[0];
    if(Object.hasOwn(codes,code)){flushGroup();group={code,tokens:parts.slice(1)};}
    else if(/^\d/.test(line)&&group){if(parts.some(p=>!/^\d+$/.test(p)))throw new Error('Invalid WPC continuation tokens.');group.tokens.push(...parts);}
    else throw new Error('Unknown WPC feature or malformed continuation.');
  }
  if(!ended)flushFrame();
  if(!frames.length||frames.length>(kind==='forecast'?16:1))throw new Error('Unexpected WPC frame count.');
  for(let i=1;i<frames.length;i++)if(frames[i].validAt<=frames[i-1].validAt)throw new Error('WPC forecast times are duplicated or unordered.');
  return frames;
}

export function parseWpcSurfaceBulletin(text,{sourceUrl=WPC_ANALYSIS_URL}={}){
  return parse(text,{kind:'analysis',sourceUrl:source(sourceUrl,WPC_ANALYSIS_URL)})[0];
}
export function parseWpcForecastBulletin(text,{sourceUrl=WPC_FORECAST_URL}={}){
  return parse(text,{kind:'forecast',sourceUrl:source(sourceUrl,WPC_FORECAST_URL)});
}
