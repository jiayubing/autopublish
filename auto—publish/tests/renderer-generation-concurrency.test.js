const assert = require("node:assert/strict");
const test = require("node:test");
const { closeRenderer, startRenderer } = require("./helpers/renderer-harness");

function generationFixture(options = {}) {
        const ok = (data) => Promise.resolve({ ok: true, data });
        const clients = [{ id: "client-a", name: "客户 A" }];
        if (options.mixed) clients.push({ id: "client-b", name: "缺回答客户" }, { id: "client-c", name: "缺资料客户" });
        const client = { ...clients[0], knowledgeFiles: [{ id: "brand-a", name: "brand-a.txt", extension: ".txt", status: "ready", characterCount: 12 }] };
        const research = [{ id: "research-a", question: "问题 A", answerText: "有效的合成研究回答", isAnswerComplete: true, answerLength: 10 }];
        const calls = { preview: [], start: [] };
        let batch = null;
        const content = {
          listClients: () => ok({ clients }),
          getClientDetails: (id) => {
            if (id === "client-c") return ok({ client: { ...client, id, name: "缺资料客户", knowledgeFiles: [] }, research });
            if (id === "client-b") {
              if (options.fail) return Promise.reject(new Error("合成客户详情读取失败"));
              const result = { client: { ...client, id, name: "缺回答客户" }, research: [] };
              if (options.delay) return new Promise(resolve => { window.__releaseBatchDetails = () => resolve({ ok: true, data: result }); });
              return ok(result);
            }
            return ok({ client, research: options.empty ? [] : research });
          },
          listResearch: () => ok({ research }),
          listResearchMetadata: () => ok({ research: research.map(({ answerText, ...item }) => item) }),
          listQuestions: () => ok({ questions: [] }),
          listTemplateCatalog: () => ok({ revision: "catalog-1", platforms: [{ id: "fixture", displayName: "测试平台" }], templates: [{ id: "template-1", platform: "fixture", scenario: "测试场景", name: "测试模板", body: "body", bodyHash: "hash", source: "custom", enabled: true }], diagnostics: [] }),
          getArticleManagementSnapshot: () => ok({ clientId: "client-a", revision: 1, articles: [], trash: [], publicationRecords: [], submissionPlatforms: [], workflowItems: [] }),
          getDoubaoLoginState: () => ok({ loginState: { status: "unknown" } }),
          getDoubaoQueueState: () => ok({ queue: { status: "idle", currentTaskId: null, completed: 0, total: 0, waitRemainingMs: 0, tasks: [] } }),
          onDoubaoQueueState: () => () => {},
          getGenerationRuntimeSnapshot: () => ok({ runtimeId: "generation-runtime", sequence: batch ? 2 : 1, runtime: { status: batch ? "running" : "idle", state: batch ? "running" : "idle", batchId: batch?.id || null }, batch, capabilities: {} }),
          onGenerationBatchState: () => () => {},
          previewGenerationBatch: (input) => {
            calls.preview.push(structuredClone(input));
            return ok({ clientCount: 1, executableClientCount: 1, taskCount: 1, executableTaskCount: 1, excludedTaskCount: 0, excludedClients: [], templates: input.templates, clientSources: input.clientSources, tasks: [] });
          },
          createAndStartGenerationBatch: (input) => {
            calls.start.push(structuredClone(input));
            batch = { id: "batch-1", status: "running", concurrency: input.concurrency, clientSources: input.clientSources, templates: input.templates, tasks: [], counts: { total: 1, succeeded: 0, failed: 0, pending: 1, interrupted: 0, cancelled: 0 } };
            return ok({ batch });
          },
          pauseGenerationBatch: () => ok({}), abandonGenerationBatch: () => ok({}),
          resumeGenerationBatch: () => ok({}), retryFailedGenerationBatch: () => ok({}),
          previewCancelPendingGenerationBatch: () => ok({ canCancel: false, pendingCount: 0, runningCount: 0 }), cancelPendingGenerationBatch: () => ok({}),
        };
        window.__concurrencyCalls = calls;
        window.desktopConsole = {
          auth: { getState: () => ok({ authenticated: true, user: { loginName: "fixture" }, entitlements: [] }), onStateChanged: () => () => {}, login: () => ok({}), changePassword: () => ok({}), refresh: () => ok({}), logout: () => ok({}) },
          workspace: { getBootstrapState: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }), getCurrent: () => ok({ workspacePath: "fixture", envOverride: false, validation: { ok: true, errors: [], warnings: [] } }), openCurrent: () => ok(undefined), requestSwitch: () => ok({ state: "ready" }), chooseDirectory: () => ok({ state: "ready" }), confirmSelection: () => ok({ state: "ready" }), cancelSelection: () => ok({ state: "ready" }) },
          workspaceData: { getRuntimeIdentity: () => ok({ workspaceRuntimeId: "runtime-1", revision: 1 }), onInvalidated: () => () => {} },
          runtimeDiagnostics: { get: () => ok({ ok: true, buildInfo: { version: "1" }, browserChannel: { channel: "chromium", configured: true, state: "ready", probed: true }, capabilities: {}, errors: [], warnings: [] }) },
          media: {  getResourcePage: () => ok({ items: [], total: 0, page: 1, pageSize: 1 }), getPool: () => ok([]), getBalance: () => ok({ balance: "0" }) },
          orders: { getOrders: () => ok([]) },
          aiProvider: { getStatus: () => ok({ configured: false, source: "application", apiKeyMask: "", lastTest: null }) },
          platformSettings: { getStatus: () => ok({ configured: false, source: "application", baseUrl: "", timeoutMs: 30000, allowInsecure: false, transport: "未配置", apiKeyMask: "", lastTest: null }) },
          storageMaintenance: { getUsage: () => ok({ logs: { bytes: 0, files: 0 }, temporary: { bytes: 0, files: 0 }, docxCache: { bytes: 0, files: 0 }, profiles: { bytes: 0, files: 0 } }) },
          platforms: { getQueue: () => ok({ platforms: [], queue: [] }), listAccountProfiles: () => ok({ profiles: [] }), getState: () => ok({ isBatchRunning: false, isStopPending: false, isPlatformRunning: false }), onState: () => () => {} },
          publication: { listForArticles: () => ok([]) },
          articleAttention: { list: () => ok({ revision: 0, items: [], counts: { total: 0, actionable: 0 } }) }, content,
        };
}

