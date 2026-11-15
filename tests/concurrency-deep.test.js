'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const TraceNest = require('../src/index');

describe('Concurrent Async Tracing & Hierarchy Integrity', () => {
  beforeEach(() => {
    TraceNest.reset();
    TraceNest.start({ name: 'ConcurrencyDeepTests' });
  });

  test('should maintain correct hierarchy when concurrent tasks complete in reverse order', async () => {
    await TraceNest.trace('Parent Scope', async () => {
      // 3 concurrent operations completing out of order:
      // Op 1 takes 40ms, Op 2 takes 20ms, Op 3 takes 5ms
      await Promise.all([
        TraceNest.trace('Slow Child 1', async () => {
          await new Promise(r => setTimeout(r, 40));
          return 'c1';
        }),
        TraceNest.trace('Medium Child 2', async () => {
          await new Promise(r => setTimeout(r, 20));
          return 'c2';
        }),
        TraceNest.trace('Fast Child 3', async () => {
          await new Promise(r => setTimeout(r, 5));
          return 'c3';
        })
      ]);
    });

    const ops = TraceNest.store.getOperations();
    assert.strictEqual(ops.length, 4);

    const parent = ops.find(o => o.name === 'Parent Scope');
    const c1 = ops.find(o => o.name === 'Slow Child 1');
    const c2 = ops.find(o => o.name === 'Medium Child 2');
    const c3 = ops.find(o => o.name === 'Fast Child 3');

    assert.ok(parent);
    assert.ok(c1 && c2 && c3);

    // Verify all children point to the same parent regardless of completion order
    assert.strictEqual(c1.parentId, parent.id);
    assert.strictEqual(c2.parentId, parent.id);
    assert.strictEqual(c3.parentId, parent.id);

    // Verify parent has recorded all 3 children
    assert.strictEqual(parent.children.length, 3);
    assert.ok(parent.children.includes(c1.id));
    assert.ok(parent.children.includes(c2.id));
    assert.ok(parent.children.includes(c3.id));

    // Verify operation hierarchy tree structure
    const tree = TraceNest.getReportData().tree;
    assert.strictEqual(tree.length, 1);
    assert.strictEqual(tree[0].id, parent.id);
    assert.strictEqual(tree[0].children.length, 3);
  });

  test('should guarantee 100% unique operation IDs across 500 concurrent operations', async () => {
    const totalOps = 500;
    const tasks = [];

    for (let i = 0; i < totalOps; i++) {
      tasks.push(
        TraceNest.trace(`ConcurrentOp_${i}`, async () => {
          await new Promise(r => setTimeout(r, Math.floor(Math.random() * 5) + 1));
          return i;
        })
      );
    }

    await Promise.all(tasks);

    const ops = TraceNest.store.getOperations();
    assert.strictEqual(ops.length, totalOps);

    const idSet = new Set(ops.map(o => o.id));
    assert.strictEqual(idSet.size, totalOps, 'All operation IDs must be strictly unique');
  });

  test('should not leak context across concurrent branches with sub-operations', async () => {
    async function branch(branchName) {
      return TraceNest.trace(`Branch_${branchName}`, async () => {
        TraceNest.track(`Start of ${branchName}`);
        await new Promise(r => setTimeout(r, Math.floor(Math.random() * 15) + 5));

        const subResult = await TraceNest.trace(`Sub_${branchName}`, async () => {
          await new Promise(r => setTimeout(r, 5));
          return `${branchName}_sub`;
        });

        TraceNest.track(`End of ${branchName}`);
        return subResult;
      });
    }

    const branches = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
    const results = await Promise.all(branches.map(b => branch(b)));

    assert.deepStrictEqual(results, [
      'Alpha_sub',
      'Beta_sub',
      'Gamma_sub',
      'Delta_sub',
      'Epsilon_sub'
    ]);

    const ops = TraceNest.store.getOperations();

    for (const b of branches) {
      const parentOp = ops.find(o => o.name === `Branch_${b}`);
      const childOp = ops.find(o => o.name === `Sub_${b}`);

      assert.ok(parentOp, `Branch_${b} must exist`);
      assert.ok(childOp, `Sub_${b} must exist`);
      assert.strictEqual(childOp.parentId, parentOp.id, `Sub_${b} must belong strictly to Branch_${b}`);
      assert.strictEqual(parentOp.parentId, null, `Branch_${b} must be root`);
    }
  });
});
