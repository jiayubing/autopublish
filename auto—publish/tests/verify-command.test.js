"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { collectTestFiles, selectTestSuite } = require("../scripts/run-tests");

test("verify retains focused and core coverage once and stops on command failure", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "verify-command-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const trace = path.join(directory, "calls.jsonl");
  const preload = path.join(directory, "capture.cjs");
  fs.writeFileSync(preload, `
    const fs = require('node:fs');
    let count = 0;
    require('node:child_process').execFileSync = (file, args) => {
      fs.appendFileSync(process.env.VERIFY_TRACE, JSON.stringify({ file, args }) + '\\n');
      if (++count === Number(process.env.VERIFY_FAIL_AT)) throw new Error('synthetic command failure');
    };
  `);
  const run = (failAt) => spawnSync(process.execPath, ["--require", preload, "scripts/verify.js"], {
    cwd: path.resolve(__dirname, ".."), encoding: "utf8", timeout: 15000,
    env: { ...process.env, VERIFY_TRACE: trace, VERIFY_FAIL_AT: String(failAt) },
  });
  const result = run(0);
  assert.equal(result.status, 0, result.stderr);
  const calls = fs.readFileSync(trace, "utf8").trim().split("\n").map(line => JSON.parse(line));
  const files = calls.filter(call => call.args[0] === "--test").flatMap(call => call.args.slice(1));
  const all = [...files, ...selectTestSuite(collectTestFiles(), "core")];
  assert.equal(new Set(all).size, all.length, "every test file runs only once");
  for (const file of ["tests/renderer-history-editor-flow.test.js", "tests/auth-protected-ipc.test.js", "auth-server/tests/concurrent-login.test.js", "tests/regular-platform-acceptance.test.js"])
    assert.ok(all.includes(file), file);
  const npmCalls = calls.filter(call => call.args[0] !== "--test").map(call => call.args.join(" "));
  assert.equal(npmCalls.filter(command => /(?:^| )test$/.test(command)).length, 1);
  assert.equal(npmCalls.filter(command => command.endsWith("run build:renderer")).length, 1);
  for (let failAt = 1; failAt <= calls.length; failAt++) {
    fs.unlinkSync(trace);
    assert.notEqual(run(failAt).status, 0);
    assert.equal(fs.readFileSync(trace, "utf8").trim().split("\n").length, failAt);
  }
});
