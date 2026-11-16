'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { calculateStatistics, getPercentile } = require('../src/analysis/statistics');

describe('Statistics Accuracy & Wall-Clock Distinction', () => {
  test('should accurately calculate quantiles using linear interpolation', () => {
    // Test dataset: [10, 20, 30, 40]
    const data = [10, 20, 30, 40];

    const p0 = getPercentile(data, 0);
    const p50 = getPercentile(data, 50);
    const p90 = getPercentile(data, 90);
    const p100 = getPercentile(data, 100);

    assert.strictEqual(p0, 10);
    assert.strictEqual(p50, 25); // Rank 0.5 * 3 = 1.5 -> 20 + 0.5 * 10 = 25
    assert.strictEqual(p90, 37); // Rank 0.9 * 3 = 2.7 -> 30 + 0.7 * 10 = 37
    assert.strictEqual(p100, 40);

    // Single item
    assert.strictEqual(getPercentile([42], 50), 42);

    // Empty list
    assert.strictEqual(getPercentile([], 50), 0);
  });

  test('should distinguish total wall-clock time from cumulative operation duration in concurrent execution', () => {
    // 3 concurrent operations running at the same time:
    // Op 1: 0ms -> 100ms (duration 100)
    // Op 2: 10ms -> 60ms (duration 50)
    // Op 3: 20ms -> 80ms (duration 60)
    // Total Wall-Clock Time = 100 - 0 = 100ms
    // Sum of Durations = 100 + 50 + 60 = 210ms
    const concurrentOps = [
      { id: '1', name: 'op1', status: 'SUCCESS', startTime: 1000, endTime: 1100, durationMs: 100 },
      { id: '2', name: 'op2', status: 'SUCCESS', startTime: 1010, endTime: 1060, durationMs: 50 },
      { id: '3', name: 'op3', status: 'SUCCESS', startTime: 1020, endTime: 1080, durationMs: 60 }
    ];

    const stats = calculateStatistics(concurrentOps, []);

    assert.strictEqual(stats.wallClockTimeMs, 100, 'Wall-clock time should be 100ms');
    assert.strictEqual(stats.totalExecutionTimeMs, 100);
    assert.strictEqual(stats.sumOperationDurationMs, 210, 'Sum of operation durations should be 210ms');
    assert.strictEqual(stats.averageDurationMs, 70); // 210 / 3 = 70
    assert.strictEqual(stats.minDurationMs, 50);
    assert.strictEqual(stats.maxDurationMs, 100);
    assert.strictEqual(stats.totalOperations, 3);
    assert.strictEqual(stats.successfulOperations, 3);
    assert.strictEqual(stats.failedOperations, 0);
  });

  test('should match wall-clock time with cumulative duration in strictly serial execution', () => {
    const serialOps = [
      { id: '1', name: 's1', status: 'SUCCESS', startTime: 100, endTime: 150, durationMs: 50 },
      { id: '2', name: 's2', status: 'SUCCESS', startTime: 150, endTime: 200, durationMs: 50 }
    ];

    const stats = calculateStatistics(serialOps, []);
    assert.strictEqual(stats.wallClockTimeMs, 100);
    assert.strictEqual(stats.sumOperationDurationMs, 100);
    assert.strictEqual(stats.averageDurationMs, 50);
  });
});
