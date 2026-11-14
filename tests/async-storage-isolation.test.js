'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const TraceNest = require('../src/index');

describe('AsyncLocalStorage Context Isolation', () => {
  beforeEach(() => {
    TraceNest.reset();
    TraceNest.start({ name: 'ContextIsolationTests' });
  });

  test('should propagate context through setTimeout inside an operation', async () => {
    await TraceNest.trace('Timeout Outer', async () => {
      await new Promise(resolve => {
        setTimeout(async () => {
          await TraceNest.trace('Timeout Inner', async () => {
            const active = TraceNest.getActiveOperation();
            assert.ok(active);
            assert.strictEqual(active.name, 'Timeout Inner');
            assert.strictEqual(active.depth, 1);
          });
          resolve();
        }, 10);
      });
    });

    const ops = TraceNest.store.getOperations();
    const outer = ops.find(o => o.name === 'Timeout Outer');
    const inner = ops.find(o => o.name === 'Timeout Inner');

    assert.ok(outer && inner);
    assert.strictEqual(inner.parentId, outer.id);
  });

  test('should isolate independent tasks scheduled via setTimeout without parent sharing', async () => {
    const task1Promise = new Promise(resolve => {
      setTimeout(async () => {
        await TraceNest.trace('Scheduled Task 1', async () => {
          assert.strictEqual(TraceNest.getActiveOperation().parentId, null);
        });
        resolve();
      }, 10);
    });

    const task2Promise = new Promise(resolve => {
      setTimeout(async () => {
        await TraceNest.trace('Scheduled Task 2', async () => {
          assert.strictEqual(TraceNest.getActiveOperation().parentId, null);
        });
        resolve();
      }, 10);
    });

    await Promise.all([task1Promise, task2Promise]);

    const ops = TraceNest.store.getOperations();
    const t1 = ops.find(o => o.name === 'Scheduled Task 1');
    const t2 = ops.find(o => o.name === 'Scheduled Task 2');

    assert.ok(t1 && t2);
    assert.strictEqual(t1.parentId, null);
    assert.strictEqual(t2.parentId, null);
    assert.notStrictEqual(t1.id, t2.id);
  });

  test('should preserve context across chained promise then/catch blocks', async () => {
    await TraceNest.trace('Chained Promise Root', () => {
      return Promise.resolve(10)
        .then(val => {
          return TraceNest.trace('Step 1', () => val * 2);
        })
        .then(val => {
          return TraceNest.trace('Step 2', () => val + 5);
        });
    });

    const ops = TraceNest.store.getOperations();
    const root = ops.find(o => o.name === 'Chained Promise Root');
    const s1 = ops.find(o => o.name === 'Step 1');
    const s2 = ops.find(o => o.name === 'Step 2');

    assert.ok(root && s1 && s2);
    assert.strictEqual(s1.parentId, root.id);
    assert.strictEqual(s2.parentId, root.id);
  });
});
