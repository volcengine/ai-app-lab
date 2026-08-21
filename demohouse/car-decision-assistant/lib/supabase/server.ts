import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function requiredServerEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Supabase 服务端配置缺失：${name}`);
  }
  return value;
}

/**
 * Server-only client. The service-role key must never be exposed through a
 * NEXT_PUBLIC_ or VITE_ variable, browser bundle, response body or log.
 */
export function getSupabaseServerClient(): SupabaseClient {
  if (client) return client;
  client = createClient(
    requiredServerEnvironment("SUPABASE_URL"),
    requiredServerEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
  return client;
}

export function resetSupabaseServerClientForTests() {
  client = null;
}
