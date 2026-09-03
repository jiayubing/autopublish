function serviceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isReservedDeviceName(value) {
  const baseName = value.split(".")[0].replace(/[ .]+$/g, "").toUpperCase();
  return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(baseName);
}

function isSafeId(value) {
  return typeof value === "string" && value.trim() !== "" && value !== "." && value !== ".." &&
    !value.includes("/") && !value.includes("\\") && !/[<>:"|?*\u0000-\u001F]/.test(value) &&
    !value.endsWith(" ") && !value.endsWith(".") && !isReservedDeviceName(value) &&
    !/^(?:[A-Za-z]:[\\/]|[\\/]{2})/.test(value);
}

function assertIds(input) {
  if (!input || !isSafeId(input.clientId) || !isSafeId(input.questionId)) {
    throw serviceError("DOUBAO_INVALID_ID", "Client id and question id are required and must be safe");
  }
}

function assertQuestionMatches(question, clientId, questionId) {
  if (!question || typeof question !== "object" || Array.isArray(question) || question.id !== questionId ||
      (question.clientId !== undefined && question.clientId !== clientId)) {
    throw serviceError("DOUBAO_CLIENT_QUESTION_MISMATCH", "Question does not belong to the requested client");
  }
}

function assertBatchMode(mode) {
  if (mode !== "missing" && mode !== "recollect") {
    throw serviceError("DOUBAO_BATCH_MODE_INVALID", "Batch mode must be missing or recollect");
  }
}

function assertClientIds(clientIds) {
  if (!Array.isArray(clientIds) || clientIds.length === 0) {
    throw serviceError("DOUBAO_BATCH_CLIENTS_REQUIRED", "At least one client is required");
  }
  if (clientIds.length > 500) {
    throw serviceError("DOUBAO_QUEUE_LIMIT", "Batch cannot contain more than 500 clients");
  }
  const seen = new Set();
  clientIds.forEach(function(clientId) {
    if (!isSafeId(clientId)) throw serviceError("DOUBAO_INVALID_ID", "Client id is invalid");
    if (seen.has(clientId)) throw serviceError("DOUBAO_BATCH_CLIENT_DUPLICATE", "Batch client ids must be unique");
    seen.add(clientId);
  });
}

function assertBatchTask(task) {
  if (!task || typeof task !== "object" || Array.isArray(task) ||
      !isSafeId(task.clientId) || !isSafeId(task.questionId)) {
    throw serviceError("DOUBAO_QUEUE_TASK_INVALID", "Batch task requires safe clientId and questionId");
  }
  if (Object.keys(task).some(function(key) { return ["clientId", "questionId", "force"].indexOf(key) === -1; })) {
    throw serviceError("DOUBAO_QUEUE_TASK_INVALID", "Batch task contains an unsupported field");
  }
  if (task.force !== undefined && typeof task.force !== "boolean") {
    throw serviceError("DOUBAO_FORCE_INVALID", "Force flag is invalid");
  }
}

function validateAnswer(answerText) {
  if (typeof answerText !== "string" || answerText.trim().length < 10 || answerText.trim().length > 200000) {
    throw serviceError("RESEARCH_INVALID_ANSWER", "Research answer length is invalid");
  }
}

function validateReferences(references) {
  if (!Array.isArray(references)) {
    throw serviceError("RESEARCH_INVALID_REFERENCE", "Research references must be an array");
  }
  references.forEach(function(reference) {
    if (!reference || typeof reference !== "object" || Array.isArray(reference) ||
        typeof reference.title !== "string" || !reference.title.trim() ||
        typeof reference.url !== "string" || !reference.url.trim()) {
      throw serviceError("RESEARCH_INVALID_REFERENCE", "Research reference requires title and url");
    }
    let url;
    try {
      url = new URL(reference.url);
    } catch (error) {
      throw serviceError("RESEARCH_INVALID_REFERENCE", "Research reference URL is invalid");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw serviceError("RESEARCH_INVALID_REFERENCE", "Research reference URL protocol is invalid");
    }
  });
}

function createDoubaoCollectionService(deps) {
  deps = deps || {};
  if (!deps.questionStore || typeof deps.questionStore.getQuestion !== "function" ||
      typeof deps.questionStore.listQuestions !== "function" ||
      typeof deps.questionStore.deleteQuestion !== "function" || !deps.researchStore ||
      typeof deps.researchStore.getResearch !== "function" ||
      typeof deps.researchStore.saveResearch !== "function" ||
      typeof deps.researchStore.deleteResearch !== "function" || !deps.browserAdapter ||
      typeof deps.browserAdapter.collect !== "function") {
    throw serviceError("DOUBAO_DEPENDENCY_INVALID", "Doubao collection service dependencies are incomplete");
  }

  const questionStore = deps.questionStore;
  const researchStore = deps.researchStore;
  const browserAdapter = deps.browserAdapter;
  const now = typeof deps.now === "function" ? deps.now : function() { return new Date().toISOString(); };

  function getQuestion(input) {
    assertIds(input);
    const question = questionStore.getQuestion(input.clientId, input.questionId);
    assertQuestionMatches(question, input.clientId, input.questionId);
    return question;
  }

  function getExistingResearch(clientId, questionId) {
    try {
      return researchStore.getResearch(clientId, questionId);
    } catch (error) {
      if (error && error.code === "RESEARCH_NOT_FOUND") return null;
      throw error;
    }
  }

  function normalizeQuestionText(value) {
    return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  }

  function getCurrentResearch(clientId, question) {
    const existing = getExistingResearch(clientId, question.id);
    if (!existing) return null;
    return normalizeQuestionText(existing.question) === normalizeQuestionText(question.text)
      ? existing
      : null;
  }

  function buildBatch(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw serviceError("DOUBAO_BATCH_INPUT_INVALID", "Batch input is invalid");
    }
    assertBatchMode(input.mode);
    assertClientIds(input.clientIds);

    const tasks = [];
    let skippedExisting = 0;
    let disabledQuestions = 0;
    input.clientIds.forEach(function(clientId) {
      const questions = questionStore.listQuestions(clientId);
      if (!Array.isArray(questions)) {
        throw serviceError("DOUBAO_BATCH_QUESTIONS_INVALID", "Client questions are invalid");
      }
      questions.forEach(function(question) {
        if (!question || typeof question !== "object" || !isSafeId(question.id)) {
          throw serviceError("DOUBAO_BATCH_QUESTIONS_INVALID", "Client question is invalid");
        }
        if (question.enabled !== true) {
          disabledQuestions += 1;
          return;
        }
        const existing = getCurrentResearch(clientId, question);
        if (input.mode === "missing" && existing) {
          skippedExisting += 1;
          return;
        }
        tasks.push({
          clientId: clientId,
          questionId: question.id,
          force: input.mode === "recollect"
        });
      });
    });

    if (tasks.length > 500) throw serviceError("DOUBAO_QUEUE_LIMIT", "Queue cannot contain more than 500 tasks");
    return {
      mode: input.mode,
      clientCount: input.clientIds.length,
      taskCount: tasks.length,
      skippedExisting: skippedExisting,
      disabledQuestions: disabledQuestions,
      tasks: tasks
    };
  }

  function previewBatch(input) {
    const batch = buildBatch(input);
    return {
      mode: batch.mode,
      clientCount: batch.clientCount,
      taskCount: batch.taskCount,
      skippedExisting: batch.skippedExisting,
      disabledQuestions: batch.disabledQuestions
    };
  }

  function prepareBatch(input) {
    return buildBatch(input).tasks;
  }

  async function getLoginState() {
    if (typeof browserAdapter.getLoginState !== "function") {
      throw serviceError("DOUBAO_ADAPTER_UNSUPPORTED", "Doubao adapter does not support login state");
    }
    return browserAdapter.getLoginState();
  }

  async function openLogin() {
    if (typeof browserAdapter.openLogin !== "function") {
      throw serviceError("DOUBAO_ADAPTER_UNSUPPORTED", "Doubao adapter does not support login");
    }
    return browserAdapter.openLogin();
  }

  async function collectOne(input) {
    assertIds(input);
    const question = getQuestion(input);
    if (question.enabled !== true) {
      throw serviceError("DOUBAO_QUESTION_DISABLED", "Question is disabled");
    }
    if (input.force !== undefined && typeof input.force !== "boolean") {
      throw serviceError("DOUBAO_FORCE_INVALID", "Force flag is invalid");
    }
    if (input.force !== true && getCurrentResearch(input.clientId, question)) {
      throw serviceError("DOUBAO_RESEARCH_EXISTS", "Research already exists; force is required to recollect");
    }

    const result = await browserAdapter.collect({
      clientId: input.clientId,
      question: question.text
    });
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw serviceError("DOUBAO_COLLECTION_INVALID", "Doubao collection result is invalid");
    }
    validateAnswer(result.answerText);
    validateReferences(result.references === undefined ? [] : result.references);
    const timestamp = now();
    const record = {
      id: question.id,
      question: question.text,
      answerText: result.answerText,
      references: result.references === undefined ? [] : result.references,
      collectionMethod: "automatic",
      collectedAt: result.collectedAt === undefined ? timestamp : result.collectedAt,
      updatedAt: timestamp
    };
    return researchStore.saveResearch(input.clientId, record);
  }

  function saveManual(input) {
    assertIds(input);
    const question = getQuestion(input);
    validateAnswer(input.answerText);
    validateReferences(input.references === undefined ? [] : input.references);
    const timestamp = now();
    return researchStore.saveResearch(input.clientId, {
      id: question.id,
      question: question.text,
      answerText: input.answerText,
      references: input.references === undefined ? [] : input.references,
      collectionMethod: "manual",
      collectedAt: timestamp,
      updatedAt: timestamp
    });
  }

  function deleteQuestionAndResearch(input) {
    assertIds(input);
    const question = getQuestion(input);
    const research = getExistingResearch(input.clientId, input.questionId);

    if (research) {
      let deletedResearch;
      try {
        deletedResearch = researchStore.deleteResearch(input.clientId, input.questionId);
      } catch (error) {
        throw error && error.code ? error : serviceError("DOUBAO_RESEARCH_DELETE_FAILED", "Research deletion failed");
      }
      if (deletedResearch !== true) {
        throw serviceError("DOUBAO_RESEARCH_DELETE_FAILED", "Research deletion did not remove the record");
      }
    }

    try {
      const deletedQuestion = questionStore.deleteQuestion(input.clientId, input.questionId);
      return { question: deletedQuestion, research: research };
    } catch (error) {
      if (research) {
        try {
          researchStore.saveResearch(input.clientId, research);
        } catch (restoreError) {
          const compensationError = serviceError("DOUBAO_RESEARCH_RESTORE_FAILED", "Research compensation failed after question deletion failed");
          compensationError.cause = error;
          compensationError.restoreError = restoreError;
          throw compensationError;
        }
      }
      throw error;
    }
  }

  async function close() {
    if (typeof browserAdapter.close === "function") return browserAdapter.close();
    return undefined;
  }

  return {
    previewBatch: previewBatch,
    prepareBatch: prepareBatch,
    getLoginState: getLoginState,
    openLogin: openLogin,
    collectOne: collectOne,
    saveManual: saveManual,
    deleteQuestionAndResearch: deleteQuestionAndResearch,
    close: close
  };
}

module.exports = { createDoubaoCollectionService: createDoubaoCollectionService };
