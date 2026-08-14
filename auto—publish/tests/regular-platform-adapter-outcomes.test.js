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
  return {
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
        if (source.includes("page.url()"))
          return "https://mp.toutiao.com/profile_v4/graphic/publish";
        if (source.includes("targetCity")) return "北京";
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

test("Lieju fills the customer publication profile passed by preparation", async () => {
  const codeSources = [];
  const loaded = loadBrowserAdapter("lieju", { codeSources });
  try {
    await loaded.adapter.preparePlatformSubmission(Object.assign(claim("lieju"), {
      publicationProfile: { city: "上海", contact: "张三", phone: "13800138000" },
    }));
    const source = codeSources.join("\n");
    assert.match(source, /targetCity = "上海"/);
    assert.match(source, /#atc_linkman'\)\.fill\("张三"\)/);
    assert.match(source, /#atc_mobphone'\)\.fill\("13800138000"\)/);
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
      const prepared = await loaded.adapter.preparePlatformSubmission(
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
