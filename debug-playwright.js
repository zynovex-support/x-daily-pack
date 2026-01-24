const { chromium } = require('/tmp/playwright-temp/node_modules/playwright');
(async () => {
  const userDataDir = '/home/henry/.n8n-playwright-profile';
  const workflowId = 'qyLszOERxvjmoej5';
  const baseUrl = 'http://localhost:5678';
  const browser = await chromium.launchPersistentContext(userDataDir, { headless: true });
  const page = await browser.newPage();
  await page.goto(`${baseUrl}/workflow/${workflowId}`);
  await page.waitForLoadState('networkidle');
  console.log('URL', page.url(), 'Title', await page.title());
  await page.screenshot({ path: '/home/henry/x/debug-playwright.png', fullPage: true });
  await browser.close();
})();
