'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const TraceNest = require('../src/index');

const TEST_JSON_PATH = path.join(__dirname, 'temp_test_report.json');

describe('Reporters (Console & JSON)', () => {
  beforeEach(() => {
    TraceNest.reset();
    TraceNest.start({ name: 'ReporterTestSuite' });
  });

  afterEach(() => {
    if (fs.existsSync(TEST_JSON_PATH)) {
      fs.unlinkSync(TEST_JSON_PATH);
    }
  });

  test('should render console report string containing summary and timeline', () => {
    TraceNest.trace('Sample Task', () => {
      TraceNest.track('Checkpoint reached');
    });

    const rendered = TraceNest.report({ silent: true, color: false });
    assert.ok(rendered.includes('TRACENEST EXECUTION REPORT'));
    assert.ok(rendered.includes('Total Operations:      1'));
    assert.ok(rendered.includes('Successful Operations: 1'));
    assert.ok(rendered.includes('Sample Task'));
    assert.ok(rendered.includes('Checkpoint reached'));
  });

  test('should export valid JSON report file', () => {
    TraceNest.trace('Root Task', () => {
      TraceNest.trace('Sub Task', () => {
        return 123;
      });
    });

    const exportedPath = TraceNest.exportJSON(TEST_JSON_PATH);
    assert.strictEqual(exportedPath, TEST_JSON_PATH);
    assert.ok(fs.existsSync(TEST_JSON_PATH));

    const content = fs.readFileSync(TEST_JSON_PATH, 'utf8');
    const parsed = JSON.parse(content);

    assert.ok(parsed.traceId);
    assert.strictEqual(parsed.name, 'ReporterTestSuite');
    assert.strictEqual(parsed.summary.totalOperations, 2);
    assert.strictEqual(parsed.summary.successfulOperations, 2);
    assert.strictEqual(parsed.tree.length, 1);
    assert.strictEqual(parsed.tree[0].name, 'Root Task');
    assert.strictEqual(parsed.tree[0].children[0].name, 'Sub Task');
    assert.ok(Array.isArray(parsed.events));
    assert.ok(parsed.events.length >= 3);
  });

  test('should return structured report data from getReportData()', () => {
    TraceNest.track('Standalone Event');
    const data = TraceNest.getReportData();

    assert.ok(data.timestamp);
    assert.ok(data.summary);
    assert.ok(data.events.some(e => e.name === 'Standalone Event'));
  });
});
