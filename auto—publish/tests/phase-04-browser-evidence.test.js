"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
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
    publicationProfile: {
      city: "北京",
      contact: "合成联系人",
      phone: "13800000000",
    },
  };
}

function loadBrowserAdapter(platformId) {
  const playwrightPath = require.resolve("../src/core/playwright");
  const adapterPath = require.resolve(`../src/platforms/${platformId}/adapter`);
  const previousPlaywright = require.cache[playwrightPath];
  const previousAdapter = require.cache[adapterPath];
  const stateFile = path.join(
    os.tmpdir(),
    `phase-04-browser-${platformId}-${process.pid}-${Date.now()}.json`,
  );
  let browserAlive = false;
  let currentUrl = "";
  require.cache[playwrightPath] = {
    id: playwrightPath,
    filename: playwrightPath,
    loaded: true,
    exports: {
      pwSessionConfig: () => ({
        id: `synthetic-${platformId}`,
        session: `synthetic-${platformId}`,
      }),
      pwInvokeSync(commandArgs) {
        const command = commandArgs[0];
        if (command === "list")
          return browserAlive ? `synthetic-${platformId}` : "";
        if (command === "open") {
          browserAlive = true;
          return true;
        }
        if (command === "close") {
          browserAlive = false;
          return true;
        }
        if (command === "goto") {
          currentUrl = commandArgs[1];
          return true;
        }
        return true;
      },
      runCode(source) {
        if (source.includes("page.content()")) {
          if (currentUrl.includes("city.php"))
            return '<a href="https://post.lieju.com/1/239">北京</a>';
          return [
            '<form method="post" enctype="multipart/form-data" action="https://post.lieju.com/1/239?action=postnew">',
            '<input name="postdb[title]" value="">',
            '<textarea name="postdb[content]"></textarea>',
            '<input name="postdb[mobphone]" value="">',
            '<input name="postdb[linkman]" value="">',
            '<select name="postdb[zone_id]"><option value="">请选择</option><option value="1">城区</option></select>',
            "</form>",
          ].join("");
        }
        if (source.includes("page.url()"))
          return currentUrl;
        if (source.includes("targetCity")) return "北京";
        return true;
      },
    },
  };
  delete require.cache[adapterPath];
  const adapterModule = require(adapterPath);
  const adapter =
    platformId === "lieju" &&
    typeof adapterModule.createPlatformAdapter === "function"
      ? adapterModule.createPlatformAdapter({
          browserRuntime: {
            stateFile,
          },
          liejuSubmissionMode: "playwright_only",
        })
      : adapterModule;
  return {
    adapter,
    restore() {
      fs.rmSync(stateFile, { force: true });
      fs.rmSync(stateFile + ".autopublish-lease", { force: true });
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
      if (platformId === "lieju") await loaded.adapter.closeSession();
      loaded.restore();
    }
  }
});
