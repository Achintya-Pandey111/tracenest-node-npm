'use strict';

const { ContextManager } = require('./context');
const { EventStore } = require('./eventStore');
const { Operation } = require('./operation');
const { TraceEvent, EventTypes } = require('./event');
const { createTraceId } = require('../utils/identifiers');
const { calculateStatistics } = require('../analysis/statistics');
const { detectSlowOperations, buildOperationTree } = require('../analysis/slowOperations');
const { ConsoleReporter } = require('../reporters/consoleReporter');
const { JsonReporter } = require('../reporters/jsonReporter');

class Tracer {
  /**
   * @param {object} [options]
   */
  constructor(options = {}) {
    this.options = {
      slowOperationThresholdMs: 100,
      maxEvents: 10000,
      maxOperations: 10000,
      autoWarnSlowOperations: false,
      name: 'default',
      ...options
    };

    this.enabled = false;
    this.traceId = null;
    this.contextManager = new ContextManager();
    this.store = new EventStore({
      maxEvents: this.options.maxEvents,
      maxOperations: this.options.maxOperations
    });
    this.consoleReporter = new ConsoleReporter();
    this.jsonReporter = new JsonReporter();
    this._sessionStarted = false;
  }

  /**
   * Starts or enables tracing session.
   * @param {object} [options]
   * @returns {Tracer} this
   */
  start(options = {}) {
    this.configure(options);
    this.enabled = true;

    if (!this.traceId) {
      this.traceId = options.traceId || createTraceId();
    }

    if (!this._sessionStarted) {
      this._sessionStarted = true;
      const startEvent = new TraceEvent({
        traceId: this.traceId,
        type: EventTypes.START,
        name: `Trace session started: ${this.options.name || 'default'}`,
        timestamp: Date.now(),
        depth: 0
      });
      this.store.addEvent(startEvent);
    }

    return this;
  }

  /**
   * Disables tracing without resetting data.
   * @returns {Tracer} this
   */
  stop() {
    if (this.enabled && this.traceId) {
      const endEvent = new TraceEvent({
        traceId: this.traceId,
        type: EventTypes.END,
        name: `Trace session stopped: ${this.options.name || 'default'}`,
        timestamp: Date.now(),
        depth: 0
      });
      this.store.addEvent(endEvent);
    }
    this.enabled = false;
    return this;
  }

  /**
   * Resets all stored events, operations, and trace session state.
   * @returns {Tracer} this
   */
  reset() {
    this.enabled = false;
    this.store.clear();
    this.traceId = null;
    this._sessionStarted = false;
    return this;
  }

  /**
   * Reconfigures tracer options.
   * @param {object} options
   * @returns {Tracer} this
   */
  configure(options = {}) {
    if (typeof options !== 'object' || options === null) {
      return this;
    }

    if (typeof options.slowOperationThresholdMs === 'number' && options.slowOperationThresholdMs >= 0) {
      this.options.slowOperationThresholdMs = options.slowOperationThresholdMs;
    }
    if (typeof options.maxEvents === 'number' && options.maxEvents > 0) {
      this.options.maxEvents = options.maxEvents;
      this.store.configure({ maxEvents: options.maxEvents });
    }
    if (typeof options.maxOperations === 'number' && options.maxOperations > 0) {
      this.options.maxOperations = options.maxOperations;
      this.store.configure({ maxOperations: options.maxOperations });
    }
    if (typeof options.autoWarnSlowOperations === 'boolean') {
      this.options.autoWarnSlowOperations = options.autoWarnSlowOperations;
    }
    if (typeof options.name === 'string') {
      this.options.name = options.name;
    }
    if (typeof options.enabled === 'boolean') {
      this.enabled = options.enabled;
    }

    return this;
  }

  /**
   * Returns whether tracing is currently enabled.
   * @returns {boolean}
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Returns currently active operation from execution context.
   * @returns {Operation|null}
   */
  getActiveOperation() {
    return this.contextManager.getActiveOperation();
  }

  /**
   * Records a point-in-time tracking event in the current execution context.
   * @param {string} name Event description/name
   * @param {object} [metadata] Custom event metadata
   * @returns {TraceEvent|null}
   */
  track(name, metadata) {
    if (!this.enabled) return null;

    const activeOp = this.contextManager.getActiveOperation();
    const traceId = (activeOp && activeOp.traceId) || this.traceId || createTraceId();
    const depth = activeOp ? activeOp.depth + 1 : 0;

    const event = new TraceEvent({
      traceId,
      operationId: activeOp ? activeOp.id : null,
      parentOperationId: activeOp ? activeOp.id : null,
      type: EventTypes.TRACK,
      name: String(name || 'unnamed_event'),
      depth,
      metadata
    });

    this.store.addEvent(event);
    return event;
  }

