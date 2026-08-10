const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const bridgeDirectory = path.join(
  __dirname,
  "..",
  "media-workbench",
  "src",
  "bridge",
);

test("renderer desktopConsole uses a fixed named top-level API", () => {
  const transport = fs.readFileSync(
    path.join(bridgeDirectory, "transport.ts"),
    "utf8",
  );

  assert.match(transport, /export interface DesktopConsoleApi\s*\{/);
  assert.match(transport, /desktopConsole\?: DesktopConsoleApi;/);
  assert.doesNotMatch(transport, /Record\s*<\s*string\s*,\s*any\s*>/);
  assert.doesNotMatch(
    transport,
    /\[\s*(?:key|channel|method|name)\s*:\s*string\s*\]/,
  );
  assert.doesNotMatch(transport, /requireBridgeApi|new Proxy|Reflect\.get/);
  for (const accessor of [
    "requireContentApi",
    "requirePlatformsApi",
    "requireMediaApi",
    "requireOrdersApi",
    "requirePublicationApi",
    "requireWorkspaceApi",
    "requireWorkspaceDataApi",
    "requireRuntimeDiagnosticsApi",
    "requireAiProviderApi",
    "requirePlatformSettingsApi",
    "requireStorageMaintenanceApi",
  ]) {
    assert.match(transport, new RegExp(`export function ${accessor}`));
  }
});

test("renderer bridge files do not recover a top-level untyped desktop API", () => {
  for (const entry of fs.readdirSync(bridgeDirectory)) {
    if (!entry.endsWith(".ts")) continue;
    const source = fs.readFileSync(path.join(bridgeDirectory, entry), "utf8");
    assert.doesNotMatch(
      source,
      /desktopConsole[^\n]*(?:as\s+any|Record\s*<\s*string\s*,\s*any\s*>)/,
      entry,
    );
  }
});
