/**
 * RSS 内容解析测试
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { testConfig } from '../../setup/global-setup';

interface Feed {
  id: string;
  name: string;
  url: string;
}

interface ParsedItem {
  title: string;
  link: string;
}

const feedsConfig = JSON.parse(
  fs.readFileSync(path.join(testConfig.paths.config, 'rss-feeds.json'), 'utf8')
);

// RSS/Atom parsing functions
function extractText(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i');
  const match = xml.match(regex);
  if (!match) return '';
  return match[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

function extractLink(itemXml: string): string {
  const hrefMatch = itemXml.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (hrefMatch) return hrefMatch[1];
  return extractText(itemXml, 'link');
}

function parseRssContent(xml: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const itemRegex = /<(item|entry)[\s>]([\s\S]*?)<\/\1>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
    const itemXml = match[2];
    items.push({
      title: extractText(itemXml, 'title'),
      link: extractLink(itemXml)
    });
  }
  return items;
}

const testFeeds: Feed[] = [
  feedsConfig.feeds.find((f: Feed) => f.id === 'simonwillison'),
  feedsConfig.feeds.find((f: Feed) => f.id === '36kr'),
].filter(Boolean);

describe('RSS Parsing', () => {
  testFeeds.forEach(feed => {
    it(`${feed.name} 内容可解析`, async () => {
      const res = await fetch(feed.url);
      expect(res.status).toBe(200);
      const xml = await res.text();
      const items = parseRssContent(xml);
      if (items.length > 0) {
        expect(items[0].title).toBeTruthy();
      }
    }, 20000);
  });

  it('XML解析函数正确', () => {
    const testXml = '<item><title>Test Title</title><link>https://example.com</link></item>';
    const items = parseRssContent(testXml);
    expect(items.length).toBe(1);
    expect(items[0].title).toBe('Test Title');
    expect(items[0].link).toBe('https://example.com');
  });
});
