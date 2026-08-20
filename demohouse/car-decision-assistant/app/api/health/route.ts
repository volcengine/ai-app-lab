import { createHarnessClients } from "@/lib/harness";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const live = request.nextUrl.searchParams.get("live") === "1";
  const clients = createHarnessClients();
  const [agentPlan, dataPro] = await Promise.all([
    clients.agentPlan.health(live),
    clients.dataPro.health(live),
  ]);
  const status =
    agentPlan.status === "ok" && dataPro.status === "ok"
      ? "ok"
      : agentPlan.status === "unavailable" &&
          dataPro.status === "unavailable"
        ? "unavailable"
        : "degraded";
  const health = {
    status,
    live,
    checked_at: new Date().toISOString(),
    services: {
      agent_plan: agentPlan,
      datapro: dataPro,
    },
  };
  return NextResponse.json(health, {
    status: health.status === "unavailable" ? 503 : 200,
    headers: { "cache-control": "no-store" },
  });
}
