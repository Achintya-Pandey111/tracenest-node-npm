'use strict';

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const http = require('node:http');
const TraceNest = require('../src/index');

// Helper to simulate Express Request and Response
function createMockReqRes({
  method = 'GET',
  url = '/api/users',
  headers = {}
} = {}) {
  const req = {
    method,
    url,
    originalUrl: url,
    path: url,
    headers: { ...headers },
    socket: { remoteAddress: '127.0.0.1' }
  };

  const res = new EventEmitter();
  res.statusCode = 200;
  res.headers = {};
  res.setHeader = function (k, v) {
    res.headers[k.toLowerCase()] = v;
  };
  res.getHeader = function (k) {
    return res.headers[k.toLowerCase()];
  };
  res.end = function () {
    res.emit('finish');
  };

  return { req, res };
}

describe('Express Integration Middleware', () => {
  let server = null;
  const socketPath = '/tmp/tracenest-test.sock';

  beforeEach(() => {
    TraceNest.reset();
    TraceNest.start();
  });

  afterEach((t, done) => {
    if (server) {
      server.close(() => {
        try {
          if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
        } catch (_) {}
        server = null;
        done();
      });
    } else {
      try {
        if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
      } catch (_) {}
      done();
    }
  });

  test('should initialize middleware and track incoming request', (t, done) => {
    const middleware = TraceNest.expressMiddleware();
    const { req, res } = createMockReqRes({ method: 'GET', url: '/api/items' });

    middleware(req, res, () => {
      assert.ok(req.requestId);
      assert.strictEqual(res.getHeader('x-request-id'), req.requestId);

      // Perform nested traced operation inside the request
      TraceNest.trace('Query Items From DB', () => {
        return ['item1', 'item2'];
      });

      res.statusCode = 200;
      res.end();

      const ops = TraceNest.store.getOperations();
      const httpOp = ops.find(o => o.name === 'HTTP GET /api/items');
      const dbOp = ops.find(o => o.name === 'Query Items From DB');

      assert.ok(httpOp, 'Should create HTTP request operation');
      assert.ok(dbOp, 'Should create DB query operation');
      assert.strictEqual(dbOp.parentId, httpOp.id, 'DB operation must be nested under HTTP request');
      assert.strictEqual(httpOp.status, 'SUCCESS');
      assert.strictEqual(httpOp.metadata.statusCode, 200);

      done();
    });
  });

  test('should handle HTTP error status codes (>= 400)', (t, done) => {
    const middleware = TraceNest.expressMiddleware();
    const { req, res } = createMockReqRes({ method: 'POST', url: '/api/login' });

    middleware(req, res, () => {
      res.statusCode = 401;
      res.end();

      const ops = TraceNest.store.getOperations();
      const httpOp = ops.find(o => o.name === 'HTTP POST /api/login');

      assert.ok(httpOp);
      assert.strictEqual(httpOp.status, 'ERROR');
      assert.strictEqual(httpOp.metadata.statusCode, 401);
      assert.ok(httpOp.error.message.includes('HTTP 401'));

      done();
    });
  });

  test('should ignore paths configured in ignorePaths', (t, done) => {
    const middleware = TraceNest.expressMiddleware({
      ignorePaths: ['/health', /^\/metrics/]
    });

    const { req, res } = createMockReqRes({ method: 'GET', url: '/health' });

    middleware(req, res, () => {
      res.end();
      const ops = TraceNest.store.getOperations();
      assert.strictEqual(ops.length, 0, 'Ignored paths should not be recorded');
      done();
    });
  });

  test('should isolate contexts between concurrent requests', async () => {
    const middleware = TraceNest.expressMiddleware();

    async function handleRequest(userId, delayMs) {
      const { req, res } = createMockReqRes({ method: 'GET', url: `/users/${userId}` });

      return new Promise((resolve) => {
        middleware(req, res, async () => {
          await TraceNest.trace(`Fetch Profile ${userId}`, async () => {
            await new Promise(r => setTimeout(r, delayMs));
            TraceNest.track(`Profile data fetched for ${userId}`);
          });

          res.statusCode = 200;
          res.end();
          resolve();
        });
      });
    }

    // Run 3 concurrent requests with different timing
    await Promise.all([
      handleRequest('user_1', 25),
      handleRequest('user_2', 10),
      handleRequest('user_3', 5)
    ]);

    const ops = TraceNest.store.getOperations();
    const req1 = ops.find(o => o.name === 'HTTP GET /users/user_1');
    const req2 = ops.find(o => o.name === 'HTTP GET /users/user_2');
    const req3 = ops.find(o => o.name === 'HTTP GET /users/user_3');

    const sub1 = ops.find(o => o.name === 'Fetch Profile user_1');
    const sub2 = ops.find(o => o.name === 'Fetch Profile user_2');
    const sub3 = ops.find(o => o.name === 'Fetch Profile user_3');

    assert.ok(req1 && req2 && req3);
    assert.ok(sub1 && sub2 && sub3);

    assert.strictEqual(sub1.parentId, req1.id);
    assert.strictEqual(sub2.parentId, req2.id);
    assert.strictEqual(sub3.parentId, req3.id);
  });

  test('should trace full lifecycle with mock request pipeline', (t, done) => {
    const middleware = TraceNest.expressMiddleware();
    const { req, res } = createMockReqRes({
      method: 'GET',
      url: '/orders/search?q=book',
      headers: { 'x-request-id': 'req_custom_123' }
    });

    req.route = { path: '/orders/search' };

    middleware(req, res, async () => {
      assert.strictEqual(req.requestId, 'req_custom_123');
      assert.strictEqual(res.getHeader('x-request-id'), 'req_custom_123');

      await TraceNest.trace('Search Service', async () => {
        await TraceNest.trace('Elasticsearch Query', () => {
          TraceNest.track('Query executed', { hits: 4 });
        });
      });

      res.statusCode = 200;
      res.end();

      const ops = TraceNest.store.getOperations();
      const httpOp = ops.find(o => o.name.includes('/orders/search'));
      const searchOp = ops.find(o => o.name === 'Search Service');
      const esOp = ops.find(o => o.name === 'Elasticsearch Query');

      assert.ok(httpOp);
      assert.ok(searchOp);
      assert.ok(esOp);
      assert.strictEqual(httpOp.metadata.route, '/orders/search');
      assert.strictEqual(searchOp.parentId, httpOp.id);
      assert.strictEqual(esOp.parentId, searchOp.id);

      done();
    });
  });
});
