import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { createArticleManagementFeature } from "../media-workbench/src/features/content/article-management-feature.js";

const require = createRequire(import.meta.url);
const {
  createPublicationWorkflow,
} = require("../src/application/publication-workflow");
const {
  createOperationalStore,
} = require("../src/infrastructure/operational-store/operational-store");
const {
  arrayField,
  createContractRegistry,
  defineContract,
  exactObject,
  stringField,
} = require("../desktop/ipc/contracts/registry");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function source(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

async function publishWithoutWorkflow({
  operationalStore,
  publisher,
  command,
}) {
  operationalStore.assertExecutableAccountProfile({
    accountProfileId: command.target.accountProfileId,
    platformId: command.target.platformId,
  });
  const inspection = await publisher.inspectAccount();
  if (
    inspection.verified !== true ||
    inspection.accountProfileId !== command.target.accountProfileId
  )
    throw new Error("Fixture account inspection failed");
  const reservation = operationalStore.reservePublicationTarget(command);
  const outcome = await publisher.publish(command);
  operationalStore.commitRemoteOutcome({
    attemptId: reservation.attemptId,
    outcome,
  });
  return outcome;
}

async function loadManagementWithoutSnapshot({ clientId, readers }) {
  const articles = await readers.listArticles(clientId);
  const articleIds = articles.map((article) => article.id);
  const [trash, batches, publicationRecords, attention] = await Promise.all([
    readers.listTrash(clientId),
    readers.listBatches(clientId),
    readers.listPublicationRecords({ articleIds }),
    readers.listAttention({ clientId }),
  ]);
  return {
    articles,
    trash,
    batches,
    attention,
    publicationRecords: publicationRecords.map((record) => ({
      publicationId: record.publicationId,
      admissionQueryLabel: `publication:${record.status}`,
    })),
  };
}

async function invokeContentCommandWithoutApplication({
  contract,
  registry,
  validate,
  execute,
  wire,
}) {
  const input = registry.parseRequest(contract, wire);
  validate(input);
  return registry.success(contract, await execute(input));
}

function createPublisherRegistry(adapters) {
  const entries = new Map(Object.entries(adapters));
  return Object.freeze({
    resolve(platformId) {
      const adapter = entries.get(platformId);
      if (!adapter)
        throw new Error(`Missing fixture Publisher adapter: ${platformId}`);
      return adapter;
    },
  });
}

function createFixtureRegistry(contract) {
  return createContractRegistry([contract]);
}

const fixtureId = stringField({
  min: 1,
  max: 200,
  pattern: /^[A-Za-z0-9._:-]+$/,
});

test("admission: a fake platform is isolated to a Publisher adapter and registry fixture", async () => {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "admission-publisher-"),
  );
  let store;
  try {
    store = createOperationalStore({ workspaceRoot });
    const profile = store.createAccountProfile({
      platformId: "admission-fake-platform",
      displayName: "Admission fixture account",
    });
    const calls = [];
    const registry = createPublisherRegistry({
      "admission-fake-platform": Object.freeze({
        inspectAccount: async () => ({
          verified: true,
          accountProfileId: profile.accountProfileId,
        }),
        publish: async (input) => {
          calls.push(input.target.platformId);
          return {
            status: "published",
            evidence: {
              articleId: input.articleId,
              attemptId: input.attemptId,
              targetKey: `platform:admission-fake-platform:account:${profile.accountProfileId}`,
              accountProfileId: profile.accountProfileId,
              remoteId: "admission-remote-1",
              remoteUrl: "https://fixture.invalid/admission-remote-1",
            },
          };
        },
      }),
    });
    const publisher = Object.freeze({
      inspectAccount: () =>
        registry.resolve("admission-fake-platform").inspectAccount(),
      publish: (input) =>
        registry.resolve(input.target.platformId).publish(input),
    });
    const workflow = createPublicationWorkflow({
      clock: () => new Date("2026-08-05T00:00:00.000Z"),
      operationalStore: store,
      publisher,
    });

    const result = await workflow.publish({
      articleId: "article-admission-1",
      publicationId: "publication-admission-1",
      attemptId: "attempt-admission-1",
      target: {
        kind: "platform",
        platformId: "admission-fake-platform",
        accountProfileId: profile.accountProfileId,
      },
      title: "Admission fixture",
      body: "Fixture only",
    });

    assert.equal(result.status, "published");
    assert.deepEqual(calls, ["admission-fake-platform"]);
    assert.equal(
      store.listPublicationRecords({ articleIds: ["article-admission-1"] })
        .length,
      1,
    );
    for (const relative of [
      "src/application/publication-workflow.js",
      "src/infrastructure/operational-store/operational-store.js",
      "media-workbench/src/features/content/article-management-feature.js",
    ])
      assert.doesNotMatch(source(relative), /admission-fake-platform/);

    const directCalls = [];
    const directResult = await publishWithoutWorkflow({
      command: {
        articleId: "article-direct-1",
        publicationId: "publication-direct-1",
        attemptId: "attempt-direct-1",
        target: {
          kind: "platform",
          platformId: "admission-fake-platform",
          accountProfileId: profile.accountProfileId,
        },
      },
      operationalStore: {
        assertExecutableAccountProfile: () =>
          directCalls.push("assert-account"),
        reservePublicationTarget: (value) => {
          directCalls.push("reserve-intent");
          return { attemptId: value.attemptId };
        },
        commitRemoteOutcome: () => directCalls.push("commit-outcome"),
      },
      publisher: {
        inspectAccount: async () => {
          directCalls.push("inspect-account");
          return { verified: true, accountProfileId: profile.accountProfileId };
        },
        publish: async () => {
          directCalls.push("publish-remote");
          return { status: "published" };
        },
      },
    });
    assert.equal(directResult.status, "published");
    assert.deepEqual(directCalls, [
      "assert-account",
      "inspect-account",
      "reserve-intent",
      "publish-remote",
      "commit-outcome",
    ]);
  } finally {
    if (store) store.close();
    fs.rmSync(workspaceRoot, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
});

test("admission: a publication query field crosses one authoritative query, DTO, and feature snapshot", async () => {
  const contract = defineContract({
    capability: "fixture.publication-admission-query",
    channel: "fixture:publication-admission-query",
    feature: "content",
    kind: "query",
    request: exactObject({ clientId: fixtureId }),
    success: exactObject({
      clientId: fixtureId,
      publicationRecords: arrayField(
        exactObject({
          publicationId: fixtureId,
          admissionQueryLabel: stringField({ min: 1, max: 120 }),
        }),
        { max: 100 },
      ),
    }),
  });
  const registry = createFixtureRegistry(contract);
  let reads = 0;
  const authoritativeQuery = ({ clientId }) => {
    reads += 1;
    return [
      {
        publicationId: "publication-admission-2",
        clientId,
        status: "published",
      },
    ];
  };
  const projectDto = ({ clientId }) => ({
    clientId,
    publicationRecords: authoritativeQuery({ clientId }).map((record) => ({
      publicationId: record.publicationId,
      admissionQueryLabel: `publication:${record.status}`,
    })),
  });
  const feature = createArticleManagementFeature({
    loadManagement: async (clientId) => {
      const request = registry.encodeRequest(contract, { clientId });
      const response = registry.success(
        contract,
        projectDto(registry.parseRequest(contract, request)),
      );
      return registry.parseSuccess(contract, response);
    },
  });
  try {
    feature.setScope({
      workspaceRuntimeId: "admission-workspace",
      clientId: "client-admission",
    });
    assert.equal(
      await feature.refreshManagement("admission-query-field"),
      true,
    );
    assert.equal(reads, 1);
    assert.deepEqual(feature.getSnapshot().management.publicationRecords, [
      {
        publicationId: "publication-admission-2",
        admissionQueryLabel: "publication:published",
      },
    ]);

    const directReads = [];
    const directSnapshot = await loadManagementWithoutSnapshot({
      clientId: "client-admission",
      readers: {
        listArticles: async () => {
          directReads.push("articles");
          return [{ id: "article-admission-2" }];
        },
        listTrash: async () => {
          directReads.push("trash");
          return [];
        },
        listBatches: async () => {
          directReads.push("batches");
          return [];
        },
        listPublicationRecords: async () => {
          directReads.push("publications");
          return [
            { publicationId: "publication-admission-2", status: "published" },
          ];
        },
        listAttention: async () => {
          directReads.push("attention");
          return { items: [] };
        },
      },
    });
    assert.deepEqual(directReads.sort(), [
      "articles",
      "attention",
      "batches",
      "publications",
      "trash",
    ]);
    assert.deepEqual(directSnapshot.publicationRecords, [
      {
        publicationId: "publication-admission-2",
        admissionQueryLabel: "publication:published",
      },
    ]);
  } finally {
    feature.dispose();
  }
});

test("admission: a content command needs only a Content application, typed IPC, and one feature fixture", async () => {
  const contract = defineContract({
    capability: "fixture.content-admission-command",
    channel: "fixture:content-admission-command",
    feature: "content",
    kind: "command",
    request: exactObject({
      clientId: fixtureId,
      note: stringField({ min: 1, max: 500 }),
    }),
    success: exactObject({
      clientId: fixtureId,
      acceptedNote: stringField({ min: 1, max: 500 }),
    }),
  });
  const registry = createFixtureRegistry(contract);
  const contentApplication = Object.freeze({
    recordAdmissionNote(input) {
      return { clientId: input.clientId, acceptedNote: input.note };
    },
  });
  const handler = async (wire) => {
    const input = registry.parseRequest(contract, wire);
    return registry.success(
      contract,
      contentApplication.recordAdmissionNote(input),
    );
  };
  const feature = (() => {
    let command = Object.freeze({ busy: false, error: null, result: null });
    return Object.freeze({
      getSnapshot: () => command,
      async recordAdmissionNote(input) {
        command = Object.freeze({ busy: true, error: null, result: null });
        try {
          const wire = await handler(registry.encodeRequest(contract, input));
          const result = registry.parseSuccess(contract, wire);
          command = Object.freeze({ busy: false, error: null, result });
          return result;
        } catch (error) {
          command = Object.freeze({ busy: false, error, result: null });
          throw error;
        }
      },
    });
  })();

  assert.deepEqual(
    await feature.recordAdmissionNote({
      clientId: "client-admission",
      note: "fixture-only",
    }),
    { clientId: "client-admission", acceptedNote: "fixture-only" },
  );
  assert.equal(feature.getSnapshot().busy, false);
  assert.equal(feature.getSnapshot().error, null);

  const directCalls = [];
  const directWire = await invokeContentCommandWithoutApplication({
    contract,
    registry,
    wire: registry.encodeRequest(contract, {
      clientId: "client-admission",
      note: "without-application",
    }),
    validate: (input) => {
      directCalls.push("validate-command");
      assert.ok(input.note.startsWith("without-"));
    },
    execute: async (input) => {
      directCalls.push("execute-command");
      return { clientId: input.clientId, acceptedNote: input.note };
    },
  });
  assert.deepEqual(registry.parseSuccess(contract, directWire), {
    clientId: "client-admission",
    acceptedNote: "without-application",
  });
  assert.deepEqual(directCalls, ["validate-command", "execute-command"]);
});
