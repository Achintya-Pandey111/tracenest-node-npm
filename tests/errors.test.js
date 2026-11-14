'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const TraceNest = require('../src/index');

describe('Error Tracking & Propagation', () => {
  beforeEach(() => {
    TraceNest.reset();
    TraceNest.start();
  });

  test('should capture synchronous errors and re-throw', () => {
    let caughtError = null;

    try {
      TraceNest.trace('Sync Fail', () => {
        throw new Error('Database connection failed');
      });
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError);
    assert.strictEqual(caughtError.message, 'Database connection failed');

    const ops = TraceNest.store.getOperations();
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(ops[0].status, 'ERROR');
    assert.ok(ops[0].error);
    assert.strictEqual(ops[0].error.message, 'Database connection failed');
    assert.ok(ops[0].error.stack);
  });

  test('should capture asynchronous errors and re-throw', async () => {
    let caughtError = null;

    try {
      await TraceNest.trace('Async Fail', async () => {
        await new Promise(r => setTimeout(r, 10));
        const err = new TypeError('Invalid user payload');
        err.code = 'ERR_INVALID_PAYLOAD';
        throw err;
      });
    } catch (err) {
      caughtError = err;
    }

    assert.ok(caughtError);
    assert.strictEqual(caughtError.name, 'TypeError');
    assert.strictEqual(caughtError.message, 'Invalid user payload');

    const ops = TraceNest.store.getOperations();
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(ops[0].status, 'ERROR');
    assert.strictEqual(ops[0].error.code, 'ERR_INVALID_PAYLOAD');
    assert.strictEqual(ops[0].error.name, 'TypeError');
  });

  test('should handle nested errors where child fails but parent handles it', async () => {
    let childErrorHandled = false;

    await TraceNest.trace('Resilient Parent', async () => {
      try {
        await TraceNest.trace('Failing Service Call', async () => {
          throw new Error('Third party timeout');
        });
      } catch (err) {
        childErrorHandled = true;
      }
    });

    assert.strictEqual(childErrorHandled, true);

    const ops = TraceNest.store.getOperations();
    assert.strictEqual(ops.length, 2);

    const child = ops.find(o => o.name === 'Failing Service Call');
    const parent = ops.find(o => o.name === 'Resilient Parent');

    assert.strictEqual(child.status, 'ERROR');
    assert.strictEqual(parent.status, 'SUCCESS');
  });

  test('should manually fail an operation using op.fail(error)', () => {
    const op = TraceNest.begin('Manual Failure');
    op.fail(new Error('Manual error triggered'));

    assert.strictEqual(op.status, 'ERROR');
    assert.strictEqual(op.error.message, 'Manual error triggered');
  });

  test('should handle non-Error thrown values gracefully', () => {
    let caught = null;
    try {
      TraceNest.trace('Throw String', () => {
        // eslint-disable-next-line no-throw-literal
        throw 'Raw string error';
      });
    } catch (e) {
      caught = e;
    }

    assert.strictEqual(caught, 'Raw string error');
    const ops = TraceNest.store.getOperations();
    assert.strictEqual(ops[0].status, 'ERROR');
    assert.strictEqual(ops[0].error.message, 'Raw string error');
  });
});
