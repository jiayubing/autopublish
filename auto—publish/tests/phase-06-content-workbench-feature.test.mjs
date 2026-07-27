import test from 'node:test';
import assert from 'node:assert/strict';

import { createContentWorkbenchFeature } from '../media-workbench/src/features/content/content-workbench-feature.js';

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

test('content workspace source query shares identity across initial manual and invalidation refresh', async () => {
  const firstClients = deferred();
  const firstCatalog = deferred();
  let call = 0;
  const feature = createContentWorkbenchFeature({
    listClients: () =>
      ++call === 1
        ? firstClients.promise
        : Promise.resolve([{ id: 'b', name: 'B' }]),
    listTemplateCatalog: () =>
      call === 1
        ? firstCatalog.promise
        : Promise.resolve({
            revision: 'r2',
            platforms: [],
            templates: [],
            diagnostics: [],
          }),
    listQuestions: async () => [],
    listResearch: async () => [],
    loadManagement: async () => ({}),
  });
  feature.setScope({ workspaceRuntimeId: 'runtime-1' });
  const initial = feature.refresh('initial');
  await feature.refresh('invalidation');
  firstClients.resolve([{ id: 'a', name: 'A' }]);
  firstCatalog.resolve({
    revision: 'r1',
    platforms: [],
    templates: [],
    diagnostics: [],
  });
  await initial;
  assert.deepEqual(feature.getSnapshot().clients, [{ id: 'b', name: 'B' }]);
  assert.equal(feature.getSnapshot().selectedClientId, 'b');
  assert.equal(feature.getSnapshot().query.loading, false);
});

test('content workspace feature owns client and current-article scope', async () => {
  const feature = createContentWorkbenchFeature({
    listClients: async () => [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
    listTemplateCatalog: async () => ({
      revision: 'r1',
      platforms: [],
      templates: [],
      diagnostics: [],
    }),
    listQuestions: async () => [],
    listResearch: async () => [],
    loadManagement: async () => ({}),
  });
  feature.setScope({ workspaceRuntimeId: 'runtime-1' });
  await feature.refresh('initial');
  feature.selectClient('b');
  feature.setCurrentArticle({ id: 'article-b', clientId: 'b', title: 'B' });
  assert.equal(feature.getSnapshot().selectedClientId, 'b');
  assert.equal(feature.getSnapshot().currentArticle.id, 'article-b');
  feature.selectClient('a');
  assert.equal(feature.getSnapshot().currentArticle, null);
});

test('content workspace switch clears articles and rejects the previous runtime management result', async () => {
  const runtimeAManagement = deferred();
  let activeRuntime = 'runtime-a';
  const feature = createContentWorkbenchFeature({
    listClients: async () => [
      {
        id: activeRuntime === 'runtime-a' ? 'client-a' : 'client-b',
        name: activeRuntime === 'runtime-a' ? 'A client' : 'B client',
      },
    ],
    listTemplateCatalog: async () => ({
      revision: activeRuntime,
      platforms: [],
      templates: [],
      diagnostics: [],
    }),
    listQuestions: async () => [],
    listResearch: async () => [],
    loadManagement: async (clientId) => {
      if (clientId === 'client-a') return runtimeAManagement.promise;
      return { articles: [{ id: 'article-b', clientId: 'client-b' }] };
    },
  });

  feature.setScope({ workspaceRuntimeId: 'runtime-a' });
  await feature.refreshSources('initial');
  const pendingRuntimeA = feature.refreshManagement('manual');

  activeRuntime = 'runtime-b';
  feature.setScope({ workspaceRuntimeId: 'runtime-b' });
  assert.deepEqual(feature.getSnapshot().management.articles, []);
  await feature.refresh('runtime-switch');
  assert.deepEqual(
    feature.getSnapshot().management.articles.map((article) => article.id),
    ['article-b'],
  );

  runtimeAManagement.resolve({
    articles: [{ id: 'article-a', clientId: 'client-a' }],
  });
  assert.equal(await pendingRuntimeA, false);
  assert.deepEqual(
    feature.getSnapshot().management.articles.map((article) => article.id),
    ['article-b'],
  );
});

test('content workspace owns each ordinary question mutation independently', async () => {
  let refreshes = 0;
  const feature = createContentWorkbenchFeature({
    listClients: async () => [{ id: 'a', name: 'A' }],
    listTemplateCatalog: async () => ({
      revision: 'r1',
      platforms: [],
      templates: [],
      diagnostics: [],
    }),
    listQuestions: async () => {
      refreshes += 1;
      return [];
    },
    listResearch: async () => [],
    loadManagement: async () => ({}),
    deleteQuestion: async () => ({ id: 'q1' }),
  });
  feature.setScope({ workspaceRuntimeId: 'runtime-1' });
  await feature.refresh('initial');

  await feature.commands.deleteQuestion({ clientId: 'a', questionId: 'q1' });

  assert.equal(feature.getSnapshot().commands.deleteQuestion.busy, false);
  assert.equal(feature.getSnapshot().commands.deleteQuestion.error, null);
  assert.ok(
    refreshes >= 2,
    'the named command refreshes the client snapshot itself',
  );
});

test('content workspace owns single-article submission preview and enqueue separately', async () => {
  const calls = [];
  const feature = createContentWorkbenchFeature({
    listClients: async () => [{ id: 'a', name: 'A' }],
    listTemplateCatalog: async () => ({
      revision: 'r1',
      platforms: [],
      templates: [],
      diagnostics: [],
    }),
    listQuestions: async () => [],
    listResearch: async () => [],
    loadManagement: async () => ({}),
    previewExport: async (input) => {
      calls.push(['preview', input]);
      return { filename: 'article.md' };
    },
    exportToSubmissionQueue: async (input) => {
      calls.push(['enqueue', input]);
      return { status: 'queued' };
    },
  });
  feature.setScope({ workspaceRuntimeId: 'runtime-1' });
  await feature.refresh('initial');

  await feature.commands.previewExport({
    clientId: 'a',
    generatedArticleId: 'article-a',
    targetPlatform: 'platform-a',
    confirmed: true,
  });
  await feature.commands.exportToSubmissionQueue({
    clientId: 'a',
    generatedArticleId: 'article-a',
    targetPlatform: 'platform-a',
    confirmed: true,
  });

  assert.deepEqual(
    calls.map(([name]) => name),
    ['preview', 'enqueue'],
  );
  assert.equal(feature.getSnapshot().commands.previewExport.busy, false);
  assert.equal(
    feature.getSnapshot().commands.exportToSubmissionQueue.busy,
    false,
  );
});

test('workspace-level content commands remain available when source loading has no selected client', async () => {
  const calls = [];
  const feature = createContentWorkbenchFeature({
    listClients: async () => {
      throw new Error('内容结果未通过安全校验，请刷新后重试。');
    },
    listTemplateCatalog: async () => ({
      revision: 'r1',
      platforms: [],
      templates: [],
      diagnostics: [],
    }),
    listQuestions: async () => [],
    listResearch: async () => [],
    loadManagement: async () => ({}),
    getDoubaoQueueState: async () => {
      calls.push('queue');
      return { status: 'idle' };
    },
    createQuestion: async () =>
      assert.fail('client command must remain fenced'),
  });
  feature.setScope({ workspaceRuntimeId: 'runtime-1' });
  assert.equal(await feature.refresh('initial'), false);

  assert.deepEqual(await feature.commands.getDoubaoQueueState(), {
    status: 'idle',
  });
  assert.deepEqual(calls, ['queue']);
  await assert.rejects(
    feature.commands.createQuestion({ text: '问题' }),
    /Content command is unavailable/,
  );
});
