"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("../media-workbench/node_modules/typescript");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");

function fakeReact() {
  return {
    createElement(type, props, ...children) {
      return { type, props: props || {}, children: children.flat(Infinity) };
    },
    useMemo(factory) {
      return factory();
    },
  };
}

function textContent(node) {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textContent).join("");
  return textContent(node.children || []);
}

function formatBeijingTime(value, fallback = "未知时间") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function loadTsx(relativePath, requireStub) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.React,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
    fileName: relativePath,
  }).outputText;
  const module = { exports: {} };
  const fn = vm.runInNewContext(
    `(function(exports, require, module){${output}\n})`,
    { console, URL },
  );
  fn(module.exports, requireStub, module);
  return module.exports.default;
}

async function historyLogic() {
  return import(
    pathToFileURL(
      path.join(root, "media-workbench/src/article-history-logic.js"),
    ).href + `?b=${Date.now()}`
  );
}

test("published list renders publication facts while mixed grouping keeps its original created-time ordering", async () => {
  const logic = await historyLogic();
  const react = fakeReact();
  const List = loadTsx(
    "media-workbench/src/components/content/GeneratedArticlesList.tsx",
    (id) => {
      if (id === "react") return react;
      if (id === "lucide-react")
        return { ChevronDown: "ChevronDown", FileText: "FileText" };
      if (id === "../../article-history-logic") return logic;
      if (id === "../../publication-status")
        return { publicationStatusLabel: (status) => status };
      if (id === "../../time-format") return { formatBeijingTime };
      throw new Error(`unexpected require ${id}`);
    },
  );

  const published = {
    id: "published-late",
    clientId: "c1",
    title: "发布晚",
    createdAt: "2026-06-01T00:00:00.000Z",
  };
  const unknown = {
    id: "published-unknown",
    clientId: "c1",
    title: "发布时间未知",
    createdAt: "2026-09-05T00:00:00.000Z",
  };
  const draft = {
    id: "draft",
    clientId: "c1",
    title: "未发布文章",
    createdAt: "2026-09-02T00:00:00.000Z",
  };
  const archives = [
    {
      publicationId: "p1",
      publicationEvidence: {
        articleIdentityV1: { articleId: published.id },
        targetSnapshotV1: {
          kind: "platform",
          platformId: "lieju",
          platformName: "列举网",
        },
        firstPublishedAt: "2026-08-31T16:30:00.000Z",
        firstPublishedAtSource: "first_positive_observation_time",
      },
    },
    {
      publicationId: "p2",
      publicationEvidence: {
        articleIdentityV1: { articleId: unknown.id },
        targetSnapshotV1: {
          kind: "platform",
          platformId: "lieju",
          platformName: "列举网",
        },
        firstPublishedAt: null,
        firstPublishedAtSource: "legacy_unavailable",
      },
    },
  ];
  const noop = () => {};
  const common = {
    visibleError: "",
    clientId: "c1",
    selected: [],
    isArticleSelectable: () => false,
    isArticleSubmittable: () => false,
    removalSubmitDisabled: false,
    commandBusy: () => false,
    onToggleCollapsed: noop,
    onToggleGroup: noop,
    onToggleArticle: noop,
    onOpenArticle: noop,
    onOpenPublication: noop,
  };

  const publishedGroups = logic.groupPublishedArticlesByTarget(
    [unknown, published],
    archives,
    [],
  );
  const publishedText = textContent(
    List({
      ...common,
      groups: publishedGroups,
      collapsed: { [publishedGroups[0].key]: false },
      workflowByArticle: new Map([
        [published.id, { stage: "published", label: "已发布", publicationSummary: { status: "published" } }],
        [unknown.id, { stage: "published", label: "已发布", publicationSummary: { status: "published" } }],
      ]),
      publishedArchives: archives,
      publishedView: true,
    }),
  );
  assert.match(publishedText, /最新 确认发布时间 2026-09-01 00:30:00/);
  assert.match(publishedText, /阶段：已发布 · 确认发布时间 2026-09-01 00:30:00/);
  assert.match(publishedText, /发布时间未记录/);

  const mixedText = textContent(
    List({
      ...common,
      groups: [
        {
          key: "mixed",
          platform: "x",
          label: "混合",
          templateSnapshot: null,
          articles: [draft, published],
        },
      ],
      collapsed: { mixed: false },
      workflowByArticle: new Map([
        [draft.id, { stage: "pending_submission", label: "待投稿", publicationSummary: { status: "not_submitted" } }],
        [published.id, { stage: "published", label: "已发布", publicationSummary: { status: "published" } }],
      ]),
      publishedArchives: archives,
      publishedView: false,
    }),
  );
  assert.match(mixedText, /最新 2026-09-02 08:00:00/);
  assert.match(mixedText, /阶段：已发布 · 确认发布时间 2026-09-01 00:30:00/);
  assert.doesNotMatch(mixedText, /2026-06-01 08:00:00/);
});

