// Deterministic, linear-time topic layout with local collision relief.
// Coordinates are an exploration aid, never geographic positions or a ranking.
export function scalablePositions(people,edges,topicIds){
  const hash=id=>{let h=0;for(const c of id)h=(Math.imul(h,31)+c.charCodeAt(0))>>>0;return h;};
  const groups=new Map(topicIds.map(id=>[id,[]]));groups.set('unclassified',[]);
  for(const p of people)(groups.get(p.primaryTopic)??groups.get('unclassified')).push(p);
  let groupIndex=0;
  for(const group of groups.values()){
    const center={x:(groupIndex%4)*950,y:Math.floor(groupIndex/4)*850};groupIndex++;
    group.sort((a,b)=>a.id.localeCompare(b.id));
    for(const [i,p]of group.entries()){
      const angle=i*2.399963229728653+hash(p.id)%100/100;
      const radius=22*Math.sqrt(i+1);
      p.position={x:center.x+Math.cos(angle)*radius,y:center.y+Math.sin(angle)*radius};
    }
  }
  const byId=new Map(people.map(p=>[p.id,p]));
  // Pull cross-topic collaborators slightly toward their strongest partner.
  const strongest=new Map();
  for(const e of edges)for(const [a,b]of [[e.source,e.target],[e.target,e.source]])if(!strongest.has(a)||(strongest.get(a).count<e.count))strongest.set(a,{id:b,count:e.count});
  const initial=new Map(people.map(p=>[p.id,{...p.position}]));
  for(const p of people){const partner=byId.get(strongest.get(p.id)?.id);if(partner&&partner.primaryTopic!==p.primaryTopic){const q=initial.get(partner.id);p.position.x=p.position.x*.86+q.x*.14;p.position.y=p.position.y*.86+q.y*.14;}}
  for(let pass=0;pass<8;pass++){
    const grid=new Map();
    for(const p of people){
      const x=Math.floor(p.position.x/18),y=Math.floor(p.position.y/18);
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const other of grid.get(`${x+dx}:${y+dy}`)??[]){
        let ax=p.position.x-other.position.x,ay=p.position.y-other.position.y;const distance=Math.hypot(ax,ay);
        if(distance>=15)continue;if(distance<.01){ax=1;ay=.5;}
        const push=(15-distance)*.5/Math.max(distance,1);p.position.x+=ax*push;p.position.y+=ay*push;other.position.x-=ax*push;other.position.y-=ay*push;
      }
      const key=`${Math.floor(p.position.x/18)}:${Math.floor(p.position.y/18)}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(p);
    }
  }
  for(const p of people)p.position={x:Math.round(p.position.x),y:Math.round(p.position.y)};
}
