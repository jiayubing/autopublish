import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const domain = require("../src/domain");
const { createContentPathPolicy } = require("../src/content/content-path-policy");
const { createArticleStore } = require("../src/content/article-store");
const { createContentStore } = require("../src/content/content-store");
const { createQuestionStore } = require("../src/content/question-store");
const { createResearchStore } = require("../src/content/research-store");
const { createTemplateStore } = require("../src/content/template-store");
const { createDoubaoCollectionService } = require("../src/content/doubao-collection-service");
const { createGenerationBatchRunner } = require("../src/content/generation-batch-runner");
const { createArticleMutationCoordinator } = require("../src/content/article-mutation-coordinator");
const { createContentGenerationBatchService } = require("../desktop/services/content-generation-batch-service");
const { createArticleManagementSnapshot } = require("../desktop/services/article-management-snapshot");
const { createRegularQueueApplication } = require("../desktop/services/regular-queue-application");
const { createCrossClientRegularQueueApplication } = require("../desktop/services/cross-client-regular-queue-application");
const { createRegularPlatformOutcomeService } = require("../desktop/services/regular-platform-outcome-service");
const { createRegularQueueGroupComposition } = require("../desktop/composition/regular-queue-group-composition");
const { createOperationalStore } = require("../src/infrastructure/operational-store/operational-store");

const CLIENTS = ["client-a", "client-b", "client-c"];
const NOW = "2026-09-07T00:00:00.000Z";
const PUBLISHED_AT = "2026-09-06T23:59:00.000Z";
const turn = () => new Promise((resolve) => setImmediate(resolve));

