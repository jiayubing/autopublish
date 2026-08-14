import {
  createCommandOwner,
  createQueryIdentity,
} from '../../infrastructure/query-identity/query-identity.js';
import { staleContentCommandResult } from './content-command-result.js';

const EMPTY_CATALOG = Object.freeze({
  revision: '',
  platforms: [],
  templates: [],
  diagnostics: [],
});

const EMPTY_QUEUE = Object.freeze({
  status: 'idle',
  currentTaskId: null,
  completed: 0,
  total: 0,
  waitRemainingMs: 0,
  tasks: Object.freeze([]),
});

const EMPTY_LOGIN = Object.freeze({ status: 'unknown', observation: 'unavailable' });
const LOGIN_STATUSES = new Set(['unknown', 'checking', 'login_required', 'authenticated', 'session_error']);

const SOURCE_COMMANDS = Object.freeze({
  createQuestion: 'client',
  updateQuestion: 'client',
  deleteQuestion: 'client',
  saveManualResearch: 'client',
  retryMaterial: 'sources',
  saveClientLiejuPublicationProfile: 'workspaceSources',
  collectDoubaoQuestion: 'client',
  startPreparedDoubaoBatch: 'workspace',
  pauseDoubaoBatch: 'workspace',
  resumeDoubaoBatch: 'workspace',
  stopDoubaoBatch: 'workspace',
  retryFailedDoubao: 'workspace',
  getDoubaoQueueState: 'workspace',
  getDoubaoLoginStatus: 'workspace',
  openDoubaoLogin: 'workspace',
  previewDoubaoBatch: 'workspace',
});

const QUEUE_COMMANDS = new Set([
  'startPreparedDoubaoBatch',
  'pauseDoubaoBatch',
  'resumeDoubaoBatch',
  'stopDoubaoBatch',
  'retryFailedDoubao',
  'getDoubaoQueueState',
]);

const LOGIN_COMMANDS = new Set(['getDoubaoLoginStatus', 'openDoubaoLogin']);
const CLIENT_SCOPED_TARGETS = new Set(['client', 'sources']);

const CLIENT_IDENTITY = Object.freeze({
  createQuestion: (input) => [input?.clientId],
  updateQuestion: (input) => [input?.clientId],
  deleteQuestion: (input) => [input?.clientId],
  saveManualResearch: (input) => [input?.clientId],
  retryMaterial: (input) => [input?.clientId],
  collectDoubaoQuestion: (input) => [input?.clientId],
});

function safeError(value) {
  const userMessage = value && typeof value.userMessage === 'string' &&
    value.userMessage.length <= 256 &&
    !/[\\/\x00-\x1f\x7f]/.test(value.userMessage) &&
    !/\b(?:cookie|authorization|bearer|token|api[-_ ]?key|password|secret|header|body|database|path)\b/i.test(value.userMessage)
    ? value.userMessage
    : '无法加载客户与模板。';
  return Object.freeze({
    code:
      value && typeof value.code === 'string' && /^[A-Z][A-Z0-9_]{1,127}$/.test(value.code)
        ? value.code
        : 'CONTENT_SOURCES_QUERY_FAILED',
    category: 'internal',
    retryability: 'safe',
    userMessage,
  });
}

function normalizeQueue(value) {
  if (!value || typeof value !== 'object') return EMPTY_QUEUE;
  return Object.freeze({
    ...EMPTY_QUEUE,
    ...value,
    tasks: Object.freeze(
      Array.isArray(value.tasks)
        ? value.tasks.map((task) => Object.freeze({ ...task }))
        : [],
    ),
  });
}

function normalizeLogin(value) {
  if (!value || typeof value !== 'object') return EMPTY_LOGIN;
  const status = LOGIN_STATUSES.has(value.status) ? value.status : 'unknown';
  return Object.freeze({
    status,
    observation: status === 'unknown' || value.observation === 'unavailable'
      ? 'unavailable'
      : 'complete',
    ...(typeof value.errorText === 'string' ? { errorText: value.errorText } : {}),
  });
}

