'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const TraceNest = require('../src/index');

describe('Failure Tracing & Error Propagation', () => {
  beforeEach(() => {
    TraceNest.reset();
    TraceNest.start({ name: 'FailureTracingTests' });
  });

  test('should record failed status, message, and duration when operation throws Error', async () => {
    let thrownError = null;

    try {
      await TraceNest.trace('Failing Database Query', async () => {
        await new Promise(r => setTimeout(r, 20));
        throw new Error('Connection pool exhausted');
      });
    } catch (err) {
      thrownError = err;
    }

    assert.ok(thrownError, 'Error must propagate to caller');
    assert.strictEqual(thrownError.message, 'Connection pool exhausted');

    const ops = TraceNest.store.getOperations();
    assert.strictEqual(ops.length, 1);
    const op = ops[0];

    assert.strictEqual(op.status, 'ERROR');
    assert.ok(typeof op.durationMs === 'number');
    assert.ok(op.durationMs >= 15, `Duration ${op.durationMs}ms should be >= 15ms`);
    assert.ok(op.error);
    assert.strictEqual(op.error.message, 'Connection pool exhausted');
    assert.ok(op.error.stack);
  });

  test('should record status ERROR when non-Error or falsy values are thrown', () => {
    // 1. Throwing string
    assert.throws(() => {
      TraceNest.trace('Throw String', () => {
        // eslint-disable-next-line no-throw-literal
        throw 'String error message';
      });
    }, /String error message/);

    // 2. Throwing number
    assert.throws(() => {
      TraceNest.trace('Throw Number', () => {
        // eslint-disable-next-line no-throw-literal
        throw 500;
      });
    }, (err) => err === 500);

    // 3. Throwing null
    assert.throws(() => {
      TraceNest.trace('Throw Null', () => {
        // eslint-disable-next-line no-throw-literal
        throw null;
      });
    }, (err) => err === null);

    const ops = TraceNest.store.getOperations();
    assert.strictEqual(ops.length, 3);

    for (const op of ops) {
      assert.strictEqual(op.status, 'ERROR', `${op.name} must be marked as ERROR`);
      assert.ok(op.error, `${op.name} must have serialized error`);
      assert.ok(typeof op.durationMs === 'number');
    }
  });

  test('should propagate error to unhandled parent so both child and parent are marked ERROR', async () => {
    let errorCaughtInCaller = false;

    try {
      await TraceNest.trace('Parent Unhandled', async () => {
        await TraceNest.trace('Child Error', async () => {
          await new Promise(r => setTimeout(r, 10));
          throw new Error('Critical service crash');
        });
      });
    } catch (err) {
      errorCaughtInCaller = true;
      assert.strictEqual(err.message, 'Critical service crash');
    }

    assert.strictEqual(errorCaughtInCaller, true);

    const ops = TraceNest.store.getOperations();
    assert.strictEqual(ops.length, 2);

    const parent = ops.find(o => o.name === 'Parent Unhandled');
    const child = ops.find(o => o.name === 'Child Error');

    assert.ok(parent);
    assert.ok(child);
    assert.strictEqual(child.status, 'ERROR');
    assert.strictEqual(parent.status, 'ERROR');
    assert.strictEqual(child.parentId, parent.id);
  });

  test('should allow parent to reflect SUCCESS when parent catches and handles child error', async () => {
    let fallbackExecuted = false;

    await TraceNest.trace('Resilient Parent Handler', async () => {
      try {
        await TraceNest.trace('Primary Service Call', async () => {
          throw new Error('Timeout on primary');
        });
      } catch (childErr) {
        // Handled gracefully by falling back to backup
        fallbackExecuted = true;
        await TraceNest.trace('Backup Service Call', async () => {
          return 'backup_ok';
        });
      }
    });

    assert.strictEqual(fallbackExecuted, true);

    const ops = TraceNest.store.getOperations();
    assert.strictEqual(ops.length, 3);

    const parent = ops.find(o => o.name === 'Resilient Parent Handler');
    const primary = ops.find(o => o.name === 'Primary Service Call');
    const backup = ops.find(o => o.name === 'Backup Service Call');

    assert.strictEqual(primary.status, 'ERROR');
    assert.strictEqual(backup.status, 'SUCCESS');
    assert.strictEqual(parent.status, 'SUCCESS', 'Handled parent should reflect SUCCESS');
    assert.strictEqual(primary.parentId, parent.id);
    assert.strictEqual(backup.parentId, parent.id);
  });

  test('should display failed operations and error details in console report', () => {
    try {
      TraceNest.trace('Crashing Job', () => {
        throw new Error('Fatal syntax in query');
      });
    } catch (_) {}

    const reportOutput = TraceNest.report({ silent: true, color: false });
    assert.ok(reportOutput.includes('Failed Operations:     1'));
    assert.ok(reportOutput.includes('--- Failed Operations ---'));
    assert.ok(reportOutput.includes('[FAILED] Crashing Job'));
    assert.ok(reportOutput.includes('Fatal syntax in query'));
  });
});
