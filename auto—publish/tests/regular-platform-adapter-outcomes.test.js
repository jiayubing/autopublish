"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createHepanAdapter } = require("../src/platforms/hepan/adapter");

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

function loadBrowserAdapter(platformId) {
  const playwrightPath = require.resolve("../src/core/playwright");
  const adapterPath = require.resolve(`../src/platforms/${platformId}/adapter`);
  const previousPlaywright = require.cache[playwrightPath];
  const previousAdapter = require.cache[adapterPath];
  require.cache[playwrightPath] = {
    id: playwrightPath,
    filename: playwrightPath,
    loaded: true,
    exports: {
      pwSessionConfig: () => ({ id: `synthetic-${platformId}` }),
      pwInvokeSync: () => true,
      runCode(source) {
        if (source.includes("page.url()"))
          return "https://mp.toutiao.com/profile_v4/graphic/publish";
        if (source.includes("targetCity")) return "北京";
        return true;
      },
    },
  };
  delete require.cache[adapterPath];
  const adapter = require(adapterPath);
  return {
    adapter,
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
