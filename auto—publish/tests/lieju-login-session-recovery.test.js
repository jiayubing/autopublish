"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, mock } = require("node:test");
const playwright = require("../src/core/playwright");
const operator = require("../src/core/operator-flow");
const files = require("../src/core/files");

let browser;
mock.method(files, "sleep", () => {});
mock.method(operator, "waitForCondition", (check) => check());
mock.method(playwright, "pwInvokeSync", (args) => {
  const command = args[0];
  if (command === "list") return browser.alive ? "lieju" : "";
  if (command === "open") browser.alive = true;
  if (command === "close") {
    browser.alive = false;
    browser.account = null; // Session cookies are lost when the browser closes.
  }
  if (command === "state-load") {
    if (browser.loadError) return "### Error\nSynthetic state load failure";
    const state = JSON.parse(fs.readFileSync(args[1], "utf8"));
    browser.account = state.cookies[0]?.value || null;
  }
  if (command === "state-save") {
    if (browser.saveError) throw new Error("Synthetic save failure");
    fs.writeFileSync(args[1], JSON.stringify(stateFor(browser.account)));
  }
  return "";
});
mock.method(playwright, "runCode", () => {
  if (browser.evidenceError) return "### Error\nSynthetic detached page";
  return Boolean(browser.account);
});

const { createPlatform } = require("../src/platforms/lieju/platform");
const {
  createPlatformSessionService,
} = require("../desktop/services/platform-session-service");
const {
  createPlatformAccountIdentityService,
} = require("../desktop/services/platform-account-identity-service");
const {
  createPlatformAccountProfileService,
} = require("../desktop/services/platform-account-profile-service");

