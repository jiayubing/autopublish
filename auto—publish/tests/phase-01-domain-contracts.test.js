const assert = require("node:assert/strict");
const test = require("node:test");

const domain = require("../src/domain");

test("phase 1 identities normalize once, reject unsafe values, and retain nominal kinds", () => {
  const client = domain.ClientId.parse(" client-01 ");
  const article = domain.ArticleId.parse("article-01");
  assert.equal(domain.ClientId.serialize(client), "client-01");
  assert.throws(() => domain.ApplicationAccountId.serialize(client), {
    code: "DOMAIN_ID_KIND",
  });
  assert.throws(() => domain.ArticleId.parse("../article"), {
    code: "DOMAIN_ID_INVALID",
  });
  assert.throws(() => domain.ArticleId.serialize(client), {
    code: "DOMAIN_ID_KIND",
  });
  assert.throws(() => domain.RemoteId.parse("x".repeat(513)), {
    code: "DOMAIN_ID_INVALID",
  });
  assert.equal(domain.ArticleId.validate("article-01").ok, true);
  assert.equal(domain.ArticleId.validate("").ok, false);
  assert.equal(domain.ClientId.parse("ＡＢＣ").value, "ABC");
  assert.equal(article.kind, "ArticleId");
});

test("phase 1 targets are account-aware, stable, and fail closed for legacy records", () => {
  const target = domain.parsePublicationTarget({
    kind: "platform",
    platformId: "toutiao",
    accountProfileId: "account-1",
  });
  assert.equal(
    domain.publicationTargetKey(target),
    "platform:toutiao:account:account-1",
  );
  assert.deepEqual(
    domain.parsePublicationTarget({
      kind: "media",
      mediaResourceId: "resource-1",
    }),
    {
      kind: "media",
      mediaResourceId: "resource-1",
    },
  );
  const legacy = domain.parsePublicationTarget({
    kind: "legacy-unknown-account",
    platformId: "toutiao",
  });
  assert.equal(legacy.autoExecutable, false);
  assert.equal(
    domain.publicationTargetKey(legacy),
    "platform:toutiao:legacy-unknown-account",
  );
  assert.throws(
    () =>
      domain.parsePublicationTarget({
        kind: "platform",
        platformId: "toutiao",
      }),
    { code: "PUBLICATION_TARGET_INVALID" },
  );
  assert.throws(
    () =>
      domain.parsePublicationTarget({
        kind: "media",
        platformId: "media",
        mediaResourceId: "r",
      }),
    { code: "PUBLICATION_TARGET_EXTRA_FIELD" },
  );
});

test("publisher outcomes require bound evidence and never accept sensitive fields", async () => {
  const input = domain.parsePublishInput({
    version: 1,
    articleId: "article-1",
    attemptId: "attempt-1",
    target: {
      kind: "platform",
      platformId: "toutiao",
      accountProfileId: "account-1",
    },
    title: "Safe title",
    body: "Body supplied only to the publisher",
  });
  const published = domain.parsePublishOutcome(
    {
      status: "published",
      evidence: {
        articleId: "article-1",
        attemptId: "attempt-1",
        targetKey: "platform:toutiao:account:account-1",
        accountProfileId: "account-1",
        remoteId: "remote-1",
        remoteUrl: "https://example.invalid/articles/1",
      },
    },
    input,
  );
  assert.equal(published.status, "published");
  assert.throws(
    () =>
      domain.parsePublishOutcome(
        { status: "published", evidence: { articleId: "article-1" } },
        input,
      ),
    { code: "PUBLISH_OUTCOME_INVALID" },
  );
  assert.throws(
    () =>
      domain.parsePublishOutcome(
        {
          status: "failed",
          error: {
            code: "X",
            category: "remote",
            retryability: "safe",
            userMessage: "failed",
            stack: "secret",
          },
        },
        input,
      ),
    { code: "DTO_UNKNOWN_FIELD" },
  );
  const fake = domain.createFakePublisher({
    outcome: {
      status: "submitted",
      evidence: {
        articleId: "article-1",
        attemptId: "attempt-1",
        targetKey: "platform:toutiao:account:account-1",
        accountProfileId: "account-1",
        remoteId: "receipt-1",
      },
    },
  });
  assert.equal(
    (await fake.publish(input, new AbortController().signal)).status,
    "submitted",
  );
});

test("safe errors and IPC/worker DTOs are versioned closed records", () => {
  assert.deepEqual(
    domain.parseSafeOperationalError({
      code: "PUBLISH_CONFLICT",
      category: "conflict",
      retryability: "manual-check",
      userMessage: "Please reconcile",
      diagnosticId: "diag-1",
    }),
    {
      code: "PUBLISH_CONFLICT",
      category: "conflict",
      retryability: "manual-check",
      userMessage: "Please reconcile",
      diagnosticId: "diag-1",
    },
  );
  assert.throws(
    () =>
      domain.parseSafeOperationalError({
        code: "X",
        category: "remote",
        retryability: "safe",
        userMessage: "x",
        cookie: "secret",
      }),
    { code: "DTO_UNKNOWN_FIELD" },
  );
  assert.throws(
    () => domain.parseWorkerPublishDto({ version: 2, command: {} }),
    { code: "DTO_VERSION_INVALID" },
  );
  assert.throws(
    () =>
      domain.parseIpcPublishDto({
        version: 1,
        command: {},
        path: "C:\\secret",
      }),
    { code: "DTO_UNKNOWN_FIELD" },
  );
});