function queueRefreshKey(value) {
  const taskIds = Array.isArray(value?.tasks)
    ? value.tasks.map((task) => task?.id).filter(Boolean).join('|')
    : '';
  return `${value?.status || 'idle'}:${value?.completed || 0}:${value?.total || 0}:${taskIds}`;
}

function assertClientScope(name, input, selectedClientId) {
  const extract = CLIENT_IDENTITY[name];
  if (!extract) return;
  for (const clientId of extract(input)) {
    if (typeof clientId === 'string' && clientId && clientId !== selectedClientId) {
      const error = new Error('Content command client scope is invalid');
      error.code = 'CONTENT_CLIENT_SCOPE_MISMATCH';
      throw error;
    }
  }
}

export function createContentSourcesFeature(adapters = {}) {
  if (
    typeof adapters.listClients !== 'function' ||
    typeof adapters.listTemplateCatalog !== 'function' ||
    typeof adapters.listQuestions !== 'function' ||
    typeof adapters.listResearch !== 'function'
  ) {
    throw new TypeError('Content sources feature dependencies are required');
  }

  const identity = createQueryIdentity({ feature: 'content', query: 'workspaceSources' });
  const clientIdentity = createQueryIdentity({ feature: 'content', query: 'clientSources' });
  const researchIndexIdentity = createQueryIdentity({ feature: 'content', query: 'researchIndex' });
  const queueIdentity = createQueryIdentity({ feature: 'content', query: 'doubaoQueue' });
  const loginIdentity = createQueryIdentity({ feature: 'content', query: 'doubaoLogin' });
  const commandOwners = Object.fromEntries(
    Object.keys(SOURCE_COMMANDS).map((name) => [
      name,
      createCommandOwner({ feature: 'content', command: name }),
    ]),
  );
  const listeners = new Set();
  let disposed = false;
  let scope = null;
  let clients = [];
  let templateCatalog = EMPTY_CATALOG;
  let selectedClientId = '';
  let currentArticle = null;
  let query = Object.freeze({ loading: false, error: null, reason: null });
  let clientQuery = Object.freeze({ loading: false, error: null, reason: null });
  let researchIndexQuery = Object.freeze({ loading: false, error: null, reason: null });
  let questions = [];
  let research = [];
  let researchByClient = Object.freeze({});
  const researchClientVersions = new Map();
  let doubaoQueue = EMPTY_QUEUE;
  let doubaoLogin = normalizeLogin(
    typeof adapters.getCachedDoubaoLoginState === 'function'
      ? adapters.getCachedDoubaoLoginState()
      : EMPTY_LOGIN,
  );
  let doubaoQueueQuery = Object.freeze({ loading: false, error: null, reason: null });
  let doubaoLoginQuery = Object.freeze({ loading: false, error: null, reason: null });
  let previousQueueStatus = EMPTY_QUEUE.status;
  let lastQueueRefreshKey = null;
  let unsubscribeQueue = null;
  let revision = 0;
  let snapshot;

  const publish = () => {
    snapshot = Object.freeze({
      scope,
      clients: Object.freeze([...clients]),
      templateCatalog,
      selectedClientId,
      currentArticle,
      query,
      clientQuery,
      researchIndexQuery,
      questions: Object.freeze([...questions]),
      research: Object.freeze([...research]),
      researchByClient,
      doubaoQueue,
      doubaoLogin,
      doubaoQueueQuery,
      doubaoLoginQuery,
      commands: Object.freeze(
        Object.fromEntries(
          Object.entries(commandOwners).map(([name, owner]) => [name, owner.getSnapshot()]),
        ),
      ),
      revision,
    });
    listeners.forEach((listener) => listener());
  };

  const setClientQueryScope = () => {
    if (!scope || !selectedClientId) return;
    const clientScope = {
      workspaceRuntimeId: scope.workspaceRuntimeId,
      clientId: selectedClientId,
    };
    clientIdentity.setScope(clientScope);
  };

  const transitionClientScope = (nextClientId) => {
    if (nextClientId === selectedClientId) return false;
    selectedClientId = nextClientId || '';
    currentArticle = null;
    questions = [];
    research = [];
    clientQuery = Object.freeze({ loading: false, error: null, reason: null });
    Object.entries(SOURCE_COMMANDS).forEach(([name, target]) => {
      if (CLIENT_SCOPED_TARGETS.has(target)) commandOwners[name].invalidate();
    });
    if (selectedClientId) setClientQueryScope();
    else clientIdentity.invalidate();
    return true;
  };

  const clearQueueSubscription = () => {
    if (unsubscribeQueue) unsubscribeQueue();
    unsubscribeQueue = null;
  };

  const refreshCompletedQueueData = () => {
    if (disposed || !scope || !selectedClientId) return;
    void refreshClientData('doubao-complete');
    void refreshResearchIndex('doubao-complete');
  };

  const applyQueue = (value, reason = 'event', token = null) => {
    if (disposed) return false;
    if (token && !queueIdentity.isCurrent(token)) return false;
    if (!token && reason === 'event') queueIdentity.invalidate();
    const nextQueue = normalizeQueue(value);
    const wasActive = previousQueueStatus === 'running'
      || previousQueueStatus === 'paused'
      || previousQueueStatus === 'stopping';
    previousQueueStatus = nextQueue.status;
    doubaoQueue = nextQueue;
    doubaoQueueQuery = Object.freeze({ loading: false, error: null, reason });
    publish();
    if (nextQueue.status === 'completed' && (wasActive || nextQueue.total === 0)) {
      const key = queueRefreshKey(nextQueue);
      if (key !== lastQueueRefreshKey) {
        lastQueueRefreshKey = key;
        refreshCompletedQueueData();
      }
    }
    return true;
  };

  const applyLogin = (value, reason = 'command-result', token = null) => {
    if (disposed) return false;
    if (token && !loginIdentity.isCurrent(token)) return false;
    doubaoLogin = normalizeLogin(value);
    doubaoLoginQuery = Object.freeze({ loading: false, error: null, reason });
    if (typeof adapters.rememberDoubaoLoginState === 'function' &&
      adapters.rememberDoubaoLoginState(doubaoLogin) === false) {
      doubaoLogin = Object.freeze({ ...doubaoLogin, observation: 'unavailable' });
    }
    publish();
    return true;
  };

  const ensureQueueSubscription = () => {
    if (unsubscribeQueue || typeof adapters.subscribeDoubaoQueue !== 'function') return;
    unsubscribeQueue = adapters.subscribeDoubaoQueue((value) => applyQueue(value));
  };

  const refreshDoubaoQueue = async (reason = 'manual') => {
    if (disposed || !scope || typeof adapters.getDoubaoQueueState !== 'function') return false;
    const token = queueIdentity.begin(
      { workspaceRuntimeId: scope.workspaceRuntimeId },
      reason,
    );
    doubaoQueueQuery = Object.freeze({ loading: true, error: null, reason });
    publish();
    try {
      const nextQueue = await adapters.getDoubaoQueueState();
      if (!queueIdentity.isCurrent(token)) return false;
      applyQueue(nextQueue, reason, token);
      return true;
    } catch (value) {
      if (!queueIdentity.isCurrent(token)) return false;
      doubaoQueueQuery = Object.freeze({ loading: false, error: safeError(value), reason });
      publish();
      return false;
    }
  };

  const refreshSources = async (reason = 'manual', options = {}) => {
    if (disposed || !scope) return false;
    const refreshFallbackData = options.refreshFallbackData !== false;
    const token = identity.begin(undefined, reason);
    query = Object.freeze({ loading: true, error: null, reason });
    publish();
    try {
      const [nextClients, nextCatalog] = await Promise.all([
        adapters.listClients(),
        adapters.listTemplateCatalog(),
      ]);
      if (!identity.isCurrent(token)) return false;
      clients = Array.isArray(nextClients) ? nextClients : [];
      templateCatalog = nextCatalog || EMPTY_CATALOG;
      const nextSelectedClientId = clients.some((item) => item.id === selectedClientId)
        ? selectedClientId
        : clients[0]?.id || '';
      const changedClientScope = transitionClientScope(nextSelectedClientId);
      if (currentArticle && !clients.some((item) => item.id === currentArticle.clientId))
        currentArticle = null;
      setClientQueryScope();
      query = Object.freeze({ loading: false, error: null, reason });
      revision += 1;
      publish();
      if (
        changedClientScope &&
        reason !== 'initial' &&
        refreshFallbackData &&
        selectedClientId
      ) {
        const [clientResult, researchResult] = await Promise.all([
          refreshClientData(reason),
          refreshResearchIndex(reason),
        ]);
        return clientResult && researchResult;
      }
      return true;
    } catch (value) {
      if (!identity.isCurrent(token)) return false;
      query = Object.freeze({ loading: false, error: safeError(value), reason });
      publish();
      return false;
    }
  };

  const refreshClientData = async (reason = 'manual') => {
    if (disposed || !scope || !selectedClientId) return false;
    const requestedClientId = selectedClientId;
    const requestedResearchVersion = (researchClientVersions.get(requestedClientId) || 0) + 1;
    researchClientVersions.set(requestedClientId, requestedResearchVersion);
    const token = clientIdentity.begin(
      { workspaceRuntimeId: scope.workspaceRuntimeId, clientId: requestedClientId },
      reason,
    );
    clientQuery = Object.freeze({ loading: true, error: null, reason });
    publish();
    try {
      const [nextQuestions, nextResearch] = await Promise.all([
        adapters.listQuestions(requestedClientId),
        adapters.listResearch(requestedClientId),
      ]);
      if (!clientIdentity.isCurrent(token) || requestedClientId !== selectedClientId) return false;
      questions = Array.isArray(nextQuestions) ? nextQuestions : [];
      research = Array.isArray(nextResearch) ? nextResearch : [];
      researchByClient = Object.freeze({
        ...researchByClient,
        [requestedClientId]: Object.freeze([...research]),
      });
      clientQuery = Object.freeze({ loading: false, error: null, reason });
      publish();
      return true;
    } catch (value) {
      if (!clientIdentity.isCurrent(token) || requestedClientId !== selectedClientId) return false;
      clientQuery = Object.freeze({ loading: false, error: safeError(value), reason });
      publish();
      return false;
    }
  };

  const refreshResearchIndex = async (reason = 'manual') => {
    if (disposed || !scope) return false;
    const clientIds = clients.map((item) => item.id);
    const requestedResearchVersions = new Map(
      clientIds.map((clientId) => [clientId, researchClientVersions.get(clientId) || 0]),
    );
    const token = researchIndexIdentity.begin(
      { workspaceRuntimeId: scope.workspaceRuntimeId, clientSet: clientIds.join('|') || 'none' },
      reason,
    );
    researchIndexQuery = Object.freeze({ loading: true, error: null, reason });
    publish();
    try {
      const entries = await Promise.all(
        clientIds.map(async (clientId) => [clientId, await adapters.listResearch(clientId)]),
      );
      if (!researchIndexIdentity.isCurrent(token)) return false;
      researchByClient = Object.freeze(Object.fromEntries(
        entries.map(([clientId, items]) => {
          const isStillFresh = (researchClientVersions.get(clientId) || 0)
            === requestedResearchVersions.get(clientId);
          const current = researchByClient[clientId];
          return [
            clientId,
            isStillFresh
              ? Object.freeze(Array.isArray(items) ? [...items] : [])
              : current || Object.freeze([]),
          ];
        }),
      ));
      if (selectedClientId && researchByClient[selectedClientId])
        research = [...researchByClient[selectedClientId]];
      researchIndexQuery = Object.freeze({ loading: false, error: null, reason });
      publish();
      return true;
    } catch (value) {
      if (!researchIndexIdentity.isCurrent(token)) return false;
      researchIndexQuery = Object.freeze({ loading: false, error: safeError(value), reason });
      publish();
      return false;
    }
  };

  const refreshAfterCommand = async (name, reason = 'command-result') => {
    const target = SOURCE_COMMANDS[name];
    if (target === 'client') {
      await Promise.all([refreshClientData(reason), refreshResearchIndex(reason)]);
    } else if (target === 'sources') {
      await refreshSources(reason);
    } else if (target === 'workspaceSources') {
      await refreshSources(reason);
    }
  };

  const runCommand = async (name, input) => {
    const target = SOURCE_COMMANDS[name];
    if (disposed || !scope || (CLIENT_SCOPED_TARGETS.has(target) && !selectedClientId))
      throw new Error('Content command is unavailable');
    const adapter = adapters[name];
    if (typeof adapter !== 'function') throw new Error(`Content command is unavailable: ${name}`);
    assertClientScope(name, input, selectedClientId);
    const owner = commandOwners[name];
    if (owner.getSnapshot().busy) return { ignored: true };
    const commandScope = CLIENT_SCOPED_TARGETS.has(target)
      ? Object.freeze({ workspaceRuntimeId: scope.workspaceRuntimeId, clientId: selectedClientId })
      : Object.freeze({ workspaceRuntimeId: scope.workspaceRuntimeId });
    const commandClientId = selectedClientId;
    const isCommandScopeCurrent = () => Boolean(
      !disposed &&
      scope &&
      scope.workspaceRuntimeId === commandScope.workspaceRuntimeId &&
      (!CLIENT_SCOPED_TARGETS.has(target) || selectedClientId === commandClientId),
    );
    const queueToken = QUEUE_COMMANDS.has(name)
      ? queueIdentity.begin(commandScope, 'command')
      : null;
    const loginToken = LOGIN_COMMANDS.has(name)
      ? loginIdentity.begin(commandScope, 'command')
      : null;
    if (name === 'getDoubaoLoginStatus' || name === 'openDoubaoLogin') {
      doubaoLoginQuery = Object.freeze({ loading: true, error: null, reason: 'command' });
      publish();
    }
    const token = owner.begin(commandScope);
    publish();
    try {
      const result = await adapter(input);
      if (!owner.isCurrent(token)) {
        if (queueToken && queueIdentity.isCurrent(queueToken))
          applyQueue(result, 'stale-command-result', queueToken);
        if (loginToken && loginIdentity.isCurrent(loginToken))
          applyLogin(result, 'stale-command-result', loginToken);
        await refreshAfterCommand(name, 'stale-command-result');
        return staleContentCommandResult();
      }
      if (QUEUE_COMMANDS.has(name)) applyQueue(result, 'command-result', queueToken);
      if (LOGIN_COMMANDS.has(name)) applyLogin(result, 'command-result', loginToken);
      await refreshAfterCommand(name);
      if (!owner.isCurrent(token) || !isCommandScopeCurrent())
        return staleContentCommandResult();
      owner.finalize(token, { result });
      publish();
      return result;
    } catch (value) {
      if (!owner.isCurrent(token)) {
        const error = safeError(value);
        if (queueToken && queueIdentity.isCurrent(queueToken)) {
          doubaoQueueQuery = Object.freeze({ loading: false, error, reason: 'command' });
          publish();
        }
        if (loginToken && loginIdentity.isCurrent(loginToken)) {
          doubaoLoginQuery = Object.freeze({ loading: false, error, reason: 'command' });
          publish();
        }
        await refreshAfterCommand(name, 'stale-command-result');
        return staleContentCommandResult();
      }
      const error = safeError(value);
      if (LOGIN_COMMANDS.has(name)) {
        if (loginToken && !loginIdentity.isCurrent(loginToken)) return staleContentCommandResult();
        doubaoLoginQuery = Object.freeze({ loading: false, error, reason: 'command' });
        publish();
      }
      owner.finalize(token, { error });
      publish();
      throw Object.assign(new Error(error.userMessage), error);
    }
  };

  // Keep the public command surface statically named.  The scope table still
  // owns command policy, while explicit properties preserve TypeChecker
  // identity through the composed content feature.
  const commands = Object.freeze({
    createQuestion: (input) => runCommand('createQuestion', input),
    updateQuestion: (input) => runCommand('updateQuestion', input),
    deleteQuestion: (input) => runCommand('deleteQuestion', input),
    saveManualResearch: (input) => runCommand('saveManualResearch', input),
    retryMaterial: (input) => runCommand('retryMaterial', input),
    saveClientLiejuPublicationProfile: (input) => runCommand('saveClientLiejuPublicationProfile', input),
    collectDoubaoQuestion: (input) => runCommand('collectDoubaoQuestion', input),
    startPreparedDoubaoBatch: (input) => runCommand('startPreparedDoubaoBatch', input),
    pauseDoubaoBatch: (input) => runCommand('pauseDoubaoBatch', input),
    resumeDoubaoBatch: (input) => runCommand('resumeDoubaoBatch', input),
    stopDoubaoBatch: (input) => runCommand('stopDoubaoBatch', input),
    retryFailedDoubao: (input) => runCommand('retryFailedDoubao', input),
    getDoubaoQueueState: (input) => runCommand('getDoubaoQueueState', input),
    getDoubaoLoginStatus: (input) => runCommand('getDoubaoLoginStatus', input),
    openDoubaoLogin: (input) => runCommand('openDoubaoLogin', input),
    previewDoubaoBatch: (input) => runCommand('previewDoubaoBatch', input),
  });

  publish();
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScope(nextScope) {
      if (disposed) return;
      if (!nextScope || typeof nextScope.workspaceRuntimeId !== 'string' || !nextScope.workspaceRuntimeId)
        throw new TypeError('Content sources scope is invalid');
      if (scope?.workspaceRuntimeId === nextScope.workspaceRuntimeId) return;
      scope = Object.freeze({ workspaceRuntimeId: nextScope.workspaceRuntimeId });
      identity.setScope(scope);
      queueIdentity.setScope({ workspaceRuntimeId: scope.workspaceRuntimeId });
      loginIdentity.setScope({ workspaceRuntimeId: scope.workspaceRuntimeId });
      clearQueueSubscription();
      ensureQueueSubscription();
      clients = [];
      templateCatalog = EMPTY_CATALOG;
      selectedClientId = '';
      currentArticle = null;
      query = Object.freeze({ loading: false, error: null, reason: null });
      clientQuery = Object.freeze({ loading: false, error: null, reason: null });
      researchIndexQuery = Object.freeze({ loading: false, error: null, reason: null });
      questions = [];
      research = [];
      researchByClient = Object.freeze({});
      researchClientVersions.clear();
      doubaoQueue = EMPTY_QUEUE;
      previousQueueStatus = EMPTY_QUEUE.status;
      lastQueueRefreshKey = null;
      doubaoQueueQuery = Object.freeze({ loading: false, error: null, reason: null });
      doubaoLogin = normalizeLogin(
        typeof adapters.getCachedDoubaoLoginState === 'function'
          ? adapters.getCachedDoubaoLoginState()
          : EMPTY_LOGIN,
      );
      doubaoLoginQuery = Object.freeze({ loading: false, error: null, reason: null });
      Object.values(commandOwners).forEach((owner) => owner.invalidate());
      clientIdentity.invalidate();
      researchIndexIdentity.setScope({ workspaceRuntimeId: scope.workspaceRuntimeId, clientSet: 'none' });
      publish();
    },
    async refresh(reason = 'manual') {
      if (!(await refreshSources(reason, { refreshFallbackData: false }))) return false;
      const hasSelectedClient = Boolean(selectedClientId);
      const [clientResult, researchResult] = await Promise.all([
        hasSelectedClient ? refreshClientData(reason) : true,
        refreshResearchIndex(reason),
      ]);
      return clientResult && researchResult;
    },
    refreshSources,
    refreshClientData,
    refreshResearchIndex,
    refreshDoubaoQueue,
    async selectClient(clientId) {
      if (disposed || !clients.some((item) => item.id === clientId) || clientId === selectedClientId) return false;
      transitionClientScope(clientId);
      publish();
      await refreshClientData('scope-change');
      void refreshResearchIndex('scope-change');
      return true;
    },
    setCurrentArticle(article) {
      if (disposed) return false;
      if (article && article.clientId !== selectedClientId) return false;
      currentArticle = article || null;
      publish();
      return true;
    },
    commands,
    dispose() {
      if (disposed) return;
      disposed = true;
      identity.dispose();
      clientIdentity.dispose();
      researchIndexIdentity.dispose();
      queueIdentity.dispose();
      loginIdentity.dispose();
      clearQueueSubscription();
      Object.values(commandOwners).forEach((owner) => owner.dispose());
      listeners.clear();
      scope = null;
      clients = [];
      currentArticle = null;
    },
  });
}
