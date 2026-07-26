const { createArticleStore } = require("../../src/content/article-store");
const { createContentStore } = require("../../src/content/content-store");
const { listClientIdentities } = require("../../src/content/client-knowledge");

// The workspace is the sole owner of the file-backed content implementation.
// Application services receive the logical ContentStore seam, never the
// ArticleStore's paths, journal or backup operations.
function createContentLifecycleComposition(options) {
  const value = options || {};
  if (typeof value.workspaceRoot !== "string" || !value.workspaceRoot.trim())
    throw new Error("CONTENT_COMPOSITION_WORKSPACE_REQUIRED");
  const articleStore = createArticleStore(value.workspaceRoot, {
    paths: value.paths,
  });
  const contentStore = createContentStore({
    articleStore,
    listClientIds: function () {
      return listClientIdentities(value.workspaceRoot).map(function (client) {
        return client.id;
      });
    },
  });
  return { contentStore };
}

module.exports = { createContentLifecycleComposition };
