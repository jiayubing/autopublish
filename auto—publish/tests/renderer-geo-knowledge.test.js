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
  let failedState = null;
  let workspaceInvalidated = null;
  const questions = [];
  let config = {
    configured: false,
    model: "",
    webSearch: true,
    baseUrl: "https://ark.cn-beijing.volces.com/api/plan/v3",
  };
  let prompts = {
    defaultGlobalPrompt: "默认要求",
    globalPrompt: "",
    defaultFinalKnowledgePrompt: "默认知识稿要求",
    finalKnowledgePrompt: "",
    clientPrompt: "",
  };
  window.__geoCalls = {
    generate: 0,
    tests: 0,
    edits: [],
    config: [],
    prompts: [],
    sources: [],
    conflicts: [],
    exports: [],
    temporaryPrompt: "",
  };
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
      onInvalidated: (listener) => {
        workspaceInvalidated = listener;
        return () => {
          if (workspaceInvalidated === listener) workspaceInvalidated = null;
        };
      },
    },
    content: {
      listClients: () => ok({ clients: [client] }),
      getClientDetails: () => ok({ client, research: [] }),
      listQuestions: () => ok({ questions }),
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
        window.__geoCalls.tests++;
        await new Promise((resolve) => setTimeout(resolve, 150));
        if (window.__geoTestFail)
          return {
            ok: false,
            error: {
              code: "GEO_AUTH_REJECTED",
              userMessage: "private upstream text",
              category: "authentication",
              retryability: "never",
            },
          };
        return ok({
          search: input.search,
          citationCount: input.search ? 1 : 0,
        });
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
          if (ids.includes(q.id)) {
            q.questionId = "question-1";
            if (!questions.some((item) => item.id === q.questionId)) {
              questions.push({
                id: q.questionId,
                clientId: knowledge.clientId,
                text: q.name,
                enabled: true,
                createdAt: "2026-09-21T00:00:00.000Z",
              });
            }
          }
        });
        knowledge.revision++;
        queueMicrotask(() =>
          workspaceInvalidated?.({
            schemaVersion: 1,
            workspaceRuntimeId: "runtime-1",
            revision: 2,
            scopes: ["contentSources"],
            reasonCode: "GEO_QUESTIONS_LINKED",
          }),
        );
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
          storageStatus: knowledge ? "current_v2" : "missing",
          state: running
            ? { phase: "R4", running: true, completed: 3, total: 6 }
            : failedState || { phase: "idle", running: false },
        }),
      questionWorkflow: () =>
        ok({
          clientId: "client-1",
          knowledgeRevision: knowledge?.revision || 0,
          items: (knowledge?.geoQuestions || []).map((item) => ({
            id: item.id,
            name: item.name,
            intent: item.intent || "",
            knowledgeCoverage: item.knowledgeCoverage || "",
            linkStatus: item.questionId ? "linked" : "unlinked",
            questionId: item.questionId || null,
            collectionEnabled: item.questionId ? true : null,
            research: item.questionId
              ? {
                  collectedAt: "2026-09-19T00:00:00.000Z",
                  answerLength: 20,
                  referenceCount: 1,
                }
              : null,
            articles: { total: 1, publishedCount: 1 },
            generation: {
              ready: Boolean(item.questionId),
              code: item.questionId
                ? "GEO_GENERATION_READY"
                : "GEO_QUESTION_UNLINKED",
            },
          })),
        }),
      state: () => {
        if (window.__failNextGeoState) {
          window.__failNextGeoState = false;
          return Promise.resolve({
            ok: false,
            error: {
              code: "IPC_INTERNAL",
              userMessage: "临时进度读取失败。",
            },
          });
        }
        return ok({
          state: running
            ? { phase: "R4", running: true, completed: 3, total: 6 }
            : failedState || { phase: "complete", running: false },
        });
      },
      generate: (input) => {
        window.__geoCalls.generate++;
        window.__geoCalls.temporaryPrompt = input.temporaryPrompt;
        running = true;
        return new Promise((resolve) => {
          window.__finishGeo = (fail) => {
            running = false;
            if (fail) {
              failedState = {
                phase: "failed",
                running: false,
                failedPhase: "R4",
                errorCode: "GEO_CONFIG_REQUIRED",
              };
              resolve({
                ok: false,
                error: {
                  code: "GEO_CONFIG_REQUIRED",
                  userMessage: "请先配置豆包 GEO。",
                },
              });
            } else {
              failedState = null;
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
      promptSettings: () => ok(prompts),
      saveGlobalPrompt: ({ researchPromptOverride }) => {
        prompts = { ...prompts, globalPrompt: researchPromptOverride };
        window.__geoCalls.prompts.push(["global", researchPromptOverride]);
        return ok({
          defaultGlobalPrompt: prompts.defaultGlobalPrompt,
          globalPrompt: prompts.globalPrompt,
        });
      },
      saveFinalKnowledgePrompt: ({ finalKnowledgePromptOverride }) => {
        prompts = {
          ...prompts,
          finalKnowledgePrompt: finalKnowledgePromptOverride,
        };
        window.__geoCalls.prompts.push(["final", finalKnowledgePromptOverride]);
        return ok({
          defaultFinalKnowledgePrompt: prompts.defaultFinalKnowledgePrompt,
          finalKnowledgePrompt: prompts.finalKnowledgePrompt,
        });
      },
      saveClientPrompt: ({ researchPrompt }) => {
        prompts = { ...prompts, clientPrompt: researchPrompt };
        window.__geoCalls.prompts.push(["client", researchPrompt]);
        return ok({ researchPrompt });
      },
      exportMarkdown: () => ok({ markdown: knowledge?.deliverable?.markdown || "" }),
      confirmSourceType: (input) => {
        window.__geoCalls.sources.push(input);
        knowledge.sources.find((source) => source.id === input.sourceId).type =
          input.targetType;
        knowledge.revision++;
        return ok({ knowledge });
      },
      resolveConflict: (input) => {
        window.__geoCalls.conflicts.push(input);
        knowledge.restrictions.find(
          (item) => item.id === input.conflictId,
        ).conflictStatus = "resolved";
        knowledge.revision++;
        return ok({ knowledge });
      },
      cancel: () => {
        running = false;
        return ok({ state: { phase: "failed", running: false } });
      },
      configStatus: () =>
        ok({
          ...config,
          defaultGlobalPrompt: prompts.defaultGlobalPrompt,
          globalPrompt: prompts.globalPrompt,
          defaultFinalKnowledgePrompt: prompts.defaultFinalKnowledgePrompt,
          finalKnowledgePrompt: prompts.finalKnowledgePrompt,
        }),
      saveConfig: (input) => {
        window.__geoCalls.config.push(input);
        config = {
          configured: true,
          model: input.model,
          webSearch: input.webSearch,
          baseUrl: input.baseUrl,
        };
        return ok({
          ...config,
          defaultGlobalPrompt: prompts.defaultGlobalPrompt,
          globalPrompt: prompts.globalPrompt,
          defaultFinalKnowledgePrompt: prompts.defaultFinalKnowledgePrompt,
          finalKnowledgePrompt: prompts.finalKnowledgePrompt,
        });
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
test("GEO endpoint selection shows the matching fee guidance without sending requests", async t => {
  t.after(closeRenderer);
  const { browser, url } = await startRenderer({ port: 4191 });
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.addInitScript(fixture, { document: null });
  await page.goto(url);
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "豆包 GEO", exact: true }).click();
  const endpoint = page.getByRole("combobox", { name: "接口 / Base URL" });
  await endpoint.waitFor();
  const { CODING_BASE_URL, STANDARD_BASE_URL } = require("../src/content/doubao-geo-endpoint");
  assert.equal(await endpoint.inputValue(), CODING_BASE_URL);
  await page.getByText("使用 Coding Plan 专用地址", { exact: false }).waitFor({ timeout: 3000 });
  assert.equal(await page.getByText("注意：标准方舟地址", { exact: false }).count(), 0);
  assert.equal(await page.getByRole("button", { name: "测试连接", exact: true }).isDisabled(), true);
  await endpoint.selectOption(STANDARD_BASE_URL);
  await page.getByText("注意：标准方舟地址", { exact: false }).waitFor();
  assert.equal(await page.getByText("使用 Coding Plan 专用地址", { exact: false }).count(), 0);
  await endpoint.selectOption(CODING_BASE_URL);
  await page.getByText("使用 Coding Plan 专用地址", { exact: false }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.__geoCalls.config), []);
  assert.equal(await page.evaluate(() => window.__geoCalls.tests), 0);
  assert.equal(await page.evaluate(() => window.__geoCalls.generate), 0);
});

test("prose editing uses saved preview and export; candidate replacement is explicit", async t => {
  t.after(closeRenderer);
  const { browser, url } = await startRenderer({ port: 4191 });
  const page = await browser.newPage();
  t.after(() => page.close());
  const document = normalizeCandidate({ profile: { fields: { name: "合成客户" } } }, [], "client-1");
  document.revision = 1;
  document.deliverable = { version: 1, knowledgeRevision: 1, contentRevision: 1, status: "complete", markdown: "# 已保存的正文\n\n## 产品或服务描述\n\n已保存服务", warnings: [] };
  document.pendingDeliverable = { ...document.deliverable, candidateId: "candidate-1", markdown: "# 新生成的候选正文\n\n## 产品或服务描述\n\n新生成服务" };
  await page.addInitScript(fixture, { document: null });
  await page.addInitScript(document => {
    const ok = data => Promise.resolve({ ok: true, data: structuredClone(data) });
    window.desktopConsole.geoKnowledge.load = () => ok({ knowledge: document, storageStatus: "current_v2", state: { phase: "idle", running: false } });
    window.desktopConsole.geoKnowledge.exportMarkdown = () => ok({ markdown: document.deliverable.markdown });
    window.desktopConsole.geoKnowledge.editDeliverable = input => {
      if (window.__failProseSave) return Promise.resolve({ ok: false, error: { code: "GEO_SAVE_FAILED", userMessage: "正文保存失败" } });
      document.revision++;
      document.deliverable.markdown = input.markdown;
      document.deliverable.contentRevision++;
      return ok({ knowledge: document });
    };
    window.desktopConsole.geoKnowledge.acceptDeliverable = () => {
      document.revision++;
      document.deliverable = { ...document.pendingDeliverable, contentRevision: document.deliverable.contentRevision + 1 };
      delete document.pendingDeliverable;
      return ok({ knowledge: document });
    };
  }, document);
  await page.goto(url);
  await page.locator("#nav-item-content-production").click();
  await page.getByRole("button", { name: "客户知识库", exact: true }).click();
  await page.getByText("新生成的候选稿（尚未替换当前正文）", { exact: true }).click();
  await page.getByRole("button", { name: "编辑正文", exact: true }).click();
  assert.equal(await page.locator("textarea[aria-label]").count(), 9);
  await page.getByLabel("产品或服务描述").fill("# 尚未保存的修改");
  assert.equal(await page.getByRole("button", { name: "用此稿替换当前正文" }).isDisabled(), true);
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => { window.__copied = text; } } }); });
  await page.getByRole("button", { name: "复制完整正文" }).click();
  assert.equal(await page.evaluate(() => window.__copied), document.deliverable.markdown);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 Markdown" }).click();
  const download = await downloadPromise;
  assert.equal(download.suggestedFilename(), "知识库.md");
  assert.equal(fs.readFileSync(await download.path(), "utf8"), document.deliverable.markdown);
  await page.evaluate(() => { window.__failProseSave = true; });
  await page.getByRole("button", { name: "保存正文", exact: true }).click();
  await page.getByText(/GEO_SAVE_FAILED/).waitFor();
  assert.equal(await page.getByLabel("产品或服务描述").inputValue(), "# 尚未保存的修改");
  await page.evaluate(() => { window.__failProseSave = false; });
  await page.getByRole("button", { name: "保存正文", exact: true }).click();
  await page.getByText(/当前正文版本 2/).waitFor();
  await page.getByRole("button", { name: "用此稿替换当前正文" }).click();
  await page.getByText(/当前正文版本 3/).waitFor();
  assert.equal(await page.getByText("新生成的候选稿（尚未替换当前正文）", { exact: true }).count(), 0);
  assert.equal(await page.getByText("新生成服务", { exact: true }).count(), 1);
});

