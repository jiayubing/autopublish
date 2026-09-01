const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { closeRenderer, startRenderer } = require("./helpers/renderer-harness");

const rootDir = path.resolve(__dirname, "..");
const fixtureWorkspace = path.join(
  __dirname,
  "fixtures",
  "workspaces",
  "layout-smoke",
);
const rendererUrl = "http://127.0.0.1:4173/";

let browser;

function ok(data) {
  return Promise.resolve({ ok: true, data });
}

function runtimeDiagnostics() {
  const capability = {
    state: "ready",
    source: "fixture",
    errorCode: null,
    lastCheckedAt: null,
  };
  return {
    ok: true,
    buildInfo: { version: "1.0.1", commit: "layout-smoke", dirty: false },
    browserChannel: {
      channel: "chromium",
      configured: true,
      state: "ready",
      probed: true,
      source: "fixture",
      errorCode: null,
      lastCheckedAt: null,
    },
    capabilities: {
      playwrightNode: capability,
      playwrightCli: capability,
      browserChannel: capability,
      docx: capability,
      hepan: {
        state: "optional_unconfigured",
        source: "fixture",
        errorCode: "HEPAN_PYTHON_UNAVAILABLE",
        lastCheckedAt: null,
      },
    },
    errors: [],
    warnings: [],
  };
}

