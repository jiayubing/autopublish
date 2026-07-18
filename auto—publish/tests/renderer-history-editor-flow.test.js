const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");

const rootDir = path.resolve(__dirname, "..");
const rendererUrl = "http://127.0.0.1:4174/";
const clientId = "history-editor-fixture";
const platformId = "fixture-platform";
const templateId = "fixture-history-template";
const publishedArticleId = "published-article";
const selectedArticleId = "selected-article-09";

let viteProcess;
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
    reviewedAt: null,
    version: 1,
    sourceArticleId: null,
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

function createFixture() {
  const longPrefix = "编辑上下文 长标题回归文章";
  const selectedArticle = makeArticle(
    selectedArticleId,
    `${longPrefix} 09：这是用于验证筛选展开选择滚动和焦点恢复的超长标题，不能被行尾动作挤出窗口`,
    9
  );
  const publishedArticle = makeArticle(
    publishedArticleId,
    `${longPrefix} 已发布版本：复制新版本不得修改原文章和发布记录`,
    20,
    { status: "saved", version: 3 }
  );
  const articles = [publishedArticle, ...Array.from({ length: 12 }, (_, index) => index === 9 ? selectedArticle : makeArticle(
    `selected-article-${String(index).padStart(2, "0")}`,
    `${longPrefix} ${String(index).padStart(2, "0")}：这是一段足够长的历史文章标题，用来验证窄宽度下的行尾操作仍在 viewport 内`,
    index
  ))];
  return {
    articles,
    selectedArticle,
    publishedArticle,
    publicationRecords: [makePublicationRecord(publishedArticle.id)]
  };
}

