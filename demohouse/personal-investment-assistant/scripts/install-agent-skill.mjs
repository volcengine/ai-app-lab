import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'skills', 'investment-assistant');
const appSource = path.join(root, 'app');
const skillName = 'investment-assistant';

const targetDefinitions = {
  codex: {
    label: 'Codex',
    configRoot: (environment) => path.resolve(
      environment.CODEX_HOME || path.join(os.homedir(), '.codex'),
    ),
    restartHint: '重新启动 Codex 后即可识别该 Skill。',
  },
  'claude-code': {
    label: 'Claude Code',
    configRoot: (environment) => path.resolve(
      environment.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude'),
    ),
    restartHint: '可在 Claude Code 中输入 /investment-assistant；若当前会话未识别，请重启 Claude Code。',
  },
};

function copyFilter(rootPath, entry) {
  const relative = path.relative(rootPath, entry);
  if (!relative) return true;
  const segments = relative.split(path.sep);
  if (segments.some((segment) => [
    'node_modules',
    'dist',
    '.git',
    'coverage',
    'data',
  ].includes(segment))) return false;
  const name = path.basename(entry);
  if (name === '.DS_Store' || name === '.env') return false;
  if (name.startsWith('.env.') && name !== '.env.example') return false;
  return !/\.(?:sqlite(?:-shm|-wal)?|log|pid)$/i.test(name);
}

function normalizeTarget(value) {
  const target = String(value || '').trim().toLowerCase();
  if (target === 'claude' || target === 'claude_code') return 'claude-code';
  if (target === 'codex' || target === 'claude-code' || target === 'all') return target;
  throw new Error('安装目标必须是 codex、claude-code 或 all。');
}

function requestedTarget(argv, defaultTarget) {
  const targetIndex = argv.indexOf('--target');
  if (targetIndex < 0) return normalizeTarget(defaultTarget);
  const value = argv[targetIndex + 1];
  if (!value || value.startsWith('--')) throw new Error('--target 缺少参数值。');
  return normalizeTarget(value);
}

function installTargets(target, environment) {
  const names = target === 'all' ? ['codex', 'claude-code'] : [target];
  const resolved = names.map((name) => {
    const definition = targetDefinitions[name];
    const skillsRoot = path.join(definition.configRoot(environment), 'skills');
    return {
      ...definition,
      name,
      skillsRoot,
      target: path.join(skillsRoot, skillName),
    };
  });
  const uniqueTargets = new Set(resolved.map((item) => item.target));
  if (uniqueTargets.size !== resolved.length) {
    throw new Error('Codex 与 Claude Code 的 Skill 安装目录不能指向同一路径。');
  }
  return resolved;
}

function assertSource() {
  if (!fs.existsSync(path.join(source, 'SKILL.md'))) {
    throw new Error(`Skill 源目录无效：${source}`);
  }
  if (!fs.existsSync(path.join(appSource, 'package.json'))) {
    throw new Error(`应用源码目录无效：${appSource}`);
  }
}

function installOne(definition, force) {
  fs.mkdirSync(definition.skillsRoot, { recursive: true, mode: 0o700 });
  const staging = path.join(
    definition.skillsRoot,
    `.${skillName}-${randomUUID()}.install`,
  );
  const backup = path.join(definition.skillsRoot, `.${skillName}.previous`);

  try {
    fs.cpSync(source, staging, {
      recursive: true,
      force: true,
      filter: (entry) => copyFilter(source, entry),
    });
    fs.cpSync(appSource, path.join(staging, 'assets', 'app'), {
      recursive: true,
      force: true,
      filter: (entry) => copyFilter(appSource, entry),
    });
    fs.rmSync(backup, { recursive: true, force: true });
    if (fs.existsSync(definition.target)) {
      if (!force) throw new Error(
        `${definition.label} Skill 已存在：${definition.target}。如需更新，请追加 --force。`,
      );
      fs.renameSync(definition.target, backup);
    }
    fs.renameSync(staging, definition.target);
    fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    if (!fs.existsSync(definition.target) && fs.existsSync(backup)) {
      fs.renameSync(backup, definition.target);
    }
    throw error;
  }
}

export function installAgentSkill({
  target = 'codex',
  force = false,
  environment = process.env,
} = {}) {
  assertSource();
  const definitions = installTargets(normalizeTarget(target), environment);
  if (!force) {
    const existing = definitions.find((definition) => fs.existsSync(definition.target));
    if (existing) {
      throw new Error(
        `${existing.label} Skill 已存在：${existing.target}。如需更新，请追加 --force。`,
      );
    }
  }
  for (const definition of definitions) installOne(definition, force);
  return definitions;
}

export function runInstallerCli({
  argv = process.argv.slice(2),
  defaultTarget = 'codex',
  environment = process.env,
} = {}) {
  const target = requestedTarget(argv, defaultTarget);
  const force = argv.includes('--force');
  const installed = installAgentSkill({ target, force, environment });
  for (const definition of installed) {
    process.stdout.write(`${definition.label} Skill 已安装：${definition.target}\n`);
    process.stdout.write(`${definition.restartHint}\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runInstallerCli();
  } catch (error) {
    process.stderr.write(`错误：${error instanceof Error ? error.message : String(error)}\n`);
    if (process.env.DEBUG && error?.stack) process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  }
}
