import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {classify,abstractText,dedupeWorks,shortId,normalize} from '../web/domain.js';
const root=process.cwd(), data=path.join(root,'site/data'), cache=path.join(root,'.cache/openalex');
await fs.mkdir(cache,{recursive:true});
const seeds=JSON.parse(await fs.readFile(path.join(data,'seeds.json'),'utf8'));
const mode=process.argv[2]??'all';
let calls=0;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function get(endpoint,params={}) {
  const url=new URL(`https://api.openalex.org/${endpoint}`);
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  const key=crypto.createHash('sha256').update(url.href).digest('hex');
  const file=path.join(cache,`${key}.json`);
  try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{}
  for(let attempt=0;attempt<4;attempt++){
    await sleep(140);
    let res;
    try{res=await fetch(url,{headers:process.env.OPENALEX_API_KEY?{Authorization:`Bearer ${process.env.OPENALEX_API_KEY}`}:{},signal:AbortSignal.timeout(45000)});}catch(error){if(attempt===3)throw error;await sleep(2000*(attempt+1));continue;}
    calls++;
    if(res.status===429||res.status>=500){if(attempt===3)throw Error('OpenAlex temporarily unavailable: cached progress is retained; rerun later.');await sleep(2000*(attempt+1));continue;}
    if(!res.ok)throw Error(`OpenAlex ${res.status} at ${endpoint}`);
    const body=await res.json();await fs.writeFile(file+'.tmp',JSON.stringify(body));await fs.rename(file+'.tmp',file);return body;
  }
}
if(mode==='discover'){
  const result=[];
  for(const s of seeds){
    const r=await get('authors',{search:s.query,per_page:5});
    const candidates=r.results.map(a=>({id:shortId(a.id),name:a.display_name,orcid:a.orcid,works:a.works_count,institutions:a.last_known_institutions?.map(i=>i.display_name),topics:a.topics?.slice(0,3).map(t=>t.display_name)}));
    result.push({seed:s.name,candidates});console.log(JSON.stringify({seed:s.name,candidates}));
  }
  await fs.writeFile(path.join(data,'candidates.json'),JSON.stringify(result,null,2));process.exit();
}
if(seeds.some(s=>!s.openalex))throw Error('Resolve and verify all seed identities in seeds.json first.');
await fs.writeFile(path.join(data,'collection-state.json'),JSON.stringify({complete:false,date:'2026-10-23',source:'OpenAlex'}));
const fields='id,doi,title,publication_year,publication_date,type,authorships,abstract_inverted_index,primary_location,open_access';
const raw=new Map();
try{for(const w of JSON.parse(await fs.readFile(path.join(data,'raw-works.json'),'utf8')))raw.set(w.id,w);}catch{}
async function checkpoint(){await fs.writeFile(path.join(data,'raw-works.json'),JSON.stringify([...raw.values()]));}
async function collectAuthors(ids,label){
  for(let page=1;page<=100;page++){
    const result=await get('works',{filter:`authorships.author.id:${ids.join('|')}`,per_page:100,page,select:fields,sort:'publication_date:desc'});
    for(const w of result.results)raw.set(w.id,w);
    if(page%5===0)console.log(`${label}: ${page*100}/${result.meta.count} records`);
    if(result.results.length<100 || page*100>=result.meta.count)break;
    if(page===100)throw Error(`${label}: basic paging limit reached, split batch before continuing.`);
  }
  await checkpoint();
}
for(const s of seeds){await collectAuthors([s.openalex],s.name);console.log(`Seed complete: ${s.name}; ${raw.size} unique works`);}
const selectedWorks=dedupeWorks([...raw.values()]).filter(w=>seeds.some(s=>w.authorships.some(a=>shortId(a.author.id)===s.openalex))&&classify(w.title,abstractText(w.abstract_inverted_index)).length && w.authorships.length<=50);
const authors=new Map();
for(const w of selectedWorks)for(const a of w.authorships){
  const id=shortId(a.author.id);if(!id||['A9999999999','A5317838346'].includes(id))continue;
  if(!authors.has(id))authors.set(id,{id,name:a.author.display_name,orcid:a.author.orcid,n:0,seeds:new Set(),institutions:new Map()});
  const item=authors.get(id);item.n++;
  for(const seed of seeds)if(w.authorships.some(x=>shortId(x.author.id)===seed.openalex))item.seeds.add(seed.openalex);
  for(const inst of a.institutions??[])item.institutions.set(inst.id,inst);
}
const chosen=new Set(seeds.map(s=>s.openalex));
// Round-robin around all verified seeds prevents one prolific group dominating the sample.
const queues=seeds.map(s=>[...authors.values()].filter(a=>a.seeds.has(s.openalex)&&a.n>=2).sort((a,b)=>b.n-a.n||a.id.localeCompare(b.id)));
let progressed=true;
while(chosen.size<300&&progressed){progressed=false;for(const q of queues){while(q.length&&chosen.has(q[0].id))q.shift();if(q.length){chosen.add(q.shift().id);progressed=true;}if(chosen.size>=300)break;}}
if(chosen.size<200)throw Error(`Only ${chosen.size} eligible researchers; refine seed collection.`);
await fs.writeFile(path.join(data,'selected-authors.json'),JSON.stringify([...chosen].map(id=>{const a=authors.get(id);return {...a,seeds:[...a.seeds],institutions:[...a.institutions.values()]};}),null,2));
console.log(`Selected ${chosen.size} researchers from ${authors.size} candidates; ${selectedWorks.length} relevant seed works`);
if(mode==='seeds')process.exit();
const ids=[...chosen];
// Small batches keep each query below the 10,000-record basic paging limit.
for(let i=0;i<ids.length;i+=10)await collectAuthors(ids.slice(i,i+10),`Expansion ${i+1}-${Math.min(i+10,ids.length)}`);
const profiles=[];
for(let i=0;i<ids.length;i+=50){const r=await get('authors',{filter:`openalex:${ids.slice(i,i+50).join('|')}`,per_page:100});profiles.push(...r.results);}
await fs.writeFile(path.join(data,'raw-authors.json'),JSON.stringify(profiles));
await fs.writeFile(path.join(data,'collection-state.json'),JSON.stringify({complete:true,date:'2026-10-23',source:'OpenAlex',seedIds:seeds.map(s=>s.openalex),selectedCount:chosen.size,totalWorks:raw.size,requestsThisRun:calls},null,2));
console.log(`Collection complete: ${raw.size} works, ${profiles.length} profiles, ${calls} network requests.`);