function installDesktopFixture(page, fixture) {
  return page.addInitScript((input) => {
    const state = {
      articles: input.articles,
      publicationRecords: input.publicationRecords,
      calls: { copyArticleVersion: [], saveArticle: [], submission: [] }
    };
    const ok = (data) => Promise.resolve({ ok: true, data });
    const client = { id: "history-editor-fixture", name: "历史文章编辑测试客户", knowledgeFiles: [] };
    const template = {
      id: "fixture-history-template",
      platform: "fixture-platform",
      scenario: "历史编辑回归",
      name: "历史文章超长模板名称用于边界回归",
      body: "fixture template body",
      bodyHash: "fixture-template-hash",
      source: "custom"
    };
    const content = {
      listClients: () => ok([client]),
      listGeneratedArticles: () => ok(state.articles),
      listSubmissionPlatforms: () => ok([{ id: "fixture-platform", displayName: "测试投稿平台", contentQueueImport: true }]),
      listSubmissionBatches: () => ok([]),
      listArticleTrash: () => ok([]),
      listResearch: () => ok([]),
      listQuestions: () => ok([]),
      getDoubaoLoginState: () => ok({ status: "unknown" }),
      getDoubaoQueueState: () => ok({ status: "idle", currentTaskId: null, completed: 0, total: 0, waitRemainingMs: 0, tasks: [] }),
      onDoubaoQueueState: () => () => {},
      listTemplates: () => ok([template]),
      listTemplateCatalog: () => ok({ revision: "fixture", platforms: [{ id: template.platform, displayName: "测试模板平台", description: "", order: 1 }], templates: [template], diagnostics: [] }),
      retryMaterial: () => ok({}),
      generateArticle: () => ok(state.articles[0]),
      saveArticle: (article) => {
        state.calls.saveArticle.push(article);
        state.articles = state.articles.map((item) => item.id === article.id ? article : item);
        return ok(article);
      },
      reviewArticles: () => ok({ reviewed: [], rejected: [] }),
      copyArticleVersion: (request) => {
        state.calls.copyArticleVersion.push(request);
        const source = state.articles.find((article) => article.id === request.sourceArticleId);
        const copied = { ...source, id: "copied-published-article", sourceArticleId: source.id, version: (source.version || 1) + 1, status: "generated", reviewedAt: null };
        state.articles = [...state.articles, copied];
        return ok(copied);
      },
      previewExport: () => ok({ filename: "fixture.md" }),
      exportArticle: () => { state.calls.submission.push("exportArticle"); return ok({ filename: "fixture.md" }); },
      previewSubmissionBatch: () => ok({ queueableTaskCount: 0, idempotentCount: 0, conflictCount: 0 }),
      createSubmissionBatch: () => { state.calls.submission.push("createSubmissionBatch"); return ok({}); },
      previewCancelSubmissionBatch: () => ok({ cancelableCount: 0 }),
      cancelSubmissionBatch: () => { state.calls.submission.push("cancelSubmissionBatch"); return ok({}); },
      restoreArticle: () => ok({}),
      trashArticles: () => ok({ moved: [], skipped: [], rejected: [] }),
      preparePermanentDeleteArticle: () => ok({ token: "fixture-token" }),
      permanentlyDeleteArticle: () => ok({ deleted: true })
    };
    const runtime = { get: () => ok({ ok: true, buildInfo: { version: "1.0.1", commit: "history-editor-flow", dirty: false }, browserChannel: { channel: "chromium", configured: true, state: "ready", probed: true, source: "fixture", errorCode: null, lastCheckedAt: null }, capabilities: { playwrightNode: { state: "ready", source: "fixture", errorCode: null, lastCheckedAt: null }, playwrightCli: { state: "ready", source: "fixture", errorCode: null, lastCheckedAt: null }, browserChannel: { state: "ready", source: "fixture", errorCode: null, lastCheckedAt: null }, docx: { state: "ready", source: "fixture", errorCode: null, lastCheckedAt: null }, hepan: { state: "optional_unconfigured", source: "fixture", errorCode: "HEPAN_PYTHON_UNAVAILABLE", lastCheckedAt: null } }, errors: [], warnings: [] }), browserSmoke: () => ok({ ok: true, browserChannel: "chromium", session: "fixture" }) };
    const workspace = { getBootstrapState: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }), getCurrent: () => ok({ workspacePath: "fixture", envOverride: false, validation: { ok: true, errors: [], warnings: [] } }), openCurrent: () => ok(undefined), requestSwitch: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }), chooseDirectory: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }), confirmSelection: () => ok({ state: "ready" }), cancelSelection: () => ok({ state: "ready", workspacePath: "fixture", envOverride: false }) };
    const media = { scanArticles: () => ok([]), getResourcePage: () => ok({ items: [], total: 0, page: 1, pageSize: 100 }), getPool: () => ok([]), getBalance: () => ok({ balance: "0" }) };
    const orders = { getOrders: () => ok([]) };
    const aiProvider = { getStatus: () => ok({ configured: false, source: "application", apiKeyMask: "", lastTest: null }), save: () => ok({}), testConnection: () => ok({}), clear: () => ok({ cleared: true }) };
    const platformSettings = { getStatus: () => ok({ configured: false, source: "application", baseUrl: "", timeoutMs: 30000, allowInsecure: false, transport: "未配置", apiKeyMask: "", lastTest: null }), save: () => ok({}), test: () => ok({ testedAt: "", ok: true, code: "OK" }), clear: () => ok({ cleared: true }) };
    const storageMaintenance = { getUsage: () => ok({ logs: { bytes: 0, files: 0 }, temporary: { bytes: 0, files: 0 }, docxCache: { bytes: 0, files: 0 }, profiles: { bytes: 0, files: 0 } }), cleanCaches: () => ok({ blocked: false }) };
    window.__historyEditorFlow = state;
    window.desktopConsole = {
      workspace,
      runtimeDiagnostics: runtime,
      aiProvider,
      platformSettings,
      storageMaintenance,
      media,
      orders,
      platforms: { getQueue: () => ok({ platforms: [], queue: [] }), getState: () => ok({ isBatchRunning: false, isStopPending: false, isPlatformRunning: false }), onState: () => () => {} },
      publication: { listForArticles: ({ articleIds }) => ok(state.publicationRecords.filter((record) => articleIds.includes(record.articleId))), reconcile: () => ok(state.publicationRecords[0]) },
      content
    };
  }, fixture);
}

async function waitForServer(url) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const request = http.get(url, (response) => { response.resume(); response.statusCode >= 200 && response.statusCode < 500 ? resolve() : reject(new Error("server not ready")); });
        request.on("error", reject);
      });
      return;
    } catch (_) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Vite renderer server did not start");
}

async function openHistory(width = 1128, height = 527) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(5000);
  page.on("pageerror", (error) => process.stderr.write(`renderer page error: ${error.message}\n`));
  const fixture = createFixture();
  await installDesktopFixture(page, fixture);
  await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
  await page.locator("#nav-item-content").waitFor();
  await page.locator("#nav-item-content").click();
  await page.getByRole("button", { name: "历史文章" }).click();
  await page.getByRole("heading", { name: "历史文章" }).waitFor();
  return { page, fixture };
}

function historyPane(page) {
  return page.locator("div.h-full.overflow-y-auto").filter({ has: page.getByRole("heading", { name: "历史文章" }) }).first();
}

