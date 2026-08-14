"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createPublicationWorkflowComposition,
} = require("../desktop/composition/publication-workflow-composition");

test("Phase 3 composition owns one OperationalStore writer and releases it on dispose", async () => {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-03-composition-"),
  );
  const publisher = {
    inspectAccount: async () => ({}),
    publish: async () => ({
      status: "failed",
      error: {
        code: "FIXTURE",
        category: "remote",
        retryability: "safe",
        userMessage: "fixture",
      },
    }),
  };
  const composition = createPublicationWorkflowComposition({
    workspaceRoot,
    publisher,
  });
  assert.deepEqual(Object.keys(composition.publicationWorkflow), ["recover"]);
  assert.equal(composition.operationalStore.verify().schemaVersion, 7);
  await composition.dispose();
  const next = createPublicationWorkflowComposition({
    workspaceRoot,
    publisher,
  });
  await next.dispose();
});

test("restarted composition rebuilds uncertain attention from OperationalStore with stable account identity", async () => {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-03-attention-restart-"),
  );
  const publisher = {
    inspectAccount: async () => ({}),
    publish: async () => {
      throw new Error("unused");
    },
  };
  const first = createPublicationWorkflowComposition({
    workspaceRoot,
    publisher,
  });
  try {
    const profile = first.operationalStore.createAccountProfile({
      platformId: "toutiao",
      displayName: "fixture",
    });
    first.operationalStore.reservePublicationTarget({
      articleId: "article-1",
      publicationId: "publication-1",
      attemptId: "attempt-1",
      target: {
        kind: "platform",
        platformId: "toutiao",
        accountProfileId: profile.accountProfileId,
      },
    });
    first.operationalStore.markRecoveryUncertain({
      attemptId: "attempt-1",
      error: {
        code: "FIXTURE",
        category: "transport",
        retryability: "manual-check",
        userMessage: "fixture",
      },
    });
  } finally {
    await first.dispose();
  }
  const second = createPublicationWorkflowComposition({
    workspaceRoot,
    publisher,
  });
  try {
    const ports = second.createAttentionPorts({});
    const item = ports.attentionQuery.list().items[0];
    assert.equal(item.attemptId, "attempt-1");
    assert.equal(
      item.accountProfileId,
      second.operationalStore.listPublicationAttention()[0].accountProfileId,
    );
    assert.deepEqual(item.allowedActions, ["open-publication"]);
    const before = second.operationalStore.listPublicationRecords({
      articleIds: ["article-1"],
    });
    await assert.rejects(
      () =>
        ports.attentionResolver.resolve({
          attentionId: item.attentionId,
          action: "retry-archive",
          expectedRevision: ports.attentionQuery.getRevision(),
          confirmed: true,
        }),
      { code: "ARTICLE_ATTENTION_ACTION_NOT_ALLOWED" },
    );
    await assert.rejects(
      () =>
        ports.attentionResolver.resolve({
          attentionId: item.attentionId,
          action: "reconcile-failed",
          expectedRevision: ports.attentionQuery.getRevision(),
          confirmed: true,
        }),
      { code: "ARTICLE_ATTENTION_ACTION_NOT_ALLOWED" },
    );
    assert.deepEqual(
      second.operationalStore.listPublicationRecords({
        articleIds: ["article-1"],
      }),
      before,
    );
  } finally {
    await second.dispose();
  }
  const third = createPublicationWorkflowComposition({
    workspaceRoot,
    publisher,
  });
  try {
    assert.equal(typeof third.publicationWorkflow.reconcile, "undefined");
    assert.equal(
      third.createAttentionPorts({}).attentionQuery.list().items.length,
      1,
    );
  } finally {
    await third.dispose();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  }
});

test("production composition closes legacy publish before any remote side effect", async () => {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "phase-03-attention-retry-"),
  );
  let profile;
  let publishes = 0;
  const publisher = {
    inspectAccount: async () => ({
      verified: true,
      accountProfileId: profile.accountProfileId,
    }),
    publish: async (input) => {
      publishes += 1;
      return {
        status: "published",
        evidence: {
          articleId: input.articleId,
          attemptId: input.attemptId,
          targetKey: `platform:toutiao:account:${profile.accountProfileId}`,
          accountProfileId: profile.accountProfileId,
          remoteId: "remote-1",
          remoteUrl: "https://example.test/remote-1",
        },
      };
    },
  };
  const first = createPublicationWorkflowComposition({
    workspaceRoot,
    publisher,
  });
  try {
    profile = first.operationalStore.createAccountProfile({
      platformId: "toutiao",
      displayName: "fixture",
    });
    assert.equal(typeof first.publicationWorkflow.publish, "undefined");
    assert.equal(typeof first.publicationWorkflow.retry, "undefined");
    assert.equal(typeof first.publicationWorkflow.reconcile, "undefined");
    assert.equal(publishes, 0);
    assert.deepEqual(
      first.operationalStore.listPublicationRecords({
        articleIds: ["article-1"],
      }),
      [],
    );
    assert.equal(
      first.operationalStore.claimPostProcessing({
        claimToken: "fixture-claim",
      }),
      null,
    );
  } finally {
    await first.dispose();
  }
  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});

test("workspace runtime cannot wire the retired submission orchestrator", () => {
  const runtime = fs.readFileSync(
    path.resolve(
      __dirname,
      "../desktop/composition/workspace-runtime-composition.js",
    ),
    "utf8",
  );
  assert.doesNotMatch(runtime, /publication-submission-orchestrator/);
  assert.doesNotMatch(runtime, /publicationSubmissionService/);
  assert.doesNotMatch(runtime, /retryFailedPublicationExecutor/);
  assert.doesNotMatch(runtime, /retryFailedPublication\s*:/);
});
