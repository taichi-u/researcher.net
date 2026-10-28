import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// Optional tooling: use an installed Playwright, or point to a bundled module.
const {chromium}=await import(process.env.RESEARCHER_QA_PLAYWRIGHT??'playwright');
const output=path.resolve(process.env.RESEARCHER_QA_OUTPUT??'.cache/browser-qa');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
  const detailRequests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>{if(req.url().includes('/data/works/'))detailRequests.push(req.url());});
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const response=await page.goto(process.env.RESEARCHER_QA_URL??'http://127.0.0.1:4173');
  assert.ok(response.ok(),`QA page returned ${response.status()}`);
  await page.waitForSelector('body[data-ready="true"]');
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>document.querySelector('#graph').dataset.viewportBusy!=='true');
  assert.equal(detailRequests.length,0,'paper evidence must not load on startup');
  const initial=await page.evaluate(()=>{const cy=document.querySelector('#graph')._cyreg.cy;return {updateMs:Number(document.querySelector('#map-counts').dataset.renderMs),nodes:cy.nodes().length,edges:cy.edges().length,catalogBytes:performance.getEntriesByType('resource').find(r=>r.name.endsWith('/data/dataset.json'))?.decodedBodySize};});
  assert.equal(await page.locator('#people-list .person-row').count(),100);
  await page.locator('[data-more-people]').click();
  assert.equal(await page.locator('#people-list .person-row').count(),200);
  await page.locator('#people-list').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:path.join(output,'overview.png')});
  const frames=await page.evaluate(async()=>{
    const cy=document.querySelector('#graph')._cyreg.cy,durations=[];let last=performance.now();
    for(let i=0;i<50;i++){
      cy.zoom({level:cy.zoom()*(i<25?1.012:1/1.012),renderedPosition:{x:cy.width()/2,y:cy.height()/2}});cy.panBy({x:i%2?2:-2,y:0});
      await new Promise(requestAnimationFrame);const now=performance.now();durations.push(now-last);last=now;
    }
    durations.sort((a,b)=>a-b);return {medianMs:durations[25],p95Ms:durations[47],maxMs:durations.at(-1)};
  });
  await page.waitForFunction(()=>document.querySelector('#graph').dataset.viewportBusy!=='true');
  await page.locator('#edge-density').selectOption('all');
  const allEdges=await page.evaluate(()=>document.querySelector('#graph')._cyreg.cy.edges().length);
  assert.ok(allEdges>initial.edges);
  await page.locator('#edge-density').selectOption('auto');
  // A label must be a real pointer target, including its area outside the node.
  const nameTarget=await page.evaluate(()=>{
    const cy=document.querySelector('#graph')._cyreg.cy,n=cy.nodes('[seed]').filter(n=>n.data('label')==='Kathleen C. Howell')[0];
    const box=n.renderedBoundingBox({includeNodes:false,includeLabels:true,includeOverlays:false});
    return {x:(box.x1+box.x2)/2,y:(box.y1+box.y2)/2,name:n.data('label')};
  });
  let graphBounds=await page.locator('#graph').boundingBox();
  await page.mouse.click(graphBounds.x+nameTarget.x,graphBounds.y+nameTarget.y);
  assert.equal(await page.locator('.detail-name').textContent(),nameTarget.name);
  await page.locator('#clear-selection').click();
  await page.getByRole('button',{name:'Daniel J. Scheeresの詳細',exact:true}).click();
  await page.waitForSelector('.detail-name');
  await page.waitForFunction(()=>document.querySelector('#graph').dataset.viewportBusy!=='true');
  const interaction=await page.evaluate(()=>{
    const cy=document.querySelector('#graph')._cyreg.cy;
    return {active:cy.edges('.edge-active').length,muted:cy.edges('.dimmed').length,
      mutedClickable:cy.edges('.dimmed').filter(e=>e.style('events')!=='no').length,
      activeClickable:cy.edges('.edge-active').every(e=>e.style('events')==='yes'),
      nameClicks:cy.nodes('.active').every(n=>n.style('text-events')==='yes')};
  });
  assert.ok(interaction.active>0);assert.ok(interaction.muted>0);
  assert.equal(interaction.mutedClickable,0);assert.ok(interaction.activeClickable);assert.ok(interaction.nameClicks);
  // Click an actual muted line, away from active lines, labels and nodes.
  const mutedPoint=await page.evaluate(()=>{
    const cy=document.querySelector('#graph')._cyreg.cy;
    const distance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);};
    const active=cy.edges('.edge-active').map(e=>[e.source().renderedPosition(),e.target().renderedPosition()]);
    const boxes=cy.nodes().map(n=>n.renderedBoundingBox({includeLabels:true,includeOverlays:false}));
    for(const e of cy.edges('.dimmed')){
      const a=e.source().renderedPosition(),b=e.target().renderedPosition(),p={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
      if(p.x<20||p.x>cy.width()-80||p.y<70||p.y>cy.height()-70)continue;
      if(boxes.some(b=>p.x>=b.x1-8&&p.x<=b.x2+8&&p.y>=b.y1-8&&p.y<=b.y2+8))continue;
      if(active.some(([a,b])=>distance(p,a,b)<12))continue;
      return p;
    }
  });
  assert.ok(mutedPoint,'an isolated muted-line target is available');
  graphBounds=await page.locator('#graph').boundingBox();
  await page.mouse.click(graphBounds.x+mutedPoint.x,graphBounds.y+mutedPoint.y);
  assert.equal(await page.locator('.detail-name').textContent(),'Daniel J. Scheeres');
  const bounds=await page.locator('#graph').boundingBox();
  await page.mouse.click(bounds.x+8,bounds.y+8);
  assert.equal(await page.locator('.detail-name').textContent(),'Daniel J. Scheeres');
  await page.screenshot({path:path.join(output,'selection.png')});
  const activePoint=await page.evaluate(()=>{
    const cy=document.querySelector('#graph')._cyreg.cy;
    const boxes=cy.nodes().map(n=>n.renderedBoundingBox({includeLabels:true,includeOverlays:false}));
    for(const edge of cy.edges('.edge-active')){
      const a=edge.source().renderedPosition(),b=edge.target().renderedPosition();
      for(const t of [.5,.65,.35]){const p={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};
        if(p.x<20||p.x>cy.width()-80||p.y<70||p.y>cy.height()-70)continue;
        if(boxes.some(b=>p.x>=b.x1-8&&p.x<=b.x2+8&&p.y>=b.y1-8&&p.y<=b.y2+8))continue;
        return p;
      }
    }
  });
  assert.ok(activePoint);await page.mouse.click(bounds.x+activePoint.x,bounds.y+activePoint.y);
  assert.equal(await page.locator('#detail-type').textContent(),'共著');
  assert.equal(await page.evaluate(()=>document.querySelector('#graph')._cyreg.cy.edges('.selected-edge').length),1);
  await page.getByRole('button',{name:'Daniel J. Scheeresの詳細',exact:true}).click();
  await page.locator('[data-tab="papers"]').click();
  assert.equal(detailRequests.length,0,'paper list uses catalog until evidence is expanded');
  await page.locator('.paper details summary').first().click();
  await page.waitForFunction(()=>document.querySelector('.paper-evidence ul'));
  assert.equal(detailRequests.length,1);
  await page.locator('.paper details summary').first().click();await page.locator('.paper details summary').first().click();
  assert.equal(detailRequests.length,1,'reopening evidence uses the cached shard');
  await page.getByRole('button',{name:'詳細を閉じる',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.querySelector('#graph')._cyreg.cy.edges().filter(e=>e.style('events')==='no').length),0);
  await page.locator('#lineage-mode').click();
  assert.equal(await page.locator('#lineage-mode').getAttribute('aria-pressed'),'true');
  assert.ok(await page.evaluate(()=>document.querySelector('#graph')._cyreg.cy.edges().length>0));
  await page.screenshot({path:path.join(output,'lineage.png')});
  await page.locator('#network-mode').click();
  await page.locator('.filter-section').nth(0).locator('summary').click();
  await page.locator('[name=topic][value=lowthrust]').check();
  await page.locator('.filter-section').nth(1).locator('summary').click();
  await page.locator('#year-from').fill('2020');await page.locator('#year-from').press('Tab');
  await page.waitForFunction(()=>document.querySelector('#period-summary').textContent==='2020–2026');
  const filtered=await page.locator('#map-counts').innerText();
  await page.locator('#search').fill('zzzz-no-matching-author');
  await page.waitForFunction(()=>document.querySelector('#result-count').textContent==='0');
  await page.locator('#clear-search').click();
  await page.locator('#reset-filters').click();
  const beyond=await page.evaluate(()=>document.querySelector('#graph')._cyreg.cy.nodes().map(n=>n.data('label')).sort().at(-1));
  await page.locator('#search').fill(beyond);
  await page.waitForFunction(name=>[...document.querySelectorAll('#people-list .person-row strong')].some(el=>el.textContent===name),beyond);
  await page.locator('#search').fill('Henri Poincare');
  await page.waitForFunction(()=>document.querySelector('#people-list .person-row strong')?.textContent.includes('Poincar'));
  await page.locator('#search').press('Enter');
  await page.locator('[data-tab="papers"]').click();
  assert.ok((await page.locator('#detail-content').innerText()).includes('1892'));
  await page.locator('.paper details summary').first().click();
  await page.waitForSelector('.paper-evidence a:text("原典・所蔵機関の書誌")');
  const historical=await page.locator('.detail-name').textContent();
  assert.ok(await page.evaluate(()=>{const cy=document.querySelector('#graph')._cyreg.cy;cy.center(cy.nodes().filter(n=>n.data('label')==='Daniel J. Scheeres'));return document.querySelector('#graph').dataset.viewportBusy==='true';}));
  await page.waitForFunction(()=>document.querySelector('#graph').dataset.viewportBusy==='false');
  const viewportPan=await page.evaluate(()=>{const cy=document.querySelector('#graph')._cyreg.cy;return {edges:cy.edges().length,centeredRelations:cy.nodes().filter(n=>n.data('label')==='Daniel J. Scheeres').connectedEdges().length};});
  assert.ok(viewportPan.centeredRelations>0);assert.ok(viewportPan.edges<allEdges);
  await page.locator('#close-detail').click();
  await page.locator('#reset-filters').click();
  await page.locator('[name=topic][value=navigation]').check();
  await page.locator('#year-from').fill('1892');await page.locator('#year-from').press('Tab');
  await page.locator('#year-to').fill('1976');await page.locator('#year-to').press('Tab');
  await page.waitForFunction(()=>document.querySelector('#period-summary').textContent==='1892–1976');
  const historicalFiltered=await page.locator('#map-counts').innerText();
  assert.ok(await page.locator('#people-list .person-row').count()>0);
  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  mobile.on('pageerror',e=>errors.push(e.message));
  await mobile.goto(process.env.RESEARCHER_QA_URL??'http://127.0.0.1:4173');
  await mobile.waitForSelector('body[data-ready="true"]');
  assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await mobile.screenshot({path:path.join(output,'mobile-overview.png')});
  await mobile.locator('#open-sidebar').tap();
  await mobile.locator('#search').fill('尾崎直哉');
  await mobile.waitForFunction(()=>document.querySelectorAll('#people-list button').length>0&&document.querySelectorAll('#people-list button').length<10);
  await mobile.locator('#search').press('Enter');
  await mobile.waitForSelector('.detail-name');
  await mobile.waitForFunction(()=>document.querySelector('#graph').dataset.focusReady==='true'&&document.querySelector('#graph').dataset.viewportBusy==='false');
  await mobile.screenshot({path:path.join(output,'mobile-selection.png')});
  assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const mapBounds=await mobile.locator('#graph').boundingBox();
  assert.ok(mapBounds.height>100,'map remains usable above the detail panel');
  await mobile.locator('#close-detail').tap();
  const mobileResult={width:390,height:844,mapHeightWithDetail:mapBounds.height,overflow:false};
  await mobile.close();
  assert.deepEqual(errors,[]);
  const report={environment:'Chrome; 1440×900; DPR 2; CDP CPU throttle 4×',browserVersion:browser.version(),node:process.version,initial,frames,allEdges,interaction,detailRequests:detailRequests.length,filtered,historical,historicalFiltered,viewportPan,pagination:{initial:100,expanded:200,offPageSearch:beyond},mobile:mobileResult,errors};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}catch(error){
  console.error('Browser errors:',errors);
  for(const [i,page]of browser.contexts().flatMap(c=>c.pages()).entries()){
    console.error('Page:',page.url(),await page.locator('body').innerText().then(s=>s.slice(0,300)).catch(()=>''));
    await page.screenshot({path:path.join(output,`failure-${i}.png`)}).catch(()=>{});
  }
  throw error;
}finally{await browser.close();}
