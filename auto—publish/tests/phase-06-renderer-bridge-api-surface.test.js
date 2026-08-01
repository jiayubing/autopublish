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

test("renderer transport preserves only the validated SafeOperationalError projection", () => {
  const transport = fs.readFileSync(
    path.join(bridgeDirectory, "transport.ts"),
    "utf8",
  );
  const types = fs.readFileSync(
    path.join(bridgeDirectory, "..", "types.ts"),
    "utf8",
  );
  const nonAuthTransport = transport.slice(
    0,
    transport.indexOf("export function authIpcError"),
  );
  assert.match(nonAuthTransport, /error\?\.userMessage\s*\|\|\s*fallback/);
  assert.doesNotMatch(nonAuthTransport, /error\?\.message/);
  assert.match(transport, /Phase 07 owns the legacy auth envelope/);
  for (const field of [
    "category",
    "retryability",
    "userMessage",
    "diagnosticId",
  ]) {
    assert.match(types, new RegExp(`${field}\\??:`));
  }
  assert.doesNotMatch(
    types.slice(0, types.indexOf("export type IpcResponse")),
    /platformId|templateId|diagnosticCode/,
  );
});

test("production content bridge fails closed when a content capability or result is absent", () => {
  const source = fs.readFileSync(
    path.join(bridgeDirectory, "content.ts"),
    "utf8",
  );
  for (const helper of [
    "callCoreContent",
    "callDoubao",
    "callSubmission",
    "callGeneration",
  ]) {
    const start = source.indexOf(`async function ${helper}`);
    assert.notEqual(start, -1, helper);
    const body = source.slice(start, start + 1800);
    assert.match(body, /requireBridgeApi<[^>]+>\("content"\)/);
    assert.match(
      body,
      /result\.data === undefined \|\| result\.data === null\)\s*throw/,
    );
    assert.doesNotMatch(body, /return (?:fallback|options\?\.fallback)/);
  }
  for (const retiredSymbol of [
    "_fallback",
    "_hasFallback",
    "hasFallback",
    "emptySnapshot",
    "renderer-fallback",
  ]) {
    assert.doesNotMatch(source, new RegExp(retiredSymbol));
  }
  assert.doesNotMatch(source, /return \(\) => \{\}/);
});
