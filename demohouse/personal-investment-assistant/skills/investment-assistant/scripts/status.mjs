import {
  inspectApplicationSource,
  paths,
  processExists,
  readPid,
  serverAddress,
} from './lib.mjs';

const pid = readPid();
const address = serverAddress();
const sourceState = inspectApplicationSource(paths.sourceApp);
const source = {
  path: sourceState.path,
  recognized: sourceState.recognized,
};
if (!processExists(pid)) {
  process.stdout.write(`${JSON.stringify({ running: false, ready: false, source }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  try {
    const response = await fetch(`${address.url}/api/health/ready`);
    const body = await response.json();
    process.stdout.write(`${JSON.stringify({
      running: true,
      pid,
      url: address.url,
      ready: response.ok,
      configured: body.configured,
      source,
      configuration: body.providers || {},
      live_check: body.live_check || {},
      log_file: paths.logFile,
    }, null, 2)}\n`);
    if (!response.ok) process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ running: true, pid, url: address.url, ready: false, source }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
