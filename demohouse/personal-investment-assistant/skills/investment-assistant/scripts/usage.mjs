import { assertInstalledApp, requestLocalApi } from './lib.mjs';

assertInstalledApp();
const summary = (await requestLocalApi('/api/usage-summary')).body;
const recent = (await requestLocalApi('/api/usage-log?limit=50')).body.items || [];
process.stdout.write('以下为本地真实调用台账，不等同于 Agent Plan 控制台的权威 AFP 账单。\n');
process.stdout.write(`${JSON.stringify({ summary, recent }, null, 2)}\n`);
