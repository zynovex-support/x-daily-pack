/**
 * 配置文件验证测试
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { testConfig } from '../../setup/global-setup';

describe('Config Validation', () => {
  const configPath = testConfig.paths.config;

  it('rss-feeds.json 语法正确', () => {
    const filePath = path.join(configPath, 'rss-feeds.json');
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    expect(Array.isArray(data.feeds)).toBe(true);
    expect(data.feeds.length).toBeGreaterThan(0);
  });

  it('RSS源必填字段完整', () => {
    const filePath = path.join(configPath, 'rss-feeds.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const required = ['id', 'name', 'url', 'tier'];
    for (const feed of data.feeds) {
      for (const field of required) {
        expect(feed[field]).toBeTruthy();
      }
    }
  });

  it('RSS源Tier值有效', () => {
    const filePath = path.join(configPath, 'rss-feeds.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const validTiers = ['A', 'B', 'C', 'D'];
    for (const feed of data.feeds) {
      expect(validTiers).toContain(feed.tier);
    }
  });

  it('RSS源URL格式正确', () => {
    const filePath = path.join(configPath, 'rss-feeds.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    for (const feed of data.feeds) {
      expect(
        feed.url.startsWith('http://') || feed.url.startsWith('https://')
      ).toBe(true);
    }
  });

  it('RSS源ID唯一', () => {
    const filePath = path.join(configPath, 'rss-feeds.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const ids = data.feeds.map((f: { id: string }) => f.id);
    const uniqueIds = [...new Set(ids)];
    expect(ids.length).toBe(uniqueIds.length);
  });
});
