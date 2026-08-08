"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { registerPlatformIpc } = require("../desktop/ipc/platform-ipc");

function register(overrides, dependencyOverrides) {
  const handlers = new Map();
  const service = Object.assign(
    {
      scanQueue: function () {
        return [
          {
            platformId: "toutiao",
            articles: [
              {
                filename: "fixture.md",
                title: "fixture",
                accountProfileId: "account-toutiao",
              },
            ],
          },
        ];
      },
      taskKey: function () {
        return "";
      },
    },
    overrides,
  );
  registerPlatformIpc(Object.assign({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    platformWorkbenchService: service,
    taskService: {},
    publicationSubmissionService: { submit: async () => ({ results: [] }) },
  }, dependencyOverrides));
  return { handlers };
}

test("platform queue projects only its durable account profile id", async () => {
  const value = register();
  const result = await value.handlers.get("platforms:get-queue")();
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.queue[0], {
    filename: "fixture.md",
    title: "fixture",
    platformId: "toutiao",
    sourcePlatformId: "toutiao",
    sourceArticleState: "active",
    reasonCode: null,
    accountProfileId: "account-toutiao",
    archiveErrorCode: null,
    remoteStatus: null,
  });
});

test("production platform IPC omits the retired direct-submit command", () => {
  const value = register();
  assert.equal(value.handlers.has("platforms:submit-selected"), false);
});

test("browser platform login commands open and persist a verified session", async () => {
  const calls = [];
  const adapter = {
    id: "toutiao",
    scanDir: "toutiao",
    openLogin: async () => calls.push("open"),
    checkLogin: async () => {
      calls.push("check");
      return true;
    },
    saveSession: async () => calls.push("save"),
  };
  const value = register({}, { loadedPlatforms: [adapter] });

  const opened = await value.handlers.get("platforms:open-login")(null, {
    platformId: "toutiao",
  });
  const checked = await value.handlers.get("platforms:check-login")(null, {
    platformId: "toutiao",
  });

  assert.deepEqual(opened, {
    ok: true,
    data: { platformId: "toutiao", status: "opened" },
  });
  assert.deepEqual(checked, {
    ok: true,
    data: { platformId: "toutiao", authenticated: true },
  });
  assert.deepEqual(calls, ["open", "check", "save"]);
});

test("platform login commands fail closed for platforms without browser login", async () => {
  const value = register({}, {
    loadedPlatforms: [{ id: "hepan", scanDir: "hepan" }],
  });

  const result = await value.handlers.get("platforms:open-login")(null, {
    platformId: "hepan",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "PLATFORM_LOGIN_UNAVAILABLE");
});
