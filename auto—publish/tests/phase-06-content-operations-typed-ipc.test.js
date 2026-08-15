const test = require("node:test");
const assert = require("node:assert/strict");

const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");
const {
  contentOperationsContracts,
} = require("../desktop/ipc/contracts/content-operations-contracts");
const { createAuthenticatedIpcMain } = require("../desktop/ipc/register");
const {
  registerDoubaoCollectionIpc,
} = require("../desktop/ipc/doubao-collection-ipc");
const { loadPreloadHarness } = require("./helpers/preload-harness");

const SUBMISSION_CHANNELS = [
  "content:preview-regular-queue-admission",
  "content:admit-regular-queue-items",
  "content:list-regular-queue-groups",
  "content:update-regular-queue-group-image-count",
  "content:start-regular-queue-group",
  "content:pause-regular-queue-group",
  "content:start-all-regular-queue-groups",
  "content:pause-all-regular-queue-groups",
  "content:remove-pending-queue-items",
  "content:preview-paid-media-preflight",
  "content:confirm-paid-media-batch",
  "content:list-paid-media-batches",
  "content:start-paid-media-batch",
  "content:pause-paid-media-batch",
  "content:cancel-remaining-paid-media-batch-items",
  "content:preview-trashed-article-queue-residue",
  "content:cleanup-trashed-article-queue-residue",
];
const DOUBAO_CHANNELS = [
  "content:list-questions",
  "content:create-question",
  "content:update-question",
  "content:delete-question",
  "content:get-doubao-login-state",
  "content:open-doubao-login",
  "content:collect-doubao-one",
  "content:preview-doubao-batch",
  "content:start-prepared-doubao-batch",
  "content:pause-doubao-batch",
  "content:resume-doubao-batch",
  "content:stop-doubao-batch",
  "content:retry-failed-doubao",
  "content:get-doubao-queue-state",
  "content:save-manual-research",
  "content:doubao-queue-state",
];

test("regular queue admission accepts the production Unicode client identity", () => {
  const base = {
    articleRefs: [{ clientId: "东方视光", articleId: "article-1" }],
    platformId: "toutiao",
    accountProfileId: "account-1",
  };
  for (const [channel, input] of [
    ["content:preview-regular-queue-admission", base],
    ["content:admit-regular-queue-items", { ...base, confirmed: true }],
  ]) {
    const contract = productionIpcRegistry.byChannel(channel);
    const payload = contract.fromArgs([input]);
    assert.equal(
      productionIpcRegistry.encodeRequest(contract, payload).payload
        .articleRefs[0].clientId,
      "东方视光",
      channel,
    );
  }
});

const question = {
  id: "question-1",
  text: "问题一",
  enabled: true,
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:00:00.000Z",
};
const research = {
  id: "research-1",
  clientId: "client-1",
  question: "问题一",
  answerText: "第一行\n第二行",
  references: [
    { title: "来源", url: "https://example.test/source", snippet: "摘要" },
  ],
  collectionMethod: "manual",
  updatedAt: "2026-07-26T00:00:00.000Z",
};
const queue = {
  status: "idle",
  currentTaskId: null,
  completed: 0,
  total: 0,
  waitRemainingMs: 0,
  tasks: [],
};
const preview = {
  mode: "missing",
  clientCount: 1,
  taskCount: 1,
  skippedExisting: 0,
  disabledQuestions: 0,
  tasks: [{ clientId: "client-1", questionId: "question-1", force: false }],
};
const DOUBAO_FIXTURES = {
  "content:list-questions": [
    { clientId: "client-1" },
    { questions: [question] },
  ],
  "content:create-question": [
    { clientId: "client-1", text: "问题一", enabled: true },
    { question },
  ],
  "content:update-question": [
    { clientId: "client-1", questionId: "question-1", text: "问题二" },
    { question },
  ],
  "content:delete-question": [
    { clientId: "client-1", questionId: "question-1" },
    { question },
  ],
  "content:get-doubao-login-state": [{}, { loginState: { status: "unknown" } }],
  "content:open-doubao-login": [
    {},
    { loginState: { status: "login_required" } },
  ],
  "content:collect-doubao-one": [
    { clientId: "client-1", questionId: "question-1", force: false },
    { research },
  ],
  "content:preview-doubao-batch": [
    { clientIds: ["client-1"], mode: "missing" },
    { preview },
  ],
  "content:start-prepared-doubao-batch": [
    {
      tasks: [{ clientId: "client-1", questionId: "question-1", force: false }],
    },
    { queue },
  ],
  "content:pause-doubao-batch": [{}, { queue }],
  "content:resume-doubao-batch": [{}, { queue }],
  "content:stop-doubao-batch": [{}, { queue }],
  "content:retry-failed-doubao": [{}, { queue }],
  "content:get-doubao-queue-state": [{}, { queue }],
  "content:save-manual-research": [
    {
      clientId: "client-1",
      questionId: "question-1",
      answerText: "手工答案\n第二行",
      references: research.references,
    },
    { research },
  ],
};

