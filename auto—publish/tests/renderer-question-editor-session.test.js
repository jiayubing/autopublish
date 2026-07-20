const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { after, before } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { closeRenderer, startRenderer } = require("./helpers/renderer-harness");

function read(file) { return fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"); }

describe("renderer question editor session", function() {
  it("has one question save action and a separate cancellable manual-answer panel", function() {
    const source = read("media-workbench/src/components/content/QuestionCollectionView.tsx");
    assert.equal((source.match(/title="保存问题"/g) || []).length, 1);
    assert.doesNotMatch(source, /title="新增问题"/);
    assert.match(source, /ManualResearchEditorPanel/);
    assert.match(source, /manualAnswerSession/);
    assert.match(source, /questionDraftId/);
    assert.match(source, /取消编辑/);
  });

  it("uses a client/question/session identity and clears content-source state without workspace refresh", function() {
    const session = read("media-workbench/src/content-question-editor-session.ts");
    const source = read("media-workbench/src/components/content/QuestionCollectionView.tsx");
    const panel = read("media-workbench/src/components/content/ManualResearchEditorPanel.tsx");
    const workbench = read("media-workbench/src/components/ContentWorkbench.tsx");
    assert.match(session, /clientId/);
    assert.match(session, /questionId/);
    assert.match(session, /sessionId/);
    assert.match(panel, /Escape/);
    assert.match(workbench, /contentSources/);
    assert.doesNotMatch(source, /onRefresh\(\)/);
    assert.match(workbench, /contentSources/);
  });

  it("contains the real renderer regression hooks for focus and pointer isolation", function() {
    const panel = read("media-workbench/src/components/content/ManualResearchEditorPanel.tsx");
    assert.match(panel, /role="dialog"/);
    assert.match(panel, /关闭/);
    assert.match(panel, /stopPropagation/);
    assert.match(panel, /focus\(\)/);
    assert.match(read("media-workbench/src/index.css"), /manual-research-editor-panel/);
  });
});

const rootDir = path.resolve(__dirname, "..");
const rendererUrl = "http://127.0.0.1:4174/";
let browser;

function ok(data) { return Promise.resolve({ ok: true, data }); }

function installQuestionFixture(page) {
  return page.addInitScript(() => {
    const clients = [{ id: "client-a", name: "客户 A", knowledgeFiles: [] }, { id: "client-b", name: "客户 B", knowledgeFiles: [] }];
    const questions = {
      "client-a": [{ id: "question-1", clientId: "client-a", text: "问题一", enabled: true }, { id: "question-2", clientId: "client-a", text: "问题二", enabled: true }],
      "client-b": [{ id: "question-b", clientId: "client-b", text: "问题 B", enabled: true }]
    };
    const research = {
      "client-a": [{ id: "question-1", question: "问题一", answerText: "客户 A 的回答", references: [{ title: "引用一", url: "https://example.com/one" }], collectionMethod: "manual", updatedAt: "2026-07-19T00:00:00.000Z" }, { id: "question-2", question: "问题二", answerText: "客户 A 的第二个回答", references: [{ title: "引用二", url: "https://example.com/two" }], collectionMethod: "manual", updatedAt: "2026-07-19T00:00:00.000Z" }],
      "client-b": [{ id: "question-b", question: "问题 B", answerText: "客户 B 的回答", references: [{ title: "引用 B", url: "https://example.com/b" }], collectionMethod: "manual", updatedAt: "2026-07-19T00:00:00.000Z" }]
    };
    const result = (data) => Promise.resolve({ ok: true, data });
    const content = {
      listClients: () => result(clients), listGeneratedArticles: () => result([]), listSubmissionPlatforms: () => result([]), listSubmissionBatches: () => result([]), listArticleTrash: () => result([]),
      listResearch: (clientId) => result(research[clientId] || []), listQuestions: (clientId) => result(questions[clientId] || []), listTemplates: () => result([]), listTemplateCatalog: () => result({ revision: "fixture", platforms: [], templates: [], diagnostics: [] }),
      getDoubaoLoginState: () => result({ status: "unknown" }), getDoubaoQueueState: () => result({ status: "idle", currentTaskId: null, completed: 0, total: 0, waitRemainingMs: 0, tasks: [] }), onDoubaoQueueState: () => () => {}, listGenerationBatches: () => result([]), getGenerationBatchState: () => result({ state: "idle", status: "idle" }),
      previewGenerationBatch: () => result({}), previewSubmissionBatch: () => result({ queueableTaskCount: 0, idempotentCount: 0, conflictCount: 0 }), previewCancelSubmissionBatch: () => result({ cancelableCount: 0 }),
      createQuestion: () => result({}), updateQuestion: () => result({}), deleteQuestion: () => result({}), saveManualResearch: () => result({}),
      listArticleAttention: () => result({ items: [], counts: { total: 0, actionable: 0 } })
    };
    window.desktopConsole = {
      auth: { getState: () => result({ authenticated: true, user: { loginName: "admin" }, entitlements: [{ product: "AutoPublish", enabled: true, expiresAt: null }] }), login: () => result({ authenticated: true }), refresh: () => result({ authenticated: true }), logout: () => result({ authenticated: false }), onStateChanged: () => () => {} },
      workspace: { getBootstrapState: () => result({ state: "ready" }), getCurrent: () => result({ workspacePath: "fixture", envOverride: false, validation: { ok: true, errors: [], warnings: [] } }) },
      workspaceData: { onInvalidated: () => () => {} },
      runtimeDiagnostics: { get: () => result({ ok: true, buildInfo: { version: "fixture", commit: "fixture", dirty: false }, browserChannel: { channel: "chromium", configured: true, state: "ready", probed: true }, capabilities: {}, errors: [], warnings: [] }) },
      content,
      media: { scanArticles: () => result([]), getDrafts: () => result([]), getResourcePage: () => result({ items: [], total: 0, page: 1, pageSize: 10 }), getPool: () => result([]), getBalance: () => result({ balance: "0" }) },
      orders: { getOrders: () => result([]) }, platforms: { getQueue: () => result({ platforms: [], queue: [] }), getState: () => result({}), onState: () => () => {} },
      aiProvider: { getStatus: () => result({ configured: false, source: "application", apiKeyMask: "", lastTest: null }) }, platformSettings: {}, storageMaintenance: { getUsage: () => result({}), cleanCaches: () => result({}) }
    };
  });
}

describe("real renderer question editor interaction", { concurrency: false }, function() {
  before(async function() {
    ({ browser } = await startRenderer({ port: 4174 }));
  });
  after(closeRenderer);

  it("opens, closes, restores focus, resets references, and survives client switching", async function() {
    const page = await browser.newPage({ viewport: { width: 1024, height: 800 } });
    page.setDefaultTimeout(8000);
    page.on("dialog", (dialog) => dialog.accept());
    page.on("pageerror", (error) => process.stderr.write(`question renderer page error: ${error.message}\n`));
    await installQuestionFixture(page);
    await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
    await page.locator("#nav-item-content").click();
    await page.getByRole("heading", { name: "问题与采集" }).waitFor();
    const sourceOne = page.getByRole("button", { name: "人工回答：问题一" });
    await sourceOne.click();
    await page.getByRole("dialog", { name: /人工编辑回答/ }).waitFor();
    const answer = page.getByPlaceholder("回答正文（至少 10 个字符）");
    await answer.click();
    assert.equal(await answer.evaluate((element) => document.activeElement === element), true);
    await page.getByPlaceholder("引用标题").fill("本次引用");
    await page.getByRole("button", { name: "关闭人工回答编辑器", exact: true }).click();
    assert.equal(await sourceOne.evaluate((element) => document.activeElement === element), true);
    await sourceOne.click();
    await page.getByLabel("引用标题").fill("问题一引用");
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: /人工编辑回答/ }).waitFor({ state: "detached" });
    await page.getByRole("button", { name: "人工回答：问题二" }).click();
    assert.equal(await page.getByPlaceholder("引用标题").inputValue(), "引用二");
    await page.getByLabel("当前客户（单篇/问题/历史）").selectOption("client-b");
    await page.getByRole("dialog", { name: /人工编辑回答/ }).waitFor({ state: "detached" });
    await page.getByLabel("当前客户（单篇/问题/历史）").click();
    assert.equal(await page.getByLabel("当前客户（单篇/问题/历史）").inputValue(), "client-b");
    await page.close();
  });

  it("keeps the desktop panel non-blocking and uses a full-screen narrow panel", async function() {
    for (const width of [1366, 600]) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      page.setDefaultTimeout(8000);
      page.on("dialog", (dialog) => dialog.accept());
      await installQuestionFixture(page);
      await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
      await page.locator("#nav-item-content").click();
      await page.getByRole("heading", { name: "问题与采集" }).waitFor();
      await page.getByRole("button", { name: "人工回答：问题一" }).click();
      const panel = page.getByRole("dialog", { name: /人工编辑回答/ });
      const box = await panel.boundingBox();
      assert.ok(box && box.width > 0 && box.height > 0);
      if (width >= 768) {
        assert.ok(box.x > 0 && box.width < width, `desktop panel must leave the list clickable: ${JSON.stringify({ width, box })}`);
        await page.getByLabel("问题草稿").click();
        assert.equal(await page.getByLabel("问题草稿").evaluate((element) => document.activeElement === element), true);
      } else {
        assert.ok(box.x === 0 && box.width >= width, `narrow panel must cover the viewport: ${JSON.stringify({ width, box })}`);
      }
      await panel.getByPlaceholder("回答正文（至少 10 个字符）").click();
      await page.getByRole("button", { name: "关闭人工回答编辑器", exact: true }).click();
      await page.close();
    }
  });
});
