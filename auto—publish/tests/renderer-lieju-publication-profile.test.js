const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const tsxLoader = pathToFileURL(
  path.join(
    root,
    "media-workbench",
    "node_modules",
    "tsx",
    "dist",
    "loader.mjs",
  ),
).href;

function renderArticleManagement() {
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
          import { PlatformFeatureProvider } from './media-workbench/src/features/platform/platform-feature-context.tsx';
          import GeneratedArticlesView from './media-workbench/src/components/content/GeneratedArticlesView.tsx';
          globalThis.React = React;

          const noop = async () => undefined;
          const commands = {
            admitRegularQueueItems: noop,
            getContentArticleRemovalTransaction: noop,
            permanentlyDeleteContentArticle: noop,
            preparePermanentDeleteContentArticle: noop,
            previewContentArticleRemoval: noop,
            previewRegularQueueAdmission: noop,
            restoreContentArticle: noop,
            removePendingQueueItems: noop,
            retryContentArticleRemovalTransaction: noop,
            trashContentArticles: noop,
          };
          const client = {
            id: 'client-a',
            name: '客户 A',
            publicationProfiles: {
              lieju: { city: '上海', contact: '张三', phone: '13800138000' },
            },
            knowledgeFiles: [],
          };
          const management = {
            articles: [],
            trash: [],
            submissionBatches: [],
            cancellationPlans: [],
            publicationRecords: [],
            workflowByArticle: {},
            submissionPlatforms: [],
          };
          const confirmation = {
            request: async () => true,
            cancelRequester() {},
            setScopeKey() {},
          };
          const element = React.createElement(
            PlatformFeatureProvider,
            null,
            React.createElement(
              ConfirmationContext.Provider,
              { value: confirmation },
              React.createElement(GeneratedArticlesView, {
                clientId: 'client-a',
                client,
                saveClientLiejuPublicationProfile: async ({ profile }) => profile,
                management,
                query: { loading: false, error: null },
                commands,
                commandStates: {},
                removal: { transactionId: null, transaction: null, query: { loading: false } },
                watchRemovalTransaction: noop,
                onArticleSelect() {},
              }),
            ),
          );
          console.log(JSON.stringify({ markup: renderToStaticMarkup(element) }));
        `,
      ],
      { cwd: root, encoding: "utf8" },
    ),
  );
}

test("article management presents the current customer's Lieju profile", () => {
  const rendered = renderArticleManagement().markup;
  assert.match(rendered, /文章库/);
  assert.match(rendered, /列举网投递档案/);
  assert.match(rendered, /当前客户：客户 A/);
  assert.match(rendered, /value="上海"/);
  assert.match(rendered, /value="张三"/);
  assert.match(rendered, /value="13800138000"/);
  assert.match(rendered, /保存到客户档案，不会修改任何文章标题或正文/);
});