test("content operations inventory has 33 exact versioned contracts", () => {
  assert.equal(contentOperationsContracts.length, 33);
  for (const channel of [...SUBMISSION_CHANNELS, ...DOUBAO_CHANNELS]) {
    const contract = productionIpcRegistry.byChannel(channel);
    assert.ok(contract, channel);
    assert.equal(contract.schemaVersion, 1);
  }
  assert.equal(
    productionIpcRegistry.byChannel("content:doubao-queue-state").kind,
    "event",
  );
});

test("regular queue admission does not accept a caller batch identity", () => {
  const contract = productionIpcRegistry.byChannel(
    "content:admit-regular-queue-items",
  );
  assert.throws(
    () =>
      productionIpcRegistry.encodeRequest(contract, {
        articleRefs: [{ clientId: "client-1", articleId: "article-1" }],
        platformId: "toutiao",
        accountProfileId: "profile-1",
        batchId: "caller-controlled-batch",
        confirmed: true,
      }),
    { code: "IPC_UNKNOWN_FIELD" },
  );
});

test("regular queue admission requires an explicit account profile identity", () => {
  const contract = productionIpcRegistry.byChannel(
    "content:admit-regular-queue-items",
  );
  assert.throws(
    () =>
      productionIpcRegistry.encodeRequest(contract, {
        articleRefs: [{ clientId: "client-1", articleId: "article-1" }],
        platformId: "toutiao",
        confirmed: true,
      }),
    { code: "IPC_REQUEST_INVALID" },
  );
});

test("each Doubao capability has an independent legal request/result fixture", () => {
  for (const channel of DOUBAO_CHANNELS) {
    const contract = productionIpcRegistry.byChannel(channel);
    assert.equal(contract.feature, "content", channel);
    if (contract.kind === "event") {
      assert.deepEqual(
        productionIpcRegistry.parseEvent(
          contract,
          productionIpcRegistry.event(contract, queue),
        ),
        queue,
      );
      continue;
    }
    const fixture = DOUBAO_FIXTURES[channel];
    assert.ok(fixture, channel + " fixture");
    assert.doesNotThrow(
      () => productionIpcRegistry.encodeRequest(contract, fixture[0]),
      channel,
    );
    assert.doesNotThrow(
      () => productionIpcRegistry.success(contract, fixture[1]),
      channel,
    );
  }
});

test("Doubao preload exposes named methods and exact versioned event mapping", async () => {
  const preload = loadPreloadHarness({
    invoke: (channel) => {
      const contract = productionIpcRegistry.byChannel(channel);
      return productionIpcRegistry.failure(contract, { code: "IPC_INTERNAL" });
    },
  });
  const methodCalls = [
    ["listQuestions", "content:list-questions", ["client-1"]],
    [
      "createQuestion",
      "content:create-question",
      [DOUBAO_FIXTURES["content:create-question"][0]],
    ],
    [
      "updateQuestion",
      "content:update-question",
      [DOUBAO_FIXTURES["content:update-question"][0]],
    ],
    [
      "deleteQuestion",
      "content:delete-question",
      [DOUBAO_FIXTURES["content:delete-question"][0]],
    ],
    ["getDoubaoLoginState", "content:get-doubao-login-state", []],
    ["openDoubaoLogin", "content:open-doubao-login", []],
    [
      "collectDoubaoOne",
      "content:collect-doubao-one",
      [DOUBAO_FIXTURES["content:collect-doubao-one"][0]],
    ],
    [
      "previewDoubaoBatch",
      "content:preview-doubao-batch",
      [DOUBAO_FIXTURES["content:preview-doubao-batch"][0]],
    ],
    [
      "startPreparedDoubaoBatch",
      "content:start-prepared-doubao-batch",
      [DOUBAO_FIXTURES["content:start-prepared-doubao-batch"][0]],
    ],
    ["pauseDoubaoBatch", "content:pause-doubao-batch", []],
    ["resumeDoubaoBatch", "content:resume-doubao-batch", []],
    ["stopDoubaoBatch", "content:stop-doubao-batch", []],
    ["retryFailedDoubao", "content:retry-failed-doubao", []],
    ["getDoubaoQueueState", "content:get-doubao-queue-state", []],
    [
      "saveManualResearch",
      "content:save-manual-research",
      [DOUBAO_FIXTURES["content:save-manual-research"][0]],
    ],
  ];
  for (const [method, channel, args] of methodCalls) {
    assert.equal(typeof preload.api.content[method], "function", method);
    await preload.api.content[method](...args);
    const contract = productionIpcRegistry.byChannel(channel);
    const request = preload.transportCalls.at(-1)[1];
    assert.equal(preload.transportCalls.at(-1)[0], channel, method);
    assert.deepEqual(
      productionIpcRegistry.parseRequest(contract, request),
      method === "listQuestions"
        ? { clientId: args[0] }
        : contract.fromArgs(args),
      method,
    );
  }

  const received = [];
  const dispose = preload.api.content.onDoubaoQueueState((value) =>
    received.push(value),
  );
  const event = productionIpcRegistry.byChannel("content:doubao-queue-state");
  assert.equal(preload.transportListeners.has(event.channel), true);
  const encoded = productionIpcRegistry.event(event, queue);
  preload.emit(event.channel, encoded);
  assert.deepEqual(received, [queue]);
  dispose();
  assert.equal(preload.transportListeners.has(event.channel), false);
});

