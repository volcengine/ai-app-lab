import fs from 'node:fs';
import path from 'node:path';
import {
  assertNodeVersion,
  configuredCredentials,
  ensureDirectories,
  paths,
  processExists,
  readOption,
  readPid,
  run,
  serverAddress,
} from './lib.mjs';

assertNodeVersion();
ensureDirectories();
const profileValue = readOption('--profile');
if (!profileValue) throw new Error('请使用 --profile 指定用户关注配置 JSON。');
const profilePath = path.resolve(profileValue);
if (!fs.existsSync(profilePath)) throw new Error(`Profile 不存在：${profilePath}`);
const generateInitialReports = !process.argv.includes('--skip-initial-reports');

const scripts = path.join(paths.skillRoot, 'scripts');
process.stdout.write('阶段 1/6：检查运行状态并安装仓库内的正式应用。\n');
const wasRunning = processExists(readPid());
if (wasRunning) {
  run(process.execPath, [path.join(scripts, 'stop.mjs')]);
}
try {
  run(process.execPath, [path.join(scripts, 'install.mjs'), '--skip-config']);
} catch (error) {
  let recovery = '没有可恢复的旧运行时。';
  if (wasRunning && fs.existsSync(path.join(paths.installedApp, 'package.json'))) {
    const restart = run(process.execPath, [path.join(scripts, 'start.mjs')], { allowFailure: true });
    recovery = restart.status === 0 ? '旧运行时已恢复启动。' : '旧运行时恢复启动失败，请检查日志。';
  }
  throw new Error(`应用部署失败，${recovery} 原因：${error.message}`);
}

process.stdout.write('阶段 2/6：检查 Agent Plan Harness 凭证。\n');
let credentials = configuredCredentials();
if (!Object.values(credentials).every(Boolean)) {
  if (process.stdin.isTTY && process.stdout.isTTY) {
    run(process.execPath, [path.join(scripts, 'configure.mjs')]);
    credentials = configuredCredentials();
  }
}
const missingCredentials = Object.entries(credentials)
  .filter(([, configured]) => !configured)
  .map(([name]) => name);

process.stdout.write('阶段 3/6：真实调用 DataPro、豆包搜索和 Agent Plan 模型进行后端探测。\n');
const doctor = missingCredentials.length
  ? null
  : run(process.execPath, [path.join(scripts, 'doctor.mjs'), '--live'], { allowFailure: true });
if (missingCredentials.length) {
  process.stdout.write(`跳过真实服务探测，缺少凭证：${missingCredentials.join('、')}。\n`);
}
process.stdout.write('阶段 4/6：启动网站并导入用户确认的股票、关注偏好和监控设置。\n');
run(process.execPath, [path.join(scripts, 'start.mjs')]);

const profileArgs = [path.join(scripts, 'profile.mjs'), '--input', profilePath];
if (process.argv.includes('--consume-profile')) profileArgs.push('--consume-profile');
run(process.execPath, profileArgs);

process.stdout.write(`网站运行地址：${serverAddress().url}\n`);
if (missingCredentials.length) {
  throw new Error(`网站与关注配置已就位，但真实后端尚未就绪。请运行 configure.mjs 补齐：${missingCredentials.join('、')}。`);
}
if (doctor.status !== 0) {
  throw new Error('网站与关注配置已就位，但真实服务探测未全部通过，ready 保持 false；请按 doctor 输出修复后重试。');
}

process.stdout.write(generateInitialReports
  ? '阶段 5/6：为每只股票生成首份个股简评和盘后风险摘要。\n'
  : '阶段 5/6：已按显式选项跳过首批报告生成。\n');
const acceptanceArgs = [path.join(scripts, 'acceptance.mjs'), '--all'];
if (generateInitialReports) acceptanceArgs.push('--seed');
run(process.execPath, acceptanceArgs);

process.stdout.write('阶段 6/6：初始化完成。\n');
process.stdout.write(generateInitialReports
  ? `个人投资助手已导入个性化配置并生成首批真实报告：${serverAddress().url}\n`
  : `个人投资助手已导入个性化配置，但尚未生成首批报告：${serverAddress().url}\n`);
