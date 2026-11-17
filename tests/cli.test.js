'use strict';

const { test, describe, afterEach } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const CLI_PATH = path.resolve(__dirname, '../bin/tracenest.js');
const TEMP_CORRUPT_JSON = path.resolve(__dirname, 'temp_corrupt.json');
const TEMP_NONTRACE_JSON = path.resolve(__dirname, 'temp_nontrace.json');

describe('CLI Improvements & Error Feedback', () => {
  afterEach(() => {
    if (fs.existsSync(TEMP_CORRUPT_JSON)) fs.unlinkSync(TEMP_CORRUPT_JSON);
    if (fs.existsSync(TEMP_NONTRACE_JSON)) fs.unlinkSync(TEMP_NONTRACE_JSON);
  });

  test('should display helpful instructions and examples when report is run without file argument', () => {
    let output = '';
    try {
      execFileSync(process.execPath, [CLI_PATH, 'report'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      output = err.stderr || err.stdout;
    }

    assert.ok(output.includes("Missing required trace file argument for 'report'"));
    assert.ok(output.includes('Usage:'));
    assert.ok(output.includes('npx tracenest report <file.json>'));
    assert.ok(output.includes('TraceNest.exportJSON'));
  });

  test('should display helpful instructions when summary is run without file argument', () => {
    let output = '';
    try {
      execFileSync(process.execPath, [CLI_PATH, 'summary'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      output = err.stderr || err.stdout;
    }

    assert.ok(output.includes("Missing required trace file argument for 'summary'"));
    assert.ok(output.includes('npx tracenest summary <file.json>'));
  });

  test('should produce understandable error when file is missing', () => {
    let output = '';
    try {
      execFileSync(process.execPath, [CLI_PATH, 'report', './nonexistent_trace_file_xyz.json'], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (err) {
      output = err.stderr || err.stdout;
    }

    assert.ok(output.includes('Trace file not found'));
    assert.ok(output.includes('nonexistent_trace_file_xyz.json'));
    assert.ok(output.includes('TraceNest.exportJSON'));
  });

  test('should produce understandable error on malformed JSON file', () => {
    fs.writeFileSync(TEMP_CORRUPT_JSON, '{ "summary": { incomplete json ...', 'utf8');

    let output = '';
    try {
      execFileSync(process.execPath, [CLI_PATH, 'report', TEMP_CORRUPT_JSON], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (err) {
      output = err.stderr || err.stdout;
    }

    assert.ok(output.includes('Failed to parse trace file as valid JSON'));
    assert.ok(output.includes('Syntax Error:'));
  });

  test('should produce understandable error on JSON without trace data', () => {
    fs.writeFileSync(TEMP_NONTRACE_JSON, JSON.stringify({ package: 'unknown', data: 123 }), 'utf8');

    let output = '';
    try {
      execFileSync(process.execPath, [CLI_PATH, 'report', TEMP_NONTRACE_JSON], {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (err) {
      output = err.stderr || err.stdout;
    }

    assert.ok(output.includes('The file does not appear to be a valid TraceNest trace export'));
    assert.ok(output.includes("Expected properties such as 'summary', 'operations', or 'events'"));
  });
});
