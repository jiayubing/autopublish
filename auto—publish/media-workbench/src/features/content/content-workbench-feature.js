import {
  createCommandOwner,
  createQueryIdentity,
} from '../../infrastructure/query-identity/query-identity.js';

const EMPTY_CATALOG = Object.freeze({
  revision: '',
  platforms: [],
  templates: [],
  diagnostics: [],
});
const EMPTY_MANAGEMENT = Object.freeze({
  revision: 0,
  articles: Object.freeze([]),
  trash: Object.freeze([]),
  submissionBatches: Object.freeze([]),
  cancellationPlans: Object.freeze([]),
  publicationRecords: Object.freeze([]),
  workflowByArticle: Object.freeze({}),
  submissionPlatforms: Object.freeze([]),
});
const ORDINARY_COMMANDS = Object.freeze({
  createQuestion: 'client',
  updateQuestion: 'client',
  deleteQuestion: 'client',
  saveManualResearch: 'client',
  retryMaterial: 'sources',
  saveArticle: 'management',
  copyArticleVersion: 'management',
  reconcilePublication: 'management',
  previewExport: 'management',
  exportToSubmissionQueue: 'management',
  collectDoubaoQuestion: 'client',
  startPreparedDoubaoBatch: 'sources',
  pauseDoubaoBatch: 'sources',
  resumeDoubaoBatch: 'sources',
  stopDoubaoBatch: 'sources',
  retryFailedDoubao: 'sources',
  previewContentSubmissionBatch: null,
  createContentSubmissionBatch: 'management',
  cancelContentSubmissionBatch: 'management',
  previewCleanupFailedContentSubmissionItems: null,
  cleanupFailedContentSubmissionItems: 'management',
  previewContentArticleRemoval: null,
  trashContentArticles: 'management',
  getContentArticleRemovalTransaction: null,
  retryContentArticleRemovalTransaction: 'management',
  restoreContentArticle: 'management',
  preparePermanentDeleteContentArticle: null,
  permanentlyDeleteContentArticle: 'management',
  getDoubaoQueueState: null,
  getDoubaoLoginStatus: null,
  openDoubaoLogin: null,
  previewDoubaoBatch: null,
});

function safeError(value) {
  return Object.freeze({
    code:
      value && typeof value.code === 'string'
        ? value.code
        : 'CONTENT_SOURCES_QUERY_FAILED',
    category: 'internal',
    retryability: 'safe',
    userMessage:
      value instanceof Error && value.message
        ? value.message
        : '无法加载客户与模板。',
  });
}

