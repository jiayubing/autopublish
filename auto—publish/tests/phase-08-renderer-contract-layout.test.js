const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const rendererRoot = path.join(root, "media-workbench", "src");
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

const domainTypeSymbols = {
  "types/auth.ts": ["AuthState"],
  "types/content.ts": [
    "ContentCommandStaleResult",
    "ContentMaterial",
    "ContentClient",
    "LiejuPublicationProfile",
    "ContentQuestion",
    "DoubaoBatchMode",
    "DoubaoBatchPreview",
    "DoubaoLoginStatus",
    "DoubaoTaskStatus",
    "DoubaoTask",
    "DoubaoQueueState",
    "DoubaoLoginState",
    "ContentResearch",
    "ContentTemplate",
    "ContentTemplatePlatform",
    "ContentTemplateDiagnostic",
    "ContentTemplateCatalog",
  ],
  "types/generation.ts": [
    "ContentGenerationOperation",
    "GenerationBatchState",
    "GenerationBatchCounts",
    "GenerationBatchCancelPreview",
    "GenerationBatchLiveStatus",
    "GenerationBatchTemplateSelection",
    "GenerationBatchSourceSelection",
    "GenerationBatchExcludedClient",
    "GenerationBatchPreview",
    "GenerationTaskStatus",
    "GenerationBatchTask",
    "GenerationBatch",
    "ResearchSnapshot",
    "GeneratedContentArticle",
  ],
  "types/ipc.ts": ["IpcError", "IpcResponse"],
  "types/media.ts": [
    "MediaType",
    "MediaResource",
    "Article",
    "Draft",
    "RealOrder",
  ],
  "types/platform.ts": [
    "AccountProfile",
    "PlatformArticle",
    "PlatformQueueData",
    "PlatformQueueSnapshot",
    "PlatformTarget",
    "PlatformStatus",
    "PlatformSubmitState",
    "PlatformTaskReference",
    "PlatformTerminalResult",
    "PlatformTaskSnapshot",
    "PlatformSubmitPlan",
    "PlatformSubmitTask",
    "PlatformSubmitResult",
    "PlatformTaskResult",
  ],
  "types/publication.ts": [
    "PublicationRecordStatus",
    "PublicationHistorySummaryStatus",
    "PublicationHistoryAttempt",
    "PublicationHistoryRecord",
    "PublicationHistorySummary",
    "PublicationEvidenceV1",
    "PublicationEvidenceV2",
    "PublicationEvidence",
    "TerminalTargetV1",
    "ClosedTargetV1",
    "TombstoneIdentityV1",
    "DeletionTransactionIdentityV1",
    "PublicationArchiveEntry",
    "ArticleSelection",
    "ArticleRemovalTransactionStatus",
    "ArticleRemovalTransaction",
    "ArticleTrashImpactItem",
    "ArticleTrashPreview",
    "ArticleTrashCommitInput",
    "ArticleTrashResult",
    "TrashedArticleQueueResidueItem",
    "TrashedArticleQueueResiduePreview",
    "ArticlePermanentDeleteConfirmation",
    "ArticlePermanentDeleteRequest",
    "ArticlePermanentDeleteResult",
    "RegularQueueGroupCurrentItem",
    "RegularQueueGroupRemainingItem",
    "RegularQueueGroupSnapshot",
    "ContentSubmissionItemStatus",
    "ContentSubmissionBatchItem",
    "ContentSubmissionBatchRecord",
    "ContentSubmissionPlatform",
    "RegularQueueItemStatus",
    "RegularQueueTarget",
    "RegularQueueItem",
    "RegularQueueAdmissionInput",
    "RegularQueueAdmissionPreview",
    "RegularQueueAdmissionResult",
    "PaidMediaPreflightInput",
    "PaidMediaRiskWarning",
    "PaidMediaPreflightArticle",
    "PaidMediaPreflight",
    "PaidMediaConfirmationInput",
    "PaidMediaAdmissionItem",
    "PaidMediaAdmissionResult",
    "PaidMediaExecutionItem",
    "PaidMediaExecutionBatch",
    "PaidMediaExecutionResult",
    "PaidMediaBatchStartAllResult",
    "PendingQueueRemovalItemInput",
    "PendingQueueRemovalInput",
    "PendingQueueRemovalResult",
    "ContentSubmissionActionPlanItem",
    "ContentSubmissionCancellationPreview",
    "ArticleAttentionItem",
    "ArticleAttentionList",
    "SubmissionCenterSnapshot",
    "ArticleTrashRecord",
    "ArticleManagementSnapshot",
    "ArticleAttentionPreview",
    "ArticleAttentionResolution",
    "FailedPublicationRetryPreview",
    "FailedPublicationRetryResult",
  ],
  "types/settings.ts": [
    "AiProviderSource",
    "AiProviderTestResult",
    "AiProviderStatus",
    "AiProviderConfigInput",
    "AiProviderClearResult",
    "PlatformProviderSource",
    "PlatformProviderTestResult",
    "MediaProviderStatus",
    "HepanProviderStatus",
    "PlatformProviderStatus",
    "LegacyProviderSettingsDiscovery",
    "LegacyProviderSettingsRecord",
    "LegacyProviderSettingsStatus",
  ],
  "types/workspace.ts": [
    "WorkspaceBootstrapStatus",
    "WorkspaceSelectionKind",
    "WorkspaceSelectionToken",
    "WorkspaceSelection",
    "WorkspaceBootstrapState",
    "WorkspaceCurrent",
    "WorkspaceConfirmationResult",
    "RuntimeCapabilityState",
    "RuntimeCapability",
    "RuntimeBrowserCapability",
    "RuntimeDiagnosticEvent",
    "RuntimeDiagnostics",
    "WorkspaceDataInvalidationScope",
    "WorkspaceDataInvalidatedEvent",
    "WorkspaceRuntimeIdentity",
  ],
  "types/view.ts": ["ViewMode"],
};

