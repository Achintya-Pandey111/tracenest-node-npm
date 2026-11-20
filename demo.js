const TraceNest = require("./src");

TraceNest.start();

async function main() {
  await TraceNest.trace("Main operation", async () => {
    await TraceNest.trace("Database query", async () => {
      await new Promise(resolve => setTimeout(resolve, 300));
    });

    await TraceNest.trace("Processing data", async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });

  TraceNest.exportJSON("./trace-report.json");
}

main();