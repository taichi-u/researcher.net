import fs from 'node:fs/promises';
import {PAPER_SHARDS,paperShard} from '../web/paper-data.js';

export function partitionBrowserData(data){
  const shards=Array.from({length:PAPER_SHARDS},()=>[]);
  const works=data.works.map(work=>{
    shards[paperShard(work.id)].push(work);
    const {id,title,url,year,topics,access,sourceUrl}=work;
    return {id,title,url,year,topics,access,sourceUrl,detailsPending:true,authors:work.authors.map(({id,name})=>({id,name}))};
  });
  return {catalog:{...data,works},shards};
}
export async function writeBrowserData(data,directory){
  const {catalog,shards}=partitionBrowserData(data);
  await fs.mkdir(`${directory}/works`,{recursive:true});
  await fs.writeFile(`${directory}/dataset.json`,JSON.stringify(catalog));
  await Promise.all(shards.map((records,i)=>fs.writeFile(`${directory}/works/${i}.json`,JSON.stringify(records))));
}
