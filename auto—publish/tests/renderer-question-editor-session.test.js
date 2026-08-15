const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { after, before } = require("node:test");
const path = require("node:path");
const { closeRenderer, startRenderer } = require("./helpers/renderer-harness");

const rootDir = path.resolve(__dirname, "..");
const rendererUrl = "http://127.0.0.1:4174/";
let browser;

function ok(data) {
  return Promise.resolve({ ok: true, data });
}

function installQuestionFixture(page, options = {}) {
  return page.addInitScript((fixtureOptions) => {
    const clients = [
      { id: "client-a", name: "客户 A", knowledgeFiles: [] },
      { id: "client-b", name: "客户 B", knowledgeFiles: [] },
    ];
    const questions = {
      "client-a": [
        {
          id: "question-1",
          clientId: "client-a",
          text: "问题一",
          enabled: true,
        },
        {
          id: "question-2",
          clientId: "client-a",
          text: "问题二",
          enabled: true,
        },
      ],
      "client-b": [
        {
          id: "question-b",
          clientId: "client-b",
          text: "问题 B",
          enabled: true,
        },
      ],
    };
    const research = {
      "client-a": [
        {
          id: "question-1",
          question: "问题一",
          answerText: "客户 A 的回答",
          references: [{ title: "引用一", url: "https://example.com/one" }],
          collectionMethod: "manual",
          updatedAt: "2026-07-19T00:00:00.000Z",
        },
        {
          id: "question-2",
          question: "问题二",
          answerText: "客户 A 的第二个回答",
          references: [{ title: "引用二", url: "https://example.com/two" }],
          collectionMethod: "manual",
          updatedAt: "2026-07-19T00:00:00.000Z",
        },
      ],
      "client-b": [
        {
          id: "question-b",
          question: "问题 B",
          answerText: "客户 B 的回答",
          references: [{ title: "引用 B", url: "https://example.com/b" }],
          collectionMethod: "manual",
          updatedAt: "2026-07-19T00:00:00.000Z",
        },
      ],
    };
    const result = (data) => Promise.resolve({ ok: true, data });
    const questionFlow = {
      previewCalls: 0,
      executeCalls: 0,
      resolvePreview: null,
    };
    const content = {
      listClients: () => result({ clients }),
      listGeneratedArticles: () => result({ articles: [] }),
      getArticleManagementSnapshot: ({ clientId }) =>
        result({
          clientId,
          revision: 1,
          articles: [],
          trash: [],
          submissionBatches: [],
          cancellationPlans: [],
          publicationRecords: [],
          attention: {
            revision: 1,
            items: [],
            counts: { total: 0, actionable: 0 },
          },
          submissionPlatforms: [],
          workflowItems: [],
          publicationSummaryItems: [],
        }),
      listSubmissionBatches: () => result({ batches: [] }),
      listArticleTrash: () => result({ trash: [] }),
      listResearch: (clientId) =>
        result({ research: research[clientId] || [] }),
      listQuestions: (clientId) =>
        result({ questions: questions[clientId] || [] }),
      listTemplates: () => result({ templates: [] }),
      listTemplateCatalog: () =>
        result({
          revision: "fixture",
          platforms: [],
          templates: [],
          diagnostics: [],
        }),
      getDoubaoLoginState: () => result({ loginState: { status: "unknown" } }),
      getDoubaoQueueState: () =>
        result({
          queue: {
            status: "idle",
            currentTaskId: null,
            completed: 0,
            total: 0,
            waitRemainingMs: 0,
            tasks: [],
          },
        }),
      onDoubaoQueueState: () => () => {},
      listGenerationBatches: () => result({ batches: [] }),
      getGenerationBatchState: () => result({ state: "idle", status: "idle" }),
      previewGenerationBatch: () => result({}),
      previewSubmissionBatch: () =>
        result({ queueableTaskCount: 0, idempotentCount: 0, conflictCount: 0 }),
      previewCancelSubmissionBatch: () =>
        result({ allowedCount: 0, blockedCount: 0, items: [] }),
      previewDoubaoBatch: () => {
        questionFlow.previewCalls += 1;
        if (fixtureOptions.previewBatchFailure)
          return Promise.resolve({
            ok: false,
            error: { code: "DOUBAO_PREVIEW_FAILED", message: "批次预览失败" },
          });
        if (fixtureOptions.previewBatchPending)
          return new Promise((resolve) => {
            questionFlow.resolvePreview = () =>
              resolve(
                result({
                  preview: {
                    mode: "missing",
                    clientCount: 1,
                    taskCount: 1,
                    skippedExisting: 0,
                    disabledQuestions: 0,
                    tasks: [
                      {
                        clientId: "client-a",
                        questionId: "question-1",
                        force: true,
                      },
                    ],
                  },
                }),
              );
          });
        return result({
          preview: {
            mode: "missing",
            clientCount: 1,
            taskCount: 1,
            skippedExisting: 0,
            disabledQuestions: 0,
            tasks: [
              { clientId: "client-a", questionId: "question-1", force: true },
            ],
          },
        });
      },
      startPreparedDoubaoBatch: () => {
        questionFlow.executeCalls += 1;
        return result({
          queue: {
            status: "running",
            currentTaskId: "question-1",
            completed: 0,
            total: 1,
            waitRemainingMs: 0,
            tasks: [
              {
                id: "task-1",
                clientId: "client-a",
                questionId: "question-1",
                status: "running",
              },
            ],
          },
        });
      },
      createQuestion: () => result({ question: {} }),
      updateQuestion: () => result({ question: {} }),
      deleteQuestion: () => result({ question: {} }),
      saveManualResearch: () => result({ research: {} }),
      listArticleAttention: () =>
        result({ items: [], counts: { total: 0, actionable: 0 } }),
    };
    window.__questionFixture = questionFlow;
    window.desktopConsole = {
      auth: {
        getState: () =>
          result({
            authenticated: true,
            user: { loginName: "admin" },
            entitlements: [
              { product: "AutoPublish", enabled: true, expiresAt: null },
            ],
          }),
        login: () => result({ authenticated: true }),
        refresh: () => result({ authenticated: true }),
        logout: () => result({ authenticated: false }),
        onStateChanged: () => () => {},
      },
      workspace: {
        getBootstrapState: () => result({ state: "ready" }),
        getCurrent: () =>
          result({
            workspacePath: "fixture",
            envOverride: false,
            validation: { ok: true, errors: [], warnings: [] },
          }),
      },
      workspaceData: {
        getRuntimeIdentity: () =>
          result({ workspaceRuntimeId: "question-runtime", revision: 1 }),
        onInvalidated: () => () => {},
      },
      runtimeDiagnostics: {
        get: () =>
          result({
            ok: true,
            buildInfo: { version: "fixture", commit: "fixture", dirty: false },
            browserChannel: {
              channel: "chromium",
              configured: true,
              state: "ready",
              probed: true,
            },
            capabilities: {},
            errors: [],
            warnings: [],
          }),
      },
      content,
      media: {
        scanArticles: () => result([]),
        getDrafts: () => result([]),
        getResourcePage: () =>
          result({ items: [], total: 0, page: 1, pageSize: 10 }),
        getPool: () => result([]),
        getBalance: () => result({ balance: "0" }),
      },
      orders: { getOrders: () => result([]) },
      platforms: {
        getQueue: () => result({ platforms: [], queue: [] }),
        getState: () => result({}),
        onState: () => () => {},
      },
      aiProvider: {
        getStatus: () =>
          result({
            configured: false,
            source: "application",
            apiKeyMask: "",
            lastTest: null,
          }),
      },
      platformSettings: {},
      storageMaintenance: {
        getUsage: () => result({}),
        cleanCaches: () => result({}),
      },
    };
  }, options);
}

