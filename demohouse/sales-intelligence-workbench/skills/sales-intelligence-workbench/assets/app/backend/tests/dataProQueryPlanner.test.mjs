import assert from "node:assert/strict";
import test from "node:test";
import { DataProProvider } from "../src/providers/dataProProvider.js";

function envReader(values = {}) {
  return {
    value(name, fallback = "") {
      return Object.hasOwn(values, name) ? values[name] : fallback;
    },
    number(name, fallback = 0) {
      const value = Object.hasOwn(values, name) ? Number(values[name]) : fallback;
      return Number.isFinite(value) ? value : fallback;
    },
  };
}

test("DataPro allows slower professional queries while preserving an explicit override", () => {
  assert.equal(new DataProProvider({ env: envReader() }).timeoutMs, 45_000);
  assert.equal(
    new DataProProvider({ env: envReader({ DATAPRO_TIMEOUT_MS: "30000" }) }).timeoutMs,
    30_000,
  );
});

test("dossier query planner selects business, risk, and industry datasets through the same MCP", () => {
  const provider = new DataProProvider({ env: envReader({ DATAPRO_MAX_SOURCES: "4" }) });
  const queries = provider.planDossierQueries({
    name: "示例汽车股份有限公司",
    industry: "新能源汽车整车制造",
    unified_social_credit_code: "91110000123456789X",
    business_scope: "新能源汽车研发、生产与销售",
    registered_capital: "10000万元",
  });

  assert.deepEqual(queries.map((item) => item.label), [
    "企业工商数据库",
    "企业风险数据库",
    "汽车销量数据库",
    "金融数据库",
  ]);
  assert.equal(queries.every((item) => item.query.includes("示例汽车股份有限公司")), true);
});

test("dossier query planner prioritizes business identity when it has not been verified", () => {
  const provider = new DataProProvider({ env: envReader({ DATAPRO_MAX_SOURCES: "2" }) });
  const queries = provider.planDossierQueries({
    name: "示例科技有限公司",
    industry: "企业软件",
  });

  assert.deepEqual(queries.map((item) => item.label), [
    "企业工商数据库",
    "企业风险数据库",
  ]);
});
