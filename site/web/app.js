import {makeIndexes,selectView,searchPeople,relationshipPeriod} from './model.js';
import {makeEdgeLevels,renderEdges} from './graph-policy.js';
import {createPaperLoader} from './paper-data.js';
const $=s=>document.querySelector(s);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=s=>/^https?:\/\//.test(String(s))?escape(s):'#';
const link=(href,label,cls='')=>`<a class="${cls}" href="${url(href)}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>`;
const number=n=>n.toLocaleString('ja-JP');
const kindLabels={coauthor:'共著',advisor:'指導',lab:'研究室所属',project:'研究課題への参加'};
const roleName=role=>({advisor:'指導教員','co-advisor':'共同指導教員','Principal Investigator':'研究代表者'}[role]??role);
const palette={interplanetary:'#436585',lowthrust:'#9B744F',multibody:'#7E7897',smallbody:'#628274',relative:'#4D8189',optimization:'#AD705F',robust:'#9A8949',learning:'#976D81',unclassified:'#8B929B'};
let zoomTimer,renderedMode,edgeLevels,overviewZoom=1,loadPaper;
let data,indexes,view,cy,state,selected=null,detailTab='overview',paperLimit=20,tooltipTimer,searchTimer,lastFocusElement=null,lastFocusPerson=null;
const status=text=>{$('#status').textContent=text;};
const topicName=id=>indexes.topics.get(id)?.label??id;
const personName=id=>indexes.nodes.get(id)?.name??id;
const topicTags=ids=>`<div class="topic-tags">${ids.map(id=>`<span class="topic-tag"><i style="background:${palette[id]??palette.unclassified}"></i>${escape(topicName(id))}</span>`).join('')}</div>`;
const evidenceHTML=evidence=>[...new Map((evidence??[]).map(e=>[e.url+'|'+e.summary,e])).values()].map(e=>`<div class="source-item">${link(e.url,e.title||'出典')}<p>${escape(e.summary??'')}</p><span class="source-meta">確認日 ${escape(e.accessedAt??data.metadata.snapshotDate)}${e.status==='metadata-linked'?' · 書誌メタデータ':' · 公式資料'}</span></div>`).join('');
function periodYears(years){if(!years.length)return '年代不明';return years[0]===years.at(-1)?String(years[0]):`${years[0]}–${years.at(-1)}`;}
function affiliationLabel(p){const a=p.affiliations[0];return a?`${a.name} · ${a.years.at(-1)??'年不明'}`:'所属情報未収録';}
function personButton(id,label){return `<button class="person-link" data-person="${escape(id)}">${escape(label??personName(id))}</button>`;}
function paperEvidenceHTML(w){
  if(w.detailsPending)return '<p>著者・所属の詳細を読み込み中…</p>';
  return `<ul>${w.authors.map(a=>`<li>${indexes.people.has(a.id)?personButton(a.id,a.name):escape(a.name)}${a.affiliations.length?` — ${escape(a.affiliations.map(i=>i.name).join(' / '))}`:''}</li>`).join('')}</ul>${link(w.sourceUrl,'OpenAlex 書誌レコード')}${w.crossref?'<br>'+link(w.crossref.url,'Crossref 書誌レコード'):''}`;
}
async function loadPaperEvidence(details){
  const target=details.querySelector('.paper-evidence');
  try{const work=await loadPaper(details.dataset.work);if(details.isConnected)target.innerHTML=paperEvidenceHTML(work);}
  catch{if(details.isConnected)target.innerHTML='<p>詳細を読み込めませんでした。閉じて開くと再試行できます。</p>';}
}
function paperHTML(w){
  const authorText=w.authors.slice(0,4).map(a=>a.name).join(', ')+(w.authors.length>4?` ほか${w.authors.length-4}名`:'');
  return `<article class="paper"><div class="paper-header"><span>${w.year??'年代不明'}</span><span>${w.access==='open'?'Open access':'出版社・収録先で確認'}</span></div><h3>${link(w.url,w.title)}</h3><p class="paper-authors">${escape(authorText)}</p><details data-work="${escape(w.id)}"><summary>全著者・掲載時の所属（${w.authors.length}名）</summary><div class="paper-evidence">${paperEvidenceHTML(w)}</div></details><div class="paper-topics">${escape(w.topics.map(topicName).join(' / '))}</div></article>`;
}
function paperListHTML(works){const sorted=[...works].sort((a,b)=>(b.year??0)-(a.year??0)||a.title.localeCompare(b.title));return sorted.slice(0,paperLimit).map(paperHTML).join('')+(sorted.length>paperLimit?`<button class="button more-button" data-more>次の20件（残り${number(sorted.length-paperLimit)}件）</button>`:'');}
function renderFilters(){
  $('#topic-filters').innerHTML=data.topics.map(t=>`<label class="topic-filter"><input type="checkbox" name="topic" value="${t.id}"><span class="topic-swatch" style="background:${palette[t.id]}"></span><span>${escape(t.label)}</span></label>`).join('');
  for(const id of ['year-from','year-to']){const el=$('#'+id);el.min=data.metadata.minYear;el.max=data.metadata.maxYear;el.value=id==='year-from'?state.from:state.to;}
  $('#period-summary').textContent=`${state.from}–${state.to}`;
}
function renderPeople(){
  const started=performance.now();
  const sorted=[...view.people].sort((a,b)=>Number(b.seed)-Number(a.seed)||a.name.localeCompare(b.name));
  const results=searchPeople(indexes,$('#search').value,sorted);
  $('#result-count').textContent=number(results.length);
  $('#list-caption').textContent=$('#search').value?'検索結果 · 論文数':'起点順 · 論文数';
  $('#clear-search').hidden=!$('#search').value;
  $('#people-list').innerHTML=results.length?results.map(p=>`<button class="person-row${selected?.id===p.id?' selected':''}" data-person="${escape(p.id)}" aria-label="${escape(p.name)}の詳細"><span class="topic-dot" style="background:${palette[p.primaryTopic]}"></span><span class="row-content"><strong>${escape(p.name)}</strong><small>${escape(p.aliases.find(a=>/[\u3040-\u9fff]/.test(a))??affiliationLabel(p))}</small></span><span class="row-count" title="現在の条件に該当する収録論文数">${view.paperCounts.get(p.id)||'—'}</span></button>`).join(''):`<div class="list-empty">該当する研究者がありません。<p>氏名の別表記でも検索できます。</p></div>`;
  if(cy){const hasQuery=!!$('#search').value,ids=new Set(results.map(p=>p.id));cy.batch(()=>{cy.nodes().forEach(n=>{const muted=hasQuery&&!ids.has(n.id());if(n.hasClass('search-muted')!==muted)n.toggleClass('search-muted',muted);});cy.edges().filter(e=>e.hasClass('search-muted')!==hasQuery).toggleClass('search-muted',hasQuery);});}
  $('#search').dataset.renderMs=(performance.now()-started).toFixed(1);
  status(`${results.length}人の研究者`);
}
function graphStyle(zoom=1){const scale=1/zoom;return [
  {selector:'node',style:{'background-color':'data(color)','width':7*scale,'height':7*scale,'border-width':1,'border-color':'#ffffff','label':'','text-events':'yes','font-family':'"Source Serif 4", Georgia, serif','font-size':11*scale,'color':'#252831','text-valign':'bottom','text-margin-y':6*scale,'text-background-color':'#f6f7f9','text-background-opacity':.92,'text-background-padding':2*scale,'text-wrap':'wrap','text-max-width':150*scale,'z-index':5}},
  {selector:'node[seed]',style:{'label':'data(shortName)','font-size':13*scale,'font-weight':400,'text-background-opacity':1,'z-index-compare':'manual','z-index':20}},
  {selector:'node[kind = "lab"]',style:{shape:'rectangle',width:13*scale,height:13*scale,'background-color':'#f6f7f9','border-color':'#626976','border-width':1.5,label:'data(label)','font-size':11*scale}},
  {selector:'node[kind = "project"]',style:{shape:'diamond',width:16*scale,height:16*scale,'background-color':'#f6f7f9','border-color':'#626976','border-width':1.5,label:'data(label)','font-size':11*scale}},
  {selector:'edge',style:{width:e=>e.data('width')*.55*Math.min(scale,5),'line-color':'#aeb9c7','opacity':.35,'curve-style':'haystack','haystack-radius':0,'z-index':1}},
  {selector:'edge[kind = "advisor"]',style:{'curve-style':'bezier','line-color':'#62738a','target-arrow-shape':'triangle','target-arrow-color':'#62738a','arrow-scale':.7*scale,opacity:.72,width:scale}},
  {selector:'edge[kind = "lab"], edge[kind = "project"]',style:{'curve-style':'bezier','line-style':'dashed','line-color':'#7f8995','opacity':.6,width:1}},
  {selector:'.lineage-node',style:{label:'data(label)',width:9*scale,height:9*scale,'font-size':12*scale,'text-max-width':160}},
  {selector:'node.zoom-label',style:{label:'data(label)'}},
  {selector:'.dimmed',style:{opacity:.1}},
  {selector:'edge.dimmed',style:{events:'no'}},
  {selector:'.search-muted',style:{opacity:.1}},
  {selector:'node.neighbor',style:{label:'',opacity:1,'z-index':10}},
  {selector:'node.neighbor.zoom-label, node.neighbor.lineage-node',style:{label:'data(label)'}},
  {selector:'node.active',style:{label:'data(label)',opacity:1,'border-width':2.2,'border-color':'#252831',width:11*scale,height:11*scale,'font-weight':400,'font-size':13*scale,'z-index-compare':'manual','z-index':100}},
  {selector:'edge.edge-active',style:{opacity:.95,'line-color':'#274c77','target-arrow-color':'#274c77','z-index':8}},
  {selector:'edge.selected-edge',style:{'curve-style':'bezier',label:'data(shortLabel)','font-family':'system-ui, sans-serif','font-size':11*scale,'color':'#252831','text-background-color':'#ffffff','text-background-opacity':1,'text-background-padding':5,'text-rotation':'autorotate','line-color':'#274c77','target-arrow-color':'#274c77',opacity:1,'z-index':12}}
];}
function initGraph(){
  cy=cytoscape({container:$('#graph'),elements:[],style:graphStyle(),layout:{name:'preset'},minZoom:.08,maxZoom:4,wheelSensitivity:.18,boxSelectionEnabled:false,autoungrabify:true,selectionType:'single',hideEdgesOnViewport:true,pixelRatio:Math.min(window.devicePixelRatio||1,1.5)});
  cy.on('tap','node',e=>selectNode(e.target.id(),false));
  cy.on('tap','edge',e=>{if(!e.target.hasClass('dimmed'))selectEdge(e.target.id());});
  // Background taps preserve the current reading context, including taps on muted edges.
  // The explicit close button clears the selection.
  cy.on('mouseover','node, edge',e=>showTooltip(e));
  cy.on('mouseout','node, edge',()=>{tooltipTimer=setTimeout(()=>$('#tooltip').hidden=true,220);});
  cy.on('pan zoom',()=>{$('#tooltip').hidden=true;});
  // Let the canvas transform during a gesture. Recalculate styles/detail once it settles.
  cy.on('zoom',()=>{$('#graph').dataset.viewportBusy='true';clearTimeout(zoomTimer);zoomTimer=setTimeout(settleViewport,160);});
  new ResizeObserver(()=>cy.resize()).observe($('#graph'));
}
const fitPadding=preferred=>Math.min(preferred,cy.width()*.12,cy.height()*.12);
function fitElements(elements,padding=55){cy.fit(elements,fitPadding(padding));}
function settleViewport(){
  clearTimeout(zoomTimer);
  cy.batch(()=>{cy.style(graphStyle(cy.zoom()));cy.nodes().toggleClass('zoom-label',cy.zoom()/overviewZoom>=3.2);});
  syncGraphEdges();applyHighlight();$('#graph').dataset.viewportBusy='false';
}
function edgeElement(e){return {data:{id:e.id,source:e.source,target:e.target,kind:e.kind,count:e.count,width:e.kind==='coauthor'?Math.min(.65+Math.log2(e.count+1)*.55,3.5):1,shortLabel:e.kind==='coauthor'?`${e.topics.slice(0,2).map(topicName).join(' / ')} · ${e.count}件`:`${kindLabels[e.kind]} · ${relationshipPeriod(e)}`}};}
function syncGraphEdges(){
  if(!view)return;
  const edges=renderEdges(view.edges,edgeLevels,{density:$('#edge-density').value,zoomRatio:cy.zoom()/overviewZoom,selected,focusId:state.focusId});
  const ids=new Set(edges.map(e=>e.id)),added=[];
  cy.batch(()=>{
    cy.edges().filter(e=>!ids.has(e.id())).remove();
    for(const edge of edges){const element=edgeElement(edge),existing=cy.getElementById(edge.id);if(!existing.length)added.push(element);else if(existing.data('count')!==edge.count||existing.data('shortLabel')!==element.data.shortLabel)existing.data(element.data);}
    if(added.length)cy.add(added);
    if($('#search').value)cy.edges().addClass('search-muted');
  });
  $('#edge-summary').textContent=selected?.type==='node'?`${personName(selected.id)} · 全関係`:`関係線 ${number(edges.length)} / ${number(view.edges.length)}本${edges.length<view.edges.length?' · 拡大で詳細':''}`;
  $('#graph').dataset.renderedEdges=edges.length;
}
function updateView({fit=false}={}){
  const started=performance.now();view=selectView(data,state);edgeLevels=makeEdgeLevels(view.edges);
  const modeChanged=renderedMode!==state.mode;
  const oldPositions=modeChanged?new Map():new Map(cy.nodes().map(n=>[n.id(),n.position()]));
  const els=[...view.people.map(p=>({data:{id:p.id,label:p.name,shortName:p.name.split(/\s+/).at(-1),color:palette[p.primaryTopic],kind:'researcher',...(p.seed?{seed:1}:{})},position:state.mode==='lineage'?(p.lineagePosition??p.position):(oldPositions.get(p.id)??p.position),classes:state.mode==='lineage'?'lineage-node':''})),...view.auxiliary.map(a=>({data:{id:a.id,label:a.name.length>45?a.name.slice(0,43)+'…':a.name,color:'#8B929B',kind:a.kind},position:auxPosition(a)}))];
  cy.batch(()=>{const ids=new Set(els.map(el=>el.data.id));cy.nodes().filter(el=>!ids.has(el.id())).remove();const added=[];for(const el of els){const existing=cy.getElementById(el.data.id);if(!existing.length){added.push(el);continue;}existing.toggleClass('lineage-node',state.mode==='lineage');if(modeChanged||el.data.kind!=='researcher')existing.position(el.position);}if(added.length)cy.add(added);});renderedMode=state.mode;
  if(cy.nodes().length)overviewZoom=cy.getFitViewport(cy.nodes(),fitPadding(55))?.zoom??1;
  if(fit&&cy.nodes().length)fitElements(cy.nodes());
  if(fit||modeChanged){clearTimeout(zoomTimer);cy.style(graphStyle(cy.zoom()));$('#graph').dataset.viewportBusy='false';}
  syncGraphEdges();
  $('#empty-map').hidden=view.edges.length>0||view.people.length>0;
  const coa=view.edges.filter(e=>e.kind==='coauthor').length;
  $('#map-counts').innerHTML=`<span><strong>${number(view.people.length)}</strong>人</span><span><strong>${number(state.mode==='lineage'?view.relationships.filter(r=>r.kind==='advisor').length:coa)}</strong>${state.mode==='lineage'?'指導関係':'共著関係'}</span><span><strong>${number(view.works.length)}</strong>論文</span>`;
  $('#network-mode').setAttribute('aria-pressed',state.mode==='network');$('#lineage-mode').setAttribute('aria-pressed',state.mode==='lineage');
  $('#view-note').textContent=state.mode==='lineage'?'矢印は指導教員から学生へ。確認済みの関係のみ表示。':'配置は共著関係に基づきます。地理的位置は表しません。';
  $('#lab-key').hidden=!view.auxiliary.some(a=>a.kind==='lab');$('#project-key').hidden=!view.auxiliary.some(a=>a.kind==='project');
  $('#key-note').textContent=state.mode==='lineage'?'矢印：指導教員 → 学生':'線の太さ：共著件数';
  $('#period-summary').textContent=`${state.from}–${state.to}`;$('#topic-count').textContent=state.topics.length?`${state.topics.length}テーマ`:'全テーマ';
  $('#focus-indicator').hidden=!state.focusId;$('#focus-label').textContent=state.focusId?`${personName(state.focusId)} の周辺`:'';
  if(selected&&!cy.getElementById(selected.id).length){selected=null;closeDetail();status('選択した項目は絞り込み範囲外です。');}
  renderPeople();applyHighlight();if(selected)renderDetail();
  const ms=performance.now()-started;$('#map-counts').dataset.renderMs=ms.toFixed(1);
}
function auxPosition(a){if(state.mode!=='lineage')return a.position;const members=data.relationships.filter(r=>r.source===a.id).map(r=>indexes.people.get(r.target)).filter(p=>p?.lineagePosition);return members.length?{x:members.reduce((s,p)=>s+p.lineagePosition.x,0)/members.length+130,y:members.reduce((s,p)=>s+p.lineagePosition.y,0)/members.length-85}:a.position;}
function applyHighlight(){
  $('#clear-selection').hidden=!selected;$('#selection-help').textContent=selected?'選択中の関係線のみ操作可':'氏名をクリックすると関係を強調';
  cy.batch(()=>{cy.elements().removeClass('active neighbor dimmed edge-active selected-edge');if(!selected)return;const el=cy.getElementById(selected.id);if(!el.length)return;cy.elements().addClass('dimmed');if(el.isNode()){el.removeClass('dimmed').addClass('active');el.neighborhood().removeClass('dimmed');el.neighborhood('node').addClass('neighbor');el.connectedEdges().addClass('edge-active');}else{el.removeClass('dimmed').addClass('selected-edge');el.connectedNodes().removeClass('dimmed').addClass('active');}});
}
function showTooltip(e){
  clearTimeout(tooltipTimer);const el=e.target,tip=$('#tooltip');
  if(el.isEdge()&&el.hasClass('dimmed'))return;
  if(el.isNode()){const p=indexes.nodes.get(el.id());tip.innerHTML=`<strong>${escape(p.name)}</strong>${p.kind?`<p>${p.kind==='lab'?'研究室':'研究課題'}</p>`:`<div>${escape(affiliationLabel(p))}</div><p>${escape(p.topics.slice(0,3).map(topicName).join(' / ')||'テーマ未収録')}</p>`}`;}
  else {const r=view.edges.find(r=>r.id===el.id());tip.innerHTML=`<strong>${escape(personName(r.source))} — ${escape(personName(r.target))}</strong><div>${r.kind==='coauthor'?`${periodYears(r.years)} · 共著${r.count}件`:`${kindLabels[r.kind]} · ${relationshipPeriod(r)}`}</div><p>${r.kind==='coauthor'?escape(r.topics.slice(0,3).map(topicName).join(' / ')):escape(roleName(r.role??''))}</p>`;}
  tip.hidden=false;const pos=e.renderedPosition??el.renderedPosition?.()??{x:100,y:100};const stage=$('#map-stage');tip.style.left=Math.min(Math.max(8,pos.x+15),stage.clientWidth-tip.offsetWidth-10)+'px';tip.style.top=Math.min(Math.max(8,pos.y+15),stage.clientHeight-tip.offsetHeight-10)+'px';
}
function selectNode(id,center=true){
  if(!indexes.nodes.has(id))return;
  if(!view.visibleIds.has(id)){state.focusId=null;state.topics=[];state.from=data.metadata.minYear;state.to=data.metadata.maxYear;state.includeUnknown=true;state.mode='network';state.kinds=['coauthor','advisor','lab','project'];syncControls();updateView();}
  selected={type:'node',id};detailTab='overview';paperLimit=20;openDetail();syncGraphEdges();renderPeople();applyHighlight();renderDetail();
  $('#graph').dataset.focusReady=String(!center);
  if(center){requestAnimationFrame(()=>{cy.resize();const node=cy.getElementById(id);if(node.length){const neighborhood=node.closedNeighborhood();fitElements(neighborhood,85);cy.zoom(Math.min(cy.zoom(),1.4));cy.center(node);settleViewport();}$('#graph').dataset.focusReady='true';});}
  $('#workspace').classList.remove('sidebar-open');$('#tooltip').hidden=true;status(`${personName(id)}の詳細`);
}
function selectEdge(id){selected={type:'edge',id};paperLimit=20;openDetail();syncGraphEdges();applyHighlight();renderDetail();$('#tooltip').hidden=true;}
function openDetail(){if($('#detail-panel').hidden){lastFocusElement=document.activeElement;lastFocusPerson=lastFocusElement?.dataset?.person;}$('#detail-panel').hidden=false;$('#workspace').classList.add('has-detail');requestAnimationFrame(()=>$('#close-detail').focus({preventScroll:true}));}
function closeDetail(){selected=null;$('#detail-panel').hidden=true;$('#workspace').classList.remove('has-detail');if(cy){syncGraphEdges();applyHighlight();}if(lastFocusPerson)document.querySelector(`[data-person="${CSS.escape(lastFocusPerson)}"]`)?.focus({preventScroll:true});else if(lastFocusElement?.isConnected&&lastFocusElement!==document.body)lastFocusElement.focus({preventScroll:true});lastFocusElement=null;lastFocusPerson=null;}
function renderDetail(){
  if(!selected)return;
  const container=$('#detail-content');
  if(selected.type==='edge'){const edge=view.edges.find(r=>r.id===selected.id);if(!edge)return;$('#detail-type').textContent=kindLabels[edge.kind];const works=edge.workIds?.map(id=>indexes.works.get(id))??[];container.innerHTML=`<div class="relationship-names">${personButton(edge.source)}<span class="separator">${edge.kind==='advisor'?'↓ 指導教員 → 学生':kindLabels[edge.kind]}</span>${personButton(edge.target)}</div><div class="record-type">${edge.kind==='coauthor'?`${periodYears(edge.years)} · 共著${edge.count}件`:`${relationshipPeriod(edge)}${edge.degree?' · '+escape(edge.degree):''}${edge.role?' · '+escape(roleName(edge.role)):''}`}</div>${edge.kind==='coauthor'?`${topicTags(edge.topics)}<section class="detail-section"><h3>共著論文</h3>${paperListHTML(works)}</section>`:`${edge.kind==='project'?'<p class="section-note">表示年代は研究課題の期間です。参加者個人の在籍期間ではありません。</p>':''}<section class="detail-section"><h3>根拠資料</h3>${evidenceHTML(edge.evidence)}</section>`}`;return;}
  const p=indexes.nodes.get(selected.id);if(p.kind){renderAuxiliary(p);return;}
  $('#detail-type').textContent=p.seed?'研究者 · 起点':'研究者';
  const myWorks=view.works.filter(w=>w.authors.some(a=>a.id===p.id));
  const years=[...new Set(myWorks.map(w=>w.year).filter(Number.isFinite))].sort((a,b)=>a-b);
  const rels=view.edges.filter(e=>e.source===p.id||e.target===p.id);
  const japanese=p.aliases.filter(a=>/[\u3040-\u9fff]/.test(a));
  let body='';
  if(detailTab==='overview'){
    body=`<section class="detail-section"><h3>研究テーマ</h3>${p.topics.length?topicTags(p.topics):'<p>収録論文による分類なし</p>'}<p class="section-note">収録論文の題名・公開要旨から分類</p></section><section class="detail-section"><h3>論文に記録された所属</h3>${p.affiliations.length?p.affiliations.slice(0,8).map(a=>`<div class="affiliation"><span class="years">${a.years.join(', ')}</span>${escape(a.name)}<details><summary>根拠論文 ${a.workIds.length}件</summary>${a.workIds.slice(0,3).map(id=>{const w=indexes.works.get(id);return link(w.url,w.title,'source-link');}).join('<br>')}</details></div>`).join(''):'<p>所属情報未収録</p>'}<p class="section-note">掲載年時点の情報です。現在の所属とは区別しています。</p></section><section class="detail-section"><h3>記録・プロフィール</h3>${p.openalex?link(`https://openalex.org/${p.openalex}`,'OpenAlex','source-link')+'<br>':''}${p.orcid?link(p.orcid,'ORCID','source-link')+'<br>':''}${p.evidence.filter(e=>e.status!=='metadata-linked').slice(0,3).map(e=>link(e.url,e.title,'source-link')).join('<br>')}</section>`;
  }else if(detailTab==='papers')body=`<section class="detail-section"><h3>この条件の論文 ${number(myWorks.length)}件</h3>${myWorks.length?paperListHTML(myWorks):'<p>この条件に該当する収録論文はありません。</p>'}</section>`;
  else if(detailTab==='relations'){
    const groups=['advisor','lab','project','coauthor'];
    body=groups.map(kind=>{const items=rels.filter(e=>e.kind===kind).sort((a,b)=>(b.count??0)-(a.count??0));return items.length?`<section class="detail-section"><h3>${kindLabels[kind]} ${items.length}件</h3>${items.map(r=>{const other=r.source===p.id?r.target:r.source;const direction=kind==='advisor'?(r.target===p.id?'指導教員':'学生'):'';return `<button class="relation-row" data-edge="${escape(r.id)}"><span class="relation-main"><strong>${escape(personName(other))}</strong><small>${direction}${direction?' · ':''}${kind==='coauthor'?periodYears(r.years):relationshipPeriod(r)}${r.role?' · '+escape(roleName(r.role)):''}</small></span><span class="relation-count">${kind==='coauthor'?r.count+'件':'↗'}</span></button>`;}).join('')}</section>`:'';}).join('')||'<p class="detail-empty">現在の表示条件に該当する関係はありません。</p>';
    if(state.mode!=='lineage'&&!state.kinds.includes('advisor')&&data.relationships.some(r=>r.kind==='advisor'&&(r.source===p.id||r.target===p.id)))body=`<button class="button" data-show-lineage>指導関係</button>`+body;
  }else body=`<section class="detail-section"><h3>人物情報の出典</h3>${evidenceHTML(p.evidence)}</section><section class="detail-section"><h3>情報の確認状況</h3><p>${p.verificationStatus==='metadata-linked'?'共著論文とOpenAlexの著者IDに基づく人物レコードです。':p.verificationStatus==='official-record'?'公式の学位・所属・研究課題記録から追加しています。':'公式資料と論文の人物情報を照合しています。'}</p><p class="section-note">収録論文・分野・所属の誤りはチャットから訂正を依頼できます。</p></section>`;
  container.innerHTML=`<h2 class="detail-name">${escape(p.name)}</h2>${japanese.length?`<div class="detail-alias">${escape(japanese[0])}</div>`:''}<div class="detail-count"><span><strong>${number(myWorks.length)}</strong>論文</span><span>${periodYears(years)}</span></div><div class="detail-actions"><button class="button primary" data-focus="${escape(p.id)}">周辺の関係</button>${data.relationships.some(r=>r.kind==='advisor'&&(r.source===p.id||r.target===p.id))?'<button class="button" data-show-lineage>研究の系譜</button>':''}</div><nav class="detail-tabs" aria-label="詳細の種類">${[['overview','概要'],['papers','論文'],['relations','関係'],['sources','出典']].map(([id,label])=>`<button data-tab="${id}" class="${detailTab===id?'active':''}" aria-current="${detailTab===id?'page':'false'}">${label}</button>`).join('')}</nav>${body}`;
}
function renderAuxiliary(p){
  $('#detail-type').textContent=p.kind==='lab'?'研究室':'研究課題';
  const rels=view.relationships.filter(r=>r.source===p.id);
  $('#detail-content').innerHTML=`<h2 class="detail-name">${escape(p.name)}</h2>${p.kind==='project'?`<p class="record-type">課題期間 ${relationshipPeriod(p)}${p.funder?' · '+escape(p.funder):''}</p>`:''}<section class="detail-section">${link(p.url,'公式記録')}</section><section class="detail-section"><h3>${p.kind==='lab'?'在籍記録':'参加者'} ${rels.length}件</h3>${rels.map(r=>`<button class="relation-row" data-edge="${escape(r.id)}"><span class="relation-main"><strong>${escape(personName(r.target))}</strong><small>${escape(roleName(r.role))} · ${relationshipPeriod(r)}</small></span></button>`).join('')}</section>${p.kind==='project'?'<p class="section-note">課題期間と個人の参加期間は異なります。各参加者の根拠資料から役割を確認できます。</p>':''}<section class="detail-section"><h3>出典</h3>${evidenceHTML(p.evidence)}</section>`;
}
function syncControls(){for(const id of ['year-from','year-to'])$('#'+id).value=id==='year-from'?state.from:state.to;$('#include-unknown').checked=state.includeUnknown;for(const el of document.querySelectorAll('[name=topic]'))el.checked=state.topics.includes(el.value);for(const el of document.querySelectorAll('[name=relation]')){el.checked=state.mode==='lineage'&&el.value==='advisor'||state.kinds.includes(el.value);el.disabled=state.mode==='lineage'&&['advisor','coauthor'].includes(el.value);if(state.mode==='lineage'&&el.value==='coauthor')el.checked=false;}}
function resetFilters(){state={...state,from:data.metadata.minYear,to:data.metadata.maxYear,includeUnknown:true,topics:[],kinds:['coauthor'],focusId:null};$('#search').value='';syncControls();updateView({fit:true});}
function setMode(mode,focusSelected=false){const p=selected?.type==='node'?selected.id:null;state.mode=mode;state.focusId=null;cy.nodes().forEach(n=>{const person=indexes.nodes.get(n.id());n.position(mode==='lineage'?(person.lineagePosition??person.position):person.position);});syncControls();updateView({fit:true});if(focusSelected&&p&&view.visibleIds.has(p)){selected={type:'node',id:p};detailTab='relations';renderDetail();applyHighlight();const n=cy.getElementById(p);fitElements(n.closedNeighborhood(),100);cy.zoom(Math.min(cy.zoom(),1.3));cy.center(n);settleViewport();}}
function renderAbout(){const m=data.metadata;$('#about-content').innerHTML=`<table class="data-table"><tbody><tr><th>調査日</th><td>${m.snapshotDate}</td></tr><tr><th>研究者</th><td>${number(m.counts.researchers)}人</td></tr><tr><th>対象論文</th><td>${number(m.counts.works)}件</td></tr><tr><th>指導関係</th><td>${m.counts.advisorships}件</td></tr><tr><th>研究室 / 研究課題</th><td>${m.counts.labs} / ${m.counts.projects}件</td></tr></tbody></table><h3>対象範囲</h3><ul>${m.notes.map(n=>`<li>${escape(n)}</li>`).join('')}</ul><p>初版は固定データです。自動更新は行っていません。</p><h3>起点研究者</h3><div class="seed-list">${data.researchers.filter(p=>p.seed).map(p=>escape(p.name)).join(' / ')}</div><h3>データの取得と選定</h3><p>起点研究者の対象論文から、共著が2件以上ある研究者を起点ごとに順に選びました。選定した研究者の対象論文を追加取得し、公式記録による人物・関係を補っています。著者数が50人を超える論文は初版のネットワーク集計から除いています。</p><p>論文の全著者は保存していますが、マップ上の表示対象は収録した研究者です。原データが分割・混同した著者は、確認できた範囲で訂正しています。</p><p>Crossrefは起点研究者の論文など19件の書誌照合に使用しました。その他の論文メタデータはOpenAlexに基づきます。</p><h3>情報源</h3><p>${link('https://openalex.org/','OpenAlex')} · ${link('https://www.crossref.org/documentation/retrieve-metadata/rest-api/','Crossref')} · ${link('https://kaken.nii.ac.jp/','KAKEN')} · ${link('https://cordis.europa.eu/','CORDIS')}</p><p>個々の根拠は人物・論文・関係の詳細に表示します。年代不明は推定で埋めていません。指導関係を共著や同研究室への所属だけから推定していません。</p><h3>図の読み方</h3><p>円は研究者、四角は研究室、菱形は研究課題。色は収録論文で最も多いテーマです。点の大きさは研究者の評価を表しません。系譜の矢印は指導教員から学生に向かいます。</p><p>年代フィルターは論文の出版年、指導の記録年、研究室の確認できた在籍年、課題の実施期間に適用します。所属期間の「?」は不明を表します。</p>`;}
function attachEvents(){
  $('#clear-selection').onclick=()=>{closeDetail();renderPeople();};
  $('#edge-density').onchange=()=>{syncGraphEdges();applyHighlight();};
  document.addEventListener('toggle',e=>{if(e.target.matches('details[data-work]')&&e.target.open)loadPaperEvidence(e.target);},true);
  $('#search').addEventListener('keydown',e=>{if(['ArrowDown','Enter'].includes(e.key)){const first=$('#people-list button');if(first){e.preventDefault();if(e.key==='Enter')selectNode(first.dataset.person);else first.focus();}}});
  $('#people-list').addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();(e.key==='ArrowDown'?e.target.nextElementSibling:e.target.previousElementSibling)?.focus();}});
  $('#search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(renderPeople,80);});$('#clear-search').onclick=()=>{$('#search').value='';renderPeople();$('#search').focus();};
  $('#topic-filters').addEventListener('change',()=>{state.topics=[...document.querySelectorAll('[name=topic]:checked')].map(e=>e.value);updateView();});
  const changeYears=()=>{const from=Number($('#year-from').value),to=Number($('#year-to').value);if(!Number.isInteger(from)||!Number.isInteger(to)||from<data.metadata.minYear||to>data.metadata.maxYear||from>to){status('開始年と終了年を確認してください。');$('#year-from').setCustomValidity('開始年は収録範囲内で、終了年以下にしてください。');$('#year-from').reportValidity();return;}$('#year-from').setCustomValidity('');state.from=from;state.to=to;updateView();};
  let yearTimer;for(const id of ['year-from','year-to']){const input=$('#'+id);input.onchange=changeYears;input.oninput=()=>{clearTimeout(yearTimer);yearTimer=setTimeout(()=>{const from=Number($('#year-from').value),to=Number($('#year-to').value);if(Number.isInteger(from)&&Number.isInteger(to)&&from>=data.metadata.minYear&&to<=data.metadata.maxYear&&from<=to)changeYears();},120);};}$('#include-unknown').onchange=e=>{state.includeUnknown=e.target.checked;updateView();};
  document.querySelectorAll('[name=relation]').forEach(el=>el.onchange=()=>{state.kinds=[...document.querySelectorAll('[name=relation]:checked')].map(e=>e.value);updateView();});
  $('#network-mode').onclick=()=>setMode('network');$('#lineage-mode').onclick=()=>setMode('lineage');$('#reset-filters').onclick=resetFilters;$('#empty-reset').onclick=resetFilters;
  $('#zoom-in').onclick=()=>cy.zoom({level:Math.min(cy.zoom()*1.35,4),renderedPosition:{x:cy.width()/2,y:cy.height()/2}});$('#zoom-out').onclick=()=>cy.zoom({level:Math.max(cy.zoom()/1.35,.08),renderedPosition:{x:cy.width()/2,y:cy.height()/2}});$('#fit-map').onclick=()=>{fitElements(cy.elements());settleViewport();};
  $('#close-detail').onclick=()=>{const person=lastFocusPerson;closeDetail();renderPeople();if(person)document.querySelector(`[data-person="${CSS.escape(person)}"]`)?.focus({preventScroll:true});};$('#clear-focus').onclick=()=>{state.focusId=null;updateView({fit:true});};
  $('#open-sidebar').onclick=()=>{$('#workspace').classList.add('sidebar-open');$('#search').focus();};$('#close-sidebar').onclick=()=>{$('#workspace').classList.remove('sidebar-open');$('#open-sidebar').focus();};
  $('#about-button').onclick=()=>$('#about-dialog').showModal();$('#close-about').onclick=()=>$('#about-dialog').close();
  $('#tooltip').onmouseenter=()=>clearTimeout(tooltipTimer);$('#tooltip').onmouseleave=()=>$('#tooltip').hidden=true;
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#tooltip').hidden=true;$('#workspace').classList.remove('sidebar-open');}if(e.key==='/'&& !['INPUT','TEXTAREA'].includes(e.target.tagName)){e.preventDefault();$('#workspace').classList.add('sidebar-open');$('#search').focus();}});
  document.addEventListener('click',e=>{const btn=e.target.closest('[data-person],[data-edge],[data-tab],[data-focus],[data-show-lineage],[data-more]');if(!btn)return;if(btn.dataset.person)selectNode(btn.dataset.person);else if(btn.dataset.edge)selectEdge(btn.dataset.edge);else if(btn.dataset.tab){detailTab=btn.dataset.tab;paperLimit=20;renderDetail();$('#detail-content').querySelector(`[data-tab="${detailTab}"]`)?.focus({preventScroll:true});}else if(btn.dataset.focus){state.focusId=btn.dataset.focus;updateView({fit:true});}else if(btn.hasAttribute('data-show-lineage'))setMode('lineage',true);else if(btn.hasAttribute('data-more')){const top=$('#detail-content').scrollTop;paperLimit+=20;renderDetail();$('#detail-content').scrollTop=top;}});
}
async function start(){
  try{const res=await fetch('./data/dataset.json');if(!res.ok)throw Error('Dataset unavailable');data=await res.json();indexes=makeIndexes(data);loadPaper=createPaperLoader(indexes.works,async shard=>{const res=await fetch(`./data/works/${shard}.json`);if(!res.ok)throw Error('Paper details unavailable');return res.json();});state={from:data.metadata.minYear,to:data.metadata.maxYear,includeUnknown:true,topics:[],kinds:['coauthor'],mode:'network',focusId:null};renderFilters();renderAbout();await document.fonts.load('16px "Source Serif 4"').catch(()=>{});initGraph();attachEvents();updateView({fit:true});$('#loading').hidden=true;document.body.dataset.ready='true';}
  catch(error){$('#loading').innerHTML='<h2>データを読み込めませんでした</h2><p>ページを再読み込みしてください。</p><button class="button" id="reload">再読み込み</button>';$('#reload').onclick=()=>location.reload();console.error(error);}
}
start();
