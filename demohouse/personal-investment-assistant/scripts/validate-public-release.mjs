import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ignoredDirectories = new Set(['.git', 'coverage', 'dist', 'node_modules']);
const requiredPaths = [
  '.github/workflows/ci.yml',
  'CONTRIBUTING.md',
  'LICENSE',
  'PRIVACY.md',
  'README.md',
  'SECURITY.md',
  'SUPPORT.md',
  'app/.env.example',
  'app/package-lock.json',
  'app/package.json',
  'docs/release-checklist.md',
  'package.json',
  'scripts/print-public-skill-command.mjs',
  'scripts/test-release-checkout.mjs',
  'scripts/validate-public-release.mjs',
  'scripts/validate-release-checkout.mjs',
  'scripts/verify-public-install.mjs',
  'skills/investment-assistant/SKILL.md',
];
const forbiddenFilePatterns = [
  /^\.DS_Store$/i,
  /^\.env$/i,
  /^\.env\.(?!example$|sample$)/i,
  /\.(?:db|log|mov|mp4|mkv|p12|pem|pfx|pid|sqlite|sqlite3)$/i,
];
const publicContentRules = [
  { id: 'macos_user_path', pattern: /\/Users\/[^/\s"'`]+/ },
  { id: 'macos_temporary_path', pattern: /\/var\/folders\// },
  { id: 'clipboard_artifact', pattern: /codex-clipboard/i },
  {
    id: 'unexpected_investment_repository',
    pattern: /github\.com\/(?!3494036618-eng\/personal-investment-assistant(?:\.git)?(?:[\/\s`'"),;]|$)|volcengine\/ai-app-lab(?:[\/\s`'"),;]|$))[^/\s]+\/personal-investment-assistant/i,
  },
  { id: 'possible_agent_plan_key', pattern: /ark-[A-Za-z0-9]{8,}(?:-[A-Za-z0-9]{4,}){2,}/ },
];
const contentScanExclusions = new Set([
  'scripts/test-release-checkout.mjs',
  'scripts/test-initializer.mjs',
  'scripts/validate-public-release.mjs',
  'scripts/validate-skill.mjs',
]);

function normalize(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function walkFiles(current, output = []) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      output.push(path.join(current, entry.name));
      continue;
    }
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) walkFiles(path.join(current, entry.name), output);
      continue;
    }
    if (entry.isFile()) output.push(path.join(current, entry.name));
  }
  return output;
}

function releaseFiles() {
  const tracked = spawnSync(
    'git',
    ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
  );
  if (tracked.status === 0) {
    return tracked.stdout
      .split('\0')
      .filter(Boolean)
      .map((relativePath) => path.join(root, relativePath))
      .filter((filePath) => fs.existsSync(filePath));
  }
  return walkFiles(root);
}

function isText(bytes) {
  return !bytes.subarray(0, 4096).includes(0);
}

function markdownLinkIssues(relativePath, text) {
  const issues = [];
  const linkPattern = /!?\[[^\]]*]\(([^)]+)\)/g;
  for (const match of text.matchAll(linkPattern)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, '').split(/\s+["']/)[0];
    if (!rawTarget || /^(?:#|https?:\/\/|mailto:)/i.test(rawTarget)) continue;
    const targetWithoutAnchor = rawTarget.split('#')[0];
    if (!targetWithoutAnchor) continue;
    let decodedTarget = targetWithoutAnchor;
    try {
      decodedTarget = decodeURIComponent(targetWithoutAnchor);
    } catch {
      issues.push(`${relativePath}: invalid URL encoding in Markdown link ${rawTarget}`);
      continue;
    }
    const resolved = path.resolve(root, path.dirname(relativePath), decodedTarget);
    if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
      issues.push(`${relativePath}: Markdown link escapes repository ${rawTarget}`);
    } else if (!fs.existsSync(resolved)) {
      issues.push(`${relativePath}: broken Markdown link ${rawTarget}`);
    }
  }
  return issues;
}

const issues = [];
const files = releaseFiles();
const relativeFiles = new Set(files.map((filePath) => normalize(path.relative(root, filePath))));

for (const requiredPath of requiredPaths) {
  if (!relativeFiles.has(requiredPath)) issues.push(`missing required release file: ${requiredPath}`);
}

for (const filePath of files) {
  const relativePath = normalize(path.relative(root, filePath));
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink()) {
    issues.push(`symbolic link is not allowed in the release tree: ${relativePath}`);
    continue;
  }
  if (forbiddenFilePatterns.some((pattern) => pattern.test(path.basename(filePath)))) {
    issues.push(`private or generated file is tracked: ${relativePath}`);
    continue;
  }
  if (stat.size > 5 * 1024 * 1024) {
    issues.push(`unexpected file larger than 5 MiB: ${relativePath}`);
    continue;
  }
  const bytes = fs.readFileSync(filePath);
  if (!isText(bytes)) continue;
  const text = bytes.toString('utf8');
  if (!contentScanExclusions.has(relativePath)) {
    for (const rule of publicContentRules) {
      if (rule.pattern.test(text)) issues.push(`${relativePath}: ${rule.id}`);
    }
  }
  if (relativePath.endsWith('.md')) issues.push(...markdownLinkIssues(relativePath, text));
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const appPackage = JSON.parse(fs.readFileSync(path.join(root, 'app', 'package.json'), 'utf8'));
const appLock = JSON.parse(fs.readFileSync(path.join(root, 'app', 'package-lock.json'), 'utf8'));
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const skill = fs.readFileSync(path.join(root, 'skills', 'investment-assistant', 'SKILL.md'), 'utf8');
const ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
const canonicalRepository = 'https://github.com/3494036618-eng/personal-investment-assistant';
const canonicalReleaseRef = `v${packageJson.version}`;
const canonicalReleaseSkillUrl = `${canonicalRepository}/blob/${canonicalReleaseRef}/skills/investment-assistant/SKILL.md`;
const officialSkillUrl = 'https://github.com/volcengine/ai-app-lab/blob/main/demohouse/personal-investment-assistant/skills/investment-assistant/SKILL.md';

for (const [label, text] of [['README', readme], ['Skill', skill]]) {
  if (!text.includes(officialSkillUrl)) issues.push(`${label} is missing the official AI App Lab Skill URL`);
  if (!text.includes(canonicalReleaseSkillUrl)) issues.push(`${label} is missing the fixed release Skill URL`);
}
if (appPackage.version !== packageJson.version) issues.push('app/package.json version is inconsistent');
if (appLock.version !== packageJson.version || appLock.packages?.['']?.version !== packageJson.version) {
  issues.push('app/package-lock.json version is inconsistent');
}
if (packageJson.private !== true) issues.push('package.json must remain private');
if (packageJson.engines?.node !== '>=22.13') issues.push('package.json must require Node.js >=22.13');
if (!/os:\s*\[ubuntu-latest, macos-latest, windows-latest]/.test(ci)) {
  issues.push('GitHub Actions must test Ubuntu, macOS and Windows');
}
if (!/node-version:\s*['"]22\.13['"]/.test(ci)) issues.push('GitHub Actions must test Node.js 22.13');
if (!/npm run verify/.test(ci)) issues.push('GitHub Actions must run npm run verify');
if (!skill.includes(`固定发行版本：${canonicalReleaseRef}`)) issues.push('Skill is missing the fixed release version');
if (!skill.includes(`固定发行仓库：${canonicalRepository}`)) issues.push('Skill is missing the fixed release repository');

assert.deepEqual(issues, [], `公开发布检查失败：\n- ${issues.join('\n- ')}`);
process.stdout.write(`公开发布检查通过：${files.length} 个文件，未发现私密文件、环境特定路径、异常仓库地址或失效的相对文档链接。\n`);