test("publication drawer labels reliable sources exactly and never invents a published time", async () => {
  const logic = await historyLogic();
  const react = fakeReact();
  const Drawer = loadTsx(
    "media-workbench/src/components/content/PublicationHistoryDrawer.tsx",
    (id) => {
      if (id === "react") return react;
      if (id === "lucide-react")
        return { AlertTriangle: "AlertTriangle", ExternalLink: "ExternalLink", X: "X" };
      if (id === "../../article-history-logic") return logic;
      if (id === "../../time-format") return { formatBeijingTime };
      if (id === "../../publication-status")
        return {
          latestPublicationAttempt: (record) =>
            record.attempts?.[record.attempts.length - 1] || {
              remoteUrl: null,
              remoteId: null,
              reasonSummary: null,
              reasonCode: null,
              errorCode: null,
              startedAt: null,
            },
          publicationRecordStatusLabel: (status) => status,
          publicationStatusLabel: (status) => status,
        };
      throw new Error(`unexpected require ${id}`);
    },
  );

  const record = (publicationId, status = "published") => ({
    publicationId,
    clientId: "c1",
    articleId: "a1",
    targetKey: "platform:fixture",
    platformId: "fixture",
    mediaResourceId: null,
    displayName: "测试平台",
    status,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-21T00:00:00.000Z",
    attempts: [],
    reasonSummary: null,
  });
  const evidence = (firstPublishedAt, firstPublishedAtSource) => ({
    version: 2,
    articleIdentityV1: { version: 1, clientId: "c1", articleId: "a1" },
    customerSnapshotV1: { version: 1, clientId: "c1", displayName: "测试客户" },
    contentAvailable: true,
    title: "测试文章",
    body: "正文",
    targetSnapshotV1: {
      version: 1,
      kind: "platform",
      platformId: "fixture",
      platformName: "测试平台",
      accountProfileId: "account-1",
      accountLabel: "测试账号",
    },
    resultCode: "REGULAR_ACCEPTED",
    submittedAt: "2026-08-20T00:00:00.000Z",
    firstPublishedAt,
    firstPublishedAtSource,
    imageSummaryV1: { deliveryMode: "text_only", images: [], decisionKind: "initial" },
    orderNumber: null,
    remoteId: null,
    remoteUrl: null,
    missingReasons: [],
  });
  const records = [
    record("provider"),
    record("observation"),
    record("manual"),
    record("unknown"),
    record("failure", "failed"),
  ];
  const archives = [
    { publicationId: "provider", publicationEvidence: evidence("2026-08-20T01:00:00.000Z", "provider_event_time") },
    { publicationId: "observation", publicationEvidence: evidence("2026-08-20T02:00:00.000Z", "first_positive_observation_time") },
    { publicationId: "manual", publicationEvidence: evidence("2026-08-20T03:00:00.000Z", "manual_positive_evidence_time") },
  ];
  const text = textContent(
    Drawer({
      article: { id: "a1", title: "测试文章" },
      records,
      archives,
      summary: { status: "published", label: "已发布", records: records.length, published: 4, uncertain: false },
      onClose() {},
    }),
  );
  assert.match(text, /发布时间2026-08-20 09:00:00/);
  assert.match(text, /确认发布时间2026-08-20 10:00:00/);
  assert.match(text, /人工确认时间2026-08-20 11:00:00/);
  assert.match(text, /发布时间发布时间未记录/);
  assert.match(text, /最近更新时间2026-08-21 08:00:00/);
});