export function createContentWorkbenchFeature(adapters = {}) {
  if (
    typeof adapters.listClients !== 'function' ||
    typeof adapters.listTemplateCatalog !== 'function' ||
    typeof adapters.listQuestions !== 'function' ||
    typeof adapters.listResearch !== 'function' ||
    typeof adapters.loadManagement !== 'function'
  ) {
    throw new TypeError('Content workbench feature dependencies are required');
  }
  const identity = createQueryIdentity({
    feature: 'content',
    query: 'workspaceSources',
  });
  const clientIdentity = createQueryIdentity({
    feature: 'content',
    query: 'clientSources',
  });
  const researchIndexIdentity = createQueryIdentity({
    feature: 'content',
    query: 'researchIndex',
  });
  const managementIdentity = createQueryIdentity({
    feature: 'content',
    query: 'articleManagement',
  });
  const commandOwners = Object.fromEntries(
    Object.keys(ORDINARY_COMMANDS).map((name) => [
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
  let clientQuery = Object.freeze({
    loading: false,
    error: null,
    reason: null,
  });
  let researchIndexQuery = Object.freeze({
    loading: false,
    error: null,
    reason: null,
  });
  let managementQuery = Object.freeze({
    loading: false,
    error: null,
    reason: null,
  });
  let questions = [];
  let research = [];
  let researchByClient = Object.freeze({});
  let management = EMPTY_MANAGEMENT;
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
      managementQuery,
      questions: Object.freeze([...questions]),
      research: Object.freeze([...research]),
      researchByClient,
      management,
      commands: Object.freeze(
        Object.fromEntries(
          Object.entries(commandOwners).map(([name, owner]) => [
            name,
            owner.getSnapshot(),
          ]),
        ),
      ),
      revision,
    });
    listeners.forEach((listener) => listener());
  };
  publish();

  const setClientQueryScope = () => {
    if (!scope || !selectedClientId) return;
    const clientScope = {
      workspaceRuntimeId: scope.workspaceRuntimeId,
      clientId: selectedClientId,
    };
    clientIdentity.setScope(clientScope);
    managementIdentity.setScope(clientScope);
  };

  const refreshSources = async (reason = 'manual') => {
    if (disposed || !scope) return false;
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
      selectedClientId = clients.some((item) => item.id === selectedClientId)
        ? selectedClientId
        : clients[0]?.id || '';
      if (
        currentArticle &&
        !clients.some((item) => item.id === currentArticle.clientId)
      )
        currentArticle = null;
      setClientQueryScope();
      query = Object.freeze({ loading: false, error: null, reason });
      revision += 1;
      publish();
      return true;
    } catch (value) {
      if (!identity.isCurrent(token)) return false;
      query = Object.freeze({
        loading: false,
        error: safeError(value),
        reason,
      });
      publish();
      return false;
    }
  };

  const refreshClientData = async (reason = 'manual') => {
    if (disposed || !scope || !selectedClientId) return false;
    const requestedClientId = selectedClientId;
    const token = clientIdentity.begin(
      {
        workspaceRuntimeId: scope.workspaceRuntimeId,
        clientId: requestedClientId,
      },
      reason,
    );
    clientQuery = Object.freeze({ loading: true, error: null, reason });
    publish();
    try {
      const [nextQuestions, nextResearch] = await Promise.all([
        adapters.listQuestions(requestedClientId),
        adapters.listResearch(requestedClientId),
      ]);
      if (
        !clientIdentity.isCurrent(token) ||
        requestedClientId !== selectedClientId
      )
        return false;
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
      if (
        !clientIdentity.isCurrent(token) ||
        requestedClientId !== selectedClientId
      )
        return false;
      clientQuery = Object.freeze({
        loading: false,
        error: safeError(value),
        reason,
      });
      publish();
      return false;
    }
  };

  const refreshResearchIndex = async (reason = 'manual') => {
    if (disposed || !scope) return false;
    const clientIds = clients.map((item) => item.id);
    const token = researchIndexIdentity.begin(
      {
        workspaceRuntimeId: scope.workspaceRuntimeId,
        clientSet: clientIds.join('|') || 'none',
      },
      reason,
    );
    researchIndexQuery = Object.freeze({ loading: true, error: null, reason });
    publish();
    try {
      const entries = await Promise.all(
        clientIds.map(async (clientId) => [
          clientId,
          await adapters.listResearch(clientId),
        ]),
      );
      if (!researchIndexIdentity.isCurrent(token)) return false;
      researchByClient = Object.freeze(
        Object.fromEntries(
          entries.map(([clientId, items]) => [
            clientId,
            Object.freeze(Array.isArray(items) ? [...items] : []),
          ]),
        ),
      );
      if (selectedClientId && researchByClient[selectedClientId])
        research = [...researchByClient[selectedClientId]];
      researchIndexQuery = Object.freeze({
        loading: false,
        error: null,
        reason,
      });
      publish();
      return true;
    } catch (value) {
      if (!researchIndexIdentity.isCurrent(token)) return false;
      researchIndexQuery = Object.freeze({
        loading: false,
        error: safeError(value),
        reason,
      });
      publish();
      return false;
    }
  };

  const refreshManagement = async (reason = 'manual') => {
    if (disposed || !scope || !selectedClientId) return false;
    const requestedClientId = selectedClientId;
    const token = managementIdentity.begin(
      {
        workspaceRuntimeId: scope.workspaceRuntimeId,
        clientId: requestedClientId,
      },
      reason,
    );
    managementQuery = Object.freeze({ loading: true, error: null, reason });
    publish();
    try {
      const next = await adapters.loadManagement(requestedClientId);
      if (
        !managementIdentity.isCurrent(token) ||
        requestedClientId !== selectedClientId
      )
        return false;
      management = Object.freeze({ ...EMPTY_MANAGEMENT, ...(next || {}) });
      managementQuery = Object.freeze({ loading: false, error: null, reason });
      publish();
      return true;
    } catch (value) {
      if (
        !managementIdentity.isCurrent(token) ||
        requestedClientId !== selectedClientId
      )
        return false;
      managementQuery = Object.freeze({
        loading: false,
        error: safeError(value),
        reason,
      });
      publish();
      return false;
    }
  };

  const refreshAfterCommand = async (name, reason = 'command-result') => {
    const target = ORDINARY_COMMANDS[name];
    if (target === 'client') {
      await Promise.all([
        refreshClientData(reason),
        refreshResearchIndex(reason),
      ]);
    } else if (target === 'sources') {
      await refreshSources(reason);
    } else if (target === 'management') {
      await refreshManagement(reason);
    }
  };

  const runCommand = async (name, input) => {
    const target = ORDINARY_COMMANDS[name];
    if (disposed || !scope || (target !== null && !selectedClientId))
      throw new Error('Content command is unavailable');
    const adapter = adapters[name];
    if (typeof adapter !== 'function')
      throw new Error(`Content command is unavailable: ${name}`);
    const owner = commandOwners[name];
    if (owner.getSnapshot().busy) return { ignored: true };
    const commandScope =
      target === null
        ? Object.freeze({ workspaceRuntimeId: scope.workspaceRuntimeId })
        : Object.freeze({
            workspaceRuntimeId: scope.workspaceRuntimeId,
            clientId: selectedClientId,
          });
    const token = owner.begin(commandScope);
    publish();
    try {
      const result = await adapter(input);
      if (!owner.isCurrent(token)) {
        await refreshAfterCommand(name, 'stale-command-result');
        return undefined;
      }
      if (
        (name === 'saveArticle' || name === 'copyArticleVersion') &&
        result?.clientId === selectedClientId
      )
        currentArticle = result;
      owner.finalize(token, { result });
      publish();
      await refreshAfterCommand(name);
      return result;
    } catch (value) {
      if (!owner.isCurrent(token)) {
        await refreshAfterCommand(name, 'stale-command-result');
        return undefined;
      }
      const error = safeError(value);
      owner.finalize(token, { error });
      publish();
      throw Object.assign(new Error(error.userMessage), error);
    }
  };

  const commands = Object.freeze(
    Object.fromEntries(
      Object.keys(ORDINARY_COMMANDS).map((name) => [
        name,
        (input) => runCommand(name, input),
      ]),
    ),
  );

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScope(nextScope) {
      if (disposed) return;
      if (
        !nextScope ||
        typeof nextScope.workspaceRuntimeId !== 'string' ||
        !nextScope.workspaceRuntimeId
      ) {
        throw new TypeError('Content workbench scope is invalid');
      }
      if (scope?.workspaceRuntimeId === nextScope.workspaceRuntimeId) return;
      scope = Object.freeze({
        workspaceRuntimeId: nextScope.workspaceRuntimeId,
      });
      identity.setScope(scope);
      clients = [];
      templateCatalog = EMPTY_CATALOG;
      selectedClientId = '';
      currentArticle = null;
      query = Object.freeze({ loading: false, error: null, reason: null });
      clientQuery = Object.freeze({
        loading: false,
        error: null,
        reason: null,
      });
      researchIndexQuery = Object.freeze({
        loading: false,
        error: null,
        reason: null,
      });
      managementQuery = Object.freeze({
        loading: false,
        error: null,
        reason: null,
      });
      questions = [];
      research = [];
      researchByClient = Object.freeze({});
      management = EMPTY_MANAGEMENT;
      Object.values(commandOwners).forEach((owner) => owner.invalidate());
      researchIndexIdentity.setScope({
        workspaceRuntimeId: scope.workspaceRuntimeId,
        clientSet: 'none',
      });
      publish();
    },
    async refresh(reason = 'manual') {
      if (!(await refreshSources(reason))) return false;
      await Promise.all([
        refreshClientData(reason),
        refreshResearchIndex(reason),
        refreshManagement(reason),
      ]);
      return true;
    },
    refreshSources,
    refreshClientData,
    refreshResearchIndex,
    refreshManagement,
    async selectClient(clientId) {
      if (
        disposed ||
        !clients.some((item) => item.id === clientId) ||
        clientId === selectedClientId
      )
        return false;
      selectedClientId = clientId;
      currentArticle = null;
      questions = [];
      research = researchByClient[clientId]
        ? [...researchByClient[clientId]]
        : [];
      management = EMPTY_MANAGEMENT;
      clientQuery = Object.freeze({
        loading: false,
        error: null,
        reason: null,
      });
      managementQuery = Object.freeze({
        loading: false,
        error: null,
        reason: null,
      });
      Object.values(commandOwners).forEach((owner) => owner.invalidate());
      setClientQueryScope();
      publish();
      await Promise.all([
        refreshClientData('scope-change'),
        refreshManagement('scope-change'),
      ]);
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
      managementIdentity.dispose();
      Object.values(commandOwners).forEach((owner) => owner.dispose());
      listeners.clear();
      scope = null;
      clients = [];
      currentArticle = null;
    },
  });
}
