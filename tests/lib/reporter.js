/**
 * 测试报告生成器
 */

const fs = require('fs');
const path = require('path');

class Reporter {
  constructor(outputDir) {
    this.outputDir = outputDir;
    this.results = {
      timestamp: new Date().toISOString(),
      suites: [],
      summary: { total: 0, passed: 0, failed: 0, skipped: 0 }
    };
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
  }

  addSuite(name, tests) {
    const suite = {
      name,
      tests,
      passed: tests.filter(t => t.status === 'passed').length,
      failed: tests.filter(t => t.status === 'failed').length,
      skipped: tests.filter(t => t.status === 'skipped').length
    };
    this.results.suites.push(suite);
    this.results.summary.total += tests.length;
    this.results.summary.passed += suite.passed;
    this.results.summary.failed += suite.failed;
    this.results.summary.skipped += suite.skipped;
  }

  print() {
    const { summary, suites } = this.results;
    console.log('\n' + '='.repeat(60));
    console.log('  TEST RESULTS');
    console.log('='.repeat(60) + '\n');

    for (const suite of suites) {
      const icon = suite.failed > 0 ? '❌' : '✅';
      console.log(`${icon} ${suite.name} (${suite.passed}/${suite.tests.length})`);
      for (const test of suite.tests) {
        const status = test.status === 'passed' ? '✓' : test.status === 'failed' ? '✗' : '○';
        const color = test.status === 'passed' ? '32' : test.status === 'failed' ? '31' : '33';
        console.log(`   \x1b[${color}m${status}\x1b[0m ${test.name}`);
        if (test.error) console.log(`      Error: ${test.error}`);
      }
      console.log('');
    }

    console.log('='.repeat(60));
    console.log(`  SUMMARY: ${summary.passed}/${summary.total} passed`);
    if (summary.failed > 0) console.log(`  FAILED: ${summary.failed}`);
    if (summary.skipped > 0) console.log(`  SKIPPED: ${summary.skipped}`);
    console.log('='.repeat(60) + '\n');
  }

  save() {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(this.outputDir, `test-report-${ts}.json`);
    fs.writeFileSync(file, JSON.stringify(this.results, null, 2));
    console.log(`Report saved: ${file}`);
    return file;
  }

  exitCode() {
    return this.results.summary.failed > 0 ? 1 : 0;
  }
}

module.exports = { Reporter };
