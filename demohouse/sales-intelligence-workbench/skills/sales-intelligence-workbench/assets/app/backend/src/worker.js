import { createRuntimeContext } from "./app.js";
import { JobWorker } from "./workers/jobWorker.js";

const context = createRuntimeContext();
const enabled = ["1", "true", "yes", "on"].includes(
  String(context.env.value("ASYNC_JOBS_ENABLED", "true")).toLowerCase(),
);

if (!enabled) {
  console.log("sales-job-worker disabled by ASYNC_JOBS_ENABLED");
  process.exit(0);
}

const worker = new JobWorker({
  repository: context.salesRepository,
  salesService: context.salesService,
  env: context.env,
});

const stop = () => worker.stop();
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

await worker.run();
