'use strict';

/**
 * Detects operations that exceeded a duration threshold.
 *
 * @param {Array<import('../core/operation').Operation>} operations
 * @param {number} [thresholdMs=100]
 * @returns {Array<object>} sorted descending by duration
 */
function detectSlowOperations(operations = [], thresholdMs = 100) {
  const threshold = typeof thresholdMs === 'number' && thresholdMs >= 0 ? thresholdMs : 100;

  const slow = [];
  for (const op of operations) {
    if (typeof op.durationMs === 'number' && op.durationMs >= threshold) {
      slow.push({
        id: op.id,
        name: op.name,
        durationMs: op.durationMs,
        thresholdMs: threshold,
        status: op.status,
        startTime: op.startTime,
        endTime: op.endTime,
        parentId: op.parentId,
        depth: op.depth
      });
    }
  }

  // Sort descending by duration
  return slow.sort((a, b) => b.durationMs - a.durationMs);
}

/**
 * Builds a hierarchical tree from a flat list of operations.
 *
 * @param {Array<import('../core/operation').Operation>} operations
 * @returns {Array<object>} Root nodes with nested children
 */
function buildOperationTree(operations = []) {
  const opMap = new Map();
  const roots = [];

  // Create clean node clones
  for (const op of operations) {
    const raw = typeof op.toJSON === 'function' ? op.toJSON() : { ...op };
    opMap.set(op.id, {
      ...raw,
      children: []
    });
  }

  // Connect parents and children
  for (const op of operations) {
    const node = opMap.get(op.id);
    if (op.parentId && opMap.has(op.parentId)) {
      opMap.get(op.parentId).children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

module.exports = {
  detectSlowOperations,
  buildOperationTree
};