const typeAliasSymbols = new Set([
  "AiProviderSource",
  "ArticleRemovalTransactionStatus",
  "ContentSubmissionItemStatus",
  "DoubaoBatchMode",
  "DoubaoLoginStatus",
  "DoubaoTaskStatus",
  "GenerationBatchLiveStatus",
  "GenerationTaskStatus",
  "IpcResponse",
  "MediaType",
  "PlatformProviderSource",
  "PlatformProviderStatus",
  "PublicationHistorySummaryStatus",
  "PublicationEvidence",
  "PublicationRecordStatus",
  "RegularQueueItemStatus",
  "RuntimeCapabilityState",
  "WorkspaceBootstrapStatus",
  "WorkspaceConfirmationResult",
  "WorkspaceCurrent",
  "WorkspaceDataInvalidationScope",
  "WorkspaceSelectionKind",
  "ViewMode",
]);

const generationBridgeExports = [
  "generateContentArticle",
  "saveContentArticle",
  "previewGenerationBatch",
  "createAndStartGenerationBatch",
  "pauseGenerationBatch",
  "abandonGenerationBatch",
  "resumeGenerationBatch",
  "retryFailedGenerationBatch",
  "subscribeGenerationBatchState",
  "getGenerationRuntimeSnapshot",
  "previewCancelPendingGenerationBatch",
  "cancelPendingGenerationBatch",
];

