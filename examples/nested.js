'use strict';

/**
 * Nested Operations Example for TraceNest
 */
const TraceNest = require('../src/index');

async function processOrder(orderId) {
  return TraceNest.trace('Process Order', async () => {
    TraceNest.track('Order received', { orderId });

    // Step 1: Validate User Session
    await TraceNest.trace('Validate User Session', async () => {
      await new Promise(r => setTimeout(r, 15));
      TraceNest.track('Session valid');
    });

    // Step 2: Inventory Check & Reserve
    await TraceNest.trace('Inventory Verification', async () => {
      await TraceNest.trace('Query Warehouse DB', async () => {
        await new Promise(r => setTimeout(r, 25));
      });
      await TraceNest.trace('Reserve Items', async () => {
        await new Promise(r => setTimeout(r, 20));
      });
    });

    // Step 3: Payment Processing
    await TraceNest.trace('Charge Payment', async () => {
      await TraceNest.trace('Contact Payment Gateway (Stripe)', async () => {
        // Simulating a slightly slower external API call
        await new Promise(r => setTimeout(r, 80));
      });
      TraceNest.track('Payment authorized');
    });

    // Step 4: Dispatch Notification
    await TraceNest.trace('Send Confirmation Email', async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    return { orderId, status: 'CONFIRMED' };
  });
}

async function main() {
  TraceNest.start({
    name: 'ECommerceCheckout',
    slowOperationThresholdMs: 60
  });

  const orderResult = await processOrder('ord_998822');
  console.log('Order processed successfully:', orderResult);

  // Export report to JSON
  const jsonFile = TraceNest.exportJSON('./examples/ecommerce-trace.json');
  console.log(`Exported JSON report to: ${jsonFile}\n`);

  // Display rich console report
  TraceNest.report();
}

main().catch(console.error);
