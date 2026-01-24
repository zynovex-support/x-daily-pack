const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const N8N_URL = 'http://localhost:5678';
const EMAIL = process.env.N8N_UI_EMAIL || 'info@zynovexllc.com';
const PASSWORD = process.env.N8N_UI_PASSWORD || 'admin123';
const WORKFLOW_NAME = 'X Daily Pack v5';

// 日志文件（不用截图）
const LOG_FILE = path.join(__dirname, '../logs/tests/ui-test.log');

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

(async () => {
  // 清空日志
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.writeFileSync(LOG_FILE, '');

  log('启动浏览器...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    // 1. 访问 n8n
    log('访问 n8n...');
    await page.goto(N8N_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    log(`当前 URL: ${page.url()}`);

    // 2. 登录（如果需要）
    if (page.url().includes('signin')) {
      log('检测到登录页面，开始登录...');
      await page.waitForSelector('input', { timeout: 30000 });

      const emailInput = await page.locator('input[type="email"], input[name="email"], input[autocomplete="email"]').first();
      const passwordInput = await page.locator('input[type="password"]').first();

      await emailInput.fill(EMAIL);
      await passwordInput.fill(PASSWORD);
      log('已填写登录表单');

      const btn = await page.locator('button[type="submit"], button:has-text("Sign in")').first();
      await btn.click();
      await page.waitForTimeout(5000);
      log(`登录后 URL: ${page.url()}`);
    }

    // 3. 查找并打开 workflow
    log(`查找 workflow: ${WORKFLOW_NAME}...`);
    await page.waitForTimeout(2000);

    const workflowLink = await page.locator(`text=${WORKFLOW_NAME}`).first();
    if (await workflowLink.isVisible()) {
      await workflowLink.click();
      await page.waitForTimeout(3000);
      log('已打开 workflow');
    } else {
      throw new Error(`未找到 workflow: ${WORKFLOW_NAME}`);
    }

    // 4. 执行 workflow
    log('执行 workflow...');
    const executeBtn = await page.locator('[data-test-id^="execute-workflow-button"]').first();
    await executeBtn.click({ force: true });
    log('已点击执行按钮');

    // 5. 等待执行完成（轮询检查）
    log('等待执行完成...');
    const startTime = Date.now();
    const maxWait = 180000; // 3分钟

    while (Date.now() - startTime < maxWait) {
      await page.waitForTimeout(10000); // 每10秒检查一次
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      log(`已等待 ${elapsed}s...`);

      // 检查是否有成功/失败提示
      const successIndicator = await page.locator('[class*="success"], [data-test-id*="success"]').first();
      const errorIndicator = await page.locator('[class*="error"], [data-test-id*="error"]').first();

      if (await successIndicator.isVisible().catch(() => false)) {
        log('检测到成功指示器');
        break;
      }
      if (await errorIndicator.isVisible().catch(() => false)) {
        log('检测到错误指示器');
        break;
      }
    }

    log('UI 测试完成');
    console.log('\n=== 测试结果 ===');
    console.log('状态: 成功触发执行');
    console.log(`日志: ${LOG_FILE}`);

  } catch (error) {
    log(`错误: ${error.message}`);
    console.error('\n=== 测试失败 ===');
    console.error(error.message);
    process.exit(1);
  } finally {
    await browser.close();
    log('浏览器已关闭');
  }
})();