test("unverified model draft remains separately previewable without a canonical knowledge file", async (t) => {
  t.after(closeRenderer);
  const { browser, url } = await startRenderer({ port: 4191 });
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.addInitScript(fixture, { document: null });
  await page.addInitScript(() => {
    window.desktopConsole.geoKnowledge.load = () =>
      Promise.resolve({
        ok: true,
        data: {
          knowledge: null,
          storageStatus: "missing",
          state: { phase: "failed", failedPhase: "K", running: false },
          modelDraft: {
            status: "unverified",
            markdown:
              "# 模型草稿\n\n## 产品或服务描述\n\n未验证但完整保留的正文。",
          },
        },
      });
  });
  await page.goto(url);
  await page.locator("#nav-item-content-production").click();
  await page.getByRole("button", { name: "客户知识库", exact: true }).click();
  await page.getByText("本次未验证模型草稿（未覆盖当前正文）", { exact: true }).click();
  await page.getByText(/未验证但完整保留的正文/).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "生成知识库", exact: true })
      .isEnabled(),
    true,
  );

  assert.equal(await page.evaluate(() => window.__geoCalls.generate), 0);
});

test("initial knowledge load failure shows its safe error code and refresh recovers", async (t) => {
  t.after(closeRenderer);
  const { browser, url } = await startRenderer({ port: 4191 });
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.addInitScript(fixture, { document: null });
  await page.addInitScript(() => {
    const load = window.desktopConsole.geoKnowledge.load;
    window.__loadFailed = true;
    window.desktopConsole.geoKnowledge.load = (input) => window.__loadFailed
      ? Promise.resolve({ ok: false, error: {
          code: "IPC_RESULT_INVALID",
          userMessage: "知识库返回结果未通过校验，请刷新并提供错误代码。",
          category: "validation", retryability: "manual-check",
        } })
      : load(input);
  });
  await page.goto(url);
  await page.locator("#nav-item-content-production").click();
  await page.getByRole("button", { name: "客户知识库", exact: true }).click();
  await page.getByText(/IPC_RESULT_INVALID/).waitFor();
  await page.evaluate(() => { window.__loadFailed = false; });
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await page.getByText(/暂无知识库/).waitFor();
  assert.equal(await page.getByText(/IPC_RESULT_INVALID/).count(), 0);
  assert.equal(await page.evaluate(() => window.__geoCalls.generate), 0);
});
test("K waiting guidance and persisted uncertain timeout remain visible after refresh", async (t) => {
  t.after(closeRenderer);
  const { browser, url } = await startRenderer({ port: 4191 });
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.addInitScript(fixture, { document: null });
  await page.addInitScript(() => {
    window.__finalTimedOut = false;
    const state = () => window.__finalTimedOut
      ? { phase: "failed", running: false, failedPhase: "K", outcome: "uncertain", errorCode: "GEO_REQUEST_TIMEOUT" }
      : { phase: "K", running: true, completed: 5, total: 6 };
    window.desktopConsole.geoKnowledge.load = () => Promise.resolve({ ok: true, data: { knowledge: null, storageStatus: "missing", state: state() } });
    window.desktopConsole.geoKnowledge.state = () => Promise.resolve({ ok: true, data: { state: state() } });
  });
  await page.goto(url);
  await page.locator("#nav-item-content-production").click();
  await page.getByRole("button", { name: "客户知识库", exact: true }).click();
  await page.getByText(/最长等待10分钟/).waitFor();
  assert.equal(await page.getByRole("button", { name: "生成知识库", exact: true }).isDisabled(), true);
  await page.evaluate(() => { window.__finalTimedOut = true; });
  await page.getByText(/模型响应等待超时.*GEO_REQUEST_TIMEOUT/).waitFor();
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await page.getByText(/模型响应等待超时.*GEO_REQUEST_TIMEOUT/).waitFor();
  assert.equal(await page.getByText(/最长等待10分钟/).count(), 0);
  assert.equal(await page.evaluate(() => window.__geoCalls.generate), 0);
});