describe("renderer history editor flow", { concurrency: false }, () => {
  before(async () => {
    if (process.platform === "win32") {
      execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm --prefix media-workbench run build"], { cwd: rootDir, stdio: "inherit" });
    } else {
      execFileSync("npm", ["--prefix", "media-workbench", "run", "build"], { cwd: rootDir, stdio: "inherit" });
    }
    viteProcess = spawn(process.execPath, [path.join(rootDir, "media-workbench", "node_modules", "vite", "bin", "vite.js"), "preview", "--host", "127.0.0.1", "--port", "4174"], { cwd: path.join(rootDir, "media-workbench"), stdio: ["ignore", "pipe", "pipe"] });
    await waitForServer(rendererUrl);
    browser = await chromium.launch({ headless: true });
  });

  after(async () => {
    if (browser) await browser.close();
    if (viteProcess && !viteProcess.killed) viteProcess.kill();
  });

  it("keeps history mounted and restores filter, expansion, selection, scroll, and focus", async () => {
    const { page, fixture } = await openHistory();
    try {
      const pane = historyPane(page);
      const filter = page.getByRole("textbox", { name: "筛选历史文章" });
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
      assert.equal(await page.getByRole("heading", { name: "历史文章" }).isVisible(), true);
      assert.equal(await filter.inputValue(), "编辑上下文");
      assert.equal(await checkbox.isChecked(), true);
      assert.equal(await sourceTitle.isVisible(), true);
      assert.equal(await page.getByText("选择客户资料与有效回答", { exact: true }).count(), 0, "opening history must not mount the generation source form");
       assert.equal(await page.getByLabel("文章标题", { exact: true }).evaluate((element) => document.activeElement === element), true, "editor title receives focus");

      await page.getByRole("button", { name: "关闭文章编辑器" }).click();
      assert.equal(await page.getByRole("heading", { name: "历史文章" }).isVisible(), true);
      assert.equal(await filter.inputValue(), "编辑上下文");
      assert.equal(await checkbox.isChecked(), true);
      assert.equal(await sourceButton.evaluate((element) => document.activeElement === element), true, "closing restores focus to the source row");
      assert.ok(await pane.evaluate((element) => element.scrollTop > 0), "closing preserves the history scroll position");
    } finally {
      await page.close();
    }
  });

  it("guards unsaved edits and copies a published article as a new version", async () => {
    const { page, fixture } = await openHistory();
    const dialogMessages = [];
    const dialogResponses = ["dismiss", "accept", "accept", "accept"];
    page.on("dialog", async (dialog) => {
      dialogMessages.push(dialog.message());
      const response = dialogResponses.shift() || "accept";
      if (response === "dismiss") await dialog.dismiss();
      else await dialog.accept();
    });
    try {
      const filter = page.getByRole("textbox", { name: "筛选历史文章" });
      await filter.fill("编辑上下文");
      await page.getByRole("button", { name: /fixture-platform.*历史文章超长模板名称/ }).click();
      await page.getByText(fixture.selectedArticle.title, { exact: true }).click();
       const editorTitle = page.getByLabel("文章标题", { exact: true });
      await editorTitle.fill("尚未保存的标题");
      await page.getByRole("button", { name: "关闭文章编辑器" }).click();
      assert.match(dialogMessages[0], /未保存/);
      assert.equal(await editorTitle.inputValue(), "尚未保存的标题");
      assert.equal(await editorTitle.isVisible(), true, "dismissing the unsaved warning keeps the editor open");

      await page.getByRole("button", { name: "关闭文章编辑器" }).click();
      await page.getByText(fixture.publishedArticle.title, { exact: true }).locator("..").locator("..").getByRole("button", { name: "发布详情" }).click();
      await page.getByRole("button", { name: "复制为新版本" }).click();
      await page.waitForFunction(() => window.__historyEditorFlow.calls.copyArticleVersion.length === 1);
      assert.deepEqual(await page.evaluate(() => window.__historyEditorFlow.calls.copyArticleVersion[0]), { clientId, sourceArticleId: publishedArticleId });
      assert.equal(await page.getByRole("heading", { name: "历史文章" }).isVisible(), true, "copying a published article keeps the history list mounted");
       assert.equal(await page.getByLabel("文章标题", { exact: true }).inputValue(), fixture.publishedArticle.title);
      assert.equal(await page.getByText(fixture.publishedArticle.title, { exact: true }).count() > 0, true, "the original published article remains in history");
      const copied = await page.evaluate(() => window.__historyEditorFlow.articles.find((article) => article.id === "copied-published-article"));
      assert.equal(copied.status, "generated");
      assert.equal(copied.sourceArticleId, publishedArticleId);
      assert.equal(copied.version, 4);
    } finally {
      await page.close();
    }
  });

  it("locks the history selection seam to an in-place editor instead of the generate tab", () => {
    const source = fs.readFileSync(path.join(rootDir, "media-workbench", "src", "components", "ContentWorkbench.tsx"), "utf8");
    assert.doesNotMatch(source, /setTab\(["']generate["']\)/);
    assert.match(source, /GeneratedArticleEditorPanel/);
  });
});
