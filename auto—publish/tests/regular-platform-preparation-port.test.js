"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const domain = require("../src/domain");
const {
  createRegularPlatformPreparationPort,
} = require("../desktop/services/regular-platform-preparation-port");

function claim(platformId, articleId) {
  const accountProfileId = "account-primary";
  return {
    platformId,
    accountProfileId,
    regularPublicationAttemptId: "attempt-" + articleId,
    articleIdentityV1: {
      version: 1,
      clientId: "client-a",
      articleId,
    },
    targetIdentityV1: {
      version: 1,
      kind: "platform",
      platformId,
      accountProfileId,
    },
    publicationSnapshot: {
      title: "Title " + articleId,
      body: "Body " + articleId,
    },
    imageCount: 0,
  };
}

function adapter(platformId, calls) {
  return {
    id: platformId,
    async preparePlatformSubmission(input) {
      calls.push(input.articleIdentityV1.articleId);
      return {
        preparedSubmissionEvidenceV1:
          domain.createTextOnlyPreparedSubmissionEvidenceV1(input),
        async submitPreparedPublication() {
          return { status: "accepted", remoteId: "remote-result" };
        },
      };
    },
  };
}

function imagePlanService() {
  return {
    async createPlan() {
      return { deliveryMode: "text_only", images: [] };
    },
  };
}

test("Hepan reuses the queue-run account inspection without a per-article final API recheck", async () => {
  const inspections = [];
  const preparations = [];
  const port = createRegularPlatformPreparationPort({
    accountInspector: {
      async inspect(input) {
        inspections.push(input);
        return {
          verified: true,
          accountProfileId: input.accountProfileId,
          remoteFingerprint: "hepan-account-fingerprint",
        };
      },
    },
    regularImagePlanService: imagePlanService(),
    regularSubmissionPorts: [adapter("hepan", preparations)],
  });

  port.beginQueueRun("queue-run-1");
  await port.preparePlatformSubmission(claim("hepan", "article-a"));
  await port.preparePlatformSubmission(claim("hepan", "article-b"));
  port.endQueueRun();

  assert.deepEqual(preparations, ["article-a", "article-b"]);
  assert.equal(inspections.length, 1);
  assert.deepEqual(inspections[0], {
    targetPlatformId: "hepan",
    accountProfileId: "account-primary",
    preserveCurrentPage: false,
  });
});

test("browser-style platforms still perform the final identity recheck", async () => {
  const inspections = [];
  const preparations = [];
  const port = createRegularPlatformPreparationPort({
    accountInspector: {
      async inspect(input) {
        inspections.push(input);
        return {
          verified: true,
          accountProfileId: input.accountProfileId,
          remoteFingerprint:
            inspections.length === 1 ? "browser-account-a" : "browser-account-b",
        };
      },
    },
    regularImagePlanService: imagePlanService(),
    regularSubmissionPorts: [adapter("lieju", preparations)],
  });

  port.beginQueueRun("queue-run-2");
  await assert.rejects(
    port.preparePlatformSubmission(claim("lieju", "article-c")),
    { code: "REGULAR_ACCOUNT_PROFILE_UNVERIFIED" },
  );
  port.endQueueRun();

  assert.deepEqual(preparations, ["article-c"]);
  assert.equal(inspections.length, 2);
  assert.equal(inspections[0].preserveCurrentPage, false);
  assert.equal(inspections[1].preserveCurrentPage, true);
});
