import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {doiKey} from '../web/domain.js';
const d=JSON.parse(await fs.readFile('site/data/dataset.json','utf8'));
const dois=new Set(['10.2514/1.g008976']);
for(const p of d.researchers.filter(p=>p.seed)){
  const works=d.works.filter(w=>w.doi&&w.authors.some(a=>a.id===p.id)).sort((a,b)=>(b.year??0)-(a.year??0));
  for(const w of works.slice(0,2))dois.add(w.doi);
}
await fs.mkdir('.cache/crossref',{recursive:true});
const records=[];
lookup: for(const doi of dois){
  const file=`.cache/crossref/${crypto.createHash('sha256').update(doi).digest('hex')}.json`;
  let m;
  try{m=JSON.parse(await fs.readFile(file,'utf8'));}catch{
    for(let attempt=0;attempt<4;attempt++){
      try{
        const response=await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`,{headers:{'User-Agent':'researcher.net/1.0 (public scholarly metadata research)'},signal:AbortSignal.timeout(30000)});
        if(response.status===404){console.log(`Not registered with Crossref: ${doi}`);continue lookup;}
        if(!response.ok)throw Error(`Crossref HTTP ${response.status}`);
        m=(await response.json()).message;await fs.writeFile(file,JSON.stringify(m));break;
      }catch(error){if(attempt===3)throw error;await new Promise(r=>setTimeout(r,1500*(attempt+1)));}
    }
  }
  const work=d.works.find(w=>w.doi===doiKey(doi));
  records.push({doi:doiKey(m.DOI),title:m.title?.[0],year:m.published?.['date-parts']?.[0]?.[0]??null,authors:(m.author??[]).map(a=>({name:[a.given,a.family].filter(Boolean).join(' '),orcid:a.ORCID??null,affiliations:(a.affiliation??[]).map(i=>i.name)})),sourceUrl:`https://api.crossref.org/works/${encodeURIComponent(doi)}`,checkedAt:d.metadata.snapshotDate,comparison:work?{openalexWork:work.id,yearMatches:(m.published?.['date-parts']?.[0]?.[0]??null)===work.year,authorCountMatches:(m.author??[]).length===work.authors.length}:null});
  console.log(`Crossref ${records.length}/${dois.size}: ${doi}`);
}
await fs.writeFile('site/data/crossref.json',JSON.stringify(records,null,2)+'\n');
