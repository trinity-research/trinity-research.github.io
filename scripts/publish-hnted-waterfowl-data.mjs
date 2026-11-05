import {spawnSync,execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url),repo=process.env.GITHUB_REPOSITORY;
if(!repo||!/^[\w.-]+\/[\w.-]+$/.test(repo))throw new Error('A GitHub repository is required.');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const target=git('rev-parse','HEAD'),parent=git('rev-parse','HEAD^');
let pushed=false;
for(let attempt=0;attempt<4;attempt++){
  if(spawnSync('git',['push','origin','HEAD:main'],{cwd:root,stdio:'inherit'}).status===0){pushed=true;break;}
  git('fetch','origin','main');const remote=git('rev-parse','origin/main');
  if(remote===target||spawnSync('git',['merge-base','--is-ancestor',target,remote],{cwd:root,stdio:'ignore'}).status===0){pushed=true;break;}
  if(remote!==parent)throw new Error('The website branch advanced. Rerun against its latest version; no changes were overwritten.');
  if(attempt<3)await pause((attempt+1)*10000);
}
if(!pushed)throw new Error('GitHub did not accept the normal data push after four attempts.');
execFileSync('gh',['api','--method','POST','repos/'+repo+'/pages/builds','--silent'],{cwd:root,stdio:'inherit'});
for(let attempt=0;attempt<36;attempt++){
  const build=JSON.parse(execFileSync('gh',['api','repos/'+repo+'/pages/builds/latest'],{cwd:root,encoding:'utf8'}));
  if(build.status==='errored')throw new Error('Pages build failed: '+(build.error?.message??'unknown error'));
  if(build.status==='built'){
    let included=build.commit===target;
    if(!included){git('fetch','origin','main');included=spawnSync('git',['merge-base','--is-ancestor',target,build.commit],{cwd:root,stdio:'ignore'}).status===0;}
    if(included){console.log('Pages built the refreshed commit '+target+'.');process.exit(0);}
  }
  await pause(10000);
}
throw new Error('Pages has not confirmed the refreshed commit within six minutes.');
