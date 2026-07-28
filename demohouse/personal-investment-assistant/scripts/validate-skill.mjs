import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillRoot = path.join(root, 'skills', 'investment-assistant');
const appRoot = path.join(root, 'app');
const skillFile = path.join(skillRoot, 'SKILL.md');
const rootScripts = [
  'scripts/install-agent-skill.mjs',
  'scripts/install-codex-skill.mjs',
  'scripts/install-claude-code-skill.mjs',
  'scripts/test-initializer.mjs',
];
const requiredFiles = [
  'SKILL.md',
  'agents/openai.yaml',
  'scripts/install.mjs',
  'scripts/configure.mjs',
  'scripts/start.mjs',
  'scripts/stop.mjs',
  'scripts/status.mjs',
  'scripts/doctor.mjs',
  'scripts/onboard.mjs',
  'scripts/profile.mjs',
  'scripts/acceptance.mjs',
  'scripts/usage.mjs',
  'scripts/backup.mjs',
  'scripts/restore.mjs',
  'references/acceptance.md',
  'references/setup.md',
  'references/architecture.md',
  'references/evidence-policy.md',
  'references/troubleshooting.md',
];

for (const relative of requiredFiles) {
  if (!fs.existsSync(path.join(skillRoot, relative))) throw new Error(`Skill 缺少文件：${relative}`);
}
for (const relative of rootScripts) {
  if (!fs.existsSync(path.join(root, relative))) throw new Error(`仓库缺少文件：${relative}`);
  const result = spawnSync(process.execPath, ['--check', path.join(root, relative)], {
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(result.stderr || `脚本语法检查失败：${relative}`);
}

for (const relative of [
  'package.json',
  'package-lock.json',
  '.gitignore',
  'README.md',
  'src/server/index.js',
  'src/web',
  'tests',
]) {
  if (!fs.existsSync(path.join(appRoot, relative))) throw new Error(`应用源码缺少文件：app/${relative}`);
}
if (fs.existsSync(path.join(skillRoot, 'assets', 'app'))) {
  throw new Error('仓库中不得保留重复应用源码：skills/investment-assistant/assets/app');
}

for (const obsolete of [
  'scripts/project.mjs',
  'references/development-contract.md',
  'references/project-skill-template.md',
]) {
  if (fs.existsSync(path.join(skillRoot, obsolete))) throw new Error(`Skill 仍包含废弃 Builder 文件：${obsolete}`);
}

for (const entry of fs.readdirSync(path.join(skillRoot, 'scripts'))) {
  if (!entry.endsWith('.mjs')) continue;
  const file = path.join(skillRoot, 'scripts', entry);
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `脚本语法检查失败：${entry}`);
}

const skillText = fs.readFileSync(skillFile, 'utf8');
const frontmatter = skillText.match(/^---\n([\s\S]*?)\n---\n/);
if (!frontmatter) throw new Error('SKILL.md 缺少 YAML frontmatter。');
if (!/^name:\s*investment-assistant\s*$/m.test(frontmatter[1])) throw new Error('Skill name 不正确。');
if (path.basename(skillRoot) !== 'investment-assistant') throw new Error('Skill 目录名必须与 name 一致。');
if (!/^description:\s*\S.+$/m.test(frontmatter[1])) throw new Error('Skill description 不能为空。');
if (!/[\u3400-\u9fff]/.test(frontmatter[1])) throw new Error('Skill description 必须使用中文。');
if (!skillText.includes('# 个人投资助手初始化')) throw new Error('SKILL.md 缺少中文初始化主标题。');
if (/\bTODO\b|\[TODO/.test(skillText)) throw new Error('SKILL.md 仍包含 TODO。');

const stageMarkers = Array.from({ length: 8 }, (_, index) => `## 阶段 ${index}：`);
let previousStageIndex = -1;
for (const marker of stageMarkers) {
  const index = skillText.indexOf(marker);
  if (index < 0 || index <= previousStageIndex) throw new Error(`SKILL.md 阶段缺失或顺序错误：${marker}`);
  previousStageIndex = index;
}

for (const requiredText of [
  '不讨论网站方案',
  '打开即有内容',
  '偏好逐只绑定',
  '同一 Agent Plan Key',
  '结构化配置摘要',
  'node {baseDir}/scripts/onboard.mjs',
  '--skip-initial-reports',
  'node {baseDir}/scripts/acceptance.mjs --all --seed',
  '每只股票至少生成一份个股简评和一份盘后风险摘要',
  '两类报告职责不同',
  '/skills/investment-assistant/SKILL.md',
  'Codex 或 Claude Code',
  'npm run skill:install:codex',
  'npm run skill:install:claude',
  '/investment-assistant',
]) {
  if (!skillText.includes(requiredText)) throw new Error(`SKILL.md 缺少初始化关键规则：${requiredText}`);
}

for (const forbidden of [
  '先给网站方案',
  '等用户确认方案后',
  '从零开发',
  'project.mjs',
  '--target',
  'my-investment-assistant',
  '/skill/investment-assistant/',
]) {
  if (skillText.includes(forbidden)) throw new Error(`SKILL.md 仍包含废弃 Builder 流程：${forbidden}`);
}

const onboardText = fs.readFileSync(path.join(skillRoot, 'scripts', 'onboard.mjs'), 'utf8');
if (/project\.mjs|--target/u.test(onboardText)) throw new Error('onboard.mjs 不得创建第二份用户项目。');
for (const marker of ['--profile', '--all', '--seed', '--skip-initial-reports']) {
  if (!onboardText.includes(marker)) throw new Error(`onboard.mjs 缺少初始化行为：${marker}`);
}

const configureText = fs.readFileSync(path.join(skillRoot, 'scripts', 'configure.mjs'), 'utf8');
if (!configureText.includes('Agent Plan API Key')) throw new Error('configure.mjs 未询问 Agent Plan Key。');
if (/Harness 联网搜索 API Key|独立 API Key/u.test(configureText)) {
  throw new Error('configure.mjs 不得默认要求独立搜索 Key。');
}

const agentText = fs.readFileSync(path.join(skillRoot, 'agents', 'openai.yaml'), 'utf8');
if (!/default_prompt:\s*["'][^"']*[\u3400-\u9fff]/.test(agentText)) {
  throw new Error('agents/openai.yaml 的默认提示必须使用中文。');
}
for (const marker of ['投资偏好', '现成网站', '首份个股简评', '盘后风险摘要']) {
  if (!agentText.includes(marker)) throw new Error(`agents/openai.yaml 缺少：${marker}`);
}

const readmeText = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
for (const marker of [
  '使用一个 Skill 完成初始化',
  '先收集用户配置',
  '打开网站时已经有内容',
  '只需要一枚 Agent Plan Key',
  'Codex 或 Claude Code',
  'npm run skill:install:codex',
  'npm run skill:install:claude',
  '/investment-assistant',
]) {
  if (!readmeText.includes(marker)) throw new Error(`README 缺少主入口说明：${marker}`);
}
if (/Builder|先讨论网站方案|--target/u.test(readmeText)) {
  throw new Error('README 仍包含废弃 Builder 流程。');
}

const installerText = fs.readFileSync(path.join(root, 'scripts', 'install-agent-skill.mjs'), 'utf8');
for (const marker of [
  'CODEX_HOME',
  'CLAUDE_CONFIG_DIR',
  "path.join(os.homedir(), '.codex')",
  "path.join(os.homedir(), '.claude')",
]) {
  if (!installerText.includes(marker)) throw new Error(`双客户端安装器缺少：${marker}`);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
for (const scriptName of [
  'skill:install:codex',
  'skill:install:claude',
  'skill:install:all',
]) {
  if (!packageJson.scripts?.[scriptName]) throw new Error(`package.json 缺少命令：${scriptName}`);
}

const secretPattern = /ark-[A-Za-z0-9]{8,}(?:-[A-Za-z0-9]{4,}){2,}/g;
const ignored = new Set(['node_modules', '.git', 'dist']);
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (fs.statSync(target).size < 2_000_000) {
      const text = fs.readFileSync(target, 'utf8');
      if (secretPattern.test(text)) throw new Error(`发现疑似 Agent Plan 密钥：${path.relative(root, target)}`);
      secretPattern.lastIndex = 0;
    }
  }
}
walk(root);

process.stdout.write('Skill initialization structure, behavior, syntax, and credential scan passed.\n');
