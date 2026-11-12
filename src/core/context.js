'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

/**
 * Manages async execution context for TraceNest using AsyncLocalStorage.
 */
class ContextManager {
  constructor() {
    this._storage = new AsyncLocalStorage();
  }

  /**
   * Runs a function within the specified trace context.
   * @param {object} context
   * @param {Function} fn
   * @returns {any}
   */
  run(context, fn) {
    return this._storage.run(context, fn);
  }

  /**
   * Returns current active context or undefined if outside context.
   * @returns {object|undefined}
   */
  get() {
    return this._storage.getStore();
  }

  /**
   * Returns currently active Operation instance if any.
   * @returns {import('./operation').Operation|null}
   */
  getActiveOperation() {
    const store = this.get();
    return (store && store.operation) || null;
  }

  /**
   * Returns current trace ID or null.
   * @returns {string|null}
   */
  getActiveTraceId() {
    const store = this.get();
    return (store && store.traceId) || null;
  }

  /**
   * Returns current nesting depth level.
   * @returns {number}
   */
  getActiveDepth() {
    const store = this.get();
    return store ? store.depth : 0;
  }

  /**
   * Creates a child context object for a new operation.
   * @param {import('./operation').Operation} operation
   * @param {object} [customFields]
   * @returns {object}
   */
  createChildContext(operation, customFields = {}) {
    return {
      traceId: operation.traceId,
      operationId: operation.id,
      operation,
      depth: operation.depth + 1,
      ...customFields
    };
  }
}

module.exports = {
  ContextManager
};
