"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createMediaSettingsAdapter } = require("../desktop/services/platform-settings/media-settings-adapter");
const { MediaClient } = require("../src/platforms/media/media-client");

test("media HTTP requires explicit approval at settings and client boundaries", () => {
  const adapter = createMediaSettingsAdapter();
  assert.throws(() => adapter.validate({ apiKey: "fixture-key", baseUrl: "http://provider.example" }), { code: "MEDIA_HTTP_CONFIRMATION_REQUIRED" });
  assert.throws(() => new MediaClient({ apiKey: "fixture-key", baseUrl: "http://provider.example" }), /allowInsecure=true/);
  const config = adapter.validate({ apiKey: "fixture-key", baseUrl: "http://provider.example", allowInsecure: true });
  assert.equal(config.allowInsecure, true);
  assert.doesNotThrow(() => new MediaClient(config));
  assert.equal(adapter.validate({ apiKey: "fixture-key", baseUrl: "https://media.example.test" }).baseUrl, "https://media.example.test");
});
