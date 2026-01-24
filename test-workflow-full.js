const { chromium } = require('/tmp/playwright-temp/node_modules/playwright');

(async () => {
  const userDataDir = '/home/henry/.n8n-playwright-profile-test';
  const baseUrl = 'http://localhost:5678';
  const email = 'info@zynovexllc.com';
  const password = 'Chang_1215#$56';

  console.log('[' + new Date().toISOString() + '] Launching browser...');
  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    slowMo: 200
  });

  const page = await browser.newPage();

  try {
    // Navigate to n8n
    console.log('[' + new Date().toISOString() + '] Navigating to n8n...');
    await page.goto(baseUrl);
    await page.waitForLoadState('networkidle');

    const currentUrl = page.url();
    console.log('[' + new Date().toISOString() + '] Current URL:', currentUrl);

    // Check if we need to login
    if (currentUrl.includes('/signin')) {
      console.log('[' + new Date().toISOString() + '] Login required, filling credentials...');

      // Fill login form
      await page.fill('input[type="email"], input[name="email"], input[placeholder*="email" i]', email);
      await page.fill('input[type="password"], input[name="password"]', password);

      // Click sign in button
      await page.click('button:has-text("Sign in")');

      // Wait for navigation
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      console.log('[' + new Date().toISOString() + '] After login URL:', page.url());
    }

    // Take screenshot after login
    await page.screenshot({ path: '/home/henry/x/n8n-after-login.png', fullPage: true });
    console.log('[' + new Date().toISOString() + '] Screenshot saved: n8n-after-login.png');

    // Get list of workflows via API (now authenticated via cookie)
    console.log('[' + new Date().toISOString() + '] Fetching workflows...');
    const workflows = await page.evaluate(async () => {
      const res = await fetch('/rest/workflows');
      if (!res.ok) throw new Error('Failed to fetch workflows: ' + res.status);
      return await res.json();
    });

    console.log('[' + new Date().toISOString() + '] Found workflows:', JSON.stringify(workflows.data?.map(w => ({id: w.id, name: w.name, active: w.active})) || [], null, 2));

    // Find the daily-pack workflow
    const dailyPackWorkflow = workflows.data?.find(w =>
      w.name?.toLowerCase().includes('daily') ||
      w.name?.toLowerCase().includes('pack') ||
      w.name?.toLowerCase().includes('x daily')
    );

    if (!dailyPackWorkflow) {
      console.log('[' + new Date().toISOString() + '] No daily pack workflow found. Available workflows:');
      workflows.data?.forEach(w => console.log('  -', w.id, w.name));
      throw new Error('Daily pack workflow not found');
    }

    console.log('[' + new Date().toISOString() + '] Found workflow:', dailyPackWorkflow.id, dailyPackWorkflow.name);

    // Navigate to workflow
    await page.goto(`${baseUrl}/workflow/${dailyPackWorkflow.id}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: '/home/henry/x/n8n-workflow-view.png', fullPage: true });
    console.log('[' + new Date().toISOString() + '] Screenshot saved: n8n-workflow-view.png');

    // Get recent executions before running
    console.log('[' + new Date().toISOString() + '] Checking recent executions...');
    const execsBefore = await page.evaluate(async (wfId) => {
      const res = await fetch(`/rest/executions?workflowId=${wfId}&limit=3`);
      if (!res.ok) return { error: res.status };
      return await res.json();
    }, dailyPackWorkflow.id);

    console.log('[' + new Date().toISOString() + '] Recent executions:', JSON.stringify(execsBefore.data?.map(e => ({id: e.id, status: e.status, finished: e.finished})) || [], null, 2));

    // Execute workflow manually
    console.log('[' + new Date().toISOString() + '] Executing workflow...');

    // Click execute button
    const execButton = await page.$('button:has-text("Execute"), button:has-text("Test workflow"), [data-test-id="execute-workflow-button"]');
    if (execButton) {
      await execButton.click();
      console.log('[' + new Date().toISOString() + '] Clicked execute button');
    } else {
      // Try via API
      console.log('[' + new Date().toISOString() + '] Execute button not found, trying via API...');
      const execResult = await page.evaluate(async (wfId) => {
        const res = await fetch(`/rest/workflows/${wfId}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ runData: {} })
        });
        return { status: res.status, ok: res.ok };
      }, dailyPackWorkflow.id);
      console.log('[' + new Date().toISOString() + '] API execution result:', execResult);
    }

    // Wait and poll for execution status
    console.log('[' + new Date().toISOString() + '] Waiting for execution to complete...');
    let execution = null;
    const startTime = Date.now();
    const timeout = 180000; // 3 minutes timeout

    while (Date.now() - startTime < timeout) {
      await page.waitForTimeout(3000);

      const execs = await page.evaluate(async (wfId) => {
        const res = await fetch(`/rest/executions?workflowId=${wfId}&limit=1&includeData=true`);
        if (!res.ok) return { error: res.status };
        return await res.json();
      }, dailyPackWorkflow.id);

      if (execs.data && execs.data.length > 0) {
        const latest = execs.data[0];
        console.log('[' + new Date().toISOString() + '] Execution status:', latest.id, 'finished:', latest.finished, 'status:', latest.status);

        if (latest.finished) {
          execution = latest;
          break;
        }
      }
    }

    if (!execution) {
      console.log('[' + new Date().toISOString() + '] Execution timed out or not found');
      await page.screenshot({ path: '/home/henry/x/n8n-timeout.png', fullPage: true });
    } else {
      console.log('[' + new Date().toISOString() + '] Execution completed!');
      console.log('[' + new Date().toISOString() + '] Status:', execution.status);
      console.log('[' + new Date().toISOString() + '] Started:', execution.startedAt);
      console.log('[' + new Date().toISOString() + '] Finished:', execution.stoppedAt);

      // Log node results
      if (execution.data?.resultData?.runData) {
        console.log('\n[' + new Date().toISOString() + '] === Node Results ===');
        for (const [nodeName, nodeData] of Object.entries(execution.data.resultData.runData)) {
          const lastRun = nodeData[nodeData.length - 1];
          const itemCount = lastRun?.data?.main?.[0]?.length || 0;
          const error = lastRun?.error;
          console.log(`  ${nodeName}: ${itemCount} items${error ? ' ERROR: ' + error.message : ''}`);
        }
      }

      // Check for errors
      if (execution.data?.resultData?.error) {
        console.log('\n[' + new Date().toISOString() + '] === EXECUTION ERROR ===');
        console.log(JSON.stringify(execution.data.resultData.error, null, 2));
      }

      await page.screenshot({ path: '/home/henry/x/n8n-execution-done.png', fullPage: true });
      console.log('[' + new Date().toISOString() + '] Screenshot saved: n8n-execution-done.png');
    }

    // Write full execution data to file
    const fs = require('fs');
    fs.writeFileSync('/home/henry/x/execution-result.json', JSON.stringify(execution, null, 2));
    console.log('[' + new Date().toISOString() + '] Full execution data saved to execution-result.json');

  } catch (error) {
    console.error('[' + new Date().toISOString() + '] Error:', error.message);
    await page.screenshot({ path: '/home/henry/x/n8n-error.png', fullPage: true });
  } finally {
    await browser.close();
    console.log('[' + new Date().toISOString() + '] Browser closed');
  }
})();
