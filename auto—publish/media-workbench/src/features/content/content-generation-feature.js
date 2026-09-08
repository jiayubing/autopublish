import { createCommandOwner } from '../../infrastructure/query-identity/query-identity.js';

function scopeError(code, userMessage) {
  return Object.freeze({
    code,
    category: 'conflict',
    retryability: 'safe',
    userMessage,
  });
}

export function createContentGenerationFeature(options = {}) {
  if (typeof options.start !== 'function' || typeof options.getState !== 'function' ||
      typeof options.retry !== 'function' || typeof options.subscribeOperation !== 'function') {
    throw new TypeError('Content generation feature dependencies are required');
  }
  const command = createCommandOwner({ feature: 'content', command: 'clientGeneration' });
  const listeners = new Set();
  let disposed = false;
  let scope = null;
  let operation = null;
  let refreshSequence = 0;
  let unsubscribeOperation = null;
  let snapshot = Object.freeze({ scope: null, command: command.getSnapshot(), operation: null });

  const emit = () => listeners.forEach((listener) => listener());
  const publish = () => {
    snapshot = Object.freeze({ scope, command: command.getSnapshot(), operation });
    emit();
  };

  const receiveOperation = (next) => {
    if (disposed || !scope || !next || next.clientId !== scope.clientId) return;
    operation = next;
    publish();
  };

  function ensureOperationSubscription() {
    if (disposed || unsubscribeOperation) return;
    const unsubscribe = options.subscribeOperation(receiveOperation);
    if (typeof unsubscribe !== 'function') {
      throw new TypeError('Content generation subscription disposer is required');
    }
    unsubscribeOperation = unsubscribe;
  }

  async function refresh() {
    if (disposed || !scope || scope.clientId === 'none') {
      operation = null;
      publish();
      return null;
    }
    const sequence = ++refreshSequence;
    try {
      const next = await options.getState(scope.clientId);
      if (disposed || sequence !== refreshSequence || !scope || next?.clientId && next.clientId !== scope.clientId) return null;
      if (next?.status === 'running') ensureOperationSubscription();
      operation = next || null;
      publish();
      return operation;
    } catch (_) {
      if (!disposed && sequence === refreshSequence) publish();
      return null;
    }
  }

  async function runCommand(kind, input) {
    if (disposed || !scope) throw new Error('Content generation feature is unavailable');
    if (!input || input.clientId && input.clientId !== scope.clientId) {
      const error = scopeError('CONTENT_SCOPE_MISMATCH', '生成请求与当前客户不一致。');
      const token = command.begin(scope);
      command.finalize(token, { error });
      publish();
      throw Object.assign(new Error(error.userMessage), error);
    }
    const token = command.begin(scope);
    publish();
    try {
      ensureOperationSubscription();
      const next = kind === 'retry' ? await options.retry(input.operationId) : await options.start(input);
      if (!command.isCurrent(token)) return next;
      if (next?.clientId && next.clientId !== scope.clientId) {
        throw Object.assign(
          new Error('生成结果与当前客户不一致。'),
          { code: 'CONTENT_SCOPE_MISMATCH' },
        );
      }
      operation = next || operation;
      command.finalize(token, { result: next });
      publish();
      return next;
    } catch (value) {
      if (!command.isCurrent(token)) return undefined;
      const error = scopeError(
        value && typeof value.code === 'string' ? value.code : 'CONTENT_GENERATION_FAILED',
        value instanceof Error && value.message ? value.message : '生成文章失败。',
      );
      command.finalize(token, { error });
      publish();
      throw Object.assign(new Error(error.userMessage), error);
    }
  }

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setScope(nextScope) {
      if (disposed) return;
      if (!nextScope || typeof nextScope.workspaceRuntimeId !== 'string' || typeof nextScope.clientId !== 'string') {
        throw new TypeError('Content feature scope is invalid');
      }
      if (scope?.workspaceRuntimeId === nextScope.workspaceRuntimeId && scope?.clientId === nextScope.clientId) return;
      scope = Object.freeze({ ...nextScope });
      command.invalidate();
      operation = null;
      publish();
      void refresh();
    },
    start(input) {
      return runCommand('start', input);
    },
    generate(input) {
      return runCommand('start', input);
    },
    retry(operationId) {
      if (!scope) throw new Error('Content generation feature is unavailable');
      return runCommand('retry', { clientId: scope.clientId, operationId });
    },
    refresh,
    dispose() {
      if (disposed) return;
      disposed = true;
      command.dispose();
      if (typeof unsubscribeOperation === 'function') unsubscribeOperation();
      unsubscribeOperation = null;
      listeners.clear();
      scope = null;
      operation = null;
    },
  });
}