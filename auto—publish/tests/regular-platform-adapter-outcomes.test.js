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

function imagePlan() {
  return Object.freeze({
    requestedCount: 1,
    selectedCount: 1,
    textOnly: false,
    images: Object.freeze([
      Object.freeze({
        imageId: "client-image:adapter-contract",
        name: "adapter-contract.png",
        extension: ".png",
        mimeType: "image/png",
        width: 80,
        height: 40,
        size: 120,
      }),
    ]),
    warnings: Object.freeze([]),
  });
}

function createLiejuAccountInspectionPageFixture() {
  const currentUrl = "https://post.lieju.com/117/239";
  const accountUrl = "https://www.lieju.com/member/upage.php";
  const accountHomeNode = {
    getAttribute(name) {
      if (name === "href") return "https://www.lieju.com/u759917";
      return null;
    },
    textContent: "fixture-home",
    parentElement: { className: "" },
  };
  const accountNode = {
    getAttribute(name) {
      if (name === "href") return "https://www.lieju.com/u759917";
      return null;
    },
    textContent: "fixture-lieju-account",
    parentElement: { className: "m3" },
  };

  function createDocument(nodes) {
    return {
      querySelectorAll(selector) {
        if (selector === 'a[href*="action=quit"]') return [{}];
        if (selector === "a[href]") return nodes;
        if (selector === 'a[href^="/u"]') return [];
        return [];
      },
      querySelector() {
        return null;
      },
    };
  }

  function createPage(document, url) {
    const page = {
      locator(selector) {
        const api = {
          first: () => api,
          count: () => (selector.includes("action=quit") ? 1 : 0),
        };
        return api;
      },
      evaluate(callback, selectors) {
        return new Function(
          "document",
          "location",
          "URL",
          "selectors",
          "return (" + callback.toString() + ")(selectors);",
        )(document, { href: url }, URL, selectors);
      },
      context() {
        return {
          newPage: () =>
            createPage(
              createDocument([accountHomeNode, accountNode]),
              accountUrl,
            ),
        };
      },
      goto() {},
      waitForLoadState() {},
      close() {},
      url: () => url,
    };
    return page;
  }

  const currentDocument = createDocument([]);
  const currentPage = createPage(currentDocument, currentUrl);
  return {
    currentUrl,
    execute(source) {
      return new Function(
        "page",
        "document",
        "URL",
        source.replace(/\bawait\s+/g, ""),
      )(currentPage, currentDocument, URL);
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
          stateFile:
            requested.stateFile || value.stateFile || "synthetic-state.json",
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
        if (
          value.pageFixture &&
          typeof value.pageFixture.execute === "function"
        )
          return value.pageFixture.execute(source);
        if (source.includes("page.url()"))
          return (
            value.postSubmitEvidence ||
            "https://mp.toutiao.com/profile_v4/graphic/publish"
          );
        if (source.includes("targetCity") && !value.pageFixture) return "北京";
        if (platformId === "lieju" && source.includes("page.evaluate")) {
          const node = identityReady
            ? {
                getAttribute: (name) =>
                  name === "href" ? "https://www.lieju.com/u98765" : null,
                textContent: "fixture-lieju-account",
              }
            : null;
          const createDocument = (accountNode) => ({
            querySelector: () => accountNode,
            querySelectorAll: (selector) => {
              if (selector === "a[href]")
                return accountNode ? [accountNode] : [];
              if (selector.includes("action=quit")) return [{}];
              return [];
            },
          });
          const createPage = (document, url) => ({
            locator: (selector) => {
              const api = {
                first: () => api,
                count: () => (selector.includes("action=quit") ? 1 : 0),
              };
              return api;
            },
            evaluate: (callback, selectors) =>
              new Function(
                "document",
                "location",
                "URL",
                "selectors",
                "return (" + callback.toString() + ")(selectors);",
              )(document, { href: url }, URL, selectors),
            context: () => ({
              newPage: () =>
                createPage(
                  createDocument(identityReady ? node : null),
                  "https://www.lieju.com/member/upage.php",
                ),
            }),
            goto: () => undefined,
            waitForLoadState: () => undefined,
            close: () => undefined,
          });
          const document = createDocument(node);
          const page = createPage(document, "https://post.lieju.com/117/239");
          return new Function(
            "page",
            "document",
            "URL",
            source.replace(/\bawait\s+/g, ""),
          )(page, document, URL);
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
  const adapterModule = require(adapterPath);
  const adapter = platformId === "toutiao" ? adapterModule.createPlatformAdapter() : adapterModule;
  return {
    adapter,
    runtimeCalls,
    sessionConfigs,
    restore() {
      if (typeof adapter.closeSession === "function") adapter.closeSession();
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
    const prepared = await adapter.preparePlatformSubmission(
      claim("hepan"),
      imagePlan(),
    );
    assert.deepEqual(
      {
        deliveryMode: prepared.preparedSubmissionEvidenceV1.deliveryMode,
        images: prepared.preparedSubmissionEvidenceV1.images,
        decisionKind: prepared.preparedSubmissionEvidenceV1.decisionKind,
      },
      { deliveryMode: "text_only", images: [], decisionKind: "initial" },
    );
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
      const adapter =
        platformId === "lieju"
          ? loaded.adapter.createPlatformAdapter({
              liejuSubmissionMode: "playwright_only",
            })
          : loaded.adapter;
      await adapter.ensureAccountInspectionReady({
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
      if (platformId === "lieju")
        assert.deepEqual(calls[gotoIndex], [
          "goto",
          "https://www.lieju.com/member/upage.php",
        ]);

      calls.splice(0, calls.length);
      await adapter.ensureAccountInspectionReady({
        targetPlatformId: platformId,
        accountProfileId: "account-browser-ready",
        preserveCurrentPage: true,
      });
      assert.equal(
        calls.some((args) => args[0] === "goto"),
        false,
      );
    } finally {
      loaded.restore();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
}

test("Lieju rejects an incomplete publication profile before opening the remote form", async () => {
  const calls = [];
  const loaded = loadBrowserAdapter("lieju", { calls });
  try {
    const adapter = loaded.adapter.createPlatformAdapter({ liejuSubmissionMode: "playwright_only" });
    await assert.rejects(
      () =>
        adapter.preparePlatformSubmission(
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
    assert.equal(
      calls.some((args) => args[0] === "goto"),
      false,
    );
  } finally {
    loaded.restore();
  }
});

test("Lieju account inspection runs DOM lookup in the browser page context", async () => {
  const ready = loadBrowserAdapter("lieju", { identityReady: true });
  try {
    const adapter = ready.adapter.createPlatformAdapter({ liejuSubmissionMode: "playwright_only" });
    assert.deepEqual(await adapter.inspectAccount(), {
      verified: true,
      remoteAccountId: "98765",
      displayName: "fixture-lieju-account",
    });
  } finally {
    ready.restore();
  }

  const missing = loadBrowserAdapter("lieju", { identityReady: false });
  try {
    const adapter = missing.adapter.createPlatformAdapter({ liejuSubmissionMode: "playwright_only" });
    assert.deepEqual(await adapter.inspectAccount(), {
      verified: false,
    });
  } finally {
    missing.restore();
  }
});

test("Lieju account inspection reads the current public account link without replacing the publish page", async () => {
  const pageFixture = createLiejuAccountInspectionPageFixture();
  const loaded = loadBrowserAdapter("lieju", { pageFixture });
  try {
    const adapter = loaded.adapter.createPlatformAdapter({ liejuSubmissionMode: "playwright_only" });
    assert.deepEqual(await adapter.inspectAccount(), {
      verified: true,
      remoteAccountId: "759917",
      displayName: "fixture-lieju-account",
    });
    assert.equal(pageFixture.currentUrl, "https://post.lieju.com/117/239");
  } finally {
    loaded.restore();
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
    const adapter = loaded.adapter.createPlatformAdapter({
      ...createPlatformRuntimeContextFromWorkspacePaths({
        browser,
        tmp: path.join(root, "tmp"),
        browserChannel: "chromium",
        playwrightCliJs: path.join(root, "playwright-cli.js"),
        playwrightNodeExecPath: path.join(root, "node.exe"),
      }),
      liejuSubmissionMode: "playwright_only",
    });

    await adapter.ensureAccountInspectionReady();

    assert.deepEqual(sessionConfigs[0], {
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
    assert.equal(
      open.options.playwrightCli,
      path.join(root, "playwright-cli.js"),
    );
    assert.equal(open.options.nodeExecPath, path.join(root, "node.exe"));
    assert.equal(open.options.browserChannel, "chromium");
    assert.equal(open.options.tempDir, path.join(root, "tmp"));
  } finally {
    loaded.restore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("toutiao returns uncertain when final submit cannot bind a remote identity", async () => {
  const loaded = loadBrowserAdapter("toutiao");
  try {
    const prepared = await loaded.adapter.preparePlatformSubmission(
      claim("toutiao"),
      imagePlan(),
    );
    assert.deepEqual(await prepared.submitPreparedPublication(), {
      status: "uncertain",
      errorCode: "REMOTE_RESULT_UNKNOWN",
    });
  } finally {
    loaded.restore();
  }
});
