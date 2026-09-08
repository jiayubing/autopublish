const assert = require("node:assert/strict");
const { it } = require("node:test");
const { createArticleManagementSnapshot } = require("../desktop/services/article-management-snapshot");

const article = (clientId, title = "Original") => ({
  id: "article-shared", clientId, title, content: "Synthetic body", status: "generated",
});
const publication = (clientId) => ({
  publicationId: "publication-shared", articleId: "article-shared", clientId,
  status: "published", attempts: [{ attemptId: "attempt-shared", status: "published", remoteId: "remote-original" }],
});

it("snapshot callers and source owners cannot mutate another cached response", async () => {
  const articles = [article("client-a")];
  const records = [publication("client-a")];
  const service = createArticleManagementSnapshot({
    listArticles: () => articles,
    listPublications: () => records,
    listTrash: () => [{ articleId: "trash-a", clientId: "client-a", titleSnapshot: "Trash" }],
    submissionPlatformDirectory: { list: () => [{ id: "hepan", displayName: "Platform" }] },
  });
  const first = await service.get("client-a");
  const expected = JSON.parse(JSON.stringify(first));
  first.articles[0].title = "Caller mutation";
  first.trash.length = 0;
  first.publicationRecords[0].attempts[0].remoteId = "caller-remote";
  first.workflowByArticle["article-shared"].operations.submit.allowed = true;
  first.workflowByArticle["article-shared"].operations.submit.reasonCodes.length = 0;
  first.submissionPlatforms[0].displayName = "Caller platform";
  const hit = await service.get("client-a");
  assert.deepEqual(hit, expected);
  hit.lifecycleCounts.published = 0;
  hit.publicationRecords.length = 0;
  articles[0].title = "Source update";
  records[0].attempts[0].remoteId = "source-remote";
  assert.deepEqual(await service.get("client-a"), expected);
  service.invalidate();
  const refreshed = await service.get("client-a");
  assert.equal(refreshed.articles[0].title, "Source update");
  assert.equal(refreshed.publicationRecords[0].remoteId, "source-remote");
  assert.equal(refreshed.workflowByArticle["article-shared"].operations.submit.allowed, false);
});

it("overlapping identities stay scoped and a shared revision refreshes every affected client", async () => {
  function workspace(name) {
    const state = { revision: 1, published: false };
    const service = createArticleManagementSnapshot({
      workspaceIdentity: name,
      getRevision: () => state.revision,
      listArticles: (clientId) => [article(clientId, `${name}:${clientId}`)],
      listLifecycleFacts: (clientId) => ({
        publications: state.published ? [publication(clientId)] : [],
        submissionItems: [], orders: [],
      }),
    });
    return { service, state };
  }
  const first = workspace("workspace-a");
  const other = workspace("workspace-b");
  for (const clientId of ["client-a", "client-b"]) {
    const a = await first.service.get(clientId);
    const b = await other.service.get(clientId);
    assert.equal(a.articles[0].title, `workspace-a:${clientId}`);
    assert.equal(b.articles[0].title, `workspace-b:${clientId}`);
    assert.equal(a.workflowByArticle["article-shared"].stage, "pending_submission");
    assert.equal(b.workflowByArticle["article-shared"].stage, "pending_submission");
  }
  first.state.published = true;
  first.state.revision += 1;
  for (const clientId of ["client-a", "client-b"]) {
    const current = await first.service.get(clientId);
    assert.equal(current.revision, 2);
    assert.equal(current.workflowByArticle["article-shared"].stage, "published");
    assert.equal(current.workflowByArticle["article-shared"].operations.edit.allowed, false);
    assert.equal(current.workflowByArticle["article-shared"].operations.submit.allowed, false);
    assert.equal(current.workflowByArticle["article-shared"].operations.trash.allowed, false);
    assert.equal((await other.service.get(clientId)).workflowByArticle["article-shared"].stage, "pending_submission");
  }
});

