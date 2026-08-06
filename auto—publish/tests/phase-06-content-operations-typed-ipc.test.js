const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

const SUBMISSION_CHANNELS = [
  "content:preview-export",
  "content:export-article",
  "content:preview-submission-batch",
  "content:list-submission-platforms",
  "content:create-submission-batch",
  "content:preview-regular-queue-admission",
  "content:admit-regular-queue-items",
  "content:remove-pending-queue-items",
  "content:preview-paid-media-preflight",
  "content:confirm-paid-media-batch",
  "content:cancel-submission-batch",
  "content:preview-cleanup-failed-submission-items",
  "content:cleanup-failed-submission-items",
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

test("submission operations accept the production Unicode client identity", () => {
  const base = {
    clientId: "东方视光",
    articleIds: ["article-1"],
    targetPlatformIds: ["toutiao"],
    accountProfiles: { toutiao: "account-1" },
  };
  for (const [channel, input] of [
    ["content:preview-export", {
      clientId: "东方视光",
      generatedArticleId: "article-1",
      targetPlatform: "media",
      confirmed: true,
    }],
    ["content:export-article", {
      clientId: "东方视光",
      generatedArticleId: "article-1",
      targetPlatform: "media",
      confirmed: true,
    }],
    ["content:preview-submission-batch", base],
    ["content:create-submission-batch", { ...base, confirmed: true }],
  ]) {
    const contract = productionIpcRegistry.byChannel(channel);
    const payload = contract.fromArgs([input]);
    assert.equal(
      productionIpcRegistry.encodeRequest(contract, payload).payload.clientId,
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

test("content operations inventory has 31 exact versioned contracts", () => {
  assert.equal(contentOperationsContracts.length, 31);
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

test("Doubao event sender uses the shared contract encoder", () => {
  const source = fs.readFileSync(
    path.resolve(
      __dirname,
      "../desktop/composition/workspace-runtime-composition.js",
    ),
    "utf8",
  );
  assert.match(source, /productionIpcRegistry\.event\(\s*doubaoQueueContract/);
  assert.doesNotMatch(
    source,
    /sendToRenderer\("content:doubao-queue-state",\s*value\)/,
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

test("Doubao production callers are fixed named methods owned by content", () => {
  const preload = fs.readFileSync(
    path.resolve(__dirname, "../desktop/preload.js"),
    "utf8",
  );
  const bridge = fs.readFileSync(
    path.resolve(__dirname, "../media-workbench/src/bridge/content.ts"),
    "utf8",
  );
  for (const method of [
    "listQuestions",
    "createQuestion",
    "updateQuestion",
    "deleteQuestion",
    "getDoubaoLoginState",
    "openDoubaoLogin",
    "collectDoubaoOne",
    "previewDoubaoBatch",
    "startPreparedDoubaoBatch",
    "pauseDoubaoBatch",
    "resumeDoubaoBatch",
    "stopDoubaoBatch",
    "retryFailedDoubao",
    "getDoubaoQueueState",
    "saveManualResearch",
    "onDoubaoQueueState",
  ]) {
    assert.match(preload, new RegExp(`${method}: function\\(`), method);
    assert.match(
      bridge,
      new RegExp(`(?:api\\.${method}|onDoubaoQueueState)`),
      method,
    );
    assert.doesNotMatch(
      bridge,
      new RegExp(`callContent\\(\\s*["']${method}["']`),
      method,
    );
  }
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
