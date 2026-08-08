"use strict";

const crypto = require("node:crypto");
const net = require("node:net");

const domain = require("../../src/domain");

const STATUS_BY_KIND = Object.freeze({
  pending: "0",
  scheduled: "1",
  published: "2",
  rejected: "4",
  aftercare: "9",
});

function createMediaOrderService(opts) {
  const options = opts || {};
  const transitions = options.orderObservationTransitions;
  if (!transitions) throw orderError("MEDIA_ORDER_STORE_REQUIRED");
  for (const method of [
    "listOrderObservationViews",
    "getOrderObservationContext",
    "recordOrderObservation",
    "recordOrderStatusAnomaly",
    "prepareOrderStatusAnomalyResolution",
    "resumeOrderTracking",
    "confirmOrderPublished",
    "confirmOrderNotPublished",
  ])
    if (typeof transitions[method] !== "function")
      throw orderError("MEDIA_ORDER_TRANSITIONS_REQUIRED");

  const supplierProvider =
    typeof options.supplierProvider === "function"
      ? options.supplierProvider
      : null;
  const openExternal =
    typeof options.openExternal === "function" ? options.openExternal : null;
  const clock =
    typeof options.clock === "function" ? options.clock : () => new Date();

  function listOrderViews() {
    return transitions
      .listOrderObservationViews()
      .map((order) => toOperationalOrderView(order));
  }

  function provider() {
    const value = supplierProvider && supplierProvider();
    if (!value || typeof value.getOrderDetails !== "function")
      throw orderError("MEDIA_CONFIG_NOT_SET", "付费媒体配置未设置");
    return value;
  }

  function stamp() {
    const value = clock();
    const parsed = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(parsed.getTime()))
      throw orderError("MEDIA_ORDER_SYNC_FAILED");
    return parsed.toISOString();
  }

  function evidenceFingerprint(value) {
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(value), "utf8")
      .digest("hex");
  }

  function canonicalItem(result, orderId) {
    if (!result || result.kind !== "order_details")
      throw orderError("MEDIA_ORDER_SYNC_FAILED");
    return (result.orders || []).find(
      (item) => item && String(item.orderId || "") === String(orderId),
    );
  }

  function statusCode(item) {
    return item ? STATUS_BY_KIND[String(item.status || "")] || "" : "";
  }

  function safeEventAt(item) {
    if (!item || typeof item.publishedAt !== "string") return null;
    const value = Date.parse(item.publishedAt);
    return Number.isFinite(value) ? new Date(value).toISOString() : null;
  }

  function safeActualAmount(value) {
    return typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0 &&
      value <= 100000000
      ? value
      : null;
  }

  function buildObservation(orderId, item, observedAt, context) {
    const code = statusCode(item);
    if (!code) return null;
    const eventAt = code === "2" ? safeEventAt(item) : null;
    const rawUrl =
      code === "2" ? domain.normalizePublishedArticleUrl(item.remoteUrl) : null;
    const canonical = {
      orderId: String(orderId),
      statusCode: code,
      observedAt,
      eventAt,
      remoteUrl: rawUrl,
      actualAmount: safeActualAmount(item.actualAmount),
    };
    return domain.parseOrderObservationV1({
      version: 1,
      orderIdentityV1: { version: 1, orderId: String(orderId) },
      statusCode: code,
      observedAt,
      eventAt,
      eventAtSource: eventAt ? "provider_event_time" : "not_available",
      remoteUrl: rawUrl,
      actualAmount: canonical.actualAmount,
      evidenceFingerprint: evidenceFingerprint(canonical),
      orderSnapshotFingerprint: context.orderSnapshotFingerprint,
    });
  }

  async function query(orderId) {
    let result;
    try {
      result = await provider().getOrderDetails([String(orderId)]);
    } catch (_) {
      throw orderError("MEDIA_ORDER_SYNC_FAILED");
    }
    if (!result || result.kind !== "order_details")
      throw orderError("MEDIA_ORDER_SYNC_FAILED");
    return { result, item: canonicalItem(result, orderId) };
  }

  async function syncOrder(orderId) {
    const id = String(orderId || "");
    const context = transitions.getOrderObservationContext(id);
    const observedAt = stamp();
    const { item } = await query(id);
    if (!item) {
      const missingFingerprint = evidenceFingerprint({
        orderId: id,
        observedAt,
        result: "missing",
      });
      const mutation = transitions.recordOrderStatusAnomaly({
        orderId: id,
        reason: "order-missing",
        evidenceFingerprint: missingFingerprint,
        queryBinding: context.queryBinding,
      });
      if (mutation && mutation.publishedWins)
        return Object.freeze({
          orderId: id,
          statusCode: "2",
          idempotent: true,
          publishedWins: true,
        });
      throw orderError(
        "MEDIA_ORDER_STATUS_ANOMALY",
        undefined,
        mutation && mutation.publishedWins
          ? null
          : {
              changed: true,
              kind: "order_status_anomaly_recorded",
              orderId: id,
            },
      );
    }
    const observation = buildObservation(id, item, observedAt, context);
    if (!observation) {
      const mutation = transitions.recordOrderStatusAnomaly({
        orderId: id,
        reason: "unknown-status",
        evidenceFingerprint: evidenceFingerprint({
          orderId: id,
          observedAt,
          result: "unknown-status",
        }),
        queryBinding: context.queryBinding,
      });
      if (mutation && mutation.publishedWins)
        return Object.freeze({
          orderId: id,
          statusCode: "2",
          idempotent: true,
          publishedWins: true,
        });
      throw orderError(
        "MEDIA_ORDER_STATUS_ANOMALY",
        undefined,
        mutation && mutation.publishedWins
          ? null
          : {
              changed: true,
              kind: "order_status_anomaly_recorded",
              orderId: id,
            },
      );
    }
    return transitions.recordOrderObservation({
      orderObservationV1: observation,
      queryBinding: context.queryBinding,
    });
  }

  async function syncAllOrders() {
    const current = listOrderViews();
    const items = [];
    let mutationCount = 0;
    for (const order of current) {
      try {
        const result = await syncOrder(order.orderNid);
        if (!result || result.idempotent !== true) mutationCount += 1;
        items.push(
          Object.freeze({
            orderNid: order.orderNid,
            ok: true,
            errorCode: null,
          }),
        );
      } catch (error) {
        if (error && error.mutation && error.mutation.changed === true)
          mutationCount += 1;
        items.push(
          Object.freeze({
            orderNid: order.orderNid,
            ok: false,
            errorCode:
              error && typeof error.code === "string"
                ? error.code
                : "MEDIA_ORDER_SYNC_FAILED",
          }),
        );
      }
    }
    return Object.freeze({
      items: Object.freeze(items),
      succeeded: items.filter((item) => item.ok).length,
      failed: items.filter((item) => !item.ok).length,
      mutationCount,
    });
  }

  async function prepareOrderStatusAnomalyResolution(input) {
    const value = input || {};
    const orderId = String(value.orderId || "");
    const context = transitions.getOrderObservationContext(orderId);
    const observedAt = stamp();
    let item = null;
    let queryFailed = false;
    try {
      ({ item } = await query(orderId));
    } catch (_) {
      queryFailed = true;
    }
    const observation = item
      ? buildObservation(orderId, item, observedAt, context)
      : null;
    const code = observation && observation.statusCode;
    let classification = "inconclusive";
    if (!queryFailed && observation) {
      if (["0", "1"].includes(code)) classification = "verified_trackable";
      else if (code === "2") classification = "verified_published";
      else if (code === "4") classification = "verified_non_published_terminal";
    }
    const verificationFingerprint = evidenceFingerprint({
      orderId,
      classification,
      observationFingerprint: observation
        ? observation.evidenceFingerprint
        : null,
    });
    const terminalObservationV1 =
      classification === "verified_non_published_terminal"
        ? domain.parseTerminalObservationV1({
            version: 1,
            orderIdentityV1: observation.orderIdentityV1,
            terminalKind: "REJECTED",
            observedAt: observation.observedAt,
            eventAt: observation.eventAt,
            eventAtSource: observation.eventAtSource,
            actualAmount: observation.actualAmount,
            evidenceFingerprint: observation.evidenceFingerprint,
            orderSnapshotFingerprint: observation.orderSnapshotFingerprint,
          })
        : null;
    return transitions.prepareOrderStatusAnomalyResolution({
      orderId,
      queryBinding: context.queryBinding,
      verification: {
        classification,
        evidenceFingerprint: verificationFingerprint,
        orderObservationV1:
          classification === "verified_trackable" ||
          classification === "verified_published"
            ? observation
            : null,
        terminalObservationV1,
      },
    });
  }

  async function openPublishedUrl(orderId) {
    const order = listOrderViews().find(
      (item) => item.orderNid === String(orderId),
    );
    // A later per-order status is still authoritative history, but it must not
    // hide the durable publication URL established by an earlier status 2.
    // A direct status-2 projection is also a valid published-link fact when
    // the provider did not supply a separate event timestamp.
    if (!order || (order.statusCode !== "2" && !order.publishedAt))
      throw orderError("MEDIA_ORDER_NOT_PUBLISHED");
    const context = transitions.getOrderObservationContext(String(orderId));
    const url = publishedUrlForExternalOpen(context.remoteUrl);
    if (!url) throw orderError("MEDIA_ORDER_URL_UNAVAILABLE");
    if (!openExternal) throw orderError("MEDIA_ORDER_OPEN_FAILED");
    try {
      await openExternal(url);
    } catch (_) {
      throw orderError("MEDIA_ORDER_OPEN_FAILED");
    }
    return { completed: true };
  }

  return Object.freeze({
    listOrderViews,
    syncOrder,
    syncAllOrders,
    prepareOrderStatusAnomalyResolution,
    resumeOrderTracking: transitions.resumeOrderTracking,
    confirmOrderPublished: transitions.confirmOrderPublished,
    confirmOrderNotPublished: transitions.confirmOrderNotPublished,
    openPublishedUrl,
  });
}

