import { createCommandOwner, createQueryIdentity } from '../../infrastructure/query-identity/query-identity.js';

const COMMAND_NAMES = Object.freeze([
  'pause',
  'stop',
  'cleanupResidue',
  'openLogin',
  'checkLogin',
  'confirmAccountProfile',
  'startGroup',
  'pauseGroup',
  'startAllGroups',
  'pauseAllGroups',
  'updateImageCount',
  'removePendingQueueItems',
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
  const candidate = value && typeof value.userMessage === 'string'
    ? value.userMessage
    : null;
  return candidate && candidate.length <= 256 &&
    !/[\\/\x00-\x1f\x7f]/.test(candidate) &&
    !/\b(?:cookie|authorization|bearer|token|api[-_ ]?key|password|secret|header|body|database|path)\b/i.test(candidate)
    ? candidate
    : fallback;
}

function errorCode(value, fallback) {
  return typeof value?.code === 'string' && /^[A-Z][A-Z0-9_]{1,127}$/.test(value.code)
    ? value.code
    : fallback;
}

function reportRefreshFailure(bridge, code) {
  if (typeof bridge.reportDiagnostic !== 'function') return;
  try {
    bridge.reportDiagnostic(code);
  } catch (_) {
    return false;
  }
  return true;
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

function regularQueueGroupViews(items, profiles, platformDisplayName) {
  const profileList = Array.isArray(profiles) ? profiles : [];
  const countByPlatform = new Map();
  profileList.forEach((profile) => {
    if (!profile?.platformId) return;
    countByPlatform.set(profile.platformId, (countByPlatform.get(profile.platformId) || 0) + 1);
  });
  return Object.freeze((Array.isArray(items) ? items : []).map((group) => {
    const profile = profileList.find((item) => item?.accountProfileId === group.accountProfileId);
    const stateLabel = group.actions?.reasonCode === 'REGULAR_QUEUE_GROUP_EMPTY'
      ? '队列为空'
      : group.runState === 'in_flight'
        ? '正在投稿'
        : group.pauseIntent === 'manual'
          ? '已手动暂停'
          : group.pauseIntent === 'system'
            ? '系统暂停'
            : '运行中';
    return Object.freeze({
      ...group,
      platformLabel: typeof platformDisplayName === 'function'
        ? platformDisplayName(group.platformId)
        : group.platformId,
      accountLabel: profile?.displayName || group.accountProfileId,
      showAccount: (countByPlatform.get(group.platformId) || 0) > 1,
      stateLabel,
    });
  }));
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
  const regularGroupQuery = createQueryIdentity({ feature: 'platform', query: 'regularQueueGroups' });
  const listeners = new Set();
  let disposed = false;
  let started = false;
  let runLifecycle = 0;
  let unsubscribeRun = null;
  let scope = null;
  let queue = EMPTY_QUEUE;
  let run = IDLE_RUN;
  let runQueryState = Object.freeze({ loading: false, error: null, reason: null });
  let loginByPlatformId = Object.freeze({});
  let accountProfiles = Object.freeze({
    items: Object.freeze([]),
    query: Object.freeze({ loading: false, error: null }),
  });
  let regularQueueGroups = Object.freeze({
    items: Object.freeze([]),
    query: Object.freeze({ loading: false, error: null }),
  });
  let error = null;
  let terminalRevision = null;
  let residue = { phase: 'idle', cleanableCount: 0, reportedCount: 0, feedback: null };
  let snapshot;

  const publish = () => {
    snapshot = Object.freeze({
      scope,
      queue,
      run,
      runQuery: runQueryState,
      loginByPlatformId,
      accountProfiles,
      regularQueueGroups,
      regularQueueGroupViews: regularQueueGroupViews(
        regularQueueGroups.items,
        accountProfiles.items,
        bridge.platformDisplayName,
      ),
      error,
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
    runQueryState = Object.freeze({ loading: false, error: null, reason: "event" });
    publish();
    if (wasActive && !isRunActive(run) && Number.isFinite(run.queueRevision)) {
      void feature.refreshTerminal(run.queueRevision).catch(() => {
        reportRefreshFailure(bridge, 'PLATFORM_TERMINAL_REFRESH_FAILED');
      });
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
      regularGroupQuery.setScope(scope);
      COMMAND_NAMES.forEach((name) => owners[name].invalidate());
      queue = EMPTY_QUEUE;
      run = IDLE_RUN;
      runQueryState = Object.freeze({ loading: false, error: null, reason: null });
      loginByPlatformId = Object.freeze({});
      accountProfiles = Object.freeze({
        items: Object.freeze([]),
        query: Object.freeze({ loading: false, error: null }),
      });
      regularQueueGroups = Object.freeze({
        items: Object.freeze([]),
        query: Object.freeze({ loading: false, error: null }),
      });
      terminalRevision = null;
      error = null;
      residue = { phase: "idle", cleanableCount: 0, reportedCount: 0, feedback: null };
      publish();
      if (started) {
        void feature.refreshRun('runtime-switch').catch(() => {
          reportRefreshFailure(bridge, 'PLATFORM_RUN_REFRESH_FAILED');
        });
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
        await feature.refreshRun('initial').catch(() => {
          reportRefreshFailure(bridge, 'PLATFORM_RUN_REFRESH_FAILED');
        });
      }
    },
    stopTransport() {
      if (!started) return;
      started = false;
      runLifecycle += 1;
      runQuery.invalidate();
      runQueryState = Object.freeze({ ...runQueryState, loading: false });
      publish();
      if (typeof unsubscribeRun === 'function') unsubscribeRun();
      unsubscribeRun = null;
    },
    async refreshRun(reason = 'manual') {
      requireScope();
      const token = runQuery.begin(undefined, reason);
      runQueryState = Object.freeze({ loading: true, error: null, reason });
      publish();
      try {
        const next = await bridge.getRunState();
        if (!runQuery.isCurrent(token)) return run;
        applyRunSnapshot(next);
        runQueryState = Object.freeze({ loading: false, error: null, reason });
        publish();
        return run;
      } catch (value) {
        if (!runQuery.isCurrent(token)) return run;
        runQueryState = Object.freeze({
          loading: false,
          error: {
            code: errorCode(value, "PLATFORM_RUN_QUERY_FAILED"),
            userMessage: message(value, "无法读取平台运行状态"),
          },
          reason,
        });
        publish();
        throw value;
      }
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
    async refreshRegularQueueGroups(reason = 'manual') {
      requireScope();
      const token = regularGroupQuery.begin(undefined, reason);
      regularQueueGroups = Object.freeze({
        ...regularQueueGroups,
        query: Object.freeze({ loading: true, error: null }),
      });
      publish();
      try {
        const items = await bridge.listRegularQueueGroups();
        if (!regularGroupQuery.isCurrent(token)) return regularQueueGroups;
        regularQueueGroups = Object.freeze({
          items: Object.freeze(Array.isArray(items) ? [...items] : []),
          query: Object.freeze({ loading: false, error: null }),
        });
        publish();
        return regularQueueGroups;
      } catch (value) {
        if (!regularGroupQuery.isCurrent(token)) return regularQueueGroups;
        regularQueueGroups = Object.freeze({
          ...regularQueueGroups,
          query: Object.freeze({
            loading: false,
            error: Object.freeze({
              code: errorCode(value, 'REGULAR_QUEUE_GROUP_QUERY_FAILED'),
              userMessage: message(value, '读取普通平台队列组失败'),
            }),
          }),
        });
        publish();
        throw value;
      }
    },
    startGroup(queueGroupId) {
      if (owners.startGroup.getSnapshot().busy) return Promise.resolve({ ignored: true });
      regularGroupQuery.invalidate();
      const pending = ownedCommand(
        owners.startGroup,
        { ...requireScope(), queueGroupId },
        () => bridge.startRegularQueueGroup({ queueGroupId }),
        '启动普通平台队列组失败',
        (items) => {
          regularGroupQuery.invalidate();
          regularQueueGroups = Object.freeze({
            items: Object.freeze(Array.isArray(items) ? [...items] : []),
            query: Object.freeze({ loading: false, error: null }),
          });
        },
      );
      void feature.refreshRegularQueueGroups('start-requested').catch(() => {
        reportRefreshFailure(bridge, 'PLATFORM_REGULAR_GROUP_REFRESH_FAILED');
      });
      return pending;
    },
    pauseGroup(queueGroupId) {
      regularGroupQuery.invalidate();
      return ownedCommand(
        owners.pauseGroup,
        { ...requireScope(), queueGroupId },
        () => bridge.pauseRegularQueueGroup({ queueGroupId }),
        '暂停普通平台队列组失败',
        (items) => {
          regularGroupQuery.invalidate();
          regularQueueGroups = Object.freeze({
            items: Object.freeze(Array.isArray(items) ? [...items] : []),
            query: Object.freeze({ loading: false, error: null }),
          });
        },
      );
    },
    startAllGroups() {
      if (owners.startAllGroups.getSnapshot().busy) return Promise.resolve({ ignored: true });
      regularGroupQuery.invalidate();
      const pending = ownedCommand(
        owners.startAllGroups,
        requireScope(),
        () => bridge.startAllRegularQueueGroups(),
        '启动全部普通平台队列组失败',
        (items) => {
          regularGroupQuery.invalidate();
          regularQueueGroups = Object.freeze({
            items: Object.freeze(Array.isArray(items) ? [...items] : []),
            query: Object.freeze({ loading: false, error: null }),
          });
        },
      );
      void feature.refreshRegularQueueGroups('start-all-requested').catch(() => {
        reportRefreshFailure(bridge, 'PLATFORM_REGULAR_GROUP_REFRESH_FAILED');
      });
      return pending;
    },
    pauseAllGroups() {
      regularGroupQuery.invalidate();
      return ownedCommand(
        owners.pauseAllGroups,
        requireScope(),
        () => bridge.pauseAllRegularQueueGroups(),
        '暂停全部普通平台队列组失败',
        (items) => {
          regularGroupQuery.invalidate();
          regularQueueGroups = Object.freeze({
            items: Object.freeze(Array.isArray(items) ? [...items] : []),
            query: Object.freeze({ loading: false, error: null }),
          });
        },
      );
    },
    updateImageCount(input) {
      if (owners.updateImageCount.getSnapshot().busy)
        return Promise.resolve({ ignored: true });
      regularGroupQuery.invalidate();
      return ownedCommand(
        owners.updateImageCount,
        { ...requireScope(), queueGroupId: input?.queueGroupId },
        () => bridge.updateRegularQueueGroupImageCount(input),
        '保存普通平台队列图片数量失败',
        (items) => {
          regularGroupQuery.invalidate();
          regularQueueGroups = Object.freeze({
            items: Object.freeze(Array.isArray(items) ? [...items] : []),
            query: Object.freeze({ loading: false, error: null }),
          });
        },
      );
    },
    removePendingQueueItems(items) {
      regularGroupQuery.invalidate();
      const pending = ownedCommand(
        owners.removePendingQueueItems,
        requireScope(),
        () => bridge.removePendingQueueItems({ items }),
        '移除普通平台队列项失败',
      );
      void pending
        .then(
          (result) => {
            if (result?.ignored) return undefined;
            return feature.refreshRegularQueueGroups('queue-item-removed');
          },
          () => undefined,
        )
        .catch(() => {
          reportRefreshFailure(bridge, 'PLATFORM_REGULAR_GROUP_REFRESH_FAILED');
        });
      return pending;
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
      const commandRuntimeId = commandScope.workspaceRuntimeId;
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
        if (disposed || scope?.workspaceRuntimeId !== commandRuntimeId) return undefined;
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
    dispose() {
      if (disposed) return;
      feature.stopTransport();
      disposed = true;
      COMMAND_NAMES.forEach((name) => owners[name].dispose());
      queueQuery.dispose();
      runQuery.dispose();
      residueQuery.dispose();
      accountProfileQuery.dispose();
      publish();
      listeners.clear();
    },
  };

  publish();
  return Object.freeze(feature);
}
