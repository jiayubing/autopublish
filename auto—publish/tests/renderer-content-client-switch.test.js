const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { after, before } = require("node:test");
const { closeRenderer, startRenderer } = require("./helpers/renderer-harness");

async function changeClient(page, select, clientId) {
  const box = await select.boundingBox();
  assert.ok(box, "客户选择器应有可点击的布局盒");
  const hit = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.tagName,
    {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    },
  );
  assert.equal(hit, "SELECT", "客户选择器中心不能被内容区编辑器或忙碌遮罩覆盖");
  await select.selectOption(clientId);
}

describe("renderer content client switching", function () {
  let browser;

  before(async function () {
    ({ browser } = await startRenderer({ port: 4179 }));
  });

  after(closeRenderer);

  it("switches from a queued client to another client through the real Renderer", async function () {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    page.setDefaultTimeout(8000);
    await page.addInitScript(() => {
      const ok = (data) => Promise.resolve({ ok: true, data });
      const clients = [
        { id: "client-a", name: "客户 A", knowledgeFiles: [] },
        { id: "client-b", name: "客户 B", knowledgeFiles: [] },
      ];
      const article = (clientId, id, title) => ({
        id,
        clientId,
        researchQueryIds: [],
        platform: "fixture-platform",
        scenario: "客户切换回归",
        templateId: "fixture-template",
        title,
        content: `${title} 正文`,
        status: "generated",
        source: {
          client_material: true,
          doubao_answer: true,
          references: false,
          template: true,
        },
        createdAt: "2026-07-20T00:00:00.000Z",
        updatedAt: "2026-07-20T00:00:00.000Z",
        templateSnapshot: {
          platform: "fixture-platform",
          id: "fixture-template",
          name: "测试模板",
          scenario: "客户切换回归",
          body: "fixture",
          bodyHash: "fixture",
          source: "custom",
        },
      });
      const state = {
        articles: {
          "client-a": [
            article("client-a", "article-a", "客户 A 文章"),
            article("client-a", "article-a-2", "客户 A 第二文章"),
          ],
          "client-b": [
            article("client-b", "article-b", "客户 B 文章"),
            {
              ...article("client-b", "article-b-2", "客户 B 第二文章"),
              content: "详情见 https://example.test",
            },
          ],
        },
        batches: { "client-a": [] },
        staging: {
          "client-a": [],
          "client-b": [
            {
              articleRef: { clientId: "client-b", articleId: "article-b" },
              selectedMediaResourceId: "media-b",
              createdAt: "2026-07-20T00:00:00.000Z",
              updatedAt: "2026-07-20T00:00:00.000Z",
            },
            {
              articleRef: { clientId: "client-b", articleId: "article-b-2" },
              selectedMediaResourceId: "media-b",
              createdAt: "2026-07-20T00:00:00.000Z",
              updatedAt: "2026-07-20T00:00:00.000Z",
            },
          ],
        },
        paidBatches: [
          {
            batchId: "foreign-batch",
            mediaResourceId: "media-a",
            status: "queued",
            pauseIntent: "manual",
            paused: true,
            runState: "paused",
            actions: { canStart: true, canPause: false },
            articleCount: 1,
            quotedPrice: 12.5,
            estimatedTotal: 12.5,
            createdAt: "2026-07-20T00:00:00.000Z",
            updatedAt: "2026-07-20T00:00:00.000Z",
            items: [
              {
                itemId: "foreign-item",
                articleRef: { clientId: "client-a", articleId: "article-a" },
                status: "queued",
                phase: "queued",
              },
            ],
          },
        ],
        queueCalls: [],
        resolveQueue: null,
        regularQueueCalls: [],
        regularQueueBatchSequence: 0,
        resolveRegularQueue: null,
        cancellationCalls: [],
        resolveCancellation: null,
        cancelPreviewCalls: [],
        paidStagingAddCalls: [],
        paidStagingRemoveCalls: [],
        paidStagingMediaSetCalls: [],
        poolPageCalls: [],
        paidPreflightCalls: [],
        paidConfirmCalls: [],
        lastPaidPreflight: null,
        failNextPaidConfirm: false,
        orderCalls: [],
        holdNextStart: false,
        resolveStart: null,
        holdNextPause: false,
        resolvePause: null,
      };
      const updatePaidBatch = (batchId, patch) => {
        const current = state.paidBatches.find(
          (batch) => batch.batchId === batchId,
        );
        if (!current) return null;
        const next = {
          ...current,
          ...patch,
          updatedAt: "2026-08-13T00:01:00.000Z",
        };
        state.paidBatches = state.paidBatches.map((batch) =>
          batch.batchId === batchId ? next : batch,
        );
        return next;
      };
      const generationBatch = {
        id: "generation-batch-a",
        status: "completed",
        clientSources: [
          { clientId: "client-a", materialIds: [], researchQueryIds: [] },
        ],
        templates: [
          { platform: "fixture-platform", templateId: "fixture-template" },
        ],
        tasks: [
          {
            id: "generation-task-a",
            clientId: "client-a",
            platform: "fixture-platform",
            templateId: "fixture-template",
            materialIds: [],
            researchQueryIds: [],
            status: "succeeded",
            attempts: 1,
            error: null,
            articleId: "article-a",
          },
        ],
        counts: {
          total: 1,
          succeeded: 1,
          failed: 0,
          pending: 0,
          interrupted: 0,
          cancelled: 0,
        },
      };
      const platforms = [
        {
          id: "fixture-platform",
          displayName: "测试投稿平台",
          contentQueueImport: true,
        },
      ];
      const pendingWorkflow = (articleId) => ({
        articleId,
        workflow: {
          version: 1,
          stage: "pending_submission",
          label: "待投稿",
          primaryAction: "queue",
          allowedBulkActions: ["queue"],
          locks: {
            canEdit: true,
            canQueue: true,
            canCancel: false,
            canTrash: true,
          },
          publicationSummary: {
            status: "not_submitted",
            label: "未投稿",
            records: 0,
            published: 0,
            uncertain: false,
          },
          targetFacts: [],
        },
      });
      const content = {
        listClients: () => ok({ clients }),
        listGeneratedArticles: (clientId) =>
          ok({ articles: state.articles[clientId] || [] }),
        getArticleManagementSnapshot: ({ clientId }) => {
          const batches = state.batches[clientId] || [];
          const workflowItems = (state.articles[clientId] || []).map((item) =>
            pendingWorkflow(item.id),
          );
          return ok({
            clientId,
            revision: 1,
            articles: state.articles[clientId] || [],
            trash: [],
            submissionBatches: batches,
            cancellationPlans: batches
              .filter((batch) => batch.status === "queued")
              .map((batch) => ({
                batchId: batch.id,
                clientId,
                action: "cancel",
                planId: `plan-${batch.id}-${batch.status}`,
                fingerprint: batch.status,
                allowedCount: batch.items.length,
                blockedCount: 0,
                items: batch.items.map((item) => ({
                  articleId: item.articleId,
                  targetPlatformId: item.targetPlatformId,
                  action: "cancel",
                  allowed: true,
                })),
              })),
            publicationRecords: [],
            attention: {
              revision: 1,
              items: [],
              counts: { total: 0, actionable: 0 },
            },
            submissionPlatforms: platforms,
            workflowItems,
            publicationSummaryItems: workflowItems.map((item) => ({
              articleId: item.articleId,
              summary: item.workflow.publicationSummary,
            })),
          });
        },
        listSubmissionPlatforms: () => ok({ platforms }),
        listSubmissionBatches: ({ clientId }) =>
          ok({ batches: state.batches[clientId] || [] }),
        listArticleTrash: () => ok({ trash: [] }),
        listResearch: () => ok({ research: [] }),
        listQuestions: () => ok({ questions: [] }),
        listArticleAttention: () =>
          ok({ revision: 0, items: [], counts: { total: 0, actionable: 0 } }),
        listTemplateCatalog: () =>
          ok({
            revision: "fixture",
            platforms: [
              {
                id: "fixture-platform",
                displayName: "测试模板平台",
                description: "",
                order: 1,
              },
            ],
            templates: [
              {
                id: "fixture-template",
                platform: "fixture-platform",
                scenario: "客户切换回归",
                name: "测试模板",
                body: "fixture",
                bodyHash: "fixture",
                source: "custom",
              },
            ],
            diagnostics: [],
          }),
        listGenerationBatches: () => ok({ batches: [generationBatch] }),
        getGenerationBatch: () => ok({ batch: generationBatch }),
        getGenerationBatchState: () =>
          ok({ status: "idle", state: "idle", batchId: null }),
        getGenerationRuntimeSnapshot: () =>
          ok({
            runtimeId: "fixture-runtime",
            sequence: 0,
            runtime: { status: "idle", state: "idle", batchId: null },
            batch: generationBatch,
            capabilities: {},
          }),
        onGenerationBatchState: () => () => {},
        previewGenerationSubmissionHandoff: () =>
          ok({
            generationBatchId: generationBatch.id,
            previewToken: "handoff-preview",
            articleCount: 1,
            clientCount: 1,
            platformId: "fixture-platform",
            accountProfileId: "account-fixture",
            estimatedTaskCount: 1,
            queueableTaskCount: 1,
            idempotentCount: 0,
            blockedPublishedCount: 0,
            blockedUncertainCount: 0,
            blockedContentCount: 0,
            conflictCount: 0,
            unavailableArticleCount: 0,
            invalidArticles: [],
            clientGroups: [
              {
                clientId: "client-a",
                articleCount: 1,
                queueableTaskCount: 1,
                idempotentCount: 0,
              },
            ],
            items: [],
          }),
        commitGenerationSubmissionHandoff: () =>
          ok({
            generationBatchId: generationBatch.id,
            createdCount: 1,
            idempotentCount: 0,
            blockedCount: 0,
            conflictCount: 0,
            failedClientGroups: [],
            completedClientGroups: ["client-a"],
            clientGroups: [
              {
                clientId: "client-a",
                articleCount: 1,
                queueableTaskCount: 1,
                idempotentCount: 0,
              },
            ],
          }),
        previewRegularQueueAdmission: (input) =>
          (() => {
            const stagedIds = new Set(
              (state.staging[input.articleRefs[0]?.clientId] || []).map(
                (item) => item.articleRef.articleId,
              ),
            );
            const conflictCount = input.articleRefs.filter((articleRef) =>
              stagedIds.has(articleRef.articleId),
            ).length;
            const queueableCount = input.articleRefs.length - conflictCount;
            return ok({
              target: {
                platformId: input.platformId,
                accountProfileId: input.accountProfileId,
              },
              articleRefs: input.articleRefs,
              items: input.articleRefs.map((articleRef) => ({
                articleRef,
                articleId: articleRef.articleId,
                status: stagedIds.has(articleRef.articleId)
                  ? "conflict"
                  : "queueable",
                reasonCode: stagedIds.has(articleRef.articleId)
                  ? "PAID_STAGING_REGULAR_QUEUE_CONFLICT"
                  : null,
              })),
              totalCount: input.articleRefs.length,
              queueableCount,
              idempotentCount: 0,
              missingCount: 0,
              conflictCount,
            });
          })(),
        admitRegularQueueItems: (input) => {
          const clientId = input.articleRefs[0].clientId;
          const batchId = `regular-batch-${++state.regularQueueBatchSequence}`;
          const batch = {
            id: batchId,
            clientId,
            status: "queued",
            createdAt: "2026-07-20T00:00:01.000Z",
            updatedAt: "2026-07-20T00:00:01.000Z",
            items: input.articleRefs.map((articleRef, index) => ({
              articleId: articleRef.articleId,
              itemId: `regular-item-${batchId}`,
              batchId,
              targetPlatformId: input.platformId,
              targetKey: `platform:${input.platformId}`,
              queueGroupId: `regular-group-${input.platformId}`,
              position: index + 1,
              status: "queued",
              canCancel: true,
            })),
          };
          state.regularQueueCalls.push(input);
          state.batches[clientId] = [batch];
          return new Promise((resolve) => {
            state.resolveRegularQueue = () =>
              resolve(
                ok({
                  batchId,
                  target: {
                    platformId: input.platformId,
                    accountProfileId: input.accountProfileId,
                  },
                  articleRefs: input.articleRefs,
                  items: batch.items.map((item, index) => ({
                    articleRef: input.articleRefs[index],
                    articleId: item.articleId,
                    itemId: item.itemId,
                    batchId,
                    targetKey: item.targetKey,
                    queueGroupId: item.queueGroupId,
                    position: item.position,
                    status: "queued",
                  })),
                  admittedCount: batch.items.length,
                  idempotentCount: 0,
                  missingCount: 0,
                  conflictCount: 0,
                }),
              );
          });
        },
        previewSubmissionBatch: (input) =>
          ok({
            clientId: input.clientId,
            platformId: input.platformId,
            accountProfileId: input.accountProfileId,
            totalTaskCount: input.articleIds.length,
            queueableTaskCount: input.articleIds.length,
            idempotentCount: 0,
            conflictCount: 0,
            blockedContentCount: 0,
            missingArticleIds: [],
            unsupportedPlatformIds: [],
            items: [],
          }),
        createSubmissionBatch: (input) => {
          state.queueCalls.push(input);
          state.batches[input.clientId] = [
            {
              id: "batch-a",
              clientId: input.clientId,
              status: "queued",
              createdAt: "2026-07-20T00:00:01.000Z",
              updatedAt: "2026-07-20T00:00:01.000Z",
              items: input.articleIds.map((articleId) => ({
                articleId,
                targetPlatformId: input.platformId,
                status: "queued",
                canCancel: true,
              })),
            },
          ];
          return new Promise((resolve) => {
            state.resolveQueue = () =>
              resolve({ ok: true, data: state.batches[input.clientId][0] });
          });
        },
        listPaidMediaBatches: () => {
          return ok({ items: state.paidBatches });
        },
        startPaidMediaBatch: (input) => {
          state.orderCalls.push({ type: "start", input });
          const batch = updatePaidBatch(input.batchId, {
            pauseIntent: "none",
            paused: false,
            runState: "running",
            actions: { canStart: false, canPause: true },
          });
          const result = ok({
            executionStatus: "running",
            batch,
          });
          if (!state.holdNextStart) return result;
          state.holdNextStart = false;
          return new Promise((resolve) => {
            state.resolveStart = () => {
              state.resolveStart = null;
              resolve(result);
            };
          });
        },
        pausePaidMediaBatch: (input) => {
          state.orderCalls.push({ type: "pause", input });
          const batch = updatePaidBatch(input.batchId, {
            pauseIntent: "manual",
            paused: true,
            runState: "paused",
            actions: { canStart: true, canPause: false },
          });
          const result = ok({
            executionStatus: "paused",
            batch,
          });
          if (!state.holdNextPause) return result;
          state.holdNextPause = false;
          return new Promise((resolve) => {
            state.resolvePause = () => {
              state.resolvePause = null;
              resolve(result);
            };
          });
        },
        getPaidSubmissionStaging: ({ clientId }) =>
          ok({ clientId, items: state.staging[clientId] || [] }),
        addPaidSubmissionStaging: (input) => {
          state.paidStagingAddCalls.push(input);
          const clientId = input.articleRefs[0]?.clientId;
          const current = state.staging[clientId] || [];
          const existing = new Set(
            current.map((item) => item.articleRef.articleId),
          );
          const added = input.articleRefs
            .filter((articleRef) => !existing.has(articleRef.articleId))
            .map((articleRef) => ({
              articleRef,
              selectedMediaResourceId: null,
              createdAt: "2026-07-20T00:00:00.000Z",
              updatedAt: "2026-07-20T00:00:00.000Z",
            }));
          state.staging[clientId] = [...current, ...added];
          return ok({
            addedCount: added.length,
            idempotentCount: input.articleRefs.length - added.length,
            items: input.articleRefs.map((articleRef) => ({
              articleRef,
              status: existing.has(articleRef.articleId)
                ? "idempotent"
                : "added",
              idempotent: existing.has(articleRef.articleId),
            })),
          });
        },
        removePaidSubmissionStaging: (input) => {
          state.paidStagingRemoveCalls.push(input);
          const clientId = input.articleRefs[0]?.clientId;
          const current = state.staging[clientId] || [];
          const ids = new Set(input.articleRefs.map((item) => item.articleId));
          const removedCount = current.filter((item) =>
            ids.has(item.articleRef.articleId),
          ).length;
          state.staging[clientId] = current.filter(
            (item) => !ids.has(item.articleRef.articleId),
          );
          return ok({
            removedCount,
            idempotentCount: input.articleRefs.length - removedCount,
            items: [],
          });
        },
        setPaidSubmissionStagingMedia: (input) => {
          state.paidStagingMediaSetCalls.push(input);
          const clientId = input.articleRefs[0]?.clientId;
          const ids = new Set(input.articleRefs.map((item) => item.articleId));
          const current = state.staging[clientId] || [];
          state.staging[clientId] = current.map((item) =>
            ids.has(item.articleRef.articleId)
              ? {
                  ...item,
                  selectedMediaResourceId: input.mediaResourceId,
                  updatedAt: "2026-07-20T00:00:01.000Z",
                }
              : item,
          );
          return ok({
            updatedCount: input.articleRefs.length,
            idempotentCount: 0,
            selectedMediaResourceId: input.mediaResourceId,
            items: input.articleRefs.map((articleRef) => ({
              articleRef,
              status: "updated",
              idempotent: false,
            })),
          });
        },
        previewPaidMediaPreflight: (input) => {
          state.paidPreflightCalls.push(input);
          state.lastPaidPreflight = input;
          return ok({
            version: 1,
            status: "ready",
            canConfirm: true,
            confirmationToken: "paid-token-1",
            confirmationFingerprint: "paid-fingerprint-1",
            articleRefs: input.articleRefs,
            articleCount: input.articleRefs.length,
            articles: input.articleRefs.map((articleRef) => ({
              articleRef,
              articleId: articleRef.articleId,
              title:
                state.articles[articleRef.clientId]?.find(
                  (item) => item.id === articleRef.articleId,
                )?.title || articleRef.articleId,
              contentFingerprint: "content-fingerprint-1",
              status: "ready",
              reasonCodes: [],
              riskCodes:
                articleRef.articleId === "article-b"
                  ? ["PHONE_NUMBER"]
                  : ["URL"],
            })),
            mediaResourceId: input.mediaResourceId,
            mediaName: "测试媒体",
            mediaRemarks: "只收工作日稿件，正文风险请人工确认",
            resourceFingerprint: "resource-fingerprint-1",
            resourceAvailable: true,
            quotedPrice: 12.5,
            estimatedTotal: input.articleRefs.length * 12.5,
            systemSubmissionCode: "system-1",
            blockers: [],
            risks: [
              {
                code: "PHONE_NUMBER",
                message: "正文包含手机号风险，请结合媒体备注人工确认。",
                count: 1,
              },
              {
                code: "URL",
                message: "正文包含网址风险，请结合媒体备注人工确认。",
                count: 1,
              },
            ],
            createdAt: "2026-08-07T00:00:00.000Z",
            expiresAt: "2026-08-07T00:05:00.000Z",
          });
        },
        confirmPaidMediaBatch: (input) => {
          state.paidConfirmCalls.push(input);
          if (state.failNextPaidConfirm) {
            state.failNextPaidConfirm = false;
            return Promise.reject(new Error("费用确认失败，请重新预检。"));
          }
          const preview = state.lastPaidPreflight;
          const batchId = "paid-batch-client-b";
          const batch = {
            batchId,
            mediaResourceId: preview.mediaResourceId,
            status: "queued",
            pauseIntent: "manual",
            paused: true,
            runState: "paused",
            actions: { canStart: true, canPause: false },
            articleCount: preview.articleRefs.length,
            quotedPrice: 12.5,
            estimatedTotal: preview.articleRefs.length * 12.5,
            createdAt: "2026-08-13T00:00:00.000Z",
            updatedAt: "2026-08-13T00:00:00.000Z",
            items: preview.articleRefs.map((articleRef, index) => ({
              itemId: `paid-item-client-b-${index + 1}`,
              articleRef,
              status: "queued",
              phase: "queued",
            })),
          };
          state.paidBatches = [
            ...state.paidBatches.filter((item) => item.batchId !== batchId),
            batch,
          ];
          const clientId = preview.articleRefs[0].clientId;
          const articleIds = new Set(
            preview.articleRefs.map((articleRef) => articleRef.articleId),
          );
          state.staging[clientId] = (state.staging[clientId] || []).filter(
            (item) => !articleIds.has(item.articleRef.articleId),
          );
          return ok({
            batchId,
            targetKey: `media-resource:${preview.mediaResourceId}`,
            mediaResourceId: preview.mediaResourceId,
            status: "queued",
            articleCount: preview.articleRefs.length,
            idempotent: false,
            items: preview.articleRefs.map((articleRef, index) => ({
              articleRef,
              articleId: articleRef.articleId,
              itemId: `paid-item-client-b-${index + 1}`,
              batchId,
              publicationId: `publication-client-b-${index + 1}`,
              attemptId: `attempt-client-b-${index + 1}`,
              targetKey: `media-resource:${preview.mediaResourceId}`,
              status: "queued",
              idempotent: false,
            })),
            articleRefs: preview.articleRefs,
            confirmationFingerprint: "paid-fingerprint-1",
            quotedPrice: 12.5,
            estimatedTotal: preview.articleRefs.length * 12.5,
          });
        },
        previewCancelSubmissionBatch: ({ batchId }) => {
          state.cancelPreviewCalls.push(batchId);
          const batch = Object.values(state.batches)
            .flat()
            .find((item) => item.id === batchId);
          const items = (batch?.items || []).map((item) => ({
            articleId: item.articleId,
            targetPlatformId: item.targetPlatformId,
            action: "cancel",
            allowed: item.status === "queued",
          }));
          return ok({
            batchId,
            clientId: batch?.clientId || "",
            action: "cancel",
            planId: `plan-${batchId}-${batch?.status}`,
            fingerprint: batch?.status || "missing",
            allowedCount: items.filter((item) => item.allowed).length,
            blockedCount: items.filter((item) => !item.allowed).length,
            items,
          });
        },
        cancelSubmissionBatch: ({ batchId, planId }) => {
          const batch = Object.values(state.batches)
            .flat()
            .find((item) => item.id === batchId);
          state.cancellationCalls.push({ batchId, planId });
          return new Promise((resolve) => {
            state.resolveCancellation = () => {
              batch.status = "cancelled";
              batch.updatedAt = "2026-07-20T00:00:02.000Z";
              batch.items.forEach((item) => {
                item.status = "cancelled";
                item.canCancel = false;
              });
              resolve(
                ok({
                  batchId,
                  planId,
                  cancelledCount: 1,
                  idempotentCount: 0,
                  blockedItems: [],
                  batchStatus: "cancelled",
                  changedScopes: [],
                  items: batch.items,
                }),
              );
            };
          });
        },
        getDoubaoLoginState: () => ok({ loginState: { status: "unknown" } }),
        getDoubaoQueueState: () =>
          ok({
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
      };
      window.__clientSwitchFlow = state;
      window.desktopConsole = {
        auth: {
          getState: () =>
            ok({
              authenticated: true,
              user: { loginName: "fixture" },
              entitlements: [
                { product: "AutoPublish", enabled: true, expiresAt: null },
              ],
            }),
          login: () => ok({ authenticated: true }),
          changePassword: () => ok({ authenticated: true }),
          refresh: () => ok({ authenticated: true }),
          logout: () => ok({ authenticated: false, user: null }),
          onStateChanged: () => () => {},
        },
        workspace: {
          getBootstrapState: () =>
            ok({
              state: "ready",
              workspacePath: "fixture",
              envOverride: false,
            }),
          getCurrent: () =>
            ok({
              workspacePath: "fixture",
              envOverride: false,
              validation: { ok: true, errors: [], warnings: [] },
            }),
          openCurrent: () => ok(undefined),
          requestSwitch: () =>
            ok({
              state: "ready",
              workspacePath: "fixture",
              envOverride: false,
            }),
          chooseDirectory: () =>
            ok({
              state: "ready",
              workspacePath: "fixture",
              envOverride: false,
            }),
          confirmSelection: () => ok({ state: "ready" }),
          cancelSelection: () =>
            ok({
              state: "ready",
              workspacePath: "fixture",
              envOverride: false,
            }),
        },
        workspaceData: {
          getRuntimeIdentity: () =>
            ok({ workspaceRuntimeId: "client-switch-runtime", revision: 1 }),
          onInvalidated: () => () => {},
        },
        runtimeDiagnostics: {
          get: () =>
            ok({
              ok: true,
              buildInfo: { version: "1.0.1" },
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
          browserSmoke: () => ok({ ok: true }),
        },
        media: {
          scanArticles: () => ok({ items: [] }),
          getResourcePage: () =>
            ok({
              items: [
                {
                  resourceId: "not-favorited",
                  name: "未收藏媒体",
                  price: 99,
                  type: "image",
                },
              ],
              total: 1,
              page: 1,
              pageSize: 1,
            }),
          getPool: (input) => {
            state.poolPageCalls.push(input);
            const page = input.page === 2 ? 2 : 1;
            const item =
              page === 1
                ? {
                    resourceId: "media-a",
                    name: "收藏媒体 A",
                    price: 12.5,
                    type: "image",
                  }
                : {
                    resourceId: "media-b",
                    name: "收藏媒体 B",
                    price: 18,
                    type: "image",
                  };
            return ok({
              items: [item],
              memberResourceIds: ["media-a", "media-b"],
              total: 2,
              page,
              pageSize: input.pageSize,
              totalPages: 2,
              hasPrev: page > 1,
              hasNext: page < 2,
            });
          },
          getBalance: () => ok({ balance: "0" }),
        },
        orders: { getOrders: () => ok({ items: [] }) },
        aiProvider: {
          getStatus: () =>
            ok({
              configured: false,
              source: "application",
              apiKeyMask: "",
              lastTest: null,
            }),
          save: () => ok({}),
          testConnection: () => ok({}),
          clear: () => ok({}),
        },
        platformSettings: {
          getStatus: () =>
            ok({
              configured: false,
              source: "application",
              baseUrl: "",
              timeoutMs: 30000,
              allowInsecure: false,
              transport: "未配置",
              apiKeyMask: "",
              lastTest: null,
            }),
          save: () => ok({}),
          test: () => ok({}),
          clear: () => ok({}),
        },
        storageMaintenance: {
          getUsage: () =>
            ok({
              logs: { bytes: 0, files: 0 },
              temporary: { bytes: 0, files: 0 },
              docxCache: { bytes: 0, files: 0 },
              profiles: { bytes: 0, files: 0 },
            }),
          cleanCaches: () => ok({ blocked: false }),
        },
        platforms: {
          getQueue: () => ok({ revision: 0, platforms: [], queue: [] }),
          listAccountProfiles: () =>
            ok({
              profiles: [
                {
                  accountProfileId: "account-fixture",
                  platformId: "fixture-platform",
                  displayName: "测试账号",
                },
              ],
            }),
          confirmAccountProfile: (input) =>
            ok({
              profile: {
                accountProfileId: "account-confirmed",
                platformId: input.platformId,
                displayName: input.displayName,
              },
            }),
          getState: () =>
            ok({
              isBatchRunning: false,
              isStopPending: false,
              isPlatformRunning: false,
            }),
          onState: () => () => {},
        },
        publication: {
          listForArticles: () => ok({ records: [] }),
          reconcile: () => ok({ record: {} }),
        },
        content,
      };
    });
    try {
      await page.goto("http://127.0.0.1:4179/", {
        waitUntil: "domcontentloaded",
      });
      const openArticleManagement = async () => {
        await page.locator("#nav-item-content").click();
        await page.getByRole("button", { name: "历史文章" }).click();
        await page.getByRole("heading", { name: "历史文章" }).waitFor();
        const articleGroup = page
          .getByRole("button", { name: /fixture-platform.*测试模板/ });
        await articleGroup.waitFor();
        await articleGroup.click();
      };
      const openPaidWorkbench = async () => {
        await page.locator("#nav-item-workbench").click();
        await page
          .getByRole("region", { name: "付费媒体投稿队列" })
          .waitFor();
      };
      const contentClientSelect = page.getByRole("combobox", {
        name: "当前客户（单篇/问题/历史）",
      });
      const paidClientSelect = page.getByRole("combobox", {
        name: "当前客户（付费媒体投稿）",
      });
      await openArticleManagement();
      await page.waitForFunction(
        () =>
          document.querySelector('[aria-label="当前客户（单篇/问题/历史）"]')
            ?.value === "client-a",
      );
      await page
        .locator('input[type="checkbox"][aria-label="选择 客户 A 文章"]')
        .check();
      assert.equal(
        await page.getByRole("textbox", { name: "付费媒体资源 ID" }).count(),
        0,
      );
      assert.equal(
        await page.getByRole("button", { name: "付费媒体预检" }).count(),
        0,
      );
      await page.getByRole("button", { name: "加入付费媒体投稿队列" }).click();
      await page
        .getByText("付费媒体投稿队列：已加入 1 篇。", { exact: true })
        .waitFor();
      await page.waitForFunction(
        () => window.__clientSwitchFlow.paidStagingAddCalls.length === 1,
      );
      assert.equal(
        await page.getByRole("region", { name: "付费媒体投稿队列" }).count(),
        0,
        "文章管理只提供 paid staging admission，不渲染完整 paid workbench",
      );
      assert.equal(
        await page.getByRole("region", { name: "收藏媒体选择器" }).count(),
        0,
      );
      assert.equal(
        await page.getByRole("button", { name: "费用预检" }).count(),
        0,
      );
      assert.equal(
        await page.getByRole("button", { name: "开始创建订单" }).count(),
        0,
      );
      await openPaidWorkbench();
      const stagingPanel = page.getByRole("region", {
        name: "付费媒体投稿队列",
      });
      await stagingPanel.getByText("客户 A 文章", { exact: true }).waitFor();
      await stagingPanel.getByText("客户：客户 A", { exact: true }).waitFor();
      await stagingPanel.getByText("媒体：未选择", { exact: true }).waitFor();

      const picker = stagingPanel.getByRole("region", {
        name: "收藏媒体选择器",
      });
      assert.equal(
        await picker
          .locator('button[aria-label="选择收藏媒体 收藏媒体 A"]')
          .count(),
        1,
      );
      assert.equal(
        await picker
          .locator('button[aria-label="选择收藏媒体 未收藏媒体"]')
          .count(),
        0,
      );
      await picker.getByText("缓存价格：¥12.50", { exact: true }).waitFor();
      await stagingPanel
        .getByRole("checkbox", { name: "选择付费媒体投稿 客户 A 文章" })
        .check();
      await picker
        .locator('button[aria-label="选择收藏媒体 收藏媒体 A"]')
        .click();
      await page.waitForFunction(
        () => window.__clientSwitchFlow.paidStagingMediaSetCalls.length === 1,
      );
      assert.deepEqual(
        await page.evaluate(
          () => window.__clientSwitchFlow.paidStagingMediaSetCalls[0],
        ),
        {
          articleRefs: [{ clientId: "client-a", articleId: "article-a" }],
          mediaResourceId: "media-a",
        },
      );
      assert.equal(
        await page.getByRole("textbox", { name: "付费媒体资源 ID" }).count(),
        0,
      );
      await stagingPanel
        .getByText("媒体：已选 media-a", { exact: true })
        .waitFor();

      await stagingPanel
        .getByRole("button", { name: "清除已选媒体 客户 A 文章" })
        .click();
      await page.waitForFunction(
        () => window.__clientSwitchFlow.paidStagingMediaSetCalls.length === 2,
      );
      assert.equal(
        await page.evaluate(
          () =>
            window.__clientSwitchFlow.paidStagingMediaSetCalls[1]
              .mediaResourceId,
        ),
        null,
      );
      await stagingPanel.getByText("媒体：未选择", { exact: true }).waitFor();

      await openArticleManagement();
      await page
        .locator('input[type="checkbox"][aria-label="选择 客户 A 文章"]')
        .check();
      await page.getByRole("button", { name: "加入付费媒体投稿队列" }).click();
      await page
        .getByText("付费媒体投稿队列：1 篇已在队列中。", { exact: true })
        .waitFor();
      assert.equal(
        await page.evaluate(
          () => window.__clientSwitchFlow.paidStagingAddCalls.length,
        ),
        2,
      );

      await page
        .locator('input[type="checkbox"][aria-label="选择 客户 A 第二文章"]')
        .check();
      await page.getByRole("button", { name: "加入付费媒体投稿队列" }).click();
      await page.waitForFunction(
        () => window.__clientSwitchFlow.paidStagingAddCalls.length === 3,
      );
      await openPaidWorkbench();
      await stagingPanel
        .getByText("客户 A 第二文章", { exact: true })
        .waitFor();

      await stagingPanel
        .getByRole("checkbox", { name: "选择付费媒体投稿 客户 A 文章" })
        .check();
      await stagingPanel
        .getByRole("checkbox", { name: "选择付费媒体投稿 客户 A 第二文章" })
        .check();
      await picker
        .locator('button[aria-label="选择收藏媒体 收藏媒体 A"]')
        .click();
      await page.waitForFunction(
        () => window.__clientSwitchFlow.paidStagingMediaSetCalls.length === 3,
      );
      assert.deepEqual(
        await page.evaluate(
          () => window.__clientSwitchFlow.paidStagingMediaSetCalls[2],
        ),
        {
          articleRefs: [
            { clientId: "client-a", articleId: "article-a" },
            { clientId: "client-a", articleId: "article-a-2" },
          ],
          mediaResourceId: "media-a",
        },
      );
      await stagingPanel
        .getByText("媒体：已选 media-a", { exact: true })
        .first()
        .waitFor();

      await picker.locator('button[aria-label="下一页收藏媒体"]').click();
      await page.waitForFunction(
        () => window.__clientSwitchFlow.poolPageCalls.at(-1)?.page === 2,
      );
      await picker
        .locator('button[aria-label="选择收藏媒体 收藏媒体 B"]')
        .waitFor();
      await stagingPanel
        .getByText("媒体：已选 media-a", { exact: true })
        .first()
        .waitFor();
      assert.equal(
        await stagingPanel.getByText(/取消收藏|已失效|stale/i).count(),
        0,
      );

      await picker.locator('button[aria-label="上一页收藏媒体"]').click();
      await page.waitForFunction(
        () => window.__clientSwitchFlow.poolPageCalls.at(-1)?.page === 1,
      );
      await changeClient(page, paidClientSelect, "client-b");
      const clientBPicker = page.getByRole("region", {
        name: "收藏媒体选择器",
      });
      await clientBPicker
        .locator('button[aria-label="选择收藏媒体 收藏媒体 A"]')
        .waitFor();
      await changeClient(page, paidClientSelect, "client-a");
      await page.waitForFunction(
        () =>
          document.querySelector('[aria-label="当前客户（付费媒体投稿）"]')
            ?.value === "client-a" &&
          !document
            .querySelector('[aria-label="选择收藏媒体 收藏媒体 A"]')
            ?.className.includes("ring-1"),
      );
      await stagingPanel
        .getByRole("checkbox", { name: "选择付费媒体投稿 客户 A 文章" })
        .check();
      await stagingPanel
        .getByRole("checkbox", { name: "选择付费媒体投稿 客户 A 第二文章" })
        .check();
      assert.equal(
        await picker.locator('button[aria-label="清除所选文章媒体"]').count(),
        1,
      );
      await picker.locator('button[aria-label="清除所选文章媒体"]').click();
      await page.waitForFunction(
        () => window.__clientSwitchFlow.paidStagingMediaSetCalls.length === 4,
      );
      assert.equal(
        await page.evaluate(
          () =>
            window.__clientSwitchFlow.paidStagingMediaSetCalls[3]
              .mediaResourceId,
        ),
        null,
      );
      assert.equal(
        await page.evaluate(
          () =>
            window.__clientSwitchFlow.paidStagingMediaSetCalls[3].articleRefs
              .length,
        ),
        2,
      );
      await stagingPanel
        .getByText("媒体：未选择", { exact: true })
        .first()
        .waitFor();

      const stagingCheckbox = stagingPanel.getByRole("checkbox", {
        name: "选择付费媒体投稿 客户 A 文章",
      });
      await stagingCheckbox.check();
      await changeClient(page, paidClientSelect, "client-b");
      assert.equal(await paidClientSelect.inputValue(), "client-b");
      const clientBPanel = page.getByRole("region", {
        name: "付费媒体投稿队列",
      });
      await clientBPanel.getByText("客户 B 文章", { exact: true }).waitFor();
      await clientBPanel
        .getByText("客户：客户 B", { exact: true })
        .first()
        .waitFor();
      await clientBPanel
        .getByText("媒体：已选 media-b", { exact: true })
        .first()
        .waitFor();
      await clientBPanel
        .getByText("客户 B 第二文章", { exact: true })
        .waitFor();
      await clientBPanel
        .getByRole("button", { name: "清除已选媒体 客户 B 第二文章" })
        .click();
      const clientBStagingPicker = clientBPanel.getByRole("region", {
        name: "收藏媒体选择器",
      });
      const clientBArticleCheckbox = clientBPanel.getByRole("checkbox", {
        name: "选择付费媒体投稿 客户 B 文章",
      });
      const clientBSecondArticleCheckbox = clientBPanel.getByRole("checkbox", {
        name: "选择付费媒体投稿 客户 B 第二文章",
      });
      await clientBArticleCheckbox.check();
      await clientBSecondArticleCheckbox.check();
      await clientBPanel
        .getByText("请先为所有选中文章选择媒体进行费用预检。", {
          exact: true,
        })
        .waitFor();
      assert.equal(
        await clientBPanel
          .getByRole("button", { name: "费用预检" })
          .isDisabled(),
        true,
      );
      assert.equal(
        await page.evaluate(
          () => window.__clientSwitchFlow.paidPreflightCalls.length,
        ),
        0,
      );
      await clientBArticleCheckbox.uncheck();
      await clientBSecondArticleCheckbox.uncheck();
      await clientBSecondArticleCheckbox.check();
      await clientBStagingPicker
        .locator('button[aria-label="选择收藏媒体 收藏媒体 A"]')
        .click();
      await clientBPanel
        .getByText("媒体：已选 media-a", { exact: true })
        .waitFor();
      await clientBArticleCheckbox.check();
      await clientBSecondArticleCheckbox.check();
      await clientBPanel
        .getByText("请选择同一媒体的文章进行费用预检", { exact: true })
        .waitFor();
      assert.equal(
        await clientBPanel
          .getByRole("button", { name: "费用预检" })
          .isDisabled(),
        true,
      );
      await clientBArticleCheckbox.uncheck();
      await clientBSecondArticleCheckbox.uncheck();
      await clientBSecondArticleCheckbox.check();
      await clientBStagingPicker
        .locator('button[aria-label="下一页收藏媒体"]')
        .click();
      await page.waitForFunction(
        () => window.__clientSwitchFlow.poolPageCalls.at(-1)?.page === 2,
      );
      await clientBStagingPicker
        .locator('button[aria-label="选择收藏媒体 收藏媒体 B"]')
        .click();
      await clientBPanel
        .getByText("媒体：已选 media-b", { exact: true })
        .last()
        .waitFor();
      assert.equal(
        await clientBPanel
          .getByRole("checkbox", { name: "选择付费媒体投稿 客户 B 文章" })
          .isChecked(),
        false,
      );
      await changeClient(page, paidClientSelect, "client-a");
      const clientAPanel = page.getByRole("region", {
        name: "付费媒体投稿队列",
      });
      assert.equal(
        await clientAPanel
          .getByRole("checkbox", { name: "选择付费媒体投稿 客户 A 文章" })
          .isChecked(),
        false,
      );
      await openArticleManagement();
      await page
        .locator('input[type="checkbox"][aria-label="选择 客户 A 文章"]')
        .check();

      await page
        .getByRole("combobox", { name: "普通平台投稿目标" })
        .selectOption("fixture-platform");
      await page.getByRole("button", { name: "加入投稿队列" }).click();
      assert.equal(
        await page.evaluate(
          () => window.__clientSwitchFlow.regularQueueCalls.length,
        ),
        0,
      );
      await page
        .getByRole("alert")
        .filter({ hasText: "没有符合普通平台队列规则的文章" })
        .waitFor();

      await openPaidWorkbench();
      await clientAPanel
        .getByRole("button", {
          name: "移出付费媒体投稿队列 客户 A 文章",
        })
        .click();
      await page.waitForFunction(
        () => window.__clientSwitchFlow.paidStagingRemoveCalls.length === 1,
      );
      await clientAPanel
        .getByRole("button", {
          name: "移出付费媒体投稿队列 客户 A 第二文章",
        })
        .click();
      await page.waitForFunction(
        () => window.__clientSwitchFlow.paidStagingRemoveCalls.length === 2,
      );
      await clientAPanel
        .getByText("当前客户暂无付费媒体投稿文章。", { exact: true })
        .waitFor();

      await openArticleManagement();
      await page
        .locator('input[type="checkbox"][aria-label="选择 客户 A 文章"]')
        .check();
      await page
        .getByRole("combobox", { name: "普通平台投稿目标" })
        .selectOption("fixture-platform");
      await page.waitForFunction(
        () => {
          const button = [...document.querySelectorAll("button")].find(
            (candidate) => candidate.textContent?.trim() === "加入投稿队列",
          );
          return Boolean(button && !button.disabled);
        },
      );
      await page.getByRole("button", { name: "加入投稿队列" }).click();
      await page
        .getByRole("dialog", { name: "确认加入普通平台队列" })
        .waitFor();
      assert.equal(
        await page.evaluate(
          () => window.__clientSwitchFlow.regularQueueCalls.length,
        ),
        0,
      );
      await page.getByRole("button", { name: "确认加入普通平台队列" }).click();
      await page.waitForFunction(
        () => window.__clientSwitchFlow.regularQueueCalls.length === 1,
      );
      await page.evaluate(() =>
        window.__clientSwitchFlow.resolveRegularQueue(),
      );
      await page
        .getByText("已加入 1 项普通平台队列。", { exact: true })
        .waitFor();
      assert.equal(
        await page
          .locator('input[type="checkbox"][aria-label="选择 客户 A 文章"]')
          .isChecked(),
        false,
      );

      await page
        .locator('input[type="checkbox"][aria-label="选择 客户 A 文章"]')
        .check();
      await page.getByRole("button", { name: "加入投稿队列" }).click();
      await page
        .getByRole("dialog", { name: "确认加入普通平台队列" })
        .waitFor();
      await page.getByRole("button", { name: "确认加入普通平台队列" }).click();
      await page.waitForFunction(
        () => window.__clientSwitchFlow.regularQueueCalls.length === 2,
      );
      await changeClient(page, contentClientSelect, "client-b");
      assert.equal(await contentClientSelect.inputValue(), "client-b");
      await page.evaluate(() =>
        window.__clientSwitchFlow.resolveRegularQueue(),
      );
      assert.equal(
        await page.getByText("客户 B 文章", { exact: true }).count(),
        1,
      );
      assert.equal(
        await page.getByText("客户 A 文章", { exact: true }).count(),
        0,
      );
      assert.deepEqual(
        await page.evaluate(() =>
          window.__clientSwitchFlow.regularQueueCalls.map(
            (item) => item.articleRefs[0].clientId,
          ),
        ),
        ["client-a", "client-a"],
      );
      assert.equal(
        await page.evaluate(
          () => window.__clientSwitchFlow.regularQueueCalls[0].accountProfileId,
        ),
        "account-fixture",
      );
      assert.equal(
        await page.getByRole("button", { name: "加入投稿队列" }).isDisabled(),
        true,
      );
      await changeClient(page, contentClientSelect, "client-a");
      assert.equal(await contentClientSelect.inputValue(), "client-a");
      await page.getByRole("button", { name: /撤销未开始投稿/ }).waitFor();
      assert.deepEqual(
        await page.evaluate(() => window.__clientSwitchFlow.cancelPreviewCalls),
        [],
      );
      await page.getByRole("button", { name: /撤销未开始投稿/ }).click();
      await page.getByRole("dialog", { name: "确认撤销未开始投稿" }).waitFor();
      assert.equal(
        await page.evaluate(
          () => window.__clientSwitchFlow.cancellationCalls.length,
        ),
        0,
      );
      await page.getByRole("button", { name: "确认撤销" }).click();
      await page.waitForFunction(
        () => window.__clientSwitchFlow.cancellationCalls.length === 1,
      );
      assert.equal(
        await page.getByRole("button", { name: /正在撤销/ }).isDisabled(),
        true,
      );
      await changeClient(page, contentClientSelect, "client-b");
      assert.equal(await contentClientSelect.inputValue(), "client-b");
      await page.evaluate(() =>
        window.__clientSwitchFlow.resolveCancellation(),
      );
      await changeClient(page, contentClientSelect, "client-a");
      await page.waitForFunction(
        () => !document.body.innerText.includes("正在撤销"),
      );
      assert.equal(
        await page.getByRole("button", { name: /撤销未开始投稿/ }).count(),
        0,
      );
      assert.equal(
        await page.getByRole("button", { name: /正在撤销/ }).count(),
        0,
      );
      assert.deepEqual(
        await page.evaluate(() =>
          window.__clientSwitchFlow.cancellationCalls.map(
            (item) => item.batchId,
          ),
        ),
        ["regular-batch-2"],
      );
      await page.getByRole("button", { name: "文章生成" }).click();
      await page.getByRole("tab", { name: "批量生成" }).click();
      await page
        .getByRole("button", { name: "将成功文章加入投稿队列" })
        .waitFor();
      await page
        .getByRole("button", { name: "将成功文章加入投稿队列" })
        .click();
      await page
        .getByRole("combobox", { name: "生成批次投稿目标" })
        .selectOption("fixture-platform");
      await page.getByRole("button", { name: "检查并确认" }).click();
      await page
        .getByRole("button", { name: "一次确认并加入投稿队列" })
        .click();
      await page.getByTestId("generation-handoff-summary").waitFor();
      await changeClient(page, contentClientSelect, "client-b");
      assert.equal(await contentClientSelect.inputValue(), "client-b");
      assert.equal(
        await page.getByTestId("generation-handoff-summary").count(),
        1,
      );
      await openArticleManagement();
      await openPaidWorkbench();
      const finalPaidPanel = page.getByRole("region", {
        name: "付费媒体投稿队列",
      });
      await finalPaidPanel.getByText("客户 B 文章", { exact: true }).waitFor();
      await finalPaidPanel
        .getByText("客户 B 第二文章", { exact: true })
        .waitFor();
      const finalFirstCheckbox = finalPaidPanel.getByRole("checkbox", {
        name: "选择付费媒体投稿 客户 B 文章",
      });
      const finalSecondCheckbox = finalPaidPanel.getByRole("checkbox", {
        name: "选择付费媒体投稿 客户 B 第二文章",
      });
      await finalFirstCheckbox.check();
      await finalSecondCheckbox.check();
      await finalPaidPanel.getByRole("button", { name: "费用预检" }).click();
      await page.waitForFunction(
        () => window.__clientSwitchFlow.paidPreflightCalls.length === 1,
      );
      const preflightInput = await page.evaluate(
        () => window.__clientSwitchFlow.paidPreflightCalls[0],
      );
      assert.deepEqual(Object.keys(preflightInput).sort(), [
        "articleRefs",
        "mediaResourceId",
      ]);
      assert.deepEqual(preflightInput, {
        articleRefs: [
          { clientId: "client-b", articleId: "article-b" },
          { clientId: "client-b", articleId: "article-b-2" },
        ],
        mediaResourceId: "media-b",
      });
      await finalPaidPanel
        .getByText("媒体名称：测试媒体", { exact: true })
        .waitFor();
      await finalPaidPanel
        .getByText("媒体备注：只收工作日稿件，正文风险请人工确认", {
          exact: true,
        })
        .waitFor();
      await finalPaidPanel
        .getByText("最新单价（预检）：¥12.50", { exact: true })
        .waitFor();
      await finalPaidPanel.getByText("文章数：2", { exact: true }).waitFor();
      await finalPaidPanel
        .getByText("预计总费用：¥25.00", { exact: true })
        .waitFor();
      await finalPaidPanel
        .getByText("系统投稿标识：system-1", { exact: true })
        .waitFor();
      await finalPaidPanel
        .getByText(/PHONE_NUMBER/)
        .first()
        .waitFor();
      await finalPaidPanel.getByText(/URL/).first().waitFor();
      await finalPaidPanel.getByText("阻断项", { exact: true }).waitFor();
      await finalPaidPanel.getByText("无", { exact: true }).waitFor();

      await page.evaluate(() => {
        window.__clientSwitchFlow.failNextPaidConfirm = true;
      });
      await finalPaidPanel
        .getByRole("button", { name: "确认费用并创建暂停付费批次" })
        .click();
      await finalPaidPanel
        .getByRole("alert")
        .filter({ hasText: "费用确认失败，请重新预检。" })
        .waitFor();
      await finalPaidPanel.getByText("客户 B 文章", { exact: true }).waitFor();
      await finalPaidPanel
        .getByText("客户 B 第二文章", { exact: true })
        .waitFor();
      assert.equal(
        await page.evaluate(() => window.__clientSwitchFlow.paidBatches.length),
        1,
      );

      await finalPaidPanel.getByRole("button", { name: "费用预检" }).click();
      await page.waitForFunction(
        () => window.__clientSwitchFlow.paidPreflightCalls.length === 2,
      );
      await finalPaidPanel
        .getByRole("button", { name: "确认费用并创建暂停付费批次" })
        .click();
      await page.waitForFunction(
        () => window.__clientSwitchFlow.paidConfirmCalls.length === 2,
      );
      await finalPaidPanel
        .getByText("当前客户暂无付费媒体投稿文章。", { exact: true })
        .waitFor();
      await finalPaidPanel.getByText(/批次：paid-batch-client-b/).waitFor();
      await finalPaidPanel
        .getByText("已暂停，等待用户开始投稿", { exact: true })
        .waitFor();
      assert.equal(await finalPaidPanel.getByText(/foreign-batch/).count(), 0);
      const confirmInput = await page.evaluate(
        () => window.__clientSwitchFlow.paidConfirmCalls[1],
      );
      assert.deepEqual(Object.keys(confirmInput).sort(), [
        "confirmationToken",
        "confirmed",
      ]);
      assert.deepEqual(confirmInput, {
        confirmationToken: "paid-token-1",
        confirmed: true,
      });
      assert.deepEqual(
        await page.evaluate(() => window.__clientSwitchFlow.orderCalls),
        [],
      );

      assert.equal(
        await finalPaidPanel
          .getByRole("button", { name: "开始创建订单" })
          .count(),
        1,
      );

      await changeClient(page, paidClientSelect, "client-a");
      const clientAPaidPanel = page.getByRole("region", {
        name: "付费媒体投稿队列",
      });
      await clientAPaidPanel.getByText(/foreign-batch/).waitFor();
      assert.equal(
        await clientAPaidPanel
          .getByRole("button", { name: "开始创建订单" })
          .count(),
        1,
      );
      assert.equal(
        await clientAPaidPanel.getByText(/paid-batch-client-b/).count(),
        0,
      );

      await changeClient(page, paidClientSelect, "client-b");
      const executionPanel = page.getByRole("region", {
        name: "付费媒体投稿队列",
      });
      await executionPanel.getByText(/paid-batch-client-b/).waitFor();
      assert.equal(await executionPanel.getByText(/foreign-batch/).count(), 0);

      await page.evaluate(() => {
        window.__clientSwitchFlow.holdNextStart = true;
      });
      const startButton = executionPanel.getByRole("button", {
        name: "开始创建订单",
      });
      await startButton.click();
      await page.waitForFunction(
        () => window.__clientSwitchFlow.orderCalls.length === 1,
      );
      await page.waitForFunction(
        () =>
          document.querySelector('button[aria-label="开始创建订单"]')?.disabled,
      );
      await page.evaluate(() => {
        const button = document.querySelector(
          'button[aria-label="开始创建订单"]',
        );
        button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await page.waitForFunction(
        () => window.__clientSwitchFlow.orderCalls.length === 1,
      );
      assert.deepEqual(
        await page.evaluate(() => window.__clientSwitchFlow.orderCalls),
        [
          {
            type: "start",
            input: { batchId: "paid-batch-client-b" },
          },
        ],
      );
      await page.waitForFunction(() =>
        window.__clientSwitchFlow.paidBatches.some(
          (batch) =>
            batch.batchId === "paid-batch-client-b" &&
            batch.runState === "running" &&
            batch.paused === false,
        ),
      );
      await executionPanel
        .getByRole("button", { name: "刷新付费批次" })
        .click();
      const pauseButton = executionPanel.getByRole("button", {
        name: "暂停后续订单",
      });
      await pauseButton.waitFor();
      assert.equal(
        await pauseButton.isDisabled(),
        false,
        "Start pending 时 authoritative running snapshot 仍应允许 Pause",
      );
      await page.evaluate(() => {
        window.__clientSwitchFlow.holdNextPause = true;
      });
      await pauseButton.click();
      await page.waitForFunction(
        () => window.__clientSwitchFlow.orderCalls.length === 2,
      );
      await page.waitForFunction(
        () =>
          document.querySelector('button[aria-label="暂停后续订单"]')?.disabled,
      );
      await page.evaluate(() => {
        const button = document.querySelector(
          'button[aria-label="暂停后续订单"]',
        );
        button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      await page.waitForFunction(
        () => window.__clientSwitchFlow.orderCalls.length === 2,
      );
      assert.deepEqual(
        await page.evaluate(() => window.__clientSwitchFlow.orderCalls),
        [
          {
            type: "start",
            input: { batchId: "paid-batch-client-b" },
          },
          {
            type: "pause",
            input: { batchId: "paid-batch-client-b" },
          },
        ],
      );
      await page.evaluate(() => window.__clientSwitchFlow.resolveStart());
      await page.waitForFunction(
        () => window.__clientSwitchFlow.resolveStart === null,
      );
      await page.waitForFunction(
        () =>
          document.querySelector('button[aria-label="开始创建订单"]')
            ?.disabled === false,
      );
      await page.evaluate(() => window.__clientSwitchFlow.resolvePause());
      await executionPanel
        .getByRole("button", { name: "开始创建订单" })
        .waitFor();

      await page.evaluate(() => {
        window.__clientSwitchFlow.paidBatches =
          window.__clientSwitchFlow.paidBatches.map((batch) =>
            batch.batchId === "paid-batch-client-b"
              ? {
                  ...batch,
                  status: "needs_attention",
                  pauseIntent: "system",
                  paused: true,
                  runState: "paused",
                  actions: { canStart: false, canPause: false },
                }
              : batch,
          );
      });
      await executionPanel
        .getByRole("button", { name: "刷新付费批次" })
        .click();
      await executionPanel
        .getByText("需要人工处理，禁止直接开始", { exact: true })
        .waitFor();
      assert.equal(
        await executionPanel
          .getByRole("button", { name: "开始创建订单" })
          .count(),
        0,
      );
      assert.equal(
        await executionPanel
          .getByRole("button", { name: "暂停后续订单" })
          .count(),
        0,
      );

      await page.evaluate(() => {
        window.__clientSwitchFlow.paidBatches =
          window.__clientSwitchFlow.paidBatches.map((batch) =>
            batch.batchId === "paid-batch-client-b"
              ? { ...batch, status: "completed" }
              : batch,
          );
      });
      await executionPanel
        .getByRole("button", { name: "刷新付费批次" })
        .click();
      await page.waitForFunction(
        () => !document.body.innerText.includes("paid-batch-client-b"),
      );
      assert.equal(
        await executionPanel
          .getByRole("button", { name: "开始创建订单" })
          .count(),
        0,
      );
      assert.equal(
        await executionPanel
          .getByRole("button", { name: "暂停后续订单" })
          .count(),
        0,
      );
      assert.deepEqual(
        await page.evaluate(() =>
          window.__clientSwitchFlow.paidBatches.map((batch) => batch.batchId),
        ),
        ["foreign-batch", "paid-batch-client-b"],
      );

      await page.locator("#nav-item-resources").click();
      await page.locator("#mediaResourceLibraryRoot").waitFor();
      await page.locator("#nav-item-platforms").click();
      await page.getByRole("heading", { name: "普通平台队列" }).waitFor();
      await openArticleManagement();
      await page
        .getByRole("button", { name: "加入付费媒体投稿队列" })
        .waitFor();
      assert.equal(
        await page.getByRole("region", { name: "付费媒体投稿队列" }).count(),
        0,
      );
      await openPaidWorkbench();
      assert.equal(
        await page.getByRole("region", { name: "付费媒体投稿队列" }).count(),
        1,
      );
    } finally {
      await page.close();
    }
  });
});
