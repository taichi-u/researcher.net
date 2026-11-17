import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const {chromium}=await import(process.env.RESEARCHER_QA_PLAYWRIGHT??'playwright');
const output=path.resolve(process.env.RESEARCHER_QA_OUTPUT??'.cache/exploration-qa');
await fs.mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.RESEARCHER_QA_URL??'http://127.0.0.1:4173');
  await page.waitForSelector('body[data-ready="true"]');
  const total=await page.locator('#result-count').textContent();
  assert.equal(await page.locator('#active-conditions').isVisible(),false);
  await page.locator('.filter-section summary').nth(0).click();
  await page.locator('[name=topic][value=lowthrust]').check();
  await page.locator('.filter-section summary').nth(1).click();
  await page.locator('#year-from').fill('2020');
  await page.locator('#year-from').press('Tab');
  await page.locator('#include-unknown').uncheck();
  assert.equal(await page.locator('.filter-chip').count(),3);
  await page.locator('.filter-section summary').nth(0).click();
  await page.locator('.filter-section summary').nth(1).click();
  await page.screenshot({path:path.join(output,'conditions.png')});
  await page.locator('[data-remove-condition=period]').click();
  assert.equal(await page.locator('[name=topic][value=lowthrust]').isChecked(),true);
  assert.equal(await page.locator('#include-unknown').isChecked(),false);
  await page.locator('[data-remove-condition="topic:lowthrust"]').click();
  assert.equal(await page.locator('#include-unknown').isChecked(),false);
  await page.locator('[data-remove-condition=unknown]').click();
  assert.equal(await page.locator('#result-count').textContent(),total);
  assert.equal(await page.locator('#active-conditions').isVisible(),false);
  assert.equal(await page.locator('#search').evaluate(el=>el===document.activeElement),true);

  await page.locator('.filter-section summary').nth(2).click();
  await page.locator('[name=relation][value=coauthor]').uncheck();
  await page.locator('[name=relation][value=advisor]').check();
  await page.locator('[data-remove-condition=kinds]').click();
  assert.equal(await page.locator('[name=relation][value=coauthor]').isChecked(),true);
  assert.equal(await page.locator('[name=relation][value=advisor]').isChecked(),false);

  await page.locator('.filter-section summary').nth(1).click();
  await page.locator('#year-to').fill('1900');
  await page.locator('#year-to').press('Tab');
  await page.locator('#include-unknown').uncheck();
  await page.locator('#search').fill('Daniel J. Scheeres');
  await page.waitForFunction(()=>document.querySelector('#result-count').textContent==='0');
  await page.locator('[data-search-all]').click();
  assert.equal(await page.locator('#search').inputValue(),'Daniel J. Scheeres');
  assert.equal(await page.locator('#result-count').textContent(),'1');
  assert.equal(await page.locator('[data-remove-condition=period]').count(),0);

  // Enter must use the latest input even before the 80 ms search debounce fires.
  await page.locator('#search').fill('尾崎直哉');
  await page.locator('#search').press('Enter');
  await page.waitForSelector('.detail-name');
  assert.equal(await page.locator('.detail-name').textContent(),'Naoya Ozaki');
  await page.locator('#close-detail').click();
  await page.locator('#search').dispatchEvent('keydown',{key:'Enter',isComposing:true});
  assert.equal(await page.locator('#detail-panel').isVisible(),false);
  await page.locator('#reset-filters').click();
  assert.equal(await page.locator('#result-count').textContent(),total);
  await page.locator('#map-legend summary').click();
  await page.locator('[data-legend-topic=lowthrust]').click();
  assert.equal(await page.locator('[name=topic][value=lowthrust]').isChecked(),true);
  assert.equal(await page.locator('[data-legend-topic=lowthrust]').getAttribute('aria-pressed'),'true');
  assert.ok(Number((await page.locator('#result-count').textContent()).replaceAll(',',''))<Number(total.replaceAll(',','')));
  await page.locator('[data-remove-condition="topic:lowthrust"]').click();
  assert.equal(await page.locator('[data-legend-topic=lowthrust]').getAttribute('aria-pressed'),'false');
  assert.equal(await page.locator('#result-count').textContent(),total);
  await page.screenshot({path:path.join(output,'legend.png')});
  await page.locator('#map-legend summary').click();
  await page.screenshot({path:path.join(output,'overview.png')});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({total,conditions:'individual removal preserves other conditions',emptySearch:'query preserved',quickEnter:'latest query',composition:'no premature selection',errors},null,2));
}catch(error){
  for(const [index,page]of browser.contexts().flatMap(context=>context.pages()).entries()){
    console.error('Current page:',await page.locator('#people-list').innerText().catch(()=>''));
    await page.screenshot({path:path.join(output,`failure-${index}.png`)}).catch(()=>{});
  }
  throw error;
}finally{await browser.close();}
