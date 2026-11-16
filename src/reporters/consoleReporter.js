'use strict';

const { createStyler, shouldEnableColor, formatDuration, formatTime } = require('../utils/formatting');

class ConsoleReporter {
  /**
   * Renders the trace report as a string.
   *
   * @param {object} reportData
   * @param {object} [options]
   * @param {boolean} [options.color] Enable or disable colors
   * @param {boolean} [options.showTimeline=true]
   * @param {boolean} [options.showTree=true]
   * @param {boolean} [options.showSlow=true]
   * @param {boolean} [options.showFailures=true]
   * @returns {string}
   */
  render(reportData, options = {}) {
    const useColor = shouldEnableColor(options);
    const s = createStyler(useColor);
    const lines = [];

    const summary = reportData.summary || {};
    const slowOps = reportData.slowOperations || [];
    const tree = reportData.tree || [];
    const events = reportData.events || [];
    const errors = reportData.errors || [];

    // Header
    lines.push('');
    lines.push(s.bold(s.cyan('========================================================')));
    lines.push(s.bold(s.cyan(`            TRACENEST EXECUTION REPORT                  `)));
    lines.push(s.bold(s.cyan('========================================================')));
    lines.push('');

    // Summary Section
    lines.push(s.bold(s.white('--- Summary ---')));
    lines.push(`  Trace ID:              ${s.dim(reportData.traceId || 'N/A')}`);
    lines.push(`  Total Operations:      ${s.bold(String(summary.totalOperations || 0))}`);
    lines.push(`  Successful Operations: ${s.green(String(summary.successfulOperations || 0))}`);
    const failedStr = (summary.failedOperations || 0) > 0
      ? s.red(String(summary.failedOperations))
      : '0';
    lines.push(`  Failed Operations:     ${failedStr}`);
    lines.push(`  Success Rate:          ${summary.successRate !== undefined ? summary.successRate + '%' : '100%'}`);
    lines.push(`  Wall-Clock Time:       ${s.bold(formatDuration(summary.wallClockTimeMs || summary.totalExecutionTimeMs || 0))}`);
    if (typeof summary.sumOperationDurationMs === 'number') {
      lines.push(`  Cumulative Op Time:    ${formatDuration(summary.sumOperationDurationMs)}`);
    }
    lines.push(`  Average Duration:      ${formatDuration(summary.averageDurationMs || 0)}`);
    lines.push(`  Min / Max Duration:    ${formatDuration(summary.minDurationMs || 0)} / ${formatDuration(summary.maxDurationMs || 0)}`);
    if (summary.percentiles) {
      lines.push(`  P50 / P95 Duration:    ${formatDuration(summary.percentiles.p50 || 0)} / ${formatDuration(summary.percentiles.p95 || 0)}`);
    }
    lines.push('');

    // Failed Operations Section
    if (options.showFailures !== false && errors.length > 0) {
      lines.push(s.bold(s.red('--- Failed Operations ---')));
      for (const errItem of errors) {
        const opDuration = typeof errItem.durationMs === 'number' ? ` (${formatDuration(errItem.durationMs)})` : '';
        const errMsg = errItem.error && errItem.error.message ? errItem.error.message : 'Unknown error';
        lines.push(`  ${s.red('[FAILED]')} ${s.bold(errItem.name)}${opDuration} - ${s.red(errMsg)}`);
      }
      lines.push('');
    }

    // Slow Operations Section
    if (options.showSlow !== false && slowOps.length > 0) {
      lines.push(s.bold(s.yellow(`--- Slow Operations (Threshold: >= ${slowOps[0].thresholdMs}ms) ---`)));
      for (const op of slowOps) {
        const badge = op.status === 'ERROR' ? s.red('[FAILED]') : s.yellow('[SLOW]');
        lines.push(`  ${badge} ${s.bold(op.name)} - ${s.yellow(formatDuration(op.durationMs))} (threshold: ${op.thresholdMs}ms)`);
      }
      lines.push('');
    }

    // Hierarchical Operation Tree Section
    if (options.showTree !== false && tree.length > 0) {
      lines.push(s.bold(s.white('--- Operation Hierarchy Tree ---')));
      for (const root of tree) {
        this._renderTreeNode(root, '', true, lines, s);
      }
      lines.push('');
    }

    // Execution Timeline Section
    if (options.showTimeline !== false && events.length > 0) {
      lines.push(s.bold(s.white('--- Execution Timeline ---')));
      for (const evt of events) {
        const timeStr = formatTime(evt.timestamp);
        const typeBadge = this._formatTypeBadge(evt.type, s);
        const indent = '  '.repeat(evt.depth || 0);
        let durationStr = '';
        if (typeof evt.durationMs === 'number') {
          durationStr = ` ${s.dim(`(${formatDuration(evt.durationMs)})`)}`;
        }
        let errorSnippet = '';
        if (evt.error && evt.error.message) {
          errorSnippet = ` ${s.red(`- Error: ${evt.error.message}`)}`;
        }
        lines.push(`  ${s.gray(timeStr)}  ${typeBadge}  ${indent}${evt.name}${durationStr}${errorSnippet}`);
      }
      lines.push('');
    }

    lines.push(s.bold(s.cyan('========================================================')));
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Prints the rendered report to console.
   * @param {object} reportData
   * @param {object} [options]
   */
  print(reportData, options = {}) {
    const output = this.render(reportData, options);
    console.log(output);
  }

  _formatTypeBadge(type, s) {
    switch (type) {
      case 'START':
        return s.blue('START  ');
      case 'CALL':
        return s.cyan('CALL   ');
      case 'SUCCESS':
        return s.green('SUCCESS');
      case 'ERROR':
        return s.red('ERROR  ');
      case 'WARNING':
        return s.yellow('WARNING');
      case 'TRACK':
        return s.magenta('TRACK  ');
      case 'END':
        return s.blue('END    ');
      default:
        return (type || 'UNKNOWN').padEnd(7, ' ');
    }
  }

  _renderTreeNode(node, prefix, isLast, lines, s) {
    const connector = isLast ? '└── ' : '├── ';
    const statusColor = node.status === 'ERROR' ? s.red : (node.status === 'SUCCESS' ? s.green : s.yellow);
    const duration = typeof node.durationMs === 'number' ? ` [${formatDuration(node.durationMs)}]` : '';
    const status = ` (${statusColor(node.status)})`;
    let errorDetail = '';
    if (node.status === 'ERROR' && node.error && node.error.message) {
      errorDetail = ` ${s.red(`- Error: ${node.error.message}`)}`;
    }
    const line = `  ${prefix}${connector}${s.bold(node.name)}${status}${duration}${errorDetail}`;
    lines.push(line);

    const childPrefix = prefix + (isLast ? '    ' : '│   ');
    const children = node.children || [];
    for (let i = 0; i < children.length; i++) {
      const isLastChild = i === children.length - 1;
      this._renderTreeNode(children[i], childPrefix, isLastChild, lines, s);
    }
  }
}

module.exports = {
  ConsoleReporter
};
