import { getProviderStatus } from "../src/config/providerConfig.js";
import { createEnvReader } from "../src/config/runtimeEnv.js";
import { createRuntimePolicy, publicRuntimePolicy } from "../src/config/runtimePolicy.js";

const env = createEnvReader();
const runtimePolicy = createRuntimePolicy({ env });
const providerStatus = getProviderStatus({ env, runtimePolicy });
const requiredProviders = ["datapro", "web_search", "model", "openviking", "supabase"];
const providers = Object.fromEntries(providerStatus.providers.map((provider) => [provider.id, {
  status: provider.status,
  run_enabled: provider.safe_config?.run_enabled ?? null,
  missing: provider.missing,
} ]));
const providerBlockers = requiredProviders.filter((id) => providers[id]?.status !== "configured");
const ok = runtimePolicy.ready && providerBlockers.length === 0;

console.log(JSON.stringify({
  checked_at: new Date().toISOString(),
  ok,
  runtime: publicRuntimePolicy(runtimePolicy),
  providers,
  warnings: [],
  blockers: [
    ...runtimePolicy.blockers,
    ...providerBlockers.map((id) => `${id} is not configured`),
  ],
  live_check_command: "npm run doctor:live",
}, null, 2));

if (!ok) process.exitCode = 1;
