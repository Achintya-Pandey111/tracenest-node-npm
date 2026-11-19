'use strict';

/**
 * Express Integration Example for TraceNest
 *
 * Demonstrates how to use TraceNest.expressMiddleware() to automatically
 * trace incoming HTTP requests and nest all controller, service, and database
 * operations under the corresponding HTTP request context.
 */
const { EventEmitter } = require('node:events');
const TraceNest = require('../src/index');

// 1. Initialize TraceNest
TraceNest.start({
  name: 'ExpressUserService',
  slowOperationThresholdMs: 40
});

// 2. Create TraceNest Express middleware
const middleware = TraceNest.expressMiddleware({
  ignorePaths: ['/health']
});

// Simulated service functions
async function fetchUserFromDatabase(userId) {
  return TraceNest.trace('Postgres SELECT * FROM users WHERE id = ?', async () => {
    TraceNest.track('Acquired connection from pool');
    await new Promise(r => setTimeout(r, 25));
    return { id: userId, username: 'octocat', role: 'developer' };
  });
}

async function fetchUserPermissions(role) {
  return TraceNest.trace('Redis GET permissions:role', async () => {
    await new Promise(r => setTimeout(r, 10));
    return ['read', 'write', 'deploy'];
  });
}

// Simulated Express Route Handler
async function getUserRouteHandler(req, res) {
  TraceNest.track('Route handler invoked', { path: req.path });

  const userId = req.params.id;
  const user = await fetchUserFromDatabase(userId);
  const permissions = await fetchUserPermissions(user.role);

  const payload = { ...user, permissions };
  res.statusCode = 200;
  res.end(JSON.stringify(payload));
}

// Simulated Request Runner
function simulateIncomingRequest(method, url, params = {}) {
  return new Promise((resolve) => {
    const req = {
      method,
      url,
      originalUrl: url,
      path: url,
      params,
      headers: {
        'user-agent': 'curl/7.88.1',
        'x-request-id': `req_client_${Date.now()}`
      }
    };

    const res = new EventEmitter();
    res.statusCode = 200;
    res.headers = {};
    res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
    res.getHeader = (k) => res.headers[k.toLowerCase()];
    res.end = (chunk) => {
      res.emit('finish');
      resolve({ req, res, body: chunk });
    };

    // Pass through TraceNest middleware into handler
    middleware(req, res, async () => {
      await getUserRouteHandler(req, res);
    });
  });
}

async function main() {
  console.log('Simulating incoming HTTP request: GET /api/v1/users/42\n');

  const { req, res, body } = await simulateIncomingRequest('GET', '/api/v1/users/42', { id: 42 });

  console.log(`Response Status:  ${res.statusCode}`);
  console.log(`Response Body:    ${body}`);
  console.log(`Assigned Trace:   ${req.traceId}`);
  console.log(`Response Header:  X-Request-Id = ${res.getHeader('x-request-id')}`);

  console.log('\n--- TraceNest Report for Express Request ---');
  TraceNest.report();
}

main().catch(console.error);
