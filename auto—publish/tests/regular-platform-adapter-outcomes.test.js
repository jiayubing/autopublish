"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createHepanAdapter } = require("../src/platforms/hepan/adapter");
const {
  createPlatformRuntimeContextFromWorkspacePaths,
} = require("../src/platforms/platform-runtime-context");

function claim(platformId) {
  const value = {
    platformId,
    regularPublicationAttemptId: `attempt-${platformId}`,
    articleIdentityV1: {
      version: 1,
      clientId: "client-adapter-contract",
      articleId: `article-${platformId}`,
    },
    targetIdentityV1: {
      version: 1,
      kind: "platform",
      platformId,
      accountProfileId: `account-${platformId}`,
    },
    publicationSnapshot: { title: "合成标题", body: "合成正文" },
  };
  if (platformId === "lieju") {
    value.publicationProfile = {
      city: "北京",
      contact: "测试联系人",
      phone: "010-12345678",
    };
  }
  return value;
}

function createLiejuPageFixture(options) {
  const value = options || {};
  const fields = {};
  const events = [];
  const state = {
    currentUrl: value.url || "https://post.lieju.com/117/239",
    bodyText: value.bodyText || "",
    links: Array.isArray(value.links) ? value.links : [],
    formVisible: value.formVisible !== false,
  };
  const listeners = { response: [], dialog: [] };

  function emit(type, payload) {
    for (const listener of listeners[type].slice()) listener(payload);
  }

  function emitResponse(url, headers) {
    emit("response", {
      url: () => url,
      headers: () => headers || {},
    });
  }

  function emitDialog(message) {
    emit("dialog", {
      message: () => message,
      dismiss: () => events.push({ type: "dialog-dismissed" }),
    });
  }

  function fieldName(selector) {
    return {
      "#atc_title": "title",
      "#atc_content": "body",
      "#atc_mobphone": "phone",
      "#atc_linkman": "contact",
    }[selector];
  }

  function locator(selector, textFilter) {
    const api = {
      first: () => api,
      filter: (options) =>
        locator(selector, options && typeof options.hasText === "string" ? options.hasText : ""),
      count: () => {
        if (selector.includes("action=quit")) return 1;
        if (selector.includes("city.php?post=239")) return 1;
        if (selector === "a" && textFilter) return 1;
        if (selector === "#atc_zone_id option") return 1;
        if (selector === "body") return 1;
        if (selector === "a[href]") return state.links.length;
        if (selector.includes("id=sub")) return 1;
        if (selector.includes("#atc_title, #atc_content"))
          return state.formVisible ? 4 : 0;
        if (fieldName(selector)) return 1;
        return 0;
      },
      click: () => {
        if (selector === "a" && textFilter) {
          events.push({ type: "city", value: textFilter });
        } else if (selector.includes("city.php?post=239")) {
          events.push({ type: "city-switch" });
        } else if (selector.includes("id=sub")) {
          events.push({ type: "submit" });
          if (typeof value.onSubmit === "function")
            value.onSubmit({ state, emitDialog, emitResponse });
        }
      },
      fill: (value) => {
        fields[fieldName(selector)] = value;
        events.push({ type: "fill", field: fieldName(selector), value });
      },
      inputValue: () => fields[fieldName(selector)] || "",
      innerText: () => state.bodyText,
      evaluateAll: (callback) => {
        if (selector === "a[href]") {
          return callback(
            state.links.map((href) => ({
              getAttribute: () => href,
            })),
          );
        }
        return callback([{ value: "zone-shanghai", textContent: "上海" }]);
      },
      selectOption: (value) => {
        fields.cityZone = value;
        events.push({ type: "zone", value });
      },
    };
    return api;
  }

  const page = {
    locator,
    waitForLoadState: () => undefined,
    waitForSelector: () => undefined,
    waitForTimeout: () => undefined,
    url: () => state.currentUrl,
    on: (type, listener) => listeners[type].push(listener),
    off: (type, listener) => {
      listeners[type] = listeners[type].filter((candidate) => candidate !== listener);
    },
    evaluate: (callback, selectors) => callback(selectors),
  };

  return {
    fields,
    events,
    state,
    emitDialog,
    emitResponse,
    execute(source) {
      return new Function(
        "page",
        "document",
        source.replace(/\bawait\s+/g, ""),
      )(page, { baseURI: state.currentUrl });
    },
  };
}

