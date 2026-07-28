import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['--watch', 'src/server/index.js'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development' } }),
  spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--host', '127.0.0.1'], { stdio: 'inherit' }),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 500).unref();
}

for (const child of children) {
  child.on('exit', (code, signal) => {
    if (!stopping && code !== 0) {
      process.stderr.write(`Development process exited (${code ?? signal}).\n`);
      stop(code || 1);
    }
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
