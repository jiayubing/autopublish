const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { closeRenderer, startRenderer } = require("./helpers/renderer-harness");
const { createAiContentService } = require("../desktop/services/ai-content-service");
const { createAuthenticatedIpcMain } = require("../desktop/ipc/register");
const { registerAiContentIpc } = require("../desktop/ipc/ai-content-ipc");

async function openFixture(t, count = 60) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "renderer-client-groups-"));
  let service;
  let page;
  t.after(async () => {
    if (page) await page.close();
    await closeRenderer();
    service?.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  });
  for (let index = 1; index <= count; index += 1) {
    const directory = path.join(root, "clients", `client-${index}`);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "client.json"), JSON.stringify({ id: `client-${index}`, name: `合成客户 ${index}` }));
  }
  service = createAiContentService({ workspaceRoot: root });
  const first = await service.updateClientGroups({ action: "create", revision: 0, name: "重点推进" });
  const high = first.groups[0].id;
  const low = (await service.updateClientGroups({ action: "create", revision: 1, name: "低频维护" })).groups[1].id;
  if (count) await service.updateClientGroups({ action: "assign", revision: 2, groupId: high, clientIds: Array.from({ length: Math.min(count, 55) }, (_, index) => `client-${index + 1}`) });
  const handlers = new Map();
  const ipcMain = createAuthenticatedIpcMain({ handle(channel, handler) { handlers.set(channel, handler); } }, async () => {});
  registerAiContentIpc({ ipcMain, aiContentService: service });
  const { browser, url } = await startRenderer({ port: 4193 });
  page = await browser.newPage({ viewport: { width: 1180, height: 850 } });
  page.setDefaultTimeout(10000);
  await page.route("**/*", (route) => route.request().url().startsWith(url) ? route.continue() : route.abort());
  const faults = { read: false };
  await page.exposeFunction("__groupRpc", async (channel, payload) => {
    if (faults.read && channel === "content:get-client-groups") return { schemaVersion: 1, ok: false, error: { code: "CLIENT_GROUP_DATA_INVALID", category: "storage", retryability: "manual-check", userMessage: "合成分组读取失败，原文件已保留。" } };
    return handlers.get(channel)(null, { schemaVersion: 1, payload });
  });
  await page.addInitScript(({ count }) => {
    const ok = (data) => Promise.resolve({ ok: true, data });
    const clients = Array.from({ length: count }, (_, index) => ({ id: `client-${index + 1}`, name: `合成客户 ${String(index + 1).padStart(2, "0")}` }));
    const client = { ...clients[0], knowledgeFiles: [{ id: "brand-a", name: "brand-a.txt", extension: ".txt", status: "ready", characterCount: 12 }] };
    const research = [{ id: "research-a", question: "问题 A", answerText: "有效的合成研究回答", isAnswerComplete: true, answerLength: 10 }];
    const calls = { preview: [], start: [], collect: [] };
    let batch = null;
    const content = {
      getClientGroups: () => window.__groupRpc("content:get-client-groups", {}),
      updateClientGroups: (change) => window.__groupRpc("content:update-client-groups", { change }),
      listClients: () => ok({ clients }),
      getClientDetails: (clientId) => ok({ client: { ...client, ...clients.find((item) => item.id === clientId) }, research }),
      listResearch: () => ok({ research }),
      listResearchMetadata: () => ok({ research: research.map(({ answerText, ...item }) => item) }),
      listQuestions: () => ok({ questions: [] }),
      listTemplateCatalog: () => ok({ revision: "catalog-1", platforms: [{ id: "fixture", displayName: "测试平台" }], templates: [{ id: "template-1", platform: "fixture", scenario: "测试场景", name: "测试模板", body: "body", bodyHash: "hash", source: "custom", enabled: true }], diagnostics: [] }),
      getArticleManagementSnapshot: ({ clientId }) => ok({ clientId, revision: 1, articles: [], trash: [], publicationRecords: [], submissionPlatforms: [], workflowItems: [] }),
      getDoubaoLoginState: () => ok({ loginState: { status: "unknown" } }),
      getDoubaoQueueState: () => ok({ queue: { status: "idle", currentTaskId: null, completed: 0, total: 0, waitRemainingMs: 0, tasks: [] } }),
      previewDoubaoBatch: (input) => ok({ preview: { mode: input.mode, clientCount: input.clientIds.length, taskCount: input.clientIds.length, skippedExisting: 0, disabledQuestions: 0 } }),
      startPreparedDoubaoBatch: (input) => {
        calls.collect.push(structuredClone(input));
        return ok({ queue: { status: "running", currentTaskId: null, completed: 0, total: input.clientIds.length, waitRemainingMs: 0, tasks: [] } });
      },
      onDoubaoQueueState: () => () => {},
      getGenerationRuntimeSnapshot: () => ok({ runtimeId: "generation-runtime", sequence: batch ? 2 : 1, runtime: { status: batch ? "running" : "idle", state: batch ? "running" : "idle", batchId: batch?.id || null }, batch, capabilities: {} }),
      onGenerationBatchState: () => () => {},
      previewGenerationBatch: (input) => {
        calls.preview.push(structuredClone(input));
        return ok({ clientCount: input.clientIds.length, executableClientCount: input.clientIds.length, taskCount: input.clientIds.length * input.templates.length, executableTaskCount: input.clientIds.length * input.templates.length, excludedTaskCount: 0, excludedClients: [], templates: input.templates, clientSources: input.clientSources, tasks: [] });
      },
      createAndStartGenerationBatch: (input) => {
        calls.start.push(structuredClone(input));
        batch = { id: "batch-1", status: "running", concurrency: input.concurrency, clientSources: input.clientSources, templates: input.templates, tasks: [], counts: { total: input.clientIds.length * input.templates.length, succeeded: 0, failed: 0, pending: input.clientIds.length * input.templates.length, interrupted: 0, cancelled: 0 } };
        return ok({ batch });
      },
      pauseGenerationBatch: () => ok({}), abandonGenerationBatch: () => ok({}),
      resumeGenerationBatch: () => ok({}), retryFailedGenerationBatch: () => ok({}),
      previewCancelPendingGenerationBatch: () => ok({ canCancel: false, pendingCount: 0, runningCount: 0 }), cancelPendingGenerationBatch: () => ok({}),
    };
    window.__groupCalls = calls;
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
  }, { count });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator("#nav-item-content-production").click();
  await page.getByRole("heading", { name: "问题与采集" }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".content-workbench").length === 1);
  return { page, service, high, low, faults };
}

