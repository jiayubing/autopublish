import { createCommandOwner } from '../../infrastructure/query-identity/query-identity.js';

const COMMANDS = Object.freeze(['previewBatch', 'start', 'pause', 'resume', 'stop', 'continue', 'retry', 'previewCancelPending', 'cancelPending', 'listSubmissionPlatforms', 'previewSubmissionHandoff', 'commitSubmissionHandoff']);
const LIVE_STATUSES = new Set(['running', 'pausing', 'stopping']);

function safeError(value) {
  return Object.freeze({
    code: value && typeof value.code === 'string' ? value.code : 'GENERATION_COMMAND_FAILED',
    category: 'internal',
    retryability: 'safe',
    userMessage: value instanceof Error && value.message ? value.message : '批量生成命令失败。',
  });
}

function validId(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 200;
}

function validSequence(value) {
  return Number.isInteger(value) && value >= 0;
}

function validBatch(value) {
  return value === null || Boolean(value && typeof value === 'object' && !Array.isArray(value) && validId(value.id));
}

function validRuntime(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const batchId = value.batchId;
  if (batchId !== undefined && batchId !== null && !validId(batchId)) return false;
  if (value.status !== undefined && typeof value.status !== 'string') return false;
  if (value.state !== undefined && typeof value.state !== 'string') return false;
  return true;
}

function matchingBatch(runtime, batch) {
  if (!batch || runtime.batchId === undefined || runtime.batchId === null) return true;
  return runtime.batchId === batch.id;
}

function mergeRuntimeIntoBatch(batch, runtime) {
  if (!batch || runtime.batchId !== batch.id || runtime.status === 'idle') return batch;
  return Object.freeze({
    ...batch,
    status: runtime.status || batch.status,
    counts: runtime.counts || batch.counts,
    updatedAt: runtime.updatedAt || batch.updatedAt,
  });
}

function validateHydration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!validId(value.runtimeId) || !validSequence(value.sequence) || !validRuntime(value.runtime) || !validBatch(value.batch)) return null;
  if (!matchingBatch(value.runtime, value.batch)) return null;
  return {
    runtimeId: value.runtimeId,
    sequence: value.sequence,
    runtime: Object.freeze({ ...value.runtime }),
    batch: value.batch === null ? null : Object.freeze({ ...value.batch }),
    capabilities: Object.freeze({ ...(value.capabilities || {}) }),
  };
}

function validateEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!validId(value.runtimeId) || !validSequence(value.sequence) || !validRuntime(value) || !validBatch(value.batch ?? null)) return null;
  const batch = value.batch ?? null;
  if (!matchingBatch(value, batch)) return null;
  return {
    runtimeId: value.runtimeId,
    sequence: value.sequence,
    runtime: Object.freeze({ ...value }),
    batch: batch === null ? null : Object.freeze({ ...batch }),
    capabilities: Object.freeze({ ...(value.capabilities || {}) }),
  };
}