it("retains only the latest cached revision for each client", async () => {
  let revision = 1;
  const service = createArticleManagementSnapshot({
    getRevision: () => revision,
    listArticles: (clientId) => [article(clientId, `revision-${revision}`)],
  });

  await service.get("client-a");
  revision = 2;
  await service.get("client-a");
  revision = 3;
  await service.get("client-a");
  await service.get("client-b");

  assert.equal(service.cacheSize(), 2);
});

it("late reads converge to the new revision and repeated revision changes still reject", async () => {
  let revision = 1;
  let reads = 0;
  let release;
  let started;
  const gate = new Promise((resolve) => { release = resolve; });
  const entered = new Promise((resolve) => { started = resolve; });
  const service = createArticleManagementSnapshot({
    getRevision: () => revision,
    listArticles: (clientId) => [article(clientId, `revision-${revision}`)],
    listLifecycleFacts: async () => {
      reads += 1;
      if (reads === 1) { started(); await gate; }
      return { publications: [], submissionItems: [], orders: [] };
    },
  });
  const late = service.get("client-a");
  await entered;
  revision += 1;
  const current = await service.get("client-a");
  release();
  assert.equal(current.articles[0].title, "revision-2");
  assert.deepEqual(await late, current);
  assert.deepEqual(await service.get("client-a"), current);
  const changing = createArticleManagementSnapshot({
    getRevision: () => revision,
    listArticles: (clientId) => { revision += 1; return [article(clientId)]; },
  });
  await assert.rejects(changing.get("client-a"), { code: "ARTICLE_MANAGEMENT_SNAPSHOT_STALE" });
  assert.equal(changing.cacheSize(), 0);
});

it("failed identity, publication, order or archive reads never become empty cached facts", async () => {
  let revision = 1;
  let failing = null;
  let failure;
  let archives = [];
  const read = (source, value) => {
    if (source === failing) throw failure;
    return value;
  };
  const service = createArticleManagementSnapshot({
    getRevision: () => revision,
    listArticles: () => read("identity", [article("client-a")]),
    operationalStore: {
      listArticleLifecycleFacts: () => read("facts", {
        publications: [publication("client-a")], submissionItems: [], orders: [],
      }),
    },
    publishedArchiveQueries: { listPublishedArchives: () => read("archives", archives) },
  });
  await service.get("client-a");
  for (const [source, code] of [
    ["identity", "ARTICLE_IDENTITY_INDEX_INVALID"],
    ["facts", "PUBLICATION_SUCCESS_EVIDENCE_INVALID"],
    ["facts", "ORDER_HISTORY_V1_INVALID"],
    ["archives", "PUBLICATION_ARCHIVE_EVIDENCE_INVALID"],
  ]) {
    revision += 1;
    failing = source;
    failure = Object.assign(new Error("Synthetic read failure"), { code });
    const size = service.cacheSize();
    await assert.rejects(service.get("client-a"), { code });
    await assert.rejects(service.get("client-a"), { code });
    assert.equal(service.cacheSize(), size);
    failing = null;
    const recovered = await service.get("client-a");
    assert.equal(recovered.workflowByArticle["article-shared"].stage, "published");
    for (const action of ["submit", "edit", "trash"])
      assert.equal(recovered.workflowByArticle["article-shared"].operations[action].allowed, false);
  }
  // Irrelevant archives are filtered; a malformed matching archive must still fail closed.
  archives = [{ publicationEvidence: { articleIdentityV1: { articleId: "outside-selection" } } }];
  revision += 1;
  assert.equal((await service.get("client-a")).publishedArchives.length, 0);
  archives[0].publicationEvidence.articleIdentityV1.articleId = "article-shared";
  revision += 1;
  await assert.rejects(service.get("client-a"), { code: "ARTICLE_MANAGEMENT_PUBLICATION_ARCHIVE_INVALID" });
});
