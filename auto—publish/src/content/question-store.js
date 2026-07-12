const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function questionError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertPathSegment(value, code, label) {
  if (typeof value !== "string" || !value || value === "." || value === ".." ||
      value.includes("/") || value.includes("\\") || path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw questionError(code, "Invalid " + label);
  }
}

function normalizeText(text) {
  return text.trim().replace(/\s+/g, " ");
}

function validateText(text) {
  if (typeof text !== "string") throw questionError("QUESTION_TEXT_INVALID", "Question text is invalid");
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 2000) {
    throw questionError("QUESTION_TEXT_INVALID", "Question text is invalid");
  }
  return trimmed;
}

function validateQuestion(question) {
  if (!question || typeof question !== "object" || Array.isArray(question)) {
    throw questionError("QUESTION_INVALID", "Question is invalid");
  }
  assertPathSegment(question.id, "QUESTION_ID_INVALID", "question id");
  const text = validateText(question.text);
  if (typeof question.enabled !== "boolean") throw questionError("QUESTION_ENABLED_INVALID", "Question enabled state is invalid");
  if (typeof question.createdAt !== "string" || !question.createdAt) {
    throw questionError("QUESTION_INVALID", "Question createdAt is invalid");
  }
  if (question.updatedAt !== undefined && (typeof question.updatedAt !== "string" || !question.updatedAt)) {
    throw questionError("QUESTION_INVALID", "Question updatedAt is invalid");
  }
  const normalized = {
    id: question.id,
    text: text,
    enabled: question.enabled,
    createdAt: question.createdAt
  };
  if (question.updatedAt !== undefined) normalized.updatedAt = question.updatedAt;
  return normalized;
}

