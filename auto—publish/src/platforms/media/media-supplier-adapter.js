"use strict";

const {
  MEDIA_ERROR_DEFINITIONS,
  safeDiagnostics: safeMediaDiagnostics,
} = require("./media-errors");
const {
  MediaSupplierProtocolError,
  MediaSupplierRejectedError,
  parseCancelledOrderResponse,
  parseCreatedOrderResponse,
  parseOrderDetailsResponse,
  parseResourceResponse,
} = require("./media-supplier-response");
const { reportDiagnostic } = require("../../diagnostics/diagnostic-producer");

function createMediaSupplierAdapter(options) {
  const values = options || {};
  const getClient = typeof values.clientProvider === "function" ? values.clientProvider : () => values.client;

  async function refreshMediaResources(input) {
    const request = normalizePage(input);
    try {
      const client = getClient();
      const method = client && (client.refreshMediaResources || client.listResources || client.mediaList);
      if (typeof method !== "function") throw unavailable();
      return {
        kind: "resources_refreshed",
        ...parseResourceResponse(await method.call(client, request), request),
      };
    } catch (error) {
      return resourceFailure(error);
    }
  }

  async function createOrder(input) {
    let request;
    try {
      request = normalizeOrderInput(input);
    } catch (error) {
      return invalidFailure(error);
    }
    let client;
    try {
      client = getClient();
    } catch (error) {
      return configurationFailure(error);
    }
    if (!client) return configurationFailure(unavailable());
    if (
      typeof client.createOrder !== "function" &&
      typeof client.sendArticle !== "function"
    )
      return configurationFailure(unavailable());
    try {
      let response;
      if (typeof client.createOrder === "function") {
        response = await client.createOrder(request);
      } else if (typeof client.sendArticle === "function") {
        response = await client.sendArticle({
          resourceId: request.mediaResourceId,
          title: request.title,
          content: request.htmlBody,
          remark: request.remark,
          thirdId: request.systemSubmissionId,
        });
      }
      const created = parseCreatedOrderResponse(response);
      return created
        ? { kind: "order_created", orderId: created.orderId }
        : { kind: "uncertain", reason: "missing-order-id" };
    } catch (error) {
      return creationFailure(error);
    }
  }

  async function getOrderDetails(orderIds) {
    let ids;
    try {
      ids = normalizeOrderIds(orderIds);
    } catch (error) {
      return invalidFailure(error);
    }
    try {
      const client = getClient();
      if (!client) throw unavailable();
      const method = client.getOrderDetails || client.queryOrders || client.orderInfo;
      if (typeof method !== "function") throw unavailable();
      const response = await method.call(client, ids);
      return { kind: "order_details", orders: parseOrderDetailsResponse(response) };
    } catch (error) {
      return queryFailure(error);
    }
  }

  async function cancelOrder(orderId) {
    let id;
    try {
      id = normalizeIdentifier(orderId, "orderId");
    } catch (error) {
      return invalidFailure(error);
    }
    try {
      const client = getClient();
      if (!client) throw unavailable();
      const method = client.cancelOrder || client.cancel;
      if (typeof method !== "function") throw unavailable();
      const response = await method.call(client, id);
      parseCancelledOrderResponse(response);
      return { kind: "order_cancelled", orderId: id };
    } catch (error) {
      if (error instanceof MediaSupplierRejectedError)
        return { kind: "cancel_rejected", orderId: id, scope: error.scope };
      if (isCode(error, "MEDIA_REMOTE_REJECTED"))
        return { kind: "cancel_rejected", orderId: id, scope: "order" };
      if (isProtocolError(error))
        return { kind: "uncertain", reason: "protocol", error: safeError(error) };
      return uncertainFailure(error);
    }
  }

  return Object.freeze({
    refreshMediaResources,
    createOrder,
    getOrderDetails,
    cancelOrder,
  });
}

