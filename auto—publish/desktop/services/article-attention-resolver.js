"use strict";

const crypto = require("node:crypto");
const {
  ACTIONS,
  NAVIGATION_ACTIONS,
  ATTENTION_KINDS,
  deriveAttentionPolicy,
} = require("./article-attention-policy");

const TOKEN_TTL_MS = 5 * 60 * 1000;

function attentionError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function isNavigation(action) {
  return NAVIGATION_ACTIONS.includes(action);
}

function nowIso(clock) {
  const value = typeof clock === "function" ? clock() : new Date();
  const stamp = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(stamp.getTime()))
    throw attentionError("ARTICLE_ATTENTION_CLOCK_INVALID");
  return stamp.toISOString();
}

function normalizeInput(value) {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw attentionError("ARTICLE_ATTENTION_RESOLUTION_INPUT_INVALID");
  const allowed = new Set(["orderId", "observedAt", "remoteUrl", "reasonCode"]);
  if (Object.keys(value).some((key) => !allowed.has(key)))
    throw attentionError("ARTICLE_ATTENTION_RESOLUTION_INPUT_INVALID");
  const result = {};
  for (const key of Object.keys(value)) {
    const item = value[key];
    if (typeof item !== "string" || !item.trim() || item.length > 2048)
      throw attentionError("ARTICLE_ATTENTION_RESOLUTION_INPUT_INVALID");
    if (key === "reasonCode" && !/^[A-Z][A-Z0-9_]{0,127}$/u.test(item))
      throw attentionError("ARTICLE_ATTENTION_RESOLUTION_INPUT_INVALID");
    if (key === "observedAt" && !Number.isFinite(Date.parse(item)))
      throw attentionError("ARTICLE_ATTENTION_RESOLUTION_INPUT_INVALID");
    result[key] = item;
  }
  return Object.freeze(result);
}

function inputFingerprint(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value || {}), "utf8")
    .digest("hex");
}

async function callPort(operation) {
  try {
    return await operation();
  } catch (error) {
    const code =
      error &&
      typeof error.code === "string" &&
      /^[A-Z][A-Z0-9_]{1,127}$/u.test(error.code)
        ? error.code
        : "ARTICLE_ATTENTION_DOMAIN_FAILED";
    const safe = attentionError(code);
    if (error && error.mutation && error.mutation.changed === true)
      Object.defineProperty(safe, "mutation", {
        value: Object.freeze({ changed: true }),
        enumerable: false,
      });
    throw safe;
  }
}