  /**
   * Manually begins a new timed operation.
   * @param {string} name Operation name
   * @param {object} [metadata] Custom operation metadata
   * @returns {Operation} The created operation
   */
  begin(name, metadata = {}) {
    const activeOp = this.contextManager.getActiveOperation();
    const traceId = (activeOp && activeOp.traceId) || this.traceId || createTraceId();
    const parentId = activeOp ? activeOp.id : null;
    const depth = activeOp ? activeOp.depth + 1 : 0;

    const operation = new Operation({
      traceId,
      parentId,
      name: String(name || 'unnamed_operation'),
      depth,
      metadata,
      store: this.enabled ? this.store : null,
      tracer: this
    });

    if (activeOp) {
      activeOp.addChild(operation.id);
    }

    if (this.enabled) {
      this.store.addOperation(operation);
      const callEvent = new TraceEvent({
        traceId,
        operationId: operation.id,
        parentOperationId: parentId,
        type: EventTypes.CALL,
        name: operation.name,
        depth,
        metadata: Object.keys(operation.metadata).length > 0 ? operation.metadata : undefined
      });
      this.store.addEvent(callEvent);
    }

    return operation;
  }

  /**
   * Traces a synchronous or asynchronous function execution.
   * Automatically tracks start, completion, duration, status, and nesting.
   * Preserves return values and re-throws errors without swallowing.
   *
   * @param {string} name Name of the operation
   * @param {Function} fn Function to execute
   * @param {object} [metadata] Optional metadata
   * @returns {Promise<any>|any}
   */
  trace(name, fn, metadata = {}) {
    if (typeof fn !== 'function') {
      throw new TypeError(`TraceNest.trace expects a function as second argument, got ${typeof fn}`);
    }

    if (!this.enabled) {
      return fn();
    }

    const activeOp = this.contextManager.getActiveOperation();
    const traceId = (activeOp && activeOp.traceId) || this.traceId || createTraceId();
    const parentId = activeOp ? activeOp.id : null;
    const depth = activeOp ? activeOp.depth + 1 : 0;

    const operation = new Operation({
      traceId,
      parentId,
      name: String(name || 'unnamed_operation'),
      depth,
      metadata,
      store: this.store,
      tracer: this
    });

    if (activeOp) {
      activeOp.addChild(operation.id);
    }

    this.store.addOperation(operation);

    // Record CALL event
    const callEvent = new TraceEvent({
      traceId,
      operationId: operation.id,
      parentOperationId: parentId,
      type: EventTypes.CALL,
      name: operation.name,
      depth,
      metadata: Object.keys(operation.metadata).length > 0 ? operation.metadata : undefined
    });
    this.store.addEvent(callEvent);

    const childContext = this.contextManager.createChildContext(operation);

    // Run inside async context
    return this.contextManager.run(childContext, () => {
      let result;
      try {
        result = fn();
      } catch (err) {
        operation.fail(err);
        throw err;
      }

      // Check if result is a Promise / Thenable
      if (result !== null && (typeof result === 'object' || typeof result === 'function') && typeof result.then === 'function') {
        return Promise.resolve(result)
          .then((val) => {
            operation.end(null);
            return val;
          })
          .catch((err) => {
            operation.fail(err);
            throw err;
          });
      }

      // Synchronous success
      operation.end(null);
      return result;
    });
  }

  /**
   * Compiles and returns all report data as a structured object.
   * @param {object} [options]
   * @returns {object}
   */
  getReportData(options = {}) {
    const operations = this.store.getOperations();
    const events = this.store.getEvents();
    const summary = calculateStatistics(operations, events);
    const threshold = (options && options.slowOperationThresholdMs !== undefined)
      ? options.slowOperationThresholdMs
      : this.options.slowOperationThresholdMs;
    const slowOperations = detectSlowOperations(operations, threshold);
    const tree = buildOperationTree(operations);

    // Collect errors
    const errors = [];
    for (const op of operations) {
      if (op.status === 'ERROR' && op.error) {
        errors.push({
          operationId: op.id,
          name: op.name,
          error: op.error,
          durationMs: op.durationMs,
          timestamp: op.endTime || op.startTime
        });
      }
    }

    return {
      tracenestVersion: require('../../package.json').version,
      traceId: this.traceId,
      name: this.options.name,
      timestamp: new Date().toISOString(),
      summary,
      slowOperations,
      tree,
      operations: operations.map(op => typeof op.toJSON === 'function' ? op.toJSON() : op),
      events: events.map(e => typeof e.toJSON === 'function' ? e.toJSON() : e),
      errors,
      storeStats: this.store.size()
    };
  }

  /**
   * Generates and prints the console execution report.
   * @param {object} [options]
   * @returns {string} Rendered text output
   */
  report(options = {}) {
    const reportData = this.getReportData(options);
    if (!options.silent) {
      this.consoleReporter.print(reportData, options);
    }
    return this.consoleReporter.render(reportData, options);
  }

  /**
   * Exports full trace data as a JSON file.
   * @param {string} filePath Target file path
   * @param {object} [options]
   * @returns {string} Resolved file path
   */
  exportJSON(filePath, options = {}) {
    const reportData = this.getReportData(options);
    return this.jsonReporter.export(filePath, reportData, options);
  }

  /**
   * Express middleware factory.
   * @param {object} [options]
   * @returns {Function} Express middleware (req, res, next)
   */
  expressMiddleware(options = {}) {
    const { createExpressMiddleware } = require('../integrations/express');
    return createExpressMiddleware(this, options);
  }
}

module.exports = {
  Tracer
};
