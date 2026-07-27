function identityError(code) {
  const error = new Error(code === "FEATURE_DISPOSED" ? "Feature is disposed" : "Feature scope is invalid");
  error.code = code;
  return error;
}

function stableScope(scope) {
  if (!scope || typeof scope !== "object" || Array.isArray(scope))
    throw identityError("FEATURE_SCOPE_INVALID");
  const result = {};
  for (const key of Object.keys(scope).sort()) {
    const value = scope[key];
    if (typeof value !== "string" || !value || /[\x00-\x1f\x7f]/.test(value))
      throw identityError("FEATURE_SCOPE_INVALID");
    result[key] = value;
  }
  return JSON.stringify(result);
}

export function createQueryIdentity(options) {
  const feature = options && options.feature;
  const query = options && options.query;
  if (typeof feature !== "string" || typeof query !== "string")
    throw identityError("FEATURE_IDENTITY_INVALID");
  let sequence = 0;
  let scopeKey = null;
  let disposed = false;

  function assertActive() {
    if (disposed) throw identityError("FEATURE_DISPOSED");
  }

  function setScope(scope) {
    assertActive();
    const next = stableScope(scope);
    if (next !== scopeKey) {
      scopeKey = next;
      sequence += 1;
    }
  }

  function begin(scope, reason) {
    assertActive();
    if (scope !== undefined) setScope(scope);
    if (!scopeKey) throw identityError("FEATURE_SCOPE_INVALID");
    sequence += 1;
    return Object.freeze({
      key: `${feature}:${query}:${scopeKey}`,
      feature,
      query,
      scopeKey,
      sequence,
      reason: reason || "manual",
    });
  }

  function isCurrent(token) {
    return Boolean(
      !disposed &&
        token &&
        token.feature === feature &&
        token.query === query &&
        token.scopeKey === scopeKey &&
        token.sequence === sequence,
    );
  }

  return Object.freeze({
    begin,
    setScope,
    isCurrent,
    invalidate() {
      if (!disposed) sequence += 1;
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        sequence += 1;
        scopeKey = null;
      }
    },
  });
}

export function createCommandOwner(options) {
  const feature = options && options.feature;
  const command = options && options.command;
  if (typeof feature !== "string" || typeof command !== "string")
    throw identityError("COMMAND_IDENTITY_INVALID");
  let sequence = 0;
  let active = null;
  let error = null;
  let result = null;
  let disposed = false;

  function begin(scope) {
    if (disposed) throw identityError("FEATURE_DISPOSED");
    sequence += 1;
    error = null;
    result = null;
    active = Object.freeze({
      feature,
      command,
      scopeKey: stableScope(scope),
      sequence,
    });
    return active;
  }

  function isCurrent(token) {
    return Boolean(!disposed && token && active && token === active);
  }

  function finalize(token, outcome) {
    if (!isCurrent(token)) return false;
    if (outcome && outcome.error !== undefined) error = outcome.error;
    if (outcome && outcome.result !== undefined) result = outcome.result;
    active = null;
    return true;
  }

  return Object.freeze({
    begin,
    isCurrent,
    finalize,
    getSnapshot() {
      return Object.freeze({ busy: Boolean(active), error, result });
    },
    invalidate() {
      if (disposed) return;
      sequence += 1;
      active = null;
      error = null;
      result = null;
    },
    dispose() {
      disposed = true;
      active = null;
      error = null;
      result = null;
      sequence += 1;
    },
  });
}