// One finite cross-owner scenario, not an application harness: only collection,
// AI and platform transports are fake. All facts live in temporary real stores.
test("R5 generated articles cross ordinary submission and partial admission survives store/service reconstruction", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "r5-generation-publication-"));
  let runtime;
  const aiCalls = [];
  const remoteCalls = [];
  const collectionCalls = [];
  let profile;
  t.after(async () => {
    try {
      if (runtime) await runtime.close();
    } finally {
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  const questionStore = createQuestionStore(root);
  const researchStore = createResearchStore(root);
  const collection = createDoubaoCollectionService({
    questionStore,
    researchStore,
    now: () => NOW,
    browserAdapter: {
      async collect(input) {
        collectionCalls.push(input);
        return { answerText: `Collected synthetic facts for ${input.clientId}.`, references: [] };
      },
    },
  });
  const sources = new Map();
  for (const clientId of CLIENTS) {
    const directory = path.join(root, "clients", clientId);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "client.json"), JSON.stringify({ id: clientId, name: clientId }));
    fs.writeFileSync(path.join(directory, "brand.md"), `Synthetic material for ${clientId}.`);
    createContentPathPolicy(root).articlePaths(clientId, "empty-probe", true);
    const question = questionStore.createQuestion(clientId, { text: `Synthetic question for ${clientId}?` });
    const input = { clientId, questionId: question.id };
    const research = clientId === CLIENTS[0]
      ? await collection.collectOne(input)
      : collection.saveManual({ ...input, answerText: `Manual synthetic facts for ${clientId}.`, references: [] });
    sources.set(clientId, research);
  }
  assert.equal(collectionCalls.length, 1);
  const templateDirectory = path.join(root, "templates", "draft");
  fs.mkdirSync(templateDirectory, { recursive: true });
  fs.writeFileSync(path.join(templateDirectory, "guide.md"), "Write an article using only the selected synthetic facts.");

  function open() {
    const ports = {};
    const store = createOperationalStore({ workspaceRoot: root, transitionPorts: ports, clock: () => new Date(NOW) });
    let generation;
    let run;
    let revision = 0;
    const invalidate = () => { revision += 1; };
    try {
      const articleStore = createArticleStore(root);
      const contentStore = createContentStore({ articleStore, listClientIds: () => CLIENTS });
      const coordinator = createArticleMutationCoordinator({
        articleStore,
        contentStore,
        regularQueueTransitions: ports.regularQueueTransitions,
        lifecycleFacts: ports.regularQueueTransitions,
        clock: () => new Date(NOW),
      });
      if (!profile) profile = store.createAccountProfile({ platformId: "hepan", displayName: "Synthetic account" });
      const application = createRegularQueueApplication({
        contentStore,
        articleMutationCoordinator: coordinator,
        regularQueueTransitions: ports.regularQueueTransitions,
        regularQueueGroupTransitions: ports.regularQueueGroupTransitions,
        accountProfileResolver: store.assertExecutableAccountProfile,
        platforms: [{ id: "hepan", displayName: "Synthetic platform", publicationTargetKind: "platform", imagePublishing: false }],
        onDataInvalidated: invalidate,
      });
      const crossClientApplication = createCrossClientRegularQueueApplication({
        regularQueueApplication: application,
      });
      const outcomeService = createRegularPlatformOutcomeService({
        regularOutcomeTransitions: ports.regularOutcomeTransitions,
        clock: () => new Date(NOW),
      });
      const queue = createRegularQueueGroupComposition({
        regularQueueGroupTransitions: ports.regularQueueGroupTransitions,
        regularPlatformOutcomeService: outcomeService,
        onDataInvalidated: invalidate,
        platformSubmissionExecutor: {
          async preparePlatformSubmission(claim) {
            const evidence = domain.createTextOnlyPreparedSubmissionEvidenceV1(claim);
            return {
              preparedSubmissionEvidenceV1: evidence,
              async submitPreparedPublication() {
                remoteCalls.push(evidence);
                return { status: "accepted", remoteId: `remote-${claim.articleIdentityV1.articleId}`, providerEventAt: PUBLISHED_AT };
              },
            };
          },
        },
      }).orchestrator;
      generation = createContentGenerationBatchService({
        workspaceRoot: root,
        contentStore,
        templateStore: createTemplateStore(root, { builtinRoot: null }),
        aiProviderService: { getFingerprint: () => "r5-synthetic" },
        aiClient: {
          async complete(messages) {
            aiCalls.push(messages);
            return "# Synthetic generated title\n\nSynthetic generated body, based on the selected facts.";
          },
        },
        onDataInvalidated: invalidate,
        runnerFactory(options) {
          const runner = createGenerationBatchRunner(options);
          return { ...runner, run(...args) { run = runner.run(...args); return run; } };
        },
      });
      const snapshot = createArticleManagementSnapshot({
        workspaceIdentity: "r5-synthetic-workspace",
        getRevision: () => revision,
        listArticles: (clientId) => contentStore.listArticles(clientId),
        operationalStore: store,
        publishedArchiveQueries: ports.publishedArchiveQueries,
      });
      return {
        store, contentStore, application, crossClientApplication, queue, generation, snapshot,
        async finishGeneration() { await run; await turn(); },
        async close() { try { await generation.dispose(); } finally { store.close(); } },
      };
    } catch (error) {
      store.close();
      throw error;
    }
  }

  runtime = open();
  for (const clientId of CLIENTS) assert.equal((await runtime.snapshot.get(clientId)).articles.length, 0);
  const started = await runtime.generation.createAndStartBatch({
    clientIds: CLIENTS,
    templates: [{ platform: "draft", templateId: "guide" }],
    concurrency: 4,
  });
  await runtime.finishGeneration();
  const completed = runtime.generation.getBatch(started.id);
  assert.equal(completed.status, "completed");
  assert.equal(completed.counts.succeeded, 3);
  assert.equal(aiCalls.length, 3);
  assert.equal(remoteCalls.length, 0);
  assert.equal(runtime.store.listPublicationRecords({}).length, 0);
  assert.equal(runtime.store.listSubmissionQueueItems().length, 0);
  const articleRefs = CLIENTS.map((clientId) => {
    const task = completed.tasks.find((item) => item.clientId === clientId);
    assert.equal(task.status, "succeeded");
    return { clientId, articleId: task.articleId };
  });
  for (const ref of articleRefs) {
    const model = await runtime.snapshot.get(ref.clientId);
    const article = model.articles.find((item) => item.id === ref.articleId);
    assert.ok(article);
    assert.equal(article.generationBatchId, started.id);
    assert.equal(article.platform, "draft");
    assert.equal(article.researchSnapshots[0].answerText, sources.get(ref.clientId).answerText);
    assert.equal(article.researchSnapshots[0].collectionMethod, sources.get(ref.clientId).collectionMethod);
    assert.equal(article.materialSnapshots.length, 1);
    assert.equal(model.workflowByArticle[ref.articleId].stage, "pending_submission");
    assert.equal(model.workflowByArticle[ref.articleId].operations.submit.allowed, true);
    assert.ok(aiCalls.some((messages) => messages.some((message) => message.content.includes(sources.get(ref.clientId).answerText))));
  }

  const target = { platformId: "hepan", accountProfileId: profile.accountProfileId };
  const first = runtime.application.admitRegularQueueItems({
    ...target, articleRefs: [articleRefs[0]], queueConfig: { submissionIntervalSeconds: 0 },
  });
  assert.equal(first.admittedCount, 1);
  const groupId = first.items[0].queueGroupId;
  await runtime.queue.startGroup({ queueGroupId: groupId });
  assert.equal(remoteCalls.length, 1);
  assert.equal(remoteCalls[0].articleIdentityV1.articleId, articleRefs[0].articleId);
  const published = await runtime.snapshot.get(CLIENTS[0]);
  const publishedArchive = published.publishedArchives[0];
  assert.equal(published.workflowByArticle[articleRefs[0].articleId].stage, "published");
  assert.equal(publishedArchive.publicationEvidence.body, published.articles[0].content);
  assert.equal(publishedArchive.publicationEvidence.targetSnapshotV1.platformId, "hepan");
  assert.equal(publishedArchive.publicationEvidence.firstPublishedAt, PUBLISHED_AT);
  assert.equal(publishedArchive.publicationEvidence.firstPublishedAtSource, "provider_event_time");

  // Keep the next admitted article queued by explicit operator intent, not by
  // disabling the production auto-start policy. The final client fails its
  // last precheck, so that failure is definite and safe to retry after reopen.
  runtime.queue.pauseGroup({ queueGroupId: groupId });
  const partialApplication = createCrossClientRegularQueueApplication({
    regularQueueApplication: {
      previewRegularQueueAdmission(input) {
        if (input.articleRefs[0].clientId === CLIENTS[2]) {
          throw Object.assign(new Error("Synthetic intake unavailable"), {
            code: "SYNTHETIC_INTAKE_UNAVAILABLE",
          });
        }
        return runtime.application.previewRegularQueueAdmission(input);
      },
      admitRegularQueueItems(input) {
        return runtime.application.admitRegularQueueItems(input);
      },
    },
  });
  const partial = partialApplication.admitRegularQueueItems({
    ...target,
    articleRefs: articleRefs.slice(1),
  });
  assert.equal(partial.admittedCount, 1);
  assert.deepEqual(partial.items.map((item) => item.status), ["queued", "failed"]);
  assert.equal(partial.items[1].reasonCode, "SYNTHETIC_INTAKE_UNAVAILABLE");
  assert.equal(runtime.queue.kickGroup({ queueGroupId: groupId }).started, false);
  assert.equal(remoteCalls.length, 1);
  const queuedBefore = runtime.store.listSubmissionQueueItems();
  assert.equal(queuedBefore.length, 1);
  assert.equal(queuedBefore[0].articleId, articleRefs[1].articleId);
  assert.equal((await runtime.snapshot.get(CLIENTS[1])).workflowByArticle[articleRefs[1].articleId].stage, "in_submission");
  assert.equal((await runtime.snapshot.get(CLIENTS[2])).workflowByArticle[articleRefs[2].articleId].operations.submit.allowed, true);

  await runtime.close();
  runtime = null;
  runtime = open(); // New stores, services and caches; no old dialog result is reused.
  assert.equal(aiCalls.length, 3);
  assert.equal(remoteCalls.length, 1);
  assert.equal(runtime.generation.getBatch(started.id).status, "completed");
  assert.deepEqual(runtime.store.listSubmissionQueueItems(), queuedBefore);
  const again = runtime.crossClientApplication.previewRegularQueueAdmission({
    ...target,
    articleRefs,
  });
  const againQueueableArticleRefs = again.items
    .filter((item) => item.status === "queueable")
    .map((item) => item.articleRef);
  const againIdempotentArticleRefs = again.items
    .filter((item) => item.status === "idempotent")
    .map((item) => item.articleRef);
  assert.deepEqual(againQueueableArticleRefs, [articleRefs[2]]);
  assert.deepEqual(againIdempotentArticleRefs, [articleRefs[1]]);
  assert.equal(again.conflictCount, 1);
  const resumedInputs = [];
  const resumedApplication = createCrossClientRegularQueueApplication({
    regularQueueApplication: {
      previewRegularQueueAdmission(input) {
        return runtime.application.previewRegularQueueAdmission(input);
      },
      admitRegularQueueItems(input) {
        resumedInputs.push(input.articleRefs);
        return runtime.application.admitRegularQueueItems(input);
      },
    },
  });
  const resumed = resumedApplication.admitRegularQueueItems({
    ...target,
    articleRefs: againQueueableArticleRefs,
  });
  assert.equal(resumed.admittedCount, 1);
  assert.deepEqual(resumedInputs, [[articleRefs[2]]]);
  const queuedAfter = runtime.store.listSubmissionQueueItems();
  assert.equal(queuedAfter.length, 2);
  assert.deepEqual(queuedAfter.find((item) => item.articleId === articleRefs[1].articleId), queuedBefore[0]);
  await runtime.queue.startGroup({ queueGroupId: groupId });
  assert.deepEqual(remoteCalls.map((item) => item.articleIdentityV1.articleId), articleRefs.map((ref) => ref.articleId));
  assert.equal(aiCalls.length, 3);
  for (const ref of articleRefs) {
    const model = await runtime.snapshot.get(ref.clientId);
    assert.equal(model.articles.length, 1);
    assert.equal(model.workflowByArticle[ref.articleId].stage, "published");
    for (const action of ["edit", "submit", "trash"]) assert.equal(model.workflowByArticle[ref.articleId].operations[action].allowed, false);
    assert.equal(model.publishedArchives.length, 1);
    assert.equal(runtime.application.previewRegularQueueAdmission({ ...target, articleRefs: [ref] }).queueableCount, 0);
  }
  assert.deepEqual((await runtime.snapshot.get(CLIENTS[0])).publishedArchives[0], publishedArchive);
  assert.equal(runtime.store.listSubmissionQueueItems().length, 0);
});
