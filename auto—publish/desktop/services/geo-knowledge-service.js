"use strict";

const {
  createGeoKnowledgeStore,
} = require("../../src/content/geo-knowledge-store");
const {
  createClientMaterialStore,
} = require("../../src/content/client-material-store");
const { getClient } = require("../../src/content/client-knowledge");
const {
  createDoubaoGeoClient,
} = require("../../src/content/doubao-geo-client");
const {
  createGeoKnowledgeResearch,
} = require("../../src/content/geo-knowledge-research");
const {
  createGeoKnowledgeApplication,
} = require("../../src/content/geo-knowledge-application");
const { createDoubaoGeoConfigStore } = require("../doubao-geo-config-store");
const { geoError } = require("../../src/content/geo-knowledge-schema");
const {
  createGeoQuestionLinks,
} = require("../../src/content/geo-question-links");
const { createResearchStore } = require("../../src/content/research-store");
const {
  selectGeoKnowledge,
} = require("../../src/content/geo-generation-context");
const { queryGeoArticles, queryGeoArticleCounts } = require("../../src/content/geo-article-links");
const { buildGeoQuestionWorkflow } = require("../../src/content/geo-question-workflow");
const { DEFAULT_RESEARCH_PROMPT } = require("../../src/content/geo-knowledge-research");
const { createGeoKnowledgePromptStore } = require("../geo-knowledge-prompt-store");
const { reportDiagnostic } = require("../../src/diagnostics/diagnostic-producer");
const {
  buildCustomerConfirmationModel,
  renderCustomerConfirmationMarkdown,
} = require("../../src/content/geo-confirmation-model");

