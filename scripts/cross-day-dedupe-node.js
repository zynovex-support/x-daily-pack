// Cross-Day Dedupe Node
// Attempts to use workflow staticData; if不可用则退化为“当次运行”去重（无跨日持久化）

const items = $input.all();
const EXPIRY_DAYS = Number.parseInt($env.DEDUPE_EXPIRY_DAYS || '7', 10);
const MAX_URLS = Number.parseInt($env.DEDUPE_MAX_URLS || '2000', 10);
const FILE_STORE_ENABLED = String($env.DEDUPE_FILE_STORE || 'true').toLowerCase() !== 'false';
const FILE_STORE_PATH = $env.DEDUPE_STORE_PATH || '/home/node/.n8n/x-daily-pack-dedupe.json';

const safeRequire = (name) => {
  try { return require(name); } catch (err) { return null; }
};
const fs = safeRequire('fs');
const path = safeRequire('path');

const normalizeStore = (store) => {
  if (!store || typeof store !== 'object') return { seenUrls: {} };
  if (!store.seenUrls || typeof store.seenUrls !== 'object') store.seenUrls = {};
  return store;
};

const loadFileStore = () => {
  if (!FILE_STORE_ENABLED || !fs) return null;
  try {
    if (!fs.existsSync(FILE_STORE_PATH)) return { seenUrls: {} };
    const raw = fs.readFileSync(FILE_STORE_PATH, 'utf8');
    if (!raw) return { seenUrls: {} };
    return normalizeStore(JSON.parse(raw));
  } catch (err) {
    console.log(`[Cross-Day Dedupe] File store load failed: ${err.message}`);
    return { seenUrls: {} };
  }
};

const saveFileStore = (store) => {
  if (!FILE_STORE_ENABLED || !fs) return false;
  try {
    const dir = path ? path.dirname(FILE_STORE_PATH) : FILE_STORE_PATH.split('/').slice(0, -1).join('/');
    if (dir) fs.mkdirSync(dir, { recursive: true });
    const tmpPath = `${FILE_STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(store));
    fs.renameSync(tmpPath, FILE_STORE_PATH);
    return true;
  } catch (err) {
    console.log(`[Cross-Day Dedupe] File store save failed: ${err.message}`);
    return false;
  }
};

const mergeSeenUrls = (target, source) => {
  if (!source) return;
  for (const [url, ts] of Object.entries(source)) {
    if (!url) continue;
    const existing = target[url];
    if (!existing || ts > existing) target[url] = ts;
  }
};

// Helper: load persistent store (staticData + file fallback)
let storage = { seenUrls: {} };
let storageMode = 'volatile';
let staticData = null;

try {
  staticData = this.getWorkflowStaticData
    ? this.getWorkflowStaticData('global')
    : this.helpers?.getWorkflowStaticData?.call(this, 'global');
  if (staticData) {
    storage = normalizeStore(staticData);
    storageMode = 'staticData';
  }
} catch (err) {
  staticData = null;
}

const fileStore = loadFileStore();
if (fileStore) {
  mergeSeenUrls(storage.seenUrls, fileStore.seenUrls);
  storageMode = staticData ? 'staticData+file' : 'file';
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
  storage_mode: storageMode,
  file_store_enabled: FILE_STORE_ENABLED,
  file_store_saved: fileStore ? saveFileStore({ seenUrls: storage.seenUrls }) : false
};
console.log('Cross-Day Dedupe Stats:', JSON.stringify(stats));

return unique;
