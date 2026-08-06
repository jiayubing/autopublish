const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createContractRegistry } = require("../desktop/ipc/contracts/registry");
const contentCore = require("../desktop/ipc/contracts/content-core-contracts");
const { contentCoreContracts } = contentCore;
const { createAuthenticatedIpcMain } = require("../desktop/ipc/register");
const {
  registerArticleAttentionIpc,
} = require("../desktop/ipc/article-attention-ipc");
const { registerAiContentIpc } = require("../desktop/ipc/ai-content-ipc");
const {
  registerArticleManagementIpc,
} = require("../desktop/ipc/article-management-ipc");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");

const CHANNELS = [
  "content:list-clients",
  "content:list-research",
  "content:list-template-catalog",
  "content:retry-material",
  "content:generate-article",
  "content:save-article",
  "content:preview-article-removal-impact",
  "content:trash-articles",
  "content:restore-article",
  "content:prepare-permanent-delete-article",
  "content:permanently-delete-article",
  "content:get-article-removal-transaction",
  "content:retry-article-removal-transaction",
  "content:get-article-management-snapshot",
  "content:list-article-attention",
  "content:preview-article-attention",
  "content:resolve-article-attention",
  "content:article-removal-transaction",
].sort();

test("content core declares exactly 19 versioned path-free capabilities", function () {
  const registry = createContractRegistry(contentCoreContracts);
  assert.deepEqual(
    contentCoreContracts.map((contract) => contract.channel).sort(),
    CHANNELS,
  );
  assert.equal(
    contentCoreContracts.every((contract) => contract.schemaVersion === 1),
    true,
  );
  assert.equal(
    registry.byChannel("content:article-removal-transaction").kind,
    "event",
  );
  assert.doesNotMatch(
    JSON.stringify(contentCoreContracts),
    /workspacePath|filePath|sidecarPath|sourceFile|database|cookie|secret/i,
  );
  for (const removed of [
    "content:get-client",
    "content:get-research",
    "content:get-generated-article",
    "content:get-submission-batch",
    "content:recover-article-removals",
  ])
    assert.equal(registry.byChannel(removed), null);
});

