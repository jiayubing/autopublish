"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startRenderer, closeRenderer } = require("./helpers/renderer-harness");
const { normalizeCandidate } = require("../src/content/geo-knowledge-merge");

function fixture({ document }) {
  const ok = (data) => Promise.resolve({ ok: true, data });
  const client = { id: "client-1", name: "合成客户", knowledgeFiles: [] };
  let knowledge = null;
  let running = false;
  let config = { configured: false, model: "", webSearch: true, baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3" };
  window.__geoCalls = { generate: 0, edits: [], config: [] };
  window.desktopConsole = {
    auth: {
      getState: () =>
        ok({
          authenticated: true,
          user: { loginName: "fixture" },
          entitlements: [],
        }),
      onStateChanged: () => () => {},
    },
    workspace: {
      getBootstrapState: () =>
        ok({ state: "ready", workspacePath: "fixture", envOverride: false }),
      getCurrent: () =>
        ok({
          state: "ready",
          workspacePath: "fixture",
          validation: { ok: true, errors: [], warnings: [] },
        }),
    },
    workspaceData: {
      getRuntimeIdentity: () =>
        ok({ workspaceRuntimeId: "runtime-1", revision: 1 }),
      onInvalidated: () => () => {},
    },
    content: {
      listClients: () => ok({ clients: [client] }),
      getClientDetails: () => ok({ client, research: [] }),
      listQuestions: () => ok({ questions: [] }),
      listResearch: () => ok({ research: [] }),
      listResearchMetadata: () => ok({ research: [] }),
      listTemplateCatalog: () =>
        ok({ revision: "r1", platforms: [], templates: [], diagnostics: [] }),
      getGenerationRuntimeSnapshot: () =>
        ok({
          runtimeId: "gen-1",
          sequence: 1,
          runtime: { status: "idle", state: "idle", batchId: null },
          batch: null,
          capabilities: {},
        }),
      onGenerationBatchState: () => () => {},
      getDoubaoLoginState: () => ok({ loginState: { status: "unknown" } }),
      getDoubaoQueueState: () =>
        ok({ queue: { status: "idle", completed: 0, total: 0, tasks: [] } }),
      onDoubaoQueueState: () => () => {},
    },
    geoKnowledge: {
      testConnection: async (input) => {
        await new Promise(resolve => setTimeout(resolve, 150));
        if (window.__geoTestFail) return { ok: false, error: { code: "GEO_AUTH_REJECTED", userMessage: "private upstream text", category: "authentication", retryability: "never" } };
        return ok({ search: input.search, citationCount: input.search ? 1 : 0 });
      },
      questionArticles: () =>
        ok({
          articles: [
            {
              id: "article-1",
              title: "合成文章",
              stage: "published",
              label: "已发布",
            },
          ],
          total: 1,
          publishedCount: 1,
        }),
      linkQuestions: ({ ids }) => {
        knowledge.geoQuestions.forEach((q) => {
          if (ids.includes(q.id)) q.questionId = "question-1";
        });
        knowledge.revision++;
        return ok({ knowledge });
      },
      questionDetails: ({ id }) =>
        ok({
          id,
          linkStatus: "linked",
          enabled: true,
          clientMentioned: true,
          research: {
            question: "如何选择服务？",
            answerText: "合成客户提供服务，详情以实际核对为准。",
            references: [
              { title: "测试来源", url: "https://example.com/source" },
            ],
            collectedAt: "2026-09-19T00:00:00.000Z",
            collectionMethod: "manual",
          },
        }),
      load: () =>
        ok({
          knowledge,
          state: { phase: running ? "extracting" : "idle", running },
        }),
      state: () =>
        ok({ state: { phase: running ? "extracting" : "complete", running } }),
      generate: () => {
        window.__geoCalls.generate++;
        running = true;
        return new Promise((resolve) => {
          window.__finishGeo = (fail) => {
            running = false;
            if (fail)
              resolve({
                ok: false,
                error: {
                  code: "GEO_CONFIG_REQUIRED",
                  userMessage: "请先配置豆包 GEO。",
                },
              });
            else {
              knowledge = structuredClone(document);
              resolve({ ok: true, data: { knowledge } });
            }
          };
        });
      },
      edit: (input) => {
        window.__geoCalls.edits.push(input);
        Object.assign(knowledge.profile, input.changes, {
          locked: true,
          origin: "manual",
        });
        knowledge.revision++;
        return ok({ knowledge });
      },
      cancel: () => {
        running = false;
        return ok({ state: { phase: "failed", running: false } });
      },
      configStatus: () => ok(config),
      saveConfig: (input) => {
        window.__geoCalls.config.push(input);
        config = {
          configured: true,
          model: input.model,
          webSearch: input.webSearch,
          baseUrl: input.baseUrl,
        };
        return ok(config);
      },
    },
    aiProvider: {
      getStatus: () =>
        ok({
          configured: false,
          source: "application",
          apiKeyMask: "",
          lastTest: null,
        }),
    },
    platformSettings: {
      getStatus: () => ok({ configured: false }),
      getLegacyStatus: () =>
        ok({
          discover: { importable: false },
          media: { importable: false },
          hepan: { importable: false },
        }),
    },
    storageMaintenance: {
      getUsage: () =>
        ok({
          logs: { bytes: 0 },
          temporary: { bytes: 0 },
          docxCache: { bytes: 0 },
          profiles: { bytes: 0 },
        }),
    },
    platforms: {
      getQueue: () => ok({ platforms: [], queue: [] }),
      listAccountProfiles: () => ok({ profiles: [] }),
      getState: () => ok({ isBatchRunning: false }),
      onState: () => () => {},
    },
    runtimeDiagnostics: {
      get: () => ok({ ok: true, capabilities: {}, errors: [], warnings: [] }),
    },
    media: {
      getResourcePage: () => ok({ items: [], total: 0, page: 1, pageSize: 1 }),
      getBalance: () => ok({ balance: "0" }),
    },
    orders: { getOrders: () => ok([]) },
  };
}
test("knowledge page handles empty, busy, error, editing and encrypted-config input flows", async (t) => {
  t.after(closeRenderer);
  const { browser, url } = await startRenderer({ port: 4191 });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.on("pageerror", (error) =>
    console.error("Renderer error:", error.message),
  );
  t.after(() => page.close());
  const document = normalizeCandidate(
    {
      profile: { fields: { name: "合成客户" } },
      geoQuestions: [{ name: "如何选择服务？", intent: "selection" }],
    },
    [],
    "client-1",
  );
  document.revision = 1;
  await page.addInitScript(fixture, { document });
  await page.goto(url);
  await page.locator("#nav-item-content-production").click();
  await page.getByRole("button", { name: "客户知识库", exact: true }).click();
  await page.getByText(/暂无知识库/).waitFor();
  const generate = page.getByRole("button", {
    name: "生成知识库",
    exact: true,
  });
  await generate.click();
  assert.equal(await generate.isDisabled(), true);
  await page.evaluate(() => window.__finishGeo(true));
  await page
    .getByRole("alert")
    .filter({ hasText: "请先配置豆包 GEO" })
    .waitFor();
  await generate.click();
  await page.evaluate(() => window.__finishGeo(false));
  await page.getByRole("button", { name: "编辑 客户基本信息" }).click();
  await page.getByLabel("客户名称", { exact: true }).fill("人工合成名称");
  await page.getByRole("button", { name: "保存并锁定" }).click();
  await page.getByText("人工合成名称", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => window.__geoCalls.edits[0].revision),
    1,
  );
  if (process.env.GEO_CAPTURE_SCREENSHOT === "1") {
    const directory = path.join(__dirname, "..", "build", "test-results");
    fs.mkdirSync(directory, { recursive: true });
    await page.screenshot({
      path: path.join(directory, "geo-knowledge.png"),
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "GEO 问题", exact: true }).click();
  await page.getByRole("checkbox", { name: "选择 如何选择服务？" }).check();
  await page.getByRole("button", { name: "加入问题采集（1）" }).click();
  await page.getByText(/已加入问题采集；/).waitFor();
  await page
    .getByRole("button", { name: "查看回答与关联：如何选择服务？" })
    .click();
  await page
    .getByText("合成客户提供服务，详情以实际核对为准。", { exact: true })
    .waitFor();
  await page.getByText(/客户名称字面出现：是/).waitFor();
  await page.getByText("关联文章：1 篇 · 已发布：1 篇").waitFor();
  if (process.env.GEO_CAPTURE_SCREENSHOT === "1") {
    await page
      .getByRole("region", { name: "GEO 问题详情" })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(
        __dirname,
        "..",
        "build",
        "test-results",
        "geo-knowledge-question.png",
      ),
      fullPage: true,
    });
  }
  await page.locator("#nav-item-settings").click();
  await page.getByRole("button", { name: "豆包 GEO", exact: true }).click();
  await page.getByLabel("模型 / Endpoint ID").fill("synthetic-model");
  await page.getByLabel("API Key", { exact: true }).fill("synthetic-secret");
  await page.getByRole("button", { name: "保存豆包 GEO 配置" }).click();
  await page.getByText("豆包 GEO 配置已保存。").waitFor();
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await page.getByText(/连接测试通过：/).waitFor();
  await page.getByRole("button", { name: "测试联网搜索", exact: true }).click();
  await page.getByText("联网测试通过，返回 1 条可核验引用。").waitFor();
  await page.evaluate(() => { window.__geoTestFail = true; });
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await page.getByText(/鉴权失败（401）/).waitFor();
  assert.equal(await page.getByText("private upstream text").count(), 0);
  assert.equal(await page.evaluate(() => window.__geoCalls.config[0].baseUrl), "https://ark.cn-beijing.volces.com/api/plan/v3");
  await page.getByLabel("接口 / Base URL").selectOption("https://ark.cn-beijing.volces.com/api/v3");
  assert.equal(await page.getByRole("button", { name: "测试连接", exact: true }).isDisabled(), true);
  assert.equal(await page.getByText(/鉴权失败（401）/).count(), 0);
  await page.getByText(/标准方舟地址不消耗 Coding Plan/).waitFor();
  await page.getByLabel("接口 / Base URL").selectOption("https://ark.cn-beijing.volces.com/api/plan/v3");
  assert.equal(
    await page.getByLabel("API Key", { exact: true }).inputValue(),
    "",
  );
  assert.equal(await page.evaluate(() => window.__geoCalls.generate), 2);
});
