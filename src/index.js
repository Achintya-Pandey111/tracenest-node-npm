'use strict';

const { Tracer } = require('./core/tracer');
const { Operation, OperationStatus } = require('./core/operation');
const { TraceEvent, EventTypes } = require('./core/event');
const { ContextManager } = require('./core/context');
const { EventStore } = require('./core/eventStore');
const { calculateStatistics } = require('./analysis/statistics');
const { detectSlowOperations, buildOperationTree } = require('./analysis/slowOperations');
const { ConsoleReporter } = require('./reporters/consoleReporter');
const { JsonReporter } = require('./reporters/jsonReporter');
const { createExpressMiddleware, createExpressErrorMiddleware } = require('./integrations/express');

// Default global singleton tracer
const defaultTracer = new Tracer();

// Bind all methods to preserve `this` context when destructured
const TraceNest = {
  // Main tracing methods
  start: defaultTracer.start.bind(defaultTracer),
  stop: defaultTracer.stop.bind(defaultTracer),
  reset: defaultTracer.reset.bind(defaultTracer),
  configure: defaultTracer.configure.bind(defaultTracer),
  isEnabled: defaultTracer.isEnabled.bind(defaultTracer),
  getActiveOperation: defaultTracer.getActiveOperation.bind(defaultTracer),
  track: defaultTracer.track.bind(defaultTracer),
  begin: defaultTracer.begin.bind(defaultTracer),
  trace: defaultTracer.trace.bind(defaultTracer),
  report: defaultTracer.report.bind(defaultTracer),
  exportJSON: defaultTracer.exportJSON.bind(defaultTracer),
  getReportData: defaultTracer.getReportData.bind(defaultTracer),
  expressMiddleware: defaultTracer.expressMiddleware.bind(defaultTracer),
  expressErrorMiddleware: () => createExpressErrorMiddleware(defaultTracer),

  // Properties
  get traceId() {
    return defaultTracer.traceId;
  },
  get enabled() {
    return defaultTracer.enabled;
  },
  get store() {
    return defaultTracer.store;
  },

  // Export classes and helpers for advanced / customized use
  Tracer,
  Operation,
  OperationStatus,
  TraceEvent,
  EventTypes,
  ContextManager,
  EventStore,
  calculateStatistics,
  detectSlowOperations,
  buildOperationTree,
  ConsoleReporter,
  JsonReporter,
  createExpressMiddleware,
  createExpressErrorMiddleware,

  /**
   * Factory function to create a new isolated Tracer instance.
   * @param {object} [options]
   * @returns {Tracer}
   */
  createTracer: (options) => new Tracer(options)
};

module.exports = TraceNest;