function createQuestionStore(workspaceRoot, options) {
  options = options || {};
  const root = path.resolve(workspaceRoot);
  const clientsRoot = path.join(root, "clients");
  const createId = typeof options.createId === "function" ? options.createId : function() { return crypto.randomUUID(); };
  const now = typeof options.now === "function" ? options.now : function() { return new Date().toISOString(); };

  function clientDirectory(clientId) {
    assertPathSegment(clientId, "CLIENT_ID_INVALID", "client id");
    return path.join(clientsRoot, clientId);
  }

  function questionsPath(clientId) {
    return path.join(clientDirectory(clientId), "questions.json");
  }

  function validateDocument(document) {
    if (!document || typeof document !== "object" || Array.isArray(document) || document.version !== 1 || !Array.isArray(document.questions) ||
        Object.keys(document).some(function(key) { return key !== "version" && key !== "questions"; })) {
      throw questionError("QUESTION_INVALID_JSON", "Questions JSON is invalid");
    }
    const questions = document.questions.map(function(question) { return validateQuestion(question); });
    const ids = new Set();
    const normalizedTexts = new Set();
    questions.forEach(function(question) {
      if (ids.has(question.id)) throw questionError("QUESTION_INVALID_JSON", "Questions JSON contains duplicate ids");
      if (normalizedTexts.has(normalizeText(question.text))) throw questionError("QUESTION_INVALID_JSON", "Questions JSON contains duplicate text");
      ids.add(question.id);
      normalizedTexts.add(normalizeText(question.text));
    });
    return questions;
  }

  function writeAtomic(filename, document) {
    const temporary = filename + ".tmp-" + process.pid + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    const backup = filename + ".bak-" + process.pid + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
    let movedExisting = false;
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    try {
      fs.writeFileSync(temporary, JSON.stringify(document, null, 2) + "\n", "utf8");
      try {
        fs.renameSync(filename, backup);
        movedExisting = true;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      try {
        fs.renameSync(temporary, filename);
      } catch (error) {
        if (movedExisting) fs.renameSync(backup, filename);
        throw error;
      }
      if (movedExisting) fs.unlinkSync(backup);
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
      if (fs.existsSync(backup) && fs.existsSync(filename)) fs.unlinkSync(backup);
    }
  }

  function readDocument(clientId) {
    const filename = questionsPath(clientId);
    if (!fs.existsSync(filename)) return null;
    let document;
    try {
      document = JSON.parse(fs.readFileSync(filename, "utf8"));
    } catch (error) {
      const invalid = questionError("QUESTION_INVALID_JSON", "Questions JSON is invalid");
      invalid.cause = error;
      throw invalid;
    }
    return validateDocument(document);
  }

  function importLegacyQuestions(clientId) {
    const directory = clientDirectory(clientId);
    const legacyPath = path.join(directory, "search_query.txt");
    let questions = [];
    if (fs.existsSync(legacyPath)) {
      const text = fs.readFileSync(legacyPath, "utf8").replace(/^\uFEFF/, "");
      if (text.trim()) {
        const timestamp = now();
        questions = [{
          id: createId(),
          text: validateText(text),
          enabled: true,
          createdAt: timestamp,
          updatedAt: timestamp
        }];
      }
    }
    if (!questions.length) return questions;
    validateDocument({ version: 1, questions: questions });
    writeAtomic(questionsPath(clientId), { version: 1, questions: questions });
    return questions;
  }

  function loadQuestions(clientId) {
    const existing = readDocument(clientId);
    return existing || importLegacyQuestions(clientId);
  }

  function listQuestions(clientId) {
    return loadQuestions(clientId).map(function(question) { return Object.assign({}, question); });
  }

  function getQuestion(clientId, questionId) {
    assertPathSegment(questionId, "QUESTION_ID_INVALID", "question id");
    const question = loadQuestions(clientId).find(function(item) { return item.id === questionId; });
    if (!question) throw questionError("QUESTION_NOT_FOUND", "Question was not found");
    return Object.assign({}, question);
  }

  function createQuestion(clientId, input) {
    const questions = loadQuestions(clientId);
    const text = validateText(input && input.text);
    const normalized = normalizeText(text);
    if (questions.some(function(question) { return normalizeText(question.text) === normalized; })) {
      throw questionError("QUESTION_DUPLICATE", "Question already exists");
    }
    const id = createId();
    assertPathSegment(id, "QUESTION_ID_INVALID", "question id");
    if (questions.some(function(question) { return question.id === id; })) {
      throw questionError("QUESTION_ID_DUPLICATE", "Question id already exists");
    }
    const timestamp = now();
    const question = validateQuestion({
      id: id,
      text: text,
      enabled: input && input.enabled === undefined ? true : input.enabled,
      createdAt: timestamp,
      updatedAt: timestamp
    });
    questions.push(question);
    writeAtomic(questionsPath(clientId), { version: 1, questions: questions });
    return Object.assign({}, question);
  }

  function updateQuestion(clientId, questionId, changes) {
    assertPathSegment(questionId, "QUESTION_ID_INVALID", "question id");
    const questions = loadQuestions(clientId);
    const index = questions.findIndex(function(question) { return question.id === questionId; });
    if (index < 0) throw questionError("QUESTION_NOT_FOUND", "Question was not found");
    changes = changes || {};
    const current = questions[index];
    const text = changes.text === undefined ? current.text : validateText(changes.text);
    const enabled = changes.enabled === undefined ? current.enabled : changes.enabled;
    if (typeof enabled !== "boolean") throw questionError("QUESTION_ENABLED_INVALID", "Question enabled state is invalid");
    const normalized = normalizeText(text);
    if (questions.some(function(question, itemIndex) {
      return itemIndex !== index && normalizeText(question.text) === normalized;
    })) throw questionError("QUESTION_DUPLICATE", "Question already exists");
    const updated = validateQuestion(Object.assign({}, current, {
      text: text,
      enabled: enabled,
      updatedAt: now()
    }));
    questions[index] = updated;
    writeAtomic(questionsPath(clientId), { version: 1, questions: questions });
    return Object.assign({}, updated);
  }

  function deleteQuestion(clientId, questionId) {
    assertPathSegment(questionId, "QUESTION_ID_INVALID", "question id");
    const questions = loadQuestions(clientId);
    const index = questions.findIndex(function(question) { return question.id === questionId; });
    if (index < 0) throw questionError("QUESTION_NOT_FOUND", "Question was not found");
    const deleted = questions.splice(index, 1)[0];
    writeAtomic(questionsPath(clientId), { version: 1, questions: questions });
    return Object.assign({}, deleted);
  }

  return { listQuestions, getQuestion, createQuestion, updateQuestion, deleteQuestion };
}

module.exports = { createQuestionStore };
