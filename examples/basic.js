'use strict';

/**
 * Basic Usage Example for TraceNest
 */
const TraceNest = require('../src/index');

async function main() {
  console.log('--- Starting TraceNest Basic Example ---');

  // 1. Start TraceNest
  TraceNest.start({
    name: 'BasicExampleApp',
    slowOperationThresholdMs: 50
  });

  // 2. Track point-in-time milestone events
  TraceNest.track('Application boot', { env: 'development' });
  TraceNest.track('Connected to cache', { host: 'redis://127.0.0.1:6379' });

  // 3. Track manual begin/end operation
  const manualOp = TraceNest.begin('Manual Data Preparation');
  manualOp.annotate('format', 'JSON');
  await new Promise(resolve => setTimeout(resolve, 30));
  manualOp.end();

  // 4. Trace synchronous function
  const computedValue = TraceNest.trace('Compute Hash', () => {
    let sum = 0;
    for (let i = 0; i < 100000; i++) sum += i;
    return sum;
  });
  console.log(`Computed value: ${computedValue}`);

  // 5. Trace asynchronous function
  const user = await TraceNest.trace('Fetch User Profile', async () => {
    await new Promise(resolve => setTimeout(resolve, 40));
    return { id: 42, username: 'dev_user' };
  });
  console.log(`Fetched user: ${user.username}`);

  // 6. Generate and print the execution report
  console.log('\n--- Printing Execution Report ---');
  TraceNest.report();
}

main().catch(console.error);
