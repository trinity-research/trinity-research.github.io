// Pages can report a failed sibling while another build of the same commit succeeds.
export async function waitForPagesBuild({target,listBuilds,requestBuild,includesTarget=build=>build.commit===target,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),log=console.log,attempts=36,intervalMs=10000,retryAfter=4,maxRequests=3}){
  await requestBuild();
  let requests=1,failedPolls=0,lastFailure;
  for(let attempt=0;attempt<attempts;attempt++){
    const builds=await listBuilds(),relevant=[];
    for(const build of builds)if(await includesTarget(build))relevant.push(build);
    const complete=relevant.find(build=>build.status==='built');
    if(complete)return complete;
    const pending=relevant.some(build=>['queued','building'].includes(build.status));
    const failed=relevant.find(build=>build.status==='errored');
    if(failed)lastFailure=failed.error?.message??'unknown build error';
    failedPolls=failed&&!pending?failedPolls+1:0;
    if(failedPolls>=retryAfter&&requests<maxRequests){
      log('Pages has not recovered from its failed build; requesting another build ('+(requests+1)+'/'+maxRequests+').');
      await requestBuild();requests++;failedPolls=0;
    }
    if(attempt+1<attempts)await sleep(intervalMs);
  }
  throw new Error('Pages has not confirmed commit '+target+' after '+attempts+' checks.'+(lastFailure?' Last matching build error: '+lastFailure:''));
}
