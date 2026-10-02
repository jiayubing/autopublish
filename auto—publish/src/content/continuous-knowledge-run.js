"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { isDeepStrictEqual } = require("node:util");
const { randomUUID, createHash } = require("node:crypto");
const { generationErrorCode } = require("./geo-knowledge-schema");
const {
  createRequestBudget,
  parseJsonObject,
} = require("./geo-knowledge-research");
const { bindEvidenceQuotes } = require("./continuous-knowledge-evidence");
const {
  DEFAULT_FINAL_KNOWLEDGE_PROMPT,
  FINAL_KNOWLEDGE_CHARACTER_RANGE,
} = require("./final-knowledge-prompt");
const {
  directInput,
  promptFor: knowledgePromptFor,
  responseSchema: knowledgeResponseSchema,
  buildKnowledge,
  renderMarkdown,
  renderModelDraft,
  countCharacters,
  terminalSources,
} = require("./continuous-knowledge-synthesis");
const {
  CONTINUOUS_STAGES,
  GENERIC_COMPETITION_PATTERN,
  error,
  text,
  strategySnapshot,
  promptFor,
  responseSchemaFor,
  validateDocument,
} = require("./continuous-knowledge-contract");
const {
  canonicalSchema,
  CANONICAL_PROMPT,
  buildCanonical,
  canonicalSources,
} = require("./continuous-knowledge-canonical");
const { normalizeCandidate } = require("./geo-knowledge-merge");
const { acquireProcessLock } = require("./content-process-lock");

