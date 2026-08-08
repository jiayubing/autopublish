const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { productionIpcRegistry } = require("../desktop/ipc/contracts/production-registry");
const { generationContracts } = require("../desktop/ipc/contracts/generation-contracts");
const { createAuthenticatedIpcMain } = require("../desktop/ipc/register");
const {
  registerContentGenerationBatchIpc,
} = require("../desktop/ipc/content-generation-batch-ipc");
const {
  registerGenerationSubmissionHandoffIpc,
} = require("../desktop/ipc/generation-submission-handoff-ipc");

const CHANNELS = [
  "content:preview-generation-batch",
  "content:create-and-start-generation-batch",
  "content:stop-generation-batch",
  "content:pause-generation-batch",
  "content:continue-generation-batch",
  "content:resume-generation-batch",
  "content:retry-failed-generation-batch",
  "content:preview-cancel-pending-generation-batch",
  "content:cancel-pending-generation-batch",
  "content:get-generation-runtime-snapshot",
  "content:preview-generation-submission-handoff",
  "content:commit-generation-submission-handoff",
];

test("generation inventory has twelve invokes with real feature consumers and one event", () => {
  assert.equal(generationContracts.length, 12);
  assert.equal(generationContracts.every((contract) => contract.kind !== "event"), true);
  for (const channel of CHANNELS) {
    const contract = productionIpcRegistry.byChannel(channel);
    assert.ok(contract, channel);
    assert.equal(contract.schemaVersion, 1);
  }
  assert.equal(
    productionIpcRegistry.byCapability("generation.runtimeChanged").kind,
    "event",
  );
});

test("generation main and Renderer callers do not use method-name dispatch", () => {
  const registrar = fs.readFileSync(
    path.resolve(__dirname, "..", "desktop/ipc/content-generation-batch-ipc.js"),
    "utf8",
  );
  const bridge = fs.readFileSync(
    path.resolve(__dirname, "..", "media-workbench/src/bridge/generation.ts"),
    "utf8",
  );
  assert.doesNotMatch(registrar, /service\s*\[\s*method\s*\]/);
  for (const method of [
    "previewGenerationBatch",
    "createAndStartGenerationBatch",
    "pauseGenerationBatch",
    "stopGenerationBatch",
    "continueGenerationBatch",
    "resumeGenerationBatch",
    "retryFailedGenerationBatch",
    "previewCancelPendingGenerationBatch",
    "cancelPendingGenerationBatch",
    "getGenerationRuntimeSnapshot",
    "previewGenerationSubmissionHandoff",
    "commitGenerationSubmissionHandoff",
  ]) {
    assert.doesNotMatch(
      bridge,
      new RegExp(`callContent\\(\\s*["']${method}["']`),
      method,
    );
  }
});

function typedIpc() {
  const handlers = new Map();
  return {
    handlers,
    ipcMain: createAuthenticatedIpcMain(
      { handle: (channel, handler) => handlers.set(channel, handler) },
      async () => undefined,
    ),
    async invoke(channel, legacyArgs) {
      const contract = productionIpcRegistry.byChannel(channel);
      const payload = contract.fromArgs(legacyArgs);
      return handlers.get(channel)(
        null,
        productionIpcRegistry.encodeRequest(contract, payload),
      );
    },
  };
}

const counts = {
  total: 1,
  succeeded: 0,
  failed: 1,
  pending: 0,
  interrupted: 0,
  cancelled: 0,
};
const batchFixture = {
  version: 1,
  id: "batch-1",
  concurrency: 2,
  status: "failed",
  createdAt: "2026-07-26T00:00:00.000Z",
  updatedAt: "2026-07-26T00:01:00.000Z",
  aiConfigFingerprint: "fixture-fingerprint",
  clientSources: [{
    clientId: "client-1",
    materialIds: ["material-1"],
    researchQueryIds: ["research-1"],
  }],
  templates: [{ platform: "media", templateId: "template-1" }],
  tasks: [{
    id: "task-1",
    clientId: "client-1",
    platform: "media",
    templateId: "template-1",
    materialIds: ["material-1"],
    researchQueryIds: ["research-1"],
    status: "failed",
    attempts: 1,
    error: {
      code: "AI_SERVER_ERROR",
      message: "C:\\private\\provider-response.json contained a secret",
      stack: "provider stack must not cross IPC",
    },
    articleId: null,
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:01:00.000Z",
  }],
  counts,
  excludedClients: [],
  workspacePath: "C:\\private\\workspace",
};