function installDesktopFixture(page) {
  return page.addInitScript((workspacePath) => {
    const result = (data) => Promise.resolve({ ok: true, data });
    const client = {
      id: "layout-smoke",
      name: "布局测试客户",
      knowledgeFiles: [],
    };
    const submissionPlatforms = Array.from({ length: 10 }, (_, index) => ({
      id: `fixture-${index}`,
      displayName:
        index === 0 ? "超长投稿平台名称示例" : `投稿平台${index + 1}`,
      scanDir: "published",
      contentQueueImport: true,
    }));
    const runtime = {
      get: () =>
        result({
          ok: true,
          buildInfo: { version: "1.0.1", commit: "layout-smoke", dirty: false },
          browserChannel: {
            channel: "chromium",
            configured: true,
            state: "ready",
            probed: true,
            source: "fixture",
            errorCode: null,
            lastCheckedAt: null,
          },
          capabilities: {
            playwrightNode: {
              state: "ready",
              source: "fixture",
              errorCode: null,
              lastCheckedAt: null,
            },
            playwrightCli: {
              state: "ready",
              source: "fixture",
              errorCode: null,
              lastCheckedAt: null,
            },
            browserChannel: {
              state: "ready",
              source: "fixture",
              errorCode: null,
              lastCheckedAt: null,
            },
            docx: {
              state: "ready",
              source: "fixture",
              errorCode: null,
              lastCheckedAt: null,
            },
            hepan: {
              state: "optional_unconfigured",
              source: "fixture",
              errorCode: "HEPAN_PYTHON_UNAVAILABLE",
              lastCheckedAt: null,
            },
          },
          errors: [],
          warnings: [],
        }),
      browserSmoke: () =>
        result({ ok: true, browserChannel: "chromium", session: "fixture" }),
    };
    const workspace = {
      getBootstrapState: () =>
        result({ state: "ready", workspacePath, envOverride: false }),
      getCurrent: () =>
        result({
          workspacePath,
          envOverride: false,
          validation: { ok: true, errors: [], warnings: [] },
        }),
      openCurrent: () => result(undefined),
      requestSwitch: () =>
        result({ state: "ready", workspacePath, envOverride: false }),
      chooseDirectory: () =>
        result({ state: "ready", workspacePath, envOverride: false }),
      confirmSelection: () => result({ state: "ready" }),
      cancelSelection: () =>
        result({ state: "ready", workspacePath, envOverride: false }),
    };
    const workspaceData = {
      getRuntimeIdentity: () =>
        result({ workspaceRuntimeId: "renderer-layout-fixture", revision: 0 }),
      onInvalidated: () => () => {},
    };
    const content = {
      listClients: () => result({ clients: [client] }),
      getClientDetails: () => result({ client, research: [] }),
      listGeneratedArticles: () => result({ articles: [] }),
      getArticleManagementSnapshot: ({ clientId }) =>
        result({
          clientId,
          revision: 1,
          articles: [],
          trash: [],
          publicationRecords: [],
          submissionPlatforms,
          workflowItems: [],
        }),
      listSubmissionBatches: () => result({ batches: [] }),
      listArticleTrash: () => result({ trash: [] }),
      listResearch: () => result({ research: [] }),
      listResearchMetadata: () => result({ research: [] }),
      listQuestions: () => result({ questions: [] }),
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
      listTemplates: () => result({ templates: [] }),
      listGenerationBatches: () => result([]),
      getGenerationBatchState: () =>
        result({
          state: "idle",
          currentBatchId: null,
          completed: 0,
          total: 0,
          tasks: [],
        }),
      previewGenerationBatch: () => result({}),
      previewSubmissionBatch: () =>
        result({ queueableTaskCount: 0, idempotentCount: 0, conflictCount: 0 }),
      previewCancelSubmissionBatch: () =>
        result({ allowedCount: 0, blockedCount: 0, items: [] }),
      getPlatformQueue: () => result({ platforms: [], queue: [] }),
    };
    const mediaArticle = {
      filename: "preflight-fixture.md",
      title: "预检交互稿件",
      content: "正文预览内容",
      words: 7,
      hasImages: false,
      selectedResources: [
        {
          resourceId: "preflight-resource",
          name: "预检资源",
          type: "image",
          price: 1,
        },
      ],
    };
    const unselectedMediaArticle = {
      filename: "unselected-fixture.md",
      title: "未选择媒体的稿件",
      content: "fixture",
      words: 7,
      hasImages: false,
      selectedResources: [],
    };
    const mediaSubmissionState = {
      scanCalls: 0,
      refreshShouldFail: false,
      thirdPartyId: "长期标识-A",
      thirdPartyIdSaves: 0,
    };
    window.__mediaSubmissionState = mediaSubmissionState;
    const media = {
      scanArticles: () => {
        mediaSubmissionState.scanCalls += 1;
        return result({ items: [mediaArticle, unselectedMediaArticle] });
      },
      previewArticle: () => result({ article: mediaArticle }),
      getDrafts: () => result({ items: [] }),
      getDraft: () => result({ draft: null }),
      setDraft: () => result({ completed: true }),
      refreshResources: () =>
        mediaSubmissionState.refreshShouldFail
          ? Promise.resolve({
              ok: false,
              error: {
                code: "MEDIA_CONFIG_NOT_SET",
                category: "validation",
                retryability: "never",
                userMessage: "请先配置付费媒体服务。",
              },
            })
          : result({
              status: "complete",
              complete: true,
              truncated: false,
              truncationReason: null,
              pageCount: 0,
              resourceCount: 0,
              diagnostics: [],
              refreshedAt: "2026-07-27T00:00:00.000Z",
            }),
      getResourcePage: () =>
        result({
          items: [],
          total: 0,
          page: 1,
          pageSize: 50,
          totalPages: 0,
          hasPrev: false,
          hasNext: false,
        }),
      searchResourcePage: () =>
        result({
          items: [],
          total: 0,
          page: 1,
          pageSize: 50,
          totalPages: 0,
          hasPrev: false,
          hasNext: false,
        }),
      getPool: () =>
        result({
          items: [],
          memberResourceIds: [],
          total: 0,
          page: 1,
          pageSize: 50,
          totalPages: 0,
          hasPrev: false,
          hasNext: false,
        }),
      addToPool: () =>
        result({
          resource: {
            resourceId: "preflight-resource",
            name: "预检资源",
            price: 1,
          },
        }),
      removeFromPool: () => result({ completed: true }),
      getBalance: () => result({ balance: "100" }),
    };
    const orders = {
      getOrders: () => result({ items: [] }),
      syncOrder: () =>
        result({
          order: {
            title: mediaArticle.title,
            filename: mediaArticle.filename,
            orderNid: "preflight-order",
            statusCode: "2",
            statusLabel: "已发布",
            submittedAt: "2026-07-27T00:00:00.000Z",
            publishedAt: "2026-07-28T00:00:00.000Z",
            resourceName: "预检资源",
            price: "1",
            hasPublishedUrl: true,
            publicationId: "publication-internal",
            publicationStatus: "published",
          },
        }),
      openPublishedUrl: () => result({ completed: true }),
    };
    const aiProvider = {
      getStatus: () =>
        result({
          configured: false,
          source: "application",
          apiKeyMask: "",
          lastTest: null,
        }),
      save: () => result({}),
      testConnection: () => result({}),
      clear: () => result({ cleared: true }),
    };
    const mediaSettingsStatus = () => ({
      configured: true,
      source: "application",
      baseUrl: "https://media.example.test",
      timeoutMs: 30000,
      allowInsecure: false,
      transport: "HTTPS",
      apiKeyMask: "test****key",
      thirdPartyId: mediaSubmissionState.thirdPartyId,
      lastTest: null,
    });
    const platformSettings = {
      getStatus: (platformId) =>
        result({
          status:
            platformId === "media"
              ? mediaSettingsStatus()
              : {
                  configured: false,
                  source: "application",
                  pythonConfigured: false,
                  cookieConfigured: false,
                  categoryId: 121,
                  vendorConfigured: false,
                  siteOrigin: "https://www.hepan.com",
                  lastTest: null,
                },
        }),
      save: (platformId, draft) => {
        if (platformId === "media" && typeof draft.thirdPartyId === "string") {
          mediaSubmissionState.thirdPartyId = draft.thirdPartyId;
          mediaSubmissionState.thirdPartyIdSaves += 1;
        }
        return result({ status: mediaSettingsStatus() });
      },
      test: () =>
        result({
          result: {
            testedAt: "2026-07-28T00:00:00.000Z",
            ok: true,
            code: "OK",
          },
        }),
      clear: () => result({ cleared: true }),
      getLegacyStatus: () =>
        result({
          discover: {
            media: { available: false, sources: [] },
            hepan: {
              available: false,
              sources: [],
              cookiePathAvailable: false,
            },
            sources: [],
            importable: false,
          },
          record: null,
        }),
      importLegacy: () => result({}),
    };
    const storageMaintenance = {
      getUsage: () =>
        result({
          logs: { bytes: 0, files: 0 },
          temporary: { bytes: 0, files: 0 },
          docxCache: { bytes: 0, files: 0 },
          profiles: { bytes: 0, files: 0 },
          active: true,
        }),
      cleanCaches: () => result({ blocked: false }),
    };
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
      workspace,
      workspaceData,
      runtimeDiagnostics: runtime,
      aiProvider,
      platformSettings,
      storageMaintenance,
      media,
      orders,
      platforms: {
        getQueue: () => result({ revision: 0, platforms: [], queue: [] }),
        getState: () =>
          result({
            runId: null,
            phase: "idle",
            total: 0,
            processed: 0,
            succeeded: 0,
            failed: 0,
            skipped: 0,
            uncertain: 0,
            currentTask: null,
            startedAt: null,
            updatedAt: null,
            terminalResult: null,
            isBatchRunning: false,
            isStopPending: false,
            isPlatformRunning: false,
            waitRemainingMs: 0,
          }),
        onState: () => () => {},
      },
      content,
    };
  }, fixtureWorkspace);
}

