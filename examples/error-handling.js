'use strict';

/**
 * Error Handling & Slow Operation Detection Example
 */
const TraceNest = require('../src/index');

async function main() {
  TraceNest.start({
    name: 'ResilienceDemo',
    slowOperationThresholdMs: 40 // Low threshold to demonstrate slow operation alerts
  });

  // Example 1: Fast successful operation
  await TraceNest.trace('Fast Cache Read', async () => {
    await new Promise(r => setTimeout(r, 10));
    return 'cache_hit';
  });

  // Example 2: Slow operation (will exceed 40ms threshold)
  await TraceNest.trace('Heavy Analytics Aggregation', async () => {
    await new Promise(r => setTimeout(r, 65));
    return 'aggregation_done';
  });

  // Example 3: Operation that fails with an error
  try {
    await TraceNest.trace('External Payment Provider API', async () => {
      TraceNest.track('Sending payment payload');
      await new Promise(r => setTimeout(r, 20));
      const paymentError = new Error('Gateway Timeout 504 from payment processor');
      paymentError.code = 'ERR_GATEWAY_TIMEOUT';
      throw paymentError;
    });
  } catch (err) {
    console.log(`[Handled in main]: Caught expected error: ${err.message}`);
  }

  // Example 4: Nested failure where outer handles it gracefully
  await TraceNest.trace('Fallback Controller', async () => {
    try {
      await TraceNest.trace('Primary Data Source', async () => {
        throw new Error('Primary DB Connection Dropped');
      });
    } catch (_) {
      TraceNest.track('Failing over to replica');
      await TraceNest.trace('Secondary Data Source', async () => {
        await new Promise(r => setTimeout(r, 15));
        return 'replica_data';
      });
    }
  });

  console.log('\n--- Printing Resilience Report ---');
  TraceNest.report();
}

main().catch(console.error);
