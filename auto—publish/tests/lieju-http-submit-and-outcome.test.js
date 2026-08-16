"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createPlatformAdapter } = require("../src/platforms/lieju/adapter");
const httpOutcome = require("../src/platforms/lieju/http-outcome");

function claim() {
  return {
    platformId: "lieju",
    regularPublicationAttemptId: "attempt-lieju-http-submit",
    articleIdentityV1: {
      version: 1,
      clientId: "client-lieju-http-submit",
      articleId: "article-lieju-http-submit",
    },
    targetIdentityV1: {
      version: 1,
      kind: "platform",
      platformId: "lieju",
      accountProfileId: "account-lieju-http-submit",
    },
    publicationProfile: {
      city: "北京",
      contact: "合成联系人",
      phone: "010-12345678",
    },
    publicationSnapshot: {
      title: "合成标题",
      body: "**合成正文**",
    },
  };
}

function response(options) {
  const value = options || {};
  return {
    status: () => (value.status === undefined ? 200 : value.status),
    url: () => value.url || "https://post.lieju.com/1/239?action=postnew",
    headers: () =>
      value.headers || { "content-type": "text/html; charset=utf-8" },
    body: async () => {
      if (value.bodyError) throw value.bodyError;
      return Buffer.isBuffer(value.body)
        ? Buffer.from(value.body)
        : Buffer.from(value.body || '<meta charset="utf-8">', "utf8");
    },
  };
}

function cityDirectory() {
  return '<meta charset="utf-8"><a href="https://post.lieju.com/1/239">北京</a>';
}

function publicationForm() {
  return [
    '<meta charset="utf-8">',
    '<form method="post" enctype="multipart/form-data" action="/1/239?action=postnew">',
    '<input type="hidden" name="fid" value="opaque-current-form-value">',
    '<input type="text" name="postdb[title]" value="old title">',
    '<textarea name="postdb[content]">old content</textarea>',
    '<select name="postdb[zone_id]"><option value="">请选择</option><option value="zone-final">最终区域</option></select>',
    '<input type="text" name="postdb[mobphone]" value="old phone">',
    '<input type="text" name="postdb[linkman]" value="old contact">',
    '<input type="file" name="local_file1">',
    '<input type="checkbox" name="paid_promotion" value="1">',
    "</form>",
  ].join("");
}

function makeRequestRuntime(options) {
  const value = options || {};
  const getResponses = (
    value.getResponses || [
      response(),
      response({ body: cityDirectory() }),
      response({ body: publicationForm() }),
    ]
  ).slice();
  const postResponses = (value.postResponses || []).slice();
  const getCalls = [];
  const postCalls = [];
  const newContexts = [];
  let storageStateCalls = 0;

  const context = {
    get: async (url, input) => {
      getCalls.push({ url, input });
      const next = getResponses.shift();
      if (next instanceof Error) throw next;
      if (!next) throw new Error("unexpected Lieju HTTP GET");
      return typeof next === "function" ? next(url, input) : next;
    },
    post: async (url, input) => {
      postCalls.push({ url, input });
      const next = postResponses.shift();
      if (next instanceof Error) throw next;
      if (!next) throw new Error("unexpected Lieju HTTP POST");
      return typeof next === "function" ? next(url, input) : next;
    },
    storageState: async ({ path: filename }) => {
      storageStateCalls += 1;
      if (value.storageStateFailureAt === storageStateCalls)
        throw new Error("state save failed with cookie=secret");
      fs.writeFileSync(filename, '{"cookies":[]}', "utf8");
    },
    dispose: async () => undefined,
  };

  return {
    getCalls,
    postCalls,
    newContexts,
    request: {
      newContext: async (input) => {
        newContexts.push(input);
        return context;
      },
    },
  };
}

function stateFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "autopublish-lieju-http-submit-"),
  );
  const stateFile = path.join(root, "lieju.json");
  fs.writeFileSync(stateFile, '{"cookies":[]}', "utf8");
  return { root, stateFile };
}

function createAdapter(fixture, runtime) {
  return createPlatformAdapter({
    browserRuntime: { stateFile: fixture.stateFile },
    httpRequest: runtime.request,
  });
}

async function prepare(adapter) {
  return adapter.preparePlatformSubmission(claim());
}

function gbkSuccessPage(detailUrl) {
  return Buffer.concat([
    Buffer.from('<meta charset="gbk"><p>', "ascii"),
    Buffer.from([0xb7, 0xa2, 0xb2, 0xbc, 0xb3, 0xc9, 0xb9, 0xa6]),
    Buffer.from(`</p><a href="${detailUrl}">详情</a>`, "ascii"),
  ]);
}

