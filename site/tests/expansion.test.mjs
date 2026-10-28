import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {TOPICS,classify} from '../web/domain.js';
import {scalablePositions} from '../scripts/layout.mjs';
import {makeEdgeLevels,renderEdges} from '../web/graph-policy.js';
const read=async name=>JSON.parse(await fs.readFile(new URL(`../data/${name}.json`,import.meta.url),'utf8'));
test('expanded snapshot preserves the original identities and broadens actual dated coverage',async()=>{
  const d=await read('dataset'),hints=await read('expansion-historical');
  assert.equal(d.researchers.length,3000);
  const ids=new Set(d.researchers.map(p=>p.openalex));
  assert.ok(d.metadata.expansion.originalIds.every(id=>ids.has(id)));
  assert.ok(d.works.some(w=>w.year===1892));
  for(const topic of TOPICS)assert.ok(d.works.some(w=>w.topics.includes(topic.id)),`No works for ${topic.id}`);
  for(const [id,h]of Object.entries(hints)){
    const work=d.works.find(w=>w.id===`w:${id}`);assert.ok(work,`Missing historical work ${id}`);
    assert.deepEqual(work.topics,h.topics);assert.ok(/^https?:\/\//.test(work.historicalSource.sourceUrl));
  }
  const listed=new Map(d.works.map(w=>[w.id,w]));
  for(const p of d.researchers.filter(p=>p.openalex))assert.ok(p.workIds.some(id=>listed.get(id)?.authors.some(a=>a.id===p.id)),`No linked work for ${p.id}`);
});
test('new fields keep space context and match representative titles',()=>{
  for(const [title,topic]of [['Orbit determination from angles-only observations','navigation'],['Space debris collision avoidance','debris'],['Powered descent for Mars landing','entry'],['Launch vehicle ascent trajectory','launch'],['Spacecraft attitude control','attitude'],['Electric propulsion for spacecraft','propulsion'],['Satellite geodesy and gravity recovery','geodesy'],['Celestial mechanics and secular perturbation','celestial']])assert.ok(classify(title).includes(topic),title);
  assert.deepEqual(classify('Attitude of students toward learning'),[]);
});
test('large layout is deterministic and overview keeps connected researchers',()=>{
  const people=Array.from({length:3000},(_,i)=>({id:`p:${i}`,primaryTopic:TOPICS[i%TOPICS.length].id}));
  const edges=people.slice(1).flatMap((p,i)=>[{id:`e:${i}`,source:p.id,target:people[i].id,kind:'coauthor',count:2},{id:`long:${i}`,source:p.id,target:people[0].id,kind:'coauthor',count:1}]);
  const second=structuredClone(people);scalablePositions(people,edges,TOPICS.map(t=>t.id));scalablePositions(second,edges,TOPICS.map(t=>t.id));
  assert.deepEqual(people,second);assert.ok(people.every(p=>Number.isFinite(p.position.x)&&Number.isFinite(p.position.y)));
  const overview=renderEdges(edges,makeEdgeLevels(edges,{overviewDegree:1}));
  assert.equal(new Set(overview.flatMap(e=>[e.source,e.target])).size,3000);
  assert.ok(overview.length<edges.length);
});
