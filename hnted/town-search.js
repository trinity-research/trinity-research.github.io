const normalize=text=>String(text).normalize('NFD').replace(/\p{Diacritic}/gu,'').toLowerCase().replace(/['’.]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
let loading=null;

export function searchTowns(query,data){
  const [town,region='']=query.split(',').map(normalize);
  if(town.length<2||/^\d+$/.test(town))return [];
  const state=region?Object.keys(data.states).find(code=>normalize(code)===region||normalize(data.states[code])===region):null;
  if(region&&!state)return [];
  const words=town.split(' ');
  return data.places.filter(p=>{
    const name=normalize(p[0]);
    return (!state||p[1]===state)&&(name.startsWith(town)||words.every(w=>name.split(' ').some(part=>part.startsWith(w))));
  }).sort((a,b)=>Number(normalize(b[0])===town)-Number(normalize(a[0])===town)||b[5]-a[5]).slice(0,6).map(p=>({name:p[0],admin1:data.states[p[1]],country:'United States',latitude:p[2],longitude:p[3],timezone:p[4]}));
}

export async function findTowns(query){
  if(!loading)loading=fetch(new URL('./data/us-towns.json',import.meta.url)).then(response=>{if(!response.ok)throw new Error('Town index unavailable');return response.json();}).catch(error=>{loading=null;throw error;});
  return searchTowns(query,await loading);
}
