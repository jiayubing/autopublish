import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createMediaFeature, DEFAULT_RESOURCE_PAGE_SIZE } from '../media-workbench/src/features/media/media-feature.js';

function syntheticPage(total, page, pageSize) {
  const start = (page - 1) * pageSize;
  return {
    items: Array.from({ length: Math.max(0, Math.min(pageSize, total - start)) }, (_, index) => ({
      resourceId: `resource-${start + index + 1}`,
      name: `Synthetic resource ${start + index + 1}`,
      type: 'image',
      price: 1,
    })),
    total,
    page,
    pageSize,
  };
}

describe('Phase 06 media Renderer capacity', function() {
  for (const total of [1_000, 10_000, 13_000, 20_000]) {
    it(`keeps the Renderer snapshot bounded to one page at ${total.toLocaleString()} resources`, async function(t) {
      let requestCount = 0;
      const before = process.memoryUsage().heapUsed;
      const startedAt = performance.now();
      const feature = createMediaFeature({
        getResourcePage: async ({ page, pageSize }) => {
          requestCount += 1;
          // The renderer must retain its own hard page boundary even if an
          // adapter is faulty; production IPC independently rejects >100.
          return syntheticPage(total, page, total);
        },
        searchResourcePage: async ({ page, pageSize }) => syntheticPage(total, page, pageSize),
        refreshResources: async () => ({ status: 'complete' }),
        getPoolPage: async ({ page, pageSize }) => ({ items: [], memberResourceIds: [], total: 0, page, pageSize, totalPages: 0, hasPrev: false, hasNext: false }),
        addToPool: async () => ({}),
        removeFromPool: async () => ({}),
        getBalance: async () => 0,
        getDrafts: async () => [],
        getDraft: async () => null,
        setDraft: async () => ({}),
        removeDraft: async () => ({}),
        scanArticles: async () => [],
        previewArticle: async () => ({}),
        buildConfirmation: async () => ({}),
        submitSelected: async () => ({}),
        stopSubmit: async () => ({}),
        getOrders: async () => [],
        syncOrder: async () => ({ ok: true }),
      });
      feature.setScope({ workspaceRuntimeId: `synthetic-${total}` });
      await feature.loadResourcePage(1, 'initial');
      const snapshot = feature.getSnapshot();
      const elapsedMs = performance.now() - startedAt;
      const payloadBytes = Buffer.byteLength(JSON.stringify({
        items: snapshot.resources.items,
        total: snapshot.resources.total,
        page: snapshot.resources.page,
        pageSize: snapshot.resources.pageSize,
      }));
      const rendererHeapDeltaBytes = process.memoryUsage().heapUsed - before;

      assert.equal(requestCount, 1);
      assert.equal(snapshot.resources.pageSize, DEFAULT_RESOURCE_PAGE_SIZE);
      assert.equal(snapshot.resources.items.length, DEFAULT_RESOURCE_PAGE_SIZE);
      assert.equal(snapshot.resources.total, total);
      assert.ok(payloadBytes < 20_000, `single-page payload must stay bounded, got ${payloadBytes}`);
      t.diagnostic(JSON.stringify({
        fixture: 'synthetic-renderer-page',
        total,
        requestCount,
        payloadBytes,
        rendererHeapDeltaBytes,
        elapsedMs: Number(elapsedMs.toFixed(3)),
      }));
      feature.dispose();
    });
  }
});
