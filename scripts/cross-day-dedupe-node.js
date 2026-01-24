// Cross-Day Dedupe Node
// Attempts to use workflow staticData; if不可用则退化为“当次运行”去重（无跨日持久化）

const items = $input.all();
const EXPIRY_DAYS = Number.parseInt($env.DEDUPE_EXPIRY_DAYS || '7', 10);
const MAX_URLS = Number.parseInt($env.DEDUPE_MAX_URLS || '2000', 10);

// Helper: load persistent store (prefer staticData)
let storage = { seenUrls: {} };
let storageMode = 'staticData';

try {
  const staticData = this.getWorkflowStaticData
    ? this.getWorkflowStaticData('global')
    : this.helpers?.getWorkflowStaticData?.call(this, 'global');
  if (!staticData) {
    storageMode = 'volatile';
  } else {
    if (!staticData.seenUrls) staticData.seenUrls = {};
    storage = staticData;
  }
} catch (err) {
  storageMode = 'volatile';
  storage = { seenUrls: {} };
}

const now = Date.now();
const expiryMs = EXPIRY_DAYS * 24 * 60 * 60 * 1000;

// Clean up expired entries
const urlKeys = Object.keys(storage.seenUrls);
let expiredCount = 0;
for (const url of urlKeys) {
  const timestamp = storage.seenUrls[url];
  if (now - timestamp > expiryMs) {
    delete storage.seenUrls[url];
    expiredCount++;
  }
}

// Dedupe current batch
const unique = [];
const duplicateUrls = [];
const newUrls = [];

for (const item of items) {
  const url = item.json.url;
  if (!url) continue;

  if (storage.seenUrls[url]) {
    duplicateUrls.push(url);
    continue;
  }

  storage.seenUrls[url] = now;
  newUrls.push(url);
  unique.push(item);
}

// Enforce max URL limit (remove oldest if over limit)
const allUrls = Object.entries(storage.seenUrls);
if (allUrls.length > MAX_URLS) {
  allUrls.sort((a, b) => a[1] - b[1]); // oldest first
  const toRemove = allUrls.slice(0, allUrls.length - MAX_URLS);
  for (const [url] of toRemove) {
    delete storage.seenUrls[url];
  }
}

const stats = {
  input_count: items.length,
  unique_count: unique.length,
  duplicate_count: duplicateUrls.length,
  expired_cleaned: expiredCount,
  total_stored_urls: Object.keys(storage.seenUrls).length,
  expiry_days: EXPIRY_DAYS,
  storage_mode: storageMode
};
console.log('Cross-Day Dedupe Stats:', JSON.stringify(stats));

return unique;
