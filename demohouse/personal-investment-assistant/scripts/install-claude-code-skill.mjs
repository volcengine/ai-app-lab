import { runInstallerCli } from './install-agent-skill.mjs';

try {
  runInstallerCli({ defaultTarget: 'claude-code' });
} catch (error) {
  process.stderr.write(`错误：${error instanceof Error ? error.message : String(error)}\n`);
  if (process.env.DEBUG && error?.stack) process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
}
