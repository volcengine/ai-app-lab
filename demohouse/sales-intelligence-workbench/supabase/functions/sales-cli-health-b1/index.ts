Deno.serve((req) => {
  const url = new URL(req.url);
  const body = {
    ok: true,
    service: "sales-cli-health-b1",
    scenario: "supabase-new-cli-sales-workbench-test",
    method: req.method,
    path: url.pathname,
    checkedAt: new Date().toISOString(),
  };

  return new Response(JSON.stringify(body), {
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
});
