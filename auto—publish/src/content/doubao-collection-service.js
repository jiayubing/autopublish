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
    if (input.force !== true && getExistingResearch(input.clientId, input.questionId)) {
      throw serviceError("DOUBAO_RESEARCH_EXISTS", "Research already exists; force is required to recollect");
    }

    const result = await browserAdapter.collect(question.text);
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
    getLoginState: getLoginState,
    openLogin: openLogin,
    collectOne: collectOne,
    saveManual: saveManual,
    deleteQuestionAndResearch: deleteQuestionAndResearch,
    close: close
  };
}

module.exports = { createDoubaoCollectionService: createDoubaoCollectionService };
