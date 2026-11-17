#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { fork } = require('node:child_process');
const pkg = require('../package.json');
const { ConsoleReporter } = require('../src/reporters/consoleReporter');
const { detectSlowOperations } = require('../src/analysis/slowOperations');

const args = process.argv.slice(2);

function printHelp() {
  console.log(`
TraceNest CLI - v${pkg.version}
Usage:
  tracenest <command> [options]

Commands:
  report <file.json>          Display formatted trace report from a JSON export
  summary <file.json>         Display concise summary statistics from a JSON export
  run <script.js> [args...]   Run a Node.js script with TraceNest auto-started and print report
  version, --version, -v      Show TraceNest version
  help, --help, -h            Show this help message

Options:
  --threshold <ms>            Custom slow operation threshold in milliseconds (default: 100)
  --no-color                  Disable ANSI color formatting
  --no-timeline               Exclude chronological timeline from report
  --no-tree                   Exclude hierarchical tree from report
  --no-slow                   Exclude slow operations from report
  --output <file.json>        Save report to JSON file (used with run command)

Examples:
  npx tracenest report ./trace-report.json
  npx tracenest report ./trace-report.json --threshold 50
  npx tracenest summary ./trace-report.json
  npx tracenest run ./app.js --output trace.json
`);
}

function parseFlags(argList) {
  const flags = {
    color: true,
    showTimeline: true,
    showTree: true,
    showSlow: true,
    thresholdMs: undefined,
    output: undefined
  };
  const positional = [];

  for (let i = 0; i < argList.length; i++) {
    const arg = argList[i];
    if (arg === '--no-color') {
      flags.color = false;
    } else if (arg === '--no-timeline') {
      flags.showTimeline = false;
    } else if (arg === '--no-tree') {
      flags.showTree = false;
    } else if (arg === '--no-slow') {
      flags.showSlow = false;
    } else if (arg === '--threshold' && i + 1 < argList.length) {
      flags.thresholdMs = parseFloat(argList[++i]);
    } else if (arg.startsWith('--threshold=')) {
      flags.thresholdMs = parseFloat(arg.split('=')[1]);
    } else if (arg === '--output' && i + 1 < argList.length) {
      flags.output = argList[++i];
    } else if (arg.startsWith('--output=')) {
      flags.output = arg.split('=')[1];
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

function loadJsonFile(filePath, commandName = 'report') {
  if (!filePath) {
    console.error(`
TraceNest CLI Error: Missing required trace file argument for '${commandName}'.

Usage:
  npx tracenest ${commandName} <file.json> [options]

Examples:
  npx tracenest ${commandName} ./trace-report.json
  npx tracenest ${commandName} ./trace-report.json --threshold 50

To generate a trace report in your code:
  const TraceNest = require('tracenest');
  TraceNest.start();
  // ... run traced operations ...
  TraceNest.exportJSON('./trace-report.json');
`);
    process.exit(1);
  }

  const resolved = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`
TraceNest CLI Error: Trace file not found.
  Path: ${resolved}

Please verify the file path exists and that TraceNest.exportJSON(...) generated the file.
`);
    process.exit(1);
  }

  let raw;
  try {
    raw = fs.readFileSync(resolved, 'utf8');
  } catch (err) {
    console.error(`
TraceNest CLI Error: Unable to read trace file.
  Path: ${resolved}
  Error: ${err.message}
`);
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.error(`
TraceNest CLI Error: Failed to parse trace file as valid JSON.
  Path: ${resolved}
  Syntax Error: ${err.message}
`);
    process.exit(1);
  }

  // Validate that the JSON structure represents a TraceNest trace
  if (!parsed || typeof parsed !== 'object' || (!parsed.summary && !parsed.operations && !parsed.events)) {
    console.error(`
TraceNest CLI Error: The file does not appear to be a valid TraceNest trace export.
  Path: ${resolved}
  Expected properties such as 'summary', 'operations', or 'events'.
`);
    process.exit(1);
  }

  return parsed;
}

function handleReport(targetFile, flags) {
  const data = loadJsonFile(targetFile, 'report');

  // Recalculate slow operations if custom threshold was passed
  if (typeof flags.thresholdMs === 'number' && data.operations) {
    data.slowOperations = detectSlowOperations(data.operations, flags.thresholdMs);
  }

  const reporter = new ConsoleReporter();
  reporter.print(data, {
    color: flags.color,
    showTimeline: flags.showTimeline,
    showTree: flags.showTree,
    showSlow: flags.showSlow
  });
}

function handleSummary(targetFile, flags) {
  const data = loadJsonFile(targetFile, 'summary');
  const reporter = new ConsoleReporter();
  reporter.print(data, {
    color: flags.color,
    showTimeline: false,
    showTree: false,
    showSlow: false
  });
}

function handleRun(scriptPath, extraArgs, flags) {
  if (!scriptPath) {
    console.error(`
TraceNest CLI Error: Missing script path argument for 'run'.

Usage:
  npx tracenest run <script.js> [args...] [--output <file.json>]

Example:
  npx tracenest run ./app.js
  npx tracenest run ./app.js --output trace.json
`);
    process.exit(1);
  }

  const resolvedScript = path.resolve(process.cwd(), scriptPath);
  if (!fs.existsSync(resolvedScript)) {
    console.error(`
TraceNest CLI Error: Target script not found.
  Path: ${resolvedScript}
`);
    process.exit(1);
  }

  const child = fork(resolvedScript, extraArgs, {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${path.resolve(__dirname, '../src/index.js')}`
    }
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });
}

// Main CLI dispatch
function main() {
  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  if (args[0] === 'version' || args[0] === '--version' || args[0] === '-v') {
    console.log(`TraceNest v${pkg.version}`);
    return;
  }

  const { flags, positional } = parseFlags(args);
  const command = positional[0];
  const target = positional[1];

  switch (command) {
    case 'report':
      handleReport(target, flags);
      break;
    case 'summary':
      handleSummary(target, flags);
      break;
    case 'run':
      handleRun(target, positional.slice(2), flags);
      break;
    default:
      // If the first argument is a JSON file directly: tracenest ./report.json
      if (command && command.endsWith('.json')) {
        handleReport(command, flags);
      } else {
        console.error(`Unknown command: ${command}`);
        printHelp();
        process.exit(1);
      }
      break;
  }
}

main();