function groupButton(scope, name) {
  return scope.getByRole("button", { name: new RegExp(`^${name} \\(`) });
}

test("collection uses group shortcuts first, keeps detailed selection available, and freezes submitted IDs", { concurrency: false }, async (t) => {
  const { page, service, high } = await openFixture(t);
  const selector = page.locator("[data-client-group-batch-selector]").first();
  assert.equal(await selector.getByRole("checkbox").count(), 0);
  await groupButton(selector, "重点推进").click();
  assert.match(await selector.innerText(), /重点推进 · 55 个客户/);

  await selector.getByRole("button", { name: "选择部分客户…" }).click();
  const picker = page.getByRole("dialog", { name: "选择批次客户" });
  await picker.getByRole("combobox", { name: "批次客户分组" }).selectOption("ungrouped");
  assert.match(await picker.innerText(), /其中 55 个不在当前筛选结果中/);
  await picker.getByRole("searchbox").fill("60");
  await picker.getByRole("button", { name: "全选当前结果（1）" }).click();
  await picker.getByRole("button", { name: "查看已选" }).click();
  await picker.getByRole("checkbox", { name: "合成客户 01" }).click();
  await picker.getByRole("checkbox", { name: "合成客户 01" }).waitFor({ state: "hidden" });
  await picker.getByRole("button", { name: "完成选择" }).click();
  assert.match(await selector.innerText(), /自定义选择 · 55 个客户/);

  await page.getByRole("button", { name: "开始采集", exact: true }).click();
  await page.waitForFunction(() => window.__groupCalls.collect.length === 1);
  const sent = await page.evaluate(() => window.__groupCalls.collect[0]);
  assert.deepEqual([...sent.clientIds].sort(), [...Array.from({ length: 54 }, (_, index) => `client-${index + 2}`), "client-60"].sort());
  assert.equal(sent.mode, "missing");
  assert.equal(await selector.getByRole("button", { name: "选择部分客户…" }).isDisabled(), true);
  await service.updateClientGroups({ action: "delete", revision: service.getClientGroups().revision, groupId: high });
  assert.deepEqual(await page.evaluate(() => window.__groupCalls.collect[0]), sent);
});

