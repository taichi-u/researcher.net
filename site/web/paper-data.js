export const PAPER_SHARDS=64;
export function paperShard(id){
  let hash=0;for(const char of id)hash=(Math.imul(hash,31)+char.charCodeAt(0))|0;
  return (hash>>>0)%PAPER_SHARDS;
}
export function createPaperLoader(works,fetchShard){
  const requests=new Map();
  return async id=>{
    const work=works.get(id);if(!work)throw Error('Unknown paper');
    if(!work.detailsPending)return work;
    const shard=paperShard(id);
    if(!requests.has(shard)){
      const request=Promise.resolve().then(()=>fetchShard(shard)).then(records=>{
        if(!Array.isArray(records)||!records.some(record=>record.id===id))throw Error('Invalid paper details');
        for(const record of records){const target=works.get(record.id);if(target)Object.assign(target,record,{detailsPending:false});}
      }).catch(error=>{requests.delete(shard);throw error;});
      requests.set(shard,request);
    }
    await requests.get(shard);
    if(work.detailsPending)throw Error('Paper details missing');
    return work;
  };
}