test("switching client discards a late generation response and leaves the new client usable", async (t) => {
  t.after(closeRenderer);
  const { browser, url } = await startRenderer({ port: 4191 });
  const page = await browser.newPage();
  t.after(() => page.close());
  const document = normalizeCandidate(
    { profile: { fields: { name: "旧客户稿件" } } },
    [],
    "client-1",
  );
  document.revision = 1;
  await page.addInitScript(fixture, { document });
  await page.addInitScript(() => {
    const ok = (data) => Promise.resolve({ ok: true, data });
    const clients = [
      { id: "client-1", name: "合成客户", knowledgeFiles: [] },
      { id: "client-2", name: "另一客户", knowledgeFiles: [] },
    ];
    window.desktopConsole.content.listClients = () => ok({ clients });
    window.desktopConsole.content.getClientDetails = ({ clientId }) =>
      ok({
        client: clients.find((client) => client.id === clientId),
        research: [],
      });
    const load = window.desktopConsole.geoKnowledge.load;
    window.desktopConsole.geoKnowledge.load = (input) =>
      input.clientId === "client-2"
        ? ok({
            knowledge: null,
            storageStatus: "missing",
            state: { phase: "idle", running: false },
          })
        : load(input);
    const state = window.desktopConsole.geoKnowledge.state;
    window.desktopConsole.geoKnowledge.state = (input) =>
      input.clientId === "client-2"
        ? ok({ state: { phase: "idle", running: false } })
        : state(input);
  });
  await page.goto(url);
  await page.locator("#nav-item-content-production").click();
  await page.getByLabel("当前客户", { exact: true }).selectOption("client-1");
  await page.getByRole("button", { name: "客户知识库", exact: true }).click();
  await page.getByRole("button", { name: "生成知识库", exact: true }).click();
  await page.getByRole("button", { name: "保存要求并开始研究" }).click();
  await page.waitForFunction(() => typeof window.__finishGeo === "function");
  await page.getByLabel("当前客户", { exact: true }).selectOption("client-2");
  await page.getByText(/暂无知识库/).waitFor();
  await page.evaluate(() => window.__finishGeo(false));
  await page.getByRole("button", { name: "生成知识库", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "生成知识库", exact: true })
      .isEnabled(),
    true,
  );
  assert.equal(await page.getByText("旧客户稿件", { exact: true }).count(), 0);
  assert.equal(await page.getByRole("dialog", { name: "研究要求" }).count(), 0);
  assert.equal(await page.evaluate(() => window.__geoCalls.generate), 1);
});


