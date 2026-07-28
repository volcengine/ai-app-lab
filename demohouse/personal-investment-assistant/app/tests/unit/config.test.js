import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, publicConfig } from '../../src/server/config.js';

test('honors isolated Skill config and data roots', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'investment-assistant-config-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const configHome = path.join(directory, 'config');
  const installHome = path.join(directory, 'data');
  fs.mkdirSync(configHome, { recursive: true });
  fs.writeFileSync(path.join(configHome, 'credentials.env'), [
    'ARK_API_KEY="test-ark"',
    'DATAPRO_API_KEY="test-datapro"',
    'WEB_SEARCH_API_KEY="test-search"',
    '',
  ].join('\n'));

  const config = loadConfig({
    NODE_ENV: 'test',
    INVESTMENT_ASSISTANT_CONFIG_HOME: configHome,
    INVESTMENT_ASSISTANT_HOME: installHome,
  });
  assert.equal(config.credentialsFile, path.join(configHome, 'credentials.env'));
  assert.equal(config.dataDir, installHome);
  assert.equal(config.databasePath, path.join(installHome, 'investment-assistant.sqlite'));
  assert.equal(config.ark.apiKey, 'test-ark');
  assert.equal(config.webSearch.apiKey, 'test-search');
  assert.equal(config.reportRetryCount, 1);
  assert.equal(config.semanticPreferenceEnabled, true);
});

test('uses the Agent Plan key for DataPro and web search by default', () => {
  const config = loadConfig({
    NODE_ENV: 'test',
    ARK_API_KEY: 'shared-key',
    DATAPRO_API_KEY: '',
    WEB_SEARCH_API_KEY: '',
  });
  assert.equal(config.dataPro.apiKey, 'shared-key');
  assert.equal(config.webSearch.apiKey, 'shared-key');
  assert.deepEqual(publicConfig(config).providers.web_search, {
    configured: true,
  });
});
