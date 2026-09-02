"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createHepanGeoApiClient,
  HEPAN_GEO_API_URL,
} = require("../src/platforms/hepan/api-client");
const { toHepanBbcode } = require("../src/platforms/hepan/bbcode");
const { createHepanAdapter } = require("../src/platforms/hepan/adapter");

function jsonResponse(payload) {
  return {
    ok: true,
    async json() {
      return payload;
    },
  };
}

function settingsService() {
  return {
    getAdapterForRuntime: () => ({
      config: { uid: 12345, password: "fixture-password" },
    }),
  };
}

function claim(articleId = "article-hepan-api", title = "汕头企业数字化服务案例分享") {
  return {
    regularPublicationAttemptId: `attempt-${articleId}`,
    articleIdentityV1: { version: 1, clientId: "client-1", articleId },
    targetIdentityV1: {
      version: 1,
      kind: "platform",
      platformId: "hepan",
      accountProfileId: "account-1",
    },
    publicationSnapshot: {
      title,
      body:
        "## 文章小标题\n\n这里是 **第一段** 正文。\n\n- 要点一\n- 要点二",
    },
  };
}

test("Hepan GEO API client uses POST JSON for status, publish and result", async () => {
  const requests = [];
  const client = createHepanGeoApiClient({
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      requests.push({ url, options, body });
      if (body.action === "status")
        return jsonResponse({
          success: true,
          code: 0,
          data: { uid: 12345, remaining_count: 23 },
        });
      return jsonResponse({
        success: true,
        code: 0,
        data: {
          aid: 98765,
          review_status: "published",
          url: "https://www.hepan.com/portal.php?mod=view&aid=98765",
        },
      });
    },
  });
  const config = { uid: 12345, password: "fixture-password" };
  await client.status(config);
  await client.publish(config, {
    subject: "标题",
    message: "正文",
    idempotencyKey: "same-key",
  });
  await client.result(config, 98765);
  assert.equal(requests.length, 3);
  assert.equal(requests.every((entry) => entry.url === HEPAN_GEO_API_URL), true);
  assert.equal(requests.every((entry) => entry.options.method === "POST"), true);
  assert.deepEqual(
    requests.map((entry) => entry.body.action),
    ["status", "publish", "result"],
  );
  assert.equal(requests[1].body.idempotency_key, "same-key");
  assert.equal(requests[2].body.aid, 98765);
  assert.equal(JSON.stringify(requests).includes("password="), false);
});

test("Hepan GEO API timeout covers response body parsing", async () => {
  const client = createHepanGeoApiClient({
    timeoutMs: 1000,
    fetch: async () => ({
      ok: true,
      json: async () => new Promise(() => {}),
    }),
  });
  await assert.rejects(
    client.status({ uid: 12345, password: "fixture-password" }),
    (error) => error.code === "HEPAN_GEO_API_TIMEOUT",
  );
});

test("Hepan business errors preserve safe request id", async () => {
  const client = createHepanGeoApiClient({
    fetch: async () =>
      jsonResponse({
        success: false,
        code: 1005,
        request_id: "request-safe-1",
        data: {},
      }),
  });
  await assert.rejects(
    client.publish(
      { uid: 12345, password: "fixture-password" },
      { subject: "标题", message: "正文", idempotencyKey: "same-key" },
    ),
    (error) =>
      error.code === "HEPAN_CONTENT_REJECTED" &&
      error.requestId === "request-safe-1" &&
      !error.message.includes("fixture-password"),
  );
});

test("Hepan Markdown conversion emits supported Discuz BBCode only", () => {
  const result = toHepanBbcode(
    "## 小标题\n\n这是 **加粗** 和 [链接文字](https://example.com)。\n\n- 第一项\n- 第二项\n\n<script>alert(1)</script>",
  );
  assert.equal(result.includes("[size=5][b]小标题[/b][/size]"), true);
  assert.equal(result.includes("[b]加粗[/b]"), true);
  assert.equal(result.includes("[list][*]第一项[*]第二项[/list]"), true);
  assert.equal(result.includes("https://example.com"), false);
  assert.equal(result.includes("<script>"), false);
});