test("legacy knowledge keeps source confirmation and conflict resolution in its auxiliary area", async t => {
  t.after(closeRenderer);
  const { browser, url } = await startRenderer({ port: 4191 });
  const page = await browser.newPage();
  t.after(() => page.close());
  const document = normalizeCandidate({ profile: { fields: { name: "合成客户" } } }, [], "client-1");
  document.sources = [{ id: "source-1", title: "合成公开来源", type: "third_party", url: "https://example.test/customer" }];
  document.restrictions = [{ id: "conflict-1", name: "营业地点冲突", description: "需人工核对", type: "conflict", conflictStatus: "open", claimIds: [] }];
  document.revision = 1;
  await page.addInitScript(fixture, { document: null });
  await page.addInitScript(document => {
    const ok = () => Promise.resolve({ ok: true, data: { knowledge: structuredClone(document), state: { phase: "idle", running: false } } });
    window.desktopConsole.geoKnowledge.load = ok;
    window.desktopConsole.geoKnowledge.confirmSourceType = input => { window.__geoCalls.sources.push(input); document.sources[0].type = input.targetType; document.revision++; return ok(); };
    window.desktopConsole.geoKnowledge.resolveConflict = input => { window.__geoCalls.conflicts.push(input); document.restrictions[0].conflictStatus = "resolved"; document.revision++; return ok(); };
  }, document);
  await page.goto(url);
  await page.locator("#nav-item-content-production").click();
  await page.getByRole("button", { name: "客户知识库", exact: true }).click();
  await page.getByText("研究说明、来源与使用限制", { exact: true }).click();
  await page.getByRole("button", { name: "确认是客户官网", exact: true }).click();
  await page.getByLabel("营业地点冲突确认值").fill("已核对的合成地点");
  await page.getByRole("button", { name: "确认手工值", exact: true }).click();
  await page.waitForFunction(() => window.__geoCalls.conflicts.length === 1);
  assert.equal(await page.getByRole("button", { name: "确认手工值", exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => window.__geoCalls.sources[0].targetType), "official_web");
  assert.equal(await page.evaluate(() => window.__geoCalls.conflicts[0].value), "已核对的合成地点");
  await page.getByRole("button", { name: "GEO 问题", exact: true }).click();
  assert.equal(await page.evaluate(() => window.__geoCalls.generate), 0);
});


test("knowledge long content scrolls inside the workbench and section navigation stays reachable", async t => {
  t.after(closeRenderer);
  const { browser, url } = await startRenderer({ port: 4191 });
  const page = await browser.newPage();
  t.after(() => page.close());
  const titles = ["产品或服务描述", "产品或服务特点", "品牌故事", "用户痛点", "创始人介绍", "社会贡献", "信任背书", "客户案例", "客户评价"];
  const document = normalizeCandidate({ profile: { fields: { name: "合成客户" } } }, [], "client-1");
  document.revision = 1;
  document.deliverable = { version: 1, knowledgeRevision: 1, contentRevision: 1, status: "complete", warnings: [],
    markdown: "# 合成客户知识库\n\n" + titles.map(title => "## " + title + "\n\n" + ("合成阅读样例，说明业务特点与日常使用场景。".repeat(45))).join("\n\n") };
  await page.addInitScript(fixture, { document: null });
  await page.addInitScript(document => {
    window.desktopConsole.geoKnowledge.load = () => Promise.resolve({ ok: true, data: { knowledge: document, storageStatus: "current_v2", state: { phase: "idle", running: false } } });
  }, document);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(url);
  await page.locator("#nav-item-content-production").click();
  await page.getByRole("button", { name: "客户知识库", exact: true }).click();
  for (const size of [{ width: 1280, height: 720 }, { width: 900, height: 600 }]) {
    await page.setViewportSize(size);
    const region = page.getByRole("region", { name: "知识库", exact: true });
    await region.waitFor();
    await page.getByRole("heading", { name: "知识库", exact: true }).waitFor();
    const outerScroll = () => region.evaluate(element => {
      const positions = [];
      for (let parent = element.parentElement; parent; parent = parent.parentElement) positions.push([parent.tagName, parent.className, parent.scrollLeft, parent.scrollTop, parent.clientHeight, parent.scrollHeight]);
      return { positions, windowX: window.scrollX, windowY: window.scrollY };
    });
    const beforeScroll = await outerScroll();
    const box = await region.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 30);
    await page.mouse.wheel(0, 650);
    await page.waitForFunction(() => document.querySelector('[aria-label="知识库"]').scrollTop > 0);
    await page.getByRole("navigation", { name: "知识库板块导航" }).getByRole("button", { name: "客户评价", exact: true }).click();
    assert.deepEqual(await outerScroll(), beforeScroll, "knowledge navigation must not scroll any application ancestor");
    const topbar = await page.locator(".app-topbar").boundingBox();
    const authbar = await page.getByLabel("授权状态", { exact: true }).boundingBox();
    assert.ok(topbar.y >= authbar.y + authbar.height, JSON.stringify({ topbar, authbar, beforeScroll, afterScroll: await outerScroll() }));
    const last = await page.getByRole("heading", { name: "客户评价", exact: true }).boundingBox();
    const nav = await page.getByRole("navigation", { name: "知识库板块导航" }).boundingBox();
    assert.ok(last.y >= nav.y + nav.height, "section heading must not be obscured by sticky navigation");
    assert.ok(last.y + last.height < box.y + box.height, "last section must be reachable within the viewport");
    assert.equal(await region.evaluate(element => element.scrollWidth <= element.clientWidth + 1), true);
    await page.getByRole("navigation", { name: "知识库板块导航" }).getByRole("button", { name: "产品或服务描述", exact: true }).click();
    const first = await page.getByRole("heading", { name: "产品或服务描述", exact: true }).boundingBox();
    assert.ok(first.y >= nav.y + nav.height && first.y < box.y + box.height);
    assert.deepEqual(await outerScroll(), beforeScroll);
    await page.getByRole("button", { name: "问题采集", exact: true }).click();
    const switchedHeader = await page.locator(".app-topbar").boundingBox();
    assert.ok(switchedHeader.y >= authbar.y + authbar.height);
    await page.getByRole("button", { name: "客户知识库", exact: true }).click();
  }
  fs.mkdirSync(path.join(__dirname, "../build/test-results"), { recursive: true });
  await page.screenshot({ path: path.join(__dirname, "../build/test-results/knowledge-scroll.png") });
  await page.locator("#nav-item-settings").click();
  const settingsHeader = await page.locator(".app-topbar").boundingBox();
  const authorization = await page.getByLabel("授权状态", { exact: true }).boundingBox();
  assert.ok(settingsHeader.y >= authorization.y + authorization.height, "switching application pages must preserve the visible header");
});


