import { Writable } from 'node:stream';
import readline from 'node:readline/promises';
import { parseEnvFile, paths, writeCredentials } from './lib.mjs';

class MutedOutput extends Writable {
  constructor(output) {
    super();
    this.output = output;
    this.muted = false;
  }

  _write(chunk, encoding, callback) {
    if (!this.muted) this.output.write(chunk, encoding);
    callback();
  }
}

async function hiddenQuestion(rl, output, label) {
  process.stdout.write(label);
  output.muted = true;
  const answer = await rl.question('');
  output.muted = false;
  process.stdout.write('\n');
  return answer.trim();
}

if (!process.stdin.isTTY || !process.stdout.isTTY) {
  throw new Error('配置需要交互式终端，以确保密钥输入不回显。');
}

const existing = parseEnvFile();
const output = new MutedOutput(process.stdout);
const rl = readline.createInterface({ input: process.stdin, output, terminal: true });

try {
  process.stdout.write('凭证只会写入本机用户配置目录，输入过程不会回显。\n');
  const arkInput = await hiddenQuestion(
    rl,
    output,
    `Agent Plan API Key${existing.ARK_API_KEY ? '（留空保留现有值）' : ''}: `,
  );
  const arkKey = arkInput || existing.ARK_API_KEY || '';
  if (!arkKey) throw new Error('Agent Plan API Key 不能为空。');
  const standaloneSearchOverride = existing.WEB_SEARCH_API_KEY
    && existing.WEB_SEARCH_API_KEY !== existing.ARK_API_KEY
    ? existing.WEB_SEARCH_API_KEY
    : '';

  writeCredentials({
    ...existing,
    ARK_API_KEY: arkKey,
    DATAPRO_API_KEY: arkKey,
    WEB_SEARCH_API_KEY: standaloneSearchOverride,
  });
  process.stdout.write(standaloneSearchOverride
    ? '已更新 Agent Plan Key，并保留现有豆包搜索高级覆盖凭证。\n'
    : '已按 Agent Plan Harness 配置，将同一 Key 用于模型、DataPro 和豆包搜索。\n');
  process.stdout.write(`配置已安全写入 ${paths.credentialsFile}（权限 0600）。\n`);
} finally {
  rl.close();
}
