'use strict';

/**
 * In-memory bounded store for trace events and operations.
 * Implements bounded storage to avoid unbounded memory growth.
 */
class EventStore {
  /**
   * @param {object} [options]
   * @param {number} [options.maxEvents=10000] Maximum number of events to retain
   * @param {number} [options.maxOperations=10000] Maximum number of operations to retain
   */
  constructor(options = {}) {
    this.maxEvents = options.maxEvents && options.maxEvents > 0 ? options.maxEvents : 10000;
    this.maxOperations = options.maxOperations && options.maxOperations > 0 ? options.maxOperations : this.maxEvents;
    this._events = [];
    this._operations = new Map();
    this.totalEventsRecorded = 0;
    this.droppedEventsCount = 0;
    this.totalOperationsRecorded = 0;
    this.droppedOperationsCount = 0;
  }

  /**
   * Update configuration.
   * @param {object} options
   */
  configure(options = {}) {
    if (typeof options.maxEvents === 'number' && options.maxEvents > 0) {
      this.maxEvents = options.maxEvents;
      this._pruneEvents();
    }
    if (typeof options.maxOperations === 'number' && options.maxOperations > 0) {
      this.maxOperations = options.maxOperations;
      this._pruneOperations();
    }
  }

  /**
   * Adds an event to the store. Drops oldest events if limit is exceeded.
   * @param {import('./event').TraceEvent} event
   */
  addEvent(event) {
    if (!event) return;
    this.totalEventsRecorded++;

    if (this._events.length >= this.maxEvents) {
      // Drop oldest 10% or at least 1 to prevent continuous small allocations
      const dropCount = Math.max(1, Math.floor(this.maxEvents * 0.1));
      this._events.splice(0, dropCount);
      this.droppedEventsCount += dropCount;
    }

    this._events.push(event);
  }

  /**
   * Adds or updates an operation in the store.
   * If operation capacity is exceeded, prunes oldest operations.
   * @param {import('./operation').Operation} operation
   */
  addOperation(operation) {
    if (!operation || !operation.id) return;

    if (!this._operations.has(operation.id)) {
      this.totalOperationsRecorded++;
      if (this._operations.size >= this.maxOperations) {
        this._pruneOperations();
      }
    }

    this._operations.set(operation.id, operation);
  }

  /**
   * Retrieves an operation by ID.
   * @param {string} id
   * @returns {import('./operation').Operation|undefined}
   */
  getOperation(id) {
    return this._operations.get(id);
  }

  /**
   * Returns a copy of all stored events in insertion order.
   * @returns {import('./event').TraceEvent[]}
   */
  getEvents() {
    return [...this._events];
  }

  /**
   * Returns an array of all recorded operations.
   * @returns {import('./operation').Operation[]}
   */
  getOperations() {
    return Array.from(this._operations.values());
  }

  /**
   * Clears all stored events and operations.
   */
  clear() {
    this._events = [];
    this._operations.clear();
    this.totalEventsRecorded = 0;
    this.droppedEventsCount = 0;
    this.totalOperationsRecorded = 0;
    this.droppedOperationsCount = 0;
  }

  /**
   * Returns current count of stored events and operations.
   * @returns {{ eventsCount: number, operationsCount: number, totalEventsRecorded: number, droppedEventsCount: number, totalOperationsRecorded: number, droppedOperationsCount: number }}
   */
  size() {
    return {
      eventsCount: this._events.length,
      operationsCount: this._operations.size,
      totalEventsRecorded: this.totalEventsRecorded,
      droppedEventsCount: this.droppedEventsCount,
      totalOperationsRecorded: this.totalOperationsRecorded,
      droppedOperationsCount: this.droppedOperationsCount
    };
  }

  _pruneEvents() {
    if (this._events.length > this.maxEvents) {
      const excess = this._events.length - this.maxEvents;
      this._events.splice(0, excess);
      this.droppedEventsCount += excess;
    }
  }

  _pruneOperations() {
    if (this._operations.size >= this.maxOperations) {
      const dropCount = Math.max(1, Math.floor(this.maxOperations * 0.1));
      let count = 0;
      for (const key of this._operations.keys()) {
        this._operations.delete(key);
        count++;
        if (count >= dropCount) break;
      }
      this.droppedOperationsCount += count;
    }
  }
}

module.exports = {
  EventStore
};
