const { chromium } = require('/tmp/playwright-temp/node_modules/playwright');

(async () => {
  const userDataDir = '/home/henry/.n8n-playwright-profile';
  const workflowId = 'qyLszOERxvjmoej5';
  const baseUrl = 'http://localhost:5678';

  const browser = await chromium.launchPersistentContext(userDataDir, { headless: true });
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/workflow/${workflowId}`);
  await page.waitForLoadState('networkidle');

  const fetchExecutions = async () => {
    return await page.evaluate(async (id) => {
      const res = await fetch(`/rest/executions?workflowId=${id}&limit=1&includeData=true`);
      if (!res.ok) throw new Error('exec fetch failed ' + res.status);
      return await res.json();
    }, workflowId);
  };

  const before = await fetchExecutions().catch(() => null);

  const execButton = await page.$('text=Execute workflow');
  if (!execButton) {
    throw new Error('Execute workflow button not found');
  }
  await execButton.click();

  // Wait for execution to appear / finish
  let execution;
  const start = Date.now();
  while (Date.now() - start < 30000) {
    const data = await fetchExecutions().catch(() => null);
    if (data && data.data && data.data.length) {
      execution = data.data[0];
      if (!before || execution.id !== before.data?.[0]?.id || execution.finished) break;
    }
    await page.waitForTimeout(1000);
  }

  console.log(JSON.stringify({ before, execution }, null, 2));
  await browser.close();
})();
