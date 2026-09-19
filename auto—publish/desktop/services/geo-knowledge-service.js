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
  const application = createGeoKnowledgeApplication({
    store,
    materialStore,
    getClient: resolveClient,
    research,
  });
  let active = 0;
  const links = createGeoQuestionLinks({
    store,
    questionService: options.questionService,
    researchStore:
      options.researchStore ||
      createResearchStore(options.workspaceRoot, { paths: options.paths }),
    getClient: resolveClient,
  });
  function load({ clientId }) {
    resolveClient(clientId);
    return {
      knowledge: store.load(clientId),
      state: application.state(clientId),
    };
  }
  async function generate({ clientId }) {
    active++;
    try {
      return { knowledge: await application.generate(clientId) };
    } finally {
      active--;
    }
  }
  function edit({ clientId, revision, section, id, changes }) {
    resolveClient(clientId);
    return { knowledge: store.edit(clientId, revision, section, id, changes) };
  }
  function exportMarkdown({ clientId }) {
    const document = load({ clientId }).knowledge;
    if (!document) throw geoError("GEO_NOT_FOUND");
    const lines = [
      "# 客户 GEO 知识库",
      "",
      "更新时间：" + document.updatedAt,
      "",
      "## 客户基本信息",
      ...Object.entries(document.profile.fields).map(
        ([key, value]) => "- " + key + "：" + value,
      ),
    ];
    for (const [section, label] of Object.entries({
      offerings: "产品与服务",
      capabilities: "能力与证据",
      scenarios: "场景",
      geoQuestions: "GEO 问题",
      externalResearch: "外部研究",
      restrictions: "待确认与限制",
    })) {
      lines.push("", "## " + label);
      for (const item of document[section])
        lines.push(
          "",
          "### " + item.name,
          item.description,
          "性质：" + item.basis + "；来源：" + item.sourceIds.join("、"),
        );
    }
    lines.push(
      "",
      "## 来源",
      ...document.sources.map(
        (source) =>
          "- " +
          source.id +
          "：" +
          source.title +
          (source.url ? " " + source.url : ""),
      ),
    );
    return { markdown: lines.join("\n") };
  }
  return {
    ...links,
    load,
    generate,
    edit,
    exportMarkdown,
    state: ({ clientId }) => ({ state: application.state(clientId) }),
    cancel: ({ clientId }) => ({ state: application.cancel(clientId) }),
    configStatus: () => config().status(),
    saveConfig: (input) => {
      if (active) throw geoError("GEO_ALREADY_RUNNING");
      return config().save(input);
    },
    dispose: application.dispose,
  };
}
module.exports = { createGeoKnowledgeService };
