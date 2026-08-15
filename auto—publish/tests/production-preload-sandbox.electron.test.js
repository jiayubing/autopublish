const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");
const { _electron: electron } = require("playwright");

const root = path.resolve(__dirname, "..");
const enabled = process.platform === "win32";
const suite = enabled ? describe : describe.skip;

function read(relative) {
  return fs.readFileSync(path.join(root, relative), "utf8");
}

function sandboxManagementSnapshot() {
  const articleIdentityV1 = {
    version: 1,
    clientId: "client-sandbox",
    articleId: "article-published",
  };
  const targetIdentityV1 = {
    version: 1,
    kind: "platform",
    platformId: "lieju",
    accountProfileId: "account-sandbox",
  };
  return {
    clientId: "client-sandbox",
    revision: 1,
    articles: [
      {
        id: "article-reference",
        clientId: "client-sandbox",
        researchQueryIds: ["research-reference"],
        researchSnapshots: [
          {
            questionId: "research-reference",
            answerText: "调研回答",
            references: [
              {
                title: "引用",
                url: "https://example.com",
                snippet: "摘".repeat(10001),
              },
            ],
            collectionMethod: "automatic",
          },
        ],
        platform: "微信公众号",
        scenario: "介绍",
        templateId: "新闻稿",
        title: "引用测试标题",
        content: "引用测试正文",
        status: "saved",
        source: {
          client_material: true,
          doubao_answer: true,
          references: true,
          template: true,
        },
        createdAt: "2026-08-08T00:00:00.000Z",
      },
      {
        id: "article-published",
        clientId: "client-sandbox",
        researchQueryIds: [],
        researchSnapshots: [],
        platform: "lieju",
        scenario: "介绍",
        templateId: "新闻稿",
        title: "实际投稿标题",
        content: "实际投稿正文",
        status: "saved",
        source: {
          client_material: true,
          doubao_answer: true,
          references: false,
          template: true,
        },
        createdAt: "2026-08-08T00:00:00.000Z",
      },
    ],
    trash: [],
    submissionBatches: [],
    cancellationPlans: [],
    publicationRecords: [],
    publishedArchives: [
      {
        publicationId: "publication-sandbox",
        attemptId: "attempt-sandbox",
        publicationEvidenceV1: {
          version: 1,
          articleIdentityV1,
          customerSnapshotV1: {
            version: 1,
            clientId: "client-sandbox",
            displayName: "沙箱客户",
          },
          contentAvailable: true,
          title: "实际投稿标题",
          body: "实际投稿正文",
          contentFingerprint:
            "1a88d16fedaddbfebe52843e4ba68264466658f0b16d4ea8b414d29cf9da98a3",
          targetSnapshotV1: {
            ...targetIdentityV1,
            platformName: "列举网",
            accountLabel: "沙箱账号",
          },
          resultCode: "REGULAR_ACCEPTED",
          submittedAt: "2026-08-08T00:01:00.000Z",
          submittedAtSource: "regular_remote_call_started",
          firstPublishedAt: "2026-08-08T00:02:00.000Z",
          firstPublishedAtSource: "provider_event_time",
          imageSummaryV1: {
            deliveryMode: "text_only",
            images: [],
            decisionKind: "initial",
          },
          orderNumber: null,
          remoteUrl: "https://publisher.example/article-published",
          missingReasons: [],
          safeEvidenceRefs: [
            { kind: "PREPARED_SUBMISSION", fingerprint: "a".repeat(64) },
          ],
        },
        terminalTargetV1: {
          version: 1,
          articleIdentityV1,
          targetIdentityV1,
          attemptId: "attempt-sandbox",
          terminalKind: "PUBLISHED",
          reasonCode: "PUBLICATION_SUCCESS",
          terminalAt: "2026-08-08T00:02:00.000Z",
          terminalAtSource: "provider_event_time",
          evidenceFingerprint: "b".repeat(64),
        },
      },
    ],
    attention: { revision: 1, items: [], counts: { total: 0, actionable: 0 } },
    submissionPlatforms: [],
    workflowByArticle: {
      "article-published": {
        stage: "published",
        primaryAction: "view",
        allowedBulkActions: [],
        locks: {
          canEdit: false,
          canSubmit: false,
          canQueue: false,
          canCancel: false,
          canTrash: false,
        },
        attentionCount: 0,
        publicationSummary: {
          status: "published",
          records: 1,
          published: 1,
          uncertain: false,
        },
      },
    },
    publicationSummaries: {},
  };
}

