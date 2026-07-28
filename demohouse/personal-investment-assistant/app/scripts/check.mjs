import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = ['src', 'scripts', 'tests'];
const files = [];
const sourceFiles = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (/\.(?:js|mjs|jsx|css|html)$/.test(entry.name)) {
      sourceFiles.push(target);
      if (/\.(?:js|mjs)$/.test(entry.name)) files.push(target);
    }
  }
}

for (const directory of roots) walk(path.join(root, directory));
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || `Syntax check failed: ${file}\n`);
    process.exit(1);
  }
}

const forbidden = [
  {
    pattern: new RegExp([
      ['RECORDING', 'MODE'].join('_'),
      ['recording', 'Data'].join(''),
      ['mock', 'Data'].join(''),
    ].join('|')),
    label: 'demo fallback',
  },
  { pattern: /ark-[A-Za-z0-9-]{12,}/, label: 'possible Ark credential' },
];
for (const file of sourceFiles) {
  const text = fs.readFileSync(file, 'utf8');
  for (const rule of forbidden) {
    if (rule.pattern.test(text)) {
      process.stderr.write(`Forbidden ${rule.label} found in ${path.relative(root, file)}\n`);
      process.exit(1);
    }
  }
}

process.stdout.write(`Checked ${files.length} JavaScript files and scanned ${sourceFiles.length} source files.\n`);
