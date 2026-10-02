"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

for (const [name, source, accepted] of [
  ["pass", "test('synthetic pass', () => {});", true],
  [
    "failure",
    "test('synthetic failure', () => { throw new Error('synthetic'); });",
    false,
  ],
  ["skip", "test.skip('synthetic skip', () => {});", false],
  ["todo", "test.todo('synthetic todo');", false],
  ["file-level smoke", "", true],
]) {
  test(`suite evidence handles ${name} without false success`, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "suite-evidence-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const filename = path.join(root, "synthetic.cjs");
    const output = path.join(root, "evidence.json");
    fs.writeFileSync(
      filename,
      `const test = require('node:test');\n${source}\n`,
    );
    const result = spawnSync(
      process.execPath,
      [
        path.resolve(__dirname, "../scripts/create-test-suite-evidence.js"),
        "--test",
        filename,
        "--output",
        output,
        "--operation",
        "synthetic-gate",
      ],
      {
        encoding: "utf8",
        windowsHide: true,
        env: { ...process.env, NODE_TEST_CONTEXT: undefined },
      },
    );
    assert.equal(result.status, accepted ? 0 : 1, result.stderr);
    const evidence = JSON.parse(fs.readFileSync(output, "utf8"));
    assert.equal(evidence.status, accepted ? "PASSED" : "FAILED");
  });
}