test("knowledge defaults prioritize saved content and keep optional research inputs collapsed without dropping their values", async t => {
  t.after(closeRenderer);
  const { browser, url } = await startRenderer({ port: 4191 });
  const page = await browser.newPage();
  t.after(() => page.close());
  const document = normalizeCandidate({ profile: { fields: { name: "合成客户" } } }, [], "client-1");
  document.revision = 1;
  document.deliverable = { version: 1, knowledgeRevision: 1, contentRevision: 1, status: "complete", warnings: [], markdown: "# 知识库\n\n## 产品或服务描述\n\n合成服务正文" };
  document.pendingDeliverable = { ...document.deliverable, candidateId: "candidate-1", markdown: "合成候选正文" };
  await page.addInitScript(fixture, { document });
  await page.addInitScript(document => {
    window.desktopConsole.geoKnowledge.load = () => Promise.resolve({ ok: true, data: { knowledge: document, state: { phase: "idle", running: false } } });
    const settings = window.desktopConsole.geoKnowledge.promptSettings;
    window.desktopConsole.geoKnowledge.promptSettings = async () => { const result = await settings(); result.data.clientPrompt = "沿用已保存的长期要求"; return result; };
  }, document);
  await page.goto(url);
  await page.locator("#nav-item-content-production").click();
  await page.getByRole("button", { name: "客户知识库", exact: true }).click();
  assert.equal(await page.getByText("合成服务正文", { exact: true }).isVisible(), true);
  assert.equal(await page.getByText("合成候选正文", { exact: true }).isVisible(), false);
  assert.equal(await page.getByText("研究说明、来源与使用限制", { exact: true }).evaluate(element => element.parentElement.open), false);
  assert.equal(await page.getByRole("button", { name: "GEO 问题", exact: true }).getAttribute("aria-expanded"), "false");
  const missing = page.getByRole("heading", { name: "创始人介绍", exact: true });
  assert.equal(await missing.evaluate(element => element.closest("details").open), false);
  await page.getByRole("navigation", { name: "知识库板块导航" }).getByRole("button", { name: "创始人介绍", exact: true }).click();
  assert.equal(await missing.evaluate(element => element.closest("details").open), true);
  await page.getByRole("heading", { name: "产品或服务描述", exact: true }).click();
  assert.equal(await page.getByText("合成服务正文", { exact: true }).isVisible(), false);
  await page.getByRole("button", { name: "编辑正文", exact: true }).click();
  for (const input of await page.locator("textarea[aria-label]").all()) assert.equal(await input.isVisible(), true);
  await page.getByRole("button", { name: "取消编辑", exact: true }).click();
  await page.getByRole("button", { name: "重新生成知识库", exact: true }).click();
  const longInput = page.getByLabel("客户长期研究要求", { exact: true });
  const temporaryInput = page.getByLabel("本次临时研究要求", { exact: true });
  assert.equal(await longInput.isVisible(), false);
  assert.equal(await temporaryInput.isVisible(), false);
  assert.equal(await longInput.inputValue(), "沿用已保存的长期要求");
  await page.locator("summary").filter({ hasText: "本次临时研究要求" }).click();
  await temporaryInput.fill("本次关注社区使用场景");
  await page.locator("summary").filter({ hasText: "本次临时研究要求" }).click();
  assert.equal(await temporaryInput.isVisible(), false);
  await page.getByRole("button", { name: "保存要求并开始研究" }).click();
  await page.waitForFunction(() => typeof window.__finishGeo === "function");
  assert.equal(await page.getByRole("region", { name: "生成要求", exact: true }).count(), 0);
  assert.deepEqual(await page.evaluate(() => window.__geoCalls.prompts.at(-1)), ["client", "沿用已保存的长期要求"]);
  assert.equal(await page.evaluate(() => window.__geoCalls.temporaryPrompt), "本次关注社区使用场景");
  await page.evaluate(() => window.__finishGeo(false));
  await page.getByRole("button", { name: "重新生成知识库", exact: true }).click();
  assert.equal(await temporaryInput.isVisible(), false);
  assert.equal(await temporaryInput.inputValue(), "");
  assert.equal(await longInput.inputValue(), "沿用已保存的长期要求");
  await page.screenshot({ path: path.join(__dirname, "../build/test-results/knowledge-default-panels.png") });
});

