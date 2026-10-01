"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startRenderer, closeRenderer } = require("./helpers/renderer-harness");
const { normalizeCandidate } = require("../src/content/geo-knowledge-merge");
const { mergeKnowledge } = require("../src/content/geo-knowledge-merge");

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
    edits: [],
    config: [],
    prompts: [],
    sources: [],
    conflicts: [],
    confirmations: [],
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
      previewConfirmation: (input) => {
        window.__geoCalls.confirmations.push(input);
        const titles = [
          "客户 / 品牌概况",
          "主要产品与服务",
          "产品 / 服务特点",
          "品牌故事与发展历史",
          "线上公开身份",
          "用户需求与典型场景",
          "核心能力与差异化",
          "团队 / 负责人",
          "资质、授权与信任背书",
          "客户案例",
          "竞对与市场位置",
          "推荐定位 / GEO 推荐角度",
          "核心 GEO 问题",
          "禁止或谨慎使用的表述",
          "请客户确认 / 补充",
        ];
        const result = {
          model: {
            version: 1,
            clientId: knowledge.clientId,
            knowledgeRevision: knowledge.revision,
            generatedAt: knowledge.updatedAt,
            sections: titles.map((title, index) => ({
              id: "section-" + index,
              title,
              entries:
                index === 0
                  ? [
                      {
                        kind: "fact",
                        title: "客户名称",
                        body: knowledge.profile.fields.name,
                        sourceIds: ["client-source"],
                        attributionRequired: false,
                        relatedKnowledgeIds: [knowledge.profile.id],
                      },
                    ]
                  : index === 14
                    ? [
                        {
                          kind: "gap",
                          title: "客户案例",
                          body: "当前资料不足，建议补充。",
                          sourceIds: [],
                          attributionRequired: false,
                          relatedKnowledgeIds: [],
                        },
                      ]
                    : [],
            })),
            confirmationRequests: [
              {
                topic: "客户案例",
                reason: "当前资料不足，建议补充。",
                relatedKnowledgeIds: [],
              },
            ],
          },
        };
        if (window.__delayConfirmationPreview) {
          return new Promise((resolve) => {
            window.__finishConfirmationPreview = () => resolve(ok(result));
          });
        }
        return ok(result);
      },
      exportMarkdown: (input) => {
        window.__geoCalls.exports.push(input);
        if (window.__failConfirmationExport)
          return Promise.resolve({
            ok: false,
            error: { code: "GEO_SAVE_FAILED", userMessage: "确认稿导出失败。" },
          });
        return ok({ markdown: "# 合成客户客户确认稿" });
      },
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
test("unverified model draft is previewable and exportable without a canonical knowledge file", async (t) => {
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
  await page.getByRole("button", { name: "九板块知识稿", exact: true }).click();
  await page.getByText(/模型草稿未通过校验/).waitFor();
  await page.getByText(/未验证但完整保留的正文/).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "生成知识库", exact: true })
      .isEnabled(),
    true,
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出知识稿 Markdown" }).click();
  assert.equal((await download).suggestedFilename(), "九板块知识稿.md");
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
  const sources = [
    { id: "client-source", type: "client_input", title: "客户填写" },
    {
      id: "web-source",
      type: "third_party",
      title: "搜索发现",
      url: "https://example.com",
      fetchedAt: "2026-09-20T00:00:00.000Z",
      citationVerified: true,
    },
  ];
  const original = normalizeCandidate(
    {
      profile: {
        fields: { name: "合成客户" },
        basis: "fact",
        sourceIds: ["client-source"],
      },
      geoQuestions: [{ name: "如何选择服务？", intent: "selection" }],
    },
    sources,
    "client-1",
  );
  const document = mergeKnowledge(
    original,
    normalizeCandidate(
      {
        profile: {
          fields: { name: "候选名称" },
          basis: "fact",
          sourceIds: ["client-source"],
        },
      },
      sources,
      "client-1",
    ),
  );
  document.revision = 1;
  document.deliverable = {
    version: 1,
    knowledgeRevision: 1,
    status: "draft",
    markdown:
      "# 合成客户知识稿\n\n## 产品或服务描述\n\n篇幅不足也保留的完整正文。",
    warnings: ["部分板块篇幅不在600—1000字范围，已保留完整正文。"],
  };
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
  await page.getByRole("dialog", { name: "研究要求" }).waitFor();
  await page.getByLabel(/此客户长期补充要求/).fill("长期要求");
  await page.getByLabel(/本次临时要求/).fill("临时要求");
  await page.getByRole("button", { name: "保存要求并开始研究" }).click();
  assert.equal(await generate.isDisabled(), true);
  await page.evaluate(() => window.__finishGeo(true));
  await page
    .getByRole("alert")
    .filter({ hasText: "请先配置豆包 GEO" })
    .waitFor();
  await page.getByText(/GEO_CONFIG_REQUIRED/).waitFor();
  await page.getByText(/失败阶段：R4 · EEAAP/).waitFor();
  await page.getByRole("button", { name: "保存要求并开始研究" }).click();
  await page.evaluate(() => {
    window.__failNextGeoState = true;
  });
  await page
    .getByRole("alert")
    .filter({ hasText: "临时进度读取失败" })
    .waitFor();
  await page.evaluate(() => window.__finishGeo(false));
  await page.getByRole("alert").waitFor({ state: "detached" });
  await page
    .getByRole("region", { name: "九板块知识稿" })
    .getByText(/篇幅不足也保留的完整正文/)
    .waitFor();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出知识稿 Markdown" }).click();
  assert.equal((await downloadPromise).suggestedFilename(), "九板块知识稿.md");
  assert.equal(await page.evaluate(() => window.__geoCalls.generate), 2);
  await page.getByRole("button", { name: "客户知识", exact: true }).click();
  await page
    .getByRole("button", { name: /客户基本信息/ })
    .first()
    .click();
  await page.getByRole("button", { name: "编辑并锁定" }).click();
  await page.getByLabel("客户名称", { exact: true }).fill("人工合成名称");
  await page.getByRole("button", { name: "保存并锁定" }).click();
  await page
    .getByLabel("知识详情")
    .getByText("人工合成名称", { exact: true })
    .waitFor();
  assert.equal(
    await page.evaluate(() => window.__geoCalls.edits[0].revision),
    1,
  );
  await page.evaluate(() => {
    window.__delayConfirmationPreview = true;
  });
  await page.getByRole("button", { name: "客户确认稿", exact: true }).click();
  await page.waitForFunction(
    () => window.__geoCalls.confirmations.length === 1,
  );
  await page.getByRole("button", { name: "客户知识", exact: true }).click();
  await page.getByRole("button", { name: "编辑并锁定" }).click();
  await page.getByLabel("客户名称", { exact: true }).fill("并发后名称");
  await page.getByRole("button", { name: "保存并锁定" }).click();
  await page.evaluate(() => {
    window.__delayConfirmationPreview = false;
    window.__finishConfirmationPreview();
  });
  await page.waitForTimeout(20);
  await page.getByRole("button", { name: "客户确认稿", exact: true }).click();
  await page
    .getByRole("region", { name: "客户确认稿" })
    .getByText("并发后名称", { exact: true })
    .waitFor();
  await page.getByText("当前资料不足，建议补充。", { exact: true }).waitFor();
  assert.equal(
    await page.evaluate(() => window.__geoCalls.confirmations.at(-1).revision),
    3,
  );
  await page.evaluate(() => {
    window.__failConfirmationExport = true;
  });
  await page.getByRole("button", { name: "导出 Markdown" }).click();
  await page.getByRole("alert").filter({ hasText: "确认稿导出失败" }).waitFor();
  await page.evaluate(() => {
    window.__failConfirmationExport = false;
  });
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
  await page.getByRole("button", { name: "问题采集", exact: true }).click();
  await page.getByText("如何选择服务？", { exact: true }).waitFor();
  await page.getByRole("button", { name: "客户知识库", exact: true }).click();
  await page.getByRole("button", { name: "GEO 问题", exact: true }).click();
  await page
    .getByRole("button", { name: "查看回答与关联：如何选择服务？" })
    .click();
  await page
    .getByText("合成客户提供服务，详情以实际核对为准。", { exact: true })
    .waitFor();
  await page.getByText(/客户名称字面出现：是/).waitFor();
  await page.getByText("关联文章：1 篇 · 已发布：1 篇").waitFor();
  await page.getByRole("button", { name: "来源", exact: true }).click();
  await page
    .getByText(/支持的确认稿内容：客户 \/ 品牌概况：客户名称/)
    .waitFor();
  await page.getByRole("button", { name: "确认是客户官网" }).click();
  assert.equal(
    await page.evaluate(() => window.__geoCalls.sources[0].targetType),
    "official_web",
  );
  await page.getByRole("button", { name: "待确认", exact: true }).click();
  await page
    .getByRole("button", { name: /采用：/ })
    .first()
    .click();
  assert.equal(
    await page.evaluate(() => window.__geoCalls.conflicts.length),
    1,
  );
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
  await page.waitForFunction(() => {
    const field = document.querySelector('textarea[aria-label="全局研究要求"]');
    return field && field.value === "默认要求";
  });
  assert.equal(await page.getByLabel("全局研究要求").inputValue(), "默认要求");
  await page.getByLabel("全局研究要求").fill("设置中的全局要求");
  await page.getByRole("button", { name: "保存全局研究要求" }).click();
  await page.getByText("全局研究要求已保存。").waitFor();
  await page.getByRole("button", { name: "恢复内置默认" }).click();
  await page.waitForFunction(() => window.__geoCalls.prompts.length === 4);
  assert.equal(await page.getByLabel("全局研究要求").inputValue(), "默认要求");
  assert.equal(
    await page.getByLabel("最终知识稿提示词").inputValue(),
    "默认知识稿要求",
  );
  await page.getByLabel("最终知识稿提示词").fill("自定义交付要求");
  await page.getByRole("button", { name: "保存最终知识稿提示词" }).click();
  await page.getByText("最终知识稿提示词已保存。").waitFor();
  assert.equal(await page.getByLabel("全局研究要求").inputValue(), "默认要求");
  await page.getByRole("button", { name: "恢复知识稿默认提示词" }).click();
  await page.waitForFunction(() => window.__geoCalls.prompts.length === 6);
  assert.equal(
    await page.getByLabel("最终知识稿提示词").inputValue(),
    "默认知识稿要求",
  );
  await page.getByLabel("模型 / Endpoint ID").fill("synthetic-model");
  await page.getByLabel("API Key", { exact: true }).fill("synthetic-secret");
  await page.getByRole("button", { name: "保存豆包 GEO 配置" }).click();
  await page.getByText("豆包 GEO 配置已保存。").waitFor();
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await page.getByText(/连接测试通过：/).waitFor();
  await page.getByRole("button", { name: "测试联网搜索", exact: true }).click();
  await page.getByText("联网测试通过，返回 1 条可核验引用。").waitFor();
  await page.evaluate(() => {
    window.__geoTestFail = true;
  });
  await page.getByRole("button", { name: "测试连接", exact: true }).click();
  await page.getByText(/鉴权失败（401）/).waitFor();
  assert.equal(await page.getByText("private upstream text").count(), 0);
  assert.equal(
    await page.evaluate(() => window.__geoCalls.config[0].baseUrl),
    "https://ark.cn-beijing.volces.com/api/plan/v3",
  );
  await page
    .getByLabel("接口 / Base URL")
    .selectOption("https://ark.cn-beijing.volces.com/api/v3");
  assert.equal(
    await page
      .getByRole("button", { name: "测试连接", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(await page.getByText(/鉴权失败（401）/).count(), 0);
  await page.getByText(/标准方舟地址不消耗 Coding Plan/).waitFor();
  await page
    .getByLabel("接口 / Base URL")
    .selectOption("https://ark.cn-beijing.volces.com/api/plan/v3");
  assert.equal(
    await page.getByLabel("API Key", { exact: true }).inputValue(),
    "",
  );
  assert.equal(await page.evaluate(() => window.__geoCalls.generate), 2);
  assert.equal(
    await page.evaluate(() => window.__geoCalls.temporaryPrompt),
    "临时要求",
  );
  assert.deepEqual(await page.evaluate(() => window.__geoCalls.prompts), [
    ["client", "长期要求"],
    ["client", "长期要求"],
    ["global", "设置中的全局要求"],
    ["global", ""],
    ["final", "自定义交付要求"],
    ["final", ""],
  ]);
});
