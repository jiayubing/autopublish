const assert = require('node:assert/strict');
const test = require('node:test');
const { execFileSync, spawn } = require('node:child_process');
const { chromium } = require('playwright');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const rendererDir = path.join(rootDir, 'media-workbench');
const rendererUrl = 'http://127.0.0.1:4177/';

function ok(data) { return Promise.resolve({ ok: true, data }); }

async function waitForServer(url) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      await new Promise((resolve, reject) => {
        const request = http.get(url, (response) => { response.resume(); response.statusCode >= 200 && response.statusCode < 500 ? resolve() : reject(new Error('server not ready')); });
        request.on('error', reject);
      });
      return;
    } catch (_) { await new Promise((resolve) => setTimeout(resolve, 100)); }
  }
  throw new Error('Vite renderer server did not start');
}

test('article attention actions produce visible publication/detail results', async () => {
  const buildDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-publish-attention-'));
  const viteEntry = path.join(rendererDir, 'node_modules', 'vite', 'bin', 'vite.js');
  let viteProcess;
  let browser;
  try {
    execFileSync(process.execPath, [viteEntry, 'build', '--outDir', buildDir], { cwd: rendererDir, stdio: 'inherit' });
    viteProcess = spawn(process.execPath, [viteEntry, 'preview', '--host', '127.0.0.1', '--port', '4177', '--outDir', buildDir], { cwd: rendererDir, stdio: ['ignore', 'pipe', 'pipe'] });
    await waitForServer(rendererUrl);
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.addInitScript(() => {
      localStorage.setItem('auto-publish:selected-client', 'client-other');
      const ok = (data) => Promise.resolve({ ok: true, data });
      const article = { id: 'article-1', clientId: 'client-1', title: '失败后可打开统一投稿入口', content: '安全测试正文', status: 'saved', platform: 'hepan', scenario: '测试', templateId: 'template-1', createdAt: '2026-07-19T00:00:00.000Z', updatedAt: '2026-07-19T00:00:00.000Z' };
      const attention = { attentionId: 'failed-active-1', kind: 'regular_platform_failed', owner: 'regular-platform-outcome', freeze: { article: false, reasonCode: null }, resolutionPriority: 300, safeFacts: {}, articleId: article.id, clientId: article.clientId, titleSnapshot: article.title, platformId: 'hepan', displayName: '蓝色河畔', publicationId: 'publication-1', attemptId: 'attempt-1', status: 'failed', reasonCode: 'HEPAN_CONTENT_REJECTED', reasonSummary: '内容审核未通过', updatedAt: article.updatedAt, message: '投稿明确失败', allowedActions: ['open-submission', 'open-publication', 'open-article'] };
      const credentialsFailure = { attentionId: 'failed-credentials-1', kind: 'regular_platform_failed', owner: 'regular-platform-outcome', freeze: { article: false, reasonCode: null }, resolutionPriority: 300, safeFacts: {}, articleId: 'article-credentials', clientId: article.clientId, titleSnapshot: '账号失效的文章', platformId: 'hepan', displayName: '蓝色河畔', publicationId: 'publication-credentials', attemptId: 'attempt-credentials', status: 'failed', reasonCode: 'HEPAN_CREDENTIALS_INVALID', reasonSummary: '账号或密码错误', updatedAt: article.updatedAt, message: '投稿明确失败', allowedActions: ['open-submission', 'open-publication', 'open-article'] };
      const uncertain = { attentionId: 'uncertain-active-1', kind: 'regular_platform_uncertain', owner: 'regular-platform-outcome', freeze: { article: true, reasonCode: 'PLATFORM_RESULT_UNCERTAIN' }, resolutionPriority: 400, safeFacts: {}, articleId: article.id, clientId: article.clientId, titleSnapshot: article.title, platformId: 'hepan', displayName: '蓝色河畔', publicationId: 'publication-1', attemptId: 'attempt-1', status: 'uncertain', updatedAt: article.updatedAt, message: '远端结果待确认', allowedActions: ['confirm-regular-accepted', 'confirm-regular-not-accepted'] };
      const paidResolution = { attentionId: 'paid-resolution-1', kind: 'paid_order_creation_uncertain', owner: 'paid-order-creation', freeze: { article: true, reasonCode: 'PAID_ORDER_CREATION_UNCERTAIN' }, resolutionPriority: 480, safeFacts: {}, articleId: article.id, clientId: article.clientId, titleSnapshot: '付费订单待核对', platformId: 'hepan', displayName: '蓝色河畔', publicationId: 'publication-paid-1', attemptId: 'attempt-paid-1', orderCreationAttemptId: 'order-attempt-1', status: 'uncertain', message: '请核对服务商订单', allowedActions: ['bind-paid-order-number', 'confirm-paid-order-absent', 'inspect'] };
      const repair = { attentionId: 'repair-1', kind: 'removal_needs_repair', owner: 'article-removal-recovery', freeze: { article: true, reasonCode: 'REMOVAL_NEEDS_REPAIR' }, resolutionPriority: 220, safeFacts: {}, articleId: 'article-missing', clientId: article.clientId, titleSnapshot: '删除事务待修复', transactionId: 'transaction-1', status: 'needs_repair', reasonCode: 'ARTICLE_REMOVAL_BLOCKED', message: '删除事务未完成，需要重新预检并继续', allowedActions: ['retry-removal', 'inspect'] };
      const publication = { publicationId: 'publication-1', clientId: article.clientId, articleId: article.id, platformId: 'hepan', targetKey: 'platform:hepan:account:account-1', displayName: '蓝色河畔', status: 'failed', updatedAt: article.updatedAt, attempts: [{ attemptId: 'attempt-1', status: 'failed', updatedAt: article.updatedAt, errorCode: 'REMOTE_REJECTED' }] };
      const calls = [];
      let generationBatch = null;
      let generationSequence = 0;
      const generationListeners = new Set();
      window.__regenerationCalls = [];
      window.__makeSecondContentFailure = () => { credentialsFailure.reasonCode = 'HEPAN_CONTENT_REJECTED'; credentialsFailure.reasonSummary = '内容审核未通过'; };
      window.__completeRegeneration = () => {
        generationBatch = { ...generationBatch, status: 'failed', counts: { ...generationBatch.counts, pending: 0, failed: 1, succeeded: generationBatch.counts.total - 1 } };
        generationListeners.forEach((listener) => listener({ runtimeId: 'generation-runtime', sequence: ++generationSequence, batchId: generationBatch.id, status: 'failed', batch: generationBatch, counts: generationBatch.counts, capabilities: { canResume: true } }));
      };
      const content = {
        getGenerationRuntimeSnapshot: () => ok({ runtimeId: 'generation-runtime', sequence: generationSequence, runtime: { batchId: generationBatch?.id || null, status: generationBatch?.status || 'idle' }, batch: generationBatch, capabilities: {} }),
        onGenerationBatchState: (listener) => { generationListeners.add(listener); return () => generationListeners.delete(listener); },
        regenerateAttentionItems: (input) => {
          window.__regenerationCalls.push(input);
          generationBatch = { id: 'regeneration-fixture', status: 'running', tasks: [], counts: { total: input.attentionIds.length, succeeded: 0, failed: 0, pending: input.attentionIds.length, interrupted: 0, cancelled: 0 } };
          return ok({ batch: generationBatch });
        },
        listClients: () => ok({ clients: [{ id: 'client-other', name: '另一个客户', knowledgeFiles: [] }, { id: article.clientId, name: '测试客户', knowledgeFiles: [] }] }),
        getClientDetails: (clientId) => ok({ client: { id: clientId, name: clientId === article.clientId ? '测试客户' : '另一个客户', knowledgeFiles: [] }, research: [] }),
        listGeneratedArticles: () => ok({ articles: [article] }),
        getArticleEditor: ({ clientId }) => {
          window.__editorClientId = clientId;
          return ok({ article: { ...article, clientId }, editFingerprint: "attention-editor-fixture" });
        },
        getArticleManagementSnapshot: ({ clientId }) => ok({
          clientId,
          revision: 1,
          articles: [{ ...article, clientId, title: clientId === article.clientId ? article.title : '其他客户的同 ID 文章' }],
          trash: [],
          publicationRecords: [publication],
          submissionPlatforms: [{ id: 'hepan', displayName: '蓝色河畔', contentQueueImport: true }],
          workflowItems: [{
            articleId: article.id,
            workflow: {
              version: 2,
              stage: 'pending_submission',
              label: '待投稿',
              primaryAction: 'submit',
              allowedBulkActions: ['submit'],
              reasonCodes: ['PUBLICATION_FAILED', 'ARTICLE_ATTENTION'],
              reasonMessage: '投稿明确失败，需要处理。',
              locks: { canEdit: true, canSubmit: true, canCancel: false, canTrash: true },
              operations: {
                edit: { allowed: true, reasonCodes: [], safeMetadata: {} },
                submit: { allowed: true, reasonCodes: [], safeMetadata: {} },
                trash: { allowed: true, reasonCodes: [], safeMetadata: {} },
                restore: { allowed: false, reasonCodes: ['ARTICLE_NOT_IN_TRASH'], safeMetadata: {} },
                purge: { allowed: false, reasonCodes: ['ARTICLE_NOT_IN_TRASH'], safeMetadata: {} },
              },
              attentionCount: 2,
              orderSummary: { status: 'none', label: '无订单', records: 0, active: 0, published: 0, attention: 0 },
              publicationSummary: { status: 'failed', label: '失败', records: 1, published: 0, uncertain: false },
              targetFacts: [],
            },
          }],
        }),
        getSubmissionCenterSnapshot: () => ok({
          schemaVersion: 1,
          clientId: null,
          revision: 1,
          regular: { groups: [] },
          paid: { batches: [] },
          attention: { items: [
            { ...attention, targetLabel: '蓝色河畔 / account-1' },
            { ...credentialsFailure, targetLabel: '蓝色河畔 / account-1' },
            { ...uncertain, targetLabel: '蓝色河畔 / account-1' },
            { ...paidResolution, targetLabel: '蓝色河畔 / account-1' },
            { ...repair, targetLabel: '蓝色河畔 / account-1' },
          ] },
          counts: { regularItems: 0, paidBatches: 0, attentionItems: 5, total: 5 },
          page: 1,
          pageSize: 100,
          hasMore: false,
          failures: [],
        }),
        listArticleAttention: () => ok({ revision: 1, items: [attention, credentialsFailure, uncertain, paidResolution, repair], counts: { total: 5, actionable: 5 } }),
        getArticleAttention: ({ attentionId }) => ok({ item: attentionId === repair.attentionId ? repair : attention }), previewArticleAttention: ({ attentionId, action, resolutionInput }) => ok({ attentionId, revision: 1, action, requiresConfirmation: true, confirmationToken: 'attention-token', resolutionInput, message: '投稿明确失败', changedScopes: [] }),
        resolveArticleAttention: ({ attentionId, action }) => { calls.push(action); return ok({ outcome: action === 'open-publication' ? 'open-publication' : 'inspection_required', attentionId, changedScopes: [] }); },
        listSubmissionBatches: () => ok({ batches: [] }), listArticleTrash: () => ok({ trash: [] }),
        listPublicationHistory: () => ok({ records: [publication] }), listResearch: () => ok({ research: [] }), listResearchMetadata: () => ok({ research: [] }), listQuestions: () => ok({ questions: [] }), listTemplateCatalog: () => ok({ revision: '1', platforms: [], templates: [], diagnostics: [] }), listTemplates: () => ok({ templates: [] }),
        getDoubaoLoginState: () => ok({ loginState: { status: 'unknown' } }), getDoubaoQueueState: () => ok({ queue: { status: 'idle', currentTaskId: null, completed: 0, total: 0, waitRemainingMs: 0, tasks: [] } }), onDoubaoQueueState: () => () => {}, onArticleRemovalTransaction: () => () => {}, listArticleRemovalTransactions: () => ok({ transactions: [] })
      };
      window.desktopConsole = {
        auth: { getState: () => ok({ authenticated: true, user: { loginName: 'admin' }, entitlements: [{ product: 'AutoPublish', enabled: true, expiresAt: null }] }), login: () => ok({ authenticated: true }), refresh: () => ok({ authenticated: true }), logout: () => ok({ authenticated: false }), onStateChanged: () => () => {} },
        content, articleAttention: { list: content.listArticleAttention, get: content.getArticleAttention, preview: content.previewArticleAttention, resolve: content.resolveArticleAttention },
        workspace: { getBootstrapState: () => ok({ state: 'ready' }), getCurrent: () => ok({}), openCurrent: () => ok(undefined), onInvalidated: () => () => {} },
        workspaceData: { getRuntimeIdentity: () => ok({ workspaceRuntimeId: 'attention-runtime', revision: 1 }), onInvalidated: () => () => {} }, platforms: { getQueue: () => ok({ platforms: [], queue: [] }), getState: () => ok({ phase: 'idle' }), onState: () => () => {} },
        runtimeDiagnostics: { get: () => ok({ ok: true, buildInfo: {}, capabilities: {}, errors: [], warnings: [] }) }, media: {  getResourcePage: () => ok({ items: [], total: 0, page: 1, pageSize: 100 }), getPool: () => ok([]), getBalance: () => ok({ balance: '0' }) }, orders: { getOrders: () => ok([]) },
        aiProvider: { getStatus: () => ok({ configured: false }) }, platformSettings: { getStatus: () => ok({ configured: false }) }, storageMaintenance: { getUsage: () => ok({}) }
      };
      window.__attentionActionCalls = calls;
    });
     await page.goto(rendererUrl, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '投稿中心' }).click();
    await page.getByRole('tab', { name: /需处理事项/ }).click();
    await page.getByRole('heading', { name: '失败后可打开统一投稿入口' }).first().waitFor({ state: 'visible' });
    assert.equal(await page.getByRole('heading', { name: '失败后可打开统一投稿入口' }).count(), 2);
    const attentionRegion = page.getByRole('region', { name: '需处理页面' });
    assert.equal(await attentionRegion.getByText('测试客户', { exact: true }).count(), 5);
    assert.equal(await attentionRegion.getByText('另一个客户', { exact: true }).count(), 0);
    assert.equal(await attentionRegion.getByText('蓝色河畔 / account-1', { exact: true }).count(), 5);
    assert.equal(await attentionRegion.getByText('失败原因', { exact: true }).count(), 5);
    assert.equal(await attentionRegion.getByText('最后执行', { exact: true }).count(), 5);
    assert.ok(await attentionRegion.getByText('内容审核未通过', { exact: true }).first().isVisible());
    assert.ok(await attentionRegion.getByText('账号或密码错误', { exact: true }).first().isVisible());
    assert.ok(await attentionRegion.getByText('2026-07-19 08:00:00', { exact: true }).first().isVisible());
    assert.equal(await attentionRegion.getByText('HEPAN_CONTENT_REJECTED', { exact: true }).isVisible(), false);
    assert.equal(await attentionRegion.getByText('HEPAN_CREDENTIALS_INVALID', { exact: true }).isVisible(), false);
    assert.equal(await attentionRegion.getByRole('button', { name: '改投其他平台', exact: true }).count(), 2);
    assert.equal(await attentionRegion.getByRole('button', { name: '去设置账号', exact: true }).count(), 1);
    assert.equal(await attentionRegion.getByRole('button', { name: '打开发布详情', exact: true }).count(), 2);
    assert.equal(await attentionRegion.getByRole('button', { name: '打开文章', exact: true }).count(), 2);
    assert.equal(await attentionRegion.getByRole('button', { name: /移入回收站/ }).count(), 0);
    assert.equal(await attentionRegion.getByRole('button', { name: /重试本地归档/ }).count(), 0);
    for (const label of ['发生了什么', '下一步', '处理完成后', '允许操作'])
      assert.equal(await attentionRegion.getByText(label, { exact: true }).count(), 0);
    assert.ok(await attentionRegion.getByText('投稿请求已发出，但远端结果尚未确认，远端可能已经接受。', { exact: true }).isVisible());

    // 内部证据仍在详情中，但默认折叠。
    await attentionRegion.locator('summary', { hasText: '技术详情' }).first().click();
    assert.ok(await attentionRegion.getByText('HEPAN_CONTENT_REJECTED', { exact: true }).first().isVisible());
    assert.ok(await attentionRegion.getByText('问题类型', { exact: true }).first().isVisible());
    await attentionRegion.locator('summary', { hasText: '技术详情' }).first().click();
    assert.equal(await attentionRegion.getByText('HEPAN_CONTENT_REJECTED', { exact: true }).isVisible(), false);

    // 勾选、全选与已选数量。
    const attentionCheckboxes = attentionRegion.getByRole('checkbox');
    assert.equal(await attentionCheckboxes.count(), 5);
    assert.ok(await attentionRegion.getByText('尚未选择需处理项', { exact: true }).isVisible());
    await attentionRegion.getByRole('button', { name: '全选当前结果', exact: true }).click();
    assert.ok(await attentionRegion.getByText('已选 5 项；其中 1 项可重新生成，2 项可改投其他平台。', { exact: true }).isVisible());
    assert.equal(await attentionRegion.getByRole('button', { name: /^批量重新生成/ }).isDisabled(), true);
    assert.equal(await attentionRegion.getByRole('button', { name: '批量改投其他平台', exact: true }).isDisabled(), true);
    await attentionRegion.getByRole('button', { name: '取消全选', exact: true }).click();

    await attentionCheckboxes.nth(0).check();
    assert.ok(await attentionRegion.getByText('已选 1 项；其中 1 项可重新生成，1 项可改投其他平台。', { exact: true }).isVisible());
    assert.equal(await attentionRegion.getByRole('button', { name: /^批量重新生成/ }).isDisabled(), false);
    assert.equal(await attentionRegion.getByRole('button', { name: '批量改投其他平台', exact: true }).isDisabled(), false);
    await attentionCheckboxes.nth(0).uncheck();

    // 账号类失败不提供重新生成，但可提示设置账号并允许改投。
    await attentionCheckboxes.nth(1).check();
    assert.ok(await attentionRegion.getByText('已选 1 项；其中 0 项可重新生成，1 项可改投其他平台。', { exact: true }).isVisible());
    assert.equal(await attentionRegion.getByRole('button', { name: /^批量重新生成/ }).isDisabled(), true);
    assert.equal(await attentionRegion.getByRole('button', { name: '批量改投其他平台', exact: true }).isDisabled(), false);

    // 改投仍为 P3 占位。
    await attentionRegion.getByRole('button', { name: '批量改投其他平台', exact: true }).click();
    assert.ok(await attentionRegion.getByText(/将在后续阶段接入，本次未执行/).isVisible());
    assert.deepEqual(await page.evaluate(() => window.__attentionActionCalls), []);
    await attentionCheckboxes.nth(1).uncheck();

    // P2 确认前不创建任务；确认后显示现有生成进度，不发起投稿。
    await attentionCheckboxes.nth(0).check();
    await attentionRegion.getByRole('button', { name: '批量重新生成（1）', exact: true }).click();
    const regenerationConfirmation = page.getByRole('dialog', { name: '批量重新生成', exact: true });
    await regenerationConfirmation.waitFor();
    assert.ok(await regenerationConfirmation.getByText(/原文章及投稿失败记录保留/).isVisible());
    await regenerationConfirmation.getByRole('button', { name: '取消', exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__regenerationCalls), []);
    await attentionRegion.getByRole('button', { name: '批量重新生成（1）', exact: true }).click();
    await regenerationConfirmation.getByRole('button', { name: '确认生成新文章', exact: true }).click();
    await page.getByRole('heading', { name: '重新生成进度', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__regenerationCalls.length), 1);
    assert.deepEqual(await page.evaluate(() => window.__regenerationCalls[0].attentionIds), ['failed-active-1']);
    assert.equal(await page.evaluate(() => window.__regenerationCalls[0].confirmed), true);
    assert.deepEqual(await page.evaluate(() => window.__attentionActionCalls), []);
    await attentionCheckboxes.nth(0).check();
    assert.equal(await attentionRegion.getByRole('button', { name: /^批量重新生成/ }).isDisabled(), true);
    await page.evaluate(() => window.__completeRegeneration());
    await page.getByText(/共 1 篇，成功 0 篇，失败 1 篇/).waitFor();
    assert.equal(await attentionCheckboxes.count(), 5);
    await attentionCheckboxes.nth(0).uncheck();

    await attentionRegion.getByRole('button', { name: '打开发布详情', exact: true }).first().click();
    await page.getByRole('heading', { name: '文章库' }).waitFor({ state: 'visible' });
    await page.getByRole('dialog', { name: '文章 失败后可打开统一投稿入口 的发布详情' }).waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => localStorage.getItem('auto-publish:selected-client')), 'client-1');
    assert.deepEqual(await page.evaluate(() => window.__attentionActionCalls), []);
    await page.getByRole('button', { name: '关闭发布详情' }).first().click();
    await page.getByRole('button', { name: '投稿中心' }).click();
    await page.getByRole('tab', { name: /需处理事项/ }).click();
    await page.getByRole('button', { name: '确认已接受' }).click();
    const acceptanceConfirmation = page.getByRole('dialog', { name: '确认处理需处理项' });
    await acceptanceConfirmation.waitFor({ state: 'visible' });
    assert.ok(await acceptanceConfirmation.getByText('确认后文章将永久标记为已发布；发布链接不是必填项。', { exact: false }).isVisible());
    await acceptanceConfirmation.getByRole('button', { name: '取消' }).click();
    await page.evaluate(() => localStorage.setItem('auto-publish:selected-client', 'client-other'));
    await page.getByRole('button', { name: '改投其他平台', exact: true }).first().click();
    await page.getByRole('dialog', { name: '发起投稿' }).waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => localStorage.getItem('auto-publish:selected-client')), 'client-1');
    assert.ok(await page.getByText('当前选择 1 篇文章；确认前不会创建投稿批次或订单。', { exact: true }).isVisible());
    await page.getByRole('button', { name: '关闭发起投稿' }).click();
    await page.getByRole('button', { name: '投稿中心' }).click();
    await page.getByRole('tab', { name: /需处理事项/ }).click();
    await page.evaluate(() => localStorage.setItem('auto-publish:selected-client', 'client-other'));
    await page.getByRole('button', { name: '打开文章', exact: true }).first().click();
    await page.getByRole('heading', { name: '编辑文章' }).waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => window.__editorClientId), 'client-1');
    assert.equal(await page.getByRole('dialog', { name: /发布详情/ }).count(), 0);
    await page.getByRole('button', { name: '投稿中心' }).click();
    await page.getByRole('tab', { name: /需处理事项/ }).click();
    await page.setViewportSize({ width: 375, height: 800 });
    await page.getByRole('button', { name: '补录订单号' }).click();
    const paidDrawer = page.getByRole('dialog', { name: '需处理详情' });
    await paidDrawer.waitFor({ state: 'visible' });
    assert.ok((await paidDrawer.boundingBox()).width <= 375);
    const paidOrderInput = page.getByLabel('补录服务商订单号');
    const bindOrder = page.getByRole('button', { name: '核对并补录' });
    assert.equal(await bindOrder.isDisabled(), true);
    await paidOrderInput.fill('supplier-order-1');
    assert.equal(await bindOrder.isDisabled(), false);
    assert.equal(await page.getByRole('button', { name: '确认服务商没有该订单' }).isDisabled(), false);
    await page.getByRole('button', { name: '关闭需处理详情' }).last().click();
    assert.equal(await page.getByRole('button', { name: '重新投稿' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '打开发起投稿' }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '改投其他平台', exact: true }).count(), 2);
    assert.deepEqual(await page.evaluate(() => window.__attentionActionCalls), []);
    await page.getByRole('button', { name: '核对详情', exact: true }).last().click();
    await page.getByRole('dialog', { name: '需处理详情' }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '关闭需处理详情' }).last().click();
    await page.evaluate(() => window.__makeSecondContentFailure());
    await attentionRegion.getByRole('button', { name: '刷新', exact: true }).click();
    await attentionCheckboxes.nth(0).check();
    await attentionCheckboxes.nth(1).check();
    await attentionRegion.getByRole('button', { name: '批量重新生成（2）', exact: true }).click();
    await regenerationConfirmation.getByRole('button', { name: '确认生成新文章', exact: true }).click();
    await page.getByText(/共 2 篇，成功 0 篇/).waitFor();
    assert.deepEqual(await page.evaluate(() => window.__regenerationCalls[1].attentionIds), ['failed-active-1', 'failed-credentials-1']);
    await page.evaluate(() => window.__completeRegeneration());
    await page.getByText(/共 2 篇，成功 1 篇，失败 1 篇/).waitFor();
    assert.equal(await attentionCheckboxes.count(), 5);
    assert.deepEqual(await page.evaluate(() => window.__attentionActionCalls), []);
  } finally {
    if (browser) await browser.close();
    if (viteProcess && !viteProcess.killed) viteProcess.kill();
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
});
