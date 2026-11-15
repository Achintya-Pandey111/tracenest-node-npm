'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { calculateStatistics, getPercentile } = require('../src/analysis/statistics');
const { detectSlowOperations, buildOperationTree } = require('../src/analysis/slowOperations');

describe('Performance Statistics & Analysis', () => {
  test('should safely handle empty operations and events', () => {
    const stats = calculateStatistics([], []);
    assert.strictEqual(stats.totalOperations, 0);
    assert.strictEqual(stats.successfulOperations, 0);
    assert.strictEqual(stats.failedOperations, 0);
    assert.strictEqual(stats.averageDurationMs, 0);
    assert.strictEqual(stats.minDurationMs, 0);
    assert.strictEqual(stats.maxDurationMs, 0);
    assert.strictEqual(stats.successRate, 100);
    assert.strictEqual(stats.percentiles.p50, 0);

    const slow = detectSlowOperations([], 100);
    assert.deepStrictEqual(slow, []);

    const tree = buildOperationTree([]);
    assert.deepStrictEqual(tree, []);
  });

  test('should accurately calculate average, min, max and percentiles', () => {
    const dummyOps = [
      { id: '1', name: 'op1', status: 'SUCCESS', durationMs: 10, startTime: 100, endTime: 110 },
      { id: '2', name: 'op2', status: 'SUCCESS', durationMs: 20, startTime: 120, endTime: 140 },
      { id: '3', name: 'op3', status: 'ERROR', durationMs: 30, startTime: 150, endTime: 180 },
      { id: '4', name: 'op4', status: 'SUCCESS', durationMs: 40, startTime: 200, endTime: 240 }
    ];

    const stats = calculateStatistics(dummyOps, []);
    assert.strictEqual(stats.totalOperations, 4);
    assert.strictEqual(stats.successfulOperations, 3);
    assert.strictEqual(stats.failedOperations, 1);
    assert.strictEqual(stats.successRate, 75);
    assert.strictEqual(stats.averageDurationMs, 25);
    assert.strictEqual(stats.minDurationMs, 10);
    assert.strictEqual(stats.maxDurationMs, 40);
    // [10, 20, 30, 40] -> Median (P50) is 25, P90 is 37
    assert.strictEqual(stats.percentiles.p50, 25);
    assert.strictEqual(stats.percentiles.p90, 37);
  });

  test('should detect slow operations matching threshold', () => {
    const dummyOps = [
      { id: '1', name: 'fastOp', status: 'SUCCESS', durationMs: 15 },
      { id: '2', name: 'slowOp1', status: 'SUCCESS', durationMs: 120 },
      { id: '3', name: 'slowOp2', status: 'SUCCESS', durationMs: 350 }
    ];

    const slow = detectSlowOperations(dummyOps, 100);
    assert.strictEqual(slow.length, 2);
    // Should be sorted descending
    assert.strictEqual(slow[0].name, 'slowOp2');
    assert.strictEqual(slow[0].durationMs, 350);
    assert.strictEqual(slow[1].name, 'slowOp1');
    assert.strictEqual(slow[1].durationMs, 120);
  });

  test('should build hierarchical tree accurately', () => {
    const dummyOps = [
      { id: 'root1', parentId: null, name: 'Root 1', depth: 0, status: 'SUCCESS' },
      { id: 'child1', parentId: 'root1', name: 'Child 1', depth: 1, status: 'SUCCESS' },
      { id: 'grandchild1', parentId: 'child1', name: 'Grandchild 1', depth: 2, status: 'SUCCESS' },
      { id: 'root2', parentId: null, name: 'Root 2', depth: 0, status: 'SUCCESS' }
    ];

    const tree = buildOperationTree(dummyOps);
    assert.strictEqual(tree.length, 2); // Two root nodes
    assert.strictEqual(tree[0].name, 'Root 1');
    assert.strictEqual(tree[0].children.length, 1);
    assert.strictEqual(tree[0].children[0].name, 'Child 1');
    assert.strictEqual(tree[0].children[0].children.length, 1);
    assert.strictEqual(tree[0].children[0].children[0].name, 'Grandchild 1');
    assert.strictEqual(tree[1].name, 'Root 2');
    assert.strictEqual(tree[1].children.length, 0);
  });
});
