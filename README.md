# TraceNest

> Lightweight, zero-dependency async execution tracing and hierarchical performance monitoring for Node.js applications.

TraceNest is a developer observability library built on Node.js native `AsyncLocalStorage`. It provides transparent tracking of asynchronous and synchronous execution flows, nested parent-child call hierarchies, latency bottlenecks, and error propagation without polluting your application logic.

---

## Highlights

- **Zero External Dependencies**: Implemented purely with Node.js built-ins (`node:async_hooks`, `node:perf_hooks`, `node:crypto`).
- **Async Context Tracking**: Automatically links nested asynchronous calls across microtasks, timers, and I/O using `AsyncLocalStorage`.
- **Nested Hierarchies**: Automatically captures parent-child execution trees for database queries, external HTTP requests, and internal subroutines.
- **Microsecond Precision**: High-resolution operation duration calculations using `process.hrtime.bigint()`.
- **Error Preservation**: Intercepts and records thrown exceptions and stack traces while re-throwing them to preserve normal control flow.
- **Slow Operation Detection**: Configurable latency thresholds to pinpoint performance regressions.
- **Built-in CLI**: Terminal-based visualization of execution timelines, operation hierarchy trees, and performance metrics.
- **JSON Export**: Programmatic export of trace runs for archival, dashboards, or CI/CD test benchmarks.
- **Express Middleware**: Optional, non-intrusive HTTP middleware that nests all route activity beneath request-scoped traces.

---

## Installation

```bash
npm install tracenest
```

Requires Node.js `>= 20.0.0`.

---

## Quick Start

```javascript
const TraceNest = require('tracenest');

// Start a tracing session
TraceNest.start({
  name: 'BillingService',
  slowOperationThresholdMs: 50
});

// Trace a function (synchronous or asynchronous)
const result = await TraceNest.trace('Process Invoice', async () => {
  TraceNest.track('Validating customer account');

  await TraceNest.trace('Query Database', async () => {
    // Database query logic here
    await new Promise(resolve => setTimeout(resolve, 20));
  });

  return { status: 'PAID' };
});

// Print execution report to terminal
TraceNest.report();
```

---

## Core API Reference

### `TraceNest.start(options)`
Enables tracing and initializes a new trace session.
- `options.name` *(string)*: Descriptive service or session name. Default: `'default'`.
- `options.slowOperationThresholdMs` *(number)*: Threshold in ms to flag operations as slow. Default: `100`.
- `options.maxEvents` *(number)*: Maximum stored events before pruning oldest entries. Default: `10000`.
- `options.autoWarnSlowOperations` *(boolean)*: If true, emits a `WARNING` event when an operation exceeds threshold. Default: `false`.

### `TraceNest.stop()`
Temporarily halts recording of new events without discarding collected data.

### `TraceNest.reset()`
Disables tracing, clears stored events and operations, and resets the active session.

### `TraceNest.configure(options)`
Updates configuration parameters at runtime.

### `TraceNest.trace(name, fn, [metadata])`
Executes `fn` inside a monitored async context.
- Returns the return value of `fn` (or resolves the Promise).
- Preserves errors: if `fn` throws or rejects, the error is recorded on the operation and immediately re-thrown.
- Automatically creates parent-child relationships if invoked within another traced block.

### `TraceNest.begin(name, [metadata])`
Manually starts a timed operation. Returns an `Operation` instance:
- `operation.end([error])`: Marks the operation finished (or failed if an error is provided).
- `operation.fail(error)`: Explicitly fails the operation with an error.
- `operation.annotate(keyOrObject, [value])`: Attaches custom metadata.
- `operation.track(name, [metadata])`: Emits a point-in-time event under this operation.

### `TraceNest.track(name, [metadata])`
Records a point-in-time milestone event in the currently active execution context.

### `TraceNest.getActiveOperation()`
Returns the `Operation` currently executing in the active `AsyncLocalStorage` context, or `null`.

### `TraceNest.report([options])`
Renders and prints a formatted terminal report:
- `options.color` *(boolean)*: Enable or disable ANSI colors.
- `options.showTimeline` *(boolean)*: Include chronological event log. Default: `true`.
- `options.showTree` *(boolean)*: Include hierarchical operation tree. Default: `true`.
- `options.showSlow` *(boolean)*: Include slow operations section. Default: `true`.
- `options.silent` *(boolean)*: Return report string without printing to `console.log`.

### `TraceNest.exportJSON(filePath, [options])`
Exports structured trace data to a JSON file.
- Returns the resolved absolute file path.

### `TraceNest.getReportData([options])`
Returns an object containing raw trace statistics, operation lists, tree nodes, timeline events, and error details.

---

## Express Integration

TraceNest provides optional middleware for Express-compatible web frameworks. It wraps each incoming request in an isolated async context so all downstream database queries, controller logic, and service calls automatically nest under the request:

```javascript
const express = require('express');
const TraceNest = require('tracenest');

const app = express();

TraceNest.start({ name: 'UserAPI', slowOperationThresholdMs: 100 });

// Mount TraceNest middleware
app.use(TraceNest.expressMiddleware({
  ignorePaths: ['/health']
}));

app.get('/users/:id', async (req, res) => {
  const user = await TraceNest.trace('Fetch User Profile', async () => {
    return await TraceNest.trace('SQL: SELECT * FROM users', async () => {
      return db.findUser(req.params.id);
    });
  });

  res.json(user);
});

app.listen(3000);
```

Middleware features:
- Automatically tags requests with an `x-request-id` header or generates a unique ID.
- Sets response headers `X-Trace-Id` and `X-Request-Id`.
- Captures HTTP status code, request method, route path, client IP, and latency.
- Flags HTTP `>= 400` responses as errors.

---

## Command Line Interface (CLI)

TraceNest includes a command line utility to inspect trace files or run scripts with tracing enabled:

```bash
# View formatted report from an exported JSON trace
npx tracenest report ./trace.json

# Adjust slow operation threshold on the fly
npx tracenest report ./trace.json --threshold 50

# Output summary statistics only
npx tracenest summary ./trace.json

# Disable ANSI colors
npx tracenest report ./trace.json --no-color
```

---

## Performance Statistics

TraceNest computes the following metrics on every report:
- **Total Operations**: Number of tracked operations.
- **Success / Error Counts**: Status breakdown and success percentage.
- **Latency Distribution**: Minimum, maximum, average, and percentiles (P50, P90, P95, P99).
- **Slow Operations**: Operations matching or exceeding `slowOperationThresholdMs`.
- **Chronological Timeline**: Step-by-step event sequence with microsecond-level durations.

---

## Verification & Testing

TraceNest comes with an automated test suite implemented with Node.js built-in runner (`node:test`):

```bash
# Run unit, integration, and concurrency tests
npm test

# Run example scripts
npm run example:basic
npm run example:nested
npm run example:express
npm run example:errors
```

---

## License

MIT (c) 2026 Achintya Pandey
