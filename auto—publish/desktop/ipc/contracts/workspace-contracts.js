const {
  defineContract,
  exactObject,
  stringField,
  enumField,
  nullableField,
} = require("./registry");

const emptyRequest = exactObject({});
const tokenRequest = exactObject({
  token: stringField({ min: 1, max: 256, pattern: /^[A-Za-z0-9._:-]+$/ }),
});
const safeLabel = stringField({
  min: 1,
  max: 80,
  pattern: /^[^\x00-\x1f\x7f\\/]+$/u,
});
const safeCode = stringField({
  min: 1,
  max: 96,
  pattern: /^[A-Z][A-Z0-9_]+$/,
});
const workspaceState = exactObject({
  state: enumField([
    "checking",
    "selection_required",
    "confirmation_required",
    "ready",
    "invalid",
    "relaunching",
  ]),
  configured: "boolean",
  environmentManaged: "boolean",
  label: safeLabel,
  selection: nullableField(
    exactObject({
      token: stringField({ min: 1, max: 256, pattern: /^[A-Za-z0-9._:-]+$/ }),
      kind: enumField([
        "existing_workspace",
        "empty_directory",
        "nonempty_directory",
      ]),
      label: safeLabel,
    }),
  ),
  errorCode: nullableField(safeCode),
  changed: nullableField("boolean"),
});

const ERROR_DETAILS = Object.freeze({
  AUTH_REQUIRED: ["authentication", "never", "请先登录后再操作工作区。"],
  IPC_REQUEST_INVALID: [
    "validation",
    "never",
    "工作区请求无效，请刷新后重试。",
  ],
  IPC_RESULT_INVALID: [
    "internal",
    "manual-check",
    "工作区结果未通过安全校验，请刷新后重试。",
  ],
  IPC_INTERNAL: [
    "internal",
    "manual-check",
    "工作区操作未能安全完成，请稍后重试。",
  ],
  WORKSPACE_SELECTION_REQUIRED: [
    "validation",
    "never",
    "尚未选择工作区，请先选择目录。",
  ],
  WORKSPACE_SELECTION_CANCELLED: [
    "conflict",
    "never",
    "已取消选择，当前工作区没有改变。",
  ],
  WORKSPACE_CONFIRMATION_REQUIRED: [
    "validation",
    "never",
    "请确认所选目录后继续。",
  ],
  WORKSPACE_PATH_INVALID: ["validation", "never", "所选目录无效，请重新选择。"],
  WORKSPACE_PATH_FORBIDDEN: [
    "validation",
    "never",
    "出于安全原因，不能使用所选目录。",
  ],
  WORKSPACE_SCHEMA_FUTURE: [
    "validation",
    "manual-check",
    "工作区由更新版本创建，请升级应用后再使用。",
  ],
  WORKSPACE_SCHEMA_OLDER_UNSUPPORTED: [
    "validation",
    "manual-check",
    "工作区版本过旧，需要显式升级后才能使用。",
  ],
  WORKSPACE_NOT_WRITABLE: [
    "validation",
    "manual-check",
    "所选目录不可写，请选择其他目录。",
  ],
  WORKSPACE_MARKER_INVALID: [
    "validation",
    "manual-check",
    "工作区标记无效，请重新选择目录。",
  ],
  WORKSPACE_SELECTION_EXPIRED: [
    "conflict",
    "safe",
    "选择已过期，请重新选择目录。",
  ],
  WORKSPACE_SWITCH_BUSY: [
    "conflict",
    "manual-check",
    "当前有任务正在运行，暂时不能切换工作区。",
  ],
  WORKSPACE_ENV_OVERRIDE: [
    "conflict",
    "never",
    "工作区由运行环境管理，暂时不能更换。",
  ],
  WORKSPACE_RELAUNCH_FAILED: [
    "internal",
    "manual-check",
    "应用重启失败，请稍后重试。",
  ],
  WORKSPACE_OPEN_FAILED: ["internal", "manual-check", "无法打开当前工作区。"],
  WORKSPACE_LOCATION_WRITE_FAILED: [
    "internal",
    "manual-check",
    "无法保存工作区设置。",
  ],
  WORKSPACE_CLEANUP_FAILED: [
    "internal",
    "manual-check",
    "工作区初始化未能完整收敛，请检查诊断信息。",
  ],
  WORKSPACE_SWITCH_STATE_UNAVAILABLE: [
    "internal",
    "manual-check",
    "暂时无法读取任务状态，请稍后重试。",
  ],
  WORKSPACE_IPC_INPUT_INVALID: [
    "validation",
    "never",
    "工作区请求无效，请刷新后重试。",
  ],
});

const errors = Object.freeze(
  Object.fromEntries(
    Object.entries(ERROR_DETAILS).map(([code, value]) => [
      code,
      Object.freeze({
        category: value[0],
        retryability: value[1],
        userMessage: value[2],
      }),
    ]),
  ),
);
const errorCodes = Object.freeze(Object.keys(errors));

function stateContract(capability, channel, kind, request, fromArgs, toArgs) {
  return defineContract({
    capability,
    channel,
    feature: "workspace",
    kind,
    request,
    success: workspaceState,
    fromArgs,
    toArgs,
    errorCodes,
    errors,
  });
}

const noArgs = () => ({});
const noLegacyInput = () => [undefined];
const workspaceContracts = Object.freeze([
  stateContract(
    "workspace.getBootstrapState",
    "workspace:get-bootstrap-state",
    "query",
    emptyRequest,
    noArgs,
    noLegacyInput,
  ),
  stateContract(
    "workspace.chooseDirectory",
    "workspace:choose-directory",
    "command",
    emptyRequest,
    noArgs,
    noLegacyInput,
  ),
  stateContract(
    "workspace.confirmSelection",
    "workspace:confirm-selection",
    "command",
    tokenRequest,
    (args) => args[0],
    (payload) => [payload],
  ),
  stateContract(
    "workspace.cancelSelection",
    "workspace:cancel-selection",
    "command",
    emptyRequest,
    noArgs,
    noLegacyInput,
  ),
  stateContract(
    "workspace.getCurrent",
    "workspace:get-current",
    "query",
    emptyRequest,
    noArgs,
    noLegacyInput,
  ),
  defineContract({
    capability: "workspace.openCurrent",
    channel: "workspace:open-current",
    feature: "workspace",
    kind: "command",
    request: emptyRequest,
    success: exactObject({ opened: "boolean" }),
    fromArgs: noArgs,
    toArgs: noLegacyInput,
    errorCodes,
    errors,
  }),
  stateContract(
    "workspace.requestSwitch",
    "workspace:request-switch",
    "command",
    emptyRequest,
    noArgs,
    noLegacyInput,
  ),
]);

module.exports = { workspaceContracts, workspaceState, errors };
