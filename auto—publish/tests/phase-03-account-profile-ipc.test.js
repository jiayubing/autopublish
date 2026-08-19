"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { registerAccountProfileIpc } = require("../desktop/ipc/account-profile-ipc");

test("account profile IPC requires explicit confirmation and exposes bind/delete as explicit commands", async () => {
  const handlers = new Map();
  const calls = [];
  const existing = Object.freeze({
    accountProfileId: "account-existing",
    platformId: "toutiao",
    displayName: "existing",
    bindingStatus: "bound",
  });
  const created = Object.freeze({
    accountProfileId: "account-generated",
    platformId: "toutiao",
    displayName: "fixture",
    bindingStatus: "bound",
  });
  registerAccountProfileIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    platformAccountProfileService: {
      list: () => [existing],
      createAndBind: async (input) => {
        calls.push(["create", input]);
        return created;
      },
      bindExisting: async (input) => {
        calls.push(["bind", input]);
        return existing;
      },
      delete: (input) => {
        calls.push(["delete", input]);
        return existing;
      },
    },
  });

  assert.deepEqual(
    await handlers.get("platforms:list-account-profiles")({}, undefined),
    { ok: true, data: { profiles: [existing] } },
  );

  const createHandler = handlers.get("platforms:confirm-account-profile");
  const callerIdRejected = await createHandler({}, {
    platformId: "toutiao",
    displayName: "fixture",
    accountProfileId: "caller-value",
    confirmed: true,
  });
  assert.equal(callerIdRejected.ok, false);
  const createUnconfirmed = await createHandler({}, {
    platformId: "toutiao",
    displayName: "fixture",
  });
  assert.equal(createUnconfirmed.ok, false);
  const accepted = await createHandler({}, {
    platformId: "toutiao",
    displayName: "fixture",
    confirmed: true,
  });
  assert.deepEqual(accepted, { ok: true, data: { profile: created } });

  const bindHandler = handlers.get("platforms:bind-account-profile");
  assert.equal((await bindHandler({}, { accountProfileId: "account-existing" })).ok, false);
  assert.deepEqual(
    await bindHandler({}, { accountProfileId: "account-existing", confirmed: true }),
    { ok: true, data: { profile: existing } },
  );

  const deleteHandler = handlers.get("platforms:delete-account-profile");
  assert.equal((await deleteHandler({}, { accountProfileId: "account-existing" })).ok, false);
  assert.deepEqual(
    await deleteHandler({}, { accountProfileId: "account-existing", confirmed: true }),
    { ok: true, data: { accountProfileId: "account-existing" } },
  );

  assert.deepEqual(calls, [
    ["create", { platformId: "toutiao", displayName: "fixture" }],
    ["bind", { accountProfileId: "account-existing" }],
    ["delete", { accountProfileId: "account-existing" }],
  ]);
});

test("account profiles can be queried from the durable operational store", (t) => {
  let createOperationalStore;
  try {
    ({ createOperationalStore } = require("../src/infrastructure/operational-store/operational-store"));
  } catch (error) {
    if (error && error.code === "MODULE_NOT_FOUND") {
      t.skip(`optional runtime dependency unavailable: ${error.message}`);
      return;
    }
    throw error;
  }
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
