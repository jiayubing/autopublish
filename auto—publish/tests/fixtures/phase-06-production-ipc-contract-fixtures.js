"use strict";

function contentMaterialFixture() {
  return {
    id: "material-1",
    name: "facts.txt",
    content: "第一行\n第二行",
    status: "ready",
  };
}
function contentClientFixture() {
  return {
    id: "client-1",
    name: "测试客户",
    publicationProfiles: {
      lieju: { city: "上海", contact: "张三", phone: "13800138000" },
    },
    knowledgeFiles: [contentMaterialFixture()],
  };
}
function contentResearchFixture() {
  return {
    id: "research-1",
    clientId: "client-1",
    answerText: "回答第一行\n回答第二行",
    references: [],
    collectionMethod: "manual",
  };
}
function contentTemplateFixture() {
  return {
    id: "template-1",
    platform: "platform-1",
    scenario: "介绍",
    name: "模板",
    body: "正文第一行\n正文第二行",
  };
}
function contentCatalogFixture() {
  return {
    revision: "revision-1",
    platforms: [],
    templates: [contentTemplateFixture()],
    diagnostics: [],
  };
}
function paidExecutionBatchFixture() {
  return {
    batchId: "fixture-1",
    mediaResourceId: "fixture-1",
    status: "queued",
    pauseIntent: "manual",
    paused: true,
    runState: "paused",
    actions: { canStart: true, canPause: false },
    articleCount: 1,
    quotedPrice: 1,
    estimatedTotal: 1,
    createdAt: "fixture-1",
    updatedAt: "fixture-1",
    items: [
      {
        itemId: "fixture-1",
        articleRef: { clientId: "fixture-1", articleId: "fixture-1" },
        status: "queued",
        phase: "paid-admitted",
      },
    ],
  };
}
function contentArticleFixture() {
  return {
    id: "article-1",
    clientId: "client-1",
    materialIds: ["material-1"],
    researchQueryIds: ["research-1"],
    platform: "platform-1",
    scenario: "介绍",
    templateId: "template-1",
    title: "文章标题",
    content: "文章第一行\n文章第二行",
    status: "generated",
    source: {
      client_material: true,
      doubao_answer: true,
      references: true,
      template: true,
    },
    createdAt: "2026-07-26T00:00:00.000Z",
  };
}
function contentTrashFixture() {
  return {
    version: 1,
    deletedAt: "2026-07-26T00:00:00.000Z",
    clientId: "client-1",
    articleId: "article-1",
    status: "saved",
    references: [],
  };
}
function contentImpactFixture() {
  return {
    articleCount: 1,
    blockedItems: [],
    canCommit: true,
  };
}
function contentManagementFixture() {
  return {
    clientId: "client-1",
    revision: 1,
    articles: [],
    trash: [],
    publicationRecords: [],
    submissionPlatforms: [],
    workflowItems: [],
  };
}

