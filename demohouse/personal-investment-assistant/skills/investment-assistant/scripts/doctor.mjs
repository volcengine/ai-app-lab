import path from 'node:path';
import { assertInstalledApp, paths, run, runtimeEnvironment } from './lib.mjs';

assertInstalledApp();
const args = [path.join(paths.installedApp, 'scripts', 'doctor.mjs')];
if (process.argv.includes('--live')) args.push('--live');
const result = run(process.execPath, args, {
  cwd: paths.installedApp,
  allowFailure: true,
  env: runtimeEnvironment(),
});
if (result.status !== 0) process.exitCode = result.status;
