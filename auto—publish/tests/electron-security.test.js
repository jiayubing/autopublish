const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

function read(file) { return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"); }

describe("Electron security boundary", function() {
  it("permits navigation only to the exact packaged renderer entry", function() {
    const { isAllowedRendererNavigation } = require("../desktop/security/navigation");
    const entry = path.resolve(__dirname, "..", "media-workbench", "dist", "index.html");
    assert.equal(isAllowedRendererNavigation("file:///C:/untrusted/index.html", entry), false);
    assert.equal(isAllowedRendererNavigation(new URL("file://" + entry.replace(/\\/g, "/")).href, entry), true);
  });

  it("uses a sandboxed, isolated renderer and prevents renderer-created windows", function() {
    const main = read("desktop/main.js");
    assert.match(main, /sandbox:\s*true/);
    assert.match(main, /setWindowOpenHandler/);
    assert.match(main, /action:\s*["']deny["']/);
    assert.match(main, /will-navigate/);
    assert.match(main, /setPermissionRequestHandler/);
  });

  it("keeps authentication in the main process and gates the business tree", function() {
    const main = read("desktop/main.js");
    const preload = read("desktop/preload.js");
    const gate = read("media-workbench/src/components/AuthGate.tsx");
    assert.match(main, /initializeAuth/);
    assert.match(main, /createAuthenticatedIpcMain/);
    assert.match(preload, /auth:get-state/);
    assert.doesNotMatch(preload, /accessToken|refreshToken/);
    assert.match(gate, /authenticated/);
  });

  it("ships a restrictive CSP for the file-rendered React bundle", function() {
    const html = read("media-workbench/index.html");
    assert.match(html, /http-equiv=["']Content-Security-Policy["']/);
    assert.match(html, /default-src 'self'/);
    assert.match(html, /connect-src 'self'/);
  });
});