function createGeoKnowledgeService(options) {
  const store = options.store || createGeoKnowledgeStore(options);
  const materialStore =
    options.materialStore || createClientMaterialStore(options);
  const resolveClient =
    options.getClient || ((id) => getClient(options.workspaceRoot, id));
  let configStore = options.configStore;
  const config = () =>
    configStore || (configStore = createDoubaoGeoConfigStore(options));
  const client =
    options.client ||
    createDoubaoGeoClient({ getConfig: () => config().read() });
  const research = options.research || createGeoKnowledgeResearch({ client });
  const promptStore = options.promptStore || createGeoKnowledgePromptStore(options);
  const application = createGeoKnowledgeApplication({
    store,
    materialStore,
    getClient: resolveClient,
    research,
    request: (input) => client.request(input),
    getPromptSnapshot: (clientId, temporaryPrompt) => ({
      globalPrompt: promptStore.load().researchPromptOverride || DEFAULT_RESEARCH_PROMPT,
      clientPrompt: store.loadPolicy(clientId).researchPrompt,
      temporaryPrompt,
    }),
  });
  let active = 0;
  let testController = null;
  let disposed = false;
  async function testConnection({ search = false } = {}) {
    if (disposed) throw geoError("GEO_CANCELLED");
    if (active || testController) throw geoError("GEO_ALREADY_RUNNING");
    const controller = new AbortController();
    testController = controller;
    try {
      const result = await client.request({
        prompt: search
          ? "请联网查找火山引擎官网，简短回复并提供网页引用。"
          : "连接测试：请只回复 OK。",
        search,
        signal: controller.signal,
      });
      if (controller.signal.aborted) throw geoError("GEO_CANCELLED");
      return { search, citationCount: result.citations.length };
    } finally {
      testController = null;
    }
  }
  const researchStore =
    options.researchStore ||
    createResearchStore(options.workspaceRoot, { paths: options.paths });
  const links = createGeoQuestionLinks({
    store,
    questionService: options.questionService,
    researchStore,
    getClient: resolveClient,
  });
  function linkQuestions(input) {
    const result = links.linkQuestions(input);
    if (typeof options.onDataInvalidated === "function") {
      try {
        options.onDataInvalidated("GEO_QUESTIONS_LINKED", {
          clientId: input.clientId,
        });
      } catch (error) {
        reportDiagnostic({
          code: "GEO_QUESTION_LINK_INVALIDATION_FAILED",
          module: "geo-knowledge-service",
          category: "internal",
          operationId: "geo-question-link-invalidation",
          metadata: {
            operation: "question-link-invalidation",
            outcome: "listener-isolated",
            errorCode:
              error && /^[A-Z][A-Z0-9_]{1,127}$/.test(error.code || "")
                ? error.code
                : "LISTENER_FAILED",
          },
        });
      }
    }
    return result;
  }
  function load({ clientId }) {
    resolveClient(clientId);
    const inspected = store.inspect ? store.inspect(clientId) : { status: "current_v2", knowledge: store.load(clientId) };
    if (inspected.status === "invalid") throw geoError("GEO_KNOWLEDGE_INVALID");
    return {
      knowledge: inspected.knowledge,
      storageStatus: inspected.status,
      state: application.state(clientId),
    };
  }
  async function generate({ clientId, temporaryPrompt = "" }) {
    if (testController) throw geoError("GEO_ALREADY_RUNNING");
    active++;
    try {
      return { knowledge: await application.generate(clientId, { temporaryPrompt }) };
    } finally {
      active--;
    }
  }
  function edit({ clientId, revision, section, id, changes }) {
    resolveClient(clientId);
    return { knowledge: store.edit(clientId, revision, section, id, changes) };
  }
  function confirmSourceType({ clientId, revision, sourceId, targetType }) {
    resolveClient(clientId);
    return { knowledge: store.confirmSourceType(clientId, revision, sourceId, targetType) };
  }
  function resolveConflict({ clientId, revision, conflictId, claimId, value }) {
    resolveClient(clientId);
    return { knowledge: store.resolveConflict(clientId, revision, conflictId, { claimId, value }) };
  }
  function promptSettings({ clientId }) {
    resolveClient(clientId);
    return {
      defaultGlobalPrompt: DEFAULT_RESEARCH_PROMPT,
      globalPrompt: promptStore.load().researchPromptOverride,
      clientPrompt: store.loadPolicy(clientId).researchPrompt,
    };
  }
  function saveGlobalPrompt({ researchPromptOverride }) {
    if (active) throw geoError("GEO_ALREADY_RUNNING");
    promptStore.save(researchPromptOverride);
    return { defaultGlobalPrompt: DEFAULT_RESEARCH_PROMPT, globalPrompt: researchPromptOverride };
  }
  function configStatus() {
    return {
      ...config().status(),
      defaultGlobalPrompt: DEFAULT_RESEARCH_PROMPT,
      globalPrompt: promptStore.load().researchPromptOverride,
    };
  }
  function saveClientPrompt({ clientId, researchPrompt }) {
    resolveClient(clientId);
    if (application.state(clientId).running) throw geoError("GEO_ALREADY_RUNNING");
    return store.savePolicy(clientId, researchPrompt);
  }
  function confirmation({ clientId, revision }) {
    const document = load({ clientId }).knowledge;
    if (!document) throw geoError("GEO_NOT_FOUND");
    if (revision !== document.revision) throw geoError("GEO_REVISION_CONFLICT");
    return {
      document,
      model: buildCustomerConfirmationModel(document),
      client: resolveClient(clientId),
    };
  }
  function previewConfirmation(input) {
    return { model: confirmation(input).model };
  }
  function exportMarkdown(input) {
    const current = confirmation(input);
    return {
      markdown: renderCustomerConfirmationMarkdown(current.model, {
        clientName: current.client.name,
        sources: current.document.sources,
      }),
    };
  }
  return {
    questionWorkflow: async ({ clientId }) => {
      const document = load({ clientId }).knowledge;
      if (!document) throw geoError("GEO_NOT_FOUND");
      const questions = options.questionService.listQuestions({ clientId });
      const researchMetadata = researchStore.listResearchMetadata(clientId);
      const articleCounts = await queryGeoArticleCounts(
        options,
        clientId,
        document.geoQuestions.map((item) => item.id),
      );
      return buildGeoQuestionWorkflow({
        document,
        questions,
        research: researchMetadata,
        articleCounts,
      });
    },
    questionArticles: ({ clientId, id }) => {
      const document = load({ clientId }).knowledge;
      if (!document?.geoQuestions.some((q) => q.id === id))
        throw geoError("GEO_ITEM_NOT_FOUND");
      return queryGeoArticles(options, clientId, id);
    },
    getGenerationContext: (clientId, researches, ids) =>
      selectGeoKnowledge(store.load(clientId), researches, ids),
    ...links,
    linkQuestions,
    load,
    generate,
    edit,
    confirmSourceType,
    resolveConflict,
    promptSettings,
    saveGlobalPrompt,
    saveClientPrompt,
    previewConfirmation,
    exportMarkdown,
    state: ({ clientId }) => ({ state: application.state(clientId) }),
    cancel: ({ clientId }) => ({ state: application.cancel(clientId) }),
    configStatus,
    testConnection,
    saveConfig: (input) => {
      if (active || testController) throw geoError("GEO_ALREADY_RUNNING");
      config().save(input);
      return configStatus();
    },
    dispose: () => {
      disposed = true;
      testController?.abort();
      application.dispose();
    },
  };
}
module.exports = { createGeoKnowledgeService };
