import { loadConfig } from '../src/server/config.js';
import { createRuntime } from '../src/server/bootstrap.js';
import { runDoctor } from '../src/server/services/doctor-service.js';
import { writeProviderHealth } from '../src/server/services/provider-health.js';

const live = process.argv.includes('--live');
const config = loadConfig();
const runtime = createRuntime(config);
try {
  const result = await runDoctor({ ...runtime, live });
  writeProviderHealth(config, result);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
} finally {
  runtime.repository.close();
}
