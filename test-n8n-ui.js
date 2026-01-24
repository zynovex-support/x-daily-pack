const { chromium } = require('/tmp/playwright-temp/node_modules/playwright');

(async () => {
  const userDataDir = '/home/henry/.n8n-playwright-profile';
  const baseUrl = 'http://localhost:5678';

  console.log('Launching browser...');
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    slowMo: 500
  });

  const page = await browser.newPage();

  console.log('Navigating to n8n...');
  await page.goto(baseUrl);
  await page.waitForLoadState('networkidle');

  // Take screenshot
  await page.screenshot({ path: '/home/henry/x/n8n-test-screenshot.png', fullPage: true });
  console.log('Screenshot saved to n8n-test-screenshot.png');

  // Check current URL to see if we're logged in or at login page
  const currentUrl = page.url();
  console.log('Current URL:', currentUrl);

  // Wait for user to interact if needed
  console.log('Browser is open. Press Ctrl+C to close when done.');

  // Keep browser open for manual interaction
  await new Promise(resolve => setTimeout(resolve, 300000)); // 5 minutes

  await browser.close();
})();
