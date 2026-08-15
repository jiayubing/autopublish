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
    const workspaceRuntimeId = 'fixture-runtime-1';
    const state = {
      workspaceRuntimeId,
      queueCalls: 0,
      groupCalls: 0,
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
      workspaceRuntimeId: state.workspaceRuntimeId,
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
      getRuntimeIdentity: () => response({ workspaceRuntimeId: state.workspaceRuntimeId, revision: state.queueRevision }),
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
      pauseSubmit: () => response(undefined),
      stopSubmit: () => response(undefined),
    };
    const content = {
      previewTrashedArticleQueueResidue: () => response({ items: [], cleanableItems: [], reportedItems: [], cleanableCount: 0, reportedCount: 0 }),
      listContentClients: () => response([]),
      listContentArticles: () => response([]),
      listRegularQueueGroups: () => {
        state.groupCalls += 1;
        return response([]);
      },
      startRegularQueueGroup: () => response([]),
      pauseRegularQueueGroup: () => response([]),
      startAllRegularQueueGroups: () => response([]),
      pauseAllRegularQueueGroups: () => response([]),
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
        const event = { schemaVersion: 1, workspaceRuntimeId: state.workspaceRuntimeId, revision, scopes: ['platformQueue'], reasonCode: 'FIXTURE_TERMINAL' };
        state.invalidationListeners.slice().forEach((listener) => listener(event));
      },
      switchWorkspace(nextRuntimeId, revision) {
        state.workspaceRuntimeId = nextRuntimeId;
        state.queueRevision = revision;
        const event = { schemaVersion: 1, workspaceRuntimeId: nextRuntimeId, revision, scopes: ['platformQueue'], reasonCode: 'FIXTURE_RUNTIME_SWITCH' };
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
      getGroupCalls() {
        return state.groupCalls;
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

  it('loads queue groups once and refreshes them only on explicit user intent', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    page.setDefaultTimeout(10000);
    await installDesktopFixture(page);
    await page.goto(rendererUrl, { waitUntil: 'domcontentloaded' });
    await page.getByText('数据已就绪').waitFor();
    const initialCalls = await page.evaluate(() => window.__platformQueueLifecycle.getGroupCalls());
    assert.equal(initialCalls, 1, 'PlatformFeatureProvider owns the initial queue-group load');

    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.__platformQueueLifecycle.getGroupCalls()), initialCalls, 'initial idle does not trigger another group query');

    await page.locator('#nav-item-submission-center').click();
    await page.getByRole('heading', { name: '普通平台队列' }).waitFor();
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.__platformQueueLifecycle.getGroupCalls()), initialCalls, 'mounting the page does not refresh again');

    await page.getByRole('button', { name: '刷新', exact: true }).click();
    await page.waitForFunction((expected) => window.__platformQueueLifecycle.getGroupCalls() === expected + 1, initialCalls);
    await page.close();
  });

  it('rejects delayed platform events from workspace A after the production runtime switches to B', async () => {
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    page.setDefaultTimeout(10000);
    await installDesktopFixture(page);
    await page.goto(rendererUrl, { waitUntil: 'domcontentloaded' });
    await page.getByText('数据已就绪').waitFor();
    await page.locator('#nav-item-submission-center').click();
    await page.getByRole('heading', { name: '普通平台队列' }).waitFor();

    const beforeSwitch = await page.evaluate(() => window.__platformQueueLifecycle.getQueueCalls());
    await page.evaluate(() => window.__platformQueueLifecycle.switchWorkspace('fixture-runtime-2', 60));
    await page.waitForFunction((expected) => window.__platformQueueLifecycle.getQueueCalls() > expected, beforeSwitch);
    const beforeDelayedA = await page.evaluate(() => window.__platformQueueLifecycle.getQueueCalls());
    await page.evaluate(() => {
      window.__platformQueueLifecycle.emitPlatformState({
        workspaceRuntimeId: 'fixture-runtime-1', runId: 'run-a', phase: 'heartbeat', total: 20, processed: 19,
        succeeded: 19, failed: 0, skipped: 0, uncertain: 0,
        updatedAt: new Date(Date.now() + 2000).toISOString(),
      });
      window.__platformQueueLifecycle.emitPlatformState({
        workspaceRuntimeId: 'fixture-runtime-1', runId: 'run-a', phase: 'completed', queueRevision: 61,
        total: 20, processed: 20, succeeded: 20, failed: 0, skipped: 0, uncertain: 0,
        updatedAt: new Date(Date.now() + 3000).toISOString(),
      });
    });
    await page.waitForTimeout(400);
    assert.equal(await page.evaluate(() => window.__platformQueueLifecycle.getQueueCalls()), beforeDelayedA, 'A terminal event must not refresh B queue');
    await page.close();
  });
});
