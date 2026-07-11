const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) { return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"); }

describe("Electron security boundary", function() {
  it("uses a sandboxed, isolated renderer and prevents renderer-created windows", function() {
    const main = read("desktop/main.js");
    assert.match(main, /sandbox:\s*true/);
    assert.match(main, /setWindowOpenHandler/);
    assert.match(main, /action:\s*["']deny["']/);
    assert.match(main, /will-navigate/);
    assert.match(main, /setPermissionRequestHandler/);
  });

  it("ships a restrictive CSP for the file-rendered React bundle", function() {
    const html = read("media-workbench/index.html");
    assert.match(html, /http-equiv=["']Content-Security-Policy["']/);
    assert.match(html, /default-src 'self'/);
    assert.match(html, /connect-src 'self'/);
  });
});
