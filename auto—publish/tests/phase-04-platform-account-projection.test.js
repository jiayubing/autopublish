"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { registerPlatformIpc } = require("../desktop/ipc/platform-ipc");

function register(overrides, dependencyOverrides) {
  const handlers = new Map();
  let received = null;
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
      buildSelectedSubmissionsPlan: function (submissions) {
        received = submissions;
        return { tasks: [] };
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
  return { handlers, received: () => received };
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

test("production platform submit closes before Playwright or command preparation", async () => {
  let playwrightChecks = 0;
  const value = register(
    {},
    {
      publicationSubmissionService: null,
      assertPlaywrightAvailable: () => {
        playwrightChecks += 1;
      },
    },
  );
  const result = await value.handlers.get("platforms:submit-selected")(null, {
    submissions: [
      {
        sourcePlatformId: "toutiao",
        filename: "fixture.md",
        targetPlatformIds: ["toutiao"],
        accountProfiles: { toutiao: "account-toutiao" },
      },
    ],
    autoTrash: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "PUBLICATION_WORKFLOW_UNAVAILABLE");
  assert.equal(playwrightChecks, 0);
  assert.equal(value.received(), null);
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

test("platform submission accepts the durable profile mapping and forwards it unchanged", async () => {
  const value = register();
  const result = await value.handlers.get("platforms:submit-selected")(null, {
    submissions: [
      {
        sourcePlatformId: "toutiao",
        filename: "fixture.md",
        targetPlatformIds: ["toutiao"],
        accountProfiles: { toutiao: "account-toutiao" },
      },
    ],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(value.received(), [
    {
      sourcePlatformId: "toutiao",
      filename: "fixture.md",
      targetPlatformIds: ["toutiao"],
      accountProfiles: { toutiao: "account-toutiao" },
    },
  ]);
});

test("platform submission projects the durable auto-trash outcome instead of dropping the request", async () => {
  let submitOptions = null;
  const value = register(
    {
      buildSelectedSubmissionsPlan: () => ({
        tasks: [
          {
            sourcePlatformId: "toutiao",
            filename: "fixture.md",
            targetPlatformId: "toutiao",
            postProcessingPayload: { batchId: "batch-auto-trash" },
          },
        ],
      }),
    },
    {
      publicationSubmissionService: {
        submit: async (_plan, options) => {
          submitOptions = options;
          return {
            results: [
              {
                status: "published",
                postProcessing: [
                  {
                    jobId: "job-auto-trash",
                    batchId: "batch-auto-trash",
                    sourcePlatformId: "toutiao",
                    filename: "fixture.md",
                    status: "completed",
                    output: {
                      autoTrash: { status: "committed" },
                    },
                  },
                ],
              },
            ],
          };
        },
      },
    },
  );
  const result = await value.handlers.get("platforms:submit-selected")(null, {
    submissions: [
      {
        sourcePlatformId: "toutiao",
        filename: "fixture.md",
        targetPlatformIds: ["toutiao"],
        accountProfiles: { toutiao: "account-toutiao" },
      },
    ],
    autoTrash: true,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(submitOptions, { autoTrash: true });
  assert.equal(result.data.trashDisposition, "auto_trash_requested");
  assert.equal(result.data.trashSummary.movedCount, 1);
});

test("platform submission maps a durable needs-repair auto-trash result", async () => {
  const value = register(
    {
      buildSelectedSubmissionsPlan: () => ({
        tasks: [
          {
            sourcePlatformId: "toutiao",
            filename: "fixture.md",
            targetPlatformId: "toutiao",
            postProcessingPayload: { batchId: "batch-auto-trash-repair" },
          },
        ],
      }),
    },
    {
      publicationSubmissionService: {
        submit: async () => ({
          results: [
            {
              status: "published",
              postProcessing: [
                {
                  jobId: "job-auto-trash-repair",
                  batchId: "batch-auto-trash-repair",
                  sourcePlatformId: "toutiao",
                  filename: "fixture.md",
                  status: "completed",
                  output: {
                    autoTrash: { status: "needs_repair" },
                  },
                },
              ],
            },
          ],
        }),
      },
    },
  );
  const result = await value.handlers.get("platforms:submit-selected")(null, {
    submissions: [
      {
        sourcePlatformId: "toutiao",
        filename: "fixture.md",
        targetPlatformIds: ["toutiao"],
        accountProfiles: { toutiao: "account-toutiao" },
      },
    ],
    autoTrash: true,
  });
  assert.equal(result.data.trashDisposition, "auto_trash_blocked");
  assert.equal(result.data.trashSummary.failedCount, 1);
  assert.deepEqual(result.data.trashSummary.reasonCodes, [
    "REMOVAL_NEEDS_REPAIR",
  ]);
});
