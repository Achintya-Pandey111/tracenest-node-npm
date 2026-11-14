'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const TraceNest = require('../src/index');

describe('High Concurrency & Async Context Isolation', () => {
  beforeEach(() => {
    TraceNest.reset();
    TraceNest.start();
  });

  test('should handle hundreds of concurrent asynchronous operations without leaking context', async () => {
    const concurrency = 100;
    const tasks = [];

    for (let i = 0; i < concurrency; i++) {
      const taskId = i;
      tasks.push(
        TraceNest.trace(`Parent_${taskId}`, async () => {
          const delay = Math.floor(Math.random() * 10) + 1;
          await new Promise(r => setTimeout(r, delay));

          return TraceNest.trace(`Child_${taskId}`, async () => {
            await new Promise(r => setTimeout(r, 2));
            return taskId * 10;
          });
        })
      );
    }

    const results = await Promise.all(tasks);
    assert.strictEqual(results.length, concurrency);

    for (let i = 0; i < concurrency; i++) {
      assert.strictEqual(results[i], i * 10);
    }

    const ops = TraceNest.store.getOperations();
    assert.strictEqual(ops.length, concurrency * 2);

    // Verify each child has exactly its corresponding parent
    for (let i = 0; i < concurrency; i++) {
      const parent = ops.find(o => o.name === `Parent_${i}`);
      const child = ops.find(o => o.name === `Child_${i}`);

      assert.ok(parent, `Parent_${i} must exist`);
      assert.ok(child, `Child_${i} must exist`);
      assert.strictEqual(child.parentId, parent.id, `Child_${i} must have Parent_${i} as parent`);
      assert.strictEqual(parent.parentId, null, `Parent_${i} must be a root`);
    }
  });

  test('should handle deep nesting levels correctly', async () => {
    const maxDepth = 6;

    async function recurse(currentDepth) {
      if (currentDepth > maxDepth) return currentDepth;
      return TraceNest.trace(`DepthLevel_${currentDepth}`, async () => {
        return recurse(currentDepth + 1);
      });
    }

    await recurse(1);

    const ops = TraceNest.store.getOperations();
    assert.strictEqual(ops.length, maxDepth);

    for (let d = 1; d <= maxDepth; d++) {
      const op = ops.find(o => o.name === `DepthLevel_${d}`);
      assert.ok(op);
      assert.strictEqual(op.depth, d - 1);
      if (d > 1) {
        const parent = ops.find(o => o.name === `DepthLevel_${d - 1}`);
        assert.strictEqual(op.parentId, parent.id);
      }
    }
  });
});
