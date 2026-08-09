"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

function claim(platformId) {
  return {
    platformId,
    regularPublicationAttemptId: `attempt-${platformId}`,
    articleIdentityV1: {
      version: 1,
      clientId: "client-browser-evidence",
      articleId: `article-${platformId}`,
    },
    targetIdentityV1: {
      version: 1,
      kind: "platform",
      platformId,
      accountProfileId: `account-${platformId}`,
    },
    publicationSnapshot: {
      title: "合成浏览器标题",
      body: "合成浏览器正文",
    },
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

test("browser adapters bind prepared input and keep an unbound submit uncertain", async () => {
  for (const platformId of ["lieju", "toutiao"]) {
    const loaded = loadBrowserAdapter(platformId);
    try {
      const prepared = await loaded.adapter.preparePlatformSubmission(
        claim(platformId),
      );
      assert.equal(
        prepared.preparedSubmissionEvidenceV1.targetIdentityV1.platformId,
        platformId,
      );
      assert.equal(
        prepared.preparedSubmissionEvidenceV1.attemptId,
        `attempt-${platformId}`,
      );
      assert.deepEqual(await prepared.submitPreparedPublication(), {
        status: "uncertain",
        errorCode: "REMOTE_RESULT_UNKNOWN",
      });
    } finally {
      loaded.restore();
    }
  }
});
