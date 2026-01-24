#!/usr/bin/env node
/**
 * X Daily Pack - 统一测试入口
 *
 * Usage:
 *   node tests/run-all.js           # 运行所有测试
 *   node tests/run-all.js unit      # 只运行单元测试
 *   node tests/run-all.js integration
 *   node tests/run-all.js e2e
 */

const fs = require('fs');
const path = require('path');
const { Reporter } = require('./lib/reporter');
const config = require('./config/test.config');

const SUITES_DIR = path.join(__dirname, 'suites');

async function loadSuites(filter) {
  const suites = [];
  const categories = filter ? [filter] : ['unit', 'integration', 'e2e'];

  for (const category of categories) {
    const dir = path.join(SUITES_DIR, category);
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js'));
    for (const file of files) {
      const suite = require(path.join(dir, file));
      suite.category = category;
      suites.push(suite);
    }
  }
  return suites;
}

async function runSuite(suite) {
  const results = [];

  for (const test of suite.tests) {
    if (test.skip) {
      results.push({ name: test.name, status: 'skipped' });
      continue;
    }

    try {
      await test.run();
      results.push({ name: test.name, status: 'passed' });
    } catch (err) {
      results.push({ name: test.name, status: 'failed', error: err.message });
    }
  }

  return results;
}

async function main() {
  const filter = process.argv[2];
  const startTime = Date.now();

  console.log('\n' + '='.repeat(60));
  console.log('  X Daily Pack - Automated Test Suite');
  console.log('  ' + new Date().toISOString());
  console.log('='.repeat(60) + '\n');

  const reporter = new Reporter(config.paths.logs);
  const suites = await loadSuites(filter);

  console.log(`Running ${suites.length} test suites...\n`);

  for (const suite of suites) {
    console.log(`[${suite.category}] ${suite.name}...`);
    const results = await runSuite(suite);
    reporter.addSuite(`[${suite.category}] ${suite.name}`, results);
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nCompleted in ${duration}s`);

  reporter.print();
  reporter.save();

  process.exit(reporter.exitCode());
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