test("generation production wire validates exact input and projects task failures", async () => {
  const ipc = typedIpc();
  let createCalls = 0;
  registerContentGenerationBatchIpc({
    ipcMain: ipc.ipcMain,
    contentGenerationBatchService: {
      createAndStartBatch(input) {
        createCalls += 1;
        assert.equal(input.clientIds[0], "client-1");
        return batchFixture;
      },
    },
  });

  const input = {
    clientIds: ["client-1"],
    templates: [{ platform: "media", templateId: "template-1" }],
    clientSources: [{
      clientId: "client-1",
      materialIds: ["material-1"],
      researchQueryIds: ["research-1"],
    }],
  };
  const response = await ipc.invoke("content:create-and-start-generation-batch", [input]);
  assert.equal(response.schemaVersion, 1);
  assert.equal(response.ok, true, JSON.stringify(response));
  assert.equal(response.data.batch.id, "batch-1");
  assert.deepEqual(response.data.batch.tasks[0].error, {
    code: "AI_SERVER_ERROR",
    message: "生成任务失败，请检查诊断信息。",
  });
  assert.equal(createCalls, 1);
  assert.doesNotMatch(
    JSON.stringify(response),
    /private|workspacePath|provider-response|provider stack|secret/i,
  );

  const contract = productionIpcRegistry.byChannel(
    "content:create-and-start-generation-batch",
  );
  const rejected = await ipc.handlers.get(contract.channel)(null, {
    schemaVersion: 1,
    payload: { ...input, filePath: "C:\\private\\batch.json" },
  });
  assert.equal(rejected.schemaVersion, 1);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "IPC_REQUEST_INVALID");
  assert.equal(createCalls, 1);
  assert.doesNotMatch(JSON.stringify(rejected), /private|batch\.json/i);
});

test("generation preview projects production template metadata before result validation", async () => {
  const ipc = typedIpc();
  registerContentGenerationBatchIpc({
    ipcMain: ipc.ipcMain,
    contentGenerationBatchService: {
      preview() {
        return {
          clientCount: 1,
          executableClientCount: 1,
          taskCount: 1,
          executableTaskCount: 1,
          excludedTaskCount: 0,
          excludedClients: [],
          templates: [{
            platform: "media",
            templateId: "template-1",
            source: "builtin",
            readOnly: true,
          }],
          clientSources: [{
            clientId: "client-1",
            materialIds: ["material-1"],
            researchQueryIds: ["research-1"],
          }],
          tasks: [{
            clientId: "client-1",
            platform: "media",
            templateId: "template-1",
            materialIds: ["material-1"],
            researchQueryIds: ["research-1"],
          }],
        };
      },
    },
  });

  const response = await ipc.invoke("content:preview-generation-batch", [{
    clientIds: ["client-1"],
    templates: [{ platform: "media", templateId: "template-1" }],
    clientSources: [{
      clientId: "client-1",
      materialIds: ["material-1"],
      researchQueryIds: ["research-1"],
    }],
  }]);

  assert.equal(response.ok, true, JSON.stringify(response));
  assert.deepEqual(response.data.templates, [{
    platform: "media",
    templateId: "template-1",
  }]);
});

