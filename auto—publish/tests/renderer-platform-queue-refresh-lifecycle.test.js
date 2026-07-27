const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const { execFileSync, spawn } = require('node:child_process');
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const rendererDir = path.join(rootDir, 'media-workbench');
const rendererUrl = 'http://127.0.0.1:4176/';

let viteProcess;
let browser;
let buildDir;

function installDesktopFixture(page) {
  return page.addInitScript(() => {
    const state = {
      queueCalls: 0,
      queueRevision: 0,
      phase: 'idle',
      invalidationListeners: [],
      platformStateListeners: [],
      authStateListeners: [],
    };
    const queueData = () => ({
      revision: state.queueRevision,
      platforms: [],
      queue: [],
    });
    const platformState = () => ({
      isBatchRunning: state.phase === 'running',
      isStopPending: false,
      isPlatformRunning: state.phase === 'running',
      phase: state.phase,
    });
    const response = (data) => Promise.resolve({ ok: true, data });
    const authState = { authenticated: true, user: { id: 'fixture-admin', loginName: 'admin' }, entitlements: [{ product: 'AutoPublish', enabled: true, expiresAt: null }], errorCode: null };
    const auth = {
      getState: () => response(authState),
      login: () => response(authState),
      refresh: () => response(authState),
      logout: () => response({ authenticated: false, user: null, entitlements: [], errorCode: null }),
      onStateChanged: (listener) => { state.authStateListeners.push(listener); return () => {}; },
    };

    const workspace = {
      getBootstrapState: () => response({ state: 'ready', workspacePath: 'fixture', envOverride: false }),
      getCurrent: () => response({ workspacePath: 'fixture', envOverride: false, validation: { ok: true, errors: [], warnings: [] } }),
      openCurrent: () => response(undefined),
      chooseDirectory: () => response({ state: 'ready', workspacePath: 'fixture', envOverride: false }),
      confirmSelection: () => response({ state: 'ready' }),
      cancelSelection: () => response({ state: 'ready', workspacePath: 'fixture', envOverride: false }),
    };
    const workspaceData = {
      onInvalidated: (listener) => {
        state.invalidationListeners.push(listener);
        return () => {
          state.invalidationListeners = state.invalidationListeners.filter((item) => item !== listener);
        };
      },
    };
    const platforms = {
      getQueue: () => {
        state.queueCalls += 1;
        return response(queueData());
      },
      getState: () => response(platformState()),
      onState: (listener) => {
        state.platformStateListeners.push(listener);
        return () => {
          state.platformStateListeners = state.platformStateListeners.filter((item) => item !== listener);
        };
      },
      submitSelected: () => response({ ok: 0, fail: 0, skipped: 0, results: [] }),
      pauseSubmit: () => response(undefined),
      stopSubmit: () => response(undefined),
    };
    const content = {
      previewTrashedArticleQueueResidue: () => response({ items: [], cleanableItems: [], reportedItems: [], cleanableCount: 0, reportedCount: 0 }),
      listContentClients: () => response([]),
      listContentArticles: () => response([]),
      listSubmissionPlatforms: () => response([]),
      listSubmissionBatches: () => response([]),
      listArticleTrash: () => response([]),
      listResearch: () => response([]),
      listQuestions: () => response([]),
      listTemplates: () => response([]),
      listTemplateCatalog: () => response({ revision: 'fixture', platforms: [], templates: [], diagnostics: [] }),
      getDoubaoLoginState: () => response({ status: 'unknown' }),
      getDoubaoQueueState: () => response({ status: 'idle', currentTaskId: null, completed: 0, total: 0, waitRemainingMs: 0, tasks: [] }),
      onDoubaoQueueState: () => () => {},
    };
    const media = {
      scanArticles: () => response([]),
      getResourcePage: () => response({ items: [], total: 0, page: 1, pageSize: 99999 }),
      getPool: () => response([]),
      getBalance: () => response({ balance: '0' }),
    };
    const platformSettings = {
      getStatus: () => response({ source: 'application', configured: false, pythonConfigured: false, cookieConfigured: false, categoryId: 0, vendorConfigured: false, siteOrigin: '', publishIntervalSeconds: 30, lastTest: null }),
    };
    const orders = { getOrders: () => response([]) };
    const aiProvider = { getStatus: () => response({ configured: false, source: 'application', apiKeyMask: '', lastTest: null }) };
    const storageMaintenance = { getUsage: () => response({ logs: { bytes: 0, files: 0 }, temporary: { bytes: 0, files: 0 }, docxCache: { bytes: 0, files: 0 }, profiles: { bytes: 0, files: 0 } }) };

    window.__platformQueueLifecycle = {
      state,
      emitWorkspaceInvalidated(revision) {
        state.queueRevision = revision;
        const event = { schemaVersion: 1, workspaceRuntimeId: 'fixture-runtime-1', revision, scopes: ['platformQueue'], reasonCode: 'FIXTURE_TERMINAL' };
        state.invalidationListeners.slice().forEach((listener) => listener(event));
      },
      emitPlatformState(next) {
        state.phase = next.phase || next.status || 'idle';
        state.queueRevision = typeof next.queueRevision === 'number' ? next.queueRevision : state.queueRevision;
        const event = { ...platformState(), ...next };
        state.platformStateListeners.slice().forEach((listener) => listener(event));
      },
      getQueueCalls() {
        return state.queueCalls;
      },
    };
    window.desktopConsole = {
      auth,
      workspace,
      workspaceData,
      aiProvider,
      platformSettings,
      storageMaintenance,
      media,
      orders,
      platforms,
      content,
    };
  });
}