function loadBrowserAdapter(platformId, options) {
  const value = options || {};
  const sessionName = `synthetic-${platformId}`;
  let alive = value.alive !== false;
  let identityReady = value.identityReady !== false;
  const calls = value.calls || [];
  const codeSources = value.codeSources || [];
  const runtimeCalls = value.runtimeCalls || [];
  const sessionConfigs = value.sessionConfigs || [];
  const playwrightPath = require.resolve("../src/core/playwright");
  const adapterPath = require.resolve(`../src/platforms/${platformId}/adapter`);
  const previousPlaywright = require.cache[playwrightPath];
  const previousAdapter = require.cache[adapterPath];
  require.cache[playwrightPath] = {
    id: playwrightPath,
    filename: playwrightPath,
    loaded: true,
    exports: {
      pwSessionConfig: (input) => {
        sessionConfigs.push(input);
        const requested =
          input && typeof input === "object" ? input : { session: input };
        return {
          session: sessionName,
          profileDir: requested.profileDir || "synthetic-profile",
          daemonDir: requested.daemonDir || "synthetic-daemon",
          stateFile: requested.stateFile || value.stateFile || "synthetic-state.json",
        };
      },
      pwInvokeSync: (args, options) => {
        calls.push(args);
        runtimeCalls.push({ args, options });
        if (args[0] === "list") return alive ? sessionName : "";
        if (args[0] === "open") {
          alive = true;
          return "";
        }
        if (args[0] === "goto") {
          identityReady = true;
          return "";
        }
        return "";
      },
      runCode(source) {
        codeSources.push(source);
        if (value.pageFixture && typeof value.pageFixture.execute === "function")
          return value.pageFixture.execute(source);
        if (source.includes("page.url()"))
          return value.postSubmitEvidence ||
            "https://mp.toutiao.com/profile_v4/graphic/publish";
        if (source.includes("targetCity") && !value.pageFixture) return "北京";
        if (platformId === "lieju" && source.includes("page.evaluate")) {
          const node = identityReady
            ? {
                getAttribute: (name) =>
                  name === "href" ? "?uid=98765" : null,
                textContent: "fixture-lieju-account",
              }
            : null;
          const document = {
            querySelector: () => node,
          };
          const page = {
            evaluate: (callback, selectors) => callback(selectors),
          };
          return new Function(
            "page",
            "document",
            source.replace(/\bawait\s+/g, ""),
          )(page, document);
        }
        if (
          source.includes("document.querySelector") &&
          source.includes("selectors")
        )
          return identityReady;
        return true;
      },
    },
  };
  delete require.cache[adapterPath];
  const adapter = require(adapterPath);
  return {
    adapter,
    runtimeCalls,
    sessionConfigs,
    restore() {
      delete require.cache[adapterPath];
      if (previousAdapter) require.cache[adapterPath] = previousAdapter;
      if (previousPlaywright)
        require.cache[playwrightPath] = previousPlaywright;
      else delete require.cache[playwrightPath];
    },
  };
}

