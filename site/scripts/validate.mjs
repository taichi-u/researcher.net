import fs from 'node:fs/promises';
import {doiKey} from '../web/domain.js';
const d=JSON.parse(await fs.readFile('site/data/dataset.json','utf8'));
const errors=[];const check=(ok,msg)=>{if(!ok)errors.push(msg);};
const people=new Set(d.researchers.map(p=>p.id)),nodes=new Set([...people,...d.auxiliary.map(a=>a.id)]),works=new Set(d.works.map(w=>w.id));
check(d.researchers.length>=200&&d.researchers.length<=400,'Researcher count must be 200–400');
check(people.size===d.researchers.length,'Duplicate researcher ID');
check(works.size===d.works.length,'Duplicate work ID');
const dois=d.works.map(w=>doiKey(w.doi)).filter(Boolean);check(new Set(dois).size===dois.length,'Duplicate DOI');
for(const p of d.researchers){check(p.evidence.length>0,`${p.id}: no identity evidence`);check(p.workIds.every(id=>works.has(id)),`${p.id}: broken work reference`);check(Number.isFinite(p.position.x)&&Number.isFinite(p.position.y),`${p.id}: invalid layout`);}
for(const w of d.works){check(/^https?:\/\//.test(w.url),`${w.id}: no usable link`);check(w.topics.length>0,`${w.id}: no topic`);check(w.authors.length>0,`${w.id}: no authors`);}
for(const r of d.relationships){check(nodes.has(r.source)&&nodes.has(r.target),`${r.id}: missing endpoint`);check(r.source!==r.target,`${r.id}: self relation`);check(r.evidence?.length>0&&r.evidence.every(e=>/^https:\/\//.test(e.url)&&e.accessedAt),`${r.id}: missing provenance`);check(!(r.startYear&&r.endYear&&r.startYear>r.endYear),`${r.id}: inverted dates`);}
const visiting=new Set(),visited=new Set();
function visit(id){if(visiting.has(id)){errors.push(`Advisor cycle at ${id}`);return;}if(visited.has(id))return;visiting.add(id);for(const r of d.relationships.filter(r=>r.kind==='advisor'&&r.source===id))visit(r.target);visiting.delete(id);visited.add(id);}
for(const id of people)visit(id);
check(d.metadata.collection.complete,'Collection incomplete');
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log(`Validated ${people.size} researchers, ${works.size} works, ${d.relationships.length} sourced relationships.`);