describe(
  "real renderer question editor interaction",
  { concurrency: false },
  function () {
    before(async function () {
      ({ browser } = await startRenderer({ port: 4174 }));
    });
    after(closeRenderer);

    it("opens, closes, restores focus, resets references, and survives client switching", async function () {
      const page = await browser.newPage({
        viewport: { width: 1024, height: 800 },
      });
      page.setDefaultTimeout(8000);
      const nativeDialogs = [];
      page.on("dialog", (dialog) => {
        nativeDialogs.push(dialog.message());
        void dialog.dismiss();
      });
      page.on("pageerror", (error) =>
        process.stderr.write(
          `question renderer page error: ${error.message}\n`,
        ),
      );
      await installQuestionFixture(page);
      await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
      await page.locator("#nav-item-content-production").click();
      await page.getByRole("heading", { name: "问题与采集" }).waitFor();
      const sourceOne = page.getByRole("button", { name: "人工回答：问题一" });
      await sourceOne.click();
      await page.getByRole("dialog", { name: /人工编辑回答/ }).waitFor();
      const answer = page.getByPlaceholder("回答正文（至少 10 个字符）");
      await answer.click();
      assert.equal(
        await answer.evaluate((element) => document.activeElement === element),
        true,
      );
      await page.getByPlaceholder("引用标题").fill("本次引用");
      await page
        .getByRole("button", { name: "关闭人工回答编辑器", exact: true })
        .click();
      await page
        .getByRole("dialog", { name: "放弃人工回答修改" })
        .getByRole("button", { name: "放弃修改" })
        .click();
      assert.equal(
        await sourceOne.evaluate(
          (element) => document.activeElement === element,
        ),
        true,
      );
      await sourceOne.click();
      await page.getByLabel("引用标题").fill("问题一引用");
      await page.keyboard.press("Escape");
      await page
        .getByRole("dialog", { name: "放弃人工回答修改" })
        .getByRole("button", { name: "放弃修改" })
        .click();
      await page
        .getByRole("dialog", { name: /人工编辑回答/ })
        .waitFor({ state: "detached" });
      await page.getByRole("button", { name: "人工回答：问题二" }).click();
      assert.equal(
        await page.getByPlaceholder("引用标题").inputValue(),
        "引用二",
      );
      await page
        .getByLabel("当前客户")
        .selectOption("client-b");
      await page
        .getByRole("dialog", { name: /人工编辑回答/ })
        .waitFor({ state: "detached" });
      await page.getByLabel("当前客户").click();
      assert.equal(
        await page.getByLabel("当前客户").inputValue(),
        "client-b",
      );
      assert.deepEqual(nativeDialogs, []);
      await page.close();
    });

    it("keeps the desktop panel non-blocking and uses a full-screen narrow panel", async function () {
      for (const width of [1366, 600]) {
        const page = await browser.newPage({
          viewport: { width, height: 800 },
        });
        page.setDefaultTimeout(8000);
        page.on("dialog", (dialog) => dialog.accept());
        await installQuestionFixture(page);
        await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
        await page.locator("#nav-item-content-production").click();
        await page.getByRole("heading", { name: "问题与采集" }).waitFor();
        await page.getByRole("button", { name: "人工回答：问题一" }).click();
        const panel = page.getByRole("dialog", { name: /人工编辑回答/ });
        const box = await panel.boundingBox();
        assert.ok(box && box.width > 0 && box.height > 0);
        if (width >= 768) {
          assert.ok(
            box.x > 0 && box.width < width,
            `desktop panel must leave the list clickable: ${JSON.stringify({ width, box })}`,
          );
          await page.getByLabel("问题草稿").click();
          assert.equal(
            await page
              .getByLabel("问题草稿")
              .evaluate((element) => document.activeElement === element),
            true,
          );
        } else {
          assert.ok(
            box.x === 0 && box.width >= width,
            `narrow panel must cover the viewport: ${JSON.stringify({ width, box })}`,
          );
        }
        await panel.getByPlaceholder("回答正文（至少 10 个字符）").click();
        await page
          .getByRole("button", { name: "关闭人工回答编辑器", exact: true })
          .click();
        await page.close();
      }
    });

    it("shows a prepare failure without opening confirmation or executing the batch", async function () {
      const page = await browser.newPage({
        viewport: { width: 1024, height: 800 },
      });
      page.setDefaultTimeout(8000);
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await installQuestionFixture(page, { previewBatchFailure: true });
      await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
      await page.locator("#nav-item-content-production").click();
      await page.getByRole("heading", { name: "问题与采集" }).waitFor();
      const recollect = page.getByRole("button", { name: "重新采集选中客户" });
      await recollect.click();
      await page.getByText("批次预览失败", { exact: true }).waitFor();
      assert.equal(await page.getByRole("dialog").count(), 0);
      assert.deepEqual(await page.evaluate(() => window.__questionFixture), {
        previewCalls: 1,
        executeCalls: 0,
        resolvePreview: null,
      });
      assert.equal(await recollect.isEnabled(), true);
      assert.deepEqual(pageErrors, []);
      await page.close();
    });

    it("previews before confirmation and executes only after approval", async function () {
      const page = await browser.newPage({
        viewport: { width: 1024, height: 800 },
      });
      page.setDefaultTimeout(8000);
      const nativeDialogs = [];
      page.on("dialog", (dialog) => {
        nativeDialogs.push(dialog.message());
        void dialog.dismiss();
      });
      await installQuestionFixture(page);
      await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
      await page.locator("#nav-item-content-production").click();
      await page.getByRole("heading", { name: "问题与采集" }).waitFor();
      await page.getByRole("button", { name: "重新采集选中客户" }).click();
      const confirmation = page.getByRole("dialog", {
        name: "重新采集选中客户",
      });
      await confirmation.waitFor();
      assert.deepEqual(await page.evaluate(() => window.__questionFixture), {
        previewCalls: 1,
        executeCalls: 0,
        resolvePreview: null,
      });
      await confirmation.getByRole("button", { name: "开始重新采集" }).click();
      await page.waitForFunction(
        () => window.__questionFixture.executeCalls === 1,
      );
      assert.deepEqual(await page.evaluate(() => window.__questionFixture), {
        previewCalls: 1,
        executeCalls: 1,
        resolvePreview: null,
      });
      assert.deepEqual(nativeDialogs, []);
      await page.close();
    });

    it("rejects a prepared batch when its client selection changes during deferred preview", async function () {
      const page = await browser.newPage({
        viewport: { width: 1024, height: 800 },
      });
      page.setDefaultTimeout(8000);
      await installQuestionFixture(page, { previewBatchPending: true });
      await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
      await page.locator("#nav-item-content-production").click();
      await page.getByRole("heading", { name: "问题与采集" }).waitFor();
      const recollect = page.getByRole("button", { name: "重新采集选中客户" });
      await recollect.click();
      await page.waitForFunction(
        () =>
          window.__questionFixture.previewCalls === 1 &&
          typeof window.__questionFixture.resolvePreview === "function",
      );
      const clientB = page.getByRole("checkbox", { name: "客户 B" });
      assert.equal(await clientB.isDisabled(), true);
      await page.evaluate(() => {
        const input = Array.from(
          document.querySelectorAll('input[type="checkbox"]'),
        ).find((item) => item.parentElement?.textContent?.includes("客户 B"));
        if (!input) throw new Error("batch client B checkbox not found");
        input.disabled = false;
        input.click();
      });
      await page.evaluate(() => window.__questionFixture.resolvePreview());
      await page
        .getByText("批次客户选择已变化，请重新预览", { exact: true })
        .waitFor();
      assert.equal(
        await page.evaluate(() => window.__questionFixture.executeCalls),
        0,
      );
      await page.close();
    });

    it("ignores a deferred batch preview after the content view unmounts", async function () {
      const page = await browser.newPage({
        viewport: { width: 1024, height: 800 },
      });
      page.setDefaultTimeout(8000);
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await installQuestionFixture(page, { previewBatchPending: true });
      await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
      await page.locator("#nav-item-content-production").click();
      await page.getByRole("heading", { name: "问题与采集" }).waitFor();
      await page.getByRole("button", { name: "重新采集选中客户" }).click();
      await page.waitForFunction(
        () => typeof window.__questionFixture.resolvePreview === "function",
      );

      await page.locator("#nav-item-settings").click();
      await page.getByRole("heading", { name: "设置" }).waitFor();
      await page.evaluate(() => window.__questionFixture.resolvePreview());
      await page.waitForTimeout(100);

      assert.equal(
        await page.evaluate(() => window.__questionFixture.executeCalls),
        0,
      );
      assert.equal(
        await page
          .getByText("批次客户选择已变化，请重新预览", { exact: true })
          .count(),
        0,
      );
      assert.deepEqual(pageErrors, []);
      await page.close();
    });
  },
);
