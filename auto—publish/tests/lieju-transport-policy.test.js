"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const adapterModulePath = require.resolve("../src/platforms/lieju/adapter");
const playwrightModulePath = require.resolve("../src/core/playwright");
const operatorFlowModulePath = require.resolve("../src/core/operator-flow");
const { loadPlatformModules } = require("../src/core/platforms");
const { normalizeRuntimeConfig } = require("../desktop/runtime-config-store");

function claim(city) {
  return {
    platformId: "lieju",
    regularPublicationAttemptId: "attempt-lieju-http-policy",
    articleIdentityV1: {
      version: 1,
      clientId: "client-lieju-http-policy",
      articleId: "article-lieju-http-policy",
    },
    targetIdentityV1: {
      version: 1,
      kind: "platform",
      platformId: "lieju",
      accountProfileId: "account-lieju-http-policy",
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
    '<div class="bodytop_r"><b>合成账号</b><a href="/login/?action=quit">安全退出</a></div>',
    '<a href="https://www.lieju.com/u759917">我的主页</a>',
    '<div class="m3"><a href="/u759917">前往我的主页»</a></div>',
  ].join("");
}

function stateFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "autopublish-lieju-http-policy-"),
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
      if (value.stateSaveError && postCalls.length > 0)
        throw new Error("synthetic state save failure");
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

function loadAdapter(options) {
  const value = options || {};
  const originalPlaywright = require.cache[playwrightModulePath];
  const originalOperatorFlow = require.cache[operatorFlowModulePath];
  const originalAdapter = require.cache[adapterModulePath];
  const commands = [];
  let alive = value.browser ? value.browser.alive : false;
  const session = "lieju-http-policy";

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
        if (value.browser && args[0] === "state-load")
          value.browser.account = JSON.parse(fs.readFileSync(args[1], "utf8")).syntheticAccount;
        if (args[0] === "list") return alive ? session : "";
        if (args[0] === "open") {
          alive = true;
          return "";
        }
        if (args[0] === "close") {
          alive = false;
          return "";
        }
        return "";
      },
      runCode: () => value.browser ? Boolean(value.browser.account) : true,
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
        throwIfStopped() {
          const error = new Error("stop requested");
          error.code = "STOP_REQUESTED";
          throw error;
        },
      },
    };
  }

  delete require.cache[adapterModulePath];
  const loaded = require(adapterModulePath);
  return {
    commands,
    adapter: loaded.createPlatformAdapter(value.runtimeContext),
    restore() {
      delete require.cache[adapterModulePath];
      if (originalAdapter) require.cache[adapterModulePath] = originalAdapter;
      if (originalPlaywright)
        require.cache[playwrightModulePath] = originalPlaywright;
      else
        delete require.cache[playwrightModulePath];
      if (originalOperatorFlow)
        require.cache[operatorFlowModulePath] = originalOperatorFlow;
      else
        delete require.cache[operatorFlowModulePath];
    },
  };
}

test("retired Lieju transport mode is no longer runtime configuration", () => {
  assert.deepEqual(
    normalizeRuntimeConfig({ LIEJU_SUBMISSION_MODE: "playwright_only" }),
    {},
  );
});

test("Lieju exposes one regular submission port and no legacy queue", () => {
  const platform = loadPlatformModules({
    platformModules: [require("../src/platforms/lieju/platform")],
    enabledIds: ["lieju"],
    runtimeContext: { workspacePaths: {} },
  })[0];
  assert.equal(typeof platform.regularSubmission.preparePlatformSubmission, "function");
  assert.equal(typeof platform.loginSession.open, "function");
  assert.equal(typeof platform.accountInspection.inspect, "function");
  assert.equal(platform.legacyQueue, undefined);
});

