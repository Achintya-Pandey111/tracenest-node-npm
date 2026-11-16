'use strict';

const fs = require('node:fs');
const path = require('node:path');

class JsonReporter {
  /**
   * Generates a serialized JSON string representing the full trace data.
   *
   * @param {object} reportData
   * @param {object} [options]
   * @param {number|string} [options.indent=2]
   * @returns {string}
   */
  render(reportData, options = {}) {
    const indent = options.indent !== undefined ? options.indent : 2;
    return JSON.stringify(reportData, null, indent);
  }

  /**
   * Exports the trace report data to a JSON file.
   *
   * @param {string} filePath File path to write to
   * @param {object} reportData Trace report payload
   * @param {object} [options]
   * @returns {string} Resolved file path
   */
  export(filePath, reportData, options = {}) {
    if (!filePath || typeof filePath !== 'string') {
      throw new TypeError('TraceNest.exportJSON requires a valid file path string.');
    }

    const resolvedPath = path.resolve(process.cwd(), filePath);
    const dir = path.dirname(resolvedPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const jsonString = this.render(reportData, options);
    fs.writeFileSync(resolvedPath, jsonString, 'utf8');

    return resolvedPath;
  }
}

module.exports = {
  JsonReporter
};
