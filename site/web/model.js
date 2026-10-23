import {aggregateEdges,inPeriod,normalize} from './domain.js';
export function makeIndexes(data){
  const people=new Map(data.researchers.map(p=>[p.id,p]));
  const works=new Map(data.works.map(w=>[w.id,w]));
  const nodes=new Map([...people,...data.auxiliary.map(a=>[a.id,a])]);
  const topics=new Map(data.topics.map(t=>[t.id,t]));
  const search=new Map(data.researchers.map(p=>[p.id,normalize([p.name,...p.aliases,...p.affiliations.map(a=>a.name),...p.topics.map(id=>`${topics.get(id)?.label} ${topics.get(id)?.en}`),...p.workIds.map(id=>works.get(id)?.title??'')].join(' '))]));
  return {people,works,nodes,topics,search};
}
export function selectView(data,state){
  const {from=data.metadata.minYear,to=data.metadata.maxYear,includeUnknown=true,topics=[],mode='network',kinds=['coauthor'],focusId=null}=state;
  const topicSet=new Set(topics),allIds=new Set(data.researchers.map(p=>p.id));
  const activeWorks=data.works.filter(w=>inPeriod(w.year,w.year,from,to,includeUnknown)&&(!topics.length||w.topics.some(t=>topicSet.has(t))));
  const activePersonIds=new Set(activeWorks.flatMap(w=>w.authors.map(a=>a.id).filter(id=>allIds.has(id))));
  const allPeople=new Map(data.researchers.map(p=>[p.id,p]));
  const relationKinds=new Set(mode==='lineage'?['advisor',...kinds.filter(k=>k!=='coauthor')]:kinds);
  let relationships=data.relationships.filter(r=>relationKinds.has(r.kind)&&inPeriod(r.startYear??r.year,r.endYear??r.year,from,to,includeUnknown)&&(!topics.length||[r.source,r.target].some(id=>allPeople.get(id)?.topics.some(t=>topicSet.has(t)))));
  let edges=mode==='network'&&relationKinds.has('coauthor')?aggregateEdges(activeWorks,allIds):[];
  edges.push(...relationships);
  let visibleIds=new Set(edges.flatMap(e=>[e.source,e.target]));
  if(mode==='network'&&relationKinds.has('coauthor')){
    for(const id of activePersonIds)visibleIds.add(id);
    if(!topics.length&&from===data.metadata.minYear&&to===data.metadata.maxYear&&includeUnknown)for(const id of allIds)visibleIds.add(id);
  }
  if(focusId&&visibleIds.has(focusId)){
    visibleIds=new Set([focusId,...edges.filter(e=>e.source===focusId||e.target===focusId).flatMap(e=>[e.source,e.target])]);
    edges=edges.filter(e=>visibleIds.has(e.source)&&visibleIds.has(e.target));
  }
  relationships=relationships.filter(r=>visibleIds.has(r.source)&&visibleIds.has(r.target));
  const people=data.researchers.filter(p=>visibleIds.has(p.id));
  const works=activeWorks.filter(w=>w.authors.some(a=>visibleIds.has(a.id)));
  const paperCounts=new Map();for(const w of works)for(const a of w.authors)if(visibleIds.has(a.id))paperCounts.set(a.id,(paperCounts.get(a.id)??0)+1);
  return {people,auxiliary:data.auxiliary.filter(a=>visibleIds.has(a.id)),works,edges,relationships,visibleIds,paperCounts};
}
export function searchPeople(indexes,query,people){
  const q=normalize(query);
  if(!q)return people;
  return people.filter(p=>indexes.search.get(p.id)?.includes(q)).sort((a,b)=>{
    const exactA=normalize(a.name).includes(q)||a.aliases.some(n=>normalize(n).includes(q));
    const exactB=normalize(b.name).includes(q)||b.aliases.some(n=>normalize(n).includes(q));
    return Number(exactB)-Number(exactA)||a.name.localeCompare(b.name);
  });
}
export function relationshipPeriod(r){
  if(r.year!=null)return `${r.year}`;
  if(r.startYear==null&&r.endYear==null)return '年代不明';
  if(r.startYear===r.endYear)return `${r.startYear}`;
  return `${r.startYear??'?'}–${r.endYear??'?'}`;
}
