import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createStaticFrontend } from "../src/frontend/staticFrontend.js";

function createResponse() {
  return {
    body: null,
    headers: {},
    statusCode: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    writeHead(statusCode) {
      this.statusCode = statusCode;
    },
    end(body = null) {
      this.body = body;
    },
  };
}

async function withFrontend(run) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "sales-frontend-"));
  try {
    await writeFile(path.join(rootDir, "index.html"), "<!doctype html><title>Sales</title>");
    await writeFile(path.join(rootDir, "app.js"), "window.sales = true;");
    await run(createStaticFrontend({ rootDir }));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

test("serves the workbench index from the root path", async () => {
  await withFrontend(async (serve) => {
    const response = createResponse();
    assert.equal(await serve({ method: "GET" }, response, "/"), true);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "text/html; charset=utf-8");
    assert.equal(response.headers["cache-control"], "no-store");
    assert.match(response.body.toString(), /Sales/);
  });
});

test("serves assets without returning a response body for HEAD", async () => {
  await withFrontend(async (serve) => {
    const response = createResponse();
    assert.equal(await serve({ method: "HEAD" }, response, "/app.js"), true);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-type"], "text/javascript; charset=utf-8");
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.body, null);
  });
});

test("does not handle API paths", async () => {
  await withFrontend(async (serve) => {
    const response = createResponse();
    assert.equal(await serve({ method: "GET" }, response, "/api/health"), false);
    assert.equal(response.statusCode, null);
  });
});

test("rejects encoded parent-directory traversal", async () => {
  await withFrontend(async (serve) => {
    const response = createResponse();
    assert.equal(await serve({ method: "GET" }, response, "/%2e%2e/secret.txt"), false);
    assert.equal(response.statusCode, null);
  });
});

test("returns control to the API router for missing files", async () => {
  await withFrontend(async (serve) => {
    const response = createResponse();
    assert.equal(await serve({ method: "GET" }, response, "/missing.js"), false);
    assert.equal(response.statusCode, null);
  });
});
