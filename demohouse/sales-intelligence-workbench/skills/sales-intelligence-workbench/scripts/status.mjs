import fs from "node:fs";
import {
  configurationSummary,
  liveDoctorEvidence,
  paths,
  processExists,
  readPid,
  serverAddress,
} from "./lib.mjs";

const pid = readPid();
const running = processExists(pid);
const workerPid = readPid(paths.workerPidFile);
const workerRunning = processExists(workerPid);
const address = serverAddress();
let health = null;
if (running) {
  try {
    const response = await fetch(`${address.url}/api/health`);
    health = { ok: response.ok, status: response.status, body: await response.json() };
  } catch (error) {
    health = { ok: false, status: null, error: error.message };
  }
}

const evidence = liveDoctorEvidence();
process.stdout.write(`${JSON.stringify({
  installed: fs.existsSync(paths.installedApp),
  running,
  pid: running ? pid : null,
  worker_running: workerRunning,
  worker_pid: workerRunning ? workerPid : null,
  url: address.url,
  configuration: configurationSummary(),
  live_doctor: {
    exists: evidence.exists,
    fresh: evidence.fresh,
    age_ms: evidence.age_ms,
    ttl_ms: evidence.ttl_ms,
  },
  health,
  paths: {
    app: paths.installedApp,
    config: paths.configDir,
    state: paths.stateDir,
    log: paths.logFile,
    worker_log: paths.workerLogFile,
  },
}, null, 2)}\n`);
