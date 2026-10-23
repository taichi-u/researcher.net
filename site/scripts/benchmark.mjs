import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {makeIndexes,selectView,searchPeople} from '../web/model.js';
const data=JSON.parse(await fs.readFile('site/data/dataset.json','utf8'));
// Test-only expansion: never written into the published snapshot.
const original=[...data.researchers];
while(data.researchers.length<400){
  const p=original[data.researchers.length%original.length],id=`fixture:${data.researchers.length}`;
  const works=data.works.filter(w=>p.workIds.includes(w.id)).map(w=>({...w,id:`${id}:${w.id}`,authors:w.authors.map(a=>a.id===p.id?{...a,id}:a)}));
  data.researchers.push({...p,id,name:`Fixture ${id}`,workIds:works.map(w=>w.id)});data.works.push(...works);
}
const indexes=makeIndexes(data),rows=[];
for(let run=0;run<8;run++){
  let start=performance.now();const view=selectView(data,{from:2000+run,to:2026,topics:run%2?['lowthrust']:[],includeUnknown:!!(run%2)});const filterMs=performance.now()-start;
  start=performance.now();searchPeople(indexes,'optimization',view.people);const searchMs=performance.now()-start;
  rows.push({filterMs:+filterMs.toFixed(2),searchMs:+searchMs.toFixed(2),people:view.people.length,edges:view.edges.length});
}
const result={environment:`Node ${process.version}; ${process.platform}/${process.arch}`,researchers:data.researchers.length,works:data.works.length,scope:'Filtering and search model only; excludes browser paint',maxFilterMs:Math.max(...rows.map(r=>r.filterMs)),maxSearchMs:Math.max(...rows.map(r=>r.searchMs)),runs:rows};
console.log(JSON.stringify(result,null,2));assert.ok(result.maxFilterMs<500&&result.maxSearchMs<500);
await fs.mkdir('site/qa',{recursive:true});await fs.writeFile('site/qa/performance.json',JSON.stringify(result,null,2)+'\n');