test("Hepan accepted result carries a closed safe remote identity", async () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "regular-hepan-identity-"),
  );
  const cookiePath = path.join(root, "cookie.txt");
  fs.writeFileSync(cookiePath, "synthetic-cookie", "utf8");
  try {
    const adapter = createHepanAdapter({
      tempDir: path.join(root, "payloads"),
      runtime: {
        pythonPath: "synthetic-python",
        cookiePath,
        categoryId: 121,
        vendorDir: "",
      },
      runCommand: async () => ({
        status: 0,
        stdout: JSON.stringify({
          ok: true,
          title: "合成标题",
          url: "https://example.test/article?aid=hepan-safe-1",
        }),
        stderr: "",
      }),
    });
    const prepared = await adapter.preparePlatformSubmission(claim("hepan"));
    assert.deepEqual(await prepared.submitPreparedPublication(), {
      status: "accepted",
      remoteId: "hepan-safe-1",
      remoteUrl: "https://example.test/article?aid=hepan-safe-1",
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

for (const platformId of ["lieju", "toutiao"]) {
  test(`${platformId} account preflight starts the session, restores state, and reaches identity page`, async () => {
    const root = fs.mkdtempSync(
      path.join(os.tmpdir(), `regular-${platformId}-account-ready-`),
    );
    const stateFile = path.join(root, "saved-state.json");
    fs.writeFileSync(stateFile, "{}", "utf8");
    const calls = [];
    const loaded = loadBrowserAdapter(platformId, {
      alive: false,
      identityReady: false,
      stateFile,
      calls,
    });
    try {
      await loaded.adapter.ensureAccountInspectionReady({
        targetPlatformId: platformId,
        accountProfileId: "account-browser-ready",
      });
      const commands = calls.map((args) => args[0]);
      const openIndex = commands.indexOf("open");
      const stateLoadIndex = commands.indexOf("state-load");
      const gotoIndex = commands.indexOf("goto");
      assert.ok(openIndex >= 0);
      assert.ok(stateLoadIndex > openIndex);
      assert.ok(gotoIndex > stateLoadIndex);

      calls.splice(0, calls.length);
      await loaded.adapter.ensureAccountInspectionReady({
        targetPlatformId: platformId,
        accountProfileId: "account-browser-ready",
        preserveCurrentPage: true,
      });
      assert.equal(calls.some((args) => args[0] === "goto"), false);
    } finally {
      loaded.restore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test("Lieju fills the customer publication profile through browser page actions", async () => {
  const pageFixture = createLiejuPageFixture();
  const loaded = loadBrowserAdapter("lieju", { pageFixture });
  try {
    await loaded.adapter.preparePlatformSubmission(Object.assign(claim("lieju"), {
      publicationProfile: { city: "上海", contact: "张三", phone: "13800138000" },
    }));
    assert.deepEqual(pageFixture.fields, {
      title: "合成标题",
      body: "合成正文",
      cityZone: "zone-shanghai",
      phone: "13800138000",
      contact: "张三",
    });
    assert.deepEqual(pageFixture.events.slice(0, 3), [
      { type: "city-switch" },
      { type: "city", value: "上海" },
      { type: "zone", value: "zone-shanghai" },
    ]);
  } finally {
    loaded.restore();
  }
});

test("Lieju rejects an incomplete publication profile before opening the remote form", async () => {
  const calls = [];
  const loaded = loadBrowserAdapter("lieju", { calls });
  try {
    await assert.rejects(
      () =>
        loaded.adapter.preparePlatformSubmission(
          Object.assign(claim("lieju"), {
            publicationProfile: {
              city: "",
              contact: "张三",
              phone: "13800138000",
            },
          }),
        ),
      { code: "REGULAR_CONTENT_INVALID" },
    );
    assert.equal(calls.some((args) => args[0] === "goto"), false);
  } finally {
    loaded.restore();
  }
});

test("Lieju account inspection runs DOM lookup in the browser page context", async () => {
  const ready = loadBrowserAdapter("lieju", { identityReady: true });
  try {
    assert.deepEqual(await ready.adapter.inspectAccount(), {
      verified: true,
      remoteAccountId: "98765",
      displayName: "fixture-lieju-account",
    });
  } finally {
    ready.restore();
  }

  const missing = loadBrowserAdapter("lieju", { identityReady: false });
  try {
    assert.deepEqual(await missing.adapter.inspectAccount(), { verified: false });
  } finally {
    missing.restore();
  }
});

test("Lieju factory binds the injected runtime session and Playwright toolchain", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "regular-lieju-runtime-"));
  const browser = path.join(root, "browser");
  const stateFile = path.join(browser, "state", "lieju.json");
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, "{}", "utf8");
  const runtimeCalls = [];
  const sessionConfigs = [];
  const loaded = loadBrowserAdapter("lieju", {
    alive: false,
    identityReady: false,
    runtimeCalls,
    sessionConfigs,
  });
  try {
    const adapter = loaded.adapter.createPlatformAdapter(
      createPlatformRuntimeContextFromWorkspacePaths({
        browser,
        tmp: path.join(root, "tmp"),
        browserChannel: "chromium",
        playwrightCliJs: path.join(root, "playwright-cli.js"),
        playwrightNodeExecPath: path.join(root, "node.exe"),
      }),
    );

    await adapter.ensureAccountInspectionReady();

    assert.deepEqual(sessionConfigs[1], {
      session: "lieju",
      profileDir: path.join(browser, "profiles", "lieju"),
      daemonDir: path.join(browser, "sessions", "lieju"),
      stateFile,
    });
    const open = runtimeCalls.find((call) => call.args[0] === "open");
    assert.ok(open);
    assert.deepEqual(open.args, [
      "open",
      "https://ly.lieju.com",
      "--browser=chromium",
      "--headed",
      "--persistent",
      "--profile=" + path.join(browser, "profiles", "lieju"),
    ]);
    assert.equal(open.options.playwrightCli, path.join(root, "playwright-cli.js"));
    assert.equal(open.options.nodeExecPath, path.join(root, "node.exe"));
    assert.equal(open.options.browserChannel, "chromium");
    assert.equal(open.options.tempDir, path.join(root, "tmp"));
  } finally {
    loaded.restore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

for (const platformId of ["lieju", "toutiao"]) {
  test(`${platformId} returns uncertain when final submit cannot bind a remote identity`, async () => {
    const loaded = loadBrowserAdapter(platformId);
    try {
      const adapter =
        platformId === "lieju"
          ? loaded.adapter.createPlatformAdapter({
              postSubmitVerificationTimeoutMs: 0,
            })
          : loaded.adapter;
      const prepared = await adapter.preparePlatformSubmission(
        claim(platformId),
      );
      assert.deepEqual(await prepared.submitPreparedPublication(), {
        status: "uncertain",
        errorCode: "REMOTE_RESULT_UNKNOWN",
      });
    } finally {
      loaded.restore();
    }
  });
}

test("Lieju accepts only a verified article detail URL and records its remote ID", async () => {
  const loaded = loadBrowserAdapter("lieju", {
    postSubmitEvidence: {
      url: "https://ly.lieju.com/shanghai/123456.html",
      detailUrls: [],
      hasExplicitRejection: false,
      hasSubmissionForm: false,
    },
  });
  try {
    const adapter = loaded.adapter.createPlatformAdapter({
      postSubmitVerificationTimeoutMs: 0,
    });
    const prepared = await adapter.preparePlatformSubmission(claim("lieju"));
    assert.deepEqual(await prepared.submitPreparedPublication(), {
      status: "accepted",
      remoteId: "123456",
      remoteUrl: "https://ly.lieju.com/shanghai/123456.html",
    });
  } finally {
    loaded.restore();
  }
});

test("Lieju accepts a remote detail URL observed from the post-submit response", async () => {
  const detailUrl = "https://ly.lieju.com/shanghai/654321.html";
  const pageFixture = createLiejuPageFixture({
    onSubmit: ({ emitResponse }) => emitResponse(detailUrl),
  });
  const loaded = loadBrowserAdapter("lieju", { pageFixture });
  try {
    const adapter = loaded.adapter.createPlatformAdapter({
      postSubmitVerificationTimeoutMs: 0,
    });
    const prepared = await adapter.preparePlatformSubmission(claim("lieju"));
    assert.deepEqual(await prepared.submitPreparedPublication(), {
      status: "accepted",
      remoteId: "654321",
      remoteUrl: detailUrl,
    });
    assert.equal(
      pageFixture.events.filter((event) => event.type === "submit").length,
      1,
    );
  } finally {
    loaded.restore();
  }
});

test("Lieju maps an explicit form rejection to an article-level rejection", async () => {
  const loaded = loadBrowserAdapter("lieju", {
    postSubmitEvidence: {
      url: "https://post.lieju.com/117/239",
      detailUrls: [],
      hasExplicitRejection: true,
      hasSubmissionForm: true,
    },
  });
  try {
    const adapter = loaded.adapter.createPlatformAdapter({
      postSubmitVerificationTimeoutMs: 0,
    });
    const prepared = await adapter.preparePlatformSubmission(claim("lieju"));
    assert.deepEqual(await prepared.submitPreparedPublication(), {
      status: "article_rejected",
      errorCode: "REMOTE_REJECTED",
    });
  } finally {
    loaded.restore();
  }
});

test("Lieju maps an explicit browser rejection dialog to article_rejected", async () => {
  const pageFixture = createLiejuPageFixture({
    onSubmit: ({ emitDialog }) => emitDialog("标题不能为空"),
  });
  const loaded = loadBrowserAdapter("lieju", { pageFixture });
  try {
    const adapter = loaded.adapter.createPlatformAdapter({
      postSubmitVerificationTimeoutMs: 0,
    });
    const prepared = await adapter.preparePlatformSubmission(claim("lieju"));
    assert.deepEqual(await prepared.submitPreparedPublication(), {
      status: "article_rejected",
      errorCode: "REMOTE_REJECTED",
    });
    assert.ok(pageFixture.events.some((event) => event.type === "dialog-dismissed"));
  } finally {
    loaded.restore();
  }
});

test("Lieju keeps a generic success message uncertain without a remote identity", async () => {
  const loaded = loadBrowserAdapter("lieju", {
    postSubmitEvidence: {
      url: "https://post.lieju.com/117/239",
      detailUrls: [],
      hasExplicitRejection: false,
      hasSuccessMessage: true,
      hasSubmissionForm: false,
    },
  });
  try {
    const adapter = loaded.adapter.createPlatformAdapter({
      postSubmitVerificationTimeoutMs: 0,
    });
    const prepared = await adapter.preparePlatformSubmission(claim("lieju"));
    assert.deepEqual(await prepared.submitPreparedPublication(), {
      status: "uncertain",
      errorCode: "REMOTE_RESULT_UNKNOWN",
    });
  } finally {
    loaded.restore();
  }
});

test("Lieju keeps a success-looking page uncertain and does not submit twice", async () => {
  const pageFixture = createLiejuPageFixture({
    bodyText: "发布成功",
    formVisible: false,
  });
  const loaded = loadBrowserAdapter("lieju", { pageFixture });
  try {
    const adapter = loaded.adapter.createPlatformAdapter({
      postSubmitVerificationTimeoutMs: 0,
    });
    const prepared = await adapter.preparePlatformSubmission(claim("lieju"));
    const expected = {
      status: "uncertain",
      errorCode: "REMOTE_RESULT_UNKNOWN",
    };
    assert.deepEqual(await prepared.submitPreparedPublication(), expected);
    assert.deepEqual(await prepared.submitPreparedPublication(), expected);
    assert.equal(
      pageFixture.events.filter((event) => event.type === "submit").length,
      1,
    );
  } finally {
    loaded.restore();
  }
});
