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

    console.log('[' + new Date().toISOString() + '] Current URL:', page.url());

    if (page.url().includes('/signin')) {
      await page.screenshot({ path: '/home/henry/x/n8n-login-failed.png', fullPage: true });
      throw new Error('Login failed');
    }

    // Get list of workflows
    console.log('[' + new Date().toISOString() + '] Fetching workflows...');
    const workflows = await page.evaluate(async () => {
      const res = await fetch('/rest/workflows');
      if (!res.ok) throw new Error('Failed to fetch workflows: ' + res.status);
      return await res.json();
    });

    console.log('[' + new Date().toISOString() + '] Found', workflows.data?.length || 0, 'workflows:');
    workflows.data?.forEach(w => {
      console.log('  -', w.id, '|', w.name, '| active:', w.active);
    });

    // Find the daily-pack workflow
    const dailyPackWorkflow = workflows.data?.find(w =>
      w.name?.toLowerCase().includes('daily') ||
      w.name?.toLowerCase().includes('pack')
    );

    if (!dailyPackWorkflow) {
      throw new Error('Daily pack workflow not found');
    }

    console.log('\n[' + new Date().toISOString() + '] Selected workflow:', dailyPackWorkflow.id, '-', dailyPackWorkflow.name);

    // Navigate to workflow
    await page.goto(`${baseUrl}/workflow/${dailyPackWorkflow.id}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: '/home/henry/x/n8n-workflow-ready.png', fullPage: true });
    console.log('[' + new Date().toISOString() + '] Screenshot: n8n-workflow-ready.png');

    // Execute workflow
    console.log('\n[' + new Date().toISOString() + '] ========== EXECUTING WORKFLOW ==========');

    const execStartResult = await page.evaluate(async (wfId) => {
      try {
        const res = await fetch(`/rest/workflows/${wfId}/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        const text = await res.text();
        try {
          return { status: res.status, ok: res.ok, data: JSON.parse(text) };
        } catch {
          return { status: res.status, ok: res.ok, text };
        }
      } catch (err) {
        return { error: err.message };
      }
    }, dailyPackWorkflow.id);

    console.log('[' + new Date().toISOString() + '] Execution started:', JSON.stringify(execStartResult, null, 2));

    // Poll for execution completion
    console.log('[' + new Date().toISOString() + '] Waiting for execution to complete...');
    let execution = null;
    const startTime = Date.now();
    const timeout = 180000; // 3 minutes
    let lastStatus = '';

    while (Date.now() - startTime < timeout) {
      await page.waitForTimeout(3000);

      const execs = await page.evaluate(async (wfId) => {
        const res = await fetch(`/rest/executions?workflowId=${wfId}&limit=1&includeData=true`);
        if (!res.ok) return { error: res.status };
        return await res.json();
      }, dailyPackWorkflow.id);

      if (execs.data && execs.data.length > 0) {
        const latest = execs.data[0];
        const status = `${latest.status} | finished: ${latest.finished}`;

        if (status !== lastStatus) {
          console.log('[' + new Date().toISOString() + '] Execution:', latest.id, '|', status);
          lastStatus = status;
        }

        if (latest.finished) {
          execution = latest;
          break;
        }
      }
    }

    console.log('\n[' + new Date().toISOString() + '] ========== EXECUTION RESULT ==========');

    if (!execution) {
      console.log('[' + new Date().toISOString() + '] Execution timed out');
      await page.screenshot({ path: '/home/henry/x/n8n-timeout.png', fullPage: true });
    } else {
      console.log('[' + new Date().toISOString() + '] Status:', execution.status);
      console.log('[' + new Date().toISOString() + '] Started:', execution.startedAt);
      console.log('[' + new Date().toISOString() + '] Finished:', execution.stoppedAt);

      const duration = new Date(execution.stoppedAt) - new Date(execution.startedAt);
      console.log('[' + new Date().toISOString() + '] Duration:', (duration / 1000).toFixed(1), 'seconds');

      // Log node results
      if (execution.data?.resultData?.runData) {
        console.log('\n[' + new Date().toISOString() + '] ========== NODE RESULTS ==========');
        for (const [nodeName, nodeData] of Object.entries(execution.data.resultData.runData)) {
          const lastRun = nodeData[nodeData.length - 1];
          const itemCount = lastRun?.data?.main?.[0]?.length || 0;
          const error = lastRun?.error;
          const status = error ? 'ERROR' : 'OK';
          console.log(`  [${status}] ${nodeName}: ${itemCount} items${error ? ' - ' + error.message : ''}`);

          // Show sample data for key nodes
          if (['LLM Rank', 'Generate Tweets', 'Send to Slack'].includes(nodeName) && lastRun?.data?.main?.[0]?.[0]) {
            const sample = lastRun.data.main[0][0].json;
            if (nodeName === 'Generate Tweets' && sample.tweets) {
              console.log('    - hot_take length:', sample.tweets.hot_take?.text?.length || 0);
              console.log('    - framework length:', sample.tweets.framework?.text?.length || 0);
              console.log('    - case length:', sample.tweets.case?.text?.length || 0);
            }
            if (nodeName === 'Send to Slack' && sample.success) {
              console.log('    - Slack message sent! ts:', sample.message_ts);
            }
          }
        }
      }

      // Check for errors
      if (execution.data?.resultData?.error) {
        console.log('\n[' + new Date().toISOString() + '] ========== EXECUTION ERROR ==========');
        console.log(JSON.stringify(execution.data.resultData.error, null, 2));
      }

      // Save execution data
      fs.writeFileSync('/home/henry/x/execution-result.json', JSON.stringify(execution, null, 2));
      console.log('\n[' + new Date().toISOString() + '] Full data saved to execution-result.json');
    }

    await page.screenshot({ path: '/home/henry/x/n8n-execution-done.png', fullPage: true });

  } catch (error) {
    console.error('[' + new Date().toISOString() + '] Error:', error.message);
    await page.screenshot({ path: '/home/henry/x/n8n-error.png', fullPage: true });
  } finally {
    await browser.close();
    console.log('[' + new Date().toISOString() + '] Done');
  }
})();
