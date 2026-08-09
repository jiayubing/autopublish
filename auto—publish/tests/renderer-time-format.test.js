const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const tsxLoader = pathToFileURL(
  path.join(
    root,
    "media-workbench",
    "node_modules",
    "tsx",
    "dist",
    "loader.mjs",
  ),
).href;

function format(values) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        tsxLoader,
        "--input-type=module",
        "-e",
        `import { formatBeijingTime } from './media-workbench/src/time-format.ts'; console.log(JSON.stringify(${JSON.stringify(values)}.map((value) => formatBeijingTime(value))));`,
      ],
      { cwd: root, encoding: "utf8" },
    ),
  );
}

describe("renderer Beijing time formatter", function () {
  it("formats UTC and legacy instants consistently as Beijing time", function () {
    assert.deepEqual(
      format([
        "2026-07-15T00:00:00.000Z",
        "2026-01-02T16:05:06.000Z",
        "2026-07-15 00:00:00",
      ]),
      ["2026-07-15 08:00:00", "2026-01-03 00:05:06", "2026-07-15 08:00:00"],
    );
  });

  it("returns the safe fallback for invalid or missing instants", function () {
    assert.deepEqual(format([null, "not-a-date"]), ["未知时间", "未知时间"]);
  });
});
