'use strict';

const { createRequestId } = require('../utils/identifiers');

/**
 * Creates Express middleware for tracing HTTP requests and associating downstream operations.
 *
 * @param {import('../core/tracer').Tracer} tracer
 * @param {object} [options]
 * @param {string} [options.headerName='x-request-id']
 * @param {boolean} [options.injectHeader=true] Whether to set response headers X-Trace-Id and X-Request-Id
 * @param {Array<string|RegExp>} [options.ignorePaths=[]] Paths to exclude from tracing
 * @returns {Function} Express middleware (req, res, next)
 */
function createExpressMiddleware(tracer, options = {}) {
  const headerName = (options.headerName || 'x-request-id').toLowerCase();
  const injectHeader = options.injectHeader !== false;
  const ignorePaths = options.ignorePaths || [];

  return function tracenestMiddleware(req, res, next) {
    if (!tracer.isEnabled()) {
      return next();
    }

    // Check if path is in ignore list
    const reqPath = req.path || req.url || '';
    for (const pattern of ignorePaths) {
      if (typeof pattern === 'string' && reqPath === pattern) {
        return next();
      }
      if (pattern instanceof RegExp && pattern.test(reqPath)) {
        return next();
      }
    }

    // Extract or generate request ID
    const requestId = (req.headers && req.headers[headerName]) || createRequestId();
    req.requestId = requestId;
    req.traceId = tracer.traceId;

    if (injectHeader) {
      if (typeof res.setHeader === 'function') {
        if (tracer.traceId) res.setHeader('X-Trace-Id', tracer.traceId);
        res.setHeader('X-Request-Id', requestId);
      }
    }

    const method = req.method || 'GET';
    const rawUrl = req.originalUrl || req.url || '/';
    const opName = `HTTP ${method} ${req.path || rawUrl}`;

    const metadata = {
      httpMethod: method,
      url: rawUrl,
      path: req.path || reqPath,
      requestId,
      ip: req.ip || (req.socket && req.socket.remoteAddress),
      userAgent: req.headers && req.headers['user-agent']
    };

    // Begin the HTTP operation
    const operation = tracer.begin(opName, metadata);
    let ended = false;

    const cleanup = (error = null) => {
      if (ended) return;
      ended = true;

      const statusCode = res.statusCode || 200;
      operation.annotate('statusCode', statusCode);

      // If route pattern is available (e.g. /users/:id), record it
      if (req.route && req.route.path) {
        operation.annotate('route', `${req.baseUrl || ''}${req.route.path}`);
      }

      if (error) {
        operation.fail(error);
      } else if (statusCode >= 400) {
        const httpError = new Error(`HTTP ${statusCode} ${res.statusMessage || 'Request Error'}`);
        httpError.statusCode = statusCode;
        operation.fail(httpError);
      } else {
        operation.end();
      }
    };

    // Listen on response finish
    res.on('finish', () => {
      cleanup(null);
    });

    // Listen on aborted connection
    res.on('close', () => {
      if (!res.writableEnded && !res.finished) {
        cleanup(new Error('HTTP request connection closed before response completed'));
      }
    });

    // Run downstream middleware & route handlers inside child context
    const childContext = tracer.contextManager.createChildContext(operation, {
      requestId,
      isHttpRequest: true
    });

    return tracer.contextManager.run(childContext, () => {
      return next();
    });
  };
}

/**
 * Express error handling middleware to capture route errors.
 * @param {import('../core/tracer').Tracer} tracer
 * @returns {Function} (err, req, res, next)
 */
function createExpressErrorMiddleware(tracer) {
  return function tracenestErrorHandler(err, req, res, next) {
    if (tracer.isEnabled()) {
      const activeOp = tracer.contextManager.getActiveOperation();
      if (activeOp) {
        activeOp.annotate('hasError', true);
        activeOp.track('Express error encountered', {
          errorMessage: err.message,
          errorName: err.name
        });
      }
    }
    return next(err);
  };
}

module.exports = {
  createExpressMiddleware,
  createExpressErrorMiddleware
};