function orderError(code, message, mutation) {
  const error = new Error(message || code);
  error.code = code;
  if (mutation && mutation.changed === true)
    Object.defineProperty(error, "mutation", {
      value: Object.freeze({ ...mutation }),
      enumerable: false,
    });
  return error;
}

function publishedUrlForExternalOpen(value) {
  const normalized = domain.normalizePublishedArticleUrl(value);
  if (!normalized) return null;
  try {
    const hostname = new URL(normalized).hostname.toLowerCase();
    const ipCandidate =
      hostname.startsWith("[") && hostname.endsWith("]")
        ? hostname.slice(1, -1)
        : hostname;
    if (
      !hostname ||
      net.isIP(ipCandidate) !== 0 ||
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    )
      return null;
    return normalized;
  } catch (_) {
    return null;
  }
}

function toOperationalOrderView(order) {
  const value = order || {};
  const quotedPrice =
    typeof value.quotedPrice === "number" &&
    Number.isFinite(value.quotedPrice) &&
    value.quotedPrice >= 0
      ? String(value.quotedPrice)
      : "";
  return Object.freeze({
    title: typeof value.title === "string" ? value.title : "",
    filename: typeof value.filename === "string" ? value.filename : "",
    orderNid: String(value.orderId || ""),
    statusCode: ["0", "1", "2", "4", "9", "cancelled"].includes(value.statusCode)
      ? value.statusCode
      : "0",
    createdAt: isoInstantOrEmpty(value.createdAt),
    submittedAt: isoInstantOrEmpty(value.submittedAt),
    publishedAt: isoInstantOrEmpty(value.publishedAt),
    resourceName:
      typeof value.resourceName === "string" ? value.resourceName : "",
    price: quotedPrice,
    actualAmount:
      typeof value.actualAmount === "number" ? String(value.actualAmount) : "",
    hasPublishedUrl: Boolean(publishedUrlForExternalOpen(value.remoteUrl)),
    anomaly: value.anomaly || null,
  });
}

function isoInstantOrEmpty(value) {
  if (typeof value !== "string" || value.length > 64) return "";
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : "";
}

module.exports = { createMediaOrderService };
