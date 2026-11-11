'use strict';

const { createEventId } = require('../utils/identifiers');

/**
 * Valid event types supported by TraceNest.
 */
const EventTypes = Object.freeze({
  START: 'START',
  TRACK: 'TRACK',
  CALL: 'CALL',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  WARNING: 'WARNING',
  END: 'END'
});

/**
 * Safely serializes an Error instance or thrown value into a clean JSON-friendly object.
 * Handles Error instances, primitives, null, undefined, and custom error-like objects.
 *
 * @param {unknown} err
 * @param {boolean} [includeStack=true]
 * @returns {object}
 */
function serializeError(err, includeStack = true) {
  if (err === null) {
    return { name: 'Error', message: 'Thrown error: null', stack: null };
  }
  if (err === undefined) {
    return { name: 'Error', message: 'Thrown error: undefined', stack: null };
  }
  if (typeof err === 'string') {
    return { name: 'Error', message: err, stack: null };
  }
  if (typeof err === 'number' || typeof err === 'boolean' || typeof err === 'symbol' || typeof err === 'bigint') {
    return { name: 'Error', message: String(err), stack: null };
  }

  const result = {
    name: err.name || 'Error',
    message: err.message !== undefined ? String(err.message) : String(err),
    code: err.code || undefined
  };

  if (includeStack && typeof err.stack === 'string') {
    result.stack = err.stack;
  } else {
    result.stack = null;
  }

  // Preserve any custom error properties (e.g. status, details, errno)
  for (const key of Object.keys(err)) {
    if (!['name', 'message', 'stack', 'code'].includes(key)) {
      try {
        result[key] = err[key];
      } catch (_) {
        // Skip un-serializable properties
      }
    }
  }

  return result;
}

/**
 * Represents an individual trace event.
 */
class TraceEvent {
  /**
   * @param {object} params
   * @param {string} [params.id]
   * @param {string} params.traceId
   * @param {string|null} [params.operationId]
   * @param {string|null} [params.parentOperationId]
   * @param {string} params.type
   * @param {string} params.name
   * @param {number} [params.timestamp]
   * @param {number|null} [params.durationMs]
   * @param {number} [params.depth]
   * @param {object} [params.metadata]
   * @param {object|Error|null} [params.error]
   */
  constructor({
    id = createEventId(),
    traceId,
    operationId = null,
    parentOperationId = null,
    type,
    name,
    timestamp = Date.now(),
    durationMs = null,
    depth = 0,
    metadata = undefined,
    error = null
  }) {
    this.id = id;
    this.traceId = traceId;
    this.operationId = operationId;
    this.parentOperationId = parentOperationId;
    this.type = type;
    this.name = String(name || 'unnamed_event');
    this.timestamp = timestamp;
    this.durationMs = durationMs !== null ? Number(durationMs) : null;
    this.depth = Math.max(0, depth);
    this.metadata = metadata && typeof metadata === 'object' ? { ...metadata } : undefined;
    this.error = error ? (typeof error === 'object' && error.name && error.message ? error : serializeError(error)) : null;
  }

  toJSON() {
    return {
      id: this.id,
      traceId: this.traceId,
      operationId: this.operationId,
      parentOperationId: this.parentOperationId,
      type: this.type,
      name: this.name,
      timestamp: this.timestamp,
      durationMs: this.durationMs,
      depth: this.depth,
      ...(this.metadata ? { metadata: this.metadata } : {}),
      ...(this.error ? { error: this.error } : {})
    };
  }
}

module.exports = {
  EventTypes,
  TraceEvent,
  serializeError
};
