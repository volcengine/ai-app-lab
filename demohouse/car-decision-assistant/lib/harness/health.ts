import {
  AgentPlanClient,
  createAgentPlanClient,
} from "./agent-plan";
import { createDataProClient, DataProClient } from "./datapro";
import type {
  ClientRuntimeOptions,
  HarnessHealth,
  HarnessHealthStatus,
} from "./types";

export type HarnessClients = {
  agentPlan: AgentPlanClient;
  dataPro: DataProClient;
};

export type CheckHarnessHealthOptions = {
  agentPlan?: AgentPlanClient;
  dataPro?: DataProClient;
  runtime?: ClientRuntimeOptions;
  live?: boolean;
};

export type UnifiedHarnessHealth = {
  status: HarnessHealthStatus;
  live: boolean;
  checked_at: string;
  services: {
    agent_plan: HarnessHealth;
    datapro: HarnessHealth;
  };
};

export const AGENT_PLAN_OPERATION_TIMEOUT_MS = 20_000;
export const DATAPRO_OPERATION_TIMEOUT_MS = 45_000;

function withDefaultTimeout(
  runtime: ClientRuntimeOptions,
  timeoutMs: number,
): ClientRuntimeOptions {
  return {
    ...runtime,
    timeoutMs: runtime.timeoutMs ?? timeoutMs,
  };
}

export function createHarnessClients(
  runtime: ClientRuntimeOptions = {},
): HarnessClients {
  return {
    agentPlan: createAgentPlanClient(
      withDefaultTimeout(runtime, AGENT_PLAN_OPERATION_TIMEOUT_MS),
    ),
    dataPro: createDataProClient(
      withDefaultTimeout(runtime, DATAPRO_OPERATION_TIMEOUT_MS),
    ),
  };
}

function aggregateStatus(
  services: HarnessHealth[],
): HarnessHealthStatus {
  if (services.every((service) => service.status === "ok")) {
    return "ok";
  }
  if (services.every((service) => service.status === "unavailable")) {
    return "unavailable";
  }
  return "degraded";
}

export async function checkHarnessHealth(
  options: CheckHarnessHealthOptions = {},
): Promise<UnifiedHarnessHealth> {
  const fallbackClients = createHarnessClients(options.runtime);
  const agentPlan = options.agentPlan ?? fallbackClients.agentPlan;
  const dataPro = options.dataPro ?? fallbackClients.dataPro;
  const live = options.live ?? false;

  const [agentPlanHealth, dataProHealth] = await Promise.all([
    agentPlan.health(live),
    dataPro.health(live),
  ]);
  const services = [agentPlanHealth, dataProHealth];

  return {
    status: aggregateStatus(services),
    live,
    checked_at: new Date().toISOString(),
    services: {
      agent_plan: agentPlanHealth,
      datapro: dataProHealth,
    },
  };
}