test("generation wizard defaults to four and sends each chosen concurrency through preview and start", { concurrency: false }, async (t) => {
  t.after(() => closeRenderer());
  const { browser, url } = await startRenderer({ port: 4183 });
  for (const selected of [4, 1, 2, 3]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    try {
      await page.addInitScript(generationFixture);
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.locator("#nav-item-content-production").click();
      await page.getByRole("button", { name: "批量生成", exact: true }).click();
      await page.locator("[data-client-group-batch-selector]").getByRole("button", { name: "选择部分客户…", exact: true }).click();
      const picker = page.getByRole("dialog", { name: "选择批次客户" });
      await picker.getByRole("checkbox", { name: "客户 A", exact: true }).check();
      await picker.getByRole("button", { name: "完成选择", exact: true }).click();
      await page.getByRole("button", { name: "下一步" }).click();
      await page.getByRole("checkbox", { name: /测试模板/ }).check();
      await page.getByRole("button", { name: "下一步" }).click();
      const chooser = page.getByRole("combobox", { name: "生成并发数" });
      assert.equal(await chooser.inputValue(), "4");
      assert.deepEqual(await chooser.locator("option").evaluateAll((nodes) => nodes.map((node) => node.value)), ["1", "2", "3", "4"]);
      await chooser.selectOption(String(selected));
      await page.getByRole("button", { name: "检查并确认", exact: true }).click();
      await page.getByRole("button", { name: "确认并启动批量生成", exact: true }).click();
      const calls = await page.evaluate(() => window.__concurrencyCalls);
      assert.equal(calls.preview.length, 1);
      assert.equal(calls.start.length, 1);
      assert.equal(calls.preview[0].concurrency, selected);
      assert.equal(calls.start[0].concurrency, selected);
      assert.deepEqual(calls.start[0].clientSources, calls.preview[0].clientSources);
    } finally { await page.close(); }
  }
});


