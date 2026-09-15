const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createArticleStore } = require("../../src/content/article-store");
const { createContentStore } = require("../../src/content/content-store");
const {
  createArticleMutationCoordinator,
} = require("../../src/content/article-mutation-coordinator");
const {
  createArticleRemovalTransactionStore,
} = require("../../src/content/article-removal-transaction-store");
const {
  createArticleTrashService,
} = require("../../src/content/article-trash-service");

function article(id = "a") {
  return {
    id,
    clientId: "client",
    title: "Title " + id,
    content: "Body " + id,
    status: "generated",
    platform: "fixture",
    scenario: "guide",
    templateId: "template",
    researchQueryIds: ["q"],
    researchSnapshots: [
      {
        questionId: "q",
        question: "Question",
        answerText: "Answer",
        references: [],
        collectedAt: "2026-09-16T00:00:00.000Z",
        collectionMethod: "manual",
      },
    ],
    source: {
      client_material: false,
      doubao_answer: false,
      references: false,
      template: true,
    },
    createdAt: "2026-09-16T00:00:00.000Z",
  };
}
function fixture(options = {}) {
  const root =
    options.root || fs.mkdtempSync(path.join(os.tmpdir(), "trash-use-case-"));
  const store = createArticleStore(root, {
    fs: options.fs,
    internalArticleFileFault: options.fileFault,
    internalArticleLockFault: options.lockFault,
  });
  const content = createContentStore({
    articleStore: store,
    listClientIds: () => ["client"],
  });
  const intents = createArticleRemovalTransactionStore({
    workspaceRoot: root,
    atomicWriter: options.atomicWriter,
  });
  let facts = {};
  const coordinator = createArticleMutationCoordinator({
    articleStore: content,
    contentStore: content,
    lifecycleFacts: { listArticleLifecycleFacts: () => facts },
    removalTransactionStore: intents,
  });
  const service = createArticleTrashService({
    workspaceRoot: root,
    contentStore: content,
    mutationCoordinator: coordinator,
    transactionStore: intents,
    onTransactionStatus: options.onTransactionStatus,
  });
  function preview(ids = ["a"]) {
    return service.previewTrashArticles({
      selections: ids.map((articleId) => ({ clientId: "client", articleId })),
    });
  }
  function commit(prepared = preview()) {
    return service.trashArticles({
      selections: prepared.selections,
      token: prepared.token,
      confirmed: true,
    });
  }
  return {
    root,
    store,
    content,
    intents,
    coordinator,
    service,
    preview,
    commit,
    setFacts(value) {
      facts = value;
    },
    close() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
module.exports = { fixture, article };
