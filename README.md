# TraceNest

> Lightweight, zero-dependency async execution tracing for Node.js applications.

## Overview
TraceNest provides async execution context tracking and hierarchical performance monitoring.

## Quick Start

```javascript
const TraceNest = require('tracenest-node');
TraceNest.start();
```

## Express Middleware

```javascript
const { expressMiddleware } = require('tracenest-node');
app.use(expressMiddleware());
```

## CLI Usage

```bash
npx tracenest report ./trace.json
npx tracenest summary ./trace.json
```