async function openRenderer(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(5000);
  page.on("pageerror", (error) =>
    process.stderr.write(`renderer page error: ${error.message}\n`),
  );
  await installDesktopFixture(page);
  await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
  await page.locator("#nav-item-article-library").waitFor();
  await page.locator("#nav-item-article-library").click();
  await page.getByRole("heading", { name: "文章库" }).waitFor();
  return page;
}

function assertInsideViewport(box, viewport) {
  assert.ok(box, "expected a visible layout box");
  assert.ok(
    box.x >= 0 && box.y >= 0,
    `box starts outside viewport: ${JSON.stringify(box)}`,
  );
  assert.ok(
    box.x + box.width <= viewport.width + 1,
    `box overflows right edge: ${JSON.stringify(box)}`,
  );
}

const SIDEBAR_NAVIGATION = [
  { viewMode: "content-production", label: "内容生产" },
  { viewMode: "article-library", label: "文章库" },
  { viewMode: "submission-center", label: "投稿中心" },
  { viewMode: "orders", label: "订单" },
  { viewMode: "resources", label: "媒体资源" },
  { viewMode: "settings", label: "设置" },
];

async function assertHistoryLayout(width, height) {
  const page = await openRenderer(width, height);
  try {
    const measured = await page.evaluate(() => {
      const heading = document.querySelector("h2");
      const note = heading?.nextElementSibling;
      const toolbar =
        heading?.closest("div.mb-4") || heading?.parentElement?.parentElement;
      const controls = Array.from(
        document.querySelectorAll("input, select, button"),
      );
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        heading: heading?.getBoundingClientRect().toJSON(),
        note: note?.getBoundingClientRect().toJSON(),
        toolbar: toolbar?.getBoundingClientRect().toJSON(),
        controls: controls.map((element) => ({
          text: element.textContent,
          box: element.getBoundingClientRect().toJSON(),
        })),
      };
    });
    assert.equal(measured.viewport.width, width);
    assert.equal(measured.viewport.height, height);
    assert.ok(
      measured.heading.width >= 120,
      `HISTORY_LAYOUT_RED ${JSON.stringify(measured)}`,
    );
    assert.ok(
      measured.note.width >= 120,
      `HISTORY_LAYOUT_RED ${JSON.stringify(measured)}`,
    );
    assertInsideViewport(measured.toolbar, measured.viewport);
    measured.controls
      .filter((control) => control.box.width > 0 && control.box.height > 0)
      .forEach((control) =>
        assertInsideViewport(control.box, measured.viewport),
      );
  } finally {
    await page.close();
  }
}

