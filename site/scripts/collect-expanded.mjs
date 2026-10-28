import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {classify,abstractText,dedupeWorks,shortId} from '../web/domain.js';
const date='2026-10-28',target=3000;
const read=async name=>JSON.parse(await fs.readFile(`site/data/${name}.json`,'utf8'));
const [previous,raw,overrides,hints]=await Promise.all(['dataset','raw-works','overrides','expansion-historical'].map(read));
const topicsFor=w=>overrides.workTopics[shortId(w.id)]??hints[shortId(w.id)]?.topics??classify(w.title,abstractText(w.abstract_inverted_index));
const cache='.cache/openalex-expansion';await fs.mkdir(cache,{recursive:true});
const extra=new Map(),queries=[];
const fields='id,doi,title,publication_year,publication_date,type,authorships,abstract_inverted_index,primary_location,open_access';
const terms=['celestial mechanics','orbit determination','space debris','atmospheric entry','launch vehicle trajectory','satellite geodesy','spacecraft attitude control','space propulsion','orbital resonance','interplanetary trajectory','satellite navigation','powered descent'];
const periods=[[1900,1976],[1977,1999],[2000,2026]];
for(const term of terms)for(const [from,to]of periods){
  const url=new URL('https://api.openalex.org/works');
  for(const [key,value]of Object.entries({search:term,filter:`from_publication_date:${from}-01-01,to_publication_date:${Math.min(to,2026)}-${to===2026?'10-28':'12-31'}`,per_page:100,sort:'cited_by_count:desc',select:fields}))url.searchParams.set(key,value);
  const file=`${cache}/${crypto.createHash('sha256').update(url.href).digest('hex')}.json`;
  let result;try{result=JSON.parse(await fs.readFile(file,'utf8'));}catch{
    for(let attempt=0;attempt<4;attempt++){
      const response=await fetch(url,{headers:process.env.OPENALEX_API_KEY?{Authorization:`Bearer ${process.env.OPENALEX_API_KEY}`}:{},signal:AbortSignal.timeout(25000)});
      if(response.status===429||response.status>=500){await new Promise(r=>setTimeout(r,1500*(attempt+1)));continue;}
      if(!response.ok)throw Error(`OpenAlex ${response.status} for ${term}`);
      result=await response.json();await fs.writeFile(file,JSON.stringify(result));break;
    }
    if(!result)throw Error(`Collection incomplete for ${term}`);
    await new Promise(r=>setTimeout(r,250));
  }
  for(const work of result.results)extra.set(work.id,{...work,_retrievedAt:date});
  queries.push({term,from,to,url:url.href,total:result.meta.count,received:result.results.length});
  console.log(`${term} / ${from}–${to}: ${result.results.length}; ${extra.size} unique new-source records`);
}
const historical=await read('historical-works');
for(const work of historical)extra.set(work.id,{...work,_retrievedAt:date});
await fs.writeFile('site/data/raw-expansion-works.json',JSON.stringify([...extra.values()]));
const canonical=id=>overrides.authorAliases[shortId(id)]??shortId(id);
const excluded=new Set(overrides.excludedAuthorIds);
const relevant=dedupeWorks([...raw,...extra.values(),...overrides.additionalWorks]).filter(w=>w.authorships?.length&&w.authorships.length<=50&&(!w.publication_date||w.publication_date<=date)&&!overrides.excludedWorkIds.includes(shortId(w.id))&&topicsFor(w).length);
const authors=new Map();
for(const work of relevant){
  const topics=topicsFor(work);
  for(const author of work.authorships){const id=canonical(author.author.id);if(!/^A\d+$/.test(id)||excluded.has(id)||['A9999999999','A5317838346'].includes(id))continue;
    if(!authors.has(id))authors.set(id,{id,name:author.author.display_name,orcid:author.author.orcid??null,n:0,topics:new Set(),eras:new Set(),institutions:new Map()});
    const entry=authors.get(id);entry.n++;topics.forEach(t=>entry.topics.add(t));entry.eras.add(work.publication_year<1977?'early':work.publication_year<2000?'middle':'recent');
    for(const institution of author.institutions??[])entry.institutions.set(institution.id,institution);
  }
}
const originalIds=previous.metadata.expansion?.originalIds??previous.researchers.filter(p=>p.openalex).map(p=>p.openalex);
const curatedOnly=previous.researchers.filter(p=>!p.openalex).length;
const chosen=new Set(originalIds),requiredHistorical=[];
for(const work of relevant.filter(w=>w.publication_year<1977))for(const a of work.authorships){const id=canonical(a.author.id);if(authors.has(id)){chosen.add(id);requiredHistorical.push(id);}}
const queues=[...new Set(relevant.flatMap(topicsFor))].flatMap(topic=>['early','middle','recent'].map(era=>[...authors.values()].filter(a=>a.n>=2&&a.topics.has(topic)&&a.eras.has(era)).sort((a,b)=>b.n-a.n||a.id.localeCompare(b.id))));
while(chosen.size<target-curatedOnly){let progressed=false;for(const queue of queues){while(queue.length&&chosen.has(queue[0].id))queue.shift();if(queue.length){chosen.add(queue.shift().id);progressed=true;}if(chosen.size>=target-curatedOnly)break;}if(!progressed)break;}
if(chosen.size<target-curatedOnly)throw Error(`Only ${chosen.size} eligible IDs; previous snapshot retained.`);
const selected=[...chosen].map(id=>{const a=authors.get(id);if(!a)throw Error(`Missing original author ${id}`);return {id,name:a.name,orcid:a.orcid,n:a.n,seeds:[],institutions:[...a.institutions.values()]};});
await fs.writeFile('site/data/selected-authors.json',JSON.stringify(selected,null,2));
const expansion={originalIds,target,originalCount:296,fields:terms,periods,requiredHistorical:[...new Set(requiredHistorical)],queries,queryDate:date,sourceRecordCount:extra.size,relevantWorks:relevant.length,candidateAuthors:authors.size,selection:'Original researchers retained; all eligible pre-1977 authors; topic/era round-robin among authors with >=2 topical works; OpenAlex IDs only, no name-only merges.'};
await fs.writeFile('site/data/expansion-plan.json',JSON.stringify(expansion,null,2));
const oldCollection=await read('collection-state');await fs.writeFile('site/data/collection-state.json',JSON.stringify({...oldCollection,complete:true,date,expanded:true,selectedCount:chosen.size,totalWorks:raw.length+extra.size,expansion},null,2));
console.log(JSON.stringify({selected:chosen.size,curatedOnly,target,queries:queries.length,relevantWorks:relevant.length,candidateAuthors:authors.size,historicalAuthors:expansion.requiredHistorical.length}));
