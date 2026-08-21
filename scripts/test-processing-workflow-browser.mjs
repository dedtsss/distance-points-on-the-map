import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'vite';

const server = await createServer({ logLevel:'error', server:{host:'127.0.0.1',port:0} });
await server.listen();
const baseUrl=server.resolvedUrls.local[0];
const browser=await chromium.launch({headless:true});
const open=async(scenario)=>{const page=await browser.newPage({viewport:{width:1280,height:900}});await page.goto(`${baseUrl}scripts/processing-workflow-harness.html?scenario=${scenario}`,{waitUntil:'networkidle'});await page.locator('.processing-workflow').waitFor();return page;};
const stepItem=(page,label)=>page.locator('.processing-stepper .ant-steps-item').filter({hasText:label}).first();

try {
  // Component regression: threshold invalidation already marked Map/downstream stale while historical uploads remain done.
  // The component must not resurrect Upload/Result from old readiness data.
  let page=await open('threshold-stale');
  assert.equal(await page.locator('.processing-workflow').getAttribute('data-processing-step'),'map');
  assert.match(await stepItem(page,'Карта и точки').textContent(),/обновить/);
  assert.match(await stepItem(page,'Очистка и загрузка').textContent(),/обновить/);
  assert.match(await stepItem(page,'Результат').textContent(),/обновить/);
  assert.match(await stepItem(page,'Очистка и загрузка').getAttribute('class'),/ant-steps-item-disabled/);
  assert.match(await stepItem(page,'Результат').getAttribute('class'),/ant-steps-item-disabled/);
  const thresholdState=await page.evaluate(()=>window.__workflowHarness.latest);
  assert.deepEqual(thresholdState.completed,['photos','recognition']);
  assert.deepEqual(thresholdState.stale,['map','upload','result']);
  await page.close();

  // Component regression: failed recognition rerun with historical upload links cannot resurrect stale downstream.
  page=await open('recognition-failure');
  await page.getByRole('button',{name:'Повторить распознавание'}).click();
  await page.waitForFunction(()=>window.__workflowHarness.latest?.stale?.includes('recognition'));
  const failedState=await page.evaluate(()=>window.__workflowHarness.latest);
  assert.deepEqual(failedState.completed,['photos']);
  assert.deepEqual(failedState.stale,['recognition','map','upload','result']);
  assert.match(await stepItem(page,'Очистка и загрузка').getAttribute('class'),/ant-steps-item-disabled/);
  assert.match(await stepItem(page,'Результат').getAttribute('class'),/ant-steps-item-disabled/);
  await page.close();

  // Component regression: refreshed Result save explicitly completes Result and clears stale before persistence.
  page=await open('result-save');
  assert.ok(await page.locator('.processing-stale').isVisible());
  await page.getByRole('button',{name:'Сохранить сессию'}).click();
  await page.waitForFunction(()=>window.__workflowHarness.saved?.completed?.includes('result'));
  const saved=await page.evaluate(()=>window.__workflowHarness.saved);
  assert.deepEqual(saved.completed,['photos','recognition','map','upload','result']);
  assert.deepEqual(saved.stale,[]);
  assert.equal(saved.current,'result');
  await page.waitForFunction(()=>!document.querySelector('.processing-stale'));
  await page.close();
} finally {
  await browser.close();
  await server.close();
}
console.log('Processing workflow component/browser lifecycle regressions passed.');