describe("real renderer responsive layout", { concurrency: false }, () => {
  before(async () => {
    assert.ok(
      fs.existsSync(
        path.join(fixtureWorkspace, "clients", "layout-smoke", "profile.md"),
      ),
    );
    ({ browser } = await startRenderer({ port: 4173 }));
  });
  after(closeRenderer);

  it("keeps six explicit ViewMode navigation items selectable in the compact sidebar", async () => {
    const page = await browser.newPage({
      viewport: { width: 720, height: 720 },
    });
    try {
      page.setDefaultTimeout(5000);
      await installDesktopFixture(page);
      await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
      await page.locator("#app-sidebar").waitFor();

      assert.equal(
        await page
          .locator(".app-sidebar-header[data-sidebar-section='header']")
          .count(),
        1,
      );
      assert.equal(
        await page
          .locator(".app-sidebar-navigation[data-sidebar-section='navigation']")
          .count(),
        1,
      );
      assert.equal(
        await page
          .locator(".app-sidebar-footer[data-sidebar-section='footer']")
          .count(),
        1,
      );
      assert.deepEqual(
        await page
          .locator("[data-sidebar-navigation-item='true']")
          .evaluateAll((items) =>
            items.map((item) => ({
              id: item.id,
              label: item.getAttribute("aria-label"),
              viewMode: item.getAttribute("data-view-mode"),
            })),
          ),
        SIDEBAR_NAVIGATION.map(({ viewMode, label }) => ({
          id: `nav-item-${viewMode}`,
          label,
          viewMode,
        })),
      );

      for (const { viewMode, label } of SIDEBAR_NAVIGATION) {
        await page.locator(`#nav-item-${viewMode}`).click();
        await page.waitForFunction(
          (view) => {
            const current = document.querySelectorAll(
              "#app-sidebar [aria-current='page']",
            );
            return current.length === 1 && current[0].id === `nav-item-${view}`;
          },
          viewMode,
        );
        if (viewMode === "content-production") {
          await page.locator("#questions").waitFor();
        } else {
          await page
            .getByRole("heading", { name: label, exact: true })
            .first()
            .waitFor();
        }
      }
    } finally {
      await page.close();
    }
  });

  it("keeps sidebar layout independent of child-order selectors and routing frameworks", () => {
    const sidebarSource = fs.readFileSync(
      path.join(rootDir, "media-workbench", "src", "components", "Sidebar.tsx"),
      "utf8",
    );
    const sidebarStyles = fs.readFileSync(
      path.join(rootDir, "media-workbench", "src", "index.css"),
      "utf8",
    );

    assert.doesNotMatch(
      sidebarStyles,
      /#app-sidebar\s+(?:nav\s*>\s*button|>\s*div:(?:first-child|last-child))/,
    );
    assert.doesNotMatch(
      sidebarSource,
      /\b(?:react-router|ReactRouter|createBrowserRouter|useNavigate)\b/,
    );
    assert.doesNotMatch(sidebarSource, /\b(?:navigation|route)Registry\b/);
  });

  it("dismisses the manual client and template refresh confirmation", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      page.setDefaultTimeout(5000);
      await installDesktopFixture(page);
      await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
      await page.clock.install();
      await page.evaluate(() => {
        const result = (data) => Promise.resolve({ ok: true, data });
        window.desktopConsole.content.listTemplateCatalog = () =>
          result({ revision: "refresh-confirmation", platforms: [], templates: [], diagnostics: [] });
        window.desktopConsole.content.listPaidMediaBatches = () => result({ items: [] });
      });

      await page.getByRole("button", { name: "刷新客户与模板" }).click();
      await page.getByText("客户与模板已刷新。", { exact: true }).waitFor();
      await page.clock.fastForward(3100);

      assert.equal(
        await page.getByText("客户与模板已刷新。", { exact: true }).count(),
        0,
      );
    } finally {
      await page.close();
    }
  });

  it("enables single article generation with the visible default template", async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    try {
      page.setDefaultTimeout(5000);
      await installDesktopFixture(page);
      await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => {
        const result = (data) => Promise.resolve({ ok: true, data });
        const client = {
          id: "layout-smoke",
          name: "布局测试客户",
          knowledgeFiles: [{ id: "facts.md", name: "facts.md", content: "客户事实", status: "ready" }],
        };
        window.desktopConsole.content.listClients = () => result({ clients: [client] });
        const research = [{ id: "research-1", clientId: client.id, question: "客户问题", answerText: "完整回答", isAnswerComplete: true }];
        window.desktopConsole.content.getClientDetails = () => result({ client, research });
        window.desktopConsole.content.listResearch = () => result({ research });
        window.desktopConsole.content.listResearchMetadata = () => result({ research });
        window.desktopConsole.content.listTemplateCatalog = () => result({
          revision: "single-default-template",
          platforms: [{ id: "fixture", displayName: "测试平台", description: "", order: 1 }],
          templates: [{ id: "template-1", platform: "fixture", name: "模板一", scenario: "默认模板", body: "模板正文", bodyHash: "fixture", source: "custom" }],
          diagnostics: [],
        });
      });

      await page.getByRole("button", { name: "刷新客户与模板" }).click();
      await page.locator("#nav-item-content-production").click();
      await page.getByRole("button", { name: "文章生成" }).click();
      await page.getByText(/资料 1 份 · 回答 1 条/).waitFor();

      assert.equal(await page.getByRole("button", { name: "生成 1 篇文章" }).isEnabled(), true);
    } finally {
      await page.close();
    }
  });

  it("keeps content production free of paid-media submission controls", async () => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    try {
      page.setDefaultTimeout(5000);
      await installDesktopFixture(page);
      await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
      assert.equal(await page.getByLabel("第三方标识").count(), 0);
      assert.equal(await page.getByRole("button", { name: "内容生产" }).count(), 1);
      assert.equal(
        await page.evaluate(
          () => typeof window.desktopConsole.media.submitSelected,
        ),
        "undefined",
      );
      for (const width of [900, 1180, 1280]) {
        await page.setViewportSize({ width, height: 720 });
        const layout = await page.evaluate(() => ({
          left: 0,
          right: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
        }));
        assert.ok(
          layout.left >= 0,
          `third-party identity starts outside ${width}px viewport`,
        );
        assert.ok(
          layout.right <= layout.viewportWidth,
          `third-party identity exceeds ${width}px viewport`,
        );
        assert.ok(
          layout.documentWidth <= layout.viewportWidth,
          `page overflows at ${width}px viewport`,
        );
      }
    } finally {
      await page.close();
    }
  });

  it("shows a safe media refresh failure instead of leaving the button with no feedback", async () => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    try {
      page.setDefaultTimeout(5000);
      await installDesktopFixture(page);
      await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
      await page.locator("#nav-item-resources").click();
      await page.evaluate(() => {
        window.__mediaSubmissionState.refreshShouldFail = true;
      });
      await page.getByRole("button", { name: "刷新库" }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: "请先配置付费媒体服务" })
        .waitFor();
    } finally {
      await page.close();
    }
  });

  it("shows completion feedback when a media refresh succeeds without changing the page", async () => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    try {
      page.setDefaultTimeout(5000);
      await installDesktopFixture(page);
      await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
      await page.locator("#nav-item-resources").click();
      await page.getByRole("button", { name: "刷新库" }).click();
      await page
        .getByRole("status")
        .filter({ hasText: "资源库已刷新，共 0 项" })
        .waitFor();
    } finally {
      await page.close();
    }
  });

  it("measures the history toolbar at the medium viewport", async () => {
    await assertHistoryLayout(1128, 527);
  });

  it("measures the history toolbar at the desktop viewport", async () => {
    await assertHistoryLayout(1424, 861);
  });

  it("exposes the settings page content at the desktop viewport", async () => {
    const page = await browser.newPage({
      viewport: { width: 1424, height: 861 },
    });
    try {
      page.setDefaultTimeout(5000);
      page.on("pageerror", (error) =>
        process.stderr.write(`renderer page error: ${error.message}\n`),
      );
      await installDesktopFixture(page);
      await page.goto(rendererUrl, { waitUntil: "domcontentloaded" });
      await page.locator("#nav-item-settings").waitFor();
      await page.locator("#nav-item-settings").click();
      await page.getByText("AI 生成", { exact: true }).first().waitFor();
      const measured = await page.evaluate(() => ({
        main: document.querySelector("main")?.getBoundingClientRect().toJSON(),
        settings: document
          .querySelector("main > div")
          ?.getBoundingClientRect()
          .toJSON(),
        text: document.body.innerText,
      }));
      assert.ok(measured.main.width >= 1100, JSON.stringify(measured));
      assert.match(measured.text, /AI 生成/);
      assert.match(measured.text, /付费媒体/);
      assert.match(measured.text, /蓝色河畔/);
      assert.match(measured.text, /工作区/);
      assert.match(measured.text, /运行环境/);
      assert.match(measured.text, /存储与清理/);
      for (const label of ["内容生产", "文章库", "投稿中心", "订单", "媒体资源", "设置"])
        assert.match(measured.text, new RegExp(label));

      await page.getByRole("button", { name: "工作区", exact: true }).click();
      const workspaceText = await page
        .locator("main")
        .filter({ hasText: /^工作区未选择/ })
        .innerText();
      assert.match(workspaceText, /工作区切换不会复制、移动或删除原有业务数据/);
      assert.doesNotMatch(workspaceText, /AES-256|LocalStorage|clearAll/);

      await page.getByRole("button", { name: "AI 生成", exact: true }).click();
      await page.getByLabel("AI Base URL").fill("http://provider.example/v1");
      await page.getByLabel("AI API Key").fill("fixture-key");
      await page.getByLabel("AI model").fill("fixture-model");
      await page.getByRole("button", { name: "保存配置" }).click();
      await page
        .getByRole("alert")
        .filter({ hasText: "Base URL 只允许 HTTPS" })
        .waitFor();

      await page.getByRole("button", { name: "运行环境", exact: true }).click();
      await page.getByRole("button", { name: "运行浏览器自检" }).waitFor();
      await page.getByText("Playwright Node", { exact: true }).waitFor();
      await page.getByText("DOCX 解析", { exact: true }).waitFor();

      await page
        .getByRole("button", { name: "存储与清理", exact: true })
        .click();
      const cleanCaches = page.getByRole("button", { name: "清理缓存" });
      await cleanCaches.waitFor();
      assert.equal(await cleanCaches.isDisabled(), true);
      await page.getByText(/日志：0 B/).waitFor();
      await page.getByText(/DOCX 缓存：0 B/).waitFor();
    } finally {
      await page.close();
    }
  });

  it("keeps expanded long-title history rows and row-end actions inside narrow viewports", async () => {
    const longTitle =
      "窄宽度长标题回归：这是一段足够长的历史文章标题，用来验证行尾发布详情动作不会越过 viewport";
    const articles = Array.from({ length: 8 }, (_, index) => ({
      id: `responsive-history-${index}`,
      clientId: "layout-smoke",
      researchQueryIds: [],
      platform: "fixture-responsive-platform",
      scenario: "响应式历史编辑",
      templateId: "fixture-responsive-template",
      title: `${longTitle} ${index}`,
      content: "responsive history fixture",
      status: "generated",
      source: {
        client_material: true,
        doubao_answer: true,
        references: false,
        template: true,
      },
      createdAt: `2026-07-18T00:${String(index).padStart(2, "0")}:00.000Z`,
      updatedAt: `2026-07-18T00:${String(index).padStart(2, "0")}:00.000Z`,
      templateSnapshot: {
        platform: "fixture-responsive-platform",
        id: "fixture-responsive-template",
        name: "超长模板名称用于响应式历史列表边界回归",
        scenario: "响应式历史编辑",
        body: "responsive template body",
        bodyHash: "responsive-template-hash",
        source: "custom",
      },
    }));

    for (const [width, height] of [
      [820, 620],
      [960, 620],
      [1128, 527],
      [1424, 861],
    ]) {
      const page = await openRenderer(width, height);
      try {
        await page.evaluate((items) => {
          const response = (data) => Promise.resolve({ ok: true, data });
          window.desktopConsole.content.listGeneratedArticles = () =>
            response({ articles: items });
          window.desktopConsole.content.getArticleManagementSnapshot = ({
            clientId,
          }) =>
            response({
              clientId,
              revision: Date.now(),
              articles: items,
              trash: [],
              publicationRecords: [],
              submissionPlatforms: [],
              workflowItems: items.map((article) => ({
                articleId: article.id,
                workflow: {
                  version: 1,
                  stage: "pending_submission",
                  label: "待投稿",
                  primaryAction: "submit",
                  allowedBulkActions: ["submit", "trash"],
                  locks: {
                    canEdit: true,
                    canSubmit: true,
                    canCancel: false,
                    canTrash: true,
                  },
                  operations: {
                    edit: { allowed: true, reasonCodes: [] },
                    submit: { allowed: true, reasonCodes: [] },
                    trash: { allowed: true, reasonCodes: [] },
                    restore: { allowed: false, reasonCodes: [] },
                    purge: { allowed: false, reasonCodes: [] },
                  },
                  publicationSummary: {
                    status: "not_submitted",
                    label: "未投稿",
                    records: 0,
                    published: 0,
                    uncertain: false,
                  },
                  attentionCount: 0,
                  orderSummary: { total: 0, pending: 0, unresolved: 0 },
                },
              })),
              lifecycleCounts: {
                pending_submission: items.length,
                needs_completion: 0,
                in_submission: 0,
                published: 0,
                trash: 0,
                total: items.length,
              },
            });
          window.desktopConsole.content.listTemplateCatalog = () =>
            response({
              revision: "responsive-fixture",
              platforms: [
                {
                  id: "fixture-responsive-platform",
                  displayName: "响应式测试平台",
                  description: "",
                  order: 1,
                },
              ],
              templates: [
                {
                  id: "fixture-responsive-template",
                  platform: "fixture-responsive-platform",
                  scenario: "响应式历史编辑",
                  name: "超长模板名称用于响应式历史列表边界回归",
                  body: "responsive template body",
                  bodyHash: "responsive-template-hash",
                  source: "custom",
                },
              ],
              diagnostics: [],
            });
          window.desktopConsole.publication = {
            listForArticles: () => response({ records: [] }),
          };
        }, articles);
        await page.getByRole("button", { name: "刷新客户与模板" }).click();
        await page.waitForFunction(
          () =>
            document.querySelector(
              "select[aria-label='当前客户']",
            )?.value === "layout-smoke",
        );
        await page.locator("#nav-item-article-library").click();
        await page.getByRole("heading", { name: "文章库" }).waitFor();
        assert.match(
          await page.locator("body").innerText(),
          /超长模板名称用于响应式历史列表边界回归/,
        );
        await page
          .getByRole("button", {
            name: /fixture-responsive-platform.*超长模板名称/,
          })
          .click();
        await page.getByText(`${longTitle} 7`, { exact: true }).waitFor();

        const measured = await page.evaluate(() => {
          const visible = (element) => {
            const box = element.getBoundingClientRect();
            return (
              box.width > 0 &&
              box.height > 0 &&
              getComputedStyle(element).visibility !== "hidden"
            );
          };
          const actionButtons = Array.from(
            document.querySelectorAll("button"),
          ).filter(
            (button) =>
              button.textContent?.includes("发布详情") && visible(button),
          );
          return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            documentScrollWidth: document.documentElement.scrollWidth,
            actions: actionButtons.map((button) => ({
              box: button.getBoundingClientRect().toJSON(),
              row: button.parentElement?.getBoundingClientRect().toJSON(),
            })),
            controls: Array.from(
              document.querySelectorAll("input, select, button, textarea"),
            )
              .filter(visible)
              .map((element) => ({
                text: element.textContent,
                box: element.getBoundingClientRect().toJSON(),
              })),
          };
        });
        assert.equal(measured.viewport.width, width);
        assert.equal(measured.viewport.height, height);
        assert.ok(
          measured.documentScrollWidth <= width + 1,
          `HISTORY_PAGE_OVERFLOW_RED ${JSON.stringify(measured)}`,
        );
        assert.ok(
          measured.actions.length > 0,
          `expected visible row-end actions ${JSON.stringify(measured)}`,
        );
        measured.actions.forEach(({ box, row }) => {
          assertInsideViewport(box, measured.viewport);
          assertInsideViewport(row, measured.viewport);
          assert.ok(
            row.x + row.width <= measured.viewport.width + 1,
            `history row overflows right edge: ${JSON.stringify(row)}`,
          );
        });
        measured.controls.forEach((control) =>
          assertInsideViewport(control.box, measured.viewport),
        );
      } finally {
        await page.close();
      }
    }

  });
});
