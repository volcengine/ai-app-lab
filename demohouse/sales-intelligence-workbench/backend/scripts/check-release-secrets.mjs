import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDir, "../..");

const ignoredDirectories = new Set([
  ".git",
  ".idea",
  ".vscode",
  "coverage",
  "dist",
  "node_modules",
]);

const forbiddenSecretFiles = [
  /^\.env$/i,
  /^\.env\.(?!example$|sample$)[^.]+$/i,
  /^credentials(?:\.[^.]+)?$/i,
  /^secrets?(?:\.[^.]+)?$/i,
  /\.(?:key|pem|p12|pfx)$/i,
];

const contentRules = [
  {
    id: "agent_plan_api_key",
    pattern: /\bark-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}-[0-9a-f]{4,}\b/gi,
  },
  {
    id: "volcengine_access_key",
    pattern: /\bAK(?:LT|TP)[A-Za-z0-9]{20,}\b/g,
  },
  {
    id: "jwt_or_supabase_key",
    pattern: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,
  },
  {
    id: "private_key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
];

const assignmentPattern = /^[ \t]*(AGENT_PLAN_API_KEY|ARK_API_KEY|VOLCENGINE_ACCESS_KEY_ID|VOLCENGINE_SECRET_ACCESS_KEY|SUPABASE_SERVICE_ROLE_KEY)[ \t]*=[ \t]*([^\r\n]*)[ \t]*$/gim;

function normalizeAssignedValue(value) {
  const withoutComment = String(value || "").replace(/\s+#.*$/, "").trim();
  return withoutComment.replace(/^(['"])(.*)\1$/, "$2").trim();
}

function isPlaceholder(value) {
  const normalized = normalizeAssignedValue(value);
  if (!normalized) return true;
  if (/^(?:<.*>|\$\{.*\}|\*+|x+|your[-_ ]|replace[-_ ]|example|sample|test|mock)/i.test(normalized)) return true;
  return normalized.length < 16;
}

export function scanTextForSecrets(text, relativePath = "unknown") {
  const findings = [];

  for (const rule of contentRules) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(text)) findings.push({ rule: rule.id, path: relativePath });
  }

  assignmentPattern.lastIndex = 0;
  for (const match of text.matchAll(assignmentPattern)) {
    if (!isPlaceholder(match[2])) {
      findings.push({ rule: `configured_${match[1].toLowerCase()}`, path: relativePath });
    }
  }

  return findings;
}

function isForbiddenSecretFile(name) {
  if (/\.example$|\.sample$/i.test(name)) return false;
  return forbiddenSecretFiles.some((pattern) => pattern.test(name));
}

async function collectFiles(root, current = root, output = []) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) await collectFiles(root, path.join(current, entry.name), output);
      continue;
    }
    if (entry.isFile()) output.push(path.join(current, entry.name));
  }
  return output;
}

export async function scanReleaseTree(root = defaultRoot) {
  const absoluteRoot = path.resolve(root);
  const files = await collectFiles(absoluteRoot);
  const findings = [];

  for (const filePath of files) {
    const relativePath = path.relative(absoluteRoot, filePath);
    if (isForbiddenSecretFile(path.basename(filePath))) {
      findings.push({ rule: "forbidden_secret_file", path: relativePath });
      continue;
    }

    const stat = await fs.stat(filePath);
    if (stat.size > 5 * 1024 * 1024) continue;
    const bytes = await fs.readFile(filePath);
    if (bytes.subarray(0, 4096).includes(0)) continue;
    findings.push(...scanTextForSecrets(bytes.toString("utf8"), relativePath));
  }

  const unique = new Map(findings.map((finding) => [`${finding.rule}:${finding.path}`, finding]));
  return [...unique.values()].sort((left, right) => left.path.localeCompare(right.path) || left.rule.localeCompare(right.rule));
}

async function main() {
  const rootArgument = process.argv.find((argument) => argument.startsWith("--root="));
  const root = rootArgument ? rootArgument.slice("--root=".length) : defaultRoot;
  const findings = await scanReleaseTree(root);
  if (!findings.length) {
    console.log("发布密钥扫描通过：未发现真实凭证或私钥文件。");
    return;
  }

  console.error(`发布密钥扫描失败：发现 ${findings.length} 个风险位置。`);
  for (const finding of findings) console.error(`- ${finding.rule}: ${finding.path}`);
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
}