test("Doubao contracts reject unknown request fields and raw error or path output", () => {
  const create = productionIpcRegistry.byChannel("content:create-question");
  assert.throws(
    () =>
      productionIpcRegistry.encodeRequest(create, {
        clientId: "client-1",
        text: "question",
        filePath: "C:\\private\\question.json",
      }),
    { code: "IPC_UNKNOWN_FIELD" },
  );

  const queue = productionIpcRegistry.byChannel(
    "content:get-doubao-queue-state",
  );
  assert.throws(
    () =>
      productionIpcRegistry.success(queue, {
        queue: {
          status: "completed",
          currentTaskId: null,
          completed: 0,
          total: 1,
          waitRemainingMs: 0,
          tasks: [
            {
              id: "task-1",
              clientId: "client-1",
              questionId: "question-1",
              status: "failed",
              answerLength: 0,
              referenceCount: 0,
              error: {
                code: "REMOTE",
                message: "C:\\private\\cookie.txt",
                stack: "secret",
              },
            },
          ],
        },
      }),
    { code: "IPC_UNKNOWN_FIELD" },
  );
});

test("Doubao production IPC preserves path-free Unicode client and question identities", async () => {
  const handlers = new Map();
  registerDoubaoCollectionIpc({
    ipcMain: createAuthenticatedIpcMain(
      { handle: (channel, handler) => handlers.set(channel, handler) },
      async () => undefined,
    ),
    doubaoCollectionService: {
      listQuestions: () => [
        {
          id: "品牌介绍问题",
          text: "请介绍品牌",
          enabled: true,
          createdAt: "2026-07-27T00:00:00.000Z",
          updatedAt: "2026-07-27T00:00:00.000Z",
        },
      ],
    },
  });
  const contract = productionIpcRegistry.byChannel("content:list-questions");
  const result = await handlers.get(contract.channel)(
    null,
    productionIpcRegistry.encodeRequest(contract, { clientId: "中文客户" }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.data.questions[0].id, "品牌介绍问题");
});

test("passive Doubao login inspection preserves the session-not-open safe error", async () => {
  const handlers = new Map();
  registerDoubaoCollectionIpc({
    ipcMain: createAuthenticatedIpcMain(
      { handle: (channel, handler) => handlers.set(channel, handler) },
      async () => undefined,
    ),
    doubaoCollectionService: {
      getLoginState: () => {
        throw Object.assign(new Error("session closed"), {
          code: "PLAYWRIGHT_SESSION_NOT_OPEN",
        });
      },
    },
  });
  const contract = productionIpcRegistry.byChannel(
    "content:get-doubao-login-state",
  );
  const result = await handlers.get(contract.channel)(
    null,
    productionIpcRegistry.encodeRequest(contract, {}),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "PLAYWRIGHT_SESSION_NOT_OPEN");
  assert.equal(result.error.category, "transport");
  assert.doesNotMatch(JSON.stringify(result), /session closed/i);
});
