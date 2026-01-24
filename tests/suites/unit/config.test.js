/**
 * 配置文件验证测试
 */

const { assert } = require('../../lib/assertions');
const fs = require('fs');
const path = require('path');
const config = require('../../config/test.config');

module.exports = {
  name: 'Config Validation',

  tests: [
    {
      name: 'rss-feeds.json 语法正确',
      run: async () => {
        const filePath = path.join(config.paths.config, 'rss-feeds.json');
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        assert.ok(Array.isArray(data.feeds), 'feeds should be array');
        assert.ok(data.feeds.length > 0, 'feeds should not be empty');
      }
    },
    {
      name: 'RSS源必填字段完整',
      run: async () => {
        const filePath = path.join(config.paths.config, 'rss-feeds.json');
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const required = ['id', 'name', 'url', 'tier'];
        for (const feed of data.feeds) {
          for (const field of required) {
            assert.ok(feed[field], `Feed ${feed.id || 'unknown'} missing ${field}`);
          }
        }
      }
    },
    {
      name: 'RSS源Tier值有效',
      run: async () => {
        const filePath = path.join(config.paths.config, 'rss-feeds.json');
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const validTiers = ['A', 'B', 'C', 'D'];
        for (const feed of data.feeds) {
          assert.includes(validTiers, feed.tier, `Invalid tier ${feed.tier} for ${feed.id}`);
        }
      }
    },
    {
      name: 'RSS源URL格式正确',
      run: async () => {
        const filePath = path.join(config.paths.config, 'rss-feeds.json');
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        for (const feed of data.feeds) {
          assert.ok(
            feed.url.startsWith('http://') || feed.url.startsWith('https://'),
            `Invalid URL for ${feed.id}: ${feed.url}`
          );
        }
      }
    },
    {
      name: 'RSS源ID唯一',
      run: async () => {
        const filePath = path.join(config.paths.config, 'rss-feeds.json');
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const ids = data.feeds.map(f => f.id);
        const uniqueIds = [...new Set(ids)];
        assert.equal(ids.length, uniqueIds.length, 'Duplicate feed IDs found');
      }
    }
  ]
};