test("batch source review excludes unready clients and recovers after source deselection", { concurrency: false }, async (t) => {
  t.after(() => closeRenderer());
  const { browser, url } = await startRenderer({ port: 4183 });
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.addInitScript(generationFixture, { mixed: true });
  await page.goto(url);
  await page.locator('#nav-item-content-production').click();
  await page.getByRole('button', { name: '批量生成', exact: true }).click();
  await page.getByRole('button', { name: '选择部分客户…', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择批次客户' });
  await picker.getByRole('checkbox', { name: '客户 A', exact: true }).check();
  await picker.getByRole('checkbox', { name: '缺回答客户', exact: true }).check();
  await picker.getByRole('checkbox', { name: '缺资料客户', exact: true }).check();
  await picker.getByRole('button', { name: '完成选择', exact: true }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('checkbox', { name: /测试模板/ }).check();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('status').filter({hasText:'已自动排除'}).waitFor();
  assert.match(await page.getByRole('status').filter({hasText:'已自动排除'}).innerText(), /缺回答客户.*缺资料客户/);
  await page.getByRole('checkbox', { name: /brand-a/ }).uncheck();
  await page.getByRole('button', { name: '检查并确认', exact: true }).click();
  assert.equal((await page.evaluate(() => window.__concurrencyCalls)).preview.length, 0);
  await page.getByRole('checkbox', { name: /brand-a/ }).check();
  await page.getByRole('button', { name: '检查并确认', exact: true }).click();
  await page.getByRole('button', { name: '确认并启动批量生成', exact: true }).click();
  const calls = await page.evaluate(() => window.__concurrencyCalls);
  const { productionIpcRegistry: registry } = require('../desktop/ipc/contracts/production-registry');
  assert.deepEqual(calls.preview[0].clientIds, ['client-a']);
  assert.deepEqual(calls.start[0].clientSources, calls.preview[0].clientSources);
  registry.encodeRequest(registry.byChannel('content:preview-generation-batch'), calls.preview[0]);
});


test("batch waits for client details and keeps an all-ineligible selection out of preview", { concurrency: false }, async (t) => {
  t.after(() => closeRenderer());
  const { browser, url } = await startRenderer({ port: 4183 });
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.addInitScript(generationFixture, { mixed: true, delay: true });
  await page.goto(url);
  await page.locator('#nav-item-content-production').click();
  await page.getByRole('button', { name: '批量生成', exact: true }).click();
  await page.getByRole('button', { name: '选择部分客户…', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择批次客户' });
  await picker.getByRole('checkbox', { name: '客户 A', exact: true }).uncheck();
  await picker.getByRole('checkbox', { name: '缺回答客户', exact: true }).check();
  await picker.getByRole('button', { name: '完成选择', exact: true }).click();
  await page.waitForFunction(() => typeof window.__releaseBatchDetails === 'function');
  assert.equal(await page.getByRole('button', { name: '下一步', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('status').filter({hasText:'已自动排除'}).count(), 0);
  await page.evaluate(() => window.__releaseBatchDetails());
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('status').filter({hasText:'没有可生成客户'}).waitFor();
  assert.equal(await page.getByRole('button', { name: '下一步', exact: true }).isDisabled(), true);
  assert.equal((await page.evaluate(() => window.__concurrencyCalls)).preview.length, 0);
  // Selecting a valid client recovers without refreshing or reopening the wizard.
  await page.getByRole('button', { name: '选择部分客户…', exact: true }).click();
  await picker.getByRole('checkbox', { name: '客户 A', exact: true }).check();
  await picker.getByRole('button', { name: '完成选择', exact: true }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('checkbox', { name: /测试模板/ }).check();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('button', { name: '检查并确认', exact: true }).click();
  await page.getByRole('button', { name: '确认并启动批量生成', exact: true }).waitFor();
});


test("batch read errors keep selected clients instead of silently excluding them", { concurrency: false }, async (t) => {
  t.after(() => closeRenderer());
  const { browser, url } = await startRenderer({ port: 4183 });
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.addInitScript(generationFixture, { mixed: true, fail: true });
  await page.goto(url);
  await page.locator('#nav-item-content-production').click();
  await page.getByRole('button', { name: '批量生成', exact: true }).click();
  await page.getByRole('button', { name: '选择部分客户…', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择批次客户' });
  await picker.getByRole('checkbox', { name: '客户 A', exact: true }).check();
  await picker.getByRole('checkbox', { name: '缺回答客户', exact: true }).check();
  await picker.getByRole('button', { name: '完成选择', exact: true }).click();
  await page.getByRole('alert').filter({hasText:'刷新客户后重试'}).waitFor();
  assert.equal(await page.getByRole('button', { name: '下一步', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('status').filter({hasText:'已自动排除'}).count(), 0);
  await page.getByRole('button', { name: '选择部分客户…', exact: true }).click();
  assert.equal(await picker.getByRole('checkbox', { name: '缺回答客户', exact: true }).isChecked(), true);
  await picker.getByRole('checkbox', { name: '缺回答客户', exact: true }).uncheck();
  await picker.getByRole('button', { name: '完成选择', exact: true }).click();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByRole('checkbox', { name: /测试模板/ }).waitFor();
});