export function createGenerationFeature(adapters = {}) {
  for (const command of COMMANDS) {
    if (typeof adapters[command] !== 'function') throw new TypeError(`Generation command is unavailable: ${command}`);
  }
  if (typeof adapters.hydrate !== 'function') throw new TypeError('Generation hydrate adapter is unavailable');
  if (typeof adapters.subscribeRuntime !== 'function') throw new TypeError('Generation runtime subscription is unavailable');
  const owners = Object.fromEntries(COMMANDS.map((name) => [name, createCommandOwner({ feature: 'generation', command: name })]));
  const listeners = new Set();
  let disposed = false;
  let scope = null;
  let runtimeId = null;
  let sequence = -1;
  let runtime = null;
  let batch = null;
  let capabilities = Object.freeze({});
  let unsubscribeRuntime = null;
  let hydrationToken = 0;
  let snapshot;

  const emit = () => listeners.forEach((listener) => listener());
  const publish = () => {
    snapshot = Object.freeze({
      scope,
      runtimeId,
      sequence,
      runtime,
      batch,
      capabilities,
      commands: Object.freeze(Object.fromEntries(COMMANDS.map((name) => [name, owners[name].getSnapshot()]))),
    });
    emit();
  };

  const batchAllowed = (candidate) => {
    if (!candidate) return true;
    return !scope || scope.batchId === 'current' || scope.batchId === 'draft' || scope.batchId === candidate.id;
  };

  const applyHydration = (value) => {
    const next = validateHydration(value);
    if (!next || !batchAllowed(next.batch)) return false;
    if (runtimeId === next.runtimeId && next.sequence < sequence) return false;
    runtimeId = next.runtimeId;
    sequence = next.sequence;
    runtime = next.runtime;
    batch = mergeRuntimeIntoBatch(next.batch, next.runtime);
    capabilities = next.capabilities;
    publish();
    return true;
  };

  const applyEvent = (value) => {
    const next = validateEvent(value);
    if (!next || runtimeId === null || next.runtimeId !== runtimeId || next.sequence <= sequence || !batchAllowed(next.batch)) return false;
    if (batch && next.runtime.batchId && next.runtime.batchId !== batch.id) return false;
    runtimeId = next.runtimeId;
    sequence = next.sequence;
    runtime = next.runtime;
    if (next.batch) batch = next.batch;
    batch = mergeRuntimeIntoBatch(batch, next.runtime);
    capabilities = next.capabilities;
    publish();
    return true;
  };

  const ensureSubscription = () => {
    if (disposed || unsubscribeRuntime) return;
    const unsubscribe = adapters.subscribeRuntime(applyEvent);
    unsubscribeRuntime = typeof unsubscribe === 'function' ? unsubscribe : () => {};
  };

  const hydrate = async (reason = 'manual-refresh') => {
    if (disposed || !scope) return false;
    ensureSubscription();
    const token = ++hydrationToken;
    const requestScope = scope;
    const value = await adapters.hydrate(reason, requestScope);
    if (disposed || token !== hydrationToken || scope !== requestScope) return false;
    return applyHydration(value);
  };

  const applyCommandResult = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !validId(value.id) || !batchAllowed(value)) return;
    batch = Object.freeze({ ...value });
  };

  const runCommand = async (name, input) => {
    if (disposed || !scope) throw new Error('Generation feature command is invalid');
    const owner = owners[name];
    if (owner.getSnapshot().busy) return { ignored: true };
    const token = owner.begin(scope);
    publish();
    try {
      const result = await adapters[name](input);
      if (!owner.isCurrent(token)) {
        await hydrate('stale-command-result');
        return undefined;
      }
      owner.finalize(token, { result });
      applyCommandResult(result);
      publish();
      await hydrate('command-result');
      return result;
    } catch (value) {
      if (!owner.isCurrent(token)) {
        await hydrate('stale-command-result');
        return undefined;
      }
      const error = safeError(value);
      owner.finalize(token, { error });
      publish();
      throw Object.assign(new Error(error.userMessage), error);
    }
  };

  publish();
  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    setScope(nextScope) {
      if (disposed) return;
      if (!nextScope || !validId(nextScope.workspaceRuntimeId) || !validId(nextScope.batchId)) {
        throw new TypeError('Generation scope is invalid');
      }
      if (scope?.workspaceRuntimeId === nextScope.workspaceRuntimeId && scope?.batchId === nextScope.batchId) return;
      scope = Object.freeze({ workspaceRuntimeId: nextScope.workspaceRuntimeId, batchId: nextScope.batchId });
      hydrationToken += 1;
      runtimeId = null;
      sequence = -1;
      runtime = null;
      batch = null;
      capabilities = Object.freeze({});
      COMMANDS.forEach((name) => owners[name].invalidate());
      ensureSubscription();
      publish();
    },
    hydrate,
    previewBatch: (input) => runCommand('previewBatch', input),
    start: (input) => runCommand('start', input),
    pause: (input) => runCommand('pause', input),
    resume: (input) => runCommand('resume', input),
    stop: (input) => runCommand('stop', input),
    continue: (input) => runCommand('continue', input),
    retry: (input) => runCommand('retry', input),
    previewCancelPending: (input) => runCommand('previewCancelPending', input),
    cancelPending: (input) => runCommand('cancelPending', input),
    listSubmissionPlatforms: () => runCommand('listSubmissionPlatforms'),
    previewSubmissionHandoff: (input) => runCommand('previewSubmissionHandoff', input),
    commitSubmissionHandoff: (input) => runCommand('commitSubmissionHandoff', input),
    dispose() {
      if (disposed) return;
      disposed = true;
      hydrationToken += 1;
      if (unsubscribeRuntime) unsubscribeRuntime();
      unsubscribeRuntime = null;
      COMMANDS.forEach((name) => owners[name].dispose());
      listeners.clear();
      scope = null;
      runtimeId = null;
      sequence = -1;
      runtime = null;
      batch = null;
    },
  });
}

export { COMMANDS as GENERATION_COMMANDS, LIVE_STATUSES as GENERATION_LIVE_STATUSES };
