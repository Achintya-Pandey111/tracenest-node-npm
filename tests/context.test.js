'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const TraceNest = require('../src/index');

describe('AsyncLocalStorage Context Management', () => {
  beforeEach(() => {
    TraceNest.reset();
    TraceNest.start();
  });

  test('should propagate context through async/await and promises', async () => {
    await TraceNest.trace('Root Scope', async () => {
      const active1 = TraceNest.begin('Inner Step 1');
      assert.strictEqual(active1.depth, 1);
      active1.end();

      await new Promise(resolve => {
        setImmediate(async () => {
          await TraceNest.trace('Deferred Step', async () => {
            const currentOp = TraceNest.store.getOperations().find(o => o.name === 'Deferred Step');
            assert.ok(currentOp);
            assert.strictEqual(currentOp.depth, 1);
            assert.strictEqual(TraceNest.getActiveOperation().name, 'Deferred Step');
          });
          resolve();
        });
      });
    });
  });

  test('should preserve independent context between concurrent operations', async () => {
    async function task(name, delayMs) {
      return TraceNest.trace(`Task_${name}`, async () => {
        TraceNest.track(`Start of ${name}`);
        await new Promise(r => setTimeout(r, delayMs));

        await TraceNest.trace(`Subtask_${name}`, async () => {
          await new Promise(r => setTimeout(r, 10));
          TraceNest.track(`Inside subtask ${name}`);
        });

        TraceNest.track(`End of ${name}`);
        return name;
      });
    }

    // Run 3 independent concurrent tasks
    const [resA, resB, resC] = await Promise.all([
      task('A', 30),
      task('B', 15),
      task('C', 5)
    ]);

    assert.strictEqual(resA, 'A');
    assert.strictEqual(resB, 'B');
    assert.strictEqual(resC, 'C');

    const ops = TraceNest.store.getOperations();
    const taskA = ops.find(o => o.name === 'Task_A');
    const taskB = ops.find(o => o.name === 'Task_B');
    const taskC = ops.find(o => o.name === 'Task_C');

    const subA = ops.find(o => o.name === 'Subtask_A');
    const subB = ops.find(o => o.name === 'Subtask_B');
    const subC = ops.find(o => o.name === 'Subtask_C');

    // Verify correct parentage: Subtask_A must belong to Task_A, not Task_B or Task_C!
    assert.strictEqual(subA.parentId, taskA.id);
    assert.strictEqual(subB.parentId, taskB.id);
    assert.strictEqual(subC.parentId, taskC.id);

    // Verify root tasks have no parent
    assert.strictEqual(taskA.parentId, null);
    assert.strictEqual(taskB.parentId, null);
    assert.strictEqual(taskC.parentId, null);
  });

  test('should not leak context after operation completes', async () => {
    await TraceNest.trace('Scoped Operation', async () => {
      assert.ok(TraceNest.getActiveOperation());
      assert.strictEqual(TraceNest.getActiveOperation().name, 'Scoped Operation');
    });

    // Outside any trace block, active operation must be null
    assert.strictEqual(TraceNest.getActiveOperation(), null);
  });
});