test("a single GEO question opens a new wizard with only that question despite an old batch", async t => {
  t.after(closeRenderer);
  const { browser, url } = await startRenderer({ port: 4191 });
  const page = await browser.newPage();
  t.after(() => page.close());
  const document = normalizeCandidate({ profile: { fields: { name: "合成客户" } } }, [], "client-1");
  document.revision = 1;
  document.geoQuestions = ["问题甲", "问题乙"].map((name, index) => ({ id: `geo-${index}`, name, questionId: `q-${index}`, enabled: true, origin: "manual", sourceIds: [], relatedOfferingIds: [], relatedScenarioIds: [], basis: "derived" }));
  await page.addInitScript(fixture, { document: null });
  await page.addInitScript(document => {
    const ok = data => Promise.resolve({ ok: true, data });
    window.desktopConsole.geoKnowledge.load = () => ok({ knowledge: document, storageStatus: "current_v2", state: { phase: "idle", running: false } });
    window.desktopConsole.geoKnowledge.questionWorkflow = () => ok({ clientId: "client-1", knowledgeRevision: 1, items: document.geoQuestions.map(item => ({ ...item, linkStatus: "linked", collectionEnabled: true, research: { collectedAt: "2026-10-02T00:00:00Z", answerLength: 20, referenceCount: 1 }, articles: { total: 0, publishedCount: 0 }, generation: { ready: true, code: "GEO_GENERATION_READY" } })) });
    window.desktopConsole.content.listTemplateCatalog = () => ok({ revision: "r1", platforms: [{ id: "toutiao", name: "头条" }], templates: [{ id: "custom-1", platform: "toutiao", name: "合成模板", title: "合成模板", source: "custom", enabled: true, body: "合成写作要求" }], diagnostics: [] });
    window.desktopConsole.content.getGenerationRuntimeSnapshot = () => ok({ runtimeId: "gen-1", sequence: 1, runtime: { status: "paused", state: "paused", batchId: "old-batch" }, batch: { id: "old-batch", version: 2, status: "paused", tasks: [], counts: { total: 0, pending: 0, running: 0, succeeded: 0, failed: 0, uncertain: 0, interrupted: 0, cancelled: 0 }, templates: [], questionSources: [] }, capabilities: {} });
  }, document);
  await page.goto(url);
  await page.locator("#nav-item-content-production").click();
  await page.getByRole("button", { name: "客户知识库", exact: true }).click();
  await page.getByRole("button", { name: "GEO 问题", exact: true }).click();
  await page.getByRole("button", { name: "生成文章", exact: true }).nth(1).click();
  await page.getByRole("heading", { name: "选择客户", exact: true }).waitFor();
  assert.equal(await page.getByLabel("四步批量生成").getAttribute("data-view-mode"), "wizard");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByLabel(/合成模板/).check();
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await page.getByText("问题乙", { exact: true }).waitFor();
  const rowA = page.locator("label").filter({ hasText: "问题甲" });
  const rowB = page.locator("label").filter({ hasText: "问题乙" });
  assert.equal(await rowA.getByRole("checkbox").isChecked(), false);
  assert.equal(await rowB.getByRole("checkbox").isChecked(), true);
  assert.equal(await page.getByText("old-batch", { exact: true }).count(), 0);
});

