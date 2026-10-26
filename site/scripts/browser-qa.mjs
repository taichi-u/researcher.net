import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// Optional tooling: use an installed Playwright, or point to a bundled module.
const {chromium}=await import(process.env.RESEARCHER_QA_PLAYWRIGHT??'playwright');
const output=path.resolve(process.env.RESEARCHER_QA_OUTPUT??'.cache/browser-qa');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
  const errors=[],detailRequests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',req=>{if(req.url().includes('/data/works/'))detailRequests.push(req.url());});
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.goto(process.env.RESEARCHER_QA_URL??'http://127.0.0.1:4173');
  await page.waitForSelector('body[data-ready="true"]');
  await page.waitForFunction(()=>document.querySelector('#graph').dataset.viewportBusy!=='true');
  assert.equal(detailRequests.length,0,'paper evidence must not load on startup');
  const initial=await page.evaluate(()=>{const cy=document.querySelector('#graph')._cyreg.cy;return {updateMs:Number(document.querySelector('#map-counts').dataset.renderMs),nodes:cy.nodes().length,edges:cy.edges().length,catalogBytes:performance.getEntriesByType('resource').find(r=>r.name.endsWith('/data/dataset.json'))?.decodedBodySize};});
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
  const bounds=await page.locator('#graph').boundingBox();
  await page.mouse.click(bounds.x+8,bounds.y+8);
  assert.equal(await page.locator('.detail-name').textContent(),'Daniel J. Scheeres');
  await page.screenshot({path:path.join(output,'selection.png')});
  await page.locator('[data-tab="papers"]').click();
  assert.equal(detailRequests.length,0,'paper list uses catalog until evidence is expanded');
  await page.locator('.paper details summary').first().click();
  await page.waitForFunction(()=>document.querySelector('.paper-evidence ul'));
  assert.equal(detailRequests.length,1);
  await page.locator('.paper details summary').first().click();await page.locator('.paper details summary').first().click();
  assert.equal(detailRequests.length,1,'reopening evidence uses the cached shard');
  await page.getByRole('button',{name:'詳細を閉じる',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.querySelector('#graph')._cyreg.cy.edges().filter(e=>e.style('events')==='no').length),0);
  assert.deepEqual(errors,[]);
  const report={environment:'Chrome; 1440×900; DPR 2; CDP CPU throttle 4×',initial,frames,allEdges,interaction,detailRequests:detailRequests.length,errors};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