function png(width, height) {
  const value = Buffer.alloc(45);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(value, 0);
  value.writeUInt32BE(13, 8);
  value.write("IHDR", 12, "ascii");
  value.writeUInt32BE(width, 16);
  value.writeUInt32BE(height, 20);
  value.writeUInt32BE(0, 33);
  value.write("IEND", 37, "ascii");
  return value;
}

function imagePlan(name) {
  return {
    requestedCount: 1,
    selectedCount: 1,
    textOnly: false,
    images: [
      {
        imageId: `client-image:${Buffer.from(name, "utf8").toString("base64url")}`,
        name,
        extension: ".png",
        mimeType: "image/png",
        width: 4,
        height: 3,
        size: 45,
      },
    ],
    warnings: [],
  };
}

test("Lieju HTTP outcome classifier accepts only verified identities and classifies stable outcomes", () => {
  const detailUrl = "https://ly.lieju.com/beijing/123456.html";
  const cases = [
    {
      name: "UTF-8 success page with detail identity",
      response: {
        url: "https://post.lieju.com/1/239?action=postnew",
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: Buffer.from(
          `<meta charset="utf-8">发布成功 <a href="${detailUrl}">详情</a>`,
          "utf8",
        ),
      },
      expected: {
        status: "accepted",
        remoteId: "123456",
        remoteUrl: detailUrl,
      },
    },
    {
      name: "GBK success page with detail identity",
      response: {
        url: "https://post.lieju.com/1/239?action=postnew",
        status: 200,
        contentType: "text/html; charset=gbk",
        body: gbkSuccessPage(detailUrl),
      },
      expected: {
        status: "accepted",
        remoteId: "123456",
        remoteUrl: detailUrl,
      },
    },
    {
      name: "success text without identity",
      response: {
        url: "https://post.lieju.com/1/239?action=postnew",
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: Buffer.from('<meta charset="utf-8">发布成功', "utf8"),
      },
      expected: { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" },
    },
    {
      name: "explicit rejection",
      response: {
        url: "https://post.lieju.com/1/239?action=postnew",
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: Buffer.from('<meta charset="utf-8">标题不能为空', "utf8"),
      },
      expected: { status: "article_rejected", errorCode: "REMOTE_REJECTED" },
    },
    {
      name: "expired login",
      response: { status: 403 },
      expected: {
        status: "group_blocked",
        errorCode: "LOGIN_REQUIRED",
        articleRecoverable: true,
      },
    },
    {
      name: "captcha",
      response: {
        url: "https://post.lieju.com/1/239?action=postnew",
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: Buffer.from('<meta charset="utf-8">请完成验证码', "utf8"),
      },
      expected: {
        status: "group_blocked",
        errorCode: "CAPTCHA_REQUIRED",
        articleRecoverable: true,
      },
    },
    {
      name: "risk control",
      response: {
        url: "https://post.lieju.com/1/239?action=postnew",
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: Buffer.from('<meta charset="utf-8">访问过于频繁', "utf8"),
      },
      expected: {
        status: "group_blocked",
        errorCode: "RISK_CONTROL_REQUIRED",
        articleRecoverable: true,
      },
    },
    {
      name: "untrusted detail URL",
      response: {
        url: "https://post.lieju.com/1/239?action=postnew",
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: Buffer.from(
          '<meta charset="utf-8">发布成功 <a href="https://attacker.invalid/123456.html">详情</a>',
          "utf8",
        ),
      },
      expected: { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" },
    },
  ];

  for (const item of cases) {
    assert.deepEqual(
      httpOutcome.classifyLiejuHttpSubmitResponse(item.response),
      item.expected,
      item.name,
    );
  }
});

test("Lieju prepares through HTTP, submits frozen multipart once, and returns its accepted detail identity", async () => {
  const fixture = stateFixture();
  const detailUrl = "https://ly.lieju.com/beijing/654321.html";
  const runtime = makeRequestRuntime({
    postResponses: [
      response({
        body: `<meta charset="utf-8">发布成功 <a href="${detailUrl}">详情</a>`,
      }),
    ],
  });
  try {
    const prepared = await prepare(createAdapter(fixture, runtime));
    assert.equal(runtime.getCalls.length, 3);
    assert.equal(runtime.newContexts.length, 1);
    assert.equal(prepared.preparedSubmissionEvidenceV1.body, "合成正文");
    assert.doesNotMatch(
      JSON.stringify(prepared.preparedSubmissionEvidenceV1),
      /合成联系人|010-12345678|opaque-current-form-value/,
    );

    assert.deepEqual(await prepared.submitPreparedPublication(), {
      status: "accepted",
      remoteId: "654321",
      remoteUrl: detailUrl,
    });
    assert.equal(runtime.postCalls.length, 1);
    assert.equal(runtime.newContexts.length, 2);
    assert.equal(
      runtime.postCalls[0].url,
      "https://post.lieju.com/1/239?action=postnew",
    );
    assert.equal(runtime.postCalls[0].input.maxRetries, 0);
    assert.equal(runtime.postCalls[0].input.maxRedirects, 0);
    assert.equal(runtime.postCalls[0].input.failOnStatusCode, false);
    assert.equal(runtime.postCalls[0].input.timeout, 20000);
    const body = runtime.postCalls[0].input.data;
    assert.equal(Buffer.isBuffer(body), true);
    assert.equal(
      body.includes(Buffer.from('name="postdb[title]"\r\n\r\n合成标题')),
      true,
    );
    assert.equal(
      body.includes(Buffer.from('name="postdb[content]"\r\n\r\n合成正文')),
      true,
    );
    assert.equal(
      body.includes(Buffer.from('name="postdb[zone_id]"\r\n\r\nzone-final')),
      true,
    );
    assert.equal(
      body.includes(Buffer.from('name="postdb[mobphone]"\r\n\r\n010-12345678')),
      true,
    );
    assert.equal(
      body.includes(Buffer.from('name="postdb[linkman]"\r\n\r\n合成联系人')),
      true,
    );
    assert.equal(body.includes(Buffer.from("paid_promotion")), false);

    assert.deepEqual(await prepared.submitPreparedPublication(), {
      status: "uncertain",
      errorCode: "REMOTE_RESULT_UNKNOWN",
    });
    assert.equal(runtime.postCalls.length, 1);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Lieju HTTP submit sends the frozen successful image manifest in its real file slot", async () => {
  const fixture = stateFixture();
  const imageBytes = png(4, 3);
  const imagePath = path.join(fixture.root, "cover.png");
  fs.writeFileSync(imagePath, imageBytes);
  const runtime = makeRequestRuntime({
    postResponses: [
      response({
        body: '<meta charset="utf-8">发布成功 <a href="https://ly.lieju.com/beijing/765432.html">详情</a>',
      }),
    ],
  });
  try {
    const adapter = createPlatformAdapter({
      browserRuntime: { stateFile: fixture.stateFile },
      httpRequest: runtime.request,
      imageResolver: {
        resolveImage: () => ({ filePath: imagePath }),
      },
    });
    const prepared = await adapter.preparePlatformSubmission(
      claim(),
      imagePlan("cover.png"),
    );
    assert.equal(
      prepared.preparedSubmissionEvidenceV1.deliveryMode,
      "with_images",
    );
    assert.equal(prepared.preparedSubmissionEvidenceV1.images.length, 1);
    assert.deepEqual(await prepared.submitPreparedPublication(), {
      status: "accepted",
      remoteId: "765432",
      remoteUrl: "https://ly.lieju.com/beijing/765432.html",
    });
    const body = runtime.postCalls[0].input.data;
    assert.equal(body.includes(Buffer.from('name="local_file1"')), true);
    assert.equal(body.includes(Buffer.from('filename="cover.png"')), true);
    assert.equal(body.includes(imageBytes), true);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Lieju HTTP multipart encodes text fields using the publication form charset", async () => {
  const fixture = stateFixture();
  const runtime = makeRequestRuntime({
    getResponses: [
      response(),
      response({ body: cityDirectory() }),
      response({
        headers: { "content-type": "text/html; charset=gbk" },
        body: Buffer.from(
          publicationForm()
            .replace('<meta charset="utf-8">', '<meta charset="gbk">')
            .replace("请选择", "select")
            .replace("最终区域", "final"),
          "ascii",
        ),
      }),
    ],
    postResponses: [
      response({
        body: '<meta charset="utf-8">发布成功 <a href="https://ly.lieju.com/beijing/765433.html">详情</a>',
      }),
    ],
  });
  try {
    const prepared = await prepare(createAdapter(fixture, runtime));
    assert.deepEqual(await prepared.submitPreparedPublication(), {
      status: "accepted",
      remoteId: "765433",
      remoteUrl: "https://ly.lieju.com/beijing/765433.html",
    });
    const body = runtime.postCalls[0].input.data;
    assert.equal(body.includes(Buffer.from("合成标题", "utf8")), false);
    assert.equal(body.includes(Buffer.from("合成正文", "utf8")), false);
    assert.equal(body.includes(Buffer.from("bacfb3c9b1eacce2", "hex")), true);
    assert.equal(body.includes(Buffer.from("bacfb3c9d5fdcec4", "hex")), true);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Lieju marks the submission boundary before a late HTTP response", async () => {
  const fixture = stateFixture();
  let resolvePost;
  const runtime = makeRequestRuntime({
    postResponses: [
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        }),
    ],
  });
  try {
    const prepared = await prepare(createAdapter(fixture, runtime));
    const first = prepared.submitPreparedPublication();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(runtime.postCalls.length, 1);
    assert.deepEqual(await prepared.submitPreparedPublication(), {
      status: "uncertain",
      errorCode: "REMOTE_RESULT_UNKNOWN",
    });
    resolvePost(
      response({
        body: '<meta charset="utf-8">发布成功 <a href="https://ly.lieju.com/beijing/888888.html">详情</a>',
      }),
    );
    assert.deepEqual(await first, {
      status: "accepted",
      remoteId: "888888",
      remoteUrl: "https://ly.lieju.com/beijing/888888.html",
    });
    assert.equal(runtime.postCalls.length, 1);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

for (const scenario of [
  {
    name: "redirected detail identity",
    post: response({
      status: 302,
      headers: {
        location: "https://ly.lieju.com/beijing/777777.html",
        "content-type": "text/html; charset=utf-8",
      },
    }),
    expected: {
      status: "accepted",
      remoteId: "777777",
      remoteUrl: "https://ly.lieju.com/beijing/777777.html",
    },
  },
  {
    name: "explicit rejection",
    post: response({ body: '<meta charset="utf-8">标题不能为空' }),
    expected: { status: "article_rejected", errorCode: "REMOTE_REJECTED" },
  },
  {
    name: "expired login",
    post: response({ status: 403 }),
    expected: {
      status: "group_blocked",
      errorCode: "LOGIN_REQUIRED",
      articleRecoverable: true,
    },
  },
  {
    name: "captcha",
    post: response({ body: '<meta charset="utf-8">请完成验证码' }),
    expected: {
      status: "group_blocked",
      errorCode: "CAPTCHA_REQUIRED",
      articleRecoverable: true,
    },
  },
  {
    name: "risk control",
    post: response({ body: '<meta charset="utf-8">访问过于频繁' }),
    expected: {
      status: "group_blocked",
      errorCode: "RISK_CONTROL_REQUIRED",
      articleRecoverable: true,
    },
  },
]) {
  test(`Lieju HTTP submit returns ${scenario.name} through the prepared capability`, async () => {
    const fixture = stateFixture();
    const runtime = makeRequestRuntime({ postResponses: [scenario.post] });
    try {
      const prepared = await prepare(createAdapter(fixture, runtime));
      assert.deepEqual(
        await prepared.submitPreparedPublication(),
        scenario.expected,
      );
      assert.equal(runtime.postCalls.length, 1);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });
}

for (const scenario of [
  {
    name: "timeout",
    post: new Error("timeout with cookie=secret"),
  },
  {
    name: "response body unavailable",
    post: response({ bodyError: new Error("partial response") }),
  },
  {
    name: "response decode failure",
    post: response({
      body: Buffer.from([0xc3, 0x28]),
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  },
  {
    name: "unsafe redirect",
    post: response({
      status: 302,
      headers: { location: "https://attacker.invalid/654321.html" },
    }),
  },
  {
    name: "state save failure",
    post: response({
      body: '<meta charset="utf-8">发布成功 <a href="https://ly.lieju.com/beijing/654321.html">详情</a>',
    }),
    storageStateFailureAt: 2,
  },
]) {
  test(`Lieju HTTP post ${scenario.name} stays uncertain and never posts twice`, async () => {
    const fixture = stateFixture();
    const runtime = makeRequestRuntime({
      postResponses: [scenario.post],
      storageStateFailureAt: scenario.storageStateFailureAt,
    });
    try {
      const prepared = await prepare(createAdapter(fixture, runtime));
      const expected = {
        status: "uncertain",
        errorCode: "REMOTE_RESULT_UNKNOWN",
      };
      assert.deepEqual(await prepared.submitPreparedPublication(), expected);
      assert.deepEqual(await prepared.submitPreparedPublication(), expected);
      assert.equal(runtime.postCalls.length, 1);
    } finally {
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });
}