test("client generation shows uncertain work without offering failed-task retry", async t => {
  t.after(closeRenderer);
  const { browser, url } = await startRenderer({ port: 4191 });
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.addInitScript(fixture, { document: null });
  await page.addInitScript(() => {
    const operation = { operationId: "uncertain-operation", clientId: "client-1", articleCount: 1, concurrency: 1, status: "uncertain", counts: { total: 1, pending: 0, running: 0, succeeded: 0, failed: 0, uncertain: 1 }, tasks: [{ index: 0, status: "uncertain", attempts: 1, articleId: null, articleTitle: null, error: { code: "AI_TIMEOUT", message: "结果不确定" } }], createdAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" };
    window.desktopConsole.content.getClientGenerationState = () => Promise.resolve({ ok: true, data: { operation } });
    window.desktopConsole.content.onClientGenerationState = () => () => {};
  });
  await page.goto(url);
  await page.locator("#nav-item-content-production").click();
  await page.getByRole("button", { name: "客户生成", exact: true }).click();
  await page.getByText(/服务商可能已执行，不会自动重试/).waitFor();
  assert.equal(await page.getByRole("button", { name: /重试失败/ }).count(), 0);
  assert.match(await page.getByLabel("客户生成任务进度").innerText(), /已处理 1\/1/);
});

test("uncertain task count retains the result-check entry even with a completed batch summary", async t => {
  t.after(closeRenderer);
  const { browser, url } = await startRenderer({ port: 4191 });
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.addInitScript(fixture, { document: null });
  await page.addInitScript(() => {
    const counts = { total: 2, pending: 0, running: 0, succeeded: 0, failed: 0, uncertain: 1, interrupted: 0, cancelled: 1 };
    const batch = { id: "uncertain-batch", version: 2, status: "completed", counts, tasks: [{ id: "task-a", status: "uncertain", attempts: 1 }, { id: "task-b", status: "cancelled", attempts: 0 }], templates: [], questionSources: [] };
    window.desktopConsole.content.getGenerationRuntimeSnapshot = () => Promise.resolve({ ok: true, data: { runtimeId: "gen-1", sequence: 1, runtime: { status: "completed", state: "idle", batchId: batch.id, counts }, batch, capabilities: {} } });
  });
  await page.goto(url);
  await page.locator("#nav-item-content-production").click();
  await page.getByRole("button", { name: "批量生成", exact: true }).click();
  await page.getByRole("button", { name: "检查结果", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "重新生成（新批次）", exact: true }).isEnabled(), true);
});
