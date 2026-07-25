"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { registerAccountProfileIpc } = require("../desktop/ipc/account-profile-ipc");

test("account profile IPC requires explicit confirmation and never accepts a caller supplied id", async () => {
  const handlers = new Map();
  const created = [];
  registerAccountProfileIpc({ ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) }, operationalStore: { createAccountProfile: (input) => { created.push(input); return { accountProfileId: "account-generated", platformId: input.platformId, displayName: input.displayName }; } } });
  const handler = handlers.get("platforms:confirm-account-profile");
  const rejected = await handler({}, { platformId: "toutiao", displayName: "fixture", accountProfileId: "caller-value", confirmed: true });
  assert.equal(rejected.ok, false);
  const accepted = await handler({}, { platformId: "toutiao", displayName: "fixture", confirmed: true });
  assert.equal(accepted.data.accountProfileId, "account-generated");
  assert.deepEqual(created, [{ platformId: "toutiao", displayName: "fixture" }]);
});
