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
          const item = {
            attentionId: 'failed-1', kind: 'regular_platform_failed', owner: 'regular-platform-outcome',
            freeze: { article: false }, resolutionPriority: 300, allowedActions: ['open-submission'],
            articleId: 'article-1', titleSnapshot: '需重新投稿的文章', displayName: '测试平台',
            reasonCode: 'CONTENT_REJECTED',
            reasonSummary: '平台明确拒绝了这篇文章，请检查内容后从统一投稿入口重新发起。',
          };
          console.log(JSON.stringify({
            loading: render(snapshot({ query: { loading: true, error: null } })),
            empty: render(snapshot()),
            error: render(snapshot({ query: { loading: false, error: { code: 'ARTICLE_ATTENTION_STALE' } } })),
            busy: render(snapshot({ items: [item], commands: { preview: { busy: true, error: null }, execute: command } })),
            failure: render(snapshot({ items: [item] })),
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
  assert.match(views.busy, /打开发起投稿/);
  assert.match(views.busy, /disabled/);
  assert.match(
    views.failure,
    /平台明确拒绝了这篇文章，请检查内容后从统一投稿入口重新发起。/,
  );
  assert.match(views.failure, /发生了什么/);
  assert.match(views.failure, /处理完成后/);
  assert.match(views.failure, /核对详情/);
});
