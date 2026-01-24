const { chromium } = require('/tmp/playwright-temp/node_modules/playwright');

(async () => {
  const userDataDir = '/home/henry/.n8n-playwright-profile-manual';
  const baseUrl = 'http://localhost:5678';

  console.log('Opening browser for manual login...');
  console.log('Please login in the browser window.');
  console.log('After login, come back and tell me to continue.');

  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 100
  });

  const page = await browser.newPage();
  await page.goto(baseUrl);

  console.log('Browser is open at:', baseUrl);
  console.log('Waiting for you to login... (will wait up to 10 minutes)');

  // Wait up to 10 minutes for user to login
  await new Promise(resolve => setTimeout(resolve, 600000));

  await browser.close();
  console.log('Browser closed');
})();
