'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const TraceNest = require('../src/index');

describe('Edge Cases & Defensive Behaviors', () => {
  beforeEach(() => {
    TraceNest.reset();
  });

  test('should handle tracing before start() is called', () => {
    // Tracing is disabled by default
    const result = TraceNest.trace('Pre-start Task', () => {
      TraceNest.track('Pre-start checkpoint');
      return 'done';
    });

    assert.strictEqual(result, 'done');
    // Store should not record events when not started
    assert.strictEqual(TraceNest.store.getEvents().length, 0);
  });

  test('should handle empty reports without throwing', () => {
    const rendered = TraceNest.report({ silent: true });
    assert.ok(typeof rendered === 'string');
    assert.ok(rendered.includes('Total Operations:      0'));

    const data = TraceNest.getReportData();
    assert.strictEqual(data.summary.totalOperations, 0);
    assert.deepStrictEqual(data.slowOperations, []);
    assert.deepStrictEqual(data.tree, []);
  });

  test('should handle repeated start() calls gracefully', () => {
    TraceNest.start({ name: 'FirstStart' });
    const initialTraceId = TraceNest.traceId;

    // Second start without reset should preserve session
    TraceNest.start();
    assert.strictEqual(TraceNest.traceId, initialTraceId);
    assert.strictEqual(TraceNest.isEnabled(), true);
  });

  test('should handle invalid or null operation names', () => {
    TraceNest.start();
    const op1 = TraceNest.begin(null);
    op1.end();
    assert.strictEqual(op1.name, 'unnamed_operation');

    const op2 = TraceNest.begin(undefined);
    op2.end();
    assert.strictEqual(op2.name, 'unnamed_operation');

    TraceNest.track(null);
    const events = TraceNest.store.getEvents();
    const lastEvent = events[events.length - 1];
    assert.strictEqual(lastEvent.name, 'unnamed_event');
  });

  test('should throw TypeError when trace is passed non-function', () => {
    TraceNest.start();
    assert.throws(() => {
      TraceNest.trace('Bad Call', null);
    }, TypeError);

    assert.throws(() => {
      TraceNest.trace('Bad Call 2', 12345);
    }, TypeError);
  });

  test('should handle invalid configuration arguments gracefully', () => {
    TraceNest.configure(null);
    TraceNest.configure('invalid');
    TraceNest.configure({ slowOperationThresholdMs: -10 }); // should ignore negative
    assert.strictEqual(TraceNest.isEnabled(), false);
  });

  test('should handle exportJSON with invalid file path', () => {
    assert.throws(() => {
      TraceNest.exportJSON(null);
    }, TypeError);

    assert.throws(() => {
      TraceNest.exportJSON('');
    }, TypeError);
  });
});
