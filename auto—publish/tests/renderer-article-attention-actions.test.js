const assert = require('node:assert/strict');
const test = require('node:test');
const { execFileSync, spawn } = require('node:child_process');
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const rendererDir = path.join(rootDir, 'media-workbench');
const rendererUrl = 'http://127.0.0.1:4177/';

function ok(data) { return Promise.resolve({ ok: true, data }); }

async function waitForServer(url) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const request = http.get(url, (response) => { response.resume(); response.statusCode >= 200 && response.statusCode < 500 ? resolve() : reject(new Error('server not ready')); });
        request.on('error', reject);
      });
      return;
    } catch (_) { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  throw new Error('Vite renderer server did not start');
}

test('article attention actions produce visible publication/detail results', async () => {
  const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-publish-attention-'));
  const viteEntry = path.join(rendererDir, 'node_modules', 'vite', 'bin', 'vite.js');
  let viteProcess;
  let browser;
  try {
    execFileSync(process.execPath, [viteEntry, 'build', '--outDir', buildDir], { cwd: rendererDir, stdio: 'inherit' });
    viteProcess = spawn(process.execPath, [viteEntry, 'preview', '--host', '127.0.0.1', '--port', '4177', '--outDir', buildDir], { cwd: rendererDir, stdio: ['ignore', 'pipe', 'pipe'] });
    await waitForServer(rendererUrl);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      const ok = (data) => Promise.resolve({ ok: true, data });
      const article = { id: 'article-1', clientId: 'client-1', title: '失败后可重新投稿', content: '安全测试正文', status: 'saved', platform: 'hepan', scenario: '测试', templateId: 'template-1', createdAt: '2026-07-19T00:00:00.000Z', updatedAt: '2026-07-19T00:00:00.000Z', version: 1 };
      const attention = { attentionId: 'failed-active-1', kind: 'failed_submission', articleId: article.id, clientId: article.clientId, titleSnapshot: article.title, platformId: 'hepan', displayName: '蓝色河畔', publicationId: 'publication-1', attemptId: 'attempt-1', status: 'failed', message: '投稿明确失败', allowedActions: ['retry-publication', 'open-publication'] };
      const conflict = { attentionId: 'conflict-1', kind: 'queue_pair_conflict', articleId: 'article-missing', clientId: article.clientId, titleSnapshot: '队列身份冲突', platformId: 'hepan', status: 'failed', pairState: 'content_changed', reasonCode: 'SUBMISSION_CONTENT_CHANGED', message: '队列文件与原投稿记录不一致', allowedActions: ['inspect'] };
      const publication = { publicationId: 'publication-1', clientId: article.clientId, articleId: article.id, platformId: 'hepan', targetKey: 'platform:hepan', status: 'failed', updatedAt: article.updatedAt, attempts: [{ attemptId: 'attempt-1', status: 'failed', updatedAt: article.updatedAt, errorCode: 'REMOTE_REJECTED' }] };
      const calls = [];
      const content = {
        listClients: () => ok([{ id: article.clientId, name: '测试客户', knowledgeFiles: [] }]),
        listGeneratedArticles: () => ok([article]),
        listArticleAttention: () => ok({ revision: 1, items: [attention, conflict], counts: { total: 2, actionable: 1 } }),
        getArticleAttention: ({ attentionId }) => ok(attentionId === conflict.attentionId ? conflict : attention), previewArticleAttention: ({ action }) => ok({ attentionId: attention.attentionId, revision: 1, action, requiresConfirmation: false, message: '投稿明确失败', changedScopes: [] }),
        resolveArticleAttention: ({ action }) => { calls.push(action); return ok({ outcome: action === 'open-publication' ? 'open-publication' : 'inspection_required', attentionId: attention.attentionId, changedScopes: [] }); },
        listSubmissionPlatforms: () => ok([{ id: 'hepan', displayName: '蓝色河畔', contentQueueImport: true }]), listSubmissionBatches: () => ok([]), listArticleTrash: () => ok([]),
        listPublicationHistory: () => ok([publication]), listResearch: () => ok([]), listQuestions: () => ok([]), listTemplateCatalog: () => ok({ revision: '1', platforms: [], templates: [], diagnostics: [] }), listTemplates: () => ok([]),
        getDoubaoLoginState: () => ok({ status: 'unknown' }), getDoubaoQueueState: () => ok({ status: 'idle', currentTaskId: null, completed: 0, total: 0, waitRemainingMs: 0, tasks: [] }), onDoubaoQueueState: () => () => {}, onArticleRemovalTransaction: () => () => {}, listArticleRemovalTransactions: () => ok([])
      };
      window.desktopConsole = {
        content, articleAttention: { list: content.listArticleAttention, get: content.getArticleAttention, preview: content.previewArticleAttention, resolve: content.resolveArticleAttention },
        workspace: { getBootstrapState: () => ok({ state: 'ready' }), getCurrent: () => ok({}), openCurrent: () => ok(undefined), onInvalidated: () => () => {} },
        workspaceData: { onInvalidated: () => () => {} }, platforms: { getQueue: () => ok({ platforms: [], queue: [] }), getState: () => ok({ phase: 'idle' }), onState: () => () => {} },
        runtimeDiagnostics: { get: () => ok({ ok: true, buildInfo: {}, capabilities: {}, errors: [], warnings: [] }) }, media: { scanArticles: () => ok([]), getResourcePage: () => ok({ items: [], total: 0, page: 1, pageSize: 100 }), getPool: () => ok([]), getBalance: () => ok({ balance: '0' }) }, orders: { getOrders: () => ok([]) },
        aiProvider: { getStatus: () => ok({ configured: false }) }, platformSettings: { getStatus: () => ok({ configured: false, publishIntervalSeconds: 30 }) }, storageMaintenance: { getUsage: () => ok({}) }
      };
      window.__attentionActionCalls = calls;
    });
    await page.goto(rendererUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'AI内容生成' }).click();
    await page.getByRole('button', { name: '历史文章' }).click();
    await page.getByRole('tab', { name: '失败' }).click();
    await page.getByRole('button', { name: '打开发布详情' }).click();
    await page.getByRole('dialog', { name: '文章 失败后可重新投稿 的发布详情' }).waitFor({ state: 'visible' });
    assert.deepEqual(await page.evaluate(() => window.__attentionActionCalls), []);
    await page.getByRole('button', { name: '关闭发布详情' }).first().click();
    await page.getByRole('button', { name: '重新投稿' }).click();
    await page.waitForFunction(() => window.__attentionActionCalls.includes('retry-publication'));
    await page.getByRole('button', { name: '查看差异' }).click();
    await page.getByRole('dialog', { name: '需处理详情' }).waitFor({ state: 'visible' });
  } finally {
    if (browser) await browser.close();
    if (viteProcess && !viteProcess.killed) viteProcess.kill();
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
});