test("group management is a direct action and batch generation reuses the same group-first selector independently", { concurrency: false }, async (t) => {
  const { page, service, high } = await openFixture(t, 3);
  await page.setViewportSize({ width: 1000, height: 800 });
  assert.ok(await page.locator(".content-workbench").evaluate((node) => node.scrollWidth <= node.clientWidth));
  const current = page.getByRole("combobox", { name: "当前客户", exact: true });
  const selectedCurrent = await current.inputValue();

  const collectionSelector = page.locator("[data-client-group-batch-selector]").first();
  await collectionSelector.getByRole("button", { name: "管理分组", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "管理客户分组" });
  await dialog.getByRole("textbox", { name: "新分组名称" }).fill("每周处理");
  await dialog.getByRole("button", { name: "新建分组" }).click();
  await dialog.getByText("客户分组已保存。", { exact: true }).waitFor();
  const newGroup = service.getClientGroups().groups.find((group) => group.name === "每周处理");
  assert.ok(newGroup);
  await dialog.getByRole("checkbox", { name: "合成客户 02" }).check();
  await dialog.getByRole("combobox", { name: "移入分组" }).selectOption(newGroup.id);
  await dialog.getByRole("button", { name: "移动选中客户（1）" }).click();
  await dialog.getByRole("button", { name: "移动选中客户（0）" }).waitFor();
  assert.equal(service.getClientGroups().memberships.find((item) => item.clientId === "client-2").groupId, newGroup.id);
  await dialog.getByRole("combobox", { name: "要编辑的分组" }).selectOption(newGroup.id);
  await dialog.getByRole("button", { name: "删除分组", exact: true }).click();
  await dialog.getByRole("button", { name: "确认删除分组" }).click();
  await dialog.getByRole("button", { name: "确认删除分组" }).waitFor({ state: "hidden" });
  await dialog.getByRole("button", { name: "完成", exact: true }).click();
  assert.equal(await current.inputValue(), selectedCurrent);

  await groupButton(collectionSelector, "重点推进").click();
  assert.match(await collectionSelector.innerText(), /重点推进 · 2 个客户/);

  await page.getByRole("button", { name: "批量生成", exact: true }).click();
  const generationSelector = page.locator("[data-client-group-batch-selector]").first();
  await groupButton(generationSelector, "未分组").click();
  assert.match(await generationSelector.innerText(), /未分组 · 1 个客户/);
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("checkbox", { name: /测试模板/ }).check();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByRole("button", { name: "检查并确认", exact: true }).click();
  await page.getByRole("button", { name: "确认并启动批量生成", exact: true }).click();
  const calls = await page.evaluate(() => window.__groupCalls);
  assert.deepEqual(calls.preview[0].clientIds, ["client-2"]);
  assert.deepEqual(calls.start[0].clientIds, ["client-2"]);
  assert.equal(calls.collect.length, 0);

  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(service.getClientGroups().groups.length, 2);
  const reloadedCurrent = page.getByRole("combobox", { name: "当前客户", exact: true });
  assert.equal(await reloadedCurrent.locator('optgroup[label^="重点推进（2）"]').count(), 1);
  assert.equal(service.getClientGroups().memberships.some((member) => member.clientId === "client-2"), false);
  assert.equal(service.getClientGroups().groups.some((group) => group.id === high), true);
});

test("group read failure preserves detailed customer search and exposes retry without a second management entry", { concurrency: false }, async (t) => {
  const { page, faults } = await openFixture(t, 3);
  const selector = page.locator("[data-client-group-batch-selector]").first();
  faults.read = true;
  await page.getByRole("button", { name: "刷新客户与模板", exact: true }).click();
  await selector.getByText(/客户分组暂不可用/).waitFor();
  assert.equal(await selector.getByRole("button", { name: "管理分组", exact: true }).isDisabled(), true);
  await selector.getByRole("button", { name: "选择部分客户…" }).click();
  const picker = page.getByRole("dialog", { name: "选择批次客户" });
  assert.equal(await picker.getByRole("combobox", { name: "批次客户分组" }).isDisabled(), true);
  assert.equal(await picker.getByRole("button", { name: "管理分组", exact: true }).count(), 0);
  await picker.getByRole("searchbox").fill("不匹配");
  assert.match(await picker.innerText(), /没有匹配客户/);
  await picker.getByRole("searchbox").fill("02");
  assert.equal(await picker.getByRole("checkbox").count(), 1);
  faults.read = false;
  await picker.getByRole("button", { name: "重试分组" }).click();
  await picker.getByRole("button", { name: "重试分组" }).waitFor({ state: "hidden" });
  assert.equal(await picker.getByRole("combobox", { name: "批次客户分组" }).isDisabled(), false);
  await picker.getByRole("button", { name: "清空选择" }).click();
  await picker.getByRole("button", { name: "完成选择" }).click();
  assert.equal(await page.getByRole("button", { name: "开始采集", exact: true }).isDisabled(), true);
});

test("an empty workspace keeps group management reachable and actions safely disabled", { concurrency: false }, async (t) => {
  const { page } = await openFixture(t, 0);
  const selector = page.locator("[data-client-group-batch-selector]").first();
  assert.match(await selector.innerText(), /尚未选择客户/);
  assert.equal(await selector.getByRole("checkbox").count(), 0);
  assert.equal(await page.getByRole("button", { name: "开始采集", exact: true }).isDisabled(), true);
  assert.equal(await selector.getByRole("button", { name: "管理分组", exact: true }).isDisabled(), false);
  assert.equal(await groupButton(selector, "重点推进").isDisabled(), true);
  await selector.getByRole("button", { name: "选择部分客户…" }).click();
  const picker = page.getByRole("dialog", { name: "选择批次客户" });
  assert.match(await picker.innerText(), /暂无客户/);
  assert.equal(await picker.getByRole("button", { name: "全选当前结果（0）" }).isDisabled(), true);
  assert.equal(await picker.getByRole("button", { name: "管理分组", exact: true }).count(), 0);
});
