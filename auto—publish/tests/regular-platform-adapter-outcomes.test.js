"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createPlatformAdapter } = require("../src/platforms/lieju/adapter");

function claim(profile) {
  return {
    platformId: "lieju",
    regularPublicationAttemptId: "attempt-lieju-current-contract",
    articleIdentityV1: {
      version: 1,
      clientId: "client-lieju-current-contract",
      articleId: "article-lieju-current-contract",
    },
    targetIdentityV1: {
      version: 1,
      kind: "platform",
      platformId: "lieju",
      accountProfileId: "account-lieju-current-contract",
    },
    publicationSnapshot: {
      title: "合成标题",
      body: "合成正文",
    },
    publicationProfile: profile,
  };
}

function response(url, body) {
  return {
    status: () => 200,
    url: () => url,
    headers: () => ({ "content-type": "text/html; charset=utf-8" }),
    body: async () => Buffer.from(body || '<meta charset="utf-8">', "utf8"),
  };
}

test("Lieju rejects an incomplete publication profile before opening HTTP state", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lieju-profile-gate-"));
  let requestContexts = 0;
  try {
    const adapter = createPlatformAdapter({
      browserRuntime: { stateFile: path.join(root, "lieju.json") },
      httpRequest: {
        async newContext() {
          requestContexts += 1;
          throw new Error("HTTP must not start");
        },
      },
    });

    await assert.rejects(
      () =>
        adapter.preparePlatformSubmission(
          claim({
            city: "",
            contact: "张三",
            phone: "13800138000",
          }),
        ),
      { code: "REGULAR_CONTENT_INVALID" },
    );
    assert.equal(requestContexts, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Lieju account inspection reads identity through the saved HTTP session", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lieju-http-account-"));
  const stateFile = path.join(root, "lieju.json");
  fs.writeFileSync(stateFile, '{"cookies":[]}', "utf8");
  const calls = [];
  const responses = [
    response("https://post.lieju.com/117/239", "<html></html>"),
    response(
      "https://www.lieju.com/member/upage.php",
      '<meta charset="utf-8"><a href="https://www.lieju.com/u759917">主页</a><span class="m3"><a href="/u759917">fixture-lieju-account</a></span>',
    ),
  ];

  try {
    const adapter = createPlatformAdapter({
      browserRuntime: { stateFile },
      httpRequest: {
        async newContext() {
          return {
            async get(url) {
              calls.push(url);
              const next = responses.shift();
              if (!next) throw new Error("unexpected HTTP GET");
              return next;
            },
            async storageState({ path: filename }) {
              fs.writeFileSync(filename, '{"cookies":[]}', "utf8");
            },
            async dispose() {},
          };
        },
      },
    });

    await adapter.ensureAccountInspectionReady();
    assert.deepEqual(adapter.inspectAccount(), {
      verified: true,
      remoteAccountId: "759917",
      displayName: "fixture-lieju-account",
    });
    assert.deepEqual(calls, [
      "https://post.lieju.com/117/239",
      "https://www.lieju.com/member/upage.php",
    ]);
    assert.equal(Object.hasOwn(adapter, "publishArticle"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
