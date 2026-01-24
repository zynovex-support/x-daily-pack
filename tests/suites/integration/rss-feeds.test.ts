/**
 * RSS 源集成测试
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { testConfig } from '../../setup/global-setup';

interface Feed {
  id: string;
  name: string;
  url: string;
  tier: string;
}

const feedsConfig = JSON.parse(
  fs.readFileSync(path.join(testConfig.paths.config, 'rss-feeds.json'), 'utf8')
);

const tierAFeeds: Feed[] = feedsConfig.feeds
  .filter((f: Feed) => f.tier === 'A')
  .slice(0, 5);

const newFeeds: Feed[] = feedsConfig.feeds
  .filter((f: Feed) => f.id === 'arxiv-ai' || f.id === '36kr');

describe('RSS Feeds', () => {
  describe('Tier A Feeds', () => {
    tierAFeeds.forEach(feed => {
      it(`${feed.name} 可访问`, async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        try {
          const res = await fetch(feed.url, { signal: controller.signal });
          expect(res.status).toBeGreaterThanOrEqual(200);
          expect(res.status).toBeLessThan(400);
        } finally {
          clearTimeout(timeout);
        }
      }, 15000);
    });
  });

  describe('New Feeds', () => {
    newFeeds.forEach(feed => {
      it(`[新增] ${feed.name} 可访问`, async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const res = await fetch(feed.url, { signal: controller.signal });
          expect(res.status).toBeGreaterThanOrEqual(200);
          expect(res.status).toBeLessThan(400);
        } finally {
          clearTimeout(timeout);
        }
      }, 20000);
    });
  });
});
