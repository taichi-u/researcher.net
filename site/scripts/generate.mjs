import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {scalablePositions} from './layout.mjs';
import cytoscape from '../../node_modules/cytoscape/dist/cytoscape.esm.min.mjs';
import {TOPICS,normalize,shortId,doiKey,abstractText,classify,dedupeWorks,aggregateEdges,applyOverrides,normalizeAuthorships} from '../web/domain.js';
const read=async n=>JSON.parse(await fs.readFile(`site/data/${n}.json`,'utf8'));
console.log('Reading cached metadata…');
const [raw,profiles,selected,seeds,overrides,curation,collection]=await Promise.all(['raw-works','raw-authors','selected-authors','seeds','overrides','curation','collection-state'].map(read));
let historical={};try{historical=await read('expansion-historical');}catch(error){if(error.code!=='ENOENT')throw error;}
if(collection.expanded){const extra=await read('raw-expansion-works');raw.push(...extra);}
const snapshotDate=collection.date??'2026-10-23';
let crossref=[];try{crossref=await read('crossref');}catch(error){if(error.code!=='ENOENT')throw error;}
if(!collection.complete)throw Error('Collection has not completed. Keep the previous published snapshot.');
const canon=id=>overrides.authorAliases[shortId(id)]??shortId(id);
const rid=id=>`r:${canon(id)}`;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex').slice(0,14);
const selectedIds=new Set(selected.map(a=>canon(a.id)).filter(id=>!overrides.excludedAuthorIds.includes(id)));
console.log(`Normalizing ${raw.length} source records…`);
const works=dedupeWorks([...raw,...overrides.additionalWorks]).filter(w=>!overrides.excludedWorkIds.includes(shortId(w.id))).flatMap(w=>{
  const topics=overrides.workTopics[shortId(w.id)]??historical[shortId(w.id)]?.topics??classify(w.title,abstractText(w.abstract_inverted_index));
  if(!topics.length || w.authorships.length>50 || (w.publication_date && w.publication_date>snapshotDate) || !w.authorships.some(a=>selectedIds.has(canon(a.author.id))))return [];
  const doi=doiKey(w.doi);
  return [{id:`w:${shortId(w.id)}`,title:w.title,doi:doi||null,url:doi?`https://doi.org/${doi}`:(w.primary_location?.landing_page_url??w.id),year:w.publication_year??null,date:w.publication_date??null,type:w.type,topics,...(historical[shortId(w.id)]?{historicalSource:historical[shortId(w.id)]}:{}),topicMethod:overrides.workTopics[shortId(w.id)]?'curated':historical[shortId(w.id)]?'historical-source-review':'title-abstract-keywords',access:w.open_access?.is_oa?'open':'closed',sourceUrl:w.id,checkedAt:w._retrievedAt??'2026-10-23',authors:normalizeAuthorships(w.authorships,overrides.authorAliases)}];
});
const profileMap=new Map(profiles.filter(p=>shortId(p.id)===canon(p.id)).map(p=>[canon(p.id),p]));
for(const w of works){const c=crossref.find(c=>c.doi===w.doi);if(c)w.crossref={url:c.sourceUrl,checkedAt:c.checkedAt,year:c.year,authors:c.authors,comparison:c.comparison};}
for(const p of profiles)if(!profileMap.has(canon(p.id)))profileMap.set(canon(p.id),p);
const worksByAuthor=new Map();for(const w of works)for(const a of w.authors){if(!worksByAuthor.has(a.id))worksByAuthor.set(a.id,[]);worksByAuthor.get(a.id).push(w);}
const selectedById=new Map(selected.map(a=>[canon(a.id),a]));
let researchers=[...selectedIds].map(id=>{
  const selectedAuthor=selectedById.get(id),profile=profileMap.get(id),seed=seeds.find(s=>s.openalex===id);
  const myWorks=worksByAuthor.get(rid(id))??[];
  const topicCounts=TOPICS.map(t=>({id:t.id,n:myWorks.filter(w=>w.topics.includes(t.id)).length})).sort((a,b)=>b.n-a.n);
  const affiliations=new Map();
  for(const work of myWorks)for(const a of work.authors.filter(a=>a.id===rid(id)))for(const i of a.affiliations){
    if(!affiliations.has(i.id))affiliations.set(i.id,{...i,years:[],workIds:[]});
    const entry=affiliations.get(i.id);if(work.year!=null)entry.years.push(work.year);entry.workIds.push(work.id);
  }
  return {id:rid(id),openalex:id,name:seed?.name??profile?.display_name??selectedAuthor.name,aliases:[...new Set([...(seed?.aliases??[]),selectedAuthor.name].filter(Boolean))],orcid:profile?.orcid??selectedAuthor.orcid??null,seed:!!seed,verificationStatus:seed?'reviewed-seed':'metadata-linked',topics:topicCounts.filter(t=>t.n).map(t=>t.id),primaryTopic:topicCounts.find(t=>t.n)?.id??'unclassified',workIds:myWorks.map(w=>w.id),paperCount:myWorks.length,affiliations:[...affiliations.values()].map(a=>({...a,years:[...new Set(a.years)].sort((a,b)=>a-b)})).sort((a,b)=>(b.years.at(-1)??0)-(a.years.at(-1)??0)),currentAffiliation:null,evidence:[{url:myWorks[0]?.sourceUrl??`https://openalex.org/${id}`,title:'収録論文の著者情報',accessedAt:myWorks[0]?.checkedAt??snapshotDate,status:'metadata-linked'},...(seed?.profileUrl?[{url:seed.profileUrl,title:'公式プロフィール・研究紹介',accessedAt:'2026-10-23',status:'reviewed-seed'}]:[])]};
});
researchers=applyOverrides(researchers,overrides);
for(const [oldId,entry]of Object.entries(overrides.aliasEvidence??{})){
  const p=researchers.find(p=>p.openalex===canon(oldId));if(!p)continue;
  const urls=typeof entry==='string'?(entry.match(/https:\/\/[^\s]+/g)??[]):entry.urls??[];
  for(const url of urls)p.evidence.push({url,title:'氏名・著者IDの照合資料',accessedAt:entry.checkedAt??'2026-10-24',status:'verified-primary-source'});
}
const curationMatches=[];
const curatedPeople=new Map();
for(const p of curation.people){
  const reviewedId=overrides.curatedIdentities?.[p.name]?.openalex;
  let match=reviewedId?researchers.find(r=>r.openalex===canon(reviewedId)):null;
  if(reviewedId&&!match)throw Error(`Reviewed identity missing from selection: ${p.name}`);
  if(match){match.aliases=[...new Set([...match.aliases,p.name,...(p.aliases??[])])];match.evidence.push(...p.evidence);match.verificationStatus=match.seed?'reviewed-seed':'official-record-linked';curationMatches.push({name:p.name,id:match.id,method:'reviewed-name-affiliation-and-domain'});}
  else {match={id:`r:curated-${hash(p.name)}`,openalex:null,name:p.name,aliases:p.aliases??[],orcid:null,seed:false,verificationStatus:'official-record',topics:[],primaryTopic:'unclassified',workIds:[],paperCount:0,affiliations:[],currentAffiliation:p.currentAffiliation??null,evidence:p.evidence};researchers.push(match);curationMatches.push({name:p.name,id:match.id,method:'official-record-only'});}
  curatedPeople.set(p.name,match.id);
}
const person=name=>{const id=curatedPeople.get(name);if(!id)throw Error(`Missing curated person ${name}`);return id;};
const relationships=curation.advisorships.map((r,i)=>({id:`advisor:${i}`,source:person(r.advisor),target:person(r.student),kind:'advisor',year:r.year??null,startYear:r.startYear??null,endYear:r.endYear??null,degree:r.degree,role:r.role??'advisor',evidence:r.evidence}));
const auxiliary=[];
for(const lab of curation.labs){
  const id=`lab:${lab.id}`;auxiliary.push({id,kind:'lab',name:lab.name,url:lab.url,evidence:lab.evidence??[],topics:[]});
  for(const [i,m]of lab.members.entries())relationships.push({id:`${id}:${i}`,source:id,target:person(m.name),kind:'lab',startYear:m.startYear??null,endYear:m.endYear??null,year:m.year??null,role:m.role,evidence:m.evidence});
}
for(const project of curation.projects){
  const id=`project:${project.id}`;auxiliary.push({...project,id,kind:'project',name:project.title,topics:[]});
  for(const [i,m]of project.participants.entries())relationships.push({id:`${id}:${i}`,source:id,target:person(m.name),kind:'project',startYear:m.startYear??project.startYear??null,endYear:m.endYear??project.endYear??null,year:m.year??project.year??null,role:m.role,evidence:m.evidence});
}
const allIds=new Set(researchers.map(p=>p.id));
const edges=aggregateEdges(works,allIds);
console.log(`Laying out ${researchers.length} people and ${edges.length} coauthor relations…`);
if(researchers.length>600){scalablePositions(researchers,edges,TOPICS.map(t=>t.id));}else{
const elements=[...researchers.map((p,i)=>({data:{id:p.id},position:{x:Math.cos(i*2.399963229728653)*Math.sqrt(i+1)*45,y:Math.sin(i*2.399963229728653)*Math.sqrt(i+1)*45}})),...edges.map(e=>({data:{id:e.id,source:e.source,target:e.target,weight:Math.min(e.count,20)}}))];
const cy=cytoscape({headless:true,elements,styleEnabled:false});
cy.layout({name:'cose',randomize:false,animate:false,numIter:1300,nodeRepulsion:()=>1500000,idealEdgeLength:()=>110,edgeElasticity:()=>90,gravity:0.3,componentSpacing:140}).run();
for(const p of researchers){const pos=cy.getElementById(p.id).position();p.position={x:Math.round(pos.x),y:Math.round(pos.y)};}
cy.destroy();
const xs=researchers.map(p=>p.position.x),ys=researchers.map(p=>p.position.y);
const positionScale=1200/Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));
for(const p of researchers)p.position={x:Math.round(p.position.x*positionScale*1.6),y:Math.round(p.position.y*positionScale)};
}
const genealogyNodes=new Set(relationships.filter(r=>r.kind==='advisor').flatMap(r=>[r.source,r.target]));
// Longest-parent depth keeps both coadvisors above a jointly advised student.
const advisors=relationships.filter(r=>r.kind==='advisor');
const depth=new Map(),visiting=new Set();
function level(id){
  if(depth.has(id))return depth.get(id);
  if(visiting.has(id))throw Error('Advisor cycle');
  visiting.add(id);
  const parents=advisors.filter(r=>r.target===id).map(r=>r.source);
  const value=parents.length?Math.max(...parents.map(level))+1:0;
  visiting.delete(id);depth.set(id,value);return value;
}
const pending=new Set(genealogyNodes),components=[];
while(pending.size){const component=[],queue=[pending.values().next().value];while(queue.length){const id=queue.shift();if(!pending.delete(id))continue;component.push(id);for(const r of advisors)if(r.source===id||r.target===id)queue.push(r.source===id?r.target:r.source);}components.push(component);}
let top=0;
for(const component of components){
  const layers=new Map();
  for(const id of component){const d=level(id);if(!layers.has(d))layers.set(d,[]);layers.get(d).push(id);}
  for(const [d,ids]of layers)for(const [i,id]of ids.entries())researchers.find(p=>p.id===id).lineagePosition={x:(i-(ids.length-1)/2)*200,y:top+d*180};
  top+=(Math.max(...layers.keys())+1)*180+160;
}
for(const a of auxiliary){const members=relationships.filter(r=>r.source===a.id).map(r=>researchers.find(p=>p.id===r.target)).filter(Boolean);a.position={x:Math.round(members.reduce((s,p)=>s+p.position.x,0)/(members.length||1))+70,y:Math.round(members.reduce((s,p)=>s+p.position.y,0)/(members.length||1))-100};}
const years=works.map(w=>w.year).filter(Number.isFinite);
const dataset={schemaVersion:1,metadata:{snapshotDate,title:'researcher.net',minYear:Math.min(...years,...relationships.flatMap(r=>[r.year,r.startYear,r.endYear].filter(Number.isFinite))),maxYear:Number(snapshotDate.slice(0,4)),expansion:collection.expansion??null,collection:{...collection},counts:{researchers:researchers.length,works:works.length,coauthorEdges:edges.length,advisorships:relationships.filter(r=>r.kind==='advisor').length,labs:curation.labs.length,projects:curation.projects.length},notes:[collection.expanded?'12名の起点に加え、16分野・複数年代の書誌検索から拡張した標本です。分野全体を網羅するものではありません。':'世界の12名を起点とする共著サンプルです。分野全体を網羅するものではありません。','共著件数・分野は収録論文内の集計です。論文の題名・公開要旨からキーワードで分類しています。','所属は論文に記録された年の情報です。現在の在籍を保証しません。','指導・研究室・研究課題の関係は公式資料で確認したものを掲載しています。','同姓同名や著者レコード分割など、公開メタデータの誤りが残る場合があります。'],selectionPolicy:collection.expansion?.selection??'12 reviewed seeds; round-robin first-degree coauthors with >=2 topical works, then full topical work retrieval for selected authors; max 50 authors per paper; manual evidence additions.',curationMatches},topics:TOPICS.map(({pattern,...t})=>t),researchers,works,relationships,auxiliary};
await fs.writeFile('site/data/dataset.json',JSON.stringify(dataset));
console.log(JSON.stringify(dataset.metadata.counts));
console.log(`Years ${dataset.metadata.minYear}–${dataset.metadata.maxYear}; ${(JSON.stringify(dataset).length/1024/1024).toFixed(1)} MiB JSON`);
