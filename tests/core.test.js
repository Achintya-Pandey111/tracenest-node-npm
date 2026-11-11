'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const TraceNest = require('../src/index');

describe('TraceNest Core Engine', () => {
  beforeEach(() => {
    TraceNest.reset();
  });

  test('should start and enable tracing', () => {
    assert.strictEqual(TraceNest.isEnabled(), false);
    TraceNest.start();
    assert.strictEqual(TraceNest.isEnabled(), true);
    assert.ok(TraceNest.traceId);
    assert.match(TraceNest.traceId, /^trc_/);
  });

  test('should stop and disable tracing', () => {
    TraceNest.start();
    assert.strictEqual(TraceNest.isEnabled(), true);
    TraceNest.stop();
    assert.strictEqual(TraceNest.isEnabled(), false);
  });

  test('should reset stored events, operations and trace ID', () => {
    TraceNest.start();
    TraceNest.track('Test Event 1');
    const op = TraceNest.begin('Op 1');
    op.end();

    assert.ok(TraceNest.store.getEvents().length > 0);
    assert.ok(TraceNest.store.getOperations().length > 0);

    TraceNest.reset();
    assert.strictEqual(TraceNest.store.getEvents().length, 0);
    assert.strictEqual(TraceNest.store.getOperations().length, 0);
    assert.strictEqual(TraceNest.traceId, null);
  });

  test('should record TRACK events with metadata', () => {
    TraceNest.start();
    const event = TraceNest.track('Database connected', { host: 'localhost', port: 5432 });

    assert.ok(event);
    assert.strictEqual(event.name, 'Database connected');
    assert.strictEqual(event.type, 'TRACK');
    assert.deepStrictEqual(event.metadata, { host: 'localhost', port: 5432 });

    const allEvents = TraceNest.store.getEvents();
    const found = allEvents.find(e => e.name === 'Database connected');
    assert.ok(found);
  });

  test('should not record events when tracing is disabled', () => {
    TraceNest.stop();
    const event = TraceNest.track('Ignored event');
    assert.strictEqual(event, null);
  });

  test('should configure options dynamically', () => {
    TraceNest.configure({
      slowOperationThresholdMs: 250,
      maxEvents: 500,
      name: 'CustomApp'
    });

    const tracer = TraceNest.createTracer({
      slowOperationThresholdMs: 200,
      name: 'IsolatedTracer'
    });

    assert.strictEqual(tracer.options.slowOperationThresholdMs, 200);
    assert.strictEqual(tracer.options.name, 'IsolatedTracer');
  });

  test('should enforce maxEvents limit and record dropped count', () => {
    const tracer = TraceNest.createTracer({ maxEvents: 20 });
    tracer.start();

    for (let i = 0; i < 50; i++) {
      tracer.track(`Event ${i}`);
    }

    const events = tracer.store.getEvents();
    assert.ok(events.length <= 20, `Events count (${events.length}) should not exceed maxEvents 20`);
    const size = tracer.store.size();
    assert.ok(size.droppedEventsCount > 0, 'Should track dropped events');
    assert.strictEqual(size.totalEventsRecorded, 51); // 1 start event + 50 tracks
  });
});