async function runContinuousKnowledge({
  input,
  client,
  artifactRoot,
  canonical = false,
  onProgress = () => {},
  signal,
  runId = randomUUID(),
  hardLimit = 12,
  maxSearches = 3,
  limits,
}) {
  if (
    !/^[a-zA-Z0-9-]{1,80}$/.test(runId) ||
    !Number.isInteger(hardLimit) ||
    hardLimit < 6 ||
    hardLimit > 12 ||
    !Number.isInteger(maxSearches) ||
    maxSearches < 0 ||
    maxSearches > 3 ||
    typeof client?.request !== "function"
  )
    throw error("RESEARCH_RUN_INVALID");
  if (
    !text(input?.clientName, 300) ||
    !Array.isArray(input.materials) ||
    input.materials.length > 100 ||
    input.materials.some(
      (item) =>
        !text(item?.name, 500) ||
        !["ready", "error"].includes(item.status) ||
        (item.status === "error" &&
          item.error?.code &&
          !/^MATERIAL_[A-Z_]+$/u.test(item.error.code)),
    ) ||
    typeof input.knowledgePrompt !== "string" ||
    input.knowledgePrompt.length > 8000
  )
    throw error("RESEARCH_INPUT_INVALID");
  if (
    !Number.isSafeInteger(limits?.maxPromptCharacters) ||
    limits.maxPromptCharacters < 1000 ||
    !Number.isSafeInteger(limits?.analysisOutputTokens) ||
    limits.analysisOutputTokens < 1 ||
    limits.analysisOutputTokens > 128000 ||
    !Number.isSafeInteger(limits?.finalOutputTokens) ||
    limits.finalOutputTokens < 1 ||
    limits.finalOutputTokens > 128000
  )
    throw error("RESEARCH_CAPACITY_UNCONFIGURED");
  const clientName = input.clientName;
  const strategy = strategySnapshot(input.strategy);
  const knowledgePrompt =
    input.knowledgePrompt || DEFAULT_FINAL_KNOWLEDGE_PROMPT;
  if (/不按(?:九|9)个?板块|改为(?:十|10|十五|15)个?板块/u.test(knowledgePrompt))
    throw error("KNOWLEDGE_PROMPT_CONFLICT");
  const materials = input.materials
    .filter((item) => item.status === "ready")
    .map((item, index) => {
      if (!text(item.name, 500) || !text(item.content, 200000))
        throw error("RESEARCH_INPUT_INVALID");
      return {
        id: `M${index + 1}`,
        title: item.name,
        text: item.content,
        provenance: "client_input",
        materialId: typeof item.id === "string" ? item.id : item.name,
        sha256: createHash("sha256").update(item.content).digest("hex"),
        sourceHash:
          typeof item.contentHash === "string" ? item.contentHash : null,
      };
    });
  if (
    !materials.length ||
    materials.reduce((sum, item) => sum + item.text.length, 0) > 200000
  )
    throw error("RESEARCH_INPUT_INVALID");
  signal?.throwIfAborted();
  const root = fs.realpathSync(artifactRoot);
  const directory = path.join(root, `run-${runId}`);
  const lockDirectory = path.join(
    root,
    `active-client-${createHash("sha256")
      .update(input.clientId || clientName)
      .digest("hex")}`,
  );
  const releaseLock = acquireProcessLock(lockDirectory);
  try {
    fs.mkdirSync(directory);
  } catch (cause) {
    try { releaseLock(); } catch { cause.lockCleanupFailed = true; }
    throw cause;
  }
  const write = (name, data) =>
    fs.writeFileSync(
      path.join(directory, name),
      typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n",
      { flag: "wx" },
    );
  const stages = {};
  const sources = [...materials];
  const registry = new Map(materials.map((item) => [item.id, item]));
  const unresolved = input.materials
    .filter((item) => item.status !== "ready")
    .map((item) => ({
      reason: "material_unavailable",
      material: item.name,
      code: item.error?.code || "MATERIAL_READ_FAILED",
    }));
  const ledger = [];
  let searches = 0;
  let weakPublicPresence = false;
  let backgroundAttempted = false;
  const searchQueries = new Set();
  const searchNotes = [];
  let currentStage = "input";
  let remoteUncertain = false;
  const budget = createRequestBudget((request) => client.request(request), {
    hardLimit,
    synthesisReserve: 1,
  });
  const payload = (stage, mode, extra = {}) => ({
    stage,
    mode,
    clientName,
    strategy,
    materials,
    previousStages: stages,
    publicResearch: sources.filter(
      (source) => source.provenance === "public_research",
    ),
    unresolved,
    weakPublicPresence,
    searchPolicy: {
      searchesRemaining: maxSearches - searches,
      noRepeatEntitySearch: weakPublicPresence,
    },
    ...extra,
  });
  async function request({
    stage,
    mode,
    prompt,
    jsonSchema,
    search = false,
    final = false,
  }) {
    onProgress(stage, {
      mode,
      completed: stage === "K" ? 5 : Number(stage.slice(1)) - 1,
      total: 6,
    });
    if (signal?.aborted) throw error("RESEARCH_CANCELLED_BEFORE_REQUEST");
    if (Array.from(prompt).length > limits.maxPromptCharacters)
      throw error("RESEARCH_CONTEXT_LIMIT_EXCEEDED");
    const attempt = ledger.length + 1;
    const item = {
      attempt,
      stage,
      mode,
      outcome: "uncertain_until_response_recorded",
    };
    write(`request-${attempt}-started.json`, item);
    ledger.push(item);
    let response;
    try {
      response = await budget.request(
        {
          prompt,
          search,
          allowUncitedSearchResponse: search,
          jsonSchema,
          signal,
          maxOutputTokens: final
            ? limits.finalOutputTokens
            : limits.analysisOutputTokens,
          ...(final ? { timeoutMs: 600000 } : {}),
        },
        { useReserve: final },
      );
    } catch (cause) {
      const code = [
        "GEO_CONFIG_REQUIRED",
        "GEO_CONFIG_INVALID",
        "GEO_SEARCH_DISABLED",
        "GEO_REQUEST_BUDGET_EXHAUSTED",
        "GEO_AUTH_REJECTED",
        "GEO_PERMISSION_DENIED",
        "GEO_CAPABILITY_REJECTED",
        "GEO_SEARCH_UNCONFIRMED",
        "GEO_RESPONSE_INCOMPLETE",
        "GEO_RESPONSE_INVALID",
        "GEO_REQUEST_TIMEOUT",
      ].includes(cause?.code)
        ? cause.code
        : "GEO_REQUEST_UNCERTAIN";
      item.outcome = [
        "GEO_CONFIG_REQUIRED",
        "GEO_CONFIG_INVALID",
        "GEO_SEARCH_DISABLED",
        "GEO_REQUEST_BUDGET_EXHAUSTED",
      ].includes(code)
        ? "not_started"
        : [
              "GEO_SEARCH_UNCONFIRMED",
              "GEO_RESPONSE_INCOMPLETE",
              "GEO_RESPONSE_INVALID",
            ].includes(code)
          ? "confirmed_response_unusable"
          : ["GEO_REQUEST_UNCERTAIN", "GEO_REQUEST_TIMEOUT"].includes(code)
            ? "uncertain"
            : "confirmed_failure";
      item.code = code;
      if (code === "GEO_RESPONSE_INCOMPLETE")
        item.incompleteReason = [
          "max_output_tokens",
          "content_filter",
          "not_provided",
        ].includes(cause?.incompleteReason)
          ? cause.incompleteReason
          : "unknown";
      remoteUncertain = item.outcome === "uncertain";
      write(`request-${attempt}-outcome.json`, item);
      throw error(code);
    }
    item.outcome = "confirmed_response";
    try {
      write(`request-${attempt}-response.json`, {
        text: response?.text,
        citations: response?.citations || [],
      });
    } catch {
      remoteUncertain = true;
      throw error("RESEARCH_RESPONSE_PERSIST_FAILED");
    }
    write(`request-${attempt}-outcome.json`, item);
    if (signal?.aborted) throw error("RESEARCH_CANCELLED_AFTER_RESPONSE");
    if (!text(response?.text, 500000)) throw error("RESEARCH_OUTPUT_INVALID");
    return response;
  }
  function acceptSearch(response, scope, stage) {
    const raw = parseJsonObject(response.text);
    if (
      !Array.isArray(raw.findings) ||
      raw.findings.length > 50 ||
      !Array.isArray(raw.unresolved) ||
      raw.unresolved.length > 50 ||
      Object.keys(raw).some((key) => !["findings", "unresolved"].includes(key))
    )
      throw error("RESEARCH_SEARCH_INVALID");
    const accepted = [];
    for (const finding of raw.findings) {
      if (!text(finding?.evidenceQuote, 2000)) {
        unresolved.push({ stage, reason: "invalid_search_finding" });
        continue;
      }
      const match = bindEvidenceQuotes(
        [finding.evidenceQuote],
        response.citations || [],
      )[0];
      if (match.result !== "unique_match") {
        unresolved.push({ stage, reason: match.result });
        continue;
      }
      const source = {
        id: `P${sources.length + 1}`,
        title: match.citation.title,
        url: match.citation.url,
        text: finding.evidenceQuote,
        provenance: "public_research",
        scope,
      };
      sources.push(source);
      registry.set(source.id, source);
      accepted.push(source);
    }
    unresolved.push(
      ...raw.unresolved
        .filter((value) => text(value, 2000))
        .map((value) => ({
          stage,
          reason: "search_unresolved",
          observation: value,
        })),
    );
    return accepted;
  }
  try {
    fs.mkdirSync(path.join(directory, "input"));
    write("input/materials.json", materials);
    write("input/research-strategy.json", strategy);
    write("input/final-knowledge-prompt.txt", knowledgePrompt);
    write("run-start.json", {
      runId,
      clientName,
      hardLimit,
      maxSearches,
      limits,
      configIdentity: input.configIdentity || null,
      status: "running",
      recovery: "No automatic retry or resume",
    });
    for (let stage = 0; stage < CONTINUOUS_STAGES.length; stage++) {
      currentStage = `R${stage + 1}`;
      const definition = CONTINUOUS_STAGES[stage];
      const stagePayload = payload(stage, "analysis");
      const first = await request({
        stage: currentStage,
        mode: "analysis",
        prompt: promptFor(stagePayload, CONTINUOUS_STAGES),
        jsonSchema: responseSchemaFor(stage, CONTINUOUS_STAGES),
      });
      let { document, rejected } = validateDocument(
        parseJsonObject(first.text),
        definition.fields,
        registry,
        `R${stage + 1}a`,
      );
      unresolved.push(
        ...rejected.map((item) => ({ stage: currentStage, ...item })),
      );
      let need = document.researchNeed;
      if (
        stage > 0 &&
        !backgroundAttempted &&
        (weakPublicPresence ||
          materials.reduce((sum, item) => sum + item.text.length, 0) < 1500)
      ) {
        need = {
          needed: true,
          scope: "decision_context",
          query: `${
            (stages.customerUnderstanding?.productsAndServices || [])
              .map((item) => item.text)
              .join("；")
              .slice(0, 600) || clientName
          } 消费场景 常见疑问 选择因素`,
          reason:
            "客户资料有限，依据本轮已识别的业务与地区研究品类和场景，不重复查询客户实体，不将行业做法认定为客户服务",
        };
        document.researchNeed = need;
      }
      if (
        stage === 0 &&
        !document.publicIdentity.some(
          (entry) => entry.provenance === "public_research",
        ) &&
        !need.needed
      ) {
        need = {
          needed: true,
          scope: "entity",
          query: `${clientName} 官方信息 地址`,
          reason: "客户公开身份缺少依据",
        };
        document.researchNeed = need;
      }
      if (need.needed) {
        const queryKey = need.query.normalize("NFKC").replace(/\s+/gu, "");
        const remainingRequired = CONTINUOUS_STAGES.length - stage - 1 + 1;
        if (
          searches >= maxSearches ||
          searchQueries.has(queryKey) ||
          budget.snapshot().hardLimit - budget.snapshot().count <
            remainingRequired + 2 ||
          (weakPublicPresence && need.scope === "entity")
        ) {
          unresolved.push({
            stage: currentStage,
            reason:
              weakPublicPresence && need.scope === "entity"
                ? "weak_client_entity_search_suppressed"
                : "search_budget_reserved_for_stages",
          });
        } else {
          searches++;
          searchQueries.add(queryKey);
          if (need.scope !== "entity") backgroundAttempted = true;
          write(`${definition.file}-initial.json`, document);
          const searchPayload = payload(stage, "search", {
            searchNeed: need,
            currentAnalysis: document,
          });
          let response;
          let accepted = [];
          try {
            response = await request({
              stage: currentStage,
              mode: "search",
              search: true,
              prompt: promptFor(searchPayload, CONTINUOUS_STAGES),
            });
            accepted = acceptSearch(response, need.scope, currentStage);
          } catch (cause) {
            if (
              signal?.aborted ||
              ![
                "GEO_AUTH_REJECTED",
                "GEO_PERMISSION_DENIED",
                "GEO_CAPABILITY_REJECTED",
                "GEO_SEARCH_UNCONFIRMED",
                "GEO_RESPONSE_INVALID",
                "RESEARCH_SEARCH_INVALID",
              ].includes(cause.code)
            )
              throw cause;
            unresolved.push({
              stage: currentStage,
              reason: "search_failed",
              code: cause.code,
            });
          }
          if (need.scope === "entity" && !accepted.length)
            weakPublicPresence = true;
          searchNotes.push({
            stage: currentStage,
            scope: need.scope,
            query: need.query,
            accepted: accepted.map((item) => ({
              title: item.title,
              url: item.url,
              text: item.text,
            })),
          });
          const after = payload(stage, "analysis-after-search", {
            searchNeed: need,
            currentAnalysis: document,
            searchResults: accepted,
          });
          const supplemental = await request({
            stage: currentStage,
            mode: "analysis-after-search",
            prompt: promptFor(after, CONTINUOUS_STAGES),
            jsonSchema: responseSchemaFor(stage, CONTINUOUS_STAGES),
          });
          ({ document, rejected } = validateDocument(
            parseJsonObject(supplemental.text),
            definition.fields,
            registry,
            `R${stage + 1}b`,
          ));
          unresolved.push(
            ...rejected.map((item) => ({ stage: currentStage, ...item })),
          );
        }
      }
      if (stage === 4) {
        const ungrounded = document.competitionContext.filter(
          (entry) => entry.provenance === "derived",
        );
        const generic = document.competitionContext.filter((entry) =>
          GENERIC_COMPETITION_PATTERN.test(entry.text),
        );
        if (ungrounded.length)
          unresolved.push({
            stage: currentStage,
            reason: "competition_context_requires_direct_evidence",
            count: ungrounded.length,
          });
        if (generic.length)
          unresolved.push({
            stage: currentStage,
            reason: "competition_context_requires_specific_evidence",
            count: generic.length,
          });
        for (const entry of [...ungrounded, ...generic])
          registry.delete(entry.id);
        for (const [id, entry] of registry)
          if (
            /^R5[ab]-competitionContext-/u.test(id) &&
            (entry.provenance === "derived" ||
              GENERIC_COMPETITION_PATTERN.test(entry.text))
          )
            registry.delete(id);
        document.competitionContext = document.competitionContext.filter(
          (entry) =>
            entry.provenance !== "derived" &&
            !GENERIC_COMPETITION_PATTERN.test(entry.text),
        );
        if (
          !document.competitionContext.length &&
          document.differentiation.length
        ) {
          unresolved.push({
            stage: currentStage,
            reason: "differentiation_without_competitor_evidence",
          });
          for (const entry of document.differentiation)
            registry.delete(entry.id);
          for (const id of registry.keys())
            if (/^R5[ab]-differentiation-/u.test(id)) registry.delete(id);
          document.differentiation = [];
        }
      }
      stages[definition.key] = document;
      write(`${definition.file}.json`, document);
    }
    currentStage = "K";
    write(
      "input/accepted-public-research.json",
      sources.filter((source) => source.provenance === "public_research"),
    );
    write(
      "input/analysis-registry.json",
      [...registry.values()].filter(
        (entry) => !sources.some((source) => source.id === entry.id),
      ),
    );
    write("input/unresolved.json", unresolved);
    const knowledgeInput = directInput({
      materials,
      stages,
      sources,
      strategy,
      unresolved,
      registry,
    });
    const finalSchema = knowledgeResponseSchema();
    knowledgeInput.existingKnowledge = input.existingKnowledge;
    if (canonical) {
      finalSchema.properties.canonical = canonicalSchema();
      finalSchema.required = [...finalSchema.required, "canonical"];
    }
    const knowledgePromptText = knowledgePromptFor(
      knowledgeInput,
      clientName,
      canonical ? knowledgePrompt + "\n" + CANONICAL_PROMPT : knowledgePrompt,
    );
    write("knowledge-synthesis-prompt.txt", knowledgePromptText);
    const response = await request({
      stage: "K",
      mode: "final",
      final: true,
      search: false,
      prompt: knowledgePromptText,
      jsonSchema: finalSchema,
    });
    let raw;
    try {
      raw = parseJsonObject(response.text);
    } catch {
      throw error("KNOWLEDGE_RESPONSE_INVALID");
    }
    write(
      "customer-knowledge-model-draft.md",
      renderModelDraft(raw, clientName),
    );
    const { canonical: canonicalRaw, ...draftRaw } = raw;
    const { knowledge } = buildKnowledge(
      canonical ? draftRaw : raw,
      knowledgeInput,
      clientName,
      [],
    );
    let document = null;
    let indexWarning = null;
    if (canonical) {
      try {
        document = buildCanonical(
          canonicalRaw,
          knowledgeInput,
          input.clientId,
          clientName,
        );
      } catch (cause) {
        if (
          ![
            "GEO_SCHEMA_INVALID",
            "GEO_SOURCE_INVALID",
            "GEO_KNOWLEDGE_INVALID",
          ].includes(cause.code) &&
          !String(cause.code || "").startsWith("KNOWLEDGE_")
        )
          throw cause;
        indexWarning = `辅助索引未生成（${generationErrorCode(cause.code)}），已保留通过正文校验的九板块内容。`;
        document = normalizeCandidate(
          {},
          [
            ...new Map(
              canonicalSources(knowledgeInput).map((source) => [
                source.id,
                source,
              ]),
            ).values(),
          ],
          input.clientId,
        );
        document.status.warnings.push(indexWarning);
        document.status.outcome = "partial";
      }
    }
    const sectionLengths = Object.fromEntries([
      ...[
        "products_services",
        "features",
        "brand_story",
        "pain_points",
        "founder",
        "social_contribution",
        "trust",
      ].map((key) => [
        key,
        countCharacters(
          knowledge.sections
            .find((section) => section.key === key)
            ?.items.map((item) => item.text)
            .join(" ") || "",
        ),
      ]),
      [
        "realCases",
        countCharacters(knowledge.realCases.map((item) => item.text).join(" ")),
      ],
      [
        "customerReviews",
        countCharacters(
          knowledge.customerReviews.map((item) => item.text).join(" "),
        ),
      ],
    ]);
    const shortSections = Object.entries(sectionLengths)
      .filter(
        ([, length]) =>
          length > 0 && length < FINAL_KNOWLEDGE_CHARACTER_RANGE[0],
      )
      .map(([key]) => key);
    const overlongSections = Object.entries(sectionLengths)
      .filter(([, length]) => length > FINAL_KNOWLEDGE_CHARACTER_RANGE[1])
      .map(([key]) => key);
    const excludedMaterials = unresolved
      .filter((item) => item.reason === "material_unavailable")
      .map(({ material, code }) => ({ material, code }));
    knowledge.quality = {
      status:
        shortSections.length ||
        overlongSections.length ||
        excludedMaterials.length ||
        Object.values(sectionLengths).every((length) => length === 0)
          ? "draft"
          : "complete",
      targetCharacters: [...FINAL_KNOWLEDGE_CHARACTER_RANGE],
      sectionLengths,
      shortSections,
      overlongSections,
      omittedSections: Object.entries(sectionLengths)
        .filter(([, length]) => length === 0)
        .map(([key]) => key),
      inputComplete: excludedMaterials.length === 0,
      excludedMaterials,
    };
    knowledge.unresolved = unresolved;
    write("customer-knowledge.json", knowledge);
    write("customer-knowledge.md", renderMarkdown(knowledge));
    write(
      "knowledge-synthesis-report.md",
      `# Knowledge synthesis\n\nStatus: ${knowledge.quality.status}\nRemote outcome: confirmed_response\nRequests: ${budget.snapshot().count}\nSearches: ${searches}\nShort sections: ${shortSections.join(", ") || "none"}\nOverlong sections: ${overlongSections.join(", ") || "none"}\nExcluded materials: ${excludedMaterials.length}\nUnresolved: ${unresolved.length}\nNo natural-language fact certification.\n`,
    );
    write("run-outcome.json", { phase: "complete", running: false });
    const sourceRecords = canonical ? canonicalSources(knowledgeInput) : [];
    const sourceKeys = [...knowledgeInput.sourceById.keys()];
    const sectionEvidence = [
      ...knowledge.sections,
      { title: "客户案例", items: knowledge.realCases },
      { title: "客户评价", items: knowledge.customerReviews },
    ]
      .filter((section) => section.items.length)
      .map((section) => ({
        title: section.title,
        kinds: [
          ...new Set(
            section.items.flatMap((item) => [
              item.kind || "fact",
              ...item.supportClasses,
              ...(item.inputRefs.some((ref) =>
                terminalSources(knowledgeInput, ref).some(
                  (id) =>
                    knowledgeInput.sourceById.get(id)?.scope ===
                    "decision_context",
                ),
              )
                ? ["industry_context"]
                : []),
            ]),
          ),
        ],
        sourceIds: [
          ...new Set(
            section.items
              .flatMap((item) =>
                item.inputRefs.flatMap((ref) =>
                  terminalSources(knowledgeInput, ref),
                ),
              )
              .map((id) => sourceRecords[sourceKeys.indexOf(id)]?.id)
              .filter(Boolean),
          ),
        ],
      }));
    return {
      directory,
      knowledge,
      stages,
      ledger,
      budget: budget.snapshot(),
      searches,
      document,
      indexWarning,
      sectionEvidence,
      researchNotes: JSON.stringify(
        {
          questions: searchNotes,
          searches: ledger
            .filter((item) => item.mode === "search")
            .map((item) => ({
              stage: item.stage,
              outcome: item.outcome,
              ...(item.code ? { code: item.code } : {}),
            })),
          unresolved: unresolved.map((item) => ({
            stage: item.stage,
            reason: item.reason,
            code: item.code,
          })),
          missing: knowledge.missingInformation.map((item) => item.text),
          cautions: knowledge.cautions.map((item) => item.text),
        },
        null,
        2,
      ),
      markdown: renderMarkdown(knowledge),
    };
  } catch (cause) {
    const safeCode =
      typeof cause?.code === "string" &&
      /^(?:GEO_|RESEARCH_|KNOWLEDGE_)[A-Z_]+$/.test(cause.code)
        ? cause.code
        : "RESEARCH_ARTIFACT_OR_RUN_FAILED";
    const failure = error(safeCode);
    failure.directory = directory;
    failure.stage = currentStage;
    failure.outcome = remoteUncertain
      ? "uncertain"
      : ledger.at(-1)?.outcome || "not_started";
    try {
      write("run-outcome.json", {
        phase: "failed",
        running: false,
        failedPhase: currentStage,
        errorCode: generationErrorCode(safeCode),
        ...(remoteUncertain ? { outcome: "uncertain" } : {}),
      });
      write(
        "run-report.md",
        `# Run report\n\nStatus: ${remoteUncertain ? "uncertain" : "failed"}\nStage: ${currentStage}\nCode: ${safeCode}\nNo automatic retry.\n`,
      );
    } catch {
      failure.reportWriteFailed = true;
    }
    throw failure;
  } finally {
    try {
      releaseLock();
    } catch {
      try {
        write("lock-cleanup-error.json", {
          code: "RESEARCH_LOCK_CLEANUP_FAILED",
        });
      } catch {
        /* Original run outcome takes precedence; stale lock requires inspection. */
      }
    }
  }
}

