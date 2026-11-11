// Only fetch our published snapshots. Visitor coordinates never enter these requests.
export function createSnapshotRefresher({readStatus,readSnapshot,onUpdate,initialVersion=null,clock=Date.now,minIntervalMs=300000}){
  let version=initialVersion,lastAttempt=clock(),active=null;
  function check({force=false}={}){
    if(active)return active;
    if(!force&&clock()-lastAttempt<minIntervalMs)return Promise.resolve({skipped:true});
    lastAttempt=clock();
    active=(async()=>{
      const status=await readStatus(),next=Date.parse(status?.finishedAt),previous=Date.parse(version);
      if(!Number.isFinite(next))throw new Error('The published update time is unavailable.');
      if(next>clock()+300000)throw new Error('The published update time is in the future.');
      if(Number.isFinite(previous)&&next<previous)throw new Error('An older published release was returned.');
      if(next===previous)return {updated:false,checkedAt:clock()};
      const snapshot=await readSnapshot(status);
      // A partially cached release must not replace an already usable view.
      for(const data of [snapshot.weather,snapshot.surveys,snapshot.conditions]){
        const generated=Date.parse(data?.generatedAt);
        if(!Number.isFinite(generated)||generated>next+5000)throw new Error('Published files do not yet belong to a completed refresh.');
      }
      await onUpdate(snapshot,status);
      version=status.finishedAt;
      return {updated:true,checkedAt:clock()};
    })().finally(()=>{active=null;});
    return active;
  }
  return {check};
}
