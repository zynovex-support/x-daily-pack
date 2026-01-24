#!/usr/bin/env node
/**
 * Prune old n8n executions via API.
 *
 * Usage:
 *   N8N_API_KEY=xxx node scripts/prune-n8n-executions.js --days 14 --dry-run
 *   N8N_API_KEY=xxx node scripts/prune-n8n-executions.js --days 30 --workflow 6TymQQ...
 */

const http = require('http');
const https = require('https');

const args = process.argv.slice(2);
const argValue = (flag, fallback = null) => {
  const idx = args.indexOf(flag);
  if (idx === -1) return fallback;
  const value = args[idx + 1];
  return value && !value.startsWith('--') ? value : fallback;
};

const toBool = (value, fallback = false) => {
  if (value == null) return fallback;
  return String(value).toLowerCase() === 'true';
};

const N8N_URL = process.env.N8N_URL || 'http://localhost:5678';
const API_KEY = process.env.N8N_API_KEY || process.env.N8N_API_TOKEN || '';
const RETENTION_DAYS = Number.parseInt(argValue('--days', process.env.N8N_RETENTION_DAYS || '14'), 10);
const DRY_RUN = toBool(argValue('--dry-run', process.env.DRY_RUN), true);
const WORKFLOW_ID = argValue('--workflow', process.env.N8N_WORKFLOW_ID);

if (!API_KEY) {
  console.error('Missing N8N_API_KEY (or N8N_API_TOKEN).');
  process.exit(1);
}

if (!Number.isFinite(RETENTION_DAYS) || RETENTION_DAYS <= 0) {
  console.error('Invalid retention days. Use --days <number> or N8N_RETENTION_DAYS.');
  process.exit(1);
}

const urlObj = new URL(N8N_URL);
const client = urlObj.protocol === 'https:' ? https : http;

const requestJson = (method, path, body) => new Promise((resolve, reject) => {
  const payload = body ? JSON.stringify(body) : null;
  const req = client.request({
    hostname: urlObj.hostname,
    port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
    path,
    method,
    headers: {
      'X-N8N-API-KEY': API_KEY,
      'Content-Type': 'application/json',
      'Content-Length': payload ? Buffer.byteLength(payload) : 0,
    },
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      if (!data) return resolve({ statusCode: res.statusCode, body: null });
      try {
        resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
      } catch (err) {
        resolve({ statusCode: res.statusCode, body: data });
      }
    });
  });
  req.on('error', reject);
  if (payload) req.write(payload);
  req.end();
});

const buildQuery = (params) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    query.set(key, String(value));
  });
  const qs = query.toString();
  return qs ? `?${qs}` : '';
};

const cutoffMs = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;

const fetchPage = async (cursor) => {
  const params = {
    limit: 100,
    includeData: false,
    cursor,
  };
  if (WORKFLOW_ID) params.workflowId = WORKFLOW_ID;
  const path = `/api/v1/executions${buildQuery(params)}`;
  const response = await requestJson('GET', path);
  if (response.statusCode !== 200) {
    throw new Error(`Failed to list executions (${response.statusCode}).`);
  }
  return response.body || {};
};

const deleteExecution = async (executionId) => {
  const path = `/api/v1/executions/${executionId}`;
  const response = await requestJson('DELETE', path);
  if (response.statusCode !== 200) {
    throw new Error(`Failed to delete execution ${executionId} (${response.statusCode}).`);
  }
};

const parseDate = (value) => {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
};

const run = async () => {
  let cursor = undefined;
  let scanned = 0;
  let candidates = 0;
  let deleted = 0;

  while (true) {
    const page = await fetchPage(cursor);
    const items = Array.isArray(page.data) ? page.data : [];
    if (!items.length) break;

    for (const item of items) {
      scanned += 1;
      const stoppedAt = parseDate(item.stoppedAt) || parseDate(item.startedAt);
      if (!stoppedAt || stoppedAt >= cutoffMs) continue;
      candidates += 1;
      if (DRY_RUN) continue;
      await deleteExecution(item.id);
      deleted += 1;
    }

    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }

  const mode = DRY_RUN ? 'dry-run' : 'delete';
  console.log(`[prune] mode=${mode} retention_days=${RETENTION_DAYS} scanned=${scanned} candidates=${candidates} deleted=${deleted}`);
};

run().catch((err) => {
  console.error(`[prune] failed: ${err.message}`);
  process.exit(1);
});
