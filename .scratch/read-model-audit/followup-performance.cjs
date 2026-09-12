const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const app = path.resolve(__dirname, '../../auto—publish');
const { createArticleStore } = require(path.join(app, 'src/content/article-store'));
const { MediaResourceStore } = require(path.join(app, 'src/platforms/media/media-resource-store'));
const { createMediaResourceService } = require(path.join(app, 'desktop/services/media-resource-service'));

async function measured(label, action) {
  let last = performance.now(), maxGap = 0, ticks = 0;
  const timer = setInterval(() => {
    const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now; ticks++;
  }, 1);
  const started = performance.now();
  try {
    const result = await action();
    const elapsedMs = performance.now() - started;
    maxGap = Math.max(maxGap, performance.now() - last);
    console.log(JSON.stringify({ label, elapsedMs, timerTicks: ticks, maxTimerGapMs: maxGap, count: result.length }));
    return result;
  } finally { clearInterval(timer); }
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'read-followup-bench-'));
  try {
    const content = createArticleStore(root);
    for (let i = 0; i < 1000; i++) content.createArticle({ id: `a-${i}`, clientId: 'client',
      title: `Article ${i}`, content: 'needle ' + 'x'.repeat(4096), status: 'generated', createdAt: '2026-09-12T00:00:00.000Z' });
    const reopened = createArticleStore(root);
    await measured('summary-cold-1000', () => reopened.listArticleSummariesAsync('client'));
    await measured('summary-warm-1000', () => reopened.listArticleSummariesAsync('client'));
    await measured('full-text-search-1000', () => reopened.searchArticleIds('client', 'needle'));
    const resourceStore = new MediaResourceStore({ filePath: path.join(root, 'resources.json') });
    resourceStore.setAll(Array.from({ length: 10000 }, (_, i) => ({ resourceId: `r-${i}`, name: `Media ${i}`, price: i, remarks: 'x'.repeat(256) })));
    const service = createMediaResourceService({ resourceStore, poolStore: {} });
    const start = performance.now();
    service.getCachedResourcePage({ page: 1, pageSize: 100 });
    const firstMs = performance.now() - start;
    const samples = [];
    for (let i = 0; i < 30; i++) {
      const t = performance.now();
      const page = service.getCachedResourcePage({ page: 2, pageSize: 100 });
      assert.equal(page.items.length, 100);
      samples.push(performance.now() - t);
    }
    samples.sort((a, b) => a - b);
    console.log(JSON.stringify({ label: 'media-10000-page-100', firstMs, warmMedianMs: samples[15], repeats: 30 }));
  } finally {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('read-followup-bench-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
