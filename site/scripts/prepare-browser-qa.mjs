import fs from 'node:fs/promises';
// Local-only fixtures. A normal build removes these from dist before publication.
const root='dist/qa400';
await fs.mkdir(`${root}/data`,{recursive:true});
await fs.cp('site/web',root,{recursive:true});
await fs.cp('dist/assets',`${root}/assets`,{recursive:true});
const data=JSON.parse(await fs.readFile('site/data/dataset.json','utf8'));
const original=[...data.researchers],originalWorks=[...data.works];
while(data.researchers.length<400){
  const p=original[data.researchers.length%original.length],id=`fixture:${data.researchers.length}`;
  const works=originalWorks.filter(w=>p.workIds.includes(w.id)).map(w=>({...w,id:`${id}:${w.id}`,authors:w.authors.map(a=>a.id===p.id?{...a,id}:a)}));
  data.researchers.push({...p,id,name:`Fixture ${id}`,seed:false,position:{x:p.position.x+50,y:p.position.y+50},workIds:works.map(w=>w.id)});
  data.works.push(...works);
}
data.metadata.counts.researchers=400;data.metadata.counts.works=data.works.length;
await fs.writeFile(`${root}/data/dataset.json`,JSON.stringify(data));
const mobile=await fs.readFile('site/tests/mobile.html','utf8');
await fs.writeFile('dist/mobile-qa.html',mobile);
await fs.writeFile('dist/performance-qa.html',mobile.replace('width:390px;height:844px','width:1200px;height:740px').replace('src="./index.html"','src="./qa400/index.html"').replaceAll('モバイル表示','400人表示'));
console.log('Local QA: /mobile-qa.html and /performance-qa.html; never publish this build.');
