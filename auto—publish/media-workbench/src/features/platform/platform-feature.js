import { createCommandOwner, createQueryIdentity } from '../../infrastructure/query-identity/query-identity.js';

const COMMAND_NAMES = Object.freeze([
  'submit',
  'pause',
  'stop',
  'cleanupResidue',
  'openLogin',
  'checkLogin',
  'confirmAccountProfile',
]);

const IDLE_RUN = Object.freeze({
  runId: null,
  phase: 'idle',
  total: 0,
  processed: 0,
  succeeded: 0,
  failed: 0,
  skipped: 0,
  uncertain: 0,
  currentTask: null,
  startedAt: null,
  updatedAt: null,
  terminalResult: null,
  isBatchRunning: false,
  isStopPending: false,
  isPlatformRunning: false,
  waitRemainingMs: 0,
});

const EMPTY_QUEUE = Object.freeze({
  revision: 0,
  queue: Object.freeze([]),
  platforms: Object.freeze([]),
  counts: Object.freeze({ actionable: 0, attention: 0, total: 0 }),
  loading: false,
  error: null,
});

function message(value, fallback) {
  return value instanceof Error && value.message ? value.message : fallback;
}

function errorCode(value, fallback) {
  return typeof value?.code === 'string' && value.code ? value.code : fallback;
}

