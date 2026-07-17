const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { it } = require("node:test");

const identity = require("../desktop/application-identity");

it("uses one stable application name and app id for development and packaging", function() {
  const calls = [];
  identity.configureApplicationIdentity({
    setName: function(value) { calls.push(["name", value]); },
    setAppUserModelId: function(value) { calls.push(["id", value]); }
  });
  assert.deepEqual(calls, [["name", identity.APPLICATION_NAME], ["id", identity.APPLICATION_ID]]);
  assert.match(fs.readFileSync(path.resolve(__dirname, "..", "scripts", "desktop.cmd"), "utf8"), /electron[\\/]cli\.js" "%PROJECT_ROOT%/i);
});

it("requires explicit confirmation and never overwrites canonical application config during legacy import", function() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "autopublish-identity-"));
  const legacy = path.join(root, "legacy");
  const canonical = path.join(root, "canonical");
  fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(path.join(legacy, "runtime-config.json"), "legacy\n", "utf8");
  try {
    assert.throws(() => identity.importLegacyApplicationConfig({ legacyRoot: legacy, canonicalRoot: canonical }), function(error) { return error.code === "APP_CONFIG_IMPORT_CONFIRMATION_REQUIRED"; });
    const result = identity.importLegacyApplicationConfig({ legacyRoot: legacy, canonicalRoot: canonical, confirmed: true });
    assert.deepEqual(result.imported, ["runtime-config.json"]);
    fs.writeFileSync(path.join(canonical, "runtime-config.json"), "canonical\n", "utf8");
    assert.throws(() => identity.importLegacyApplicationConfig({ legacyRoot: legacy, canonicalRoot: canonical, confirmed: true }), function(error) { return error.code === "APP_CONFIG_IMPORT_TARGET_NOT_EMPTY"; });
    assert.equal(fs.readFileSync(path.join(canonical, "runtime-config.json"), "utf8"), "canonical\n");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
