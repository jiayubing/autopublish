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
  if (typeof options.generate !== 'function' || typeof options.commit !== 'function' || typeof options.refreshCurrent !== 'function') {
    throw new TypeError('Content generation feature dependencies are required');
  }
  const command = createCommandOwner({ feature: 'content', command: 'generateSingleArticle' });
  const listeners = new Set();
  let disposed = false;
  let scope = null;
  let snapshot = Object.freeze({ scope: null, command: command.getSnapshot() });

  function operationId() {
    if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return `generation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  const emit = () => listeners.forEach((listener) => listener());
  const publish = () => {
    snapshot = Object.freeze({ scope, command: command.getSnapshot() });
    emit();
  };

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
      publish();
    },
    async generate(input) {
      if (disposed || !scope) throw new Error('Content generation feature is unavailable');
      if (!input || input.clientId !== scope.clientId) {
        const error = scopeError('CONTENT_SCOPE_MISMATCH', '生成请求与当前客户不一致。');
        const token = command.begin(scope);
        command.finalize(token, { error });
        publish();
        throw Object.assign(new Error(error.userMessage), error);
      }
      const token = command.begin(scope);
      publish();
      try {
        const article = await options.generate({ ...input, generationOperationId: input.generationOperationId || operationId() });
        if (!command.isCurrent(token)) {
          await options.refreshCurrent('stale-command-result', scope);
          return article;
        }
        const articles = article && Array.isArray(article.articles)
          ? article.articles.map((item) => item && item.article)
          : [article];
        if (!articles.length || articles.some((item) => !item || item.clientId !== scope.clientId)) {
          throw Object.assign(new Error('Generated article scope mismatch'), {
            code: 'CONTENT_SCOPE_MISMATCH',
          });
        }
        articles.forEach((item) => options.commit(item));
        command.finalize(token, { result: article });
        publish();
        return article;
      } catch (value) {
        if (!command.isCurrent(token)) {
          await options.refreshCurrent('stale-command-result', scope);
          return undefined;
        }
        const error = scopeError(
          value && typeof value.code === 'string' ? value.code : 'CONTENT_GENERATION_FAILED',
          value instanceof Error && value.message ? value.message : '生成文章失败。',
        );
        command.finalize(token, { error });
        publish();
        throw Object.assign(new Error(error.userMessage), error);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      command.dispose();
      listeners.clear();
      scope = null;
    },
  });
}
