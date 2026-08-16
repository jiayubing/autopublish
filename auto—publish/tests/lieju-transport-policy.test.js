"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const adapterModulePath = require.resolve("../src/platforms/lieju/adapter");
const playwrightModulePath = require.resolve("../src/core/playwright");
const operatorFlowModulePath = require.resolve("../src/core/operator-flow");
const { createPlatformAdapter } = require("../src/platforms/lieju/adapter");
const { loadPlatformModules } = require("../src/core/platforms");
const { normalizeRuntimeConfig } = require("../desktop/runtime-config-store");

function claim(city) {
  return {
    platformId: "lieju",
    regularPublicationAttemptId: "attempt-lieju-transport-policy",
    articleIdentityV1: {
      version: 1,
      clientId: "client-lieju-transport-policy",
      articleId: "article-lieju-transport-policy",
    },
    targetIdentityV1: {
      version: 1,
      kind: "platform",
      platformId: "lieju",
      accountProfileId: "account-lieju-transport-policy",
    },
    publicationProfile: {
      city: city || "上海",
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
    url: () => value.url || "https://post.lieju.com/3/239",
    headers: () =>
      value.headers || { "content-type": "text/html; charset=utf-8" },
    body: async () =>
      Buffer.isBuffer(value.body)
        ? Buffer.from(value.body)
        : Buffer.from(value.body || '<meta charset="utf-8">', "utf8"),
  };
}

function cityDirectory() {
  return [
    '<meta charset="utf-8">',
    '<a href="https://post.lieju.com/3/239">上海黄浦</a>',
    '<a href="https://post.lieju.com/1/239">北京</a>',
  ].join("");
}

function publicationForm() {
  return [
    '<meta charset="utf-8">',
    '<form method="post" enctype="multipart/form-data" action="/3/239?action=postnew">',
    '<input type="hidden" name="fid" value="opaque-current-form-value">',
    '<input type="text" name="postdb[title]">',
    '<textarea name="postdb[content]"></textarea>',
    '<select name="postdb[zone_id]">',
    '<option value="zone-first">前一项</option>',
    '<option value="zone-final">最后区域</option>',
    "</select>",
    '<input type="text" name="postdb[mobphone]">',
    '<input type="text" name="postdb[linkman]">',
    '<input type="file" name="local_file1">',
    '<input type="checkbox" name="paid_promotion" value="1">',
    "</form>",
  ].join("");
}

function accountPage() {
  return [
    '<meta charset="utf-8">',
    '<a href="https://www.lieju.com/u759917">主页</a>',
    '<span class="m3"><a href="/u759917">合成账号</a></span>',
  ].join("");
}

function stateFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "autopublish-lieju-transport-policy-"),
  );
  const stateFile = path.join(root, "lieju.json");
  fs.writeFileSync(stateFile, '{"cookies":[]}', "utf8");
  return { root, stateFile };
}