function timestamp(value) {
  const parsed = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function isRunActive(value) {
  return Boolean(value?.isPlatformRunning) || ['running', 'waiting-interval', 'stopping'].includes(value?.phase);
}

function isAttentionItem(article) {
  return Boolean(article?.archiveErrorCode) || article?.sourceArticleState === 'missing' || article?.sourceArticleState === 'trashed';
}

function queueSnapshot(data, previousRevision) {
  const queue = Array.isArray(data?.queue) ? data.queue : [];
  const platforms = Array.isArray(data?.platforms) ? data.platforms : [];
  const sourceRevision = Number.isFinite(data?.revision) ? data.revision : null;
  const revision = sourceRevision === null
    ? previousRevision + 1
    : Math.max(previousRevision + 1, sourceRevision);
  const attention = queue.filter(isAttentionItem).length;
  return Object.freeze({
    revision,
    queue,
    platforms,
    counts: Object.freeze({ actionable: queue.length - attention, attention, total: queue.length }),
    loading: false,
    error: null,
  });
}

function residueFeedback(result, report) {
  const cleanedCount = Number(result.cleanedCount) || 0;
  const failedCount = Number(result.failedCount ?? result.failedItems?.length ?? 0) || 0;
  const remainingCount = Number(result.remainingCount ?? (report.cleanableCount + report.reportedCount)) || 0;
  if (failedCount > 0 || cleanedCount === 0) {
    return {
      kind: 'error',
      text: cleanedCount > 0
        ? `部分清理：已清理 ${cleanedCount} 项，仍有 ${Math.max(failedCount, remainingCount)} 项未清理。`
        : `未清理任何残留项。仍有 ${Math.max(failedCount, remainingCount)} 项需要处理。`,
    };
  }
  return { kind: 'status', text: `已清理 ${cleanedCount} 项已删除源文章队列残留。` };
}

export function createPlatformFeature(bridge = {}) {
  const owners = Object.fromEntries(
    COMMAND_NAMES.map((name) => [name, createCommandOwner({ feature: 'platform', command: name })]),
  );
  const queueQuery = createQueryIdentity({ feature: 'platform', query: 'queue' });
  const runQuery = createQueryIdentity({ feature: 'platform', query: 'run' });
  const residueQuery = createQueryIdentity({ feature: 'platform', query: 'queueResidue' });
  const accountProfileQuery = createQueryIdentity({ feature: 'platform', query: 'accountProfiles' });
  const listeners = new Set();
  let disposed = false;
  let started = false;
  let runLifecycle = 0;
  let unsubscribeRun = null;
  let scope = null;
  let queue = EMPTY_QUEUE;
  let run = IDLE_RUN;
  let loginByPlatformId = Object.freeze({});
  let accountProfiles = Object.freeze({
    items: Object.freeze([]),
    query: Object.freeze({ loading: false, error: null }),
  });
  let selectedArticles = new Set();
  let selectedPlatformIds = new Set();
  let error = null;
  let result = null;
  let showResult = false;
  let terminalRevision = null;
  let residue = { phase: 'idle', cleanableCount: 0, reportedCount: 0, feedback: null };
  let snapshot;

  const publish = () => {
    snapshot = Object.freeze({
      scope,
      queue,
      run,
      loginByPlatformId,
      accountProfiles,
      selectedArticles,
      selectedPlatformIds,
      error,
      result,
      showResult,
      terminalRevision,
      commands: Object.freeze(
        Object.fromEntries(COMMAND_NAMES.map((name) => [name, owners[name].getSnapshot()])),
      ),
      residue: Object.freeze({ ...residue }),
    });
    listeners.forEach((listener) => listener());
  };

  const updateResidue = (patch) => {
    residue = { ...residue, ...patch };
    publish();
  };

  function requireScope() {
    if (disposed || !scope) throw new Error('Platform feature is unavailable');
    return scope;
  }

  function applyRunSnapshot(nextRun) {
    if (disposed || !scope || !nextRun || typeof nextRun !== 'object') return false;
    if (nextRun.workspaceRuntimeId !== scope.workspaceRuntimeId) return false;
    const incoming = { ...IDLE_RUN, ...nextRun };
    if (run.runId && incoming.runId && run.runId !== incoming.runId) {
      if (isRunActive(run) || timestamp(incoming.updatedAt) <= timestamp(run.updatedAt)) return false;
    } else if (run.runId && incoming.runId === run.runId && timestamp(incoming.updatedAt) < timestamp(run.updatedAt)) {
      return false;
    }
    if (run.runId === incoming.runId && timestamp(incoming.updatedAt) === timestamp(run.updatedAt) && incoming.phase === 'heartbeat') {
      return false;
    }
    const wasActive = isRunActive(run);
    run = Object.freeze({ ...run, ...incoming });
    publish();
    if (wasActive && !isRunActive(run) && Number.isFinite(run.queueRevision)) {
      void feature.refreshTerminal(run.queueRevision).catch(() => undefined);
    }
    return true;
  }

  async function ownedCommand(owner, commandScope, operation, fallback, onSuccess, onFailure) {
    requireScope();
    if (owner.getSnapshot().busy) return { ignored: true };
    const token = owner.begin(commandScope);
    publish();
    try {
      const next = await operation();
      if (!owner.isCurrent(token)) return undefined;
      if (onSuccess) onSuccess(next);
      owner.finalize(token, { result: next });
      publish();
      return next;
    } catch (value) {
      if (!owner.isCurrent(token)) return undefined;
      const userMessage = message(value, fallback);
      error = userMessage;
      if (onFailure) onFailure(userMessage);
      owner.finalize(token, {
        error: { code: errorCode(value, 'PLATFORM_COMMAND_FAILED'), userMessage },
      });
      publish();
      throw value;
    }
  }

  const feature = {
    getState: () => snapshot,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScope(nextScope) {
      if (disposed) return false;
      if (!nextScope || typeof nextScope.workspaceRuntimeId !== 'string' || !nextScope.workspaceRuntimeId) {
        throw new TypeError('Platform scope is invalid');
      }
      if (scope?.workspaceRuntimeId === nextScope.workspaceRuntimeId) return false;
      scope = Object.freeze({ workspaceRuntimeId: nextScope.workspaceRuntimeId });
      queueQuery.setScope(scope);
      runQuery.setScope(scope);
      residueQuery.setScope(scope);
      accountProfileQuery.setScope(scope);
      COMMAND_NAMES.forEach((name) => owners[name].invalidate());
      queue = EMPTY_QUEUE;
      run = IDLE_RUN;
      loginByPlatformId = Object.freeze({});
      accountProfiles = Object.freeze({
        items: Object.freeze([]),
        query: Object.freeze({ loading: false, error: null }),
      });
      selectedArticles = new Set();
      selectedPlatformIds = new Set();
      result = null;
      showResult = false;
      terminalRevision = null;
      error = null;
      publish();
      if (started) {
        void feature.refreshRun('runtime-switch').catch(() => undefined);
      }
      return true;
    },
    async start() {
      if (disposed) throw new Error('Platform feature is disposed');
      if (started) return;
      started = true;
      const lifecycle = ++runLifecycle;
      unsubscribeRun = typeof bridge.onRunState === 'function'
        ? bridge.onRunState((next) => {
          if (!started || disposed || lifecycle !== runLifecycle) return;
          runQuery.invalidate();
          applyRunSnapshot(next);
        })
        : null;
      if (scope) {
        await feature.refreshRun('initial').catch(() => undefined);
      }
    },
    stopTransport() {
      if (!started) return;
      started = false;
      runLifecycle += 1;
      runQuery.invalidate();
      if (typeof unsubscribeRun === 'function') unsubscribeRun();
      unsubscribeRun = null;
    },
    async refreshRun(reason = 'manual') {
      requireScope();
      const token = runQuery.begin(undefined, reason);
      const next = await bridge.getRunState();
      if (!runQuery.isCurrent(token)) return run;
      applyRunSnapshot(next);
      return run;
    },
    applyRunSnapshot,
    async refreshQueue(reason = 'manual') {
      requireScope();
      const token = queueQuery.begin(undefined, reason);
      queue = Object.freeze({ ...queue, loading: true, error: null });
      publish();
      try {
        const data = await bridge.loadQueue(reason);
        if (!queueQuery.isCurrent(token)) return queue;
        if (Number.isFinite(data?.revision) && data.revision < queue.revision) return queue;
        queue = queueSnapshot(data, queue.revision);
        publish();
        return queue;
      } catch (value) {
        if (!queueQuery.isCurrent(token)) return queue;
        queue = Object.freeze({ ...queue, loading: false, error: message(value, '无法加载投稿队列') });
        publish();
        throw value;
      }
    },
    async refreshAccountProfiles(reason = 'manual') {
      requireScope();
      const token = accountProfileQuery.begin(undefined, reason);
      accountProfiles = Object.freeze({
        ...accountProfiles,
        query: Object.freeze({ loading: true, error: null }),
      });
      publish();
      try {
        const items = await bridge.listAccountProfiles();
        if (!accountProfileQuery.isCurrent(token)) return accountProfiles;
        accountProfiles = Object.freeze({
          items: Object.freeze(Array.isArray(items) ? [...items] : []),
          query: Object.freeze({ loading: false, error: null }),
        });
        publish();
        return accountProfiles;
      } catch (value) {
        if (!accountProfileQuery.isCurrent(token)) return accountProfiles;
        accountProfiles = Object.freeze({
          ...accountProfiles,
          query: Object.freeze({
            loading: false,
            error: Object.freeze({
              code: errorCode(value, 'ACCOUNT_PROFILE_LIST_FAILED'),
              userMessage: message(value, '读取平台账号档案失败'),
            }),
          }),
        });
        publish();
        throw value;
      }
    },
    submit(input) {
      error = null;
      result = null;
      return ownedCommand(
        owners.submit,
        requireScope(),
        () => bridge.submit(input),
        'Submission failed',
        (next) => { result = next; showResult = true; error = null; },
      );
    },
    pause(runId) {
      return ownedCommand(owners.pause, requireScope(), () => bridge.pause(runId), 'Unable to pause submission');
    },
    stop(runId) {
      return ownedCommand(owners.stop, requireScope(), () => bridge.stop(runId), 'Unable to stop submission');
    },
    async refreshTerminal(revision, options = {}) {
      if (!Number.isFinite(revision) || terminalRevision === revision || queue.revision === revision || disposed) return false;
      terminalRevision = revision;
      publish();
      if (options.queryInFlight === true || queue.loading) return false;
      await feature.refreshQueue('submit-terminal');
      return true;
    },
    async inspectResidue() {
      requireScope();
      if (residue.phase === 'checking' || residue.phase === 'cleaning') return { ignored: true };
      const token = residueQuery.begin(undefined, 'manual');
      updateResidue({ phase: 'checking', feedback: null });
      try {
        const report = await bridge.previewResidue();
        if (residueQuery.isCurrent(token)) {
          updateResidue({
            phase: report.cleanableCount ? 'awaiting-confirmation' : 'idle',
            cleanableCount: report.cleanableCount || 0,
            reportedCount: report.reportedCount || 0,
          });
        }
        return report;
      } catch (value) {
        if (residueQuery.isCurrent(token)) {
          updateResidue({ phase: 'idle', feedback: { kind: 'error', text: message(value, '无法检查已删除文章队列残留') } });
        }
        throw value;
      }
    },
    async cleanupResidue({ confirmed } = {}) {
      const commandScope = requireScope();
      if (!confirmed || owners.cleanupResidue.getSnapshot().busy) return { ignored: true };
      const token = owners.cleanupResidue.begin(commandScope);
      updateResidue({ phase: 'cleaning', feedback: { kind: 'status', text: '清理中…' } });
      try {
        const cleaned = await bridge.cleanupResidue();
        if (!owners.cleanupResidue.isCurrent(token)) return undefined;
        const report = await bridge.previewResidue();
        if (!owners.cleanupResidue.isCurrent(token)) return undefined;
        owners.cleanupResidue.finalize(token, { result: cleaned });
        residue = {
          phase: 'idle',
          cleanableCount: report.cleanableCount || 0,
          reportedCount: report.reportedCount || 0,
          feedback: residueFeedback(cleaned, report),
        };
        publish();
        await feature.refreshQueue('residue-cleanup');
        return cleaned;
      } catch (value) {
        if (owners.cleanupResidue.isCurrent(token)) {
          owners.cleanupResidue.finalize(token, {
            error: {
              code: errorCode(value, 'PLATFORM_RESIDUE_CLEANUP_FAILED'),
              userMessage: message(value, '清理服务返回失败'),
            },
          });
          updateResidue({
            phase: 'idle',
            feedback: { kind: 'error', text: `已删除文章队列残留清理失败。原因：${message(value, '清理服务返回失败')}` },
          });
        }
        throw value;
      }
    },
    openLogin(platformId) {
      if (owners.openLogin.getSnapshot().busy) return Promise.resolve({ ignored: true });
      const commandScope = { ...requireScope(), platformId };
      loginByPlatformId = Object.freeze({
        ...loginByPlatformId,
        [platformId]: Object.freeze({ busy: true, message: '正在打开登录页...' }),
      });
      return ownedCommand(
        owners.openLogin,
        commandScope,
        () => bridge.openLogin(platformId),
        '登录页打开失败',
        () => {
          loginByPlatformId = Object.freeze({
            ...loginByPlatformId,
            [platformId]: Object.freeze({ busy: false, message: '登录页已打开，请完成登录后点击检查登录' }),
          });
        },
        (userMessage) => {
          loginByPlatformId = Object.freeze({
            ...loginByPlatformId,
            [platformId]: Object.freeze({ busy: false, message: userMessage, authenticated: false }),
          });
        },
      );
    },
    checkLogin(platformId) {
      if (owners.checkLogin.getSnapshot().busy) return Promise.resolve({ ignored: true });
      const commandScope = { ...requireScope(), platformId };
      loginByPlatformId = Object.freeze({
        ...loginByPlatformId,
        [platformId]: Object.freeze({ busy: true, message: '正在检查登录状态...' }),
      });
      return ownedCommand(
        owners.checkLogin,
        commandScope,
        () => bridge.checkLogin(platformId),
        '登录检查失败',
        (authenticated) => {
          loginByPlatformId = Object.freeze({
            ...loginByPlatformId,
            [platformId]: Object.freeze({
              busy: false,
              message: authenticated ? '已登录，会话已保存' : '尚未检测到登录',
              authenticated,
            }),
          });
        },
        (userMessage) => {
          loginByPlatformId = Object.freeze({
            ...loginByPlatformId,
            [platformId]: Object.freeze({ busy: false, message: userMessage, authenticated: false }),
          });
        },
      );
    },
    confirmAccountProfile(input) {
      const commandScope = { ...requireScope(), platformId: input?.platformId || 'unknown' };
      return ownedCommand(
        owners.confirmAccountProfile,
        commandScope,
        () => bridge.confirmAccountProfile(input),
        '确认平台账号档案失败',
        (profile) => {
          const byId = new Map(accountProfiles.items.map((item) => [item.accountProfileId, item]));
          if (profile?.accountProfileId) byId.set(profile.accountProfileId, profile);
          accountProfiles = Object.freeze({
            items: Object.freeze([...byId.values()]),
            query: Object.freeze({ loading: false, error: null }),
          });
        },
      );
    },
    setError(next) { error = next; publish(); },
    dismissResult() { showResult = false; result = null; publish(); },
    toggleArticle(key) {
      const next = new Set(selectedArticles);
      if (next.has(key)) next.delete(key); else next.add(key);
      selectedArticles = next;
      publish();
    },
    togglePlatform(id) {
      const next = new Set(selectedPlatformIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      selectedPlatformIds = next;
      publish();
    },
    replaceArticles(keys) { selectedArticles = new Set(keys); publish(); },
    selectGroup(keys, allSelected) {
      const next = new Set(selectedArticles);
      keys.forEach((key) => { if (allSelected) next.delete(key); else next.add(key); });
      selectedArticles = next;
      publish();
    },
    pruneArticles(validKeys) {
      selectedArticles = new Set([...selectedArticles].filter((key) => validKeys.has(key)));
      publish();
    },
    dispose() {
      if (disposed) return;
      feature.stopTransport();
      disposed = true;
      COMMAND_NAMES.forEach((name) => owners[name].dispose());
      queueQuery.dispose();
      runQuery.dispose();
      residueQuery.dispose();
      accountProfileQuery.dispose();
      result = null;
      showResult = false;
      publish();
      listeners.clear();
    },
  };

  publish();
  return Object.freeze(feature);
}
