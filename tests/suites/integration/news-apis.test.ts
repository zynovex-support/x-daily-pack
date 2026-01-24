/**
 * News API 集成测试
 */
import { describe, it, expect } from 'vitest';
import { testConfig } from '../../setup/global-setup';

interface ApiConfig {
  name: string;
  key: string | undefined;
  url: string;
}

const APIs: ApiConfig[] = [
  {
    name: 'News API',
    key: testConfig.apis.newsApi,
    url: 'https://newsapi.org/v2/everything?q=AI&pageSize=1&apiKey='
  },
  {
    name: 'NewsData',
    key: testConfig.apis.newsData,
    url: 'https://newsdata.io/api/1/latest?q=AI&apikey='
  },
  {
    name: 'GNews',
    key: testConfig.apis.gnews,
    url: 'https://gnews.io/api/v4/search?q=AI&max=1&apikey='
  }
];

describe('News APIs', () => {
  APIs.forEach(api => {
    it.skipIf(!api.key)(`${api.name} 连接`, async () => {
      const res = await fetch(api.url + api.key);
      expect(res.status).toBe(200);
    }, 15000);
  });
});