function createHttpRuntime(options) {
  const value = options || {};
  const getResponses = (value.getResponses || []).slice();
  const postResponses = (value.postResponses || []).slice();
  const getCalls = [];
  const postCalls = [];
  const newContexts = [];
  const context = {
    get: async (url, input) => {
      getCalls.push({ url, input });
      const next = getResponses.shift();
      if (next instanceof Error) throw next;
      if (typeof next === "function") return next(url, input);
      if (!next) throw new Error("unexpected HTTP GET");
      return next;
    },
    post: async (url, input) => {
      postCalls.push({ url, input });
      const next = postResponses.shift();
      if (next instanceof Error) throw next;
      if (typeof next === "function") return next(url, input);
      if (!next) throw new Error("unexpected HTTP POST");
      return next;
    },
    storageState: async ({ path: filename }) => {
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

function imagePlan() {
  return {
    requestedCount: 1,
    selectedCount: 1,
    textOnly: false,
    images: [
      {
        imageId: "client-image:transport-policy",
        name: "transport-policy.png",
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

function createImageResolver(root) {
  const image = path.join(root, "transport-policy.png");
  fs.writeFileSync(image, png(4, 3));
  return {
    resolveImage: () => ({ filePath: image }),
  };
}

function loadAdapterWithBrowser(options) {
  const value = options || {};
  const originalPlaywright = require.cache[playwrightModulePath];
  const originalOperatorFlow = require.cache[operatorFlowModulePath];
  const originalAdapter = require.cache[adapterModulePath];
  const commands = [];
  const codeSources = [];
  let alive = false;
  let currentUrl = "";
  const session = "lieju-transport-policy";
  const stopError = () => {
    const error = new Error("stop requested");
    error.code = "STOP_REQUESTED";
    return error;
  };

  require.cache[playwrightModulePath] = {
    id: playwrightModulePath,
    filename: playwrightModulePath,
    loaded: true,
    exports: {
      pwSessionConfig: (input) => ({
        session,
        profileDir: "synthetic-profile",
        daemonDir: "synthetic-daemon",
        stateFile: input.stateFile,
      }),
      pwInvokeSync: (args) => {
        commands.push(args);
        if (args[0] === "list") return alive ? session : "";
        if (args[0] === "open") {
          alive = true;
          return "";
        }
        if (args[0] === "goto") {
          currentUrl = args[1];
          return "";
        }
        if (args[0] === "close") {
          alive = false;
          return "";
        }
        return "";
      },
      runCode: (source) => {
        codeSources.push(source);
        if (source.includes("page.content()")) {
          return currentUrl.includes("city.php?post=239")
            ? cityDirectory()
            : publicationForm();
        }
        if (source.includes("responseHandler")) {
          return (
            value.browserEvidence || {
              url: "https://ly.lieju.com/shanghai/654321.html",
              responseUrls: [],
              detailUrls: [],
              dialogMessages: [],
              hasDetailPageSignals: false,
              hasExplicitRejection: false,
              hasSubmissionForm: false,
            }
          );
        }
        if (source.includes("fileField.inputValue")) {
          return value.frozenFormMatches !== false;
        }
        return true;
      },
    },
  };
  if (value.stopped === true) {
    const original = require(operatorFlowModulePath);
    require.cache[operatorFlowModulePath] = {
      id: operatorFlowModulePath,
      filename: operatorFlowModulePath,
      loaded: true,
      exports: {
        ...original,
        throwIfStopped: () => {
          throw stopError();
        },
      },
    };
  }
  delete require.cache[adapterModulePath];
  const loaded = require(adapterModulePath);

  return {
    commands,
    codeSources,
    adapter: loaded.createPlatformAdapter(value.runtimeContext),
    restore: () => {
      delete require.cache[adapterModulePath];
      if (originalAdapter) require.cache[adapterModulePath] = originalAdapter;
      if (originalPlaywright)
        require.cache[playwrightModulePath] = originalPlaywright;
      else delete require.cache[playwrightModulePath];
      if (originalOperatorFlow)
        require.cache[operatorFlowModulePath] = originalOperatorFlow;
      else delete require.cache[operatorFlowModulePath];
    },
  };
}

test("Lieju runtime configuration admits only the platform-level modes", () => {
  assert.deepEqual(
    normalizeRuntimeConfig({ LIEJU_SUBMISSION_MODE: "playwright_only" }),
    { LIEJU_SUBMISSION_MODE: "playwright_only" },
  );
  assert.throws(
    () => normalizeRuntimeConfig({ LIEJU_SUBMISSION_MODE: "per_article" }),
    { code: "RUNTIME_CONFIG_INVALID" },
  );
});

test("Lieju registers only its prepared-submission contract", () => {
  const platform = loadPlatformModules({ platformModules: [require("../src/platforms/lieju/platform")], enabledIds: ["lieju"], runtimeContext: { liejuSubmissionMode: "playwright_only" } })[0];
  assert.equal(typeof platform.regularSubmission.preparePlatformSubmission, "function");
  assert.equal(platform.legacyQueue, undefined);
});

test("Lieju declares the existing image capability after multipart support is ready", () => {
  const adapter = createPlatformAdapter({ liejuSubmissionMode: "auto" });
  assert.deepEqual(adapter.imagePublishingCapability, { supported: true });
});

test("Lieju auto verifies the account and freezes HTTP preparation without starting a browser", async () => {
  const fixture = stateFixture();
  const http = createHttpRuntime({
    getResponses: [
      response(),
      response({
        url: "https://www.lieju.com/member/upage.php",
        body: accountPage(),
      }),
      response(),
      response({ body: cityDirectory() }),
      response({ body: publicationForm() }),
      response(),
      response({
        url: "https://www.lieju.com/member/upage.php",
        body: accountPage(),
      }),
    ],
  });
  const loaded = loadAdapterWithBrowser({
    runtimeContext: {
      browserRuntime: { stateFile: fixture.stateFile },
      httpRequest: http.request,
    },
  });
  try {
    await loaded.adapter.ensureAccountInspectionReady({});
    assert.deepEqual(loaded.adapter.inspectAccount(), {
      verified: true,
      remoteAccountId: "759917",
      displayName: "合成账号",
    });
    const prepared = await loaded.adapter.preparePlatformSubmission(claim());
    await loaded.adapter.ensureAccountInspectionReady({
      preserveCurrentPage: true,
    });
    assert.equal(
      loaded.commands.filter((args) => args[0] === "open").length,
      0,
    );
    assert.deepEqual(
      http.getCalls.map((call) => call.url),
      [
        "https://post.lieju.com/117/239",
        "https://www.lieju.com/member/upage.php",
        "https://post.lieju.com/117/239",
        "https://www.lieju.com/city.php?post=239",
        "https://post.lieju.com/3/239",
        "https://post.lieju.com/117/239",
        "https://www.lieju.com/member/upage.php",
      ],
    );
    assert.equal(prepared.preparedSubmissionEvidenceV1.body, "合成正文");
  } finally {
    loaded.restore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Lieju auto falls back before POST and browser consumes the frozen city, zone, body, and image plan", async () => {
  const fixture = stateFixture();
  const http = createHttpRuntime({
    getResponses: [new Error("synthetic timeout")],
  });
  const loaded = loadAdapterWithBrowser({
    runtimeContext: {
      browserRuntime: { stateFile: fixture.stateFile },
      httpRequest: http.request,
      imageResolver: createImageResolver(fixture.root),
    },
  });
  try {
    const prepared = await loaded.adapter.preparePlatformSubmission(
      claim(),
      imagePlan(),
    );
    assert.equal(http.postCalls.length, 0);
    assert.equal(
      loaded.commands.filter((args) => args[0] === "open").length,
      1,
    );
    assert.equal(
      loaded.commands.some(
        (args) =>
          args[0] === "goto" && args[1] === "https://post.lieju.com/3/239",
      ),
      true,
    );
    const fill = loaded.codeSources.find((source) =>
      source.includes("setInputFiles"),
    );
    assert.ok(fill);
    assert.match(fill, /合成正文/);
    assert.match(fill, /zone-final/);
    assert.match(fill, /local_file1/);
    assert.deepEqual(prepared.preparedSubmissionEvidenceV1.images, [
      {
        assetFingerprint:
          "219003d8a14a805283226fe9c6e894424e7c76bc87a49232cf5af96bebf27328",
        layoutSlot: 0,
      },
    ]);
    assert.deepEqual(await prepared.submitPreparedPublication(), {
      status: "accepted",
      remoteId: "654321",
      remoteUrl: "https://ly.lieju.com/shanghai/654321.html",
    });
    assert.equal(http.postCalls.length, 0);
  } finally {
    loaded.restore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Lieju never turns an HTTP POST timeout into a browser submission or a second POST", async () => {
  const fixture = stateFixture();
  const http = createHttpRuntime({
    getResponses: [
      response(),
      response({ body: cityDirectory() }),
      response({ body: publicationForm() }),
    ],
    postResponses: [new Error("synthetic post timeout")],
  });
  const loaded = loadAdapterWithBrowser({
    runtimeContext: {
      browserRuntime: { stateFile: fixture.stateFile },
      httpRequest: http.request,
    },
  });
  try {
    const prepared = await loaded.adapter.preparePlatformSubmission(claim());
    const expected = {
      status: "uncertain",
      errorCode: "REMOTE_RESULT_UNKNOWN",
    };
    assert.deepEqual(await prepared.submitPreparedPublication(), expected);
    assert.deepEqual(await prepared.submitPreparedPublication(), expected);
    assert.equal(http.postCalls.length, 1);
    assert.equal(
      loaded.commands.filter((args) => args[0] === "open").length,
      0,
    );
  } finally {
    loaded.restore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Lieju concurrent HTTP preparation retains the state lease instead of switching a second call to browser", async () => {
  const fixture = stateFixture();
  let releaseCity;
  let cityEntered;
  const cityReady = new Promise((resolve) => {
    cityEntered = resolve;
  });
  const http = createHttpRuntime({
    getResponses: [
      response(),
      async () => {
        cityEntered();
        return new Promise((resolve) => {
          releaseCity = () => resolve(response({ body: cityDirectory() }));
        });
      },
      response({ body: publicationForm() }),
    ],
  });
  const loaded = loadAdapterWithBrowser({
    runtimeContext: {
      browserRuntime: { stateFile: fixture.stateFile },
      httpRequest: http.request,
    },
  });
  try {
    const first = loaded.adapter.preparePlatformSubmission(claim());
    await cityReady;
    await assert.rejects(
      () => loaded.adapter.preparePlatformSubmission(claim()),
      { code: "BROWSER_SESSION_STATE_LEASE_UNAVAILABLE" },
    );
    assert.equal(
      loaded.commands.filter((args) => args[0] === "open").length,
      0,
    );
    releaseCity();
    await first;
  } finally {
    loaded.restore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Lieju playwright_only never creates an HTTP request context or HTTP POST", async () => {
  const fixture = stateFixture();
  const http = createHttpRuntime();
  const loaded = loadAdapterWithBrowser({
    runtimeContext: {
      liejuSubmissionMode: "playwright_only",
      browserRuntime: { stateFile: fixture.stateFile },
      httpRequest: http.request,
    },
  });
  try {
    const prepared = await loaded.adapter.preparePlatformSubmission(claim());
    assert.equal(http.newContexts.length, 0);
    assert.equal(http.postCalls.length, 0);
    assert.equal(
      loaded.commands.filter((args) => args[0] === "open").length,
      1,
    );
    assert.deepEqual(await prepared.submitPreparedPublication(), {
      status: "accepted",
      remoteId: "654321",
      remoteUrl: "https://ly.lieju.com/shanghai/654321.html",
    });
    assert.equal(http.postCalls.length, 0);
  } finally {
    loaded.restore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

for (const errorCode of [
  "LOGIN_REQUIRED",
  "CAPTCHA_REQUIRED",
  "RISK_CONTROL_REQUIRED",
]) {
  test(`Lieju browser fallback preserves ${errorCode} as a recoverable blocking outcome`, async () => {
    const fixture = stateFixture();
    const loaded = loadAdapterWithBrowser({
      runtimeContext: {
        liejuSubmissionMode: "playwright_only",
        browserRuntime: { stateFile: fixture.stateFile },
      },
      browserEvidence: {
        url: "https://post.lieju.com/3/239",
        responseUrls: [],
        detailUrls: [],
        dialogMessages: [],
        blockingCode: errorCode,
        hasDetailPageSignals: false,
        hasExplicitRejection: false,
        hasSubmissionForm: true,
      },
    });
    try {
      const prepared = await loaded.adapter.preparePlatformSubmission(claim());
      assert.deepEqual(await prepared.submitPreparedPublication(), {
        status: "group_blocked",
        errorCode,
        articleRecoverable: true,
      });
    } finally {
      loaded.restore();
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }
  });
}

test("Lieju browser submit fails closed when a frozen image input no longer matches", async () => {
  const fixture = stateFixture();
  const loaded = loadAdapterWithBrowser({
    runtimeContext: {
      liejuSubmissionMode: "playwright_only",
      browserRuntime: { stateFile: fixture.stateFile },
      imageResolver: createImageResolver(fixture.root),
    },
    frozenFormMatches: false,
  });
  try {
    const prepared = await loaded.adapter.preparePlatformSubmission(
      claim(),
      imagePlan(),
    );
    assert.deepEqual(await prepared.submitPreparedPublication(), {
      status: "uncertain",
      errorCode: "PREPARED_CONTENT_DRIFT",
    });
    assert.equal(
      loaded.codeSources.some((source) => source.includes("responseHandler")),
      false,
    );
  } finally {
    loaded.restore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Lieju stop and invalid mode fail closed before either transport starts", async () => {
  const fixture = stateFixture();
  const http = createHttpRuntime();
  const stopped = loadAdapterWithBrowser({
    stopped: true,
    runtimeContext: {
      browserRuntime: { stateFile: fixture.stateFile },
      httpRequest: http.request,
    },
  });
  try {
    await assert.rejects(
      () => stopped.adapter.preparePlatformSubmission(claim()),
      { code: "STOP_REQUESTED" },
    );
    assert.equal(http.newContexts.length, 0);
    assert.equal(
      stopped.commands.some((args) => args[0] === "open"),
      false,
    );
  } finally {
    stopped.restore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }

  const invalid = createPlatformAdapter({
    liejuSubmissionMode: "browser_and_http",
    browserRuntime: {
      stateFile: path.join(os.tmpdir(), "unused-lieju-state.json"),
    },
  });
  await assert.rejects(() => invalid.preparePlatformSubmission(claim()), {
    code: "LIEJU_SUBMISSION_MODE_INVALID",
  });
});
