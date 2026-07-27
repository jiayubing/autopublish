"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { registerAccountProfileIpc } = require("../desktop/ipc/account-profile-ipc");
const { createOperationalStore } = require("../src/infrastructure/operational-store/operational-store");

test("account profile IPC requires explicit confirmation and never accepts a caller supplied id", async () => {
  const handlers = new Map();
  const created = [];
  const profiles = [{ accountProfileId: "account-existing", platformId: "toutiao", displayName: "existing" }];
  registerAccountProfileIpc({ ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) }, operationalStore: {
    createAccountProfile: (input) => { created.push(input); return { accountProfileId: "account-generated", platformId: input.platformId, displayName: input.displayName }; },
    listAccountProfiles: () => profiles,
  } });
  const listed = await handlers.get("platforms:list-account-profiles")({}, undefined);
  assert.deepEqual(listed, { ok: true, data: { profiles } });
  const handler = handlers.get("platforms:confirm-account-profile");
  const rejected = await handler({}, { platformId: "toutiao", displayName: "fixture", accountProfileId: "caller-value", confirmed: true });
  assert.equal(rejected.ok, false);
  const accepted = await handler({}, { platformId: "toutiao", displayName: "fixture", confirmed: true });
  assert.equal(accepted.data.profile.accountProfileId, "account-generated");
  assert.deepEqual(created, [{ platformId: "toutiao", displayName: "fixture" }]);
});

test("account profiles can be queried from the durable operational store", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "account-profile-query-"));
  const store = createOperationalStore({ workspaceRoot: root });
  try {
    const first = store.createAccountProfile({ platformId: "toutiao", displayName: "头条主账号" });
    const second = store.createAccountProfile({ platformId: "lieju", displayName: "列举账号" });
    const byId = (left, right) => left.accountProfileId.localeCompare(right.accountProfileId);
    assert.deepEqual(store.listAccountProfiles().map(({ accountProfileId, platformId, displayName }) => ({ accountProfileId, platformId, displayName })).sort(byId), [first, second].sort(byId));
  } finally {
    store.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
