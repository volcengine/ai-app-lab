import { rm } from "node:fs/promises";
import { pidPath, pidRunning, readPid } from "./lib.mjs";

const pid = await readPid();
if (!pidRunning(pid)) {
  await rm(pidPath, { force: true });
  console.log(JSON.stringify({ status: "not_running" }));
  process.exit(0);
}

if (process.platform === "win32") process.kill(pid, "SIGTERM");
else process.kill(-pid, "SIGTERM");
await rm(pidPath, { force: true });
console.log(JSON.stringify({ status: "stopped", pid }));