function createArticleAttentionResolver(options) {
  const opts = options || {};
  if (!opts.query || typeof opts.query.get !== "function")
    throw attentionError("ARTICLE_ATTENTION_INVALID");
  const query = opts.query;
  const invalidate =
    typeof opts.onDataInvalidated === "function"
      ? opts.onDataInvalidated
      : function () {};
  const readPolicy =
    typeof query.getPolicy === "function"
      ? query.getPolicy.bind(query)
      : function (input) {
          return deriveAttentionPolicy(query.get(input || {}), {});
        };
  const prepared = new Map();

  function currentRevision() {
    return query.getRevision();
  }

  function assertFresh(input) {
    const expected = Number(input && input.expectedRevision);
    if (!Number.isSafeInteger(expected) || expected !== currentRevision())
      throw attentionError("ARTICLE_ATTENTION_STALE");
    return expected;
  }

  function find(input) {
    const value = input || {};
    const item = query.get(value);
    if (!item)
      throw attentionError("ARTICLE_ATTENTION_NOT_FOUND");
    const policy = readPolicy(value);
    if (!policy || policy.included !== true)
      throw attentionError("ARTICLE_ATTENTION_NOT_FOUND");
    return { item, policy };
  }

  function assertAllowed(entry, action) {
    if (
      typeof action !== "string" ||
      !entry.policy.allowedActions.includes(action)
    )
      throw attentionError("ARTICLE_ATTENTION_ACTION_NOT_ALLOWED");
  }

  function key(item, action) {
    return `${item.attentionId}\u0000${action}`;
  }

  function localToken() {
    return `attention-resolution-${crypto.randomUUID()}`;
  }

  function changedScopes(entry) {
    switch (entry.item.kind) {
      case ATTENTION_KINDS.REGULAR_PLATFORM_UNCERTAIN:
        return ["articleManagement", "articleAttention", "platformQueue"];
      case ATTENTION_KINDS.PAID_ORDER_CREATION_UNCERTAIN:
        return ["articleManagement", "articleAttention", "paidMedia", "orders"];
      case ATTENTION_KINDS.ORDER_STATUS_ANOMALY:
        return ["articleManagement", "articleAttention", "orders"];
      case ATTENTION_KINDS.REMOVAL_NEEDS_REPAIR:
        return ["articleManagement", "articleAttention"];
      case ATTENTION_KINDS.PUBLISHED_ARCHIVE_FAILED:
        return ["articleManagement", "articleAttention", "publicationArchive"];
      default:
        return ["articleManagement", "articleAttention", "platformQueue"];
    }
  }

  function preparedToken(entry, action, input, result, revision) {
    const token =
      result && typeof result.confirmationToken === "string"
        ? result.confirmationToken
        : localToken();
    const record = Object.freeze({
      attentionId: entry.item.attentionId,
      action,
      revision,
      inputFingerprint: inputFingerprint(input),
      token,
      expiresAt: Date.parse(nowIso(opts.clock)) + TOKEN_TTL_MS,
    });
    prepared.set(key(entry.item, action), record);
    return record;
  }

  function requireResolutionPort(name, method) {
    const port = opts[name];
    if (!port || (method && typeof port[method] !== "function"))
      throw attentionError("ARTICLE_ATTENTION_DOMAIN_UNAVAILABLE");
    return port;
  }

  async function prepare(entry, action, input, revision) {
    let result = null;
    const item = entry.item;
    if (item.kind === ATTENTION_KINDS.REGULAR_PLATFORM_UNCERTAIN) {
      const port = requireResolutionPort(
        "regularPlatformOutcomeService",
        "prepareRegularUncertainResolution",
      );
      result = await callPort(() => port.prepareRegularUncertainResolution({
        regularPublicationAttemptId: item.attemptId,
      }));
    } else if (item.kind === ATTENTION_KINDS.PAID_ORDER_CREATION_UNCERTAIN) {
      const port = requireResolutionPort(
        "paidOrderCreationResolutionService",
        action === ACTIONS.BIND_PAID_ORDER_NUMBER
          ? "prepareBindOrderNumber"
          : "prepareConfirmNoOrder",
      );
      const attemptId = item.orderCreationAttemptId || item.attemptId;
      if (!attemptId)
        throw attentionError("ARTICLE_ATTENTION_IDENTITY_UNAVAILABLE");
      if (action === ACTIONS.BIND_PAID_ORDER_NUMBER) {
        if (!input.orderId)
          throw attentionError("ARTICLE_ATTENTION_RESOLUTION_INPUT_REQUIRED");
        result = await callPort(() => port.prepareBindOrderNumber({
          orderCreationAttemptId: attemptId,
          orderId: input.orderId,
        }));
      } else {
        result = await callPort(() => port.prepareConfirmNoOrder({
          orderCreationAttemptId: attemptId,
        }));
      }
    } else if (item.kind === ATTENTION_KINDS.ORDER_STATUS_ANOMALY) {
      const port = requireResolutionPort(
        "orderReconciliationPort",
        "prepareOrderStatusAnomalyResolution",
      );
      if (!item.orderId)
        throw attentionError("ARTICLE_ATTENTION_IDENTITY_UNAVAILABLE");
      result = await callPort(() => port.prepareOrderStatusAnomalyResolution({
        orderId: item.orderId,
      }));
    }
    return preparedToken(entry, action, input, result, revision);
  }

  function assertPrepared(entry, action, input, value) {
    const record = prepared.get(key(entry.item, action));
    if (
      !record ||
      record.revision !== currentRevision() ||
      record.expiresAt <= Date.parse(nowIso(opts.clock)) ||
      value.confirmationToken !== record.token ||
      record.inputFingerprint !== inputFingerprint(input)
    )
      throw attentionError("ARTICLE_ATTENTION_TOKEN_STALE");
    return record;
  }

  async function preview(input) {
    const value = input || {};
    const revision =
      value.expectedRevision === undefined
        ? currentRevision()
        : assertFresh(value);
    const entry = find(value);
    const action = value.action;
    assertAllowed(entry, action);
    const resolutionInput = normalizeInput(value.resolutionInput);
    if (isNavigation(action))
      return {
        attentionId: entry.item.attentionId,
        revision,
        action,
        requiresConfirmation: false,
        message: entry.item.message,
        changedScopes: [],
      };
    const token = await prepare(entry, action, resolutionInput, revision);
    return {
      attentionId: entry.item.attentionId,
      revision,
      action,
      requiresConfirmation: true,
      confirmationToken: token.token,
      resolutionInput,
      message: entry.item.message,
      changedScopes: changedScopes(entry),
    };
  }

  function manualPositiveEvidence(item, input) {
    const remoteUrl = input.remoteUrl || item.remoteUrl || undefined;
    const evidence = {
      observedAt: input.observedAt || nowIso(opts.clock),
    };
    if (remoteUrl) evidence.remoteUrl = remoteUrl;
    return evidence;
  }

  function manualNegativeEvidence(input) {
    return {
      reasonCode: input.reasonCode || "MANUAL_NOT_ACCEPTED",
      observedAt: input.observedAt || nowIso(opts.clock),
    };
  }

  async function execute(entry, action, input, value) {
    const item = entry.item;
    if (item.kind === ATTENTION_KINDS.REGULAR_PLATFORM_UNCERTAIN) {
      const port = requireResolutionPort(
        "regularPlatformOutcomeService",
        action === ACTIONS.CONFIRM_REGULAR_ACCEPTED
          ? "confirmRegularAccepted"
          : "confirmRegularNotAccepted",
      );
      if (action === ACTIONS.CONFIRM_REGULAR_ACCEPTED)
        return callPort(() => port.confirmRegularAccepted({
          regularPublicationAttemptId: item.attemptId,
          confirmationToken: value.confirmationToken,
          manualPositiveEvidence: manualPositiveEvidence(item, input),
        }));
      return callPort(() => port.confirmRegularNotAccepted({
        regularPublicationAttemptId: item.attemptId,
        confirmationToken: value.confirmationToken,
        manualNegativeEvidence: manualNegativeEvidence(input),
      }));
    }
    if (item.kind === ATTENTION_KINDS.PAID_ORDER_CREATION_UNCERTAIN) {
      const port = requireResolutionPort(
        "paidOrderCreationResolutionService",
        action === ACTIONS.BIND_PAID_ORDER_NUMBER
          ? "bindOrderNumber"
          : "confirmNoOrder",
      );
      const orderCreationAttemptId =
        item.orderCreationAttemptId || item.attemptId;
      if (action === ACTIONS.BIND_PAID_ORDER_NUMBER)
        return callPort(() => port.bindOrderNumber({
          orderCreationAttemptId,
          orderId: input.orderId,
          confirmationToken: value.confirmationToken,
        }));
      return callPort(() => port.confirmNoOrder({
        orderCreationAttemptId,
        confirmationToken: value.confirmationToken,
      }));
    }
    if (item.kind === ATTENTION_KINDS.ORDER_STATUS_ANOMALY) {
      const port = requireResolutionPort(
        "orderReconciliationPort",
        {
          [ACTIONS.RESUME_ORDER_TRACKING]: "resumeOrderTracking",
          [ACTIONS.CONFIRM_ORDER_PUBLISHED]: "confirmOrderPublished",
          [ACTIONS.CONFIRM_ORDER_NOT_PUBLISHED]: "confirmOrderNotPublished",
        }[action],
      );
      const command = {
        orderId: item.orderId,
        confirmationToken: value.confirmationToken,
      };
      if (action === ACTIONS.RESUME_ORDER_TRACKING)
        return callPort(() => port.resumeOrderTracking(command));
      if (action === ACTIONS.CONFIRM_ORDER_PUBLISHED)
        return callPort(() => port.confirmOrderPublished(command));
      return callPort(() => port.confirmOrderNotPublished(command));
    }
    if (action === ACTIONS.RETRY_REMOVAL) {
      const port = requireResolutionPort(
        "articleRemovalService",
        "retryArticleRemovalTransaction",
      );
      return callPort(() => port.retryArticleRemovalTransaction({
        transactionId: item.transactionId,
        confirmed: true,
      }));
    }
    if (action === ACTIONS.RETRY_ARCHIVE) {
      if (
        item.jobId &&
        opts.postProcessingPort &&
        typeof opts.postProcessingPort.retry === "function"
      )
        return callPort(() => opts.postProcessingPort.retry({ jobId: item.jobId }));
      const port = opts.archiveActionPort || opts.archiveService;
      if (!port || typeof port.retryArchive !== "function")
        throw attentionError("ARTICLE_ARCHIVE_RETRY_UNAVAILABLE");
      return callPort(() => port.retryArchive(item));
    }
    throw attentionError("ARTICLE_ATTENTION_ACTION_INVALID");
  }

  async function resolve(input) {
    const value = input || {};
    assertFresh(value);
    const entry = find(value);
    const action = value.action;
    assertAllowed(entry, action);
    if (isNavigation(action))
      return {
        outcome: action === ACTIONS.INSPECT ? "inspection_required" : action,
        attentionId: entry.item.attentionId,
        item: entry.item,
        changedScopes: [],
      };
    if (value.confirmed !== true)
      throw attentionError("ARTICLE_ATTENTION_CONFIRMATION_REQUIRED");
    const resolutionInput = normalizeInput(value.resolutionInput);
    assertPrepared(entry, action, resolutionInput, value);
    let result;
    try {
      result = await execute(entry, action, resolutionInput, value);
    } catch (error) {
      if (error && error.mutation && error.mutation.changed === true)
        invalidate("ARTICLE_ATTENTION_DOMAIN_MUTATION");
      throw error;
    }
    prepared.delete(key(entry.item, action));
    if (
      !result ||
      (result.domainHandled !== true &&
        (!Array.isArray(result.changedScopes) ||
          result.changedScopes.length === 0))
    )
      invalidate("ARTICLE_ATTENTION_RESOLVED");
    if (
      typeof opts.getRevision !== "function" &&
      query &&
      typeof query.invalidate === "function"
    )
      query.invalidate();
    return {
      outcome: "resolved",
      attentionId: entry.item.attentionId,
      result: result || null,
      changedScopes: changedScopes(entry),
    };
  }

  return { preview, resolve };
}

module.exports = { createArticleAttentionResolver, attentionError };
