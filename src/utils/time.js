'use strict';

/**
 * Returns high-resolution time in milliseconds.
 * Uses process.hrtime.bigint() for microsecond-level accuracy.
 * @returns {bigint}
 */
function getHrTime() {
  return process.hrtime.bigint();
}

/**
 * Calculates elapsed milliseconds between a start bigint and now (or end bigint).
 * @param {bigint} startHrTime
 * @param {bigint} [endHrTime]
 * @returns {number} duration in milliseconds rounded to 3 decimal places
 */
function calcElapsedMs(startHrTime, endHrTime = process.hrtime.bigint()) {
  const diffNs = endHrTime - startHrTime;
  const ms = Number(diffNs) / 1e6;
  return Math.round(ms * 1000) / 1000;
}

/**
 * Formats a Date or timestamp as HH:mm:ss.SSS
 * @param {number|Date} [date]
 * @returns {string}
 */
function formatTime(date = Date.now()) {
  const d = date instanceof Date ? date : new Date(date);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const millis = String(d.getMilliseconds()).padStart(3, '0');
  return `${hours}:${minutes}:${seconds}.${millis}`;
}

/**
 * Formats duration into human-readable string (e.g. 1.25ms, 450.00ms, 2.34s)
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) {
    return '0.00ms';
  }
  if (ms < 0.001) {
    return '<0.01ms';
  }
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

module.exports = {
  getHrTime,
  calcElapsedMs,
  formatTime,
  formatDuration
};
