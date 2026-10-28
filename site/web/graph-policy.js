// Presentation only: counts, search and evidence always use the complete filtered view.
export function makeEdgeLevels(edges,{overviewDegree=2}={}){
  const ranked=[...edges].filter(e=>e.kind==='coauthor').sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id));
  const degree=new Map(),overview=new Set(),medium=new Set();
  for(const e of ranked){
    const a=degree.get(e.source)??0,b=degree.get(e.target)??0;
    if(a<overviewDegree||b<overviewDegree)overview.add(e.id);
    if(a<4||b<4)medium.add(e.id);
    degree.set(e.source,a+1);degree.set(e.target,b+1);
  }
  return {overview,medium};
}
export function renderEdges(edges,levels,{density='auto',zoomRatio=1,selected=null,focusId=null,viewportIds=null}={}){
  if(density==='all'||focusId||(zoomRatio>=3.2&&!viewportIds))return edges;
  const level=zoomRatio>=1.8?levels.medium:levels.overview;
  return edges.filter(e=>e.kind!=='coauthor'||(zoomRatio>=3.2?viewportIds.has(e.source)||viewportIds.has(e.target):level.has(e.id))||
    (selected?.type==='node'&&(e.source===selected.id||e.target===selected.id))||
    (selected?.type==='edge'&&e.id===selected.id));
}
