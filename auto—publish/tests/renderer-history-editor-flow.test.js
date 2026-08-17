const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { closeRenderer, startRenderer } = require("./helpers/renderer-harness");

const rootDir = path.resolve(__dirname, "..");
const rendererUrl = "http://127.0.0.1:4174/";
const clientId = "history-editor-fixture";
const platformId = "fixture-platform";
const templateId = "fixture-history-template";
const publishedArticleId = "published-article";
const selectedArticleId = "selected-article-09";

let browser;

function result(data) {
  return Promise.resolve({ ok: true, data });
}

function makeArticle(id, title, index, overrides) {
  return Object.assign({
    id,
    clientId,
    researchQueryIds: [],
    platform: platformId,
    scenario: "历史编辑回归",
    templateId,
    title,
    content: `这是 ${title} 的正文，用于验证历史文章编辑器的上下文保持。`,
    status: "generated",
    source: { client_material: true, doubao_answer: true, references: false, template: true },
    createdAt: `2026-07-18T00:${String(index).padStart(2, "0")}:00.000Z`,
    updatedAt: `2026-07-18T00:${String(index).padStart(2, "0")}:00.000Z`,
    templateSnapshot: {
      platform: platformId,
      id: templateId,
      name: "历史文章超长模板名称用于边界回归",
      scenario: "历史编辑回归",
      body: "用于测试历史列表分组展开、筛选、选择和滚动上下文的模板正文。",
      bodyHash: "fixture-template-hash",
      source: "custom"
    }
  }, overrides || {});
}

function makePublicationRecord(articleId) {
  return {
    version: 1,
    publicationId: "publication-published-article",
    clientId,
    articleId,
    articleKey: `generated:${clientId}:${articleId}`,
    targetKey: "platform:fixture-published",
    platformId: platformId,
    mediaResourceId: null,
    displayName: "测试发布目标",
    status: "published",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    attempts: [{
      attemptId: "attempt-published-1",
      status: "published",
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
      startedAt: "2026-07-18T00:00:00.000Z",
      finishedAt: "2026-07-18T00:00:00.000Z",
      remoteId: "fixture-remote-id",
      remoteUrl: "https://example.invalid/fixture-publication",
      errorCode: null,
      reasonCode: null
    }],
    attemptId: "attempt-published-1",
    remoteId: "fixture-remote-id",
    remoteUrl: "https://example.invalid/fixture-publication",
    errorCode: null,
    reasonCode: null
  };
}

function createFixture({
  missingWorkflowArticleId = null,
  delayedPaidPreview = false,
  favoriteResources,
} = {}) {
  const longPrefix = "编辑上下文 长标题回归文章";
  const selectedArticle = makeArticle(
    selectedArticleId,
    `${longPrefix} 09：这是用于验证筛选展开选择滚动和焦点恢复的超长标题，不能被行尾动作挤出窗口`,
    9
  );
  const publishedArticle = makeArticle(
    publishedArticleId,
    `${longPrefix} 已发布文章：发布事实不得修改原文章和发布记录`,
    20,
    { status: "saved" }
  );
  const articles = [publishedArticle, ...Array.from({ length: 12 }, (_, index) => index === 9 ? selectedArticle : makeArticle(
    `selected-article-${String(index).padStart(2, "0")}`,
    `${longPrefix} ${String(index).padStart(2, "0")}：这是一段足够长的历史文章标题，用来验证窄宽度下的行尾操作仍在 viewport 内`,
    index
  ))];
  const resources = [
    { resourceId: "fixture-resource", name: "测试付费媒体", price: 12, type: "image", createdAt: "2026-07-18T00:00:00.000Z" },
    { resourceId: "fixture-resource-2", name: "第二付费媒体", price: 20, type: "image", createdAt: "2026-07-18T00:00:00.000Z" },
    { resourceId: "unquoted-resource", name: "未收藏媒体", price: 30, type: "image", createdAt: "2026-07-18T00:00:00.000Z" },
  ];
  return {
    articles,
    selectedArticle,
    publishedArticle,
    publishedArticleId,
    missingWorkflowArticleId,
    delayedPaidPreview,
    resources,
    favoriteResources: favoriteResources === undefined ? resources.slice(0, 2) : favoriteResources,
    publicationRecords: [makePublicationRecord(publishedArticle.id)]
  };
}

