import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("ships the selected single-page decision board", async () => {
  const [page, app, css, layout] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/decision-app.tsx", root), "utf8"),
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
  ]);

  assert.match(page, /createDemoDecisionProject/);
  assert.match(page, /<DecisionApp/);
  assert.match(
    app,
    /按你的<span>真实需求<\/span>，<span>验清<\/span>每一款车/,
  );
  assert.match(app, /一眼看清满足、冲突与待确认项/);
  assert.match(app, /只看待确认项/);
  assert.match(app, /城市车系数据趋势/);
  assert.match(app, /series\.statisticLabel/);
  assert.match(app, /<polyline/);
  assert.match(app, /market-tooltip/);
  assert.match(app, /market-tooltip-rows/);
  assert.match(app, /重新选择车型/);
  assert.match(app, /添加第\s*\{slotIndex \+ 1\}\s*款车/);
  assert.match(app, /数据来源/);
  assert.match(app, /专业数据集/);
  assert.doesNotMatch(app, /豆包搜索/);
  assert.match(app, /我的确认信息/);
  assert.match(app, /记录书面确认/);
  assert.match(app, /恢复购车决策助手项目/);
  assert.match(app, /删除当前项目/);
  assert.match(css, /2026 desktop decision cockpit/);
  assert.match(
    css,
    /decision-workspace[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*390px/,
  );
  assert.match(
    css,
    /comparison-matrix[\s\S]*grid-template-columns:\s*250px\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(css, /min-width:\s*1280px/);
  assert.match(layout, /购车决策助手/);
  assert.doesNotMatch(
    app,
    /推荐分|适合度|保存方案|历史方案|补充关键信息|type=["']file["']|type=["']tel["']/,
  );
  assert.doesNotMatch(
    app,
    /刷新配置数据|刷新数据|\/api\/project\/refresh/,
  );
  assert.match(app, /首次生成已经完成全部查询/);
  assert.match(app, /暂无可靠数据/);
  assert.doesNotMatch(app, /market-point-value/);
  assert.doesNotMatch(app, /交互示例|示例证据|重置示例|trace_id:|log_id:/);
});

test("build output contains the frontend, APIs, and hosting metadata", async () => {
  await Promise.all([
    access(new URL("dist/server/index.js", root)),
    access(new URL("dist/client/.vite/manifest.json", root)),
  ]);
});

test("keeps secrets server-side and out of the client bundle", async () => {
  const [client, environmentExample] = await Promise.all([
    readFile(new URL("app/decision-app.tsx", root), "utf8"),
    readFile(new URL(".env.example", root), "utf8"),
  ]);

  assert.doesNotMatch(client, /AGENT_PLAN_API_KEY|X-Agent-Plan-Key|x-api-key/);
  assert.match(environmentExample, /^AGENT_PLAN_API_KEY=$/m);
  assert.doesNotMatch(environmentExample, /ark-[a-z0-9-]{20,}/i);
});
