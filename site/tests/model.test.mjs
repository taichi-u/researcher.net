import test from 'node:test';import assert from 'node:assert/strict';
import {classify,doiKey,dedupeWorks,inPeriod,applyOverrides,normalizeAuthorships} from '../web/domain.js';
import {makeIndexes,selectView,searchPeople} from '../web/model.js';
const p=(id,name,extra={})=>({id,name,aliases:[],topics:['lowthrust'],affiliations:[],workIds:[],...extra});
const w=(id,year,authors,topics=['lowthrust'])=>({id,year,title:id,authors:authors.map(id=>({id})),topics});
const data={metadata:{minYear:1990,maxYear:2026},topics:[{id:'lowthrust',label:'低推力',en:'Low thrust'}],researchers:[p('a','Naoya Ozaki',{aliases:['尾崎直哉'],workIds:['w1','w2']}),p('b','Alex Smith',{affiliations:[{name:'Stanford University',years:[2020]}],workIds:['w1','w2']}),p('c','Alex Smith',{topics:[],workIds:['w3']})],works:[w('w1',2001,['a','b']),w('w2',2021,['a','b']),w('w3',null,['b','c'])],auxiliary:[{id:'lab',kind:'lab'}],relationships:[{id:'r1',source:'a',target:'b',kind:'advisor',year:2005,evidence:[{url:'https://example.edu/thesis'}]},{id:'r2',source:'c',target:'b',kind:'advisor',year:2005,evidence:[{url:'https://example.edu/thesis'}]},{id:'r3',source:'lab',target:'a',kind:'lab',startYear:null,endYear:null,evidence:[{url:'https://example.edu/people'}]}]};
test('temporal filters recalculate coauthor edge counts and evidence together',()=>{
  const all=selectView(data,{});assert.equal(all.edges.find(e=>e.source==='a'&&e.target==='b').count,2);
  const recent=selectView(data,{from:2020,to:2026,includeUnknown:false});const edge=recent.edges.find(e=>e.source==='a');assert.equal(edge.count,1);assert.deepEqual(edge.workIds,['w2']);assert.deepEqual(recent.works.map(w=>w.id),['w2']);assert.equal(recent.paperCounts.get('a'),1);
});
test('unknown chronology is opt-in independent of known dates',()=>{assert.equal(inPeriod(null,null,2000,2010,false),false);assert.equal(inPeriod(null,null,2000,2010,true),true);assert.equal(inPeriod(1990,1995,2000,2010),false);});
test('genealogy supports co-advisors, without inferring mentors from coauthorship',()=>{const v=selectView(data,{mode:'lineage'});assert.equal(v.edges.length,2);assert.deepEqual(v.edges.map(e=>e.source),['a','c']);});
test('same name remains distinct, aliases and historical institution are searchable',()=>{const i=makeIndexes(data);assert.equal(searchPeople(i,'Alex Smith',data.researchers).length,2);assert.equal(searchPeople(i,'尾崎 直哉',data.researchers)[0].id,'a');assert.equal(searchPeople(i,'Stanford',data.researchers)[0].id,'b');assert.equal(searchPeople(i,'no such person',data.researchers).length,0);});
test('DOI casing and URL variants collapse without name-based work dedupe',()=>{assert.equal(doiKey('https://doi.org/10.1234/ABC'),'10.1234/abc');assert.equal(dedupeWorks([{id:'x',doi:'10.1234/ABC',authorships:[1]},{id:'y',doi:'https://doi.org/10.1234/abc',authorships:[1,2]}]).length,1);});
test('reapplying persistent manual correction survives fresh input',()=>{const overrides={excludedAuthorIds:[],researchers:{a:{name:'Correct Name'}}};assert.equal(applyOverrides([p('a','Wrong Name')],overrides)[0].name,'Correct Name');assert.equal(applyOverrides([p('a','New API Name')],overrides)[0].name,'Correct Name');});
test('classification excludes generic machine-learning trajectories and includes orbital subjects',()=>{assert.deepEqual(classify('Optimal robotic path planning using neural networks'),[]);assert.ok(classify('Low-thrust trajectory optimization in the Earth-Moon system').includes('lowthrust'));assert.deepEqual(classify('Spacecraft attitude control using neural networks'),[]);});
test('focus shows an actual one-hop neighborhood',()=>{const v=selectView(data,{focusId:'a',includeUnknown:false});assert.equal(v.visibleIds.has('c'),false);assert.ok(v.edges.every(e=>e.source==='a'||e.target==='a'));});
test('verified Japanese/English author pairs merge, unknown authors stay distinct',()=>{
  const a=(id,name)=>({author:{id,name,display_name:name},institutions:[]});
  const normalized=normalizeAuthorships([a('A1','Naoya Ozaki'),a('A2','尾崎直哉'),a(null,'Unknown 1'),a(null,'Unknown 2')],{A2:'A1'});
  assert.equal(normalized.length,3);assert.deepEqual(normalized[0].rawNames,['Naoya Ozaki','尾崎直哉']);
});
test('Eros does not match the word aerospace in topic classification',()=>{
  assert.equal(classify('Lunar orbit optimization','Aerospace engineering').includes('smallbody'),false);
  assert.equal(classify('Orbit design around Eros').includes('smallbody'),true);
});
