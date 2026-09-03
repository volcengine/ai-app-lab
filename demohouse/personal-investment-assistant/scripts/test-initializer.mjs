import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

function createRecognizedLegacyApp(appRoot) {
  fs.writeFileSync(path.join(path.dirname(appRoot), 'package.json'), JSON.stringify({
    name: 'investment-assistant-oss',
    private: true,
    version: '0.3.0',
  }));
  fs.mkdirSync(path.join(appRoot, 'src', 'server'), { recursive: true });
  fs.mkdirSync(path.join(appRoot, 'src', 'web'), { recursive: true });
  fs.mkdirSync(path.join(appRoot, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(appRoot, 'package.json'), JSON.stringify({
    name: '@investment-assistant/app',
    version: '0.3.0',
  }));
  fs.writeFileSync(path.join(appRoot, 'package-lock.json'), '{}\n');
  fs.writeFileSync(path.join(appRoot, 'src', 'server', 'index.js'), '// stale adjacent app\n');
  fs.writeFileSync(path.join(appRoot, 'scripts', 'check.mjs'), '// stale adjacent app\n');
}
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

    const adjacentApp = path.resolve(client.installedSkill, '..', '..', 'app');
    createRecognizedLegacyApp(adjacentApp);
    const installedLib = pathToFileURL(path.join(client.installedSkill, 'scripts', 'lib.mjs')).href;
    const sourceSelection = spawnSync(process.execPath, [
      '--input-type=module',
      '--eval',
      `const { paths } = await import(${JSON.stringify(installedLib)}); process.stdout.write(paths.sourceApp);`,
    ], {
      env: { ...process.env, ...client.environment },
      encoding: 'utf8',
    });
    assert.equal(sourceSelection.status, 0, sourceSelection.stderr || sourceSelection.stdout);
    assert.equal(
      fs.realpathSync(sourceSelection.stdout),
      fs.realpathSync(path.join(client.installedSkill, 'assets', 'app')),
      `${client.label} 安装后必须优先使用 Skill 内嵌应用，不能误用客户端目录旁的旧 app。`,
    );

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

  const allSandbox = path.join(sandbox, 'all-clients');
  const allInstall = spawnSync(process.execPath, [
    path.join(root, 'scripts', 'install-agent-skill.mjs'),
    '--target',
    'all',
  ], {
    env: {
      ...process.env,
      CODEX_HOME: path.join(allSandbox, 'codex'),
      CLAUDE_CONFIG_DIR: path.join(allSandbox, 'claude'),
    },
    encoding: 'utf8',
  });
  assert.equal(allInstall.status, 0, allInstall.stderr || allInstall.stdout);
  assert.ok(fs.existsSync(path.join(
    allSandbox,
    'codex',
    'skills',
    'investment-assistant',
    'SKILL.md',
  )));
  assert.ok(fs.existsSync(path.join(
    allSandbox,
    'claude',
    'skills',
    'investment-assistant',
    'SKILL.md',
  )));

  const commandPrinter = path.join(root, 'scripts', 'print-public-skill-command.mjs');
  const commandCases = [
    {
      args: ['--official'],
      expected: '帮我初始化个人投资助手：https://github.com/volcengine/ai-app-lab/blob/main/demohouse/personal-investment-assistant/skills/investment-assistant/SKILL.md',
    },
    {
      args: ['--repository', 'https://github.com/3494036618-eng/personal-investment-assistant', '--ref', 'v0.3.1'],
      expected: '帮我初始化个人投资助手：https://github.com/3494036618-eng/personal-investment-assistant/blob/v0.3.1/skills/investment-assistant/SKILL.md',
    },
    {
      args: ['--official-ref', '0123456789abcdef0123456789abcdef01234567'],
      expected: '帮我初始化个人投资助手：https://github.com/volcengine/ai-app-lab/blob/0123456789abcdef0123456789abcdef01234567/demohouse/personal-investment-assistant/skills/investment-assistant/SKILL.md',
    },
  ];
  for (const testCase of commandCases) {
    const result = spawnSync(process.execPath, [commandPrinter, ...testCase.args], {
      env: process.env,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), testCase.expected);
  }
  for (const args of [
    ['--repository', 'https://github.com/3494036618-eng/personal-investment-assistant', '--ref', 'main'],
    ['--repository', 'https://github.com/wrong-owner/personal-investment-assistant', '--ref', 'v0.3.1'],
    ['--official-ref', '0123456789abcdef'],
  ]) {
    const rejected = spawnSync(process.execPath, [commandPrinter, ...args], {
      env: process.env,
      encoding: 'utf8',
    });
    assert.equal(rejected.status, 1);
    assert.doesNotMatch(rejected.stderr, /\n\s+at |file:\/\/|\/Users\//);
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
