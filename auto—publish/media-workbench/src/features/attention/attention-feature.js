import { createCommandOwner, createQueryIdentity } from '../../infrastructure/query-identity/query-identity.js';

function safeError(value, fallbackCode, fallbackMessage) {
  return Object.freeze({
    code: value && typeof value.code === 'string' ? value.code : fallbackCode,
    category: 'internal',
    retryability: 'safe',
    userMessage: value instanceof Error && value.message ? value.message : fallbackMessage,
  });
}

function queryState(loading = false, error = null, reason = null) {
  return Object.freeze({ loading, error, reason });
}

function fingerprintOf(data) {
  return JSON.stringify([
    data.revision,
    data.items.map((item) => [
      item.attentionId,
      item.kind,
      item.owner,
      item.freeze,
      item.resolutionPriority,
      item.allowedActions,
    ]),
  ]);
}

function featureError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function createAttentionFeature(adapters = {}) {
  for (const name of ['list', 'preview', 'execute']) {
    if (typeof adapters[name] !== 'function') throw new TypeError(`Attention feature dependency ${name} is required`);
  }
  const attentionQuery = createQueryIdentity({ feature: 'attention', query: 'articleAttention' });
  const previewOwner = createCommandOwner({ feature: 'attention', command: 'previewAction' });
  const executeOwner = createCommandOwner({ feature: 'attention', command: 'executePreview' });
  const listeners = new Set();
  let disposed = false;
  let scope = null;
  let revision = 0;
  let fingerprint = null;
  let items = [];
  let counts = { total: 0, actionable: 0 };
  let query = queryState();
  let pendingPreview = null;
  let snapshot;

  const publish = () => {
    snapshot = Object.freeze({
      scope,
      revision,
      fingerprint,
      items: Object.freeze([...items]),
      counts: Object.freeze({ ...counts }),
      query,
      commands: Object.freeze({
        preview: previewOwner.getSnapshot(),
        execute: executeOwner.getSnapshot(),
      }),
      pendingPreview,
    });
    listeners.forEach((listener) => listener());
  };
  publish();

  const feature = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setScope(nextScope) {
      if (disposed) return;
      if (!nextScope || typeof nextScope.workspaceRuntimeId !== 'string' || !nextScope.workspaceRuntimeId || typeof nextScope.clientId !== 'string' || !nextScope.clientId) throw new TypeError('Attention scope is invalid');
      if (scope?.workspaceRuntimeId === nextScope.workspaceRuntimeId && scope?.clientId === nextScope.clientId) return;
      scope = Object.freeze({ workspaceRuntimeId: nextScope.workspaceRuntimeId, clientId: nextScope.clientId });
      attentionQuery.setScope(scope);
      previewOwner.invalidate();
      executeOwner.invalidate();
      revision = 0;
      fingerprint = null;
      items = [];
      counts = { total: 0, actionable: 0 };
      query = queryState();
      pendingPreview = null;
      publish();
    },
    async refresh(reason = 'manual') {
      if (disposed || !scope) return;
      const token = attentionQuery.begin(undefined, reason);
      query = queryState(true, null, reason);
      publish();
      try {
        const data = await adapters.list(scope.clientId);
        if (!attentionQuery.isCurrent(token)) return;
        const next = {
          revision: Number.isSafeInteger(data?.revision) ? data.revision : 0,
          items: Array.isArray(data?.items) ? data.items : [],
        };
        revision = next.revision;
        items = next.items;
        counts = data?.counts || { total: items.length, actionable: 0 };
        const nextFingerprint = fingerprintOf(next);
        if (pendingPreview && pendingPreview.bindingFingerprint !== nextFingerprint) pendingPreview = null;
        fingerprint = nextFingerprint;
        query = queryState(false, null, reason);
        publish();
      } catch (value) {
        if (!attentionQuery.isCurrent(token)) return;
        query = queryState(false, safeError(value, 'ARTICLE_ATTENTION_QUERY_FAILED', '无法加载需处理项。'), reason);
        publish();
      }
    },
    replaceSnapshot(data, reason = 'submission-center-snapshot') {
      if (disposed || !scope) return false;
      attentionQuery.invalidate();
      revision = Number.isSafeInteger(data?.revision) ? data.revision : 0;
      items = Array.isArray(data?.items) ? data.items : [];
      counts = data?.counts || { total: items.length, actionable: 0 };
      const nextFingerprint = fingerprintOf({ revision, items });
      if (pendingPreview && pendingPreview.bindingFingerprint !== nextFingerprint)
        pendingPreview = null;
      fingerprint = nextFingerprint;
      query = queryState(false, null, reason);
      publish();
      return true;
    },
    async previewAction(input) {
      if (disposed || !scope) throw featureError('ARTICLE_ATTENTION_UNAVAILABLE', '需处理中心当前不可用。');
      const item = items.find((candidate) => candidate.attentionId === input?.attentionId);
      if (!item || !item.allowedActions.includes(input?.action)) throw featureError('ARTICLE_ATTENTION_ACTION_NOT_ALLOWED', '当前状态不允许这个动作。');
      const token = previewOwner.begin(scope);
      const bindingRevision = revision;
      const bindingFingerprint = fingerprint;
      pendingPreview = null;
      publish();
      try {
        const previewInput = {
          attentionId: input.attentionId,
          action: input.action,
          expectedRevision: bindingRevision,
        };
        if (input.resolutionInput) previewInput.resolutionInput = input.resolutionInput;
        const preview = await adapters.preview(previewInput);
        if (!previewOwner.isCurrent(token)) return undefined;
        if (revision !== bindingRevision || fingerprint !== bindingFingerprint || preview?.attentionId !== input.attentionId || preview?.action !== input.action || preview?.revision !== bindingRevision) {
          throw featureError('ARTICLE_ATTENTION_STALE', '状态已变化，请刷新后重新检查。');
        }
        pendingPreview = Object.freeze({ ...preview, bindingFingerprint });
        previewOwner.finalize(token, { result: pendingPreview });
        publish();
        return pendingPreview;
      } catch (value) {
        if (previewOwner.isCurrent(token)) {
          previewOwner.finalize(token, { error: safeError(value, value?.code || 'ARTICLE_ATTENTION_PREVIEW_FAILED', '无法预检需处理动作。') });
          publish();
        }
        throw value;
      }
    },
    async executePreview(preview, options = {}) {
      if (disposed || !scope) throw featureError('ARTICLE_ATTENTION_UNAVAILABLE', '需处理中心当前不可用。');
      const token = executeOwner.begin(scope);
      publish();
      try {
        const matches = pendingPreview && preview &&
          pendingPreview.attentionId === preview.attentionId &&
          pendingPreview.action === preview.action &&
          pendingPreview.revision === preview.revision &&
          pendingPreview.bindingFingerprint === preview.bindingFingerprint &&
          revision === preview.revision &&
          fingerprint === preview.bindingFingerprint;
        if (!matches) throw featureError('ARTICLE_ATTENTION_STALE', '状态已变化，请刷新后重新检查。');
        if (preview.requiresConfirmation && options.confirmed !== true) throw featureError('ARTICLE_ATTENTION_CONFIRMATION_REQUIRED', '需要确认后才能执行。');
        const executeInput = {
          attentionId: preview.attentionId,
          action: preview.action,
          expectedRevision: preview.revision,
          confirmed: preview.requiresConfirmation ? true : undefined,
        };
        if (preview.confirmationToken)
          executeInput.confirmationToken = preview.confirmationToken;
        const resolutionInput = options.resolutionInput || preview.resolutionInput;
        if (resolutionInput) executeInput.resolutionInput = resolutionInput;
        const result = await adapters.execute(executeInput);
        if (!executeOwner.isCurrent(token)) return undefined;
        await feature.refresh('command-result');
        if (!executeOwner.isCurrent(token)) return undefined;
        pendingPreview = null;
        executeOwner.finalize(token, { result });
        publish();
        return result;
      } catch (value) {
        if (executeOwner.isCurrent(token)) {
          executeOwner.finalize(token, { error: safeError(value, value?.code || 'ARTICLE_ATTENTION_EXECUTE_FAILED', '处理需处理项失败。') });
          publish();
        }
        throw value;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      attentionQuery.dispose();
      previewOwner.dispose();
      executeOwner.dispose();
      pendingPreview = null;
      listeners.clear();
    },
  };
  return Object.freeze(feature);
}
