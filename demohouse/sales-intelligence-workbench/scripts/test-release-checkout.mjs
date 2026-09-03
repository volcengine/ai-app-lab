import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CANONICAL_REPOSITORY,
  validateImmutableRelease,
  validateReleaseCheckout,
} from "./validate-release-checkout.mjs";

const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sales-release-checkout-"));

function git(args) {
  const result = spawnSync("git", ["-C", temporaryRoot, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function rejects(message, callback) {
  assert.throws(callback, undefined, message);
}

try {
  git(["init", "-b", "main"]);
  git(["config", "user.name", "Release Test"]);
  git(["config", "user.email", "release-test@example.invalid"]);
  fs.writeFileSync(path.join(temporaryRoot, "fixture.txt"), "clean\n");
  git(["add", "fixture.txt"]);
  git(["commit", "-m", "test fixture"]);
  git(["remote", "add", "origin", `${CANONICAL_REPOSITORY}.git`]);
  git(["tag", "v0.10.1"]);
  const head = git(["rev-parse", "HEAD"]);

  const report = validateReleaseCheckout({
    root: temporaryRoot,
    expectedTag: "v0.10.1",
    expectedCommit: head,
    verifyRemote: false,
  });
  assert.equal(report.repository, CANONICAL_REPOSITORY);
  assert.equal(report.tag, "v0.10.1");
  assert.equal(report.commit, head);

  fs.writeFileSync(path.join(temporaryRoot, "fixture.txt"), "dirty\n");
  rejects("dirty checkout 必须失败", () => validateReleaseCheckout({
    root: temporaryRoot,
    expectedTag: "v0.10.1",
    verifyRemote: false,
  }));
  fs.writeFileSync(path.join(temporaryRoot, "fixture.txt"), "clean\n");

  git(["remote", "set-url", "origin", "https://github.com/wrong-owner/sales-intelligence-workbench.git"]);
  rejects("错误 origin 必须失败", () => validateReleaseCheckout({
    root: temporaryRoot,
    expectedTag: "v0.10.1",
    verifyRemote: false,
  }));
  git(["remote", "set-url", "origin", `${CANONICAL_REPOSITORY}.git`]);

  rejects("错误 tag 必须失败", () => validateReleaseCheckout({
    root: temporaryRoot,
    expectedTag: "v9.9.9",
    verifyRemote: false,
  }));
  rejects("错误 commit 必须失败", () => validateReleaseCheckout({
    root: temporaryRoot,
    expectedTag: "v0.10.1",
    expectedCommit: "0".repeat(40),
    verifyRemote: false,
  }));

  fs.writeFileSync(path.join(temporaryRoot, ".gitignore"), "ignored-artifact.txt\n");
  git(["add", ".gitignore"]);
  git(["commit", "-m", "ignore fixture artifact"]);
  git(["tag", "-f", "v0.10.1"]);
  fs.writeFileSync(path.join(temporaryRoot, "ignored-artifact.txt"), "must still fail\n");
  rejects("被忽略的额外文件必须失败", () => validateReleaseCheckout({
    root: temporaryRoot,
    expectedTag: "v0.10.1",
    verifyRemote: false,
  }));

  const immutableRelease = {
    tag_name: "v0.10.1",
    target_commitish: head,
    immutable: true,
    draft: false,
    prerelease: false,
  };
  const response = (body) => async () => ({ status: 200, json: async () => body });
  await validateImmutableRelease({ tag: "v0.10.1", commit: head }, response(immutableRelease));
  await assert.rejects(
    validateImmutableRelease(
      { tag: "v0.10.1", commit: head },
      response({ ...immutableRelease, immutable: false }),
    ),
    /immutable/,
  );
  await assert.rejects(
    validateImmutableRelease(
      { tag: "v0.10.1", commit: head },
      response({ ...immutableRelease, target_commitish: "0".repeat(40) }),
    ),
    /commit/,
  );

  process.stdout.write("发行 checkout 校验器测试通过：正确来源与 immutable Release 放行，错误 origin、tag、commit、可变 Release、脏工作区和 ignored 残留全部拒绝。\n");
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
