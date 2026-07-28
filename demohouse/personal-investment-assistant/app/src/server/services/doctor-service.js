function cleanError(error) {
  return {
    ok: false,
    code: error?.code || 'UNKNOWN_ERROR',
    message: error?.message || 'Unknown error',
  };
}

export async function runDoctor({ dataPro, webSearch, model, repository, live = false }) {
  const startedAt = new Date().toISOString();
  let database;
  try {
    repository.listStocks();
    database = { ok: true };
  } catch (error) {
    database = cleanError(error);
  }
  const checks = await Promise.allSettled([
    dataPro.probe({ live }),
    webSearch.probe({ live }),
    model.probe({ live }),
  ]);
  const providers = {
    datapro: checks[0].status === 'fulfilled' ? checks[0].value : cleanError(checks[0].reason),
    web_search: checks[1].status === 'fulfilled' ? checks[1].value : cleanError(checks[1].reason),
    agent_plan_model: checks[2].status === 'fulfilled' ? checks[2].value : cleanError(checks[2].reason),
  };
  return {
    ok: database.ok && Object.values(providers).every((item) => item.ok),
    live,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    database,
    providers,
  };
}