function installDesktopFixture(page, fixture) {
  return page.addInitScript((input) => {
    const state = {
      articles: input.articles,
      publicationRecords: input.publicationRecords,
      submittedArticleIds: [],
      removalTransaction: null,
      removalPolls: 0,
      removalListeners: [],
      calls: { saveArticle: [], submission: [], paidPreview: [], regularPreview: [], regularAdmission: [], removalRetries: 0 }
    };
    const ok = (data) => Promise.resolve({ ok: true, data });
    const client = { id: "history-editor-fixture", name: "历史文章编辑测试客户", knowledgeFiles: [] };
    const otherClient = { id: "history-editor-other", name: "另一个客户", knowledgeFiles: [] };
    const template = {
      id: "fixture-history-template",
      platform: "fixture-platform",
      scenario: "历史编辑回归",
      name: "历史文章超长模板名称用于边界回归",
      body: "fixture template body",
      bodyHash: "fixture-template-hash",
      source: "custom"
    };
    const workflowFor = (article) => {
      if (input.missingWorkflowArticleId === article.id) return null;
      const published = article.id === input.publishedArticleId;
      const submitted = state.submittedArticleIds.includes(article.id);
      return {
        version: 1,
        stage: published ? "published" : submitted ? "in_submission" : "pending_submission",
        label: published ? "已发布" : submitted ? "投稿中" : "待投稿",
        primaryAction: published ? "view_publication" : submitted ? "view_submission" : "submit",
        allowedBulkActions: published ? [] : submitted ? ["trash"] : ["submit", "trash"],
        locks: {
          canEdit: !published && !submitted,
          canSubmit: !published && !submitted,
          canCancel: false,
          canTrash: !published
        },
        operations: {
          edit: { allowed: !published && !submitted, reasonCodes: [], safeMetadata: {} },
          submit: { allowed: !published && !submitted, reasonCodes: [], safeMetadata: {} },
          trash: { allowed: !published, reasonCodes: [], safeMetadata: {} },
          restore: { allowed: false, reasonCodes: [], safeMetadata: {} },
          purge: { allowed: false, reasonCodes: [], safeMetadata: {} }
        },
        publicationSummary: published
          ? { status: "published", label: "已发布", records: 1, published: 1, uncertain: false }
          : { status: "none", label: "未发布", records: 0, published: 0, uncertain: false }
      };
    };
    const content = {
      listClients: () => ok({ clients: [client, otherClient] }),
      listGeneratedArticles: () => ok({ articles: state.articles }),
      getArticleManagementSnapshot: () => {
        const workflowItems = state.articles.reduce((items, article) => { const workflow = workflowFor(article); if (workflow) items.push({ articleId: article.id, workflow }); return items; }, []);
        const lifecycleCounts = workflowItems.reduce((counts, item) => {
          counts[item.workflow.stage] += 1;
          counts.total += 1;
          return counts;
        }, { pending_submission: 0, needs_completion: 0, in_submission: 0, published: 0, trash: 0, total: 0 });
        return ok({ clientId: client.id, revision: 1, articles: state.articles, trash: [], publicationRecords: state.publicationRecords, submissionPlatforms: [{ id: "fixture-platform", displayName: "测试投稿平台", contentQueueImport: true }], workflowItems, lifecycleCounts });
      },
      listSubmissionBatches: () => ok({ batches: [] }),
      listArticleTrash: () => ok({ trash: [] }),
      listResearch: () => ok({ research: [] }),
      listQuestions: () => ok({ questions: [] }),
      getDoubaoLoginState: () => ok({ loginState: { status: "unknown" } }),
      getDoubaoQueueState: () => ok({ queue: { status: "idle", currentTaskId: null, completed: 0, total: 0, waitRemainingMs: 0, tasks: [] } }),
      onDoubaoQueueState: () => () => {},
      listTemplates: () => ok({ templates: [template] }),
      listTemplateCatalog: () => ok({ revision: "fixture", platforms: [{ id: template.platform, displayName: "测试模板平台", description: "", order: 1 }], templates: [template], diagnostics: [] }),
      retryMaterial: () => ok({}),
      generateArticle: () => ok(state.articles[0]),
      getArticleEditor: ({ articleId }) => {
        const article = state.articles.find((item) => item.id === articleId);
        return ok({ article, editFingerprint: `fixture-edit-${articleId}` });
      },
      saveArticle: ({ article }) => {
        state.calls.saveArticle.push(article);
        state.articles = state.articles.map((item) => item.id === article.id ? article : item);
        return ok({ outcome: "saved", article, editFingerprint: `fixture-edit-${article.id}-saved` });
      },
      listPaidMediaBatches: () => ok({ items: [] }),
      startPaidMediaBatch: () => ok({}),
      pausePaidMediaBatch: () => ok({}),
      previewRegularQueueAdmission: (input) => {
        state.calls.regularPreview.push(input);
        return ok({ queueableCount: input.articleRefs.length, idempotentCount: 0, missingCount: 0, conflictCount: 0 });
      },
      admitRegularQueueItems: (input) => {
        state.calls.regularAdmission.push(input);
        state.submittedArticleIds.push(...input.articleRefs.map((article) => article.articleId));
        return ok({ admittedCount: input.articleRefs.length });
      },
      previewPaidMediaPreflight: ({ articleRefs, mediaResourceId }) => {
        state.calls.paidPreview.push(mediaResourceId);
        const model = {
        version: 1,
        status: "ready",
        canConfirm: true,
        confirmationToken: "paid-confirmation-token",
        confirmationFingerprint: "paid-fingerprint",
        articleRefs,
        articleCount: articleRefs.length,
        articles: articleRefs.map((articleRef) => ({ articleRef, articleId: articleRef.articleId, title: "待确认付费文章", contentFingerprint: "content-fingerprint", status: "ready", reasonCodes: [], riskCodes: [] })),
        mediaResourceId,
        mediaName: "测试付费媒体",
        mediaRemarks: "合成测试报价",
        resourceFingerprint: "resource-fingerprint",
        resourceAvailable: true,
        quotedPrice: 12,
        estimatedTotal: articleRefs.length * 12,
        systemSubmissionCode: "fixture-submission-code",
        blockers: [],
        risks: [],
        createdAt: "2026-07-18T00:00:00.000Z",
        expiresAt: "2026-07-18T01:00:00.000Z"
        };
        return input.delayedPaidPreview
          ? new Promise((resolve) => window.setTimeout(() => resolve({ ok: true, data: model }), 250))
          : ok(model);
      },
      confirmPaidMediaBatch: ({ confirmationToken }) => {
        state.calls.submission.push(confirmationToken);
        state.submittedArticleIds.push("selected-article-09");
        return ok({ batchId: "paid-batch-fixture", targetKey: "media:fixture-resource", mediaResourceId: "fixture-resource", status: "queued", articleCount: 1, idempotent: false, items: [], articleRefs: [{ clientId: "history-editor-fixture", articleId: "selected-article-09" }], confirmationFingerprint: "paid-fingerprint", quotedPrice: 12, estimatedTotal: 12 });
      },
      previewArticleRemovalImpact: (input) => ok({ articleCount: input.selections.length, blockedItems: [], canCommit: true, selections: input.selections }),
      applyArticleRemovalImpact: (input) => {
        const transaction = { transactionId: "removal-fixture-1", status: "needs_repair", phase: "needs_repair", errorCode: "PUBLICATION_ATTEMPT_MISMATCH", reasonCode: "PUBLICATION_ATTEMPT_MISMATCH", updatedAt: "2026-07-18T00:30:00.000Z" };
        state.removalTransaction = transaction;
        return ok({ transactionId: transaction.transactionId, status: transaction.status, phase: transaction.phase, errorCode: transaction.errorCode, reasonCode: transaction.reasonCode, articleCount: input.selections.length });
      },
      getArticleRemovalTransaction: (transactionId) => {
        if (state.removalTransaction?.transactionId === transactionId && state.removalTransaction.status === "pending_auto_recovery") state.removalPolls += 1;
        return ok({ transaction: state.removalTransaction });
      },
      onArticleRemovalTransaction: (listener) => { state.removalListeners.push(listener); return () => { state.removalListeners = state.removalListeners.filter((item) => item !== listener); }; },
      retryArticleRemovalTransaction: (input) => {
        state.calls.removalRetries += 1;
        state.removalPolls = 0;
        state.removalTransaction = { transactionId: input.transactionId, status: "pending_auto_recovery", phase: "queue-actions", updatedAt: "2026-07-18T00:30:01.000Z" };
        window.setTimeout(() => {
          state.removalTransaction = { ...state.removalTransaction, status: "committed", phase: "committed", errorCode: null, reasonCode: null, updatedAt: "2026-07-18T00:30:03.000Z" };
          state.removalListeners.forEach((listener) => listener(state.removalTransaction));
        }, 300);
        return ok({ transaction: state.removalTransaction });
      },
      restoreArticle: () => ok({}),
      preparePermanentDeleteArticle: () => ok({ token: "fixture-token" }),
      permanentlyDeleteArticle: () => ok({ deleted: true })
    };
    const runtime = { get: () => ok({ ok: true, buildInfo: { version: "1.0.1", commit: "history-editor-flow", dirty: false }, browserChannel: { channel: "chromium", configured: true, state: "ready", probed: true, source: "fixture", errorCode: null, lastCheckedAt: null }, capabilities: { playwrightNode: { state: "ready", source: "fixture", errorCode: null, lastCheckedAt: null }, playwrightCli: { state: "ready", source: "fixture", errorCode: null, lastCheckedAt: null }, browserChannel: { state: "ready", source: "fixture", errorCode: null, lastCheckedAt: null }, docx: { state: "ready", source: "fixture", errorCode: null, lastCheckedAt: null }, hepan: { state: "optional_unconfigured", source: "fixture", errorCode: "HEPAN_PYTHON_UNAVAILABLE", lastCheckedAt: null } }, errors: [], warnings: [] }), browserSmoke: () => ok({ ok: true, browserChannel: "chromium", session: "fixture" }) };
    const workspace = { getBootstrapState: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }), getCurrent: () => ok({ workspacePath: "fixture", envOverride: false, validation: { ok: true, errors: [], warnings: [] } }), openCurrent: () => ok(undefined), requestSwitch: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }), chooseDirectory: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }), confirmSelection: () => ok({ state: "ready" }), cancelSelection: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }) };
    const media = {
      scanArticles: () => ok([]),
      getResourcePage: () => ok({ items: input.resources, total: input.resources.length, page: 1, pageSize: 100 }),
      getPool: ({ page, pageSize, resourceIds }) => {
        const total = input.favoriteResources.length;
        const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
        const resolvedPage = totalPages === 0 ? 1 : Math.min(page, totalPages);
        const items = input.favoriteResources.slice((resolvedPage - 1) * pageSize, resolvedPage * pageSize);
        const favoriteIds = new Set(input.favoriteResources.map((item) => item.resourceId));
        return ok({
          items,
          memberResourceIds: resourceIds.filter((resourceId) => favoriteIds.has(resourceId)),
          total,
          page: resolvedPage,
          pageSize,
          totalPages,
          hasPrev: resolvedPage > 1,
          hasNext: resolvedPage < totalPages,
        });
      },
      getBalance: () => ok({ balance: "0" }),
    };
    const orders = { getOrders: () => ok([]) };
    const aiProvider = { getStatus: () => ok({ configured: false, source: "application", apiKeyMask: "", lastTest: null }), save: () => ok({}), testConnection: () => ok({}), clear: () => ok({ cleared: true }) };
    const platformSettings = { getStatus: () => ok({ configured: false, source: "application", baseUrl: "", timeoutMs: 30000, allowInsecure: false, transport: "未配置", apiKeyMask: "", lastTest: null }), save: () => ok({}), test: () => ok({ testedAt: "", ok: true, code: "OK" }), clear: () => ok({ cleared: true }) };
    const storageMaintenance = { getUsage: () => ok({ logs: { bytes: 0, files: 0 }, temporary: { bytes: 0, files: 0 }, docxCache: { bytes: 0, files: 0 }, profiles: { bytes: 0, files: 0 } }), cleanCaches: () => ok({ blocked: false }) };
    window.__historyEditorFlow = state;
    window.desktopConsole = {
      auth: { getState: () => ok({ authenticated: true, user: { loginName: "admin" }, entitlements: [{ product: "AutoPublish", enabled: true, expiresAt: null }] }), login: () => ok({ authenticated: true }), refresh: () => ok({ authenticated: true }), logout: () => ok({ authenticated: false }), onStateChanged: () => () => {} },
      workspace,
      workspaceData: { getRuntimeIdentity: () => ok({ workspaceRuntimeId: "history-runtime", revision: 1 }), onInvalidated: () => () => {} },
      runtimeDiagnostics: runtime,
      aiProvider,
      platformSettings,
      storageMaintenance,
      media,
      orders,
      platforms: { getQueue: () => ok({ platforms: [], queue: [] }), listAccountProfiles: () => ok({ profiles: [{ accountProfileId: "fixture-account-1", platformId: "fixture-platform", displayName: "测试账号" }] }), confirmAccountProfile: () => ok({ profile: { accountProfileId: "fixture-account-1", platformId: "fixture-platform", displayName: "测试账号" } }) },
      content
    };
  }, fixture);
}

