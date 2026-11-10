import {spawnSync,execFileSync} from 'node:child_process';
import {waitForPagesBuild} from './pages-builds.mjs';
const root=new URL('../',import.meta.url),repo=process.env.GITHUB_REPOSITORY;
if(!repo||!/^[\w.-]+\/[\w.-]+$/.test(repo))throw new Error('A GitHub repository is required.');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const target=git('rev-parse','HEAD'),base=git('rev-parse','origin/main');
let pushed=false;
for(let attempt=0;attempt<4;attempt++){
  if(spawnSync('git',['push','origin','HEAD:main'],{cwd:root,stdio:'inherit'}).status===0){pushed=true;break;}
  git('fetch','origin','main');const remote=git('rev-parse','origin/main');
  if(remote===target||spawnSync('git',['merge-base','--is-ancestor',target,remote],{cwd:root,stdio:'ignore'}).status===0){pushed=true;break;}
  if(remote!==base)throw new Error('The website branch advanced. Rerun against its latest version; no changes were overwritten.');
  if(attempt<3)await pause((attempt+1)*10000);
}
if(!pushed)throw new Error('GitHub did not accept the normal data push after four attempts.');
const requestedAt=Date.now(),includedCommits=new Map([[target,true]]);
await waitForPagesBuild({target,
  requestBuild:()=>execFileSync('gh',['api','--method','POST','repos/'+repo+'/pages/builds','--silent'],{cwd:root,stdio:'inherit'}),
  listBuilds:()=>JSON.parse(execFileSync('gh',['api','repos/'+repo+'/pages/builds?per_page=20'],{cwd:root,encoding:'utf8'})),
  includesTarget:build=>{
    if(build.commit===target)return true;
    // Only consider newer successful commits, and prove they contain our update.
    if(build.status!=='built'||!(/^[a-f0-9]{40}$/.test(build.commit??''))||!(Date.parse(build.created_at)>=requestedAt-5000))return false;
    if(!includedCommits.has(build.commit)){
      git('fetch','origin','main');
      includedCommits.set(build.commit,spawnSync('git',['merge-base','--is-ancestor',target,build.commit],{cwd:root,stdio:'ignore'}).status===0);
    }
    return includedCommits.get(build.commit);
  }
});
console.log('Pages built the refreshed commit '+target+' or a verified newer commit containing it.');
