import vinext from "vinext";
import { defineConfig } from "vite";
import { sites } from "./build/sites-vite-plugin.js";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

type HostEnvironment = Record<string, string | undefined>;

/**
 * Forward the host-only Agent Plan key to the local Worker runtime. Production
 * builds deliberately receive no value; Sites injects its own server bindings.
 */
export function resolveLocalWorkerVars(
  command: "build" | "serve",
  environment: HostEnvironment = process.env,
): Record<string, string> {
  if (command !== "serve") return {};

  return Object.fromEntries(
    [
      "AGENT_PLAN_API_KEY",
      "PROJECT_STORAGE_BACKEND",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_ANON_KEY",
    ].flatMap((name) => {
      const value = environment[name]?.trim();
      return value ? [[name, value]] : [];
    }),
  );
}

export default defineConfig(async ({ command }) => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  const localBindingConfig = {
    main: "./worker/index.ts",
    compatibility_flags: ["nodejs_compat"],
    vars: resolveLocalWorkerVars(command),
    // Project persistence is provided by the AI Native application
    // development foundation (Supabase), so no user-specific Sites/D1/R2
    // binding is required in the public repository.
    d1_databases: [],
    r2_buckets: [],
  };

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: isCodexSeatbeltSandbox
      ? { watch: { useFsEvents: false, usePolling: true } }
      : undefined,
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