const rawProductionIpcContractFixtures = [
  {
    capability: "workspace.getBootstrapState",
    channel: "workspace:get-bootstrap-state",
    owner: "workspace",
    request: {},
    result: {
      state: "checking",
      configured: false,
      environmentManaged: false,
      label: "fixture-1",
      selection: null,
      errorCode: null,
      changed: null,
    },
  },
  {
    capability: "workspace.chooseDirectory",
    channel: "workspace:choose-directory",
    owner: "workspace",
    request: {},
    result: {
      state: "checking",
      configured: false,
      environmentManaged: false,
      label: "fixture-1",
      selection: null,
      errorCode: null,
      changed: null,
    },
  },
  {
    capability: "workspace.confirmSelection",
    channel: "workspace:confirm-selection",
    owner: "workspace",
    request: {
      token: "fixture-1",
    },
    result: {
      state: "checking",
      configured: false,
      environmentManaged: false,
      label: "fixture-1",
      selection: null,
      errorCode: null,
      changed: null,
    },
  },
  {
    capability: "workspace.cancelSelection",
    channel: "workspace:cancel-selection",
    owner: "workspace",
    request: {},
    result: {
      state: "checking",
      configured: false,
      environmentManaged: false,
      label: "fixture-1",
      selection: null,
      errorCode: null,
      changed: null,
    },
  },
  {
    capability: "workspace.getCurrent",
    channel: "workspace:get-current",
    owner: "workspace",
    request: {},
    result: {
      state: "checking",
      configured: false,
      environmentManaged: false,
      label: "fixture-1",
      selection: null,
      errorCode: null,
      changed: null,
    },
  },
  {
    capability: "workspace.openCurrent",
    channel: "workspace:open-current",
    owner: "workspace",
    request: {},
    result: {
      opened: false,
    },
  },
  {
    capability: "workspace.requestSwitch",
    channel: "workspace:request-switch",
    owner: "workspace",
    request: {},
    result: {
      state: "checking",
      configured: false,
      environmentManaged: false,
      label: "fixture-1",
      selection: null,
      errorCode: null,
      changed: null,
    },
  },
  {
    capability: "settings.ai.getStatus",
    channel: "ai-provider:get-status",
    owner: "settings",
    request: {},
    result: {
      source: "application",
      configured: false,
      baseUrl: "fixture-1",
      model: "fixture-1",
      timeoutMs: 1000,
      hasApiKey: false,
      apiKeyMask: "fixture-1",
      lastTest: null,
    },
  },
  {
    capability: "settings.ai.save",
    channel: "ai-provider:save",
    owner: "settings",
    request: {
      baseUrl: "fixture-1",
      apiKey: "fixture-1",
      model: "fixture-1",
      timeoutMs: 1000,
    },
    result: {
      source: "application",
      configured: false,
      baseUrl: "fixture-1",
      model: "fixture-1",
      timeoutMs: 1000,
      hasApiKey: false,
      apiKeyMask: "fixture-1",
      lastTest: null,
    },
  },
  {
    capability: "settings.ai.test",
    channel: "ai-provider:test",
    owner: "settings",
    request: {},
    result: {
      testedAt: "fixture-1",
      ok: false,
      code: "fixture-1",
    },
  },
  {
    capability: "settings.ai.clear",
    channel: "ai-provider:clear",
    owner: "settings",
    request: {},
    result: {
      cleared: false,
    },
  },
  {
    capability: "settings.platform.getStatus",
    channel: "platform-settings:get-status",
    owner: "settings",
    request: {
      platformId: "media",
    },
    result: {
      platformId: "media",
      status: {
        source: "application",
        configured: false,
        baseUrl: "fixture-1",
        timeoutMs: 1000,
        allowInsecure: false,
        transport: "fixture-1",
        apiKeyMask: "fixture-1",
        lastTest: null,
      },
    },
  },
  {
    capability: "settings.platform.save",
    channel: "platform-settings:save",
    owner: "settings",
    request: {
      platformId: "media",
      draft: {},
    },
    result: {
      platformId: "media",
      status: {
        source: "application",
        configured: false,
        baseUrl: "fixture-1",
        timeoutMs: 1000,
        allowInsecure: false,
        transport: "fixture-1",
        apiKeyMask: "fixture-1",
        lastTest: null,
      },
    },
  },
  {
    capability: "settings.platform.test",
    channel: "platform-settings:test",
    owner: "settings",
    request: {
      platformId: "media",
    },
    result: {
      platformId: "media",
      result: {
        testedAt: "fixture-1",
        ok: false,
        code: "fixture-1",
      },
    },
  },
  {
    capability: "settings.platform.clear",
    channel: "platform-settings:clear",
    owner: "settings",
    request: {
      platformId: "media",
    },
    result: {
      platformId: "media",
      cleared: false,
    },
  },
  {
    capability: "settings.platform.getLegacyStatus",
    channel: "platform-settings:get-legacy-status",
    owner: "settings",
    request: {},
    result: {
      discover: {
        media: {
          available: false,
          sources: [],
        },
        hepan: {
          available: false,
          sources: [],
          cookiePathAvailable: false,
        },
        sources: [],
        importable: false,
      },
      record: null,
    },
  },
  {
    capability: "settings.platform.importLegacy",
    channel: "platform-settings:import-legacy",
    owner: "settings",
    request: {
      confirmed: true,
    },
    result: {
      imported: [],
      entries: [],
      record: {
        version: 1,
        updatedAt: null,
        entries: [],
      },
      legacyCookieFilesRemain: false,
    },
  },
  {
    capability: "settings.storage.getUsage",
    channel: "storage-maintenance:get-usage",
    owner: "settings",
    request: {},
    result: {
      logs: {
        bytes: 0,
        files: 0,
        followedSymlinks: 0,
        skippedSymlinks: 0,
      },
      temporary: {
        bytes: 0,
        files: 0,
        followedSymlinks: 0,
        skippedSymlinks: 0,
      },
      docxCache: {
        bytes: 0,
        files: 0,
        followedSymlinks: 0,
        skippedSymlinks: 0,
      },
      profiles: {
        bytes: 0,
        files: 0,
        followedSymlinks: 0,
        skippedSymlinks: 0,
      },
      tmp: {
        bytes: 0,
        files: 0,
        followedSymlinks: 0,
        skippedSymlinks: 0,
      },
      totalBytes: 0,
      removableBytes: 0,
      active: false,
    },
  },
  {
    capability: "settings.storage.cleanCaches",
    channel: "storage-maintenance:clean-caches",
    owner: "settings",
    request: {},
    result: {
      blocked: false,
      reason: null,
      deletedCount: 0,
      failedCount: 0,
      usage: {
        logs: {
          bytes: 0,
          files: 0,
          followedSymlinks: 0,
          skippedSymlinks: 0,
        },
        temporary: {
          bytes: 0,
          files: 0,
          followedSymlinks: 0,
          skippedSymlinks: 0,
        },
        docxCache: {
          bytes: 0,
          files: 0,
          followedSymlinks: 0,
          skippedSymlinks: 0,
        },
        profiles: {
          bytes: 0,
          files: 0,
          followedSymlinks: 0,
          skippedSymlinks: 0,
        },
        tmp: {
          bytes: 0,
          files: 0,
          followedSymlinks: 0,
          skippedSymlinks: 0,
        },
        totalBytes: 0,
        removableBytes: 0,
        active: false,
      },
    },
  },
  {
    capability: "settings.runtime.getDiagnostics",
    channel: "runtime-diagnostics:get",
    owner: "settings",
    request: {},
    result: {
      ok: false,
      buildInfo: {
        version: "fixture-1",
        commit: "fixture-1",
        dirty: false,
      },
      browserChannel: {
        state: "ready",
        source: null,
        errorCode: null,
        lastCheckedAt: null,
        channel: null,
        configured: false,
        probed: false,
      },
      capabilities: {
        playwrightNode: {
          state: "ready",
          source: null,
          errorCode: null,
          lastCheckedAt: null,
        },
        playwrightCli: {
          state: "ready",
          source: null,
          errorCode: null,
          lastCheckedAt: null,
        },
        browserChannel: {
          state: "ready",
          source: null,
          errorCode: null,
          lastCheckedAt: null,
          channel: null,
          configured: false,
          probed: false,
        },
        docx: {
          state: "ready",
          source: null,
          errorCode: null,
          lastCheckedAt: null,
        },
        hepan: {
          state: "ready",
          source: null,
          errorCode: null,
          lastCheckedAt: null,
        },
      },
      errors: [],
      warnings: [],
    },
  },
  {
    capability: "settings.runtime.browserSmoke",
    channel: "runtime-diagnostics:browser-smoke",
    owner: "settings",
    request: {},
    result: {
      ok: true,
      browserChannel: "fixture-1",
      session: "runtime-self-check",
    },
  },
  {
    capability: "media.refreshResources",
    channel: "media:refresh-resources",
    owner: "media",
    request: {},
    result: {
      status: "complete",
      complete: false,
      truncated: false,
      truncationReason: null,
      pageCount: 0,
      resourceCount: 0,
      diagnostics: [],
      refreshedAt: "fixture-1",
    },
  },
  {
    capability: "media.getResourcePage",
    channel: "media:get-resource-page",
    owner: "media",
    request: {
      page: 1,
      pageSize: 1,
    },
    result: {
      items: [],
      total: 0,
      page: 1,
      pageSize: 1,
      totalPages: 0,
      hasPrev: false,
      hasNext: false,
    },
  },
  {
    capability: "media.searchResourcePage",
    channel: "media:search-resource-page",
    owner: "media",
    request: {
      query: "fixture-1",
      page: 1,
      pageSize: 1,
    },
    result: {
      items: [],
      total: 0,
      page: 1,
      pageSize: 1,
      totalPages: 0,
      hasPrev: false,
      hasNext: false,
    },
  },
  {
    capability: "media.getPool",
    channel: "media:get-pool",
    owner: "media",
    request: {
      page: 1,
      pageSize: 50,
      resourceIds: ["fixture-1"],
    },
    result: {
      items: [],
      memberResourceIds: [],
      total: 0,
      page: 1,
      pageSize: 50,
      totalPages: 0,
      hasPrev: false,
      hasNext: false,
    },
  },
  {
    capability: "media.addToPool",
    channel: "media:add-to-pool",
    owner: "media",
    request: {
      resource: {
        resourceId: "fixture-1",
      },
    },
    result: {
      resource: {
        resourceId: "fixture-1",
        name: "fixture-1",
        price: 0,
        type: "image",
        createdAt: "fixture-1",
      },
    },
  },
  {
    capability: "media.removeFromPool",
    channel: "media:remove-from-pool",
    owner: "media",
    request: {
      resourceId: "fixture-1",
    },
    result: {
      completed: false,
    },
  },
  {
    capability: "media.getDrafts",
    channel: "media:get-drafts",
    owner: "media",
    request: {},
    result: {
      items: [],
    },
  },
  {
    capability: "media.scanArticles",
    channel: "media:scan-articles",
    owner: "media",
    request: {},
    result: {
      items: [],
    },
  },
  {
    capability: "media.getOrders",
    channel: "media:get-orders",
    owner: "media",
    request: {},
    result: {
      items: [],
    },
  },
  {
    capability: "media.syncOrder",
    channel: "media:sync-order",
    owner: "media",
    request: {
      orderNid: "fixture-1",
    },
    result: {
      order: {
        title: "fixture-1",
        orderNid: "fixture-1",
        statusCode: "fixture-1",
        createdAt: "fixture-1",
        submittedAt: "fixture-1",
        publishedAt: "fixture-1",
        resourceName: "fixture-1",
        price: "fixture-1",
        actualAmount: "fixture-1",
        hasPublishedUrl: false,
        anomaly: null,
        cancellation: null,
      },
    },
  },
  {
    capability: "media.syncAllOrders",
    channel: "media:sync-all-orders",
    owner: "media",
    request: {},
    result: {
      items: [
        {
          orderNid: "fixture-1",
          ok: false,
          errorCode: "MEDIA_ORDER_SYNC_FAILED",
        },
      ],
      succeeded: 0,
      failed: 1,
    },
  },
  {
    capability: "media.prepareOrderStatusAnomalyResolution",
    channel: "media:prepare-order-status-anomaly-resolution",
    owner: "media",
    request: { orderId: "order-1" },
    result: {
      orderId: "order-1",
      classification: "verified_trackable",
      confirmationToken: "order-anomaly-token",
      expiresAt: "2026-08-08T00:05:00.000Z",
      allowedActions: ["resumeOrderTracking"],
    },
  },
  ...[
    [
      "media.resumeOrderTracking",
      "media:resume-order-tracking",
      "tracking_resumed",
    ],
    [
      "media.confirmOrderPublished",
      "media:confirm-order-published",
      "published",
    ],
    [
      "media.confirmOrderNotPublished",
      "media:confirm-order-not-published",
      "not_published",
    ],
  ].map(([capability, channel, status]) => ({
    capability,
    channel,
    owner: "media",
    request: {
      orderId: "order-1",
      confirmationToken: "order-anomaly-token",
    },
    result: { orderId: "order-1", status, idempotent: false },
  })),
  {
    capability: "media.openPublishedUrl",
    channel: "media:open-published-url",
    owner: "media",
    request: {
      orderNid: "fixture-1",
    },
    result: {
      completed: true,
    },
  },
  {
    capability: "platform.getQueue",
    channel: "platforms:get-queue",
    owner: "platform",
    request: {},
    result: {
      platforms: [],
      queue: [],
    },
  },
  {
    capability: "platform.listAccountProfiles",
    channel: "platforms:list-account-profiles",
    owner: "platform",
    request: {},
    result: {
      profiles: [],
    },
  },
  {
    capability: "platform.confirmAccountProfile",
    channel: "platforms:confirm-account-profile",
    owner: "platform",
    request: {
      platformId: "fixture-1",
      displayName: "fixture-1",
      confirmed: true,
    },
    result: {
      profile: {
        accountProfileId: "fixture-1",
        platformId: "fixture-1",
        displayName: "fixture-1",
        bindingStatus: "bound",
      },
    },
  },
  {
    capability: "platform.bindAccountProfile",
    channel: "platforms:bind-account-profile",
    owner: "platform",
    request: {
      accountProfileId: "fixture-1",
      confirmed: true,
    },
    result: {
      profile: {
        accountProfileId: "fixture-1",
        platformId: "fixture-1",
        displayName: "fixture-1",
        bindingStatus: "bound",
      },
    },
  },
  {
    capability: "platform.deleteAccountProfile",
    channel: "platforms:delete-account-profile",
    owner: "platform",
    request: {
      accountProfileId: "fixture-1",
      confirmed: true,
    },
    result: {
      accountProfileId: "fixture-1",
    },
  },
  {
    capability: "platform.openLogin",
    channel: "platforms:open-login",
    owner: "platform",
    request: {
      platformId: "fixture-1",
    },
    result: {
      platformId: "fixture-1",
      status: "opened",
    },
  },
  {
    capability: "platform.checkLogin",
    channel: "platforms:check-login",
    owner: "platform",
    request: {
      platformId: "fixture-1",
    },
    result: {
      platformId: "fixture-1",
      authenticated: false,
    },
  },
  {
    capability: "content.listClients",
    channel: "content:list-clients",
    owner: "content",
    request: {},
    result: { clients: [contentClientFixture()] },
  },
  {
    capability: "content.saveClientLiejuPublicationProfile",
    channel: "content:save-client-lieju-publication-profile",
    owner: "content",
    request: {
      clientId: "client-1",
      profile: { city: "上海", contact: "张三", phone: "13800138000" },
    },
    result: {
      profile: { city: "上海", contact: "张三", phone: "13800138000" },
    },
  },
  {
    capability: "content.listResearch",
    channel: "content:list-research",
    owner: "content",
    request: { clientId: "client-1" },
    result: { research: [contentResearchFixture()] },
  },
  {
    capability: "content.listTemplateCatalog",
    channel: "content:list-template-catalog",
    owner: "content",
    request: {},
    result: contentCatalogFixture(),
  },
  {
    capability: "content.retryMaterial",
    channel: "content:retry-material",
    owner: "content",
    request: { clientId: "client-1", materialId: "material-1" },
    result: { material: contentMaterialFixture() },
  },
  {
    capability: "content.generateArticle",
    channel: "content:generate-article",
    owner: "content",
    request: {
      clientId: "client-1",
      materialIds: ["material-1"],
      researchQueryIds: ["research-1"],
      platform: "platform-1",
      templateId: "template-1",
    },
    result: { article: contentArticleFixture() },
  },
  {
    capability: "content.saveArticle",
    channel: "content:save-article",
    owner: "content",
    request: {
      article: contentArticleFixture(),
      expectedFingerprint: "fingerprint-1",
    },
    result: {
      outcome: "saved",
      article: contentArticleFixture(),
      editFingerprint: "fingerprint-2",
    },
  },
  {
    capability: "content.getArticleEditor",
    channel: "content:get-article-editor",
    owner: "content",
    request: { clientId: "client-1", articleId: "article-1" },
    result: {
      article: contentArticleFixture(),
      editFingerprint: "fingerprint-1",
    },
  },
  {
    capability: "content.previewArticleRemovalImpact",
    channel: "content:preview-article-removal-impact",
    owner: "content",
    request: { selections: [{ clientId: "client-1", articleId: "article-1" }] },
    result: contentImpactFixture(),
  },
  {
    capability: "content.trashArticles",
    channel: "content:trash-articles",
    owner: "content",
    request: {
      selections: [{ clientId: "client-1", articleId: "article-1" }],
      token: "token-1",
      confirmed: true,
    },
    result: {
      transactionId: "transaction-1",
      status: "committed",
      articleCount: 1,
    },
  },
  {
    capability: "content.restoreArticle",
    channel: "content:restore-article",
    owner: "content",
    request: { clientId: "client-1", articleId: "article-1" },
    result: {
      article: contentArticleFixture(),
      restored: true,
      queueRestored: false,
      message: "文章已恢复",
    },
  },
  {
    capability: "content.preparePermanentDeleteArticle",
    channel: "content:prepare-permanent-delete-article",
    owner: "content",
    request: { clientId: "client-1", articleId: "article-1" },
    result: {
      token: "token-1",
      clientId: "client-1",
      articleId: "article-1",
      deletedAt: "2026-07-26T00:00:00.000Z",
      status: "saved",
    },
  },
  {
    capability: "content.permanentlyDeleteArticle",
    channel: "content:permanently-delete-article",
    owner: "content",
    request: { clientId: "client-1", articleId: "article-1", token: "token-1" },
    result: {
      clientId: "client-1",
      articleId: "article-1",
      deleted: true,
      deletedAt: "2026-07-26T00:00:00.000Z",
    },
  },
  {
    capability: "content.getArticleRemovalTransaction",
    channel: "content:get-article-removal-transaction",
    owner: "content",
    request: {
      transactionId: "fixture-1",
    },
    result: {
      transaction: {
        status: "fixture-1",
      },
    },
  },
  {
    capability: "content.retryArticleRemovalTransaction",
    channel: "content:retry-article-removal-transaction",
    owner: "content",
    request: {
      transactionId: "fixture-1",
      confirmed: true,
    },
    result: {
      transaction: {
        status: "fixture-1",
      },
    },
  },
  {
    capability: "content.getArticleManagementSnapshot",
    channel: "content:get-article-management-snapshot",
    owner: "content",
    request: { clientId: "client-1" },
    result: contentManagementFixture(),
  },
  {
    capability: "content.openPublicationUrl",
    channel: "content:open-publication-url",
    owner: "content",
    request: { publicationId: "publication-1" },
    result: { completed: true },
  },
  {
    capability: "content.getSubmissionCenterSnapshot",
    channel: "content:get-submission-center-snapshot",
    owner: "content",
    request: { clientId: "client-1" },
    result: {
      schemaVersion: 1,
      clientId: "client-1",
      revision: 0,
      regular: { groups: [] },
      paid: { batches: [] },
      attention: { items: [] },
      counts: {
        regularItems: 0,
        paidBatches: 0,
        attentionItems: 0,
        total: 0,
      },
      page: 1,
      pageSize: 100,
      hasMore: false,
      failures: [],
    },
  },
  {
    capability: "attention.listArticleAttention",
    channel: "content:list-article-attention",
    owner: "attention",
    request: {},
    result: {
      revision: 0,
      items: [],
      counts: {
        total: 0,
        actionable: 0,
      },
    },
  },
  {
    capability: "attention.previewArticleAttention",
    channel: "content:preview-article-attention",
    owner: "attention",
    request: {
      attentionId: "fixture-1",
      action: "open-submission",
    },
    result: {
      attentionId: "fixture-1",
      revision: 0,
      action: "open-submission",
      requiresConfirmation: false,
      message: "fixture-1",
      changedScopes: [],
    },
  },
  {
    capability: "attention.resolveArticleAttention",
    channel: "content:resolve-article-attention",
    owner: "attention",
    request: {
      attentionId: "fixture-1",
      action: "open-submission",
      expectedRevision: 0,
    },
    result: {
      outcome: "fixture-1",
      attentionId: "fixture-1",
      changedScopes: [],
    },
  },
  {
    capability: "content.articleRemovalTransactionChanged",
    channel: "content:article-removal-transaction",
    owner: "content",
    event: {
      status: "fixture-1",
    },
  },
  {
    capability: "generation.previewBatch",
    channel: "content:preview-generation-batch",
    owner: "generation",
    request: {
      clientIds: ["fixture-1"],
      templates: [
        {
          platform: "fixture-1",
          templateId: "fixture-1",
        },
      ],
    },
    result: {
      clientCount: 0,
      executableClientCount: 0,
      taskCount: 0,
      executableTaskCount: 0,
      excludedTaskCount: 0,
      excludedClients: [],
      templates: [],
      clientSources: [],
    },
  },
  {
    capability: "generation.createAndStartBatch",
    channel: "content:create-and-start-generation-batch",
    owner: "generation",
    request: {
      clientIds: ["fixture-1"],
      templates: [
        {
          platform: "fixture-1",
          templateId: "fixture-1",
        },
      ],
    },
    result: {
      batch: {
        id: "fixture-1",
        status: "pending",
        clientSources: [],
        templates: [],
        tasks: [],
        counts: {
          total: 0,
          succeeded: 0,
          failed: 0,
          pending: 0,
          interrupted: 0,
          cancelled: 0,
        },
      },
    },
  },
  {
    capability: "generation.abandonBatch",
    channel: "content:abandon-generation-batch",
    owner: "generation",
    request: { batchId: "batch-1", confirmed: true },
    result: {
      batch: null,
    },
  },
  {
    capability: "generation.pauseBatch",
    channel: "content:pause-generation-batch",
    owner: "generation",
    request: {},
    result: {
      batch: null,
    },
  },
  {
    capability: "generation.resumeBatch",
    channel: "content:resume-generation-batch",
    owner: "generation",
    request: {
      batchId: "fixture-1",
    },
    result: {
      batch: {
        id: "fixture-1",
        status: "pending",
        clientSources: [],
        templates: [],
        tasks: [],
        counts: {
          total: 0,
          succeeded: 0,
          failed: 0,
          pending: 0,
          interrupted: 0,
          cancelled: 0,
        },
      },
    },
  },
  {
    capability: "generation.retryFailed",
    channel: "content:retry-failed-generation-batch",
    owner: "generation",
    request: {
      batchId: "fixture-1",
    },
    result: {
      batch: {
        id: "fixture-1",
        status: "pending",
        clientSources: [],
        templates: [],
        tasks: [],
        counts: {
          total: 0,
          succeeded: 0,
          failed: 0,
          pending: 0,
          interrupted: 0,
          cancelled: 0,
        },
      },
    },
  },
  {
    capability: "generation.previewCancelPending",
    channel: "content:preview-cancel-pending-generation-batch",
    owner: "generation",
    request: {
      batchId: "fixture-1",
    },
    result: {
      batchId: "fixture-1",
      pendingCount: 0,
      runningCount: 0,
      cancelledCount: 0,
      canCancel: false,
    },
  },
  {
    capability: "generation.cancelPending",
    channel: "content:cancel-pending-generation-batch",
    owner: "generation",
    request: {
      batchId: "fixture-1",
      confirmed: true,
    },
    result: {
      batch: {
        id: "fixture-1",
        status: "pending",
        clientSources: [],
        templates: [],
        tasks: [],
        counts: {
          total: 0,
          succeeded: 0,
          failed: 0,
          pending: 0,
          interrupted: 0,
          cancelled: 0,
        },
      },
    },
  },
  {
    capability: "generation.getRuntimeSnapshot",
    channel: "content:get-generation-runtime-snapshot",
    owner: "generation",
    request: {},
    result: {
      runtimeId: "fixture-1",
      sequence: 0,
      runtime: {
        state: "idle",
        status: "idle",
        batchId: null,
        counts: null,
        updatedAt: "fixture-1",
        runtimeId: "fixture-1",
        sequence: 0,
        isBatchRunning: false,
        isStopPending: false,
      },
      batch: null,
      capabilities: {
        canResume: false,
        canContinue: false,
        canRetry: false,
        canCancel: false,
      },
    },
  },
  {
    capability: "content.previewRegularQueueAdmission",
    channel: "content:preview-regular-queue-admission",
    owner: "content",
    request: {
      articleRefs: [{ clientId: "fixture-1", articleId: "fixture-1" }],
      platformId: "fixture-1",
      accountProfileId: "fixture-1",
    },
    result: {
      target: { platformId: "fixture-1", accountProfileId: "fixture-1" },
      articleRefs: [{ clientId: "fixture-1", articleId: "fixture-1" }],
      items: [],
      totalCount: 0,
      queueableCount: 0,
      idempotentCount: 0,
      missingCount: 0,
      conflictCount: 0,
    },
  },
  {
    capability: "content.admitRegularQueueItems",
    channel: "content:admit-regular-queue-items",
    owner: "content",
    request: {
      articleRefs: [{ clientId: "fixture-1", articleId: "fixture-1" }],
      platformId: "fixture-1",
      accountProfileId: "fixture-1",
      confirmed: true,
    },
    result: {
      batchId: "fixture-1",
      target: { platformId: "fixture-1", accountProfileId: "fixture-1" },
      articleRefs: [{ clientId: "fixture-1", articleId: "fixture-1" }],
      items: [],
      admittedCount: 0,
      idempotentCount: 0,
      missingCount: 0,
      conflictCount: 0,
    },
  },
  {
    capability: "content.previewPaidMediaPreflight",
    channel: "content:preview-paid-media-preflight",
    owner: "content",
    request: {
      articleRefs: [{ clientId: "fixture-1", articleId: "fixture-1" }],
      mediaResourceId: "fixture-1",
    },
    result: {
      version: 1,
      status: "ready",
      canConfirm: true,
      confirmationToken: "fixture-1",
      confirmationFingerprint: "fixture-1",
      articleRefs: [{ clientId: "fixture-1", articleId: "fixture-1" }],
      articleCount: 1,
      articles: [
        {
          articleRef: { clientId: "fixture-1", articleId: "fixture-1" },
          articleId: "fixture-1",
          title: "fixture-1",
          contentFingerprint: "fixture-1",
          status: "ready",
          reasonCodes: [],
          riskCodes: [],
        },
      ],
      mediaResourceId: "fixture-1",
      mediaName: "fixture-1",
      mediaRemarks: "fixture-1",
      resourceFingerprint: "fixture-1",
      resourceAvailable: true,
      quotedPrice: 1,
      estimatedTotal: 1,
      systemSubmissionCode: "fixture-1",
      blockers: [],
      risks: [{ code: "PHONE_NUMBER", message: "fixture-1", count: 1 }],
      createdAt: "fixture-1",
      expiresAt: "fixture-1",
    },
  },
  {
    capability: "media.prepareOrderCancellation",
    channel: "media:prepare-order-cancellation",
    owner: "media",
    request: { orderId: "order-1" },
    result: {
      orderId: "order-1",
      cancellationAttemptId: "cancel-1",
      expectedObservationFingerprint: "a".repeat(64),
      actionLabel: "取消订单",
      riskCode: null,
      confirmationToken: "token-1",
      expiresAt: "2026-08-08T00:05:00.000Z",
    },
  },
  {
    capability: "media.cancelOrder",
    channel: "media:cancel-order",
    owner: "media",
    request: { orderId: "order-1", confirmationToken: "token-1" },
    result: {
      status: "cancelled",
      cancellationAttemptId: "cancel-1",
      manualCheckRequired: false,
      idempotent: false,
      publishedWins: false,
    },
  },
  {
    capability: "media.prepareCancellationResolution",
    channel: "media:prepare-cancellation-resolution",
    owner: "media",
    request: { cancellationAttemptId: "cancel-1" },
    result: {
      version: 1,
      cancellationAttemptId: "cancel-1",
      orderId: "order-1",
      expectedObservationFingerprint: "a".repeat(64),
      classification: "verified_cancelled",
      evidenceFingerprint: "b".repeat(64),
      evidenceSummary: {
        source: "supplier_query",
        status: "cancelled",
        observed: true,
      },
      confirmationToken: "token-2",
      preparedAt: "2026-08-08T00:00:00.000Z",
      expiresAt: "2026-08-08T00:05:00.000Z",
    },
  },
  ...[
    [
      "media.confirmCancellationSucceeded",
      "media:confirm-cancellation-succeeded",
      "cancelled",
    ],
    [
      "media.confirmCancellationNotApplied",
      "media:confirm-cancellation-not-applied",
      "rejected",
    ],
  ].map(([capability, channel, status]) => ({
    capability,
    channel,
    owner: "media",
    request: {
      cancellationAttemptId: "cancel-1",
      confirmationToken: "token-2",
      evidenceFingerprint: "b".repeat(64),
    },
    result: { status, idempotent: false, publishedWins: false },
  })),
  {
    capability: "content.listRegularQueueGroups",
    channel: "content:list-regular-queue-groups",
    owner: "content",
    request: {},
    result: { items: [] },
  },
  {
    capability: "content.updateRegularQueueGroupImageCount",
    channel: "content:update-regular-queue-group-image-count",
    owner: "content",
    request: {
      queueGroupId: "fixture-1",
      imageCount: 3,
      expectedRevision: 2,
    },
    result: { items: [] },
  },
  {
    capability: "content.startRegularQueueGroup",
    channel: "content:start-regular-queue-group",
    owner: "content",
    request: { queueGroupId: "fixture-1" },
    result: { items: [] },
  },
  {
    capability: "content.pauseRegularQueueGroup",
    channel: "content:pause-regular-queue-group",
    owner: "content",
    request: { queueGroupId: "fixture-1" },
    result: { items: [] },
  },
  {
    capability: "content.startAllRegularQueueGroups",
    channel: "content:start-all-regular-queue-groups",
    owner: "content",
    request: {},
    result: { items: [] },
  },
  {
    capability: "content.pauseAllRegularQueueGroups",
    channel: "content:pause-all-regular-queue-groups",
    owner: "content",
    request: {},
    result: { items: [] },
  },
  {
    capability: "content.confirmPaidMediaBatch",
    channel: "content:confirm-paid-media-batch",
    owner: "content",
    request: { confirmationToken: "fixture-1", confirmed: true },
    result: {
      batchId: "fixture-1",
      targetKey: "fixture-1",
      mediaResourceId: "fixture-1",
      status: "queued",
      articleCount: 1,
      idempotent: false,
      items: [
        {
          articleRef: { clientId: "fixture-1", articleId: "fixture-1" },
          articleId: "fixture-1",
          itemId: "fixture-1",
          batchId: "fixture-1",
          publicationId: "fixture-1",
          attemptId: "fixture-1",
          targetKey: "fixture-1",
          status: "queued",
          idempotent: false,
        },
      ],
      articleRefs: [{ clientId: "fixture-1", articleId: "fixture-1" }],
      confirmationFingerprint: "fixture-1",
      quotedPrice: 1,
      estimatedTotal: 1,
    },
  },
  {
    capability: "content.listPaidMediaBatches",
    channel: "content:list-paid-media-batches",
    owner: "content",
    request: {},
    result: { items: [paidExecutionBatchFixture()] },
  },
  {
    capability: "content.startPaidMediaBatch",
    channel: "content:start-paid-media-batch",
    owner: "content",
    request: { batchId: "fixture-1" },
    result: {
      executionStatus: "submitted",
      batch: paidExecutionBatchFixture(),
    },
  },
  {
    capability: "content.startAllPaidMediaBatches",
    channel: "content:start-all-paid-media-batches",
    owner: "content",
    request: { clientId: "fixture-1" },
    result: {
      executionStatus: "paid_batches_started",
      results: [{ batchId: "fixture-1", executionStatus: "order_created" }],
    },
  },
  {
    capability: "content.pausePaidMediaBatch",
    channel: "content:pause-paid-media-batch",
    owner: "content",
    request: { batchId: "fixture-1" },
    result: { batch: paidExecutionBatchFixture() },
  },
  {
    capability: "content.cancelRemainingPaidMediaBatchItems",
    channel: "content:cancel-remaining-paid-media-batch-items",
    owner: "content",
    request: { batchId: "fixture-1" },
    result: {
      executionStatus: "remaining_cancelled",
      cancelledCount: 1,
      idempotentCount: 0,
      skippedCount: 0,
      batch: paidExecutionBatchFixture(),
    },
  },
  {
    capability: "content.removePendingQueueItems",
    channel: "content:remove-pending-queue-items",
    owner: "content",
    request: {
      items: [
        {
          articleRef: { clientId: "fixture-1", articleId: "fixture-1" },
          itemId: "fixture-1",
          batchId: "fixture-1",
        },
      ],
      confirmed: true,
    },
    result: {
      items: [],
      removedCount: 0,
      idempotentCount: 0,
      conflictCount: 0,
    },
  },
  {
    capability: "content.previewTrashedArticleQueueResidue",
    channel: "content:preview-trashed-article-queue-residue",
    owner: "content",
    request: {},
    result: {
      items: [],
      cleanableItems: [],
      reportedItems: [],
      cleanableCount: 0,
      reportedCount: 0,
    },
  },
  {
    capability: "content.cleanupTrashedArticleQueueResidue",
    channel: "content:cleanup-trashed-article-queue-residue",
    owner: "content",
    request: {
      confirmed: true,
    },
    result: {
      status: "failed",
      cleanedCount: 0,
      failedCount: 0,
      remainingCount: 0,
      cleanableCount: 0,
      reportedCount: 0,
      items: [],
      remainingItems: [],
    },
  },
  {
    capability: "content.listQuestions",
    channel: "content:list-questions",
    owner: "content",
    request: {
      clientId: "fixture-1",
    },
    result: {
      questions: [],
    },
  },
  {
    capability: "content.createQuestion",
    channel: "content:create-question",
    owner: "content",
    request: {
      clientId: "fixture-1",
      text: "fixture-1",
    },
    result: {
      question: {
        id: "fixture-1",
        text: "fixture-1",
        enabled: false,
        createdAt: "fixture-1",
        updatedAt: "fixture-1",
      },
    },
  },
  {
    capability: "content.updateQuestion",
    channel: "content:update-question",
    owner: "content",
    request: {
      clientId: "fixture-1",
      questionId: "fixture-1",
    },
    result: {
      question: {
        id: "fixture-1",
        text: "fixture-1",
        enabled: false,
        createdAt: "fixture-1",
        updatedAt: "fixture-1",
      },
    },
  },
  {
    capability: "content.deleteQuestion",
    channel: "content:delete-question",
    owner: "content",
    request: {
      clientId: "fixture-1",
      questionId: "fixture-1",
    },
    result: {
      question: {
        id: "fixture-1",
        text: "fixture-1",
        enabled: false,
        createdAt: "fixture-1",
        updatedAt: "fixture-1",
      },
    },
  },
  {
    capability: "content.getDoubaoLoginState",
    channel: "content:get-doubao-login-state",
    owner: "content",
    request: {},
    result: {
      loginState: {
        status: "unknown",
      },
    },
  },
  {
    capability: "content.openDoubaoLogin",
    channel: "content:open-doubao-login",
    owner: "content",
    request: {},
    result: {
      loginState: {
        status: "unknown",
      },
    },
  },
  {
    capability: "content.collectDoubaoOne",
    channel: "content:collect-doubao-one",
    owner: "content",
    request: {
      clientId: "fixture-1",
      questionId: "fixture-1",
    },
    result: {
      research: {
        id: "fixture-1",
        clientId: "fixture-1",
        references: [],
        collectionMethod: "automatic",
      },
    },
  },
  {
    capability: "content.previewDoubaoBatch",
    channel: "content:preview-doubao-batch",
    owner: "content",
    request: {
      clientIds: ["fixture-1"],
      mode: "missing",
    },
    result: {
      preview: {
        mode: "missing",
        clientCount: 0,
        taskCount: 0,
        skippedExisting: 0,
        disabledQuestions: 0,
      },
    },
  },
  {
    capability: "content.startPreparedDoubaoBatch",
    channel: "content:start-prepared-doubao-batch",
    owner: "content",
    request: {
      clientIds: ["fixture-1"],
      mode: "missing",
    },
    result: {
      queue: {
        status: "idle",
        currentTaskId: null,
        completed: 0,
        total: 0,
        waitRemainingMs: 0,
        tasks: [],
      },
    },
  },
  {
    capability: "content.pauseDoubaoBatch",
    channel: "content:pause-doubao-batch",
    owner: "content",
    request: {},
    result: {
      queue: {
        status: "idle",
        currentTaskId: null,
        completed: 0,
        total: 0,
        waitRemainingMs: 0,
        tasks: [],
      },
    },
  },
  {
    capability: "content.resumeDoubaoBatch",
    channel: "content:resume-doubao-batch",
    owner: "content",
    request: {},
    result: {
      queue: {
        status: "idle",
        currentTaskId: null,
        completed: 0,
        total: 0,
        waitRemainingMs: 0,
        tasks: [],
      },
    },
  },
  {
    capability: "content.stopDoubaoBatch",
    channel: "content:stop-doubao-batch",
    owner: "content",
    request: {},
    result: {
      queue: {
        status: "idle",
        currentTaskId: null,
        completed: 0,
        total: 0,
        waitRemainingMs: 0,
        tasks: [],
      },
    },
  },
  {
    capability: "content.retryFailedDoubao",
    channel: "content:retry-failed-doubao",
    owner: "content",
    request: {},
    result: {
      queue: {
        status: "idle",
        currentTaskId: null,
        completed: 0,
        total: 0,
        waitRemainingMs: 0,
        tasks: [],
      },
    },
  },
  {
    capability: "content.getDoubaoQueueState",
    channel: "content:get-doubao-queue-state",
    owner: "content",
    request: {},
    result: {
      queue: {
        status: "idle",
        currentTaskId: null,
        completed: 0,
        total: 0,
        waitRemainingMs: 0,
        tasks: [],
      },
    },
  },
  {
    capability: "content.saveManualResearch",
    channel: "content:save-manual-research",
    owner: "content",
    request: {
      clientId: "fixture-1",
      questionId: "fixture-1",
      answerText: "fixture-1",
    },
    result: {
      research: {
        id: "fixture-1",
        clientId: "fixture-1",
        references: [],
        collectionMethod: "automatic",
      },
    },
  },
  {
    capability: "content.doubaoQueueChanged",
    channel: "content:doubao-queue-state",
    owner: "content",
    event: {
      status: "idle",
      currentTaskId: null,
      completed: 0,
      total: 0,
      waitRemainingMs: 0,
      tasks: [],
    },
  },
  {
    capability: "workspace.getRuntimeIdentity",
    channel: "workspace:get-runtime-identity",
    owner: "workspace",
    request: {},
    result: {
      workspaceRuntimeId: "fixture-1",
      revision: 0,
    },
  },
  {
    capability: "media.getBalance",
    channel: "media:get-balance",
    owner: "media",
    request: {},
    result: {
      balance: "fixture-1",
    },
  },
  {
    capability: "generation.runtimeChanged",
    channel: "content:generation-batch-state",
    owner: "generation",
    event: {
      runtimeId: "runner-1",
      sequence: 0,
      batchId: null,
      status: "idle",
      counts: null,
      updatedAt: "2026-07-26T00:00:00.000Z",
    },
  },
  {
    capability: "workspace.invalidated",
    channel: "workspace:data-invalidated",
    owner: "workspace",
    event: {
      workspaceRuntimeId: "fixture-1",
      revision: 1,
      scopes: [],
      reasonCode: "fixture-1",
    },
  },
  {
    capability: "content.getClientDetails",
    channel: "content:get-client-details",
    owner: "content",
    request: { clientId: "client-1" },
    result: { client: contentClientFixture(), research: [] },
  },
  {
    capability: "content.listResearchMetadata",
    channel: "content:list-research-metadata",
    owner: "content",
    request: { clientId: "client-1" },
    result: { research: [] },
  },
  {
    capability: "content.updateRegularQueueGroupSubmissionInterval",
    channel: "content:update-regular-queue-group-submission-interval",
    owner: "content",
    request: {
      queueGroupId: "regular-group-1",
      submissionIntervalSeconds: 30,
      expectedRevision: 2,
    },
    result: { items: [] },
  },
];

const productionIpcContractFixtures = Object.freeze(
  rawProductionIpcContractFixtures.map((entry) => Object.freeze(entry)),
);

module.exports = { productionIpcContractFixtures };
