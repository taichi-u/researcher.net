export const TOPICS = [
  {id:'interplanetary',label:'惑星間・スイングバイ',en:'Interplanetary & gravity assists',color:'#466B91',pattern:/interplanetary|gravity.assist|swing.?by|fly.?by|multi.?target|tour of|grand tour|planetary tour|interstellar|asteroid rendezvous/i},
  {id:'lowthrust',label:'低推力・ソーラーセイル',en:'Low thrust & solar sails',color:'#9F683B',pattern:/low.thrust|solar.sail|electric.propulsion|continuous.thrust|thrust.coast|sailcraft/i},
  {id:'multibody',label:'多体系・月近傍',en:'Multi-body & cislunar',color:'#756A9C',pattern:/three.body|four.body|multi.body|multibody|cislunar|cis.lunar|earth.moon|earth.sun|libration|lagrang|lagrange|halo.orbit|invariant.manifold|lunar.transfer|lunar.orbit|quasi.periodic/i},
  {id:'smallbody',label:'小天体近傍',en:'Small-body proximity',color:'#5A7D68',pattern:/small.bod|asteroid|comet|irregular.gravit|bennu|ryugu|phobos|deimos|\beros\b|itokawa/i},
  {id:'relative',label:'ランデブー・編隊',en:'Rendezvous & formation',color:'#4B8790',pattern:/rendezvous|formation.fly|formation.flight|relative.motion|relative.orbit|proximity.operation|docking|spacecraft.swarm|constellation|debris.removal/i},
  {id:'optimization',label:'数値最適化・最適制御',en:'Optimization & optimal control',color:'#B26150',pattern:/optimi[sz]|optimal.control|pseudospectral|collocation|convex|homotop|primer.vector|shooting.method|lambert/i},
  {id:'robust',label:'ロバスト・確率的設計',en:'Robust & stochastic design',color:'#948237',pattern:/robust|stochastic|uncertain|chance.constrain|missed.thrust|contingenc|reliability|risk.aware/i},
  {id:'learning',label:'機械学習・自律設計',en:'Learning & autonomy',color:'#9C6C88',pattern:/machine.learning|reinforcement.learning|neural|deep.learning|artificial.intelligence|autonomous|surrogate.model|gaussian.process/i},
  {id:'celestial',label:'天体力学・摂動論',en:'Celestial mechanics & perturbations',color:'#656F8A',pattern:/celestial.mechanics|orbital.dynamics|orbital.resonance|secular.perturbation|satellite.theory|planetary.motion|kepler|kozai|lidov|n.body.problem|satellite.orbit|stability.of.*orbit/i},
  {id:'navigation',label:'軌道決定・宇宙航法',en:'Orbit determination & space navigation',color:'#3D7A84',pattern:/orbit(?:al)?.determination|orbit.estimation|spacecraft.navigation|satellite.navigation|orbit.reconstruction|initial.orbit|angles.only|precise.orbit|astrometr/i},
  {id:'debris',label:'スペースデブリ・宇宙監視',en:'Space debris & surveillance',color:'#897046',pattern:/space.debris|orbital.debris|collision.avoidance|space.situational|space.surveillance|debris.removal|conjunction.assessment|space.traffic/i},
  {id:'entry',label:'再突入・着陸',en:'Atmospheric entry & landing',color:'#A06C61',pattern:/re.entry|reentry|atmospheric.entry|entry.descent|aerocapture|aerobraking|hypersonic.trajectory|entry.guidance|planetary.landing|lunar.landing|mars.landing|powered.descent/i},
  {id:'launch',label:'打上げ・上昇軌道',en:'Launch vehicles & ascent',color:'#786D55',pattern:/launch.vehicle|ascent.trajectory|rocket.trajectory|launch.window|rocket.flight|launch.trajectory|ascent.guidance|multistage.rocket/i},
  {id:'attitude',label:'姿勢制御・誘導',en:'Attitude dynamics & guidance',color:'#7A7294',pattern:/attitude|spacecraft.guidance|satellite.control|reaction.wheel|control.moment.gyro|spacecraft.dynamics/i},
  {id:'propulsion',label:'宇宙推進',en:'Space propulsion',color:'#9A7656',pattern:/rocket.propulsion|space.propulsion|electric.propulsion|ion.thrust|nuclear.propulsion|chemical.propulsion|thrust.vector|solar.sail|plasma.propulsion/i},
  {id:'geodesy',label:'衛星測地・重力場',en:'Satellite geodesy & gravity fields',color:'#60816F',pattern:/satellite.geodesy|satellite.gravimetry|gravity.field|gravity.recovery|satellite.laser.rang|\bGNSS\b|\bGRACE\b|\bGOCE\b/i}
];
export const normalize = s => String(s??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[’‘`]/g,"'").replace(/[^\p{L}\p{N}]/gu,'');
export const shortId = s => String(s??'').split('/').pop();
export const doiKey = s => String(s??'').toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//,'').replace(/^doi:/,'').trim();
export function normalizeAuthorships(authorships,aliases={}){
  const result=new Map();
  for(const [index,a]of authorships.entries()){
    const original=shortId(a.author.id),canonical=aliases[original]??original;
    const id=canonical&&!['A9999999999','A5317838346'].includes(canonical)?`r:${canonical}`:`unresolved:${index}`;
    if(!result.has(id))result.set(id,{id,name:a.author.display_name,rawNames:[],orcid:a.author.orcid??null,affiliations:[],rawAffiliations:[]});
    const p=result.get(id);p.rawNames=[...new Set([...p.rawNames,a.author.display_name])];p.orcid??=a.author.orcid;
    p.affiliations=[...new Map([...p.affiliations,...(a.institutions??[]).map(i=>({id:shortId(i.id),name:i.display_name,country:i.country_code,type:i.type}))].map(i=>[i.id,i])).values()];
    p.rawAffiliations=[...new Set([...p.rawAffiliations,...(a.raw_affiliation_strings??[])])];
  }
  return [...result.values()];
}
export function abstractText(inverted) { if(!inverted) return '';const words=[];for(const [word,positions] of Object.entries(inverted))for(const p of positions)words[p]=word;return words.join(' '); }
export function classify(title, abstract='') {
  const text = `${title} ${abstract}`;
  // Require a spacecraft/orbital context; robotics and mathematical optimisation alone are out of scope.
  const context = /launch.vehicle|ascent.trajectory|hypersonic.trajectory|spacecraft|astrodynamic|orbit|interplanetary|cislunar|cis.lunar|libration|gravity.assist|solar.sail|low.thrust|satellite|earth.moon|asteroid|comet|celestial.mechanics|planetary.motion|kepler|rocket|space.propulsion|space.debris|re.entry|reentry|aerocapture|aerobraking|atmospheric.entry|entry.descent|planetary.landing|lunar.landing|mars.landing|powered.descent|\bGNSS\b|\bGRACE\b|\bGOCE\b/i.test(title);
  if(!context) return [];
  if(/asteroid|comet/i.test(title) && !/orbit|trajectory|spacecraft|mission|transfer|dynamics|control|navigation|rendezvous|gravity|proximity|mapping|landing/i.test(title)) return [];
  return TOPICS.filter(t=>t.pattern.test(text)).map(t=>t.id);
}
export function inPeriod(start,end,from,to,includeUnknown=true) {
  if(start==null && end==null) return includeUnknown;
  return (start??end)<=to && (end??start)>=from;
}
export function dedupeWorks(works) {
  const byKey=new Map();
  for(const w of works) {
    const key=doiKey(w.doi)||w.id;
    const old=byKey.get(key);
    if(!old || (w.authorships?.length??0)>(old.authorships?.length??0))byKey.set(key,w);
  }
  return [...byKey.values()];
}
export function aggregateEdges(works,ids) {
  const edges=new Map();
  for(const work of works) {
    const authors=[...new Set(work.authors.map(a=>a.id).filter(id=>ids.has(id)))].sort();
    for(let i=0;i<authors.length;i++)for(let j=i+1;j<authors.length;j++) {
      const key=`co:${authors[i]}:${authors[j]}`;
      if(!edges.has(key))edges.set(key,{id:key,source:authors[i],target:authors[j],kind:'coauthor',workIds:[],years:[],topics:[]});
      const e=edges.get(key);e.workIds.push(work.id);if(work.year!=null)e.years.push(work.year);e.topics.push(...work.topics);
    }
  }
  return [...edges.values()].map(e=>({...e,count:e.workIds.length,years:[...new Set(e.years)].sort((a,b)=>a-b),topics:[...new Set(e.topics)]}));
}
export function applyOverrides(researchers, overrides) {
  return researchers.filter(p=>!overrides.excludedAuthorIds.includes(p.openalex)).map(p=>({...p,...overrides.researchers[p.id]}));
}
