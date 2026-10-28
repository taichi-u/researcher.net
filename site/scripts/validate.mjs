import fs from 'node:fs/promises';
import {doiKey} from '../web/domain.js';
const d=JSON.parse(await fs.readFile('site/data/dataset.json','utf8'));
const errors=[];const check=(ok,msg)=>{if(!ok)errors.push(msg);};
const people=new Set(d.researchers.map(p=>p.id)),nodes=new Set([...people,...d.auxiliary.map(a=>a.id)]),works=new Set(d.works.map(w=>w.id));
const expansion=d.metadata.expansion;
check(expansion?d.researchers.length===expansion.target:d.researchers.length>=200&&d.researchers.length<=400,'Researcher count must match the declared collection target');
if(expansion){
  check(d.researchers.length>=expansion.originalCount*10,'Expansion must include at least ten times the original researchers');
  check(expansion.originalIds.every(id=>people.has(`r:${id}`)),'An original researcher is missing');
  check(d.topics.length>=16,'Expanded topic coverage missing');
  check(d.works.some(w=>w.year<1900),'Historical works missing');
}
check(people.size===d.researchers.length,'Duplicate researcher ID');
check(works.size===d.works.length,'Duplicate work ID');
const dois=d.works.map(w=>doiKey(w.doi)).filter(Boolean);check(new Set(dois).size===dois.length,'Duplicate DOI');
for(const p of d.researchers){check(p.evidence.length>0,`${p.id}: no identity evidence`);check(p.workIds.every(id=>works.has(id)),`${p.id}: broken work reference`);check(Number.isFinite(p.position.x)&&Number.isFinite(p.position.y),`${p.id}: invalid layout`);}
for(const w of d.works){check(/^https?:\/\//.test(w.url),`${w.id}: no usable link`);check(w.topics.length>0&&w.topics.every(id=>d.topics.some(t=>t.id===id)),`${w.id}: invalid topic`);check(w.authors.length>0,`${w.id}: no authors`);check(w.checkedAt&&/^https?:\/\//.test(w.sourceUrl),`${w.id}: missing source provenance`);}
for(const r of d.relationships){check(nodes.has(r.source)&&nodes.has(r.target),`${r.id}: missing endpoint`);check(r.source!==r.target,`${r.id}: self relation`);check(r.evidence?.length>0&&r.evidence.every(e=>/^https:\/\//.test(e.url)&&e.accessedAt),`${r.id}: missing provenance`);check(!(r.startYear&&r.endYear&&r.startYear>r.endYear),`${r.id}: inverted dates`);}
const visiting=new Set(),visited=new Set();
function visit(id){if(visiting.has(id)){errors.push(`Advisor cycle at ${id}`);return;}if(visited.has(id))return;visiting.add(id);for(const r of d.relationships.filter(r=>r.kind==='advisor'&&r.source===id))visit(r.target);visiting.delete(id);visited.add(id);}
for(const id of people)visit(id);
check(d.metadata.collection.complete,'Collection incomplete');
if(errors.length){console.error(errors.join('\n'));process.exit(1);}
console.log(`Validated ${people.size} researchers, ${works.size} works, ${d.relationships.length} sourced relationships.`);
