'use strict';

/**
 * Calculates detailed performance and execution statistics from operations and events.
 * Clearly distinguishes total wall-clock elapsed time from cumulative operation durations.
 *
 * @param {Array<import('../core/operation').Operation>} operations
 * @param {Array<import('../core/event').TraceEvent>} [events=[]]
 * @returns {object}
 */
function calculateStatistics(operations = [], events = []) {
  const totalOperations = operations.length;
  let successfulOperations = 0;
  let failedOperations = 0;
  let runningOperations = 0;

  const statusCounts = {
    SUCCESS: 0,
    ERROR: 0,
    RUNNING: 0
  };

  const nameCounts = {};
  const completedDurations = [];

  let minDuration = null;
  let maxDuration = null;
  let sumDuration = 0;

  let earliestStartTime = null;
  let latestEndTime = null;

  for (const op of operations) {
    // Status counts
    if (op.status === 'SUCCESS') {
      successfulOperations++;
      statusCounts.SUCCESS++;
    } else if (op.status === 'ERROR') {
      failedOperations++;
      statusCounts.ERROR++;
    } else {
      runningOperations++;
      statusCounts.RUNNING++;
    }

    // Name counts
    nameCounts[op.name] = (nameCounts[op.name] || 0) + 1;

    // Timing bounds for wall-clock calculation
    if (typeof op.startTime === 'number') {
      if (earliestStartTime === null || op.startTime < earliestStartTime) {
        earliestStartTime = op.startTime;
      }
    }
    if (typeof op.endTime === 'number') {
      if (latestEndTime === null || op.endTime > latestEndTime) {
        latestEndTime = op.endTime;
      }
    }

    // Individual completed operation durations
    if (typeof op.durationMs === 'number' && !Number.isNaN(op.durationMs)) {
      completedDurations.push(op.durationMs);
      sumDuration += op.durationMs;

      if (minDuration === null || op.durationMs < minDuration) {
        minDuration = op.durationMs;
      }
      if (maxDuration === null || op.durationMs > maxDuration) {
        maxDuration = op.durationMs;
      }
    }
  }

  // 1. Wall-clock elapsed time (from the very first operation start to the latest completion)
  let wallClockTimeMs = 0;
  if (earliestStartTime !== null && latestEndTime !== null) {
    wallClockTimeMs = Math.max(0, latestEndTime - earliestStartTime);
  } else if (completedDurations.length > 0) {
    wallClockTimeMs = sumDuration;
  }

  // 2. Cumulative sum of all individual operation durations (can exceed wall-clock time due to concurrency/nesting)
  const sumOperationDurationMs = Math.round(sumDuration * 1000) / 1000;

  // 3. Average duration of completed operations
  const completedCount = completedDurations.length;
  const averageDurationMs = completedCount > 0 ? Math.round((sumDuration / completedCount) * 1000) / 1000 : 0;

  // 4. Quantiles / Percentiles using linear interpolation
  completedDurations.sort((a, b) => a - b);
  const p50 = getPercentile(completedDurations, 50);
  const p90 = getPercentile(completedDurations, 90);
  const p95 = getPercentile(completedDurations, 95);
  const p99 = getPercentile(completedDurations, 99);

  const successRate = totalOperations > 0
    ? Math.round((successfulOperations / totalOperations) * 10000) / 100
    : 100;

  return {
    totalOperations,
    successfulOperations,
    failedOperations,
    runningOperations,
    successRate,
    totalEvents: events.length,
    // totalExecutionTimeMs preserved for backwards compatibility; alias of wallClockTimeMs
    totalExecutionTimeMs: wallClockTimeMs,
    wallClockTimeMs,
    sumOperationDurationMs,
    averageDurationMs,
    minDurationMs: minDuration !== null ? minDuration : 0,
    maxDurationMs: maxDuration !== null ? maxDuration : 0,
    percentiles: {
      p50,
      p90,
      p95,
      p99
    },
    statusCounts,
    nameCounts
  };
}

/**
 * Calculates the p-th percentile from a sorted array of numbers using linear interpolation.
 * @param {number[]} sortedNumbers
 * @param {number} p (0 - 100)
 * @returns {number}
 */
function getPercentile(sortedNumbers, p) {
  if (!Array.isArray(sortedNumbers) || sortedNumbers.length === 0) return 0;
  if (sortedNumbers.length === 1) return sortedNumbers[0];

  const rank = (p / 100) * (sortedNumbers.length - 1);
  const lowerIndex = Math.floor(rank);
  const fraction = rank - lowerIndex;

  if (lowerIndex >= sortedNumbers.length - 1) {
    return sortedNumbers[sortedNumbers.length - 1];
  }

  const interpolated = sortedNumbers[lowerIndex] + fraction * (sortedNumbers[lowerIndex + 1] - sortedNumbers[lowerIndex]);
  return Math.round(interpolated * 1000) / 1000;
}

module.exports = {
  calculateStatistics,
  getPercentile
};