test("Hepan publish maps published and pending without Python runtime", async () => {
  for (const scenario of [
    {
      reviewStatus: "published",
      expectedStatus: "accepted",
      url: "https://www.hepan.com/portal.php?mod=view&aid=98765",
    },
    { reviewStatus: "pending", expectedStatus: "remote_pending", url: null },
  ]) {
    let publishedInput;
    const adapter = createHepanAdapter({
      getPlatformSettingsService: settingsService,
      createHepanGeoApiClient: () => ({
        async publish(config, input) {
          publishedInput = { config, input };
          return {
            data: {
              aid: 98765,
              review_status: scenario.reviewStatus,
              url: scenario.url,
            },
          };
        },
        async result() {
          throw new Error("not used");
        },
      }),
    });
    const prepared =
      await adapter.regularSubmission.preparePlatformSubmission(
        claim(`article-${scenario.reviewStatus}`),
      );
    const outcome = await prepared.submitPreparedPublication();
    assert.equal(outcome.status, scenario.expectedStatus);
    assert.equal(outcome.remoteId, "98765");
    assert.equal(publishedInput.input.message.includes("[b]第一段[/b]"), true);
    assert.match(
      publishedInput.input.idempotencyKey,
      /^autopublish-[a-f0-9]{40}$/,
    );
  }
});

test("Hepan result review maps every documented terminal state", async () => {
  for (const scenario of [
    ["pending", "remote_pending"],
    ["draft", "remote_pending"],
    ["published", "accepted"],
    ["rejected", "article_rejected"],
    ["deleted", "article_rejected"],
  ]) {
    const adapter = createHepanAdapter({
      getPlatformSettingsService: settingsService,
      createHepanGeoApiClient: () => ({
        async publish() {
          throw new Error("not used");
        },
        async result(config, aid) {
          assert.equal(config.uid, 12345);
          assert.equal(aid, 98765);
          return {
            data: {
              aid,
              review_status: scenario[0],
              url:
                scenario[0] === "published"
                  ? "https://www.hepan.com/portal.php?mod=view&aid=98765"
                  : null,
            },
          };
        },
      }),
    });
    const outcome = await adapter.remoteReview.reconcile({
      remoteId: "98765",
    });
    assert.equal(outcome.status, scenario[1]);
  }
});

test("Hepan publish failures are classified by operational scope", async () => {
  for (const scenario of [
    ["HEPAN_CONTENT_REJECTED", "article_rejected"],
    ["HEPAN_REQUEST_INVALID", "group_blocked"],
    ["HEPAN_QUOTA_EXHAUSTED", "group_blocked"],
    ["HEPAN_GEO_API_TIMEOUT", "uncertain"],
  ]) {
    const adapter = createHepanAdapter({
      getPlatformSettingsService: settingsService,
      createHepanGeoApiClient: () => ({
        async publish() {
          const error = new Error(scenario[0]);
          error.code = scenario[0];
          throw error;
        },
        async result() {},
      }),
    });
    const prepared =
      await adapter.regularSubmission.preparePlatformSubmission(
        claim(`article-${scenario[0].toLowerCase()}`),
      );
    const outcome = await prepared.submitPreparedPublication();
    assert.equal(outcome.status, scenario[1]);
    if (scenario[1] === "group_blocked")
      assert.equal(outcome.articleRecoverable, true);
  }
});

test("Hepan title over 80 code points is rejected before remote publish", async () => {
  let publishCalls = 0;
  const adapter = createHepanAdapter({
    getPlatformSettingsService: settingsService,
    createHepanGeoApiClient: () => ({
      async publish() {
        publishCalls += 1;
      },
      async result() {},
    }),
  });
  await assert.rejects(
    adapter.regularSubmission.preparePlatformSubmission(
      claim("article-long-title", "中".repeat(81)),
    ),
    (error) => error.code === "REGULAR_CONTENT_INVALID",
  );
  assert.equal(publishCalls, 0);
});
