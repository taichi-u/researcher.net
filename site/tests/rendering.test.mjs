import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {makeEdgeLevels,renderEdges} from '../web/graph-policy.js';
import {createPaperLoader,paperShard} from '../web/paper-data.js';
import {partitionBrowserData} from '../scripts/browser-data.mjs';
import {selectView,makeIndexes,searchPeople} from '../web/model.js';

const data=JSON.parse(await fs.readFile(new URL('../data/dataset.json',import.meta.url),'utf8'));
test('overview preserves every connected person and explicit relationships; selecting restores all incident evidence',()=>{
  const {edges}=selectView(data,{kinds:['coauthor','advisor','lab','project']});
  const levels=makeEdgeLevels(edges),overview=renderEdges(edges,levels);
  assert.ok(overview.length<edges.length/2);
  assert.deepEqual(new Set(overview.flatMap(e=>[e.source,e.target])),new Set(edges.flatMap(e=>[e.source,e.target])));
  assert.ok(edges.filter(e=>e.kind!=='coauthor').every(e=>overview.includes(e)));
  const omitted=edges.find(e=>!overview.includes(e));assert.ok(omitted);
  const selection=renderEdges(edges,levels,{selected:{type:'node',id:omitted.source}});
  assert.ok(edges.filter(e=>e.source===omitted.source||e.target===omitted.source).every(e=>selection.includes(e)));
  assert.ok(renderEdges(edges,levels,{selected:{type:'edge',id:omitted.id}}).includes(omitted));
  assert.equal(renderEdges(edges,levels,{density:'all'}).length,edges.length);
  assert.equal(renderEdges(edges,levels,{focusId:omitted.source}).length,edges.length);
  assert.equal(renderEdges(edges,levels,{zoomRatio:4}).length,edges.length);
  assert.ok(renderEdges(edges,levels,{zoomRatio:2}).length>=overview.length);
});
test('lazy catalog preserves filtering, counts, title search and complete source records',()=>{
  const {catalog,shards}=partitionBrowserData(data);
  assert.ok(JSON.stringify(catalog).length<JSON.stringify(data).length/3);
  assert.deepEqual(shards.flat().sort((a,b)=>a.id.localeCompare(b.id)),[...data.works].sort((a,b)=>a.id.localeCompare(b.id)));
  for(const state of [{},{from:2020,to:2026,topics:['lowthrust']},{mode:'lineage',kinds:['advisor']}]){
    const original=selectView(data,state),lazy=selectView(catalog,state);
    assert.deepEqual(lazy.edges,original.edges);assert.deepEqual(lazy.paperCounts,original.paperCounts);
  }
  const title=data.works[0].title;
  assert.deepEqual(searchPeople(makeIndexes(catalog),title,catalog.researchers).map(p=>p.id),searchPeople(makeIndexes(data),title,data.researchers).map(p=>p.id));
});
test('paper details coalesce concurrent requests, preserve affiliations and retry after failure',async()=>{
  const {catalog,shards}=partitionBrowserData(data),works=new Map(catalog.works.map(w=>[w.id,w]));
  const [a,b]=shards.find(records=>records.length>1);let requests=0;
  const load=createPaperLoader(works,async shard=>{requests++;if(requests===1)throw Error('offline');return shards[shard];});
  await assert.rejects(load(a.id),/offline/);
  const result=await Promise.all([load(a.id),load(b.id)]);
  assert.equal(paperShard(a.id),paperShard(b.id));assert.equal(requests,2);
  for(let i=0;i<2;i++){const {detailsPending,...record}=result[i];assert.equal(detailsPending,false);assert.deepEqual(record,i?b:a);}
  assert.deepEqual(result[0].authors,a.authors);assert.deepEqual(result[1].authors,b.authors);
  await load(a.id);assert.equal(requests,2);
});
