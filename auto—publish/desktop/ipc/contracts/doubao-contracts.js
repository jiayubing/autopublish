const {
  arrayField,
  defineContract,
  enumField,
  exactObject,
  integerField,
  literalField,
  multilineStringField,
  nullableField,
  optionalField,
  stringField,
} = require("./registry");

const text = (max, min = 0) =>
  stringField({ min, max, pattern: /^[^\x00-\x1f\x7f]*$/u });
const multiline = (max, min = 0) => multilineStringField({ min, max });
const id = stringField({
  min: 1,
  max: 200,
  pattern: /^(?!\.{1,2}$)(?!.*[<>:"|?*\\/])(?=\S)[^\x00-\x1f\x7f]*[^\s.]$/u,
});
const code = stringField({ min: 1, max: 128, pattern: /^[A-Z][A-Z0-9_]*$/u });
const emptyRequest = exactObject({});
const noArgs = () => ({});
const noLegacyInput = () => [undefined];
const directArgs = (args) => args[0] || {};
const directInput = (payload) => [payload];

const question = exactObject({
  id,
  text: multiline(2000, 1),
  enabled: "boolean",
  createdAt: text(64, 1),
  updatedAt: text(64, 1),
});
const reference = exactObject({
  title: text(1000),
  url: text(4096),
  snippet: optionalField(multiline(4000)),
});
const research = exactObject({
  id,
  clientId: id,
  question: optionalField(multiline(2000)),
  answerText: optionalField(multiline(100000)),
  references: arrayField(reference, { max: 1000 }),
  collectionMethod: enumField(["automatic", "manual", "legacy"]),
  collectedAt: optionalField(text(64, 1)),
  updatedAt: optionalField(text(64, 1)),
  createdAt: optionalField(text(64, 1)),
  isAnswerComplete: optionalField("boolean"),
});
const batchTask = exactObject({
  clientId: id,
  questionId: id,
  force: optionalField("boolean"),
});
const preview = exactObject({
  mode: enumField(["missing", "recollect"]),
  clientCount: integerField({ min: 0, max: 500 }),
  taskCount: integerField({ min: 0, max: 500 }),
  skippedExisting: integerField({ min: 0, max: 100000 }),
  disabledQuestions: integerField({ min: 0, max: 100000 }),
  tasks: arrayField(batchTask, { max: 500 }),
});
const taskError = exactObject({
  code,
  message: literalField("豆包采集任务失败，请检查诊断信息。"),
});
const queueTask = exactObject({
  id,
  clientId: id,
  questionId: id,
  status: enumField([
    "pending",
    "waiting_login",
    "running",
    "waiting_interval",
    "paused",
    "succeeded",
    "failed",
    "cancelled",
  ]),
  answerLength: integerField({ min: 0, max: 10000000 }),
  referenceCount: integerField({ min: 0, max: 100000 }),
  error: optionalField(nullableField(taskError)),
});
const queue = exactObject({
  status: enumField(["idle", "running", "paused", "stopping", "completed"]),
  currentTaskId: nullableField(id),
  completed: integerField({ min: 0, max: 100000 }),
  total: integerField({ min: 0, max: 100000 }),
  waitRemainingMs: integerField({ min: 0, max: 86400000 }),
  tasks: arrayField(queueTask, { max: 10000 }),
});
const login = exactObject({
  status: enumField([
    "unknown",
    "checking",
    "login_required",
    "authenticated",
    "session_error",
    "challenge",
    "page_error",
  ]),
  errorText: optionalField(
    literalField("豆包登录状态异常，请重新登录或检查诊断信息。"),
  ),
});

function projectQuestion(value) {
  return {
    id: value.id,
    text: value.text,
    enabled: value.enabled,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}
function projectReference(value) {
  const output = { title: value.title || "", url: value.url || "" };
  if (value.snippet !== undefined) output.snippet = value.snippet;
  return output;
}
function projectResearch(value) {
  const output = {
    id: value.id,
    clientId: value.clientId,
    references: Array.isArray(value.references)
      ? value.references.map(projectReference)
      : [],
    collectionMethod: value.collectionMethod,
  };
  for (const key of [
    "question",
    "answerText",
    "collectedAt",
    "updatedAt",
    "createdAt",
    "isAnswerComplete",
  ])
    if (value[key] !== undefined) output[key] = value[key];
  return output;
}
function projectQueue(value) {
  return {
    status: value.status,
    currentTaskId: value.currentTaskId == null ? null : value.currentTaskId,
    completed: value.completed,
    total: value.total,
    waitRemainingMs: value.waitRemainingMs,
    tasks: Array.isArray(value.tasks)
      ? value.tasks.map((task) => {
          const output = {
            id: task.id,
            clientId: task.clientId,
            questionId: task.questionId,
            status: task.status,
            answerLength: task.answerLength,
            referenceCount: task.referenceCount,
          };
          if (task.error !== undefined)
            output.error =
              task.error === null
                ? null
                : {
                    code:
                      typeof task.error.code === "string"
                        ? task.error.code
                        : "DOUBAO_TASK_FAILED",
                    message: "豆包采集任务失败，请检查诊断信息。",
                  };
          return output;
        })
      : [],
  };
}
function projectLogin(value) {
  const output = { status: value.status };
  if (value.errorText !== undefined)
    output.errorText = "豆包登录状态异常，请重新登录或检查诊断信息。";
  return output;
}
function projectPreview(value) {
  return {
    mode: value.mode,
    clientCount: value.clientCount,
    taskCount: value.taskCount,
    skippedExisting: value.skippedExisting,
    disabledQuestions: value.disabledQuestions,
    tasks: Array.isArray(value.tasks)
      ? value.tasks.map((task) => ({
          clientId: task.clientId,
          questionId: task.questionId,
          ...(task.force === undefined ? {} : { force: task.force }),
        }))
      : [],
  };
}

const COMMON_ERRORS = {
  AUTH_REQUIRED: {
    category: "authentication",
    retryability: "never",
    userMessage: "请先完成登录后再继续。",
  },
  IPC_REQUEST_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "豆包请求无效，请刷新页面后重试。",
  },
  IPC_RESULT_INVALID: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "豆包结果未通过安全校验，请刷新后重试。",
  },
  IPC_INTERNAL: {
    category: "internal",
    retryability: "manual-check",
    userMessage: "豆包操作未能安全完成，请检查诊断信息。",
  },
  DOUBAO_IPC_INPUT_INVALID: {
    category: "validation",
    retryability: "never",
    userMessage: "豆包请求参数无效，请检查输入。",
  },
  PLAYWRIGHT_UNAVAILABLE: {
    category: "transport",
    retryability: "manual-check",
    userMessage: "浏览器运行环境不可用，请检查运行诊断。",
  },
  PLAYWRIGHT_SESSION_NOT_OPEN: {
    category: "transport",
    retryability: "safe",
    userMessage: "豆包登录窗口当前未打开，已保留上次登录状态。",
  },
};
const errorCodes = Object.freeze(Object.keys(COMMON_ERRORS));
function contract(input) {
  return defineContract({
    feature: "content",
    ...input,
    errorCodes,
    errors: COMMON_ERRORS,
  });
}
function inputResult(name, shape) {
  return exactObject({ [name]: shape });
}

const doubaoContracts = Object.freeze([
  contract({
    capability: "content.listQuestions",
    channel: "content:list-questions",
    kind: "query",
    request: exactObject({ clientId: id }),
    success: inputResult("questions", arrayField(question, { max: 10000 })),
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contract({
    capability: "content.createQuestion",
    channel: "content:create-question",
    kind: "command",
    request: exactObject({
      clientId: id,
      text: multiline(2000, 1),
      enabled: optionalField("boolean"),
    }),
    success: inputResult("question", question),
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contract({
    capability: "content.updateQuestion",
    channel: "content:update-question",
    kind: "command",
    request: exactObject({
      clientId: id,
      questionId: id,
      text: optionalField(multiline(2000, 1)),
      enabled: optionalField("boolean"),
    }),
    success: inputResult("question", question),
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contract({
    capability: "content.deleteQuestion",
    channel: "content:delete-question",
    kind: "command",
    request: exactObject({ clientId: id, questionId: id }),
    success: inputResult("question", question),
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contract({
    capability: "content.getDoubaoLoginState",
    channel: "content:get-doubao-login-state",
    kind: "query",
    request: emptyRequest,
    success: inputResult("loginState", login),
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  contract({
    capability: "content.openDoubaoLogin",
    channel: "content:open-doubao-login",
    kind: "command",
    request: emptyRequest,
    success: inputResult("loginState", login),
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  contract({
    capability: "content.collectDoubaoOne",
    channel: "content:collect-doubao-one",
    kind: "command",
    request: exactObject({
      clientId: id,
      questionId: id,
      force: optionalField("boolean"),
    }),
    success: inputResult("research", research),
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contract({
    capability: "content.previewDoubaoBatch",
    channel: "content:preview-doubao-batch",
    kind: "query",
    request: exactObject({
      clientIds: arrayField(id, { min: 1, max: 500 }),
      mode: enumField(["missing", "recollect"]),
    }),
    success: inputResult("preview", preview),
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contract({
    capability: "content.startDoubaoBatch",
    channel: "content:start-doubao-batch",
    kind: "command",
    request: exactObject({ tasks: arrayField(batchTask, { max: 500 }) }),
    success: inputResult("queue", queue),
    fromArgs: (args) => ({ tasks: args[0] }),
    toArgs: directInput,
  }),
  contract({
    capability: "content.startPreparedDoubaoBatch",
    channel: "content:start-prepared-doubao-batch",
    kind: "command",
    request: exactObject({ tasks: arrayField(batchTask, { max: 500 }) }),
    success: inputResult("queue", queue),
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  contract({
    capability: "content.pauseDoubaoBatch",
    channel: "content:pause-doubao-batch",
    kind: "command",
    request: emptyRequest,
    success: inputResult("queue", queue),
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  contract({
    capability: "content.resumeDoubaoBatch",
    channel: "content:resume-doubao-batch",
    kind: "command",
    request: emptyRequest,
    success: inputResult("queue", queue),
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  contract({
    capability: "content.stopDoubaoBatch",
    channel: "content:stop-doubao-batch",
    kind: "command",
    request: emptyRequest,
    success: inputResult("queue", queue),
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  contract({
    capability: "content.retryFailedDoubao",
    channel: "content:retry-failed-doubao",
    kind: "command",
    request: emptyRequest,
    success: inputResult("queue", queue),
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  contract({
    capability: "content.getDoubaoQueueState",
    channel: "content:get-doubao-queue-state",
    kind: "query",
    request: emptyRequest,
    success: inputResult("queue", queue),
    fromArgs: noArgs,
    toArgs: noLegacyInput,
  }),
  contract({
    capability: "content.saveManualResearch",
    channel: "content:save-manual-research",
    kind: "command",
    request: exactObject({
      clientId: id,
      questionId: id,
      answerText: multiline(100000),
      references: optionalField(arrayField(reference, { max: 1000 })),
    }),
    success: inputResult("research", research),
    fromArgs: directArgs,
    toArgs: directInput,
  }),
  defineContract({
    capability: "content.doubaoQueueChanged",
    channel: "content:doubao-queue-state",
    feature: "content",
    kind: "event",
    event: queue,
    errorCodes: [],
  }),
]);

module.exports = {
  doubaoContracts,
  projectLogin,
  projectPreview,
  projectQuestion,
  projectQueue,
  projectResearch,
};