test("generation preview accepts path-free Unicode business identities", async () => {
  const ipc = typedIpc();
  let received;
  registerContentGenerationBatchIpc({
    ipcMain: ipc.ipcMain,
    contentGenerationBatchService: {
      preview(input) {
        received = input;
        return {
          clientCount: 1,
          executableClientCount: 1,
          taskCount: 1,
          executableTaskCount: 1,
          excludedTaskCount: 0,
          excludedClients: [],
          templates: input.templates,
          clientSources: input.clientSources,
          tasks: [{
            clientId: input.clientIds[0],
            platform: input.templates[0].platform,
            templateId: input.templates[0].templateId,
            materialIds: input.clientSources[0].materialIds,
            researchQueryIds: input.clientSources[0].researchQueryIds,
          }],
        };
      },
    },
  });
  const input = {
    clientIds: ["畅途"],
    templates: [{ platform: "微信公众号", templateId: "品牌介绍" }],
    clientSources: [{
      clientId: "畅途",
      materialIds: ["品牌资料.docx"],
      researchQueryIds: ["厦门汽车音响改装推荐"],
    }],
  };

  const response = await ipc.invoke("content:preview-generation-batch", [input]);

  assert.equal(response.ok, true, JSON.stringify(response));
  assert.deepEqual(received, input);
  assert.equal(response.data.tasks[0].clientId, "畅途");
});

test("generation service exceptions become SafeOperationalError without raw details", async () => {
  const ipc = typedIpc();
  registerContentGenerationBatchIpc({
    ipcMain: ipc.ipcMain,
    contentGenerationBatchService: {
      createAndStartBatch() {
        throw new Error("C:\\private\\generation.db raw service failure");
      },
    },
  });
  const response = await ipc.invoke("content:create-and-start-generation-batch", [{
    clientIds: ["client-1"],
    templates: [{ platform: "media", templateId: "template-1" }],
  }]);
  assert.equal(response.schemaVersion, 1);
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "GENERATION_INPUT_INVALID");
  assert.equal(typeof response.error.userMessage, "string");
  assert.equal(response.error.category, "validation");
  assert.doesNotMatch(JSON.stringify(response), /private|generation\.db|raw service/i);
});

test("handoff wire carries one target binding and omits private preview input", async () => {
  const ipc = typedIpc();
  let received;
  registerGenerationSubmissionHandoffIpc({
    ipcMain: ipc.ipcMain,
    generationSubmissionHandoffService: {
      preview(input) {
        received = input;
        return {
          generationBatchId: input.generationBatchId,
          batchRevision: 3,
          previewToken: "handoff:00000000-0000-4000-8000-000000000001",
          articleCount: 1,
          clientCount: 1,
          platformId: input.platformId,
          accountProfileId: input.accountProfileId,
          estimatedTaskCount: 1,
          queueableTaskCount: 1,
          idempotentCount: 0,
          blockedPublishedCount: 0,
          blockedUncertainCount: 0,
          blockedContentCount: 0,
          conflictCount: 0,
          unavailableArticleCount: 0,
          invalidArticles: [],
          clientGroups: [{
            clientId: "client-1",
            articleCount: 1,
            queueableTaskCount: 1,
            idempotentCount: 0,
            blockedPublishedCount: 0,
            blockedUncertainCount: 0,
            blockedContentCount: 0,
            conflictCount: 0,
            items: [{
              articleId: "article-1",
              targetPlatformId: "media",
              status: "queueable",
              reasonCode: null,
              filePath: "C:\\private\\article.md",
            }],
          }],
          entries: [{ apiKey: "must-not-cross-ipc" }],
        };
      },
    },
  });

  const response = await ipc.invoke(
    "content:preview-generation-submission-handoff",
    [{
      generationBatchId: "batch-1",
      platformId: "media",
      accountProfileId: "account-1",
    }],
  );
  assert.equal(received.platformId, "media");
  assert.equal(received.accountProfileId, "account-1");
  assert.equal(response.schemaVersion, 1);
  assert.equal(response.ok, true, JSON.stringify(response));
  assert.equal("accountProfiles" in response.data, false);
  assert.equal("entries" in response.data, false);
  assert.equal("filePath" in response.data.clientGroups[0].items[0], false);
  assert.doesNotMatch(JSON.stringify(response), /private|apiKey|must-not-cross/i);
});
