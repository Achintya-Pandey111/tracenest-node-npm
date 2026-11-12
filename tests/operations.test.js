'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const TraceNest = require('../src/index');

describe('Operation Tracking & Wrappers', () => {
  beforeEach(() => {
    TraceNest.reset();
    TraceNest.start();
  });

  test('should manually begin and end an operation', async () => {
    const op = TraceNest.begin('Manual Fetch Users');
    assert.strictEqual(op.name, 'Manual Fetch Users');
    assert.strictEqual(op.status, 'RUNNING');
    assert.strictEqual(op.endTime, null);

    await new Promise(r => setTimeout(r, 20));

    op.end();
    assert.strictEqual(op.status, 'SUCCESS');
    assert.ok(typeof op.durationMs === 'number');
    assert.ok(op.durationMs >= 15, `Duration ${op.durationMs}ms should be >= 15ms`);
    assert.ok(op.endTime >= op.startTime);
  });

  test('should trace synchronous functions and preserve return value', () => {
    const result = TraceNest.trace('Calculate Total', () => {
      TraceNest.track('Starting calculation');
      return 42 * 2;
    });

    assert.strictEqual(result, 84);

    const ops = TraceNest.store.getOperations();
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(ops[0].name, 'Calculate Total');
    assert.strictEqual(ops[0].status, 'SUCCESS');
  });

  test('should trace asynchronous functions and preserve return value', async () => {
    const result = await TraceNest.trace('Async Fetch', async () => {
      await new Promise(r => setTimeout(r, 10));
      return { id: 101, name: 'Alice' };
    });

    assert.deepStrictEqual(result, { id: 101, name: 'Alice' });

    const ops = TraceNest.store.getOperations();
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(ops[0].name, 'Async Fetch');
    assert.strictEqual(ops[0].status, 'SUCCESS');
    assert.ok(ops[0].durationMs >= 8);
  });

  test('should track nested synchronous operations hierarchically', () => {
    TraceNest.trace('Parent Sync', () => {
      TraceNest.trace('Child Sync 1', () => {
        return 'child1';
      });
      TraceNest.trace('Child Sync 2', () => {
        return 'child2';
      });
    });

    const ops = TraceNest.store.getOperations();
    assert.strictEqual(ops.length, 3);

    const parent = ops.find(o => o.name === 'Parent Sync');
    const child1 = ops.find(o => o.name === 'Child Sync 1');
    const child2 = ops.find(o => o.name === 'Child Sync 2');

    assert.ok(parent);
    assert.ok(child1);
    assert.ok(child2);

    assert.strictEqual(child1.parentId, parent.id);
    assert.strictEqual(child2.parentId, parent.id);
    assert.strictEqual(child1.depth, 1);
    assert.strictEqual(child2.depth, 1);
    assert.strictEqual(parent.depth, 0);
    assert.deepStrictEqual(parent.children, [child1.id, child2.id]);
  });

  test('should track nested asynchronous operations hierarchically', async () => {
    await TraceNest.trace('Parent Async', async () => {
      await TraceNest.trace('Child Async 1', async () => {
        await new Promise(r => setTimeout(r, 15));
      });
      await TraceNest.trace('Child Async 2', async () => {
        await new Promise(r => setTimeout(r, 10));
      });
    });

    const ops = TraceNest.store.getOperations();
    assert.strictEqual(ops.length, 3);

    const parent = ops.find(o => o.name === 'Parent Async');
    const child1 = ops.find(o => o.name === 'Child Async 1');
    const child2 = ops.find(o => o.name === 'Child Async 2');

    assert.strictEqual(child1.parentId, parent.id);
    assert.strictEqual(child2.parentId, parent.id);
    assert.ok(parent.durationMs >= 20);
  });

  test('should allow annotating operations with custom data', () => {
    const op = TraceNest.begin('Data Processing');
    op.annotate('recordsCount', 1500);
    op.annotate({ batchId: 'b_99', format: 'csv' });
    op.end();

    assert.strictEqual(op.metadata.recordsCount, 1500);
    assert.strictEqual(op.metadata.batchId, 'b_99');
    assert.strictEqual(op.metadata.format, 'csv');
  });

  test('should ignore repeated calls to end() idempotently', () => {
    const op = TraceNest.begin('Idempotent Op');
    op.end();
    const duration1 = op.durationMs;
    const endTime1 = op.endTime;

    // Call end again
    op.end();
    assert.strictEqual(op.durationMs, duration1);
    assert.strictEqual(op.endTime, endTime1);
  });
});
