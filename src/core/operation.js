'use strict';

const { createOperationId } = require('../utils/identifiers');
const { getHrTime, calcElapsedMs } = require('../utils/time');
const { serializeError, EventTypes, TraceEvent } = require('./event');

const OperationStatus = Object.freeze({
  RUNNING: 'RUNNING',
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR'
});

/**
 * Represents a timed, potentially nested execution operation.
 */
class Operation {
  /**
   * @param {object} params
   * @param {string} [params.id]
   * @param {string} params.traceId
   * @param {string|null} [params.parentId]
   * @param {string} params.name
   * @param {number} [params.depth]
   * @param {object} [params.metadata]
   * @param {object} [params.store] EventStore reference
   * @param {object} [params.tracer] Tracer instance reference
   */
  constructor({
    id = createOperationId(),
    traceId,
    parentId = null,
    name,
    depth = 0,
    metadata = {},
    store = null,
    tracer = null
  }) {
    this.id = id;
    this.traceId = traceId;
    this.parentId = parentId;
    this.name = String(name || 'unnamed_operation');
    this.depth = Math.max(0, depth);
    this.metadata = { ...metadata };
    this._store = store;
    this._tracer = tracer;

    this.startTime = Date.now();
    this._startHrTime = getHrTime();
    this.endTime = null;
    this.durationMs = null;
    this.status = OperationStatus.RUNNING;
    this.error = null;
    this.children = [];
    this._ended = false;
  }

  /**
   * Attach a child operation ID to this operation.
   * @param {string} childId
   */
  addChild(childId) {
    if (childId && !this.children.includes(childId)) {
      this.children.push(childId);
    }
  }

  /**
   * Annotate this operation with custom metadata.
   * @param {string|object} keyOrObj
   * @param {any} [value]
   * @returns {Operation} this
   */
  annotate(keyOrObj, value) {
    if (typeof keyOrObj === 'string') {
      this.metadata[keyOrObj] = value;
    } else if (keyOrObj && typeof keyOrObj === 'object') {
      Object.assign(this.metadata, keyOrObj);
    }
    return this;
  }

  /**
   * Records a point-in-time tracking event nested inside this operation.
   * @param {string} name
   * @param {object} [metadata]
   */
  track(name, metadata) {
    if (!this._store) return;
    const evt = new TraceEvent({
      traceId: this.traceId,
      operationId: this.id,
      parentOperationId: this.parentId,
      type: EventTypes.TRACK,
      name,
      depth: this.depth + 1,
      metadata
    });
    this._store.addEvent(evt);
  }

  /**
   * Ends the operation. Idempotent: repeated calls are safely ignored.
   * @param {unknown} [err] Optional error if operation failed
   * @returns {Operation} this
   */
  end(err = null) {
    if (this._ended) {
      return this;
    }
    this._ended = true;
    this.endTime = Date.now();
    this.durationMs = calcElapsedMs(this._startHrTime);

    const hasError = arguments.length > 0 && err !== null && err !== undefined;

    if (hasError) {
      this.status = OperationStatus.ERROR;
      this.error = serializeError(err);
    } else if (this.status !== OperationStatus.ERROR) {
      this.status = OperationStatus.SUCCESS;
    }

    if (this._store) {
      const eventType = this.status === OperationStatus.ERROR ? EventTypes.ERROR : EventTypes.SUCCESS;
      const endEvent = new TraceEvent({
        traceId: this.traceId,
        operationId: this.id,
        parentOperationId: this.parentId,
        type: eventType,
        name: this.name,
        timestamp: this.endTime,
        durationMs: this.durationMs,
        depth: this.depth,
        metadata: Object.keys(this.metadata).length > 0 ? this.metadata : undefined,
        error: this.error
      });
      this._store.addEvent(endEvent);
      this._store.addOperation(this);

      // Check for slow operation threshold
      if (this._tracer && this._tracer.options && this._tracer.options.autoWarnSlowOperations) {
        const threshold = this._tracer.options.slowOperationThresholdMs || 100;
        if (this.durationMs >= threshold) {
          const warnEvent = new TraceEvent({
            traceId: this.traceId,
            operationId: this.id,
            parentOperationId: this.parentId,
            type: EventTypes.WARNING,
            name: `Slow operation detected: ${this.name} (${this.durationMs}ms >= ${threshold}ms)`,
            timestamp: this.endTime,
            durationMs: this.durationMs,
            depth: this.depth,
            metadata: { thresholdMs: threshold, actualMs: this.durationMs }
          });
          this._store.addEvent(warnEvent);
        }
      }
    }

    return this;
  }

  /**
   * Marks the operation as failed with an error and ends it.
   * Works for any thrown value including primitives, null, or undefined.
   * @param {unknown} err
   * @returns {Operation} this
   */
  fail(err) {
    if (this._ended) {
      return this;
    }
    this.status = OperationStatus.ERROR;
    this.error = serializeError(err);
    return this.end(err);
  }

  toJSON() {
    return {
      id: this.id,
      traceId: this.traceId,
      parentId: this.parentId,
      name: this.name,
      depth: this.depth,
      startTime: this.startTime,
      endTime: this.endTime,
      durationMs: this.durationMs,
      status: this.status,
      children: [...this.children],
      ...(this.error ? { error: this.error } : {}),
      ...(Object.keys(this.metadata).length > 0 ? { metadata: this.metadata } : {})
    };
  }
}

module.exports = {
  Operation,
  OperationStatus
};