test("renderer shared types have one domain owner and no legacy barrel", () => {
  assert.equal(fs.existsSync(path.join(rendererRoot, "types.ts")), false);
  assert.equal(
    fs.existsSync(path.join(rendererRoot, "types", "index.ts")),
    false,
  );
  assert.doesNotMatch(
    read("tests/renderer-history-editor-flow.test.js"),
    /(?:^|[,{])\s*(?:["']trashArticles["']|trashArticles)\s*:/m,
    "Renderer fixtures must not expose the retired preload alias",
  );

  const expectedOwners = new Map();
  for (const [relative, symbols] of Object.entries(domainTypeSymbols)) {
    for (const symbol of symbols) {
      const previous = expectedOwners.get(symbol);
      assert.equal(previous, undefined, `duplicate domain owner for ${symbol}`);
      expectedOwners.set(symbol, relative);
    }
  }

  assert.equal(expectedOwners.size, 145);

  const actualDeclarations = new Map();
  const expectedOwnerFiles = Object.keys(domainTypeSymbols)
    .map((relative) => relative.slice("types/".length))
    .sort();
  const actualOwnerFiles = fs
    .readdirSync(path.join(rendererRoot, "types"))
    .filter((entry) => entry.endsWith(".ts") && entry !== "index.ts")
    .sort();
  assert.deepEqual(
    actualOwnerFiles,
    expectedOwnerFiles,
    "all non-barrel type files must have an explicit domain owner baseline",
  );

  for (const entry of actualOwnerFiles) {
    const relative = `types/${entry}`;
    const source = read(`media-workbench/src/${relative}`);
    for (const match of source.matchAll(
      /^export\s+(interface|type)\s+([A-Za-z_$][\w$]*)\b/gm,
    )) {
      const [, kind, symbol] = match;
      assert.equal(
        actualDeclarations.has(symbol),
        false,
        `duplicate declaration for ${symbol}`,
      );
      actualDeclarations.set(symbol, { kind, owner: relative });
    }
  }

  assert.equal(actualDeclarations.size, 145);
  assert.deepEqual(
    [...actualDeclarations.keys()].sort(),
    [...expectedOwners.keys()].sort(),
    "all shared declarations must be represented by the ownership baseline",
  );
  for (const [symbol, owner] of expectedOwners) {
    const declaration = actualDeclarations.get(symbol);
    assert.equal(declaration.owner, owner, `${symbol}:owner`);
    assert.equal(
      declaration.kind,
      typeAliasSymbols.has(symbol) ? "type" : "interface",
      `${symbol}:kind`,
    );
  }

  const typeSources = fs
    .readdirSync(path.join(rendererRoot, "types"))
    .filter((entry) => entry.endsWith(".ts"))
    .map((entry) => read(`media-workbench/src/types/${entry}`))
    .join("\n");
  assert.doesNotMatch(
    typeSources,
    /desktop[\\/]|infrastructure[\\/]|ipcRenderer/,
  );
});

test("renderer bridges expose named domain entries without method dispatch", () => {
  const bridgeDirectory = path.join(rendererRoot, "bridge");
  for (const entry of [
    "auth.ts",
    "content.ts",
    "content-removal.ts",
    "generation.ts",
    "media.ts",
    "platform.ts",
    "publication.ts",
    "settings.ts",
    "workspace.ts",
  ]) {
    assert.equal(fs.existsSync(path.join(bridgeDirectory, entry)), true, entry);
    const source = fs.readFileSync(path.join(bridgeDirectory, entry), "utf8");
    assert.doesNotMatch(
      source,
      /(?:api|namespace|bridge)\s*\[\s*[^\]]+\s*\]/,
      entry,
    );
    assert.doesNotMatch(source, /Reflect\.get\([^\n]+method/, entry);
  }

  const generation = read("media-workbench/src/bridge/generation.ts");
  for (const symbol of generationBridgeExports) {
    assert.match(generation, new RegExp(`\\b${symbol}\\b`), symbol);
  }
  assert.match(generation, /requireContentApi<GenerationContentApi>\(\)/);
  assert.doesNotMatch(generation, /requireBridgeApi|new Proxy|Reflect\.get/);
  assert.match(
    read("media-workbench/src/features/generation/use-generation-feature.ts"),
    /bridge\/generation/,
  );
  assert.match(
    read(
      "media-workbench/src/features/content/use-content-generation-feature.ts",
    ),
    /bridge\/generation/,
  );
});

test("renderer bridge/type boundaries do not import desktop or infrastructure code", () => {
  const files = fs
    .readdirSync(rendererRoot, { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        /\.(?:ts|tsx|js|jsx)$/.test(entry.name) &&
        entry.parentPath.includes(`${path.sep}bridge`),
    )
    .map((entry) =>
      path.relative(rendererRoot, path.join(entry.parentPath, entry.name)),
    );
  const readRendererSource = (relative) =>
    fs.readFileSync(path.join(rendererRoot, relative), "utf8");
  const sources = files.map(readRendererSource);
  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /(?:desktop|infrastructure)[\\/]/i,
      "renderer bridge architecture dependency boundary must not import desktop or infrastructure code",
    );
    assert.doesNotMatch(
      source,
      /ipcRenderer/,
      "renderer bridge architecture dependency boundary must not access Electron transport",
    );
  }
});
