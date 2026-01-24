import { beforeAll, afterAll, afterEach } from 'vitest';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { server } from './mocks/server';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables
const envPath = path.join(__dirname, '../../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Test configuration
export const testConfig = {
  n8n: {
    host: process.env.N8N_HOST || 'localhost',
    port: parseInt(process.env.N8N_PORT || '5678'),
    apiKey: process.env.N8N_API_KEY,
    workflowName: 'X Daily Pack v5',
  },
  apis: {
    openai: process.env.OPENAI_API_KEY,
    newsApi: process.env.NEWS_API_KEY,
    newsData: process.env.NEWSDATA_API_KEY,
    gnews: process.env.GNEWS_API_KEY,
    theNewsApi: process.env.THENEWSAPI_KEY,
    currents: process.env.CURRENTS_API_KEY,
    mediastack: process.env.MEDIASTACK_API_KEY,
    rubeToken: process.env.RUBE_AUTH_TOKEN,
  },
  timeouts: {
    http: 15000,
    workflow: 300000,
    api: 30000,
  },
  paths: {
    root: path.join(__dirname, '../..'),
    config: path.join(__dirname, '../../config'),
    scripts: path.join(__dirname, '../../scripts'),
    logs: path.join(__dirname, '../../logs'),
  },
  scoring: {
    minScore: 18,
    maxScore: 30,
    dimensions: ['timeliness', 'impact', 'actionability', 'relevance'],
    categories: ['announcement', 'insight', 'tool', 'case', 'research', 'risk'],
  },
  dedupe: {
    similarityThreshold: 0.85,
    embeddingModel: 'text-embedding-3-small',
  },
};

beforeAll(() => {
  console.log('Test suite starting...');
  // Start MSW server for mocking (only for unit tests)
  if (process.env.USE_MOCKS !== 'false') {
    server.listen({ onUnhandledRequest: 'bypass' });
  }
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  console.log('Test suite completed.');
  server.close();
});
