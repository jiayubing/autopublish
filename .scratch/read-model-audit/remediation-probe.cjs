const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const app = path.resolve(__dirname, '../../auto—publish');
const { createArticleStore } = require(path.join(app, 'src/content/article-store'));
const { createContentStore } = require(path.join(app, 'src/content/content-store'));
const { createArticleManagementSnapshot } = require(path.join(app, 'desktop/services/article-management-snapshot'));
const { createArticleAttentionQuery } = require(path.join(app, 'desktop/services/article-attention-query'));
const { createRegularSubmissionPermissionQuery } = require(path.join(app, 'desktop/services/regular-submission-permission-query'));
const { createWorkspaceDataInvalidation } = require(path.join(app, 'desktop/workspace-data-invalidation'));

(async () => {
  for (const count of [100, 1000]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'read-model-audit-'));
    let reads = [];
    const io = new Proxy(fs, { get(target, key) {
      if (key !== 'readFileSync') return target[key];
      return (...args) => { reads.push(String(args[0])); return target.readFileSync(...args); };
    }});
    try {
      let content = createContentStore({ articleStore: createArticleStore(root, { fs: io }), listClientIds: () => ['a', 'b'] });
      for (const clientId of ['a', 'b']) for (let i = 0; i < count; i++) {
        content.createArticle({ id: `${clientId}-${i}`, clientId, generationTaskId: `task-${clientId}-${i}`, title: `Title ${i}`, content: 'x'.repeat(4096), status: 'generated', createdAt: '2026-09-12T00:00:00.000Z' });
      }
      content = createContentStore({ articleStore: createArticleStore(root, { fs: io }), listClientIds: () => ["a", "b"] });
      const invalidation = createWorkspaceDataInvalidation({ workspaceRuntimeId: 'audit' });
      const facts = { listArticleLifecycleFacts: () => ({ publications: [], orders: [], submissionItems: [] }) };
      const makeAttention = () => createArticleAttentionQuery({ getRevision: invalidation.getRevision, readers: {
        getArticle: content.getArticleSummary, getTrashedTombstone: content.getTrashedTombstone,
      }});
      async function measure(label, action) {
        reads = [];
        const start = performance.now();
        const result = await action();
        const elapsedMs = performance.now() - start;
        const articleReads = reads.filter(file => !file.endsWith('owner.json'));
        console.log(JSON.stringify({ label, countPerClient: count, totalArticles: count * 2,
          fileReads: reads.length, articleReads: articleReads.length,
          markdownReads: articleReads.filter(file => file.endsWith('.md')).length,
          returnBytes: Buffer.byteLength(JSON.stringify(result)), elapsedMs: Number(elapsedMs.toFixed(2)) }));
        return result;
      }
      assert.equal(await measure('title-cold', () => content.getGenerationTaskArticleTitle('task-a-0', { clientId: 'a', articleId: 'a-0' })), 'Title 0');
      assert.equal(await measure('title-hit', () => content.getGenerationTaskArticleTitle('task-a-0', { clientId: 'a', articleId: 'a-0' })), 'Title 0');
      const attention = makeAttention();
      assert.equal((await measure('attention-empty-cold', () => attention.list({ clientId: 'a' }))).items.length, 0);
      const management = createArticleManagementSnapshot({ listArticles: content.listArticleSummaries, listTrash: content.listTrashedArticles,
        getRevision: invalidation.getRevision, getCacheRevision: invalidation.getArticleReadRevision, operationalStore: facts, articleAttentionQuery: makeAttention() });
      const snapshot = await measure('management-with-attention-cold', () => management.get({ clientId: 'a' }));
      assert.equal(snapshot.articles.length, count);
      assert.equal(snapshot.articles[0].hasContent, true);
      assert.equal("content" in snapshot.articles[0], false);
      await measure('management-hit', () => management.get({ clientId: 'a' }));
      invalidation.invalidate('CONTENT_QUESTION_UPDATED');
      await measure('management-after-unrelated-revision', () => management.get({ clientId: 'a' }));
      const permission = createRegularSubmissionPermissionQuery({ contentStore: content, operationalStore: facts,
        getRevision: invalidation.getRevision, articleAttentionQuery: makeAttention() });
      assert.equal((await measure('permission-one-cold', () => permission.list({ clientId: 'a', articleIds: ['a-0'] }))).items[0].allowed, true);
    } finally {
      const resolved = path.resolve(root);
      assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
      assert.ok(path.basename(resolved).startsWith('read-model-audit-'));
      fs.rmSync(resolved, { recursive: true, force: true });
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
