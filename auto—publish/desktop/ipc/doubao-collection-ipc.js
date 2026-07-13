const { wrap } = require("../services/ipc-response");
const { createDoubaoCollectionDesktopService } = require("../services/doubao-collection-service");

function ipcError(message) {
  const error = new Error(message);
  error.code = "DOUBAO_IPC_INPUT_INVALID";
  return error;
}

function isSafeId(value) {
  return typeof value === "string" && value.trim() !== "" && value !== "." && value !== ".." &&
    !value.includes("/") && !value.includes("\\") && !/[<>:"|?*\u0000-\u001F]/.test(value) &&
    !value.endsWith(" ") && !value.endsWith(".") &&
    !/^(?:[A-Za-z]:[\\/]|[\\/]{2})/.test(value);
}

function objectInput(input, keys, label) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw ipcError(label + " must be an object");
  Object.keys(input).forEach(function(key) {
    if (keys.indexOf(key) === -1) throw ipcError(label + " contains an unsupported field");
  });
  return input;
}

function idInput(input, keys, label) {
  const value = typeof input === "string" ? { clientId: input } : objectInput(input, keys, label);
  if (!isSafeId(value.clientId)) throw ipcError("Client id is invalid");
  return value;
}

function questionInput(input, keys, label) {
  const value = objectInput(input, keys, label);
  if (!isSafeId(value.clientId) || !isSafeId(value.questionId)) throw ipcError("Question ids are invalid");
  return value;
}

function optionalForce(value) {
  if (value.force !== undefined && typeof value.force !== "boolean") throw ipcError("Force flag is invalid");
}

function noInput(input, label) {
  if (input !== undefined) throw ipcError(label + " does not accept input");
}

function redactMessage(message) {
  return String(message || "Unknown error")
    .replace(/cookie\s*(?:=|:)\s*[^\s;,]+|cookie/ig, "[redacted]")
    .replace(/[A-Za-z]:[\\/][^\s"'`]+/g, "[redacted path]")
    .replace(/\\\\[^\s"'`]+/g, "[redacted path]")
    .replace(/(^|[\s(:])\/(?:[^\/\s"'`]+\/)*[^\/\s"'`]+/g, "$1[redacted path]");
}

function sanitizeOutput(value, insideError) {
  if (Array.isArray(value)) return value.map(function(item) { return sanitizeOutput(item, insideError); });
  if (!value || typeof value !== "object") return value;

  const output = {};
  Object.keys(value).forEach(function(key) {
    const childInsideError = insideError || key === "error";
    output[key] = childInsideError && key === "message" && typeof value[key] === "string"
      ? redactMessage(value[key])
      : sanitizeOutput(value[key], childInsideError);
  });
  return output;
}

function safeWrap(handler) {
  return wrap(handler).then(function(result) { return sanitizeOutput(result, false); });
}

function sanitizeQueueSubscription(service) {
  if (!service || typeof service.subscribe !== "function" || service.subscribe.__ipcOutputSanitized) return;

  const subscribe = service.subscribe;
  const wrappedSubscribe = function(listener) {
    return subscribe.call(this, function(state) {
      return listener(sanitizeOutput(state, false));
    });
  };
  wrappedSubscribe.__ipcOutputSanitized = true;
  service.subscribe = wrappedSubscribe;
}

function registerDoubaoCollectionIpc(deps) {
  const options = deps || {};
  const ipcMain = options.ipcMain;
  const service = options.doubaoCollectionService || createDoubaoCollectionDesktopService({
    workspaceRoot: options.rootDir
  });
  sanitizeQueueSubscription(service);

  ipcMain.handle("content:list-questions", function(event, input) {
    return safeWrap(function() { return service.listQuestions(idInput(input, ["clientId"], "List questions input")); });
  });
  ipcMain.handle("content:create-question", function(event, input) {
    return safeWrap(function() {
      const value = idInput(input, ["clientId", "text", "enabled"], "Create question input");
      if (typeof value.text !== "string") throw ipcError("Question text is invalid");
      if (value.enabled !== undefined && typeof value.enabled !== "boolean") throw ipcError("Question enabled state is invalid");
      return service.createQuestion(value);
    });
  });
  ipcMain.handle("content:update-question", function(event, input) {
    return safeWrap(function() {
      const value = questionInput(input, ["clientId", "questionId", "text", "enabled"], "Update question input");
      if (value.text !== undefined && typeof value.text !== "string") throw ipcError("Question text is invalid");
      if (value.enabled !== undefined && typeof value.enabled !== "boolean") throw ipcError("Question enabled state is invalid");
      return service.updateQuestion(value);
    });
  });
  ipcMain.handle("content:delete-question", function(event, input) {
    return safeWrap(function() { return service.deleteQuestion(questionInput(input, ["clientId", "questionId"], "Delete question input")); });
  });
  ipcMain.handle("content:get-doubao-login-state", function(event, input) {
    return safeWrap(function() { noInput(input, "Login state"); return service.getLoginState(); });
  });
  ipcMain.handle("content:open-doubao-login", function(event, input) {
    return safeWrap(function() { noInput(input, "Open login"); return service.openLogin(); });
  });
  ipcMain.handle("content:collect-doubao-one", function(event, input) {
    return safeWrap(function() {
      const value = questionInput(input, ["clientId", "questionId", "force"], "Collect input");
      optionalForce(value);
      return service.collectOne(value);
    });
  });
  ipcMain.handle("content:start-doubao-batch", function(event, input) {
    return safeWrap(function() {
      const value = objectInput(input, ["tasks"], "Start batch input");
      if (!Array.isArray(value.tasks) || value.tasks.length > 500) throw ipcError("Batch tasks are invalid or exceed 500 tasks");
      const tasks = value.tasks.map(function(task) {
        const item = objectInput(task, ["clientId", "questionId", "force"], "Batch task");
        if (!isSafeId(item.clientId) || !isSafeId(item.questionId)) throw ipcError("Batch task ids are invalid");
        optionalForce(item);
        return { clientId: item.clientId, questionId: item.questionId, force: item.force };
      });
      return service.startBatch(tasks);
    });
  });
  ipcMain.handle("content:pause-doubao-batch", function(event, input) {
    return safeWrap(function() { noInput(input, "Pause batch"); return service.pauseBatch(); });
  });
  ipcMain.handle("content:resume-doubao-batch", function(event, input) {
    return safeWrap(function() { noInput(input, "Resume batch"); return service.resumeBatch(); });
  });
  ipcMain.handle("content:stop-doubao-batch", function(event, input) {
    return safeWrap(function() { noInput(input, "Stop batch"); return service.stopBatch(); });
  });
  ipcMain.handle("content:retry-failed-doubao", function(event, input) {
    return safeWrap(function() { noInput(input, "Retry failed"); return service.retryFailed(); });
  });
  ipcMain.handle("content:get-doubao-queue-state", function(event, input) {
    return safeWrap(function() { noInput(input, "Queue state"); return service.getQueueState(); });
  });
  ipcMain.handle("content:save-manual-research", function(event, input) {
    return safeWrap(function() {
      const value = questionInput(input, ["clientId", "questionId", "answerText", "references"], "Manual research input");
      if (typeof value.answerText !== "string") throw ipcError("Manual answer is invalid");
      if (value.references !== undefined && !Array.isArray(value.references)) throw ipcError("Manual references are invalid");
      return service.saveManual(value);
    });
  });
}

module.exports = { registerDoubaoCollectionIpc };
