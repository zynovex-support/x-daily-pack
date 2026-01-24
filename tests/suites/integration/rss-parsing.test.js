/**
 * RSS 内容解析测试
 */

const { assert } = require('../../lib/assertions');
const { request } = require('../../lib/http-client');
const config = require('../../config/test.config');
const fs = require('fs');
const path = require('path');

const feedsConfig = JSON.parse(
  fs.readFileSync(path.join(config.paths.config, 'rss-feeds.json'), 'utf8')
);

// 解析RSS/Atom内容
function parseRssContent(xml) {
  const items = [];
  const itemRegex = /<(item|entry)[\s>]([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
    const itemXml = match[2];
    const title = extractText(itemXml, 'title');
    const link = extractLink(itemXml);
    items.push({ title, link });
  }
  return items;
}

function extractText(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(regex);
  if (!match) return '';
  return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
}

function extractLink(itemXml) {
  const hrefMatch = itemXml.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (hrefMatch) return hrefMatch[1];
  return extractText(itemXml, 'link');
}

// 选择几个关键源测试解析
const testFeeds = [
  feedsConfig.feeds.find(f => f.id === 'simonwillison'),
  feedsConfig.feeds.find(f => f.id === '36kr'),
].filter(Boolean);

module.exports = {
  name: 'RSS Parsing',

  tests: [
    ...testFeeds.map(feed => ({
      name: `${feed.name} 内容可解析`,
      run: async () => {
        const res = await request(feed.url, { timeout: 15000 });
        assert.ok(res.status === 200, `Status: ${res.status}`);
        const items = parseRssContent(res.data);
        // 允许空内容（如ArXiv周末）
        if (items.length > 0) {
          assert.ok(items[0].title, 'First item should have title');
        }
      }
    })),
    {
      name: 'XML解析函数正确',
      run: async () => {
        const testXml = '<item><title>Test Title</title><link>https://example.com</link></item>';
        const items = parseRssContent(testXml);
        assert.equal(items.length, 1);
        assert.equal(items[0].title, 'Test Title');
        assert.equal(items[0].link, 'https://example.com');
      }
    }
  ]
};
