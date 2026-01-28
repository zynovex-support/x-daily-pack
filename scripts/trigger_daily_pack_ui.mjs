import dotenv from "dotenv";
import { chromium } from "playwright";

dotenv.config();

const host = process.env.N8N_HOST || "localhost";
const port = process.env.N8N_PORT || "5678";
const baseUrl = `http://${host}:${port}`;

const email = process.env.N8N_UI_EMAIL;
const password = process.env.N8N_UI_PASSWORD;
const workflowId = process.env.N8N_WORKFLOW_ID;
const workflowName =
  process.env.N8N_WORKFLOW_NAME || "X Daily Pack v5 - Semantic Dedupe";

if (!email || !password) {
  throw new Error("N8N_UI_EMAIL or N8N_UI_PASSWORD is not set");
}

const workflowUrl = workflowId ? `${baseUrl}/workflow/${workflowId}` : baseUrl;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function signInIfNeeded(page) {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await sleep(1500);
  if (!page.url().includes("signin")) return;

  const emailInput = page.locator(
    'input[type="email"], input[name="email"], input[autocomplete="email"]',
  );
  const passwordInput = page.locator('input[type="password"]');
  await emailInput.first().fill(email);
  await passwordInput.first().fill(password);

  const submit = page.locator(
    'button[type="submit"], button:has-text("Sign in"), button:has-text("登录")',
  );
  await submit.first().click();
  await page.waitForLoadState("networkidle");
  await sleep(2000);
  console.log("[ui-trigger] signed_in_url:", page.url());
}

async function openWorkflow(page) {
  if (workflowId) {
    const candidates = [
      `${baseUrl}/workflow/${workflowId}`,
      `${baseUrl}/workflows/${workflowId}`,
      `${baseUrl}/workflow/${workflowId}/edit`,
      `${baseUrl}/workflows/${workflowId}/edit`,
    ];

    for (const url of candidates) {
      await page.goto(url, { waitUntil: "networkidle" });
      await sleep(1500);
      const executeCount = await page
        .locator('[data-test-id^="execute-workflow-button"]')
        .count();
      console.log("[ui-trigger] workflow_candidate:", url, "execute_count:", executeCount);
      if (executeCount > 0) return;
    }

    console.log("[ui-trigger] workflow_url_failed_last_url:", page.url());
    throw new Error(`Failed to locate execute button via workflowId=${workflowId}`);
  }

  const link = page.getByText(workflowName, { exact: false }).first();
  await link.waitFor({ timeout: 20000 });
  await link.click();
  await page.waitForLoadState("networkidle");
  await sleep(2000);
  console.log("[ui-trigger] workflow_opened_url:", page.url());
}

async function triggerExecution(page) {
  const executeButton = page.locator('[data-test-id^="execute-workflow-button"]');
  await executeButton.first().waitFor({ timeout: 20000 });
  await executeButton.first().click({ force: true });
  await sleep(1500);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  console.log("[ui-trigger] baseUrl:", baseUrl);
  await signInIfNeeded(page);
  await openWorkflow(page);
  await triggerExecution(page);
  console.log("[ui-trigger] manual execution clicked");
} finally {
  await browser.close();
}
