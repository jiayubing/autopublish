const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const tsxLoader = pathToFileURL(
  path.join(root, "media-workbench", "node_modules", "tsx", "dist", "loader.mjs"),
).href;

function renderAttentionStates() {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [
        "--import",
        tsxLoader,
        "--input-type=module",
        "-e",
        `
          import React from './media-workbench/node_modules/react/index.js';
          import { renderToStaticMarkup } from './media-workbench/node_modules/react-dom/server.js';
          import { ConfirmationContext } from './media-workbench/src/confirmation.tsx';
          import ArticleAttentionPanel from './media-workbench/src/components/content/ArticleAttentionPanel.tsx';
          import { deriveAttentionFailureCapabilities } from './media-workbench/src/features/attention/attention-failure-capabilities.js';
          const command = { busy: false, error: null };
          const snapshot = (overrides = {}) => ({
            items: [],
            query: { loading: false, error: null },
            commands: { preview: command, execute: command },
            ...overrides,
          });
          const confirmation = { request: async () => false, cancelRequester() {}, setScopeKey() {} };
          const render = (value) => renderToStaticMarkup(React.createElement(ConfirmationContext.Provider, { value: confirmation },
            React.createElement(ArticleAttentionPanel, {
              snapshot: value,
              onRefresh() {}, onPreviewAction: async () => undefined, onExecutePreview: async () => undefined,
              onOpenPublication() {}, onOpenArticleLibrary() {}, onInspect() {}, onOpenArticle() {},
            }),
          ));
          const contentRejected = {
            attentionId: 'failed-1', kind: 'regular_platform_failed', owner: 'regular-platform-outcome',
            freeze: { article: false }, resolutionPriority: 300, allowedActions: ['open-submission'],
            articleId: 'article-1', titleSnapshot: '需重新投稿的文章', displayName: '测试平台',
            clientId: 'client-1', reasonCode: 'HEPAN_CONTENT_REJECTED',
            reasonSummary: '内容审核未通过',
          };
          const quotaExhausted = {
            attentionId: 'failed-2', kind: 'regular_platform_failed', owner: 'regular-platform-outcome',
            freeze: { article: false }, resolutionPriority: 300, allowedActions: ['open-submission'],
            articleId: 'article-2', titleSnapshot: '额度不足的文章', displayName: '测试平台',
            clientId: 'client-1', reasonCode: 'HEPAN_QUOTA_EXHAUSTED',
            reasonSummary: '当前周期发帖额度已用完',
          };
          console.log(JSON.stringify({
            loading: render(snapshot({ query: { loading: true, error: null } })),
            empty: render(snapshot()),
            error: render(snapshot({ query: { loading: false, error: { code: 'ARTICLE_ATTENTION_STALE' } } })),
            busy: render(snapshot({ items: [contentRejected], commands: { preview: { busy: true, error: null }, execute: command } })),
            failure: render(snapshot({ items: [contentRejected, quotaExhausted] })),
            capabilities: {
              contentRejected: deriveAttentionFailureCapabilities(contentRejected),
              quotaExhausted: deriveAttentionFailureCapabilities(quotaExhausted),
            },
          }));
        `,
      ],
      { cwd: root, encoding: "utf8" },
    ),
  );
}

test("attention panel presents loading, empty, error, disabled, and safe failure states", () => {
  const views = renderAttentionStates();
  assert.match(views.loading, /正在加载需处理项/);
  assert.match(views.loading, /disabled/);
  assert.match(views.empty, /当前没有需处理项/);
  assert.match(views.error, /状态已变化，请刷新后重新检查/);
  assert.match(views.busy, /改投其他平台/);
  assert.match(views.busy, /disabled/);
  assert.match(views.failure, /全选当前结果/);
  assert.match(views.failure, /批量重新生成/);
  assert.match(views.failure, /批量改投其他平台/);
  assert.match(views.failure, /内容审核未通过/);
  assert.match(views.failure, /当前周期发帖额度已用完/);
  assert.equal(views.capabilities.contentRejected.canRegenerate, true);
  assert.equal(
    views.capabilities.contentRejected.canRepostToAnotherPlatform,
    true,
  );
  assert.equal(views.capabilities.quotaExhausted.canRegenerate, false);
  assert.equal(
    views.capabilities.quotaExhausted.canRepostToAnotherPlatform,
    true,
  );
  assert.equal(views.capabilities.quotaExhausted.nextStep, "额度恢复后可重新投稿，或改投其他平台");
});