function stateFor(account) {
  return {
    cookies: account ? [{ name: "synthetic-account", value: account }] : [],
    origins: [],
  };
}

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lieju-login-recovery-"));
  const stateFile = path.join(root, "lieju.json");
  browser = { alive: false, account: null, ...options };
  if (options.saved)
    fs.writeFileSync(stateFile, JSON.stringify(stateFor(options.saved)));
  const platform = createPlatform({
    browserRuntime: { stateFile },
    httpRequest: {
      async newContext(input) {
        const state = JSON.parse(fs.readFileSync(input.storageState, "utf8"));
        const id = state.cookies[0]?.value;
        return {
          async get(url) {
            return {
              status: () => 200,
              url: () => url,
              headers: () => ({ "content-type": "text/html; charset=utf-8" }),
              body: async () =>
                Buffer.from(
                  `<meta charset="utf-8"><div class="bodytop_r"><b>synthetic-${id}</b><a href="/login/?action=quit">logout</a></div><div class="m3"><a href="/u${id}">homepage</a></div>`,
                ),
            };
          },
          storageState: async ({ path: filename }) =>
            fs.writeFileSync(filename, JSON.stringify(state)),
          dispose: async () => {},
        };
      },
    },
  });
  const service = createPlatformSessionService({
    adapters: { lieju: platform.loginSession },
  });
  const identity = createPlatformAccountIdentityService({
    adapters: { lieju: platform.accountInspection },
  });
  t.after(async () => {
    await platform.loginSession.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { service, identity, stateFile };
}

test("check-only cold start restores saved session cookies and supports repeated checks", async (t) => {
  const { service, identity } = fixture(t, { saved: "12345" });
  assert.equal((await service.checkLogin("lieju")).authenticated, true);
  assert.equal(
    (await identity.inspect({ platformId: "lieju" })).displayName,
    "synthetic-12345",
  );
  assert.equal((await service.checkLogin("lieju")).authenticated, true);
});

test("cold login keeps an authenticated persistent profile ahead of an older snapshot", async (t) => {
  const { service, identity } = fixture(t, {
    saved: "12345",
    account: "67890",
  });
  await service.openLogin("lieju");
  assert.equal(browser.account, "67890");
  assert.equal((await service.checkLogin("lieju")).authenticated, true);
  assert.equal(
    (await identity.inspect({ platformId: "lieju" })).displayName,
    "synthetic-67890",
  );
});

test("a live logout is preserved across open and check even with a saved account", async (t) => {
  const { service } = fixture(t, { alive: true, saved: "12345" });
  await service.openLogin("lieju");
  assert.equal((await service.checkLogin("lieju")).authenticated, false);
  assert.equal(browser.account, null);
});

test("a readable logged-out session without a snapshot is unauthenticated", async (t) => {
  const { service } = fixture(t);
  assert.equal((await service.checkLogin("lieju")).authenticated, false);
});

test("unreadable current login never authorizes restoring an older account", async (t) => {
  const { service } = fixture(t, {
    saved: "12345",
    account: "67890",
    evidenceError: true,
  });
  await assert.rejects(service.checkLogin("lieju"), {
    code: "LIEJU_LOGIN_CHECK_FAILED",
  });
  assert.equal(browser.account, "67890");
});

test("state-load command errors are reported and leave manual login available", async (t) => {
  const { service } = fixture(t, { saved: "12345", loadError: true });
  await assert.rejects(service.checkLogin("lieju"), {
    code: "LIEJU_LOGIN_STATE_LOAD_FAILED",
  });
  await service.openLogin("lieju"); // Already-open browser is preserved for manual login.
  browser.account = "67890";
  assert.equal((await service.checkLogin("lieju")).authenticated, true);
});

test("a corrupt saved state reports recovery failure instead of pretending logout", async (t) => {
  const { service, stateFile } = fixture(t);
  fs.writeFileSync(stateFile, "invalid-json");
  await assert.rejects(service.checkLogin("lieju"), {
    code: "LIEJU_LOGIN_STATE_LOAD_FAILED",
  });
});

test("failed state save cannot report successful login or replace the previous snapshot", async (t) => {
  const { service, stateFile } = fixture(t, {
    alive: true,
    account: "67890",
    saved: "12345",
    saveError: true,
  });
  await assert.rejects(service.checkLogin("lieju"), {
    code: "BROWSER_SESSION_STATE_SAVE_FAILED",
  });
  assert.equal(
    JSON.parse(fs.readFileSync(stateFile, "utf8")).cookies[0].value,
    "12345",
  );
});

test("recovered login binds once and a later account switch cannot replace that binding", async (t) => {
  const { service, identity } = fixture(t, { saved: "12345" });
  const profiles = new Map();
  const bindings = new Map();
  const accounts = createPlatformAccountProfileService({
    identityService: identity,
    operationalStore: {
      listAccountProfiles: () => [...profiles.values()],
      createAccountProfile(input) {
        const profile = { ...input, accountProfileId: "synthetic-profile" };
        profiles.set(profile.accountProfileId, profile);
        return profile;
      },
      deleteAccountProfile: ({ accountProfileId }) =>
        profiles.delete(accountProfileId),
    },
    bindingStore: {
      get: (id) => bindings.get(id),
      bind: (input) => bindings.set(input.accountProfileId, input),
      remove: (id) => bindings.delete(id),
    },
  });
  const input = { platformId: "lieju", displayName: "Lieju" };
  await service.checkLogin("lieju");
  const first = await accounts.createAndBind(input);
  assert.equal(first.bindingStatus, "bound");
  assert.equal(first.displayName, "synthetic-12345");
  const originalBinding = bindings.get(first.accountProfileId);
  await service.checkLogin("lieju");
  assert.equal(
    (await accounts.createAndBind(input)).accountProfileId,
    first.accountProfileId,
  );
  browser.alive = true;
  browser.account = "67890";
  await service.checkLogin("lieju");
  await assert.rejects(accounts.createAndBind(input), {
    code: "ACCOUNT_PROFILE_REMOTE_MISMATCH",
  });
  assert.equal(profiles.size, 1);
  assert.deepEqual(bindings.get(first.accountProfileId), originalBinding);
});