test("Lieju account inspection and publication preparation stay HTTP-only", async () => {
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
    ],
  });
  const loaded = loadAdapter({
    runtimeContext: {
      browserRuntime: { stateFile: fixture.stateFile },
      httpRequest: http.request,
    },
  });
  try {
    await loaded.adapter.ensureAccountInspectionReady();
    assert.deepEqual(loaded.adapter.inspectAccount(), {
      verified: true,
      remoteAccountId: "759917",
      displayName: "合成账号",
    });
    const prepared = await loaded.adapter.preparePlatformSubmission(claim());
    assert.equal(prepared.preparedSubmissionEvidenceV1.body, "合成正文");
    assert.equal(loaded.commands.some((args) => args[0] === "open"), false);
    assert.equal(http.newContexts.length, 2);
  } finally {
    loaded.restore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Lieju does not bind a homepage navigation label as an account name", async () => {
  const fixture = stateFixture();
  const http = createHttpRuntime({
    getResponses: [response(), response({
      body: '<meta charset="utf-8"><div class="m3"><a href="/u759917">前往我的主页»</a></div>',
    })],
  });
  const loaded = loadAdapter({ runtimeContext: {
    browserRuntime: { stateFile: fixture.stateFile }, httpRequest: http.request,
  } });
  try {
    await assert.rejects(() => loaded.adapter.ensureAccountInspectionReady(), {
      code: "LIEJU_ACCOUNT_INSPECTION_UNVERIFIED",
    });
  } finally {
    loaded.restore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Lieju HTTP preparation failure blocks before POST and never starts browser publication", async () => {
  const fixture = stateFixture();
  const http = createHttpRuntime({ getResponses: [new Error("synthetic timeout")] });
  const loaded = loadAdapter({
    runtimeContext: {
      browserRuntime: { stateFile: fixture.stateFile },
      httpRequest: http.request,
    },
  });
  try {
    await assert.rejects(
      () => loaded.adapter.preparePlatformSubmission(claim()),
      { code: "LIEJU_HTTP_GET_FAILED" },
    );
    assert.equal(http.postCalls.length, 0);
    assert.equal(loaded.commands.some((args) => args[0] === "open"), false);
  } finally {
    loaded.restore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Lieju POST uncertainty is single-shot and never starts browser publication", async () => {
  const fixture = stateFixture();
  const http = createHttpRuntime({
    getResponses: [
      response(),
      response({ body: cityDirectory() }),
      response({ body: publicationForm() }),
    ],
    postResponses: [new Error("synthetic post timeout")],
  });
  const loaded = loadAdapter({
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
    assert.equal(loaded.commands.some((args) => args[0] === "open"), false);
  } finally {
    loaded.restore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Lieju HTTP account inspection failure never starts browser publication", async () => {
  const fixture = stateFixture();
  const http = createHttpRuntime({ getResponses: [new Error("synthetic timeout")] });
  const loaded = loadAdapter({
    runtimeContext: {
      browserRuntime: { stateFile: fixture.stateFile },
      httpRequest: http.request,
    },
  });
  try {
    await assert.rejects(
      () => loaded.adapter.ensureAccountInspectionReady(),
      { code: "LIEJU_HTTP_GET_FAILED" },
    );
    assert.equal(loaded.commands.some((args) => args[0] === "open"), false);
  } finally {
    loaded.restore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Lieju keeps a confirmed remote identity when HTTP state persistence later fails", async () => {
  const fixture = stateFixture();
  const http = createHttpRuntime({
    stateSaveError: true,
    getResponses: [
      response(),
      response({ body: cityDirectory() }),
      response({ body: publicationForm() }),
    ],
    postResponses: [
      response({
        status: 302,
        url: "https://post.lieju.com/3/239?action=postnew",
        headers: {
          location: "https://ly.lieju.com/shanghai/987654.html",
          "content-type": "text/html; charset=utf-8",
        },
        body: "",
      }),
    ],
  });
  const loaded = loadAdapter({
    runtimeContext: {
      browserRuntime: { stateFile: fixture.stateFile },
      httpRequest: http.request,
    },
  });
  try {
    const prepared = await loaded.adapter.preparePlatformSubmission(claim());
    assert.deepEqual(await prepared.submitPreparedPublication(), {
      status: "accepted",
      remoteId: "987654",
      remoteUrl: "https://ly.lieju.com/shanghai/987654.html",
    });
    assert.equal(http.postCalls.length, 1);
  } finally {
    loaded.restore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Lieju concurrent HTTP preparation fails on the shared state lease instead of changing transport", async () => {
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
  const loaded = loadAdapter({
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
    assert.equal(loaded.commands.some((args) => args[0] === "open"), false);
    releaseCity();
    await first;
  } finally {
    loaded.restore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Lieju browser runtime is reserved for explicit login session actions", () => {
  const fixture = stateFixture();
  const loaded = loadAdapter({
    runtimeContext: {
      browserRuntime: { stateFile: fixture.stateFile },
    },
  });
  try {
    loaded.adapter.openLogin();
    assert.equal(
      loaded.commands.filter((args) => args[0] === "open").length,
      1,
    );
    assert.equal(
      loaded.commands.some(
        (args) => args[0] === "goto" && args[1] === "https://www.lieju.com/login/",
      ),
      true,
    );
  } finally {
    loaded.restore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("reopening Lieju login preserves a live logout or account switch instead of restoring an old account", () => {
  const fixture = stateFixture();
  fs.writeFileSync(
    fixture.stateFile,
    JSON.stringify({ syntheticAccount: "saved-account-A" }),
  );
  const browser = { alive: true, account: "current-account-B" };
  const loaded = loadAdapter({
    browser,
    runtimeContext: { browserRuntime: { stateFile: fixture.stateFile } },
  });
  try {
    loaded.adapter.openLogin();
    assert.equal(browser.account, "current-account-B");
    browser.account = null; // The user explicitly logs out on the website.
    loaded.adapter.openLogin();
    assert.equal(browser.account, null);
  } finally {
    loaded.restore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("opening a new Lieju browser restores its saved login", () => {
  const fixture = stateFixture();
  fs.writeFileSync(
    fixture.stateFile,
    JSON.stringify({ syntheticAccount: "saved-account-A" }),
  );
  const browser = { alive: false, account: null };
  const loaded = loadAdapter({
    browser,
    runtimeContext: { browserRuntime: { stateFile: fixture.stateFile } },
  });
  try {
    loaded.adapter.openLogin();
    assert.equal(browser.account, "saved-account-A");
  } finally {
    loaded.restore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("Lieju stop fails closed before HTTP or browser publication starts", async () => {
  const fixture = stateFixture();
  const http = createHttpRuntime();
  const loaded = loadAdapter({
    stopped: true,
    runtimeContext: {
      browserRuntime: { stateFile: fixture.stateFile },
      httpRequest: http.request,
    },
  });
  try {
    await assert.rejects(
      () => loaded.adapter.preparePlatformSubmission(claim()),
      { code: "STOP_REQUESTED" },
    );
    assert.equal(http.newContexts.length, 0);
    assert.equal(loaded.commands.some((args) => args[0] === "open"), false);
  } finally {
    loaded.restore();
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});