test("article attention list crosses the authenticated IPC seam as an exact path-free DTO", async function () {
  const handlers = new Map();
  const ipcMain = createAuthenticatedIpcMain(
    {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    async function () {},
  );
  registerArticleAttentionIpc({
    ipcMain,
    articleAttentionQuery: {
      list() {
        return {
          revision: 7,
          items: [
            {
              attentionId: "attention-1",
              kind: "failed-submission",
              articleId: "article-1",
              titleSnapshot: "公开标题",
              allowedActions: ["inspect"],
              message: "请检查投稿状态",
              filePath: "F:\\private\\article.md",
            },
          ],
          counts: { total: 1, actionable: 0 },
          workspacePath: "F:\\private",
        };
      },
      get() {
        return null;
      },
    },
    articleAttentionResolver: { preview() {}, resolve() {} },
  });

  const result = await handlers.get("content:list-article-attention")(null, {
    schemaVersion: 1,
    payload: {},
  });
  assert.deepEqual(result, {
    schemaVersion: 1,
    ok: true,
    data: {
      revision: 7,
      items: [
        {
          attentionId: "attention-1",
          kind: "failed-submission",
          articleId: "article-1",
          titleSnapshot: "公开标题",
          allowedActions: ["inspect"],
          message: "请检查投稿状态",
        },
      ],
      counts: { total: 1, actionable: 0 },
    },
  });
  assert.doesNotMatch(
    JSON.stringify(result),
    /private|filePath|workspacePath/i,
  );
});

test("article attention preview exposes only the confirmation decision DTO", async function () {
  const handlers = new Map();
  const ipcMain = createAuthenticatedIpcMain(
    {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    async function () {},
  );
  registerArticleAttentionIpc({
    ipcMain,
    articleAttentionQuery: { list() {}, get() {} },
    articleAttentionResolver: {
      preview(input) {
        return {
          attentionId: input.attentionId,
          revision: 8,
          action: input.action,
          requiresConfirmation: true,
          message: "确认后重试",
          changedScopes: ["articleAttention"],
          details: { filePath: "F:\\private\\article.md" },
        };
      },
      resolve() {},
    },
  });

  const result = await handlers.get("content:preview-article-attention")(null, {
    schemaVersion: 1,
    payload: { attentionId: "attention-1", action: "retry-publication" },
  });
  assert.deepEqual(result, {
    schemaVersion: 1,
    ok: true,
    data: {
      attentionId: "attention-1",
      revision: 8,
      action: "retry-publication",
      requiresConfirmation: true,
      message: "确认后重试",
      changedScopes: ["articleAttention"],
    },
  });
});

test("article attention resolution does not expose the domain command result", async function () {
  const handlers = new Map();
  const ipcMain = createAuthenticatedIpcMain(
    {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    async function () {},
  );
  registerArticleAttentionIpc({
    ipcMain,
    articleAttentionQuery: { list() {}, get() {} },
    articleAttentionResolver: {
      preview() {},
      resolve(input) {
        return {
          outcome: "resolved",
          attentionId: input.attentionId,
          changedScopes: ["articleAttention", "articleManagement"],
          result: { database: "F:\\private\\operational.db", stack: "secret" },
        };
      },
    },
  });

  const result = await handlers.get("content:resolve-article-attention")(null, {
    schemaVersion: 1,
    payload: {
      attentionId: "attention-1",
      action: "retry-publication",
      expectedRevision: 8,
      confirmed: true,
    },
  });
  assert.deepEqual(result, {
    schemaVersion: 1,
    ok: true,
    data: {
      outcome: "resolved",
      attentionId: "attention-1",
      changedScopes: ["articleAttention", "articleManagement"],
    },
  });
  assert.doesNotMatch(JSON.stringify(result), /database|stack|private/i);
});

test("renderer article attention uses only the named content capability surface", function () {
  const source = fs.readFileSync(
    path.join(__dirname, "../media-workbench/src/bridge/publication.ts"),
    "utf8",
  );
  const preload = fs.readFileSync(
    path.join(__dirname, "../desktop/preload.js"),
    "utf8",
  );
  assert.doesNotMatch(
    source,
    /desktopConsole!?\.articleAttention|const attention\s*=/,
  );
  assert.doesNotMatch(preload, /\n\s*articleAttention\s*:/);
  for (const method of [
    "listArticleAttention",
    "previewArticleAttention",
    "resolveArticleAttention",
  ])
    assert.match(
      source,
      new RegExp(
        `desktopConsole[^\\n]+content[^\\n]+${method}|content\\?\\.${method}|content\\.${method}`,
      ),
    );
});

test("article removal events are versioned and strip transaction internals", function () {
  assert.equal(typeof contentCore.projectArticleRemovalTransaction, "function");
  const registry = createContractRegistry(contentCoreContracts);
  const contract = registry.byChannel("content:article-removal-transaction");
  const event = registry.event(
    contract,
    contentCore.projectArticleRemovalTransaction({
      id: "tx-1",
      transactionId: "tx-1",
      status: "needs_repair",
      phase: "needs_repair",
      errorCode: "PUBLICATION_ATTEMPT_MISMATCH",
      revision: 3,
      changedScopes: ["articleManagement", "articleAttention", "platformQueue"],
      workspacePath: "F:\\private",
      claimToken: "secret-claim",
      activeOperation: { filePath: "F:\\private\\article.md" },
    }),
  );
  assert.deepEqual(event, {
    schemaVersion: 1,
    id: "tx-1",
    transactionId: "tx-1",
    status: "needs_repair",
    phase: "needs_repair",
    errorCode: "PUBLICATION_ATTEMPT_MISMATCH",
    revision: 3,
    changedScopes: ["articleManagement", "articleAttention", "platformQueue"],
  });
  assert.doesNotMatch(
    JSON.stringify(event),
    /private|claimToken|activeOperation|filePath/i,
  );
});

test("article removal lookup exposes the same safe transaction DTO as its event", async function () {
  const handlers = new Map();
  const ipcMain = createAuthenticatedIpcMain(
    {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    async function () {},
  );
  registerAiContentIpc({
    ipcMain,
    aiContentService: {
      getArticleRemovalTransaction(transactionId) {
        return {
          id: transactionId,
          transactionId,
          status: "needs_repair",
          phase: "needs_repair",
          errorCode: "QUEUE_STATE_UNKNOWN",
          claimOwner: "internal-runner",
          workspacePath: "F:\\private",
        };
      },
    },
  });
  const result = await handlers.get("content:get-article-removal-transaction")(
    null,
    {
      schemaVersion: 1,
      payload: { transactionId: "tx-1" },
    },
  );
  assert.deepEqual(result, {
    schemaVersion: 1,
    ok: true,
    data: {
      transaction: {
        id: "tx-1",
        transactionId: "tx-1",
        status: "needs_repair",
        phase: "needs_repair",
        errorCode: "QUEUE_STATE_UNKNOWN",
      },
    },
  });
});

test("content clients preserve multiline material text while stripping paths and raw errors", async function () {
  const handlers = new Map();
  const ipcMain = createAuthenticatedIpcMain(
    {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    async function () {},
  );
  registerAiContentIpc({
    ipcMain,
    aiContentService: {
      listClients() {
        return [
          {
            id: "client-1",
            name: "测试客户",
            directory: "F:\\private\\client-1",
            knowledgeFiles: [
              {
                id: "material-1",
                name: "facts.txt",
                content: "第一行\n第二行",
                status: "error",
                sourcePath: "F:\\private\\facts.txt",
                error: {
                  code: "MATERIAL_CONVERSION_FAILED",
                  message: "F:\\private\\facts.txt failed",
                  stack: "secret",
                },
              },
            ],
          },
        ];
      },
    },
  });
  const result = await handlers.get("content:list-clients")(null, {
    schemaVersion: 1,
    payload: {},
  });
  assert.deepEqual(result, {
    schemaVersion: 1,
    ok: true,
    data: {
      clients: [
        {
          id: "client-1",
          name: "测试客户",
          knowledgeFiles: [
            {
              id: "material-1",
              name: "facts.txt",
              content: "第一行\n第二行",
              status: "error",
              error: {
                code: "MATERIAL_CONVERSION_FAILED",
                message: "资料处理失败，请重试。",
              },
            },
          ],
        },
      ],
    },
  });
  assert.doesNotMatch(
    JSON.stringify(result),
    /private|sourcePath|directory|stack/i,
  );
});

test("content source queries preserve path-free Unicode business identities", async function () {
  const handlers = new Map();
  const ipcMain = createAuthenticatedIpcMain(
    {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    async function () {},
  );
  registerAiContentIpc({
    ipcMain,
    aiContentService: {
      listClients() {
        return [{ id: "中文客户", name: "中文客户", knowledgeFiles: [] }];
      },
      listTemplateCatalog() {
        return {
          revision: "revision-1",
          platforms: [
            {
              id: "微信公众号",
              displayName: "微信公众号",
              description: "",
              order: 0,
              source: "custom",
            },
          ],
          templates: [
            {
              id: "新闻稿",
              templateId: "新闻稿",
              platform: "微信公众号",
              platformId: "微信公众号",
              scenario: "新闻稿",
              name: "新闻稿",
              body: "请生成新闻稿。",
              source: "custom",
            },
          ],
          diagnostics: [],
        };
      },
    },
  });

  const clients = await handlers.get("content:list-clients")(null, {
    schemaVersion: 1,
    payload: {},
  });
  const catalog = await handlers.get("content:list-template-catalog")(null, {
    schemaVersion: 1,
    payload: {},
  });

  assert.equal(clients.ok, true);
  assert.equal(clients.data.clients[0].id, "中文客户");
  assert.equal(catalog.ok, true);
  assert.equal(catalog.data.platforms[0].id, "微信公众号");
  assert.equal(catalog.data.templates[0].id, "新闻稿");
});

test("article management accepts status-free cancellation action-plan items", async function () {
  const handlers = new Map();
  const ipcMain = createAuthenticatedIpcMain(
    {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    async function () {},
  );
  const article = {
    id: "article-1",
    clientId: "畅途",
    materialIds: ["品牌资料.docx"],
    researchQueryIds: ["厦门汽车音响改装推荐"],
    platform: "toutiao",
    scenario: "品牌介绍",
    templateId: "新闻稿",
    title: "文章标题",
    content: "文章正文",
    status: "saved",
    source: {
      client_material: true,
      doubao_answer: true,
      references: false,
      template: true,
    },
    createdAt: "2026-07-27T00:00:00.000Z",
  };
  registerArticleManagementIpc({
    ipcMain,
    articleManagementSnapshot: {
      get() {
        return {
          clientId: "畅途",
          revision: 2,
          articles: [article],
          trash: [],
          submissionBatches: [{
            id: "batch-1",
            clientId: "畅途",
            status: "queued",
            items: [{
              articleId: "article-1",
              targetPlatformId: "toutiao",
              status: "queued",
              publicationId: null,
              attemptId: null,
            }],
          }],
          cancellationPlans: [{
            batchId: "batch-1",
            clientId: "畅途",
            action: "cancel",
            planId: "plan-1",
            fingerprint: "fingerprint-1",
            allowedCount: 1,
            blockedCount: 0,
            items: [{
              articleId: "article-1",
              targetPlatformId: "toutiao",
              publicationId: null,
              attemptId: null,
              action: "cancel",
              allowed: true,
              reasonCode: null,
              reasonMessage: null,
              fingerprint: "item-fingerprint-1",
            }],
          }],
          publicationRecords: [],
          attention: {
            revision: 2,
            items: [],
            counts: { total: 0, actionable: 0 },
          },
          submissionPlatforms: [{
            id: "toutiao",
            displayName: "头条",
            contentQueueImport: true,
          }],
          workflowByArticle: {},
          publicationSummaries: {},
        };
      },
    },
  });

  const result = await handlers.get("content:get-article-management-snapshot")(
    null,
    {
      schemaVersion: 1,
      payload: { clientId: "畅途" },
    },
  );

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.data.articles.length, 1);
  assert.equal(result.data.submissionPlatforms.length, 1);
  assert.deepEqual(result.data.cancellationPlans[0].items[0], {
    articleId: "article-1",
    targetPlatformId: "toutiao",
    publicationId: null,
    attemptId: null,
    action: "cancel",
    allowed: true,
    reasonCode: null,
    reasonMessage: null,
    fingerprint: "item-fingerprint-1",
  });
});

test("article management preserves a saved article when a legacy publication lacks enriched identity fields", async function () {
  const registry = createContractRegistry(contentCoreContracts);
  const contract = registry.byChannel("content:get-article-management-snapshot");
  const projected = contentCore.projectManagementSnapshot({
    clientId: "中文客户",
    revision: 3,
    articles: [{
      id: "article-1",
      clientId: "中文客户",
      researchQueryIds: [],
      platform: "微信公众号",
      scenario: "介绍",
      templateId: "新闻稿",
      title: "新保存文章",
      content: "文章正文",
      status: "saved",
      source: {
        client_material: true,
        doubao_answer: false,
        references: false,
        template: true,
      },
      createdAt: "2026-07-27T00:00:00.000Z",
      reviewedAt: null,
    }],
    trash: [],
    submissionBatches: [],
    cancellationPlans: [],
    publicationRecords: [{
      publicationId: "publication-legacy",
      clientId: "中文客户",
      articleId: "article-1",
      status: "published",
      attempts: [],
    }],
    attention: {
      revision: 3,
      items: [],
      counts: { total: 0, actionable: 0 },
    },
    submissionPlatforms: [{
      id: "media",
      displayName: "付费媒体",
      contentQueueImport: true,
    }],
    workflowByArticle: {},
    publicationSummaries: {},
  });

  const response = registry.success(contract, projected);
  assert.equal(response.ok, true);
  assert.equal(response.data.articles[0].title, "新保存文章");
  assert.deepEqual(response.data.publicationRecords[0], {
    publicationId: "publication-legacy",
    clientId: "中文客户",
    articleId: "article-1",
    status: "published",
    attempts: [],
  });
  assert.equal("articleKey" in response.data.publicationRecords[0], false);
  assert.equal("targetKey" in response.data.publicationRecords[0], false);
});

test("article management safely bounds a generated article reference accepted by the research producer", function () {
  const registry = createContractRegistry(contentCoreContracts);
  const contract = registry.byChannel("content:get-article-management-snapshot");
  const projected = contentCore.projectManagementSnapshot({
    clientId: "畅途",
    revision: 4,
    articles: [{
      id: "article-with-reference",
      clientId: "畅途",
      researchQueryIds: ["调研问题"],
      researchSnapshots: [{
        questionId: "调研问题",
        question: "请介绍品牌",
        answerText: "这是一条合法的调研回答。",
        references: [{
          title: "超长引用摘要",
          url: "https://example.com/reference",
          snippet: "摘".repeat(10001),
        }],
        collectedAt: "2026-07-27T00:00:00.000Z",
        collectionMethod: "automatic",
      }],
      platform: "微信公众号",
      scenario: "介绍",
      templateId: "新闻稿",
      title: "新保存文章",
      content: "文章正文",
      status: "saved",
      source: {
        client_material: true,
        doubao_answer: true,
        references: true,
        template: true,
      },
      createdAt: "2026-07-27T00:00:00.000Z",
      reviewedAt: null,
    }],
    trash: [],
    submissionBatches: [],
    cancellationPlans: [],
    publicationRecords: [],
    attention: {
      revision: 4,
      items: [],
      counts: { total: 0, actionable: 0 },
    },
    submissionPlatforms: [],
    workflowByArticle: {},
    publicationSummaries: {},
  });

  const response = registry.success(contract, projected);
  const reference = response.data.articles[0].researchSnapshots[0].references[0];
  assert.equal(response.ok, true);
  assert.equal(reference.title, "超长引用摘要");
  assert.equal(reference.url, "https://example.com/reference");
  assert.equal(reference.snippet.length, 10000);
});

test("generated articles normalize legacy research provenance at the production IPC seam", async function () {
  const handlers = new Map();
  const ipcMain = createAuthenticatedIpcMain(
    {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    async function () {},
  );
  registerAiContentIpc({
    ipcMain,
    aiContentService: {
      generateArticle() {
        return {
          id: "article-1",
          clientId: "中文客户",
          researchQueryIds: ["research-1"],
          researchSnapshots: [
            {
              questionId: "research-1",
              question: "测试问题",
              answerText: "测试回答",
              references: [],
              collectedAt: undefined,
              collectionMethod: undefined,
            },
          ],
          platform: "微信公众号",
          scenario: "介绍",
          templateId: "新闻稿",
          title: "文章标题",
          content: "文章正文",
          status: "generated",
          source: {
            client_material: true,
            doubao_answer: true,
            references: false,
            template: true,
          },
          createdAt: "2026-07-27T00:00:00.000Z",
          reviewedAt: null,
        };
      },
    },
  });

  const result = await handlers.get("content:generate-article")(null, {
    schemaVersion: 1,
    payload: {
      clientId: "中文客户",
      materialIds: ["material-1"],
      researchQueryIds: ["research-1"],
      platform: "微信公众号",
      templateId: "新闻稿",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.article.id, "article-1");
  assert.equal(result.data.article.clientId, "中文客户");
  assert.equal(
    result.data.article.researchSnapshots[0].collectionMethod,
    "legacy",
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      result.data.article.researchSnapshots[0],
      "collectedAt",
    ),
    false,
  );
});

test("generated articles omit structured research snippets at the production IPC seam", async function () {
  const registry = createContractRegistry(contentCoreContracts);
  const contract = registry.byChannel("content:generate-article");
  const projected = contentCore.projectArticle({
    id: "article-1",
    clientId: "client-1",
    researchQueryIds: ["research-1"],
    researchSnapshots: [{
      questionId: "research-1",
      answerText: "测试回答",
      references: [{
        title: "结构化摘要",
        url: "https://example.com/reference",
        snippet: { highlights: ["不得跨过 IPC 边界"] },
      }],
      collectionMethod: "automatic",
    }],
    platform: "platform-1",
    scenario: "介绍",
    templateId: "template-1",
    title: "文章标题",
    content: "文章正文",
    status: "generated",
    source: {
      client_material: true,
      doubao_answer: true,
      references: true,
      template: true,
    },
    createdAt: "2026-07-27T00:00:00.000Z",
    reviewedAt: null,
  });

  const response = registry.success(contract, { article: projected });
  assert.equal(response.ok, true, JSON.stringify(response));
  assert.deepEqual(response.data.article.researchSnapshots[0].references[0], {
    title: "结构化摘要",
    url: "https://example.com/reference",
  });
});

test("article management binds client identity to real OperationalStore publication records", async function () {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-06-management-publication-"),
  );
  const operationalStore = createOperationalStore({ workspaceRoot });
  const handlers = new Map();
  try {
    operationalStore.reservePublicationTarget({
      articleId: "article-1",
      publicationId: "publication-1",
      attemptId: "attempt-1",
      target: {
        kind: "platform",
        platformId: "toutiao",
        accountProfileId: "account-1",
      },
    });
    registerArticleManagementIpc({
      ipcMain: createAuthenticatedIpcMain(
        {
          handle(channel, handler) {
            handlers.set(channel, handler);
          },
        },
        async function () {},
      ),
      rootDir: workspaceRoot,
      getWorkspaceDataRevision: function () { return 1; },
      operationalStore,
      aiContentService: {
        listGeneratedArticles: function () {
          const article = {
            id: "article-1",
            clientId: "client-1",
            researchQueryIds: ["research-1"],
            researchSnapshots: [{
              questionId: "research-1",
              answerText: "Synthetic answer",
              references: [],
              collectionMethod: "automatic",
            }],
            platform: "platform-1",
            scenario: "guide",
            templateId: "template-1",
            title: "Synthetic title",
            content: "Synthetic body",
            status: "saved",
            source: {
              client_material: true,
              doubao_answer: true,
              references: false,
              template: true,
            },
            createdAt: "2026-07-27T00:00:00.000Z",
            reviewedAt: null,
          };
          return [
            article,
            Object.assign({}, article, {
              id: "article-2",
              title: "Newly generated article",
              status: "generated",
            }),
          ];
        },
        listTrashedArticles: function () { return []; },
        listArticleRemovalTransactions: function () { return []; },
      },
      contentSubmissionService: {
        listBatches: function () { return []; },
        listPlatforms: function () { return []; },
      },
      articleAttentionQuery: {
        list: function () {
          return { revision: 1, items: [], counts: { total: 0, actionable: 0 } };
        },
      },
    });

    const response = await handlers.get(
      "content:get-article-management-snapshot",
    )(null, {
      schemaVersion: 1,
      payload: { clientId: "client-1" },
    });

    assert.equal(response.ok, true, JSON.stringify(response));
    assert.deepEqual(
      response.data.articles.map(function (article) { return article.id; }),
      ["article-1", "article-2"],
    );
    assert.equal(response.data.publicationRecords[0].clientId, "client-1");
  } finally {
    operationalStore.close();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("content removal preview and commit require typed confirmation and redact queue internals", async function () {
  const registry = createContractRegistry(contentCoreContracts);
  const commit = registry.byChannel("content:trash-articles");
  assert.throws(
    () =>
      registry.encodeRequest(commit, {
        selections: [{ clientId: "client-1", articleId: "article-1" }],
        token: "token-1",
        confirmed: false,
      }),
    { code: "IPC_REQUEST_INVALID" },
  );

  const handlers = new Map();
  const ipcMain = createAuthenticatedIpcMain(
    {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    },
    async function () {},
  );
  registerAiContentIpc({
    ipcMain,
    aiContentService: {
      previewArticleRemovalImpact() {
        return {
          token: "token-1",
          articleCount: 1,
          queuedToCancel: [
            {
              clientId: "client-1",
              articleId: "article-1",
              status: "queued",
              filePath: "F:\\private\\article.md",
              claimToken: "secret",
            },
          ],
          failedToClean: [],
          blockedItems: [],
          canCommit: true,
          workspacePath: "F:\\private",
        };
      },
    },
  });
  const response = await handlers.get("content:preview-article-removal-impact")(
    null,
    {
      schemaVersion: 1,
      payload: {
        selections: [{ clientId: "client-1", articleId: "article-1" }],
      },
    },
  );
  assert.deepEqual(response, {
    schemaVersion: 1,
    ok: true,
    data: {
      token: "token-1",
      articleCount: 1,
      queuedToCancel: [
        { clientId: "client-1", articleId: "article-1", status: "queued" },
      ],
      failedToClean: [],
      blockedItems: [],
      canCommit: true,
    },
  });
  assert.doesNotMatch(
    JSON.stringify(response),
    /private|filePath|claimToken|workspacePath|secret/i,
  );
});