function replayContinuousKnowledge({ runDirectory, artifactRoot }) {
  if (
    typeof runDirectory !== "string" ||
    !/^run-[a-zA-Z0-9-]{1,80}$/.test(path.basename(runDirectory))
  )
    throw error("KNOWLEDGE_RUN_INVALID");
  const directory = fs.realpathSync(runDirectory);
  if (path.dirname(directory) !== fs.realpathSync(artifactRoot))
    throw error("KNOWLEDGE_RUN_INVALID");
  const read = (name) =>
    JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
  const start = read("run-start.json");
  if (
    start.status !== "running" ||
    !Number.isInteger(start.hardLimit) ||
    start.hardLimit > 12
  )
    throw error("KNOWLEDGE_RECOVERY_INVALID");
  const responseFile = fs.readdirSync(directory).find((name) => {
    if (!/^request-\d+-started\.json$/u.test(name)) return false;
    const started = read(name);
    return (
      started.stage === "K" &&
      fs.existsSync(path.join(directory, name.replace("started", "response")))
    );
  });
  if (!responseFile) throw error("KNOWLEDGE_RECOVERY_INVALID");
  const stored = read(responseFile.replace("started", "response"));
  let raw;
  try {
    raw = parseJsonObject(stored.text);
  } catch {
    throw error("KNOWLEDGE_RESPONSE_INVALID");
  }
  const materials = read("input/materials.json");
  const sources = [
    ...materials,
    ...read("input/accepted-public-research.json"),
  ];
  const registry = new Map(
    [...sources, ...read("input/analysis-registry.json")].map((entry) => [
      entry.id,
      entry,
    ]),
  );
  const stages = Object.fromEntries(
    CONTINUOUS_STAGES.map((definition) => [
      definition.key,
      read(`${definition.file}.json`),
    ]),
  );
  const input = directInput({
    materials,
    stages,
    sources,
    strategy: read("input/research-strategy.json"),
    unresolved: read("input/unresolved.json"),
    registry,
  });
  const { knowledge: validated } = buildKnowledge(
    Object.hasOwn(raw, "canonical")
      ? Object.fromEntries(
          Object.entries(raw).filter(([key]) => key !== "canonical"),
        )
      : raw,
    input,
    start.clientName,
    [],
  );
  const jsonPath = path.join(directory, "customer-knowledge.json");
  const markdownPath = path.join(directory, "customer-knowledge.md");
  const reportPath = path.join(directory, "knowledge-synthesis-report.md");
  if (
    !fs.existsSync(jsonPath) &&
    (fs.existsSync(markdownPath) || fs.existsSync(reportPath))
  )
    throw error("KNOWLEDGE_RECOVERY_INVALID");
  let knowledge;
  if (fs.existsSync(jsonPath)) {
    knowledge = read("customer-knowledge.json");
    const { quality, unresolved, ...storedCore } = knowledge;
    if (
      !isDeepStrictEqual(storedCore, validated) ||
      !quality ||
      !["draft", "complete"].includes(quality.status) ||
      !isDeepStrictEqual(unresolved, read("input/unresolved.json"))
    )
      throw error("KNOWLEDGE_RECOVERY_INVALID");
  } else {
    knowledge = validated;
    knowledge.quality = {
      status: "draft",
      reason: "offline_replay_requires_quality_review",
    };
    knowledge.unresolved = read("input/unresolved.json");
    fs.writeFileSync(jsonPath, JSON.stringify(knowledge, null, 2) + "\n", {
      flag: "wx",
    });
  }
  if (fs.existsSync(markdownPath) && fs.existsSync(reportPath))
    throw error("KNOWLEDGE_ALREADY_EXISTS");
  if (!fs.existsSync(markdownPath))
    fs.writeFileSync(markdownPath, renderMarkdown(knowledge), { flag: "wx" });
  if (!fs.existsSync(reportPath))
    fs.writeFileSync(
      reportPath,
      `# Knowledge synthesis\n\nStatus: ${knowledge.quality.status}\nRemote outcome: confirmed_response\nRecovery: validated_saved_response\nRemote requests added: 0\n`,
      { flag: "wx" },
    );
  return knowledge;
}

module.exports = { runContinuousKnowledge, replayContinuousKnowledge };
