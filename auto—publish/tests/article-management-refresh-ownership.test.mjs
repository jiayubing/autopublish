import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createArticleManagementFeature } from "../media-workbench/src/features/content/article-management-feature.js";
import { createWorkspaceCoordinator } from "../media-workbench/src/features/workspace/workspace-coordinator.js";

const require = createRequire(import.meta.url);
const { createWorkspaceDataInvalidation } = require("../desktop/workspace-data-invalidation.js");
const settle = () => new Promise(setImmediate);
const mutations = [
  ["saveArticle", "ARTICLE_SAVED"],
  ["admitRegularQueueItems", "SUBMISSION_BATCH_CREATED"],
  ["startRegularQueueGroup", "REGULAR_QUEUE_GROUP_RUN_INTENT_CHANGED"],
  ["confirmPaidMediaBatch", "SUBMISSION_BATCH_CREATED"],
  ["restoreContentArticle", "ARTICLE_RESTORED"],
  ["permanentlyDeleteContentArticle", "ARTICLE_PERMANENTLY_DELETED"],
  ["saveArticle", "ARTICLE_EDIT_CONFLICT", true],
  ["saveArticle", "ARTICLE_MUTATION_RESULT_UNCERTAIN", true],
];

for (const [command, reason, fails] of mutations) {
  for (const timing of ["before-result", "after-result"]) {
    test(`${command} (${reason}): invalidation ${timing} is the only management refresh`, async () => {
      let consume;
      let loads = 0;
      let revision = 0;
      const result = { id: "article-a", clientId: "client-a" };
      const invalidation = createWorkspaceDataInvalidation({
        workspaceRuntimeId: "runtime-a",
        sendToRenderer: (_channel, event) => consume(event),
      });
      const feature = createArticleManagementFeature({
        loadManagement: async () => {
          loads++;
          return { revision, articles: [{ ...result, title: `revision-${revision}` }] };
        },
        [command]: async () => {
          revision++;
          if (timing === "before-result") {
            invalidation.invalidate(reason);
            await settle(); // Also cover a query finishing before command completion.
          }
          if (fails) throw Object.assign(new Error("synthetic"), { code: reason });
          return result;
        },
      });
      const coordinator = createWorkspaceCoordinator({
        subscribe(listener) { consume = listener; return () => {}; },
      });
      coordinator.register("articleManagement", (event) =>
        feature.refreshManagement(event.kind),
      );
      coordinator.start();
      feature.setScope({ workspaceRuntimeId: "runtime-a", clientId: "client-a" });
      await feature.refreshManagement("initial");
      let savedArticle;
      feature.setArticleResultHandler((article) => { savedArticle = article; });
      const pending = feature.commands[command]({ clientId: "client-a" });
      if (fails) await assert.rejects(pending, { code: reason });
      else assert.deepEqual(await pending, result);
      if (timing === "after-result") {
        assert.equal(loads, 1, "command completion must not query");
        invalidation.invalidate(reason);
      }
      await settle();
      assert.equal(loads, 2, "one initial query plus one invalidation query");
      assert.equal(feature.getSnapshot().management.articles[0].title, "revision-1");
      assert.equal(feature.getSnapshot().commands[command].busy, false);
      if (fails) assert.equal(feature.getSnapshot().commands[command].error.code, reason);
      else assert.equal(feature.getSnapshot().commands[command].error, null);
      if (command === "saveArticle" && !fails) assert.deepEqual(savedArticle, result);
      coordinator.dispose();
      feature.dispose();
    });
  }
}

for (const stale of [false, true]) {
  for (const fails of [false, true]) {
    test(`command completion does not query on stale=${stale}, failure=${fails}`, async () => {
      let finish;
      let loads = 0;
      const feature = createArticleManagementFeature({
        loadManagement: async () => { loads++; return {}; },
        saveArticle: () => new Promise((resolve, reject) => {
          finish = () => fails ? reject(new Error("synthetic failure")) : resolve({ id: "a" });
        }),
      });
      feature.setScope({ workspaceRuntimeId: "runtime-a", clientId: "client-a" });
      await feature.refreshManagement("initial");
      const pending = feature.commands.saveArticle({ clientId: "client-a" });
      assert.equal(feature.getSnapshot().commands.saveArticle.busy, true);
      if (stale) feature.setScope({ workspaceRuntimeId: "runtime-b", clientId: "client-b" });
      finish();
      if (fails && !stale) await assert.rejects(pending, /synthetic failure/);
      else await pending;
      assert.equal(loads, 1);
      assert.equal(feature.getSnapshot().commands.saveArticle.busy, false);
      if (fails && !stale) assert.equal(feature.getSnapshot().commands.saveArticle.error.code, "CONTENT_MANAGEMENT_FAILED");
      feature.dispose();
    });
  }
}
