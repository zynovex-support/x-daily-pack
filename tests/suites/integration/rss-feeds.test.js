/**
 * RSS 源集成测试
 */

const { assert } = require('../../lib/assertions');
const { request } = require('../../lib/http-client');
const config = require('../../config/test.config');
const fs = require('fs');
const path = require('path');

const feedsConfig = JSON.parse(
  fs.readFileSync(path.join(config.paths.config, 'rss-feeds.json'), 'utf8')
);

// 测试 Tier A 源前5个
const tierAFeeds = feedsConfig.feeds.filter(f => f.tier === 'A').slice(0, 5);

// 新增源测试（Phase 2.4）
const newFeeds = feedsConfig.feeds.filter(f =>
  f.id === 'arxiv-ai' || f.id === '36kr'
);

module.exports = {
  name: 'RSS Feeds',

  tests: [
    ...tierAFeeds.map(feed => ({
      name: `${feed.name} 可访问`,
      run: async () => {
        const res = await request(feed.url, { timeout: 10000 });
        assert.ok(res.status >= 200 && res.status < 400, `Status: ${res.status}`);
      }
    })),
    ...newFeeds.map(feed => ({
      name: `[新增] ${feed.name} 可访问`,
      run: async () => {
        const res = await request(feed.url, { timeout: 15000 });
        assert.ok(res.status >= 200 && res.status < 400, `Status: ${res.status}`);
      }
    }))
  ]
};
