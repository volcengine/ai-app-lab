import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  assertPreferenceCoverage,
  assertReportSourcePolicy,
  canonicalSecurityCode,
} from '../skills/investment-assistant/scripts/acceptance-validators.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillRoot = path.join(root, 'skills', 'investment-assistant');
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'investment-assistant-initializer-'));
const configDir = path.join(sandbox, 'config');
const installRoot = path.join(sandbox, 'runtime');
const codexHome = path.join(sandbox, 'codex');
const claudeConfigDir = path.join(sandbox, 'claude');
fs.mkdirSync(configDir, { recursive: true });
fs.writeFileSync(path.join(configDir, 'credentials.env'), [
  'ARK_API_KEY="single-agent-plan-key"',
  'DATAPRO_API_KEY=""',
  'WEB_SEARCH_API_KEY=""',
  '',
].join('\n'), { mode: 0o600 });

process.env.INVESTMENT_ASSISTANT_CONFIG_HOME = configDir;
process.env.INVESTMENT_ASSISTANT_HOME = installRoot;

try {
  const {
    assertApplicationSource,
    configuredCredentials,
    paths,
    sanitizedNpmEnvironment,
  } = await import('../skills/investment-assistant/scripts/lib.mjs');
  const { loadConfig, publicConfig } = await import(
    '../app/src/server/config.js'
  );

  const credentials = configuredCredentials();
  assert.deepEqual(credentials, {
    agent_plan_model: true,
    datapro: true,
    web_search: true,
  });

  const config = loadConfig({
    NODE_ENV: 'test',
    INVESTMENT_ASSISTANT_CONFIG_HOME: configDir,
    INVESTMENT_ASSISTANT_HOME: installRoot,
  });
  assert.equal(config.ark.apiKey, 'single-agent-plan-key');
  assert.equal(config.dataPro.apiKey, 'single-agent-plan-key');
  assert.equal(config.webSearch.apiKey, 'single-agent-plan-key');
  assert.deepEqual(publicConfig(config).providers.web_search, { configured: true });
  assertApplicationSource(paths.sourceApp);
  assert.equal(paths.sourceApp, path.join(root, 'app'));

  const clientInstallations = [
    {
      label: 'Codex',
      script: 'install-codex-skill.mjs',
      environment: { CODEX_HOME: codexHome },
      installedSkill: path.join(codexHome, 'skills', 'investment-assistant'),
    },
    {
      label: 'Claude Code',
      script: 'install-claude-code-skill.mjs',
      environment: { CLAUDE_CONFIG_DIR: claudeConfigDir },
      installedSkill: path.join(claudeConfigDir, 'skills', 'investment-assistant'),
    },
  ];

  for (const client of clientInstallations) {
    const installResult = spawnSync(process.execPath, [
      path.join(root, 'scripts', client.script),
    ], {
      env: { ...process.env, ...client.environment },
      encoding: 'utf8',
    });
    assert.equal(installResult.status, 0, installResult.stderr || installResult.stdout);
    assert.match(installResult.stdout, new RegExp(`${client.label} Skill 已安装`));
    assert.ok(fs.existsSync(path.join(client.installedSkill, 'SKILL.md')));
    assertApplicationSource(path.join(client.installedSkill, 'assets', 'app'));

    const duplicateResult = spawnSync(process.execPath, [
      path.join(root, 'scripts', client.script),
    ], {
      env: { ...process.env, ...client.environment },
      encoding: 'utf8',
    });
    assert.equal(duplicateResult.status, 1);
    assert.match(duplicateResult.stderr, /Skill 已存在/u);

    const updateResult = spawnSync(process.execPath, [
      path.join(root, 'scripts', client.script),
      '--force',
    ], {
      env: { ...process.env, ...client.environment },
      encoding: 'utf8',
    });
    assert.equal(updateResult.status, 0, updateResult.stderr || updateResult.stdout);
    assertApplicationSource(path.join(client.installedSkill, 'assets', 'app'));
  }

  const onboardText = fs.readFileSync(path.join(skillRoot, 'scripts', 'onboard.mjs'), 'utf8');
  assert.doesNotMatch(onboardText, /project\.mjs|--target/u);
  assert.match(onboardText, /--profile/u);
  assert.match(onboardText, /--all/u);
  assert.match(onboardText, /--seed/u);
  assert.match(onboardText, /--skip-initial-reports/u);

  const configureText = fs.readFileSync(path.join(skillRoot, 'scripts', 'configure.mjs'), 'utf8');
  assert.match(configureText, /Agent Plan API Key/u);
  assert.doesNotMatch(configureText, /Harness 联网搜索 API Key|独立 API Key/u);

  const sanitized = sanitizedNpmEnvironment({
    PATH: '/usr/bin',
    ARK_API_KEY: 'secret',
    DATAPRO_API_KEY: 'secret',
    WEB_SEARCH_API_KEY: 'secret',
    INVESTMENT_ASSISTANT_CREDENTIALS_FILE: '/private/credentials.env',
    INVESTMENT_ASSISTANT_HOME: '/private/runtime',
  });
  assert.equal(sanitized.PATH, '/usr/bin');
  for (const key of [
    'ARK_API_KEY',
    'DATAPRO_API_KEY',
    'WEB_SEARCH_API_KEY',
    'INVESTMENT_ASSISTANT_CREDENTIALS_FILE',
    'INVESTMENT_ASSISTANT_HOME',
  ]) {
    assert.equal(sanitized[key], undefined);
  }

  const knownEvidenceIds = new Set(['D1', 'W1']);
  assertPreferenceCoverage({
    preference: '股价走势和行业动态',
    status: 'partial',
    evidence_ids: ['D1'],
    facets: [
      { preference: '股价走势', status: 'covered', evidence_ids: ['D1'] },
      { preference: '行业动态', status: 'watch', evidence_ids: [] },
    ],
  }, '股价走势和行业动态', knownEvidenceIds);
  assert.throws(() => assertPreferenceCoverage({
    preference: '股价走势和行业动态',
    status: 'partial',
    evidence_ids: ['W9'],
    facets: [
      { preference: '股价走势', status: 'covered', evidence_ids: ['W9'] },
      { preference: '行业动态', status: 'watch', evidence_ids: [] },
    ],
  }, '股价走势和行业动态', knownEvidenceIds), /不存在的来源/u);

  assertReportSourcePolicy({
    change_status: 'initial',
    provider_status: {
      web_search: { ok: true, successful_query_count: 2, raw_result_count: 4, result_count: 0 },
    },
    report: {
      analysis: {
        risk_level: 'unknown',
        summary_evidence_ids: ['D1'],
        sections: [{ title: '市场异动', claims: [{ text: '行情事实', evidence_ids: ['D1'] }] }],
        conclusion: { evidence_ids: ['D1'] },
      },
      evidence: [{
        id: 'D1',
        type: 'datapro',
        rows: [{ 最新价: 100, 前收盘价: 99, 涨跌幅: 1.01 }],
      }],
    },
  }, 'monitor');
  assert.throws(() => assertReportSourcePolicy({
    report: {
      analysis: { risk_level: 'unknown' },
      evidence: [{
        id: 'D1',
        type: 'datapro',
        rows: [{ 最新价: 100, 前收盘价: 99, 涨跌幅: 1.01 }],
      }],
    },
  }, 'brief'), /联网搜索证据/u);

  assert.equal(canonicalSecurityCode('AAPL.O'), 'AAPL');
  assert.equal(canonicalSecurityCode('NASDAQ:AAPL'), 'AAPL');

  process.stdout.write(
    'Initializer single-key configuration, Codex and Claude Code isolated installation, self-contained Skill packaging, onboarding flow, credential isolation, and acceptance validators passed.\n',
  );
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}
