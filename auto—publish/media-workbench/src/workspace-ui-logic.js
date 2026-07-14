const ERROR_MESSAGES = Object.freeze({
  WORKSPACE_LOCATION_INVALID: '\u5df2\u4fdd\u5b58\u7684\u5de5\u4f5c\u533a\u914d\u7f6e\u65e0\u6548\uff0c\u8bf7\u91cd\u65b0\u9009\u62e9',
  WORKSPACE_SELECTION_CANCELLED: '已取消选择，当前工作区没有改变。',
  WORKSPACE_SELECTION_REQUIRED: '尚未选择工作区，请选择一个可用目录。',
  WORKSPACE_CONFIRMATION_REQUIRED: '请确认后再初始化工作区。',
  WORKSPACE_PATH_INVALID: '所选目录无效，请重新选择。',
  WORKSPACE_PATH_FORBIDDEN: '出于安全原因，不能使用该目录。',
  WORKSPACE_NOT_WRITABLE: '所选目录不可写，请选择其他目录。',
  WORKSPACE_MARKER_INVALID: '工作区标记无效，请重新选择目录。',
  WORKSPACE_SELECTION_EXPIRED: '选择已过期，请重新选择目录。',
  WORKSPACE_SWITCH_BUSY: '当前有任务正在运行，暂时不能切换工作区。',
  WORKSPACE_ENV_OVERRIDE: '工作区由环境变量控制，暂时不能更换。',
  WORKSPACE_RELAUNCH_FAILED: '应用重启失败，请稍后重试。',
  WORKSPACE_OPEN_FAILED: '无法打开当前工作区。',
  WORKSPACE_BOOTSTRAP_FAILED: '工作区状态检查失败，请重试。',
});

function errorCode(error) {
  if (!error || typeof error !== 'object') return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

export function getWorkspaceErrorCode(error) {
  return errorCode(error);
}

export function getWorkspaceErrorMessage(error) {
  const code = typeof error === 'string' ? error : errorCode(error);
  return (code && ERROR_MESSAGES[code]) || '工作区操作失败，请重试。';
}

export function getBootstrapView(state) {
  if (state?.state === 'checking') {
    return { kind: 'checking', mountsApp: false, text: '正在检查工作区…' };
  }
  if (state?.state === 'ready') {
    return { kind: 'app', mountsApp: true, text: '' };
  }
  return {
    kind: 'welcome',
    mountsApp: false,
    text: state?.error
      ? getWorkspaceErrorMessage(state.error)
      : '请选择一个工作区后继续使用应用。',
  };
}

export function createBootstrapGateController({ getBootstrapState }) {
  let state = { state: 'checking', workspacePath: null, envOverride: false };
  let startPromise = null;

  return {
    getState() {
      return state;
    },
    start() {
      if (startPromise) return startPromise;
      state = { state: 'checking', workspacePath: null, envOverride: false };
      startPromise = Promise.resolve()
        .then(() => getBootstrapState())
        .then((nextState) => {
          state = nextState;
          return state;
        })
        .catch(() => {
          state = {
            state: 'invalid',
            workspacePath: null,
            envOverride: false,
            error: { code: 'WORKSPACE_BOOTSTRAP_FAILED', message: ERROR_MESSAGES.WORKSPACE_BOOTSTRAP_FAILED },
          };
          return state;
        });
      return startPromise;
    },
  };
}

function kindLabel(kind) {
  if (kind === 'existing_workspace') return '已有工作区';
  if (kind === 'empty_directory') return '空目录';
  if (kind === 'nonempty_directory') return '非空目录';
  return '待验证目录';
}

export function getSelectionView(state) {
  const selection = state?.selection;
  const relaunching = state?.state === 'relaunching';
  const isConfirmation = state?.state === 'confirmation_required' && Boolean(selection);
  const kind = isConfirmation
    ? 'confirmation_required'
    : state?.state === 'confirmation_required'
      ? 'selection_required'
      : state?.state || 'selection_required';
  return {
    kind,
    path: selection?.path || null,
    category: selection ? kindLabel(selection.kind) : null,
    warning: selection?.kind === 'nonempty_directory'
      ? '这是非空目录。确认后将在其中创建 AutoPublish 工作区目录和必要文件，不会删除或覆盖现有文件。'
      : null,
    errorMessage: getWorkspaceErrorMessage(state?.error),
    text: relaunching ? '正在重启应用…' : '请选择一个工作区后继续使用应用。',
    chooseDisabled: relaunching,
    confirmDisabled: relaunching || !isConfirmation,
    cancelDisabled: relaunching || !isConfirmation,
  };
}

export function getSettingsCommandState({ loading, switchBusy, current, switchState }) {
  const relaunching = switchState?.state === 'relaunching';
  const envOverride = current?.envOverride === true;
  const hasWorkspacePath = Boolean(current?.workspacePath);
  return {
    openDisabled: Boolean(loading || switchBusy || relaunching || !hasWorkspacePath),
    switchDisabled: Boolean(loading || switchBusy || relaunching || envOverride),
  };
}

export function createWorkspaceSelectionController({
  initialState,
  chooseDirectory,
  confirmSelection,
  cancelSelection,
}) {
  let baseState = initialState;
  let state = initialState;

  return {
    getState() {
      return state;
    },
    reset(nextState) {
      baseState = nextState;
      state = nextState;
    },
    async chooseDirectory() {
      try {
        state = await chooseDirectory();
        return state;
      } catch (error) {
        if (errorCode(error) === 'WORKSPACE_SELECTION_CANCELLED') state = baseState;
        throw error;
      }
    },
    async confirmSelection() {
      const selection = state?.selection;
      if (!selection) return state;
      const result = await confirmSelection({ token: selection.token });
      state = {
        state: result.state,
        workspacePath: result.workspacePath,
        envOverride: result.envOverride,
      };
      return state;
    },
    async cancelSelection() {
      try {
        await cancelSelection();
        state = baseState;
        return state;
      } catch (error) {
        if (errorCode(error) === 'WORKSPACE_SELECTION_CANCELLED') state = baseState;
        throw error;
      }
    },
  };
}
