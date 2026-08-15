const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const { registerAccountProfileIpc } = require("../desktop/ipc/account-profile-ipc");
const { registerPlatformIpc } = require("../desktop/ipc/platform-ipc");
const { createAuthenticatedIpcMain } = require("../desktop/ipc/register");
const { createContractRegistry } = require("../desktop/ipc/contracts/registry");
const { platformContracts } = require("../desktop/ipc/contracts/platform-contracts");
const { productionIpcRegistry } = require("../desktop/ipc/contracts/production-registry");

const INVOKE_CHANNELS = [
  "platforms:get-queue",
  "platforms:list-account-profiles",
  "platforms:confirm-account-profile",
  "platforms:open-login",
  "platforms:check-login",
];
const registry = createContractRegistry(platformContracts);

test("public preload platform login methods encode one exact platform identity", async () => {
  const calls = [];
  const exposed = {};
  const source = fs.readFileSync(
    path.join(__dirname, "..", "desktop", "preload.js"),
    "utf8",
  );
  vm.runInNewContext(source, {
    require(name) {
      if (name === "electron") {
        return {
          contextBridge: {
            exposeInMainWorld(name, api) { exposed[name] = api; },
          },
          ipcRenderer: {
            invoke(channel, request) {
              calls.push([channel, request]);
              const contract = productionIpcRegistry.byChannel(channel);
              return Promise.resolve(
                productionIpcRegistry.success(
                  contract,
                  channel === "platforms:open-login"
                    ? { platformId: "toutiao", status: "opened" }
                    : { platformId: "toutiao", authenticated: true },
                ),
              );
            },
            on() {},
            removeListener() {},
          },
        };
      }
      if (name === "./ipc/contracts/production-registry")
        return { productionIpcRegistry };
      throw new Error("Unexpected preload dependency: " + name);
    },
  });

  const opened = await exposed.desktopConsole.platforms.openLogin("toutiao");
  const checked = await exposed.desktopConsole.platforms.checkLogin("toutiao");

  assert.equal(opened.ok, true, JSON.stringify(opened));
  assert.equal(checked.ok, true, JSON.stringify(checked));
  assert.equal(calls.length, 2);
  for (const [channel, request] of calls) {
    const contract = productionIpcRegistry.byChannel(channel);
    assert.deepEqual(
      { ...productionIpcRegistry.parseRequest(contract, request) },
      { platformId: "toutiao" },
    );
  }
});

test("platform domain exposes only queue, profile, and login contracts", () => {
  assert.equal(platformContracts.length, 5);
  assert.deepEqual(
    platformContracts.map((contract) => contract.channel).sort(),
    [...INVOKE_CHANNELS].sort(),
  );
  for (const channel of INVOKE_CHANNELS) {
    const contract = registry.byChannel(channel);
    assert.equal(contract.schemaVersion, 1, channel);
    assert.ok(contract.errorCodes.includes("AUTH_REQUIRED"), channel);
    assert.ok(contract.errorCodes.includes("IPC_REQUEST_INVALID"), channel);
    assert.ok(contract.errorCodes.includes("IPC_RESULT_INVALID"), channel);
  }
  assert.equal(registry.byChannel("platform-state"), null);
  assert.equal(registry.byChannel("platforms:get-state"), null);
});

test("platform queue contract rejects scanDir and submission results reject paths", () => {
  const queue = registry.byChannel("platforms:get-queue");
  assert.throws(
    () =>
      registry.success(queue, {
        platforms: [
          { id: "toutiao", loginAvailable: true, scanDir: "C:\\private" },
        ],
        queue: [],
      }),
    { code: "IPC_UNKNOWN_FIELD" },
  );
});

test("authenticated platform and account registrars return path-free typed projections", async () => {
  const handlers = new Map();
  const ipcMain = createAuthenticatedIpcMain(
    { handle: (channel, handler) => handlers.set(channel, handler) },
    async () => {},
  );
  registerPlatformIpc({
    ipcMain,
    loadedPlatforms: [{ id: "toutiao", scanDir: "C:\\private\\queue" }],
    platformSessionService: { supports: () => true },
    platformWorkbenchService: {
      scanQueue: () => [
        {
          platformId: "toutiao",
          articles: [
            {
              filename: "fixture.md",
              title: "Fixture",
              filePath: "C:\\private\\fixture.md",
              archiveError: Object.assign(new Error("private path"), {
                code: "ARCHIVE_FAILED",
              }),
            },
          ],
        },
      ],
      taskKey: () => "",
    },
  });
  registerAccountProfileIpc({
    ipcMain,
    operationalStore: {
      listAccountProfiles: () => [
        {
          accountProfileId: "account-1",
          platformId: "toutiao",
          displayName: "Fixture account",
        },
      ],
      createAccountProfile: (input) => ({
        accountProfileId: "account-2",
        ...input,
      }),
    },
  });

  const queueContract = productionIpcRegistry.byChannel("platforms:get-queue");
  const queue = await handlers.get(queueContract.channel)(
    {},
    productionIpcRegistry.encodeRequest(queueContract, {}),
  );
  assert.equal(queue.ok, true, JSON.stringify(queue));
  assert.deepEqual(queue.data.platforms, [
    { id: "toutiao", loginAvailable: true },
  ]);
  assert.equal(queue.data.queue[0].archiveErrorCode, "ARCHIVE_FAILED");
  assert.equal("filePath" in queue.data.queue[0], false);

  const profilesContract = productionIpcRegistry.byChannel(
    "platforms:list-account-profiles",
  );
  const profiles = await handlers.get(profilesContract.channel)(
    {},
    productionIpcRegistry.encodeRequest(profilesContract, {}),
  );
  assert.equal(profiles.ok, true, JSON.stringify(profiles));
  assert.equal(profiles.data.profiles.length, 1);
});
