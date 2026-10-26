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
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  await page.goto(process.env.RESEARCHER_QA_URL??'http://127.0.0.1:4173');
  await page.waitForSelector('body[data-ready="true"]');
  await page.getByRole('button',{name:'Daniel J. Scheeresの詳細',exact:true}).click();
  await page.waitForSelector('.detail-name');
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
  await page.getByRole('button',{name:'詳細を閉じる',exact:true}).click();
  assert.equal(await page.evaluate(()=>document.querySelector('#graph')._cyreg.cy.edges().filter(e=>e.style('events')==='no').length),0);
  assert.deepEqual(errors,[]);
  const report={environment:'Chrome; 1440×900; DPR 2; CDP CPU throttle 4×',interaction,errors};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
