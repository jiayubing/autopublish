const MAX_CLIENTS = 1000;
const MAX_TEMPLATES = 1000;
const MAX_SOURCE_ITEMS = 50;
const MAX_TASKS = 1000;

function createGenerationBatchPreview(options) {
  const {
    clientKnowledge,
    materialStore,
    researchStore,
    templateStore,
    generationError,
    assertObject,
    assertId,
  } = options;

  function arrayInput(value, code, label, required) {
    if (
      !Array.isArray(value) ||
      (required && value.length === 0) ||
      value.length > MAX_CLIENTS
    ) {
      throw generationError(code, label + " is invalid");
    }
    return value;
  }

  function uniqueIds(values, label) {
    const seen = new Set();
    return values.map(function (value) {
      assertId(value, label);
      if (seen.has(value))
        throw generationError(
          "GENERATION_INPUT_INVALID",
          label + " is duplicated",
        );
      seen.add(value);
      return value;
    });
  }

  function normalizeTemplates(value) {
    arrayInput(value, "GENERATION_TEMPLATES_REQUIRED", "Templates", true);
    if (value.length > MAX_TEMPLATES)
      throw generationError(
        "GENERATION_TEMPLATES_REQUIRED",
        "Too many templates",
      );
    const seen = new Set();
    return value.map(function (template) {
      assertObject(template);
      const platform = assertId(template.platform, "platform");
      const templateId = assertId(template.templateId, "template id");
      const key = platform + "\u0000" + templateId;
      if (seen.has(key))
        throw generationError(
          "GENERATION_INPUT_INVALID",
          "Template is duplicated",
        );
      seen.add(key);
      return { platform: platform, templateId: templateId };
    });
  }

  function selectedSource(input, clientId) {
    const candidates = Array.isArray(input.clientSources)
      ? input.clientSources
      : Array.isArray(input.sources)
        ? input.sources
        : [];
    const found = candidates.find(function (item) {
      return item && item.clientId === clientId;
    });
    if (found) return found;
    if (
      input.sources &&
      !Array.isArray(input.sources) &&
      typeof input.sources === "object"
    )
      return input.sources[clientId];
    return null;
  }

  function selectedIds(source, field) {
    if (!source || source[field] === undefined) return null;
    if (!Array.isArray(source[field]))
      throw generationError("GENERATION_INPUT_INVALID", field + " is invalid");
    if (source[field].length > MAX_SOURCE_ITEMS)
      throw generationError("GENERATION_SOURCE_LIMIT");
    return uniqueIds(source[field], field);
  }

  function validMaterial(item) {
    return (
      item &&
      item.status === "ready" &&
      typeof item.content === "string" &&
      Boolean(item.content.trim())
    );
  }

  function validResearch(item) {
    return (
      item &&
      item.isAnswerComplete !== false &&
      typeof item.answerText === "string" &&
      Boolean(item.answerText.trim())
    );
  }

  async function resolveSources(input, clientIds) {
    const sources = [];
    const excludedClients = [];
    for (const clientId of clientIds) {
      const codes = [];
      if (!clientKnowledge.getClient(clientId)) {
        excludedClients.push({
          clientId: clientId,
          codes: ["GENERATION_CLIENT_NOT_FOUND"],
        });
        continue;
      }
      const source = selectedSource(input, clientId);
      const materials = await materialStore.listMaterials(clientId);
      const readyMaterials = materials.filter(validMaterial);
      const materialIds = selectedIds(source, "materialIds");
      if (materialIds === null && readyMaterials.length > MAX_SOURCE_ITEMS)
        codes.push("GENERATION_SOURCE_LIMIT");
      const selectedMaterials =
        materialIds === null
          ? readyMaterials
          : materialIds.map(function (id) {
              return materials.find(function (item) {
                return item && (item.id === id || item.name === id);
              });
            });
      if (!selectedMaterials.length) codes.push("CLIENT_MATERIAL_REQUIRED");
      else if (
        selectedMaterials.some(function (item) {
          return !validMaterial(item);
        })
      )
        codes.push("CLIENT_MATERIAL_INVALID");

      const researches = researchStore.listResearch(clientId);
      const validResearches = researches.filter(validResearch);
      const researchQueryIds = selectedIds(source, "researchQueryIds");
      const selectedResearch =
        researchQueryIds === null
          ? validResearches
          : researchQueryIds.map(function (id) {
              return researches.find(function (item) {
                return item && item.id === id;
              });
            });
      if (
        researchQueryIds === null &&
        validResearches.length > MAX_SOURCE_ITEMS
      )
        codes.push("GENERATION_SOURCE_LIMIT");
      if (!selectedResearch.length) codes.push("GEO_RESEARCH_REQUIRED");
      else if (
        selectedResearch.some(function (item) {
          return !validResearch(item);
        })
      )
        codes.push("GEO_RESEARCH_INVALID");

      if (codes.length)
        excludedClients.push({ clientId: clientId, codes: codes });
      else
        sources.push({
          clientId: clientId,
          materialIds: selectedMaterials.map(function (item) {
            return item.id || item.name;
          }),
          researchQueryIds: selectedResearch.map(function (item) {
            return item.id;
          }),
        });
    }
    return { sources: sources, excludedClients: excludedClients };
  }

  async function validateTemplates(templates) {
    return Promise.all(
      templates.map(function (item) {
        try {
          const template = templateStore.getCatalogTemplate({
            platformId: item.platform,
            templateId: item.templateId,
          });
          if (
            !template ||
            typeof template.body !== "string" ||
            !template.body.trim()
          )
            throw generationError("GENERATION_TEMPLATE_NOT_FOUND");
          const selection = {
            platform: item.platform,
            templateId: item.templateId,
          };
          if (template.source === "builtin" || template.source === "custom")
            selection.source = template.source;
          if (template.readOnly === true) selection.readOnly = true;
          return selection;
        } catch (error) {
          if (error && error.code === "GENERATION_TEMPLATE_NOT_FOUND")
            throw error;
          if (error && error.code === "TEMPLATE_NOT_FOUND") {
            const missing = generationError("GENERATION_TEMPLATE_NOT_FOUND");
            missing.platformId = item.platform;
            missing.templateId = item.templateId;
            throw missing;
          }
          const invalid = generationError("GENERATION_TEMPLATE_INVALID");
          invalid.platformId = item.platform;
          invalid.templateId = item.templateId;
          if (error && typeof error.diagnosticCode === "string")
            invalid.diagnosticCode = error.diagnosticCode;
          throw invalid;
        }
      }),
    );
  }

  function validateCatalogRevision(value) {
    if (value.templateCatalogRevision === undefined) return;
    const requestedRevision = assertId(
      value.templateCatalogRevision,
      "template catalog revision",
    );
    if (!templateStore || typeof templateStore.listCatalog !== "function")
      return;
    const catalog = templateStore.listCatalog();
    if (catalog && catalog.revision && catalog.revision !== requestedRevision) {
      const error = generationError("GENERATION_TEMPLATE_STALE");
      error.diagnosticCode = "TEMPLATE_CATALOG_REVISION_CHANGED";
      throw error;
    }
  }

  async function preview(input) {
    const value = assertObject(input);
    const clientInput =
      value.clientIds === undefined && Array.isArray(value.clientSources)
        ? value.clientSources.map(function (source) {
            return source && source.clientId;
          })
        : value.clientIds;
    const clientIds = uniqueIds(
      arrayInput(
        clientInput,
        "GENERATION_CLIENTS_REQUIRED",
        "Client ids",
        true,
      ),
      "client id",
    );
    validateCatalogRevision(value);
    const templates = await validateTemplates(
      normalizeTemplates(value.templates),
    );
    const resolved = await resolveSources(value, clientIds);
    const taskCount = clientIds.length * templates.length;
    if (taskCount > MAX_TASKS) throw generationError("GENERATION_TASK_LIMIT");
    const tasks = [];
    resolved.sources.forEach(function (source) {
      templates.forEach(function (template) {
        tasks.push({
          clientId: source.clientId,
          platform: template.platform,
          templateId: template.templateId,
          materialIds: source.materialIds.slice(),
          researchQueryIds: source.researchQueryIds.slice(),
        });
      });
    });
    return {
      clientCount: clientIds.length,
      executableClientCount: resolved.sources.length,
      taskCount: taskCount,
      executableTaskCount: tasks.length,
      excludedTaskCount:
        (clientIds.length - resolved.sources.length) * templates.length,
      excludedClients: resolved.excludedClients,
      templates: templates,
      clientSources: resolved.sources,
      tasks: tasks,
    };
  }

  return preview;
}

module.exports = { createGenerationBatchPreview };
