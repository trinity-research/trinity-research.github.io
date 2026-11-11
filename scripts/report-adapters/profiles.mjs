export const REPORT_FILES=['waterfowl-surveys.json','waterfowl-illinois.json','waterfowl-missouri.json','waterfowl-northern.json','waterfowl-southern.json','waterfowl-source-status.json','waterfowl-additional.json','waterfowl-east-tn-in.json','waterfowl-east-ky-ms.json'];
export const PROFILES=[
  {id:'usfws-loess-bluffs',kind:'loess',mode:'automatic-import'},
  {id:'iowa-dnr-migration',kind:'iowa',mode:'automatic-import'},
  {id:'inhs-illinois-river',kind:'illinois',mode:'automatic-import'},
  {id:'inhs-central-mississippi',kind:'mississippi-river',mode:'automatic-import'},
  {id:'mdc-waterfowl-counts',kind:'missouri',mode:'automatic-import'},
  {id:'minnesota-dnr-field',kind:'minnesota',mode:'new-report-notice'},
  {id:'south-dakota-gfp-field',kind:'south-dakota',mode:'new-report-notice'},
  {id:'ldwf-coastal-aerial',kind:'links',mode:'new-report-notice',pattern:'water|aerial|survey'},
  {id:'agfc-aerial',kind:'links',mode:'new-report-notice',pattern:'waterfowl|survey'},
  {id:'agfc-habitat-news',kind:'links',mode:'new-report-notice',pattern:'waterfowl|wetland|duck|habitat'},
  {id:'fhsu-kwec-sightings',kind:'fhsu',mode:'new-report-notice',pattern:'recent bird sightings'},
  {id:'mdwfp-delta-aerial',kind:'links',mode:'new-report-notice',pattern:'aerial|survey'},
  {id:'twra-refuge-counts',kind:'tennessee',mode:'automatic-import'},
  {id:'indiana-dnr-waterfowl-counts',kind:'restricted',mode:'link-only'},
  {id:'kentucky-kdfwr-surveys',kind:'links',mode:'new-report-notice',pattern:'waterfowl.*ground|duck.*survey|waterfowl.*survey'},
  {id:'mdwfp-weekly-wingbeat',kind:'links',mode:'new-report-notice',pattern:'wingbeat|weekly'},
  {id:'kansas-kdwp',kind:'links',mode:'new-report-notice',pattern:'waterfowl|report'},
  {id:'oklahoma-odwc',kind:'oklahoma',mode:'new-report-notice'}
];
