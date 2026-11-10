'use strict';

const crypto = require('node:crypto');

let counter = 0;

/**
 * Generate a unique ID with an optional prefix.
 * Combines crypto random bytes and an incrementing counter for absolute uniqueness.
 * @param {string} prefix
 * @returns {string}
 */
function generateId(prefix = 'id') {
  counter = (counter + 1) & 0xffffff;
  const counterHex = counter.toString(16).padStart(6, '0');
  if (typeof crypto.randomUUID === 'function') {
    const raw = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    return `${prefix}_${raw}_${counterHex}`;
  }
  const randomHex = crypto.randomBytes(8).toString('hex');
  return `${prefix}_${randomHex}_${counterHex}`;
}

module.exports = {
  generateId,
  createTraceId: () => generateId('trc'),
  createOperationId: () => generateId('op'),
  createEventId: () => generateId('evt'),
  createRequestId: () => generateId('req')
};