it("routes desktop and package startup through the sandbox-compatible preload bundle", () => {
  const packageJson = JSON.parse(read("package.json"));
  const main = read("desktop/main.js");
  const desktop = read("scripts/desktop.cmd");
  const packaging = read("electron-builder.alpha.yml");
  const verifier = read("scripts/verify-alpha-package.js");
  assert.equal(
    packageJson.scripts["build:preload"],
    "node scripts/build-preload.js",
  );
  assert.match(main, /build["'],\s*["']preload["'],\s*["']preload\.cjs/);
  assert.doesNotMatch(
    main,
    /preload:\s*path\.join\(__dirname,\s*["']preload\.js/,
  );
  assert.match(desktop, /scripts\\build-preload\.js/);
  assert.match(packaging, /build\/preload\/preload\.cjs/);
  assert.match(verifier, /["']build\/preload\/preload\.cjs["']/);
  for (const name of [
    "pack:smoke",
    "pack:production",
    "dist:production",
    "pack:alpha",
    "pack:alpha:dirty",
    "dist:alpha",
    "dist:alpha:dirty",
  ]) {
    assert.match(packageJson.scripts[name], /npm run build:preload/);
  }
});

suite("production preload sandbox boundary", { concurrency: false }, () => {
  it("exposes the fixed desktop auth API from the real bundled preload", async () => {
    const directory = fs.mkdtempSync(
      path.join(os.tmpdir(), "production-preload-sandbox-"),
    );
    const bundle = path.join(directory, "preload.cjs");
    const main = path.join(directory, "main.cjs");
    let application;
    try {
      childProcess.execFileSync(
        process.execPath,
        [path.join(root, "scripts", "build-preload.js"), "--output", bundle],
        { cwd: root, stdio: "pipe" },
      );
      fs.writeFileSync(
        main,
        [
          'const { app, BrowserWindow, ipcMain } = require("electron");',
          `const { registerWorkspaceBootstrapIpc } = require(${JSON.stringify(path.join(root, "desktop", "ipc", "workspace-bootstrap-ipc.js"))});`,
          `const { createAuthenticatedIpcMain } = require(${JSON.stringify(path.join(root, "desktop", "ipc", "register.js"))});`,
          `const { registerAiContentIpc } = require(${JSON.stringify(path.join(root, "desktop", "ipc", "ai-content-ipc.js"))});`,
          `const { registerArticleManagementIpc } = require(${JSON.stringify(path.join(root, "desktop", "ipc", "article-management-ipc.js"))});`,
          `const { registerDoubaoCollectionIpc } = require(${JSON.stringify(path.join(root, "desktop", "ipc", "doubao-collection-ipc.js"))});`,
          `const { registerContentGenerationBatchIpc } = require(${JSON.stringify(path.join(root, "desktop", "ipc", "content-generation-batch-ipc.js"))});`,
          'registerWorkspaceBootstrapIpc({ ipcMain, requireAuthenticated: async () => {}, workspaceBootstrapService: { getBootstrapState: () => ({ state: "ready", workspacePath: "C:\\\\synthetic-workspace" }), chooseDirectory() {}, confirmSelection() {}, cancelSelection() {}, getCurrent() {}, openCurrent() {}, requestSwitch() {} }, showOpenDialog: async () => ({ canceled: true, filePaths: [] }) });',
          'registerAiContentIpc({ ipcMain: createAuthenticatedIpcMain(ipcMain, async () => {}), aiContentService: { generateArticle: async () => ({ id: "article-1", clientId: "client-1", researchQueryIds: ["research-1"], researchSnapshots: [{ questionId: "research-1", answerText: "回答", references: [], collectedAt: undefined, collectionMethod: undefined }], platform: "platform-1", scenario: "介绍", templateId: "template-1", title: "标题", content: "正文", status: "generated", source: { client_material: true, doubao_answer: true, references: false, template: true }, createdAt: "2026-07-27T00:00:00.000Z" }) } });',
          `registerArticleManagementIpc({ ipcMain: createAuthenticatedIpcMain(ipcMain, async () => {}), articleManagementSnapshot: { get: () => (${JSON.stringify(sandboxManagementSnapshot())}) } });`,
          'registerDoubaoCollectionIpc({ ipcMain: createAuthenticatedIpcMain(ipcMain, async () => {}), doubaoCollectionService: { listQuestions: () => [{ id: "品牌介绍问题", text: "请介绍品牌", enabled: true, createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z" }], getLoginState: () => { throw Object.assign(new Error("session closed"), { code: "PLAYWRIGHT_SESSION_NOT_OPEN" }); } } });',
          'registerContentGenerationBatchIpc({ ipcMain: createAuthenticatedIpcMain(ipcMain, async () => {}), contentGenerationBatchService: { preview: (input) => ({ clientCount: 1, executableClientCount: 1, taskCount: 1, executableTaskCount: 1, excludedTaskCount: 0, excludedClients: [], templates: [{ ...input.templates[0], source: "builtin", readOnly: true }], clientSources: input.clientSources, tasks: [{ clientId: input.clientIds[0], platform: input.templates[0].platform, templateId: input.templates[0].templateId, materialIds: input.clientSources[0].materialIds, researchQueryIds: input.clientSources[0].researchQueryIds }] }) } });',
          "app.whenReady().then(async () => {",
          `  const win = new BrowserWindow({ show: false, webPreferences: { preload: ${JSON.stringify(bundle)}, contextIsolation: true, nodeIntegration: false, sandbox: true } });`,
          '  await win.loadURL("data:text/html,<html><body>production preload probe</body></html>");',
          "});",
        ].join("\n"),
      );
      application = await electron.launch({
        executablePath: require("electron"),
        args: [main],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
      });
      const page = await application.firstWindow();
      const exposure = await page.evaluate(async () => ({
        desktopConsole: Boolean(window.desktopConsole),
        authMethods: window.desktopConsole?.auth
          ? Object.keys(window.desktopConsole.auth).sort()
          : [],
        workspaceState:
          await window.desktopConsole?.workspace?.getBootstrapState(),
        contentState: await window.desktopConsole?.content?.generateArticle({
          clientId: "client-1",
          materialIds: ["material-1"],
          researchQueryIds: ["research-1"],
          platform: "platform-1",
          templateId: "template-1",
        }),
        doubaoQuestions:
          await window.desktopConsole?.content?.listQuestions("中文客户"),
        doubaoLoginState:
          await window.desktopConsole?.content?.getDoubaoLoginState(),
        generationPreview:
          await window.desktopConsole?.content?.previewGenerationBatch({ clientIds: ["畅途"], templates: [{ platform: "微信公众号", templateId: "品牌介绍" }], clientSources: [{ clientId: "畅途", materialIds: ["品牌资料.docx"], researchQueryIds: ["厦门汽车音响改装推荐"] }] }),
        invalidGenerationRequest:
          await window.desktopConsole?.content?.previewGenerationBatch({ clientIds: ["C:\\private"], templates: [{ platform: "media", templateId: "template-1" }] }),
        managementReference: await (async () => {
          const result = await window.desktopConsole?.content?.getArticleManagementSnapshot({ clientId: "畅途" });
          return {
            ok: result?.ok,
            length:
              result?.data?.articles?.[0]?.researchSnapshots?.[0]
                ?.references?.[0]?.snippet?.length,
            errorCode: result?.error?.code || null,
          };
        })(),
        managementPublished: await (async () => {
          const result = await window.desktopConsole?.content?.getArticleManagementSnapshot({ clientId: "畅途" });
          return {
            ok: result?.ok,
            errorCode: result?.error?.code || null,
            remoteUrl:
              result?.data?.publishedArchives?.[0]?.publicationEvidenceV1
                ?.remoteUrl || null,
            stage: result?.data?.workflowItems?.find(
              (item) => item.articleId === "article-published",
            )?.workflow?.stage,
          };
        })(),
        genericInvoke: typeof window.desktopConsole?.invoke,
        genericOn: typeof window.desktopConsole?.on,
      }));
      assert.deepEqual(exposure, {
        desktopConsole: true,
        authMethods: [
          "changePassword",
          "getState",
          "login",
          "logout",
          "onStateChanged",
          "refresh",
        ],
        workspaceState: {
          schemaVersion: 1,
          ok: true,
          data: {
            state: "ready",
            configured: true,
            environmentManaged: false,
            label: "工作区已配置",
            selection: null,
            errorCode: null,
            changed: null,
          },
        },
        contentState: {
          schemaVersion: 1,
          ok: true,
          data: {
            article: {
              id: "article-1",
              clientId: "client-1",
              researchQueryIds: ["research-1"],
              researchSnapshots: [
                {
                  questionId: "research-1",
                  answerText: "回答",
                  references: [],
                  collectionMethod: "legacy",
                },
              ],
              platform: "platform-1",
              scenario: "介绍",
              templateId: "template-1",
              title: "标题",
              content: "正文",
              status: "generated",
              source: {
                client_material: true,
                doubao_answer: true,
                references: false,
                template: true,
              },
              createdAt: "2026-07-27T00:00:00.000Z",
            },
          },
        },
        doubaoQuestions: {
          schemaVersion: 1,
          ok: true,
          data: {
            questions: [
              {
                id: "品牌介绍问题",
                text: "请介绍品牌",
                enabled: true,
                createdAt: "2026-07-27T00:00:00.000Z",
                updatedAt: "2026-07-27T00:00:00.000Z",
              },
            ],
          },
        },
        doubaoLoginState: {
          schemaVersion: 1,
          ok: false,
          error: {
            code: "PLAYWRIGHT_SESSION_NOT_OPEN",
            category: "transport",
            retryability: "safe",
            userMessage: "豆包登录窗口当前未打开，已保留上次登录状态。",
          },
        },
        generationPreview: {
          schemaVersion: 1,
          ok: true,
          data: {
            clientCount: 1,
            executableClientCount: 1,
            taskCount: 1,
            executableTaskCount: 1,
            excludedTaskCount: 0,
            excludedClients: [],
            templates: [{ platform: "微信公众号", templateId: "品牌介绍" }],
            clientSources: [{ clientId: "畅途", materialIds: ["品牌资料.docx"], researchQueryIds: ["厦门汽车音响改装推荐"] }],
            tasks: [{ clientId: "畅途", platform: "微信公众号", templateId: "品牌介绍", materialIds: ["品牌资料.docx"], researchQueryIds: ["厦门汽车音响改装推荐"] }],
          },
        },
        invalidGenerationRequest: {
          schemaVersion: 1,
          ok: false,
          error: {
            code: "IPC_REQUEST_INVALID",
            category: "validation",
            retryability: "never",
            userMessage: "生成请求无效，请刷新页面后重试。",
          },
        },
        managementReference: { ok: true, length: 10000, errorCode: null },
        managementPublished: {
          ok: true,
          errorCode: null,
          remoteUrl: "https://publisher.example/article-published",
          stage: "published",
        },
        genericInvoke: "undefined",
        genericOn: "undefined",
      });
    } finally {
      if (application) await application.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  if (process.env.PACKAGED_RESOURCES)
    it("loads the bundled preload directly from the packaged ASAR", async () => {
      const resources = path.resolve(process.env.PACKAGED_RESOURCES);
      const preload = path.join(
        resources,
        "app.asar",
        "build",
        "preload",
        "preload.cjs",
      );
      const workspaceRegistrar = path.join(
        resources,
        "app.asar",
        "desktop",
        "ipc",
        "workspace-bootstrap-ipc.js",
      );
      const authenticatedRegistrar = path.join(
        resources,
        "app.asar",
        "desktop",
        "ipc",
        "register.js",
      );
      const aiContentRegistrar = path.join(
        resources,
        "app.asar",
        "desktop",
        "ipc",
        "ai-content-ipc.js",
      );
      const generationRegistrar = path.join(
        resources,
        "app.asar",
        "desktop",
        "ipc",
        "content-generation-batch-ipc.js",
      );
      const articleManagementRegistrar = path.join(
        resources,
        "app.asar",
        "desktop",
        "ipc",
        "article-management-ipc.js",
      );
      const directory = fs.mkdtempSync(
        path.join(os.tmpdir(), "packaged-preload-sandbox-"),
      );
      const main = path.join(directory, "main.cjs");
      let application;
      try {
        fs.writeFileSync(
          main,
          [
            'const { app, BrowserWindow, ipcMain } = require("electron");',
            `const { registerWorkspaceBootstrapIpc } = require(${JSON.stringify(workspaceRegistrar)});`,
            `const { createAuthenticatedIpcMain } = require(${JSON.stringify(authenticatedRegistrar)});`,
            `const { registerAiContentIpc } = require(${JSON.stringify(aiContentRegistrar)});`,
            `const { registerArticleManagementIpc } = require(${JSON.stringify(articleManagementRegistrar)});`,
            `const { registerDoubaoCollectionIpc } = require(${JSON.stringify(path.join(resources, "app.asar", "desktop", "ipc", "doubao-collection-ipc.js"))});`,
            `const { registerContentGenerationBatchIpc } = require(${JSON.stringify(generationRegistrar)});`,
            'registerWorkspaceBootstrapIpc({ ipcMain, requireAuthenticated: async () => {}, workspaceBootstrapService: { getBootstrapState: () => ({ state: "ready", workspacePath: "C:\\\\synthetic-workspace" }), chooseDirectory() {}, confirmSelection() {}, cancelSelection() {}, getCurrent() {}, openCurrent() {}, requestSwitch() {} }, showOpenDialog: async () => ({ canceled: true, filePaths: [] }) });',
            'registerAiContentIpc({ ipcMain: createAuthenticatedIpcMain(ipcMain, async () => {}), aiContentService: { generateArticle: async () => ({ id: "article-1", clientId: "client-1", researchQueryIds: ["research-1"], researchSnapshots: [{ questionId: "research-1", answerText: "回答", references: [], collectedAt: undefined, collectionMethod: undefined }], platform: "platform-1", scenario: "介绍", templateId: "template-1", title: "标题", content: "正文", status: "generated", source: { client_material: true, doubao_answer: true, references: false, template: true }, createdAt: "2026-07-27T00:00:00.000Z" }) } });',
            `registerArticleManagementIpc({ ipcMain: createAuthenticatedIpcMain(ipcMain, async () => {}), articleManagementSnapshot: { get: () => (${JSON.stringify(sandboxManagementSnapshot())}) } });`,
            'registerDoubaoCollectionIpc({ ipcMain: createAuthenticatedIpcMain(ipcMain, async () => {}), doubaoCollectionService: { listQuestions: () => [{ id: "品牌介绍问题", text: "请介绍品牌", enabled: true, createdAt: "2026-07-27T00:00:00.000Z", updatedAt: "2026-07-27T00:00:00.000Z" }], getLoginState: () => { throw Object.assign(new Error("session closed"), { code: "PLAYWRIGHT_SESSION_NOT_OPEN" }); } } });',
            'registerContentGenerationBatchIpc({ ipcMain: createAuthenticatedIpcMain(ipcMain, async () => {}), contentGenerationBatchService: { preview: (input) => ({ clientCount: 1, executableClientCount: 1, taskCount: 1, executableTaskCount: 1, excludedTaskCount: 0, excludedClients: [], templates: [{ ...input.templates[0], source: "builtin", readOnly: true }], clientSources: input.clientSources, tasks: [{ clientId: input.clientIds[0], platform: input.templates[0].platform, templateId: input.templates[0].templateId, materialIds: input.clientSources[0].materialIds, researchQueryIds: input.clientSources[0].researchQueryIds }] }) } });',
            "app.whenReady().then(async () => {",
            `  const win = new BrowserWindow({ show: false, webPreferences: { preload: ${JSON.stringify(preload)}, contextIsolation: true, nodeIntegration: false, sandbox: true } });`,
            '  await win.loadURL("data:text/html,<html><body>packaged preload probe</body></html>");',
            "});",
          ].join("\n"),
        );
        application = await electron.launch({
          executablePath: require("electron"),
          args: [main],
          env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
        });
        const page = await application.firstWindow();
        assert.equal(
          await page.evaluate(() => Boolean(window.desktopConsole?.auth)),
          true,
        );
        assert.equal(
          await page.evaluate(async () => {
            const result =
              await window.desktopConsole?.content?.generateArticle({
                clientId: "client-1",
                materialIds: ["material-1"],
                researchQueryIds: ["research-1"],
                platform: "platform-1",
                templateId: "template-1",
              });
            return (
              result?.ok === true && result.data?.article?.id === "article-1"
            );
          }),
          true,
        );
        assert.equal(
          await page.evaluate(async () => {
            const valid =
              await window.desktopConsole?.content?.previewGenerationBatch({
                clientIds: ["畅途"],
                templates: [{ platform: "微信公众号", templateId: "品牌介绍" }],
                clientSources: [{ clientId: "畅途", materialIds: ["品牌资料.docx"], researchQueryIds: ["厦门汽车音响改装推荐"] }],
              });
            const invalid =
              await window.desktopConsole?.content?.previewGenerationBatch({
                clientIds: ["C:\\private"],
                templates: [{ platform: "media", templateId: "template-1" }],
              });
            return (
              valid?.ok === true &&
              valid.data?.templates?.[0]?.templateId === "品牌介绍" &&
              invalid?.ok === false &&
              invalid.error?.code === "IPC_REQUEST_INVALID"
            );
          }),
          true,
        );
        assert.equal(
          await page.evaluate(async () => {
            const questions =
              await window.desktopConsole?.content?.listQuestions("中文客户");
            const login =
              await window.desktopConsole?.content?.getDoubaoLoginState();
            return (
              questions?.ok === true &&
              questions.data?.questions?.[0]?.id === "品牌介绍问题" &&
              login?.ok === false &&
              login.error?.code === "PLAYWRIGHT_SESSION_NOT_OPEN"
            );
          }),
          true,
        );
        assert.equal(
          await page.evaluate(async () => {
            const result =
              await window.desktopConsole?.content?.getArticleManagementSnapshot({ clientId: "畅途" });
            return (
              result?.ok === true &&
              result.data?.articles?.[0]?.researchSnapshots?.[0]?.references?.[0]?.snippet?.length === 10000 &&
              result.data?.publishedArchives?.[0]?.publicationEvidenceV1
                ?.remoteUrl ===
                "https://publisher.example/article-published" &&
              result.data?.workflowItems?.find(
                (item) => item.articleId === "article-published",
              )?.workflow?.stage === "published"
            );
          }),
          true,
        );
        assert.equal(
          await page.evaluate(async () => {
            const result =
              await window.desktopConsole?.workspace?.getBootstrapState();
            return result?.ok === true && result.data?.state === "ready";
          }),
          true,
        );
      } finally {
        if (application) await application.close();
        fs.rmSync(directory, { recursive: true, force: true });
      }
    });
});
