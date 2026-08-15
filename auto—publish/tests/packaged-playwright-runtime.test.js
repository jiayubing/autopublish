const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { it } = require("node:test");

const { verifyStaticPackage } = require("../scripts/verify-packaged-playwright-runtime");

function write(root, relative, contents) {
  const filename = path.join(root, relative);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, contents || "placeholder\n", "utf8");
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autopublish-packaged-runtime-"));
  write(root, "tools/node/node.exe");
  write(root, "tools/node/LICENSE", "Node license\n");
  write(root, "tools/node/runtime-tools-manifest.json", JSON.stringify({ tool: "node", nodeVersion: "v24.18.0" }));
  write(root, "node_modules/@playwright/cli/playwright-cli.js");
  write(root, "node_modules/@playwright/cli/LICENSE", "CLI license\n");
  write(root, "node_modules/@playwright/cli/package.json", JSON.stringify({ version: "0.1.14" }));
  write(root, "node_modules/playwright/LICENSE", "Playwright license\n");
  write(
    root,
    "node_modules/playwright/package.json",
    JSON.stringify({ version: "1.61.0-alpha-1781023400000" }),
  );
  write(root, "node_modules/playwright-core/LICENSE", "Core license\n");
  return root;
}

it("passes static packaged runtime verification with bundled Node, CLI, and licenses", function() {
  const root = makeFixture();
  try {
    const result = verifyStaticPackage(root);
    assert.equal(result.manifest.nodeVersion, "v24.18.0");
    assert.equal(result.cli.endsWith(path.join("@playwright", "cli", "playwright-cli.js")), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("fails red when the bundled Node or CLI is removed", function() {
  const root = makeFixture();
  try {
    fs.rmSync(path.join(root, "tools", "node", "node.exe"));
    assert.throws(() => verifyStaticPackage(root), function(error) { return error.code === "PACKAGED_RUNTIME_FILES_MISSING"; });
    write(root, "tools/node/node.exe");
    fs.rmSync(path.join(root, "node_modules", "@playwright", "cli", "playwright-cli.js"));
    assert.throws(() => verifyStaticPackage(root), function(error) { return error.code === "PACKAGED_RUNTIME_FILES_MISSING"; });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("fails red on development-machine absolute references and private runtime data", function() {
  const root = makeFixture();
  try {
    write(root, "desktop/runtime.js", "const path = 'C:\\\\Users\\\\violet\\\\.codex';\n");
    assert.throws(() => verifyStaticPackage(root), function(error) { return error.code === "PACKAGED_PRIVATE_DATA"; });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it("declares the Playwright request runtime directly for production packaging", function() {
  const packageJson = require("../package.json");
  assert.equal(
    packageJson.dependencies.playwright,
    "1.61.0-alpha-1781023400000",
  );
  assert.doesNotThrow(() => require.resolve("playwright"));
});