function normalizePage(input) {
  const values = input || {};
  return {
    page: positiveInteger(values.page, 1),
    pageSize: positiveInteger(values.pageSize, 20),
  };
}

function normalizeOrderInput(input) {
  const values = input || {};
  return {
    mediaResourceId: normalizeIdentifier(values.mediaResourceId, "mediaResourceId"),
    title: normalizeText(values.title, "title"),
    htmlBody: normalizeText(values.htmlBody, "htmlBody"),
    ...(hasText(values.remark) ? { remark: String(values.remark).trim() } : {}),
    systemSubmissionId: normalizeIdentifier(values.systemSubmissionId, "systemSubmissionId"),
  };
}

function normalizeOrderIds(value) {
  const values = Array.isArray(value) ? value : [value];
  const result = values.map((item) => String(item == null ? "" : item).trim()).filter(Boolean);
  if (result.length === 0) throw invalidInput("orderIds");
  return result;
}

function normalizeIdentifier(value, label) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text.length > 256 || /[\u0000-\u001f\u007f]/u.test(text)) throw invalidInput(label);
  return text;
}

function normalizeText(value, label) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text.length > 2000000) throw invalidInput(label);
  return text;
}

function hasText(value) {
  return String(value == null ? "" : value).trim().length > 0;
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function invalidInput(label) {
  const error = new Error("媒体供应商输入无效: " + label);
  error.code = "MEDIA_SUPPLIER_INPUT_INVALID";
  return error;
}

function unavailable() {
  const error = new Error("媒体供应商端口未配置");
  error.code = "MEDIA_SUPPLIER_PORT_UNAVAILABLE";
  return error;
}

function resourceFailure(error) {
  const code = safeErrorCode(error);
  const diagnostics = safeMediaDiagnostics(error && error.diagnostics);
  let failure;
  if (error instanceof MediaSupplierRejectedError) {
    failure = {
      kind: "resources_rejected",
      scope: error.scope,
      error: safeError(error),
      ...(diagnostics ? { diagnostics } : {}),
    };
  } else if (isCode(error, "MEDIA_REMOTE_REJECTED")) {
    failure = {
      kind: "resources_rejected",
      scope: "service",
      error: safeError(error),
      ...(diagnostics ? { diagnostics } : {}),
    };
  } else if (isCode(error, "MEDIA_RESOURCE_NORMALIZATION_FAILED")) {
    failure = {
      kind: "resources_normalization_failed",
      operation: "resources",
      error: safeError(error),
      ...(diagnostics ? { diagnostics } : {}),
    };
  } else if (isProtocolError(error)) {
    failure = {
      kind: "resources_protocol_error",
      operation: "resources",
      error: safeError(error),
      ...(diagnostics ? { diagnostics } : {}),
    };
  } else if (
    isCode(error, "MEDIA_CONFIG_NOT_SET") ||
    isCode(error, "MEDIA_CONFIG_INVALID") ||
    isCode(error, "MEDIA_ENDPOINT_REQUIRED") ||
    isCode(error, "MEDIA_HTTP_CONFIRMATION_REQUIRED") ||
    isCode(error, "MEDIA_SUPPLIER_PORT_UNAVAILABLE")
  ) {
    failure = {
      kind: "configuration_error",
      operation: "resources",
      error: safeError(error),
      ...(diagnostics ? { diagnostics } : {}),
    };
  } else {
    failure = {
      kind: "transport_error",
      operation: "resources",
      error: safeError(error),
      ...(diagnostics ? { diagnostics } : {}),
    };
  }
  reportResourceFailureDiagnostic(code, failure.kind, diagnostics);
  return failure;
}

function reportResourceFailureDiagnostic(code, kind, diagnostics) {
  const metadata = {
    operation: "resources",
    failureStage: failureStage(kind),
    errorCode: code,
  };
  if (diagnostics) {
    if (diagnostics.endpointPath) metadata.endpointPath = diagnostics.endpointPath;
    else if (diagnostics.path) metadata.endpointPath = diagnostics.path;
    for (const key of [
      "phase",
      "supplierCode",
      "supplierStatus",
      "supplierSuccess",
      "supplierOk",
      "topLevelFields",
      "dataType",
      "dataFields",
      "candidateListFields",
      "paginationFields",
    ]) {
      if (diagnostics[key] !== undefined) metadata[key] = diagnostics[key];
    }
    if (diagnostics.httpStatus !== undefined) metadata.httpStatus = diagnostics.httpStatus;
    else if (diagnostics.status !== undefined) metadata.httpStatus = diagnostics.status;
    if (diagnostics.itemCount !== undefined) metadata.itemCount = diagnostics.itemCount;
  }
  reportDiagnostic({
    code: "MEDIA_RESOURCE_REFRESH_FAILED",
    module: "media-supplier-adapter",
    category: MEDIA_ERROR_DEFINITIONS[code]
      ? MEDIA_ERROR_DEFINITIONS[code].category
      : "transport",
    operationId: "media-resource-refresh",
    metadata,
  });
}

function failureStage(kind) {
  if (kind === "configuration_error") return "configuration";
  if (kind === "resources_rejected") return "supplier-rejection";
  if (kind === "resources_protocol_error") return "supplier-protocol";
  if (kind === "resources_normalization_failed") return "normalization";
  return "transport";
}

function queryFailure(error) {
  if (error instanceof MediaSupplierRejectedError) {
    return { kind: "order_details_rejected", scope: error.scope };
  }
  if (isCode(error, "MEDIA_REMOTE_REJECTED")) {
    return { kind: "order_details_rejected", scope: "service" };
  }
  return { kind: "transport_error", operation: "order_details", error: safeError(error) };
}

function creationFailure(error) {
  if (isCode(error, "MEDIA_SUPPLIER_INPUT_INVALID")) return invalidFailure(error);
  if (error instanceof MediaSupplierRejectedError) {
    return { kind: "order_rejected", scope: error.scope };
  }
  if (isCode(error, "MEDIA_REMOTE_REJECTED")) return { kind: "order_rejected", scope: "service" };
  if (isProtocolError(error)) return { kind: "uncertain", reason: "protocol", error: safeError(error) };
  return uncertainFailure(error);
}

function invalidFailure(error) { return { kind: "invalid_input", error: safeError(error) }; }

function configurationFailure(error) {
  return { kind: "configuration_error", error: safeError(error) };
}

function uncertainFailure(error) {
  return {
    kind: "uncertain",
    reason: "transport",
    error: safeError(error),
  };
}

function safeError(error) {
  if (error instanceof MediaSupplierRejectedError) {
    return {
      code: error.code,
      scope: error.scope,
      retryability: "never",
    };
  }
  const code = safeErrorCode(error);
  const definition = MEDIA_ERROR_DEFINITIONS[code];
  return {
    code,
    scope: scopeForDefinition(definition),
    retryability: definition ? definition.retryability : "manual-check",
  };
}

function scopeForDefinition(definition) {
  if (!definition) return "transport";
  if (definition.category === "remote") return "service";
  if (definition.category === "validation") return "validation";
  if (definition.category === "internal") return "internal";
  return "transport";
}

function safeErrorCode(error) {
  const code = error && typeof error.code === "string" ? error.code : "MEDIA_SUPPLIER_TRANSPORT_ERROR";
  return MEDIA_ERROR_DEFINITIONS[code] ? code : "MEDIA_SUPPLIER_TRANSPORT_ERROR";
}

function isCode(error, code) { return Boolean(error && error.code === code); }

function isProtocolError(error) { return error instanceof MediaSupplierProtocolError || isCode(error, "MEDIA_PROTOCOL_ERROR"); }

module.exports = { createMediaSupplierAdapter };
