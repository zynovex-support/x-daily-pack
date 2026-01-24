const { chromium } = require('/tmp/playwright-temp/node_modules/playwright');
const fs = require('fs');

(async () => {
  const baseUrl = 'http://localhost:5678';
  const email = 'info@zynovexllc.com';
  const password = 'admin123';

  console.log('[' + new Date().toISOString() + '] Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate and login
    console.log('[' + new Date().toISOString() + '] Navigating to n8n...');
    await page.goto(baseUrl);
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/signin')) {
      console.log('[' + new Date().toISOString() + '] Logging in...');
      await page.fill('input[type="email"]', email);
      await page.fill('input[type="password"]', password);
      await page.click('button:has-text("Sign in")');
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
    }

    console.log('[' + new Date().toISOString() + '] Logged in, URL:', page.url());

    // Click on "X Daily Pack - Complete with X Integration" workflow
    console.log('[' + new Date().toISOString() + '] Opening workflow...');
    await page.click('text=X Daily Pack - Complete with X Integration');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await page.screenshot({ path: '/home/henry/x/n8n-workflow-open.png', fullPage: true });
    console.log('[' + new Date().toISOString() + '] Screenshot: n8n-workflow-open.png');

    // Get workflow ID from URL
    const workflowUrl = page.url();
    const workflowId = workflowUrl.match(/workflow\/([^/]+)/)?.[1];
    console.log('[' + new Date().toISOString() + '] Workflow URL:', workflowUrl);
    console.log('[' + new Date().toISOString() + '] Workflow ID:', workflowId);

    // Look for execute/test button and click it
    console.log('\n[' + new Date().toISOString() + '] ========== EXECUTING WORKFLOW ==========');

    // Try to find and click the test/execute button
    const executeButton = await page.$('button:has-text("Test workflow"), button:has-text("Execute"), [data-test-id="execute-workflow-button"], button[title*="Execute"], button[title*="Test"]');

    if (executeButton) {
      console.log('[' + new Date().toISOString() + '] Found execute button, clicking...');
      await executeButton.click();
    } else {
      // Try keyboard shortcut
      console.log('[' + new Date().toISOString() + '] No button found, trying keyboard shortcut...');
      await page.keyboard.press('F5');
    }

    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/home/henry/x/n8n-executing.png', fullPage: true });

    // Wait for execution to complete by watching the UI
    console.log('[' + new Date().toISOString() + '] Waiting for execution...');

    const startTime = Date.now();
    const timeout = 180000; // 3 minutes

    while (Date.now() - startTime < timeout) {
      await page.waitForTimeout(3000);

      // Check for execution status in the UI
      const pageContent = await page.content();

      // Look for success/error indicators
      if (pageContent.includes('Execution finished') || pageContent.includes('finished successfully')) {
        console.log('[' + new Date().toISOString() + '] Execution finished (success indicator found)');
        break;
      }

      if (pageContent.includes('Problem in node') || pageContent.includes('execution failed')) {
        console.log('[' + new Date().toISOString() + '] Execution failed (error indicator found)');
        break;
      }

      // Check execution status via page context (internal fetch with cookies)
      const execStatus = await page.evaluate(async () => {
        try {
          const res = await fetch('/rest/executions?limit=1');
          if (!res.ok) return { fetchError: res.status };
          const data = await res.json();
          if (data.data && data.data.length > 0) {
            const latest = data.data[0];
            return {
              id: latest.id,
              status: latest.status,
              finished: latest.finished,
              workflowName: latest.workflowData?.name
            };
          }
          return { noData: true };
        } catch (e) {
          return { error: e.message };
        }
      });

      if (execStatus.fetchError) {
        console.log('[' + new Date().toISOString() + '] API still returning', execStatus.fetchError, '- waiting...');
      } else if (execStatus.finished) {
        console.log('[' + new Date().toISOString() + '] Execution finished:', execStatus.id, execStatus.status);
        break;
      } else if (execStatus.id) {
        console.log('[' + new Date().toISOString() + '] Running...', execStatus.id, execStatus.status);
      }
    }

    await page.screenshot({ path: '/home/henry/x/n8n-after-execution.png', fullPage: true });
    console.log('[' + new Date().toISOString() + '] Screenshot: n8n-after-execution.png');

    // Try to get execution details
    console.log('\n[' + new Date().toISOString() + '] ========== GETTING RESULTS ==========');

    // Click on Executions tab in the UI
    const executionsTab = await page.$('text=Executions');
    if (executionsTab) {
      console.log('[' + new Date().toISOString() + '] Opening Executions panel...');
      await executionsTab.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/home/henry/x/n8n-executions-panel.png', fullPage: true });
    }

    // Navigate to executions page for full details
    console.log('[' + new Date().toISOString() + '] Navigating to executions page...');
    await page.goto(`${baseUrl}/executions`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: '/home/henry/x/n8n-executions-list.png', fullPage: true });
    console.log('[' + new Date().toISOString() + '] Screenshot: n8n-executions-list.png');

    // Try to click on the most recent execution to see details
    const firstExecution = await page.$('tr[class*="execution"], [data-test-id="execution-list-item"]:first-child, .execution-card:first-child');
    if (firstExecution) {
      await firstExecution.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: '/home/henry/x/n8n-execution-detail.png', fullPage: true });
      console.log('[' + new Date().toISOString() + '] Screenshot: n8n-execution-detail.png');
    }

    console.log('\n[' + new Date().toISOString() + '] Test completed. Check screenshots for results.');

  } catch (error) {
    console.error('[' + new Date().toISOString() + '] Error:', error.message);
    await page.screenshot({ path: '/home/henry/x/n8n-error.png', fullPage: true });
  } finally {
    await browser.close();
    console.log('[' + new Date().toISOString() + '] Done');
  }
})();
