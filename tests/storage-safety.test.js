'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const TraceNest = require('../src/index');

describe('Event Storage Safety & Memory Bounding', () => {
  beforeEach(() => {
    TraceNest.reset();
  });

  test('should bound events and operations to configured maximums', () => {
    const tracer = TraceNest.createTracer({
      maxEvents: 50,
      maxOperations: 30
    });
    tracer.start();

    // Generate excessive events and operations (300 operations, 600 events)
    for (let i = 0; i < 300; i++) {
      tracer.trace(`Op_${i}`, () => {
        tracer.track(`Marker_${i}`);
      });
    }

    const events = tracer.store.getEvents();
    const ops = tracer.store.getOperations();
    const size = tracer.store.size();

    // Verify hard memory caps
    assert.ok(events.length <= 50, `Events count ${events.length} must not exceed maxEvents 50`);
    assert.ok(ops.length <= 30, `Operations count ${ops.length} must not exceed maxOperations 30`);

    // Verify drop counters tracked accurately
    assert.ok(size.droppedEventsCount > 0, 'Must record dropped events count');
    assert.ok(size.droppedOperationsCount > 0, 'Must record dropped operations count');
    assert.strictEqual(size.totalOperationsRecorded, 300);
  });

  test('should generate valid report after event and operation limits are reached', () => {
    const tracer = TraceNest.createTracer({
      maxEvents: 20,
      maxOperations: 15
    });
    tracer.start();

    for (let i = 0; i < 100; i++) {
      tracer.trace(`OverflowOp_${i}`, () => {
        tracer.track(`Point_${i}`);
      });
    }

    // Report generation must not crash or produce invalid data
    const reportData = tracer.getReportData();
    assert.ok(reportData);
    assert.ok(reportData.summary);
    assert.ok(reportData.operations.length <= 15);
    assert.ok(reportData.events.length <= 20);

    const rendered = tracer.report({ silent: true, color: false });
    assert.ok(typeof rendered === 'string');
    assert.ok(rendered.includes('TRACENEST EXECUTION REPORT'));
  });

  test('should completely reset store, counters, and trace state', () => {
    TraceNest.start();
    for (let i = 0; i < 50; i++) {
      TraceNest.track(`Event_${i}`);
      const op = TraceNest.begin(`Op_${i}`);
      op.end();
    }

    assert.ok(TraceNest.store.size().eventsCount > 0);
    assert.ok(TraceNest.store.size().operationsCount > 0);
    assert.ok(TraceNest.traceId);

    // Call reset
    TraceNest.reset();

    const size = TraceNest.store.size();
    assert.strictEqual(size.eventsCount, 0);
    assert.strictEqual(size.operationsCount, 0);
    assert.strictEqual(size.totalEventsRecorded, 0);
    assert.strictEqual(size.droppedEventsCount, 0);
    assert.strictEqual(size.totalOperationsRecorded, 0);
    assert.strictEqual(size.droppedOperationsCount, 0);
    assert.strictEqual(TraceNest.traceId, null);
    assert.strictEqual(TraceNest.isEnabled(), false);
  });
});
