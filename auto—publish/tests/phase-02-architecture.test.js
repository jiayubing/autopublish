"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  test = require("node:test");
const root = path.resolve(__dirname, "..");
function all(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const file = path.join(dir, name),
      stat = fs.statSync(file);
    if (stat.isDirectory()) out.push(...all(file));
    else if (/\.[cm]?[jt]s$/.test(name)) out.push(file);
  }
  return out;
}
test("renderer and worker do not import the SQLite write adapter and production runtime does not auto-create it", () => {
  const forbidden = /infrastructure[\\/]operational-store|node:sqlite/;
  for (const dir of [
    path.join(root, "desktop", "worker"),
    path.join(root, "media-workbench", "src"),
  ])
    for (const file of all(dir))
      assert.doesNotMatch(fs.readFileSync(file, "utf8"), forbidden, file);
  const runtime = fs.readFileSync(
    path.join(root, "desktop", "workspace-runtime.js"),
    "utf8",
  );
  assert.doesNotMatch(runtime, /operational-store/);
});