async function openHistory(width = 1128, height = 527, fixtureOptions) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(5000);
  page.on("pageerror", (error) => process.stderr.write(`renderer page error: ${error.message}\n`));
  const fixture = createFixture(fixtureOptions);
  await installDesktopFixture(page, fixture);
  await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
  await page.locator("#nav-item-article-library").waitFor();
  await page.locator("#nav-item-article-library").click();
  await page.getByRole("heading", { name: "文章库" }).waitFor();
  await page.getByRole("tab", { name: "全部" }).click();
  return { page, fixture };
}

function historyPane(page) {
  return page.locator("div.h-full.overflow-y-auto").filter({ has: page.getByRole("heading", { name: "文章库" }) }).first();
}

describe("renderer history editor flow", { concurrency: false }, () => {
  before(async () => {
    ({ browser } = await startRenderer({ port: 4174 }));
  });
  after(closeRenderer);

  it("opens on the current client's pending-submission articles and badges that count", async () => {
    const page = await browser.newPage({ viewport: { width: 1128, height: 527 } });
    page.setDefaultTimeout(5000);
    const fixture = createFixture();
    await installDesktopFixture(page, fixture);
    try {
      await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: "文章库" }).waitFor();
      assert.equal(
        await page.getByRole("tab", { name: "待投稿 (12)" }).getAttribute("aria-selected"),
        "true",
      );
      assert.equal(
        await page.locator("#nav-item-article-library .sidebar-badge").innerText(),
        "12",
      );
      assert.equal(
        await page.locator("#nav-item-article-library .sidebar-badge").getAttribute("title"),
        "当前客户待投稿文章数",
      );
      await page.getByRole("button", { name: /fixture-platform.*历史文章超长模板名称/ }).click();
      assert.equal(await page.getByText(fixture.publishedArticle.title, { exact: true }).count(), 0);
      assert.equal(await page.getByText(fixture.selectedArticle.title, { exact: true }).count(), 1);
    } finally {
      await page.close();
    }
  });

  it("keeps history mounted and restores filter, expansion, selection, scroll, and focus", async () => {
    const { page, fixture } = await openHistory();
    try {
      const pane = historyPane(page);
      const filter = page.getByRole("textbox", { name: "筛选文章库" });
      await filter.fill("编辑上下文");
      const group = page.getByRole("button", { name: /fixture-platform.*历史文章超长模板名称/ });
      await group.click();
      const checkbox = page.getByRole("checkbox", { name: `选择 ${fixture.selectedArticle.title}` });
      await checkbox.check();
      const scrollTop = await pane.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
        return element.scrollTop;
      });
      assert.ok(scrollTop > 0, "history fixture must exercise a scrolled list");
      const sourceTitle = page.getByText(fixture.selectedArticle.title, { exact: true });
      const sourceButton = sourceTitle.locator("..");
      await sourceTitle.click();

       await page.getByLabel("文章标题", { exact: true }).waitFor();
      assert.equal(await page.getByRole("heading", { name: "文章库" }).isVisible(), true);
      assert.equal(await filter.inputValue(), "编辑上下文");
      assert.equal(await checkbox.isChecked(), true);
      assert.equal(await sourceTitle.isVisible(), true);
      assert.equal(await page.getByText("选择客户资料与有效回答", { exact: true }).count(), 0, "opening history must not mount the generation source form");
       assert.equal(await page.getByLabel("文章标题", { exact: true }).evaluate((element) => document.activeElement === element), true, "editor title receives focus");

      await page.getByRole("button", { name: "关闭文章编辑器" }).click();
      assert.equal(await page.getByRole("heading", { name: "文章库" }).isVisible(), true);
      assert.equal(await filter.inputValue(), "编辑上下文");
      assert.equal(await checkbox.isChecked(), true);
      assert.equal(await sourceButton.evaluate((element) => document.activeElement === element), true, "closing restores focus to the source row");
      assert.ok(await pane.evaluate((element) => element.scrollTop > 0), "closing preserves the history scroll position");
    } finally {
      await page.close();
    }
  });

  it("fails closed when the authoritative workflow entry is missing", async () => {
    const { page, fixture } = await openHistory(1128, 527, { missingWorkflowArticleId: selectedArticleId });
    try {
      await page.getByRole("textbox", { name: "筛选文章库" }).fill("编辑上下文");
      await page.getByRole("button", { name: /fixture-platform.*历史文章超长模板名称/ }).click();
      const sourceTitle = page.getByText(fixture.selectedArticle.title, { exact: true });
      const sourceButton = sourceTitle.locator("..");

      assert.equal(await sourceButton.isDisabled(), true);
      assert.equal(await sourceButton.getAttribute("aria-disabled"), "true");
      await sourceButton.dispatchEvent("click");
      assert.equal(await page.getByRole("heading", { name: "编辑文章" }).count(), 0);
      assert.equal(await page.getByLabel("文章标题", { exact: true }).count(), 0);
      assert.equal(await page.getByLabel("文章正文", { exact: true }).count(), 0);
      assert.equal(await page.getByRole("button", { name: "保存文章" }).count(), 0);
      assert.equal(await page.evaluate(() => window.__historyEditorFlow.calls.saveArticle.length), 0);
    } finally {
      await page.close();
    }
  });

  it("confirms paid media only from the article-library intake after preflight", async () => {
    const { page, fixture } = await openHistory();
    try {
      await page.getByRole("textbox", { name: "筛选文章库" }).fill("编辑上下文");
      await page.getByRole("button", { name: /fixture-platform.*历史文章超长模板名称/ }).click();
      await page.getByRole("checkbox", { name: `选择 ${fixture.selectedArticle.title}` }).check();
      await page.getByRole("button", { name: /发起投稿 \(1\)/ }).click();
      const intake = page.getByRole("dialog", { name: "发起投稿" });
      await intake.getByRole("tab", { name: "付费媒体" }).click();
      assert.equal(await intake.getByLabel("付费媒体资源").count(), 0);
      await intake.getByRole("button", { name: "选择收藏媒体" }).click();
      const selector = page.getByRole("dialog", { name: "选择收藏媒体" });
      await selector.waitFor();
      assert.equal(await selector.getByText("测试付费媒体", { exact: true }).count(), 1);
      assert.equal(await selector.getByText("第二付费媒体", { exact: true }).count(), 1);
      assert.equal(await selector.getByText("未收藏媒体", { exact: true }).count(), 0);
      await selector.getByRole("button", { name: "选择收藏媒体 测试付费媒体" }).click();
      await intake.getByRole("button", { name: "检查费用与文章" }).click();
      const preflight = page.getByRole("dialog", { name: "付费媒体费用确认" });
      await preflight.waitFor();
      assert.equal(await preflight.getByText("¥12.00 / ¥12.00", { exact: true }).count(), 1);
      await preflight.getByRole("button", { name: "确认付费投稿" }).evaluate((button) => {
        button.click();
        button.click();
      });
      await page.getByRole("status").filter({ hasText: "已确认 1 篇文章进入付费投稿批次" }).waitFor();
      assert.deepEqual(await page.evaluate(() => window.__historyEditorFlow.calls.submission), ["paid-confirmation-token"]);
    } finally {
      await page.close();
    }
  });

  it("shows an actionable empty state when no media are favorited", async () => {
    const { page, fixture } = await openHistory(1128, 527, { favoriteResources: [] });
    try {
      await page.getByRole("textbox", { name: "筛选文章库" }).fill("编辑上下文");
      await page.getByRole("button", { name: /fixture-platform.*历史文章超长模板名称/ }).click();
      await page.getByRole("checkbox", { name: `选择 ${fixture.selectedArticle.title}` }).check();
      await page.getByRole("button", { name: /发起投稿 \(1\)/ }).click();
      const intake = page.getByRole("dialog", { name: "发起投稿" });
      await intake.getByRole("tab", { name: "付费媒体" }).click();
      await intake.getByRole("button", { name: "选择收藏媒体" }).click();
      const selector = page.getByRole("dialog", { name: "选择收藏媒体" });
      await selector.getByText("还没有收藏媒体", { exact: true }).waitFor();
      assert.match(await selector.innerText(), /媒体资源.*收藏常用媒体/);
      assert.equal(await intake.getByRole("button", { name: "检查费用与文章" }).isDisabled(), true);
    } finally {
      await page.close();
    }
  });

  it("selects a favorite media resource from a later pool page", async () => {
    const favoriteResources = Array.from({ length: 101 }, (_, index) => ({
      resourceId: `favorite-${String(index + 1).padStart(3, "0")}`,
      name: `收藏媒体 ${String(index + 1).padStart(3, "0")}`,
      price: index + 1,
      type: "image",
      createdAt: "2026-07-18T00:00:00.000Z",
    }));
    const { page, fixture } = await openHistory(1128, 527, { favoriteResources });
    try {
      await page.getByRole("textbox", { name: "筛选文章库" }).fill("编辑上下文");
      await page.getByRole("button", { name: /fixture-platform.*历史文章超长模板名称/ }).click();
      await page.getByRole("checkbox", { name: `选择 ${fixture.selectedArticle.title}` }).check();
      await page.getByRole("button", { name: /发起投稿 \(1\)/ }).click();
      const intake = page.getByRole("dialog", { name: "发起投稿" });
      await intake.getByRole("tab", { name: "付费媒体" }).click();
      await intake.getByRole("button", { name: "选择收藏媒体" }).click();
      const selector = page.getByRole("dialog", { name: "选择收藏媒体" });
      await selector.getByText(/第 1\/3 页/).waitFor();
      await selector.getByRole("button", { name: "下一页" }).click();
      await selector.getByText(/第 2\/3 页/).waitFor();
      await selector.getByRole("button", { name: "下一页" }).click();
      await selector.getByText(/第 3\/3 页/).waitFor();
      await selector.getByRole("button", { name: "选择收藏媒体 收藏媒体 101" }).click();
      assert.match(await intake.innerText(), /收藏媒体 101/);
      assert.equal(await intake.getByRole("button", { name: "检查费用与文章" }).isDisabled(), false);
    } finally {
      await page.close();
    }
  });

  it("keeps regular admission inside one cancelable ephemeral session", async () => {
    const { page, fixture } = await openHistory();
    try {
      await page.getByRole("textbox", { name: "筛选文章库" }).fill("编辑上下文");
      await page.getByRole("button", { name: /fixture-platform.*历史文章超长模板名称/ }).click();
      await page.getByRole("checkbox", { name: `选择 ${fixture.selectedArticle.title}` }).check();
      await page.getByRole("button", { name: /发起投稿 \(1\)/ }).click();
      const intake = page.getByRole("dialog", { name: "发起投稿" });
      await intake.getByLabel("普通平台投稿目标").selectOption("fixture-platform");
      await intake.getByRole("button", { name: "确认发起投稿" }).evaluate((button) => {
        button.click();
        button.click();
      });
      const confirmation = page.getByRole("dialog").filter({ hasText: "确认发起普通平台投稿" });
      await confirmation.getByRole("button", { name: "取消" }).click();
      assert.equal(await intake.isVisible(), true);
      assert.deepEqual(await page.evaluate(() => window.__historyEditorFlow.calls.regularAdmission), []);

      await intake.getByRole("button", { name: "确认发起投稿" }).click();
      await confirmation.getByRole("button", { name: "确认发起投稿" }).click();
      await page.getByRole("status").filter({ hasText: "已发起 1 项普通平台投稿" }).waitFor();
      const calls = await page.evaluate(() => window.__historyEditorFlow.calls);
      assert.equal(calls.regularPreview.length, 2);
      assert.equal(calls.regularAdmission.length, 1);
      assert.equal(await page.getByRole("button", { name: /发起投稿 \(0\)/ }).count(), 1);
    } finally {
      await page.close();
    }
  });

  it("invalidates a paid preflight when the target changes", async () => {
    const { page, fixture } = await openHistory();
    try {
      await page.getByRole("textbox", { name: "筛选文章库" }).fill("编辑上下文");
      await page.getByRole("button", { name: /fixture-platform.*历史文章超长模板名称/ }).click();
      await page.getByRole("checkbox", { name: `选择 ${fixture.selectedArticle.title}` }).check();
      await page.getByRole("button", { name: /发起投稿 \(1\)/ }).click();
      const intake = page.getByRole("dialog", { name: "发起投稿" });
      await intake.getByRole("tab", { name: "付费媒体" }).click();
      await intake.getByRole("button", { name: "选择收藏媒体" }).click();
      await page.getByRole("dialog", { name: "选择收藏媒体" }).getByRole("button", { name: "选择收藏媒体 测试付费媒体" }).click();
      await intake.getByRole("button", { name: "检查费用与文章" }).evaluate((button) => {
        button.click();
        button.click();
      });
      const preflight = page.getByRole("dialog", { name: "付费媒体费用确认" });
      await preflight.waitFor();
      await preflight.getByRole("button", { name: "关闭付费媒体预检" }).click();
      await intake.getByRole("button", { name: "更换收藏媒体" }).click();
      await page.getByRole("dialog", { name: "选择收藏媒体" }).getByRole("button", { name: "选择收藏媒体 第二付费媒体" }).click();
      assert.equal(await page.getByRole("dialog", { name: "付费媒体费用确认" }).count(), 0);
      assert.deepEqual(await page.evaluate(() => window.__historyEditorFlow.calls.submission), []);
      await intake.getByRole("button", { name: "检查费用与文章" }).click();
      await preflight.waitFor();
      assert.deepEqual(await page.evaluate(() => window.__historyEditorFlow.calls.paidPreview), ["fixture-resource", "fixture-resource-2"]);
    } finally {
      await page.close();
    }
  });

  it("drops a late paid preflight when the client scope changes", async () => {
    const { page, fixture } = await openHistory(1128, 527, { delayedPaidPreview: true });
    try {
      await page.getByRole("textbox", { name: "筛选文章库" }).fill("编辑上下文");
      await page.getByRole("button", { name: /fixture-platform.*历史文章超长模板名称/ }).click();
      await page.getByRole("checkbox", { name: `选择 ${fixture.selectedArticle.title}` }).check();
      await page.getByRole("button", { name: /发起投稿 \(1\)/ }).click();
      const intake = page.getByRole("dialog", { name: "发起投稿" });
      await intake.getByRole("tab", { name: "付费媒体" }).click();
      await intake.getByRole("button", { name: "选择收藏媒体" }).click();
      await page.getByRole("dialog", { name: "选择收藏媒体" }).getByRole("button", { name: "选择收藏媒体 测试付费媒体" }).click();
      await intake.getByRole("button", { name: "检查费用与文章" }).click();
      await page.getByLabel("当前客户").selectOption("history-editor-other", { force: true });
      await page.waitForTimeout(400);
      assert.equal(
        await page.getByRole("tab", { name: "待投稿 (12)" }).getAttribute("aria-selected"),
        "true",
      );
      assert.equal(await page.getByRole("dialog", { name: "发起投稿" }).count(), 0);
      assert.equal(await page.getByRole("dialog", { name: "付费媒体费用确认" }).count(), 0);
      assert.deepEqual(await page.evaluate(() => window.__historyEditorFlow.calls.submission), []);
    } finally {
      await page.close();
    }
  });

  it("guards unsaved edits and keeps published articles read-only", async () => {
    const { page, fixture } = await openHistory();
    try {
      const filter = page.getByRole("textbox", { name: "筛选文章库" });
      await filter.fill("编辑上下文");
      await page.getByRole("button", { name: /fixture-platform.*历史文章超长模板名称/ }).click();
      await page.getByText(fixture.selectedArticle.title, { exact: true }).click();
      const editorTitle = page.getByLabel("文章标题", { exact: true });
      await editorTitle.fill("尚未保存的标题");
      await page.getByRole("button", { name: "关闭文章编辑器" }).click();
      await page.getByRole("dialog").filter({ hasText: "未保存" }).waitFor();
      await page.getByRole("dialog").getByRole("button", { name: "取消" }).click();
      assert.equal(await editorTitle.inputValue(), "尚未保存的标题");
      assert.equal(await editorTitle.isVisible(), true, "dismissing the unsaved warning keeps the editor open");

      await page.getByRole("button", { name: "关闭文章编辑器" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "放弃修改" }).click();
      assert.equal(await page.evaluate(() => window.__historyEditorFlow.calls.saveArticle.length), 0);
      await page.getByText(fixture.publishedArticle.title, { exact: true }).locator("..").locator("..").getByRole("button", { name: "发布详情" }).click();
      assert.equal(await page.getByRole("button", { name: "复制为新版本" }).count(), 0);
    } finally {
      await page.close();
    }
  });

  it("tracks a removal transaction by id from needs_repair through terminal recovery", async () => {
    const { page, fixture } = await openHistory();
    page.on("dialog", (dialog) => void dialog.accept());
    try {
      await page.getByRole("button", { name: /fixture-platform.*历史文章超长模板名称/ }).click();
      await page.getByRole("checkbox", { name: `选择 ${fixture.selectedArticle.title}` }).check();
      await page.getByRole("button", { name: /移入回收站 \(1\)/ }).click();
      const removalConfirmation = page.getByRole("dialog").filter({ has: page.getByRole("heading", { name: "确认移入回收站" }) });
      await removalConfirmation.waitFor();
      await removalConfirmation.getByRole("button", { name: "确认移入回收站" }).click();
      await page.getByRole("alert").filter({ hasText: /^删除事务需要修复：PUBLICATION_ATTEMPT_MISMATCH$/ }).waitFor();
      const retry = page.getByRole("button", { name: "重试修复删除事务" });
      assert.equal(await retry.isDisabled(), false);
      await retry.click();
      await page.getByRole("status").filter({ hasText: "删除事务正在自动恢复" }).waitFor();
      await page.getByRole("status").filter({ hasText: "删除事务已完成" }).waitFor({ timeout: 4000 });
      assert.equal(await page.evaluate(() => window.__historyEditorFlow.calls.removalRetries), 1);
    } finally {
      await page.close();
    }
  });

});
