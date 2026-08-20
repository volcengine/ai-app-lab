import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { appCopyFilter, assertAppSource, paths } from "./lib.mjs";

const sourceRoot = assertAppSource(paths.projectRoot);
const destinationRoot = paths.sourceApp;
const stagingRoot = `${destinationRoot}.staging`;

function manifest(rootDir) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      if (!appCopyFilter(rootDir, filePath)) continue;
      if (entry.isDirectory()) visit(filePath);
      else if (entry.isFile()) {
        files.push({
          path: path.relative(rootDir, filePath),
          sha256: createHash("sha256").update(fs.readFileSync(filePath)).digest("hex"),
        });
      }
    }
  };
  visit(rootDir);
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

if (process.argv.includes("--check")) {
  assertAppSource(destinationRoot);
  if (JSON.stringify(manifest(sourceRoot)) !== JSON.stringify(manifest(destinationRoot))) {
    throw new Error("Skill 应用包与当前仓库源码不同步，请先运行 sync-assets.mjs。");
  }
  process.stdout.write("Skill 应用包与当前仓库源码一致。\n");
  process.exit(0);
}

fs.rmSync(stagingRoot, { recursive: true, force: true });
fs.mkdirSync(stagingRoot, { recursive: true });
for (const directory of ["backend", "frontend", "supabase"]) {
  const source = path.join(sourceRoot, directory);
  fs.cpSync(source, path.join(stagingRoot, directory), {
    recursive: true,
    force: true,
    filter: (entry) => appCopyFilter(sourceRoot, entry),
  });
}
assertAppSource(stagingRoot);
fs.rmSync(destinationRoot, { recursive: true, force: true });
fs.renameSync(stagingRoot, destinationRoot);

if (JSON.stringify(manifest(sourceRoot)) !== JSON.stringify(manifest(destinationRoot))) {
  throw new Error("Skill 应用包同步后的文件校验失败。");
}

process.stdout.write(`Skill 应用包已从 ${sourceRoot} 同步到 ${destinationRoot}\n`);