async function waitForServer(url) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const request = http.get(url, (response) => {
          response.resume();
          response.statusCode >= 200 && response.statusCode < 500 ? resolve() : reject(new Error('server not ready'));
        });
        request.on('error', reject);
      });
      return;
    } catch (_) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('Vite renderer server did not start');
}

describe('renderer platform queue lifecycle', { concurrency: false }, () => {
  before(async () => {
    const viteEntry = path.join(rendererDir, 'node_modules', 'vite', 'bin', 'vite.js');
    buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-publish-platform-queue-'));
    execFileSync(process.execPath, [viteEntry, 'build', '--outDir', buildDir], { cwd: rendererDir, stdio: 'inherit' });
    viteProcess = spawn(process.execPath, [viteEntry, 'preview', '--host', '127.0.0.1', '--port', '4176', '--outDir', buildDir], {
      cwd: rendererDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    await waitForServer(rendererUrl);
    browser = await chromium.launch({ headless: true });
  });

  after(async () => {
    if (browser) await browser.close();
    if (viteProcess && !viteProcess.killed) viteProcess.kill();
    if (buildDir) fs.rmSync(buildDir, { recursive: true, force: true });
  });

  it('loads once, stays idle, refreshes manually, and deduplicates terminal revisions', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    page.setDefaultTimeout(10000);
    await installDesktopFixture(page);
    await page.goto(rendererUrl, { waitUntil: 'domcontentloaded' });
    await page.getByText('数据已就绪').waitFor();
    const initialCalls = await page.evaluate(() => window.__platformQueueLifecycle.getQueueCalls());
    assert.equal(initialCalls, 1, 'PlatformFeatureProvider owns the initial queue load');

    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.__platformQueueLifecycle.getQueueCalls()), initialCalls, 'initial idle does not trigger terminal refresh');

    await page.locator('#nav-item-platforms').click();
    await page.getByRole('heading', { name: '其他平台投稿' }).waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.__platformQueueLifecycle.getQueueCalls()), initialCalls, 'mounting the page does not refresh again');

    await page.getByRole('button', { name: '刷新队列' }).click();
    await page.waitForFunction((expected) => window.__platformQueueLifecycle.getQueueCalls() === expected + 1, initialCalls);

    const afterManualRefresh = await page.evaluate(() => window.__platformQueueLifecycle.getQueueCalls());
    await page.evaluate(() => window.__platformQueueLifecycle.emitPlatformState({ phase: 'running' }));
    await page.evaluate(() => {
      window.__platformQueueLifecycle.emitWorkspaceInvalidated(41);
      window.__platformQueueLifecycle.emitPlatformState({ phase: 'completed', queueRevision: 41 });
      window.__platformQueueLifecycle.emitPlatformState({ phase: 'completed', queueRevision: 41 });
    });
    await page.waitForFunction((expected) => window.__platformQueueLifecycle.getQueueCalls() >= expected + 1, afterManualRefresh);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__platformQueueLifecycle.getQueueCalls()), afterManualRefresh + 1, 'one explicit terminal revision refreshes once');

    const afterFirstTerminal = await page.evaluate(() => window.__platformQueueLifecycle.getQueueCalls());
    await page.evaluate(() => {
      window.__platformQueueLifecycle.emitPlatformState({ phase: 'running' });
      window.__platformQueueLifecycle.emitWorkspaceInvalidated(42);
      window.__platformQueueLifecycle.emitPlatformState({ phase: 'completed', queueRevision: 42 });
      window.__platformQueueLifecycle.emitPlatformState({ phase: 'completed', queueRevision: 42 });
    });
    await page.waitForFunction((expected) => window.__platformQueueLifecycle.getQueueCalls() >= expected + 1, afterFirstTerminal);
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__platformQueueLifecycle.getQueueCalls()), afterFirstTerminal + 1, 'a new explicit terminal revision refreshes once');

    await page.locator('#nav-item-workbench').click();
    await page.waitForTimeout(300);
    const afterUnmount = await page.evaluate(() => window.__platformQueueLifecycle.getQueueCalls());
    await page.evaluate(() => window.__platformQueueLifecycle.emitPlatformState({ phase: 'completed', queueRevision: 43 }));
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => window.__platformQueueLifecycle.getQueueCalls()), afterUnmount, 'unmounted page no longer reacts to terminal state');

    await page.locator('#nav-item-platforms').click();
    await page.getByRole('heading', { name: '其他平台投稿' }).waitFor();
    await page.evaluate(() => window.__platformQueueLifecycle.emitPlatformState({
      runId: 'cross-page-run-2', phase: 'running', total: 20, processed: 7, succeeded: 6, failed: 1, skipped: 0, uncertain: 0,
      currentTask: { sourcePlatformId: 'hepan', filename: 'article-08.md', targetPlatformId: 'hepan' },
      updatedAt: new Date(Date.now() + 1000).toISOString(),
    }));
    await page.getByText('7 / 20').first().waitFor();
    await page.locator('#nav-item-workbench').click();
    await page.evaluate(() => window.__platformQueueLifecycle.emitPlatformState({
      runId: 'cross-page-run-2', phase: 'running', total: 20, processed: 8, succeeded: 7, failed: 1, skipped: 0, uncertain: 0,
      currentTask: { sourcePlatformId: 'hepan', filename: 'article-09.md', targetPlatformId: 'hepan' },
      updatedAt: new Date(Date.now() + 2000).toISOString(),
    }));
    await page.locator('#nav-item-platforms').click();
    await page.getByText('8 / 20').first().waitFor();
    await page.close();
  });
});
