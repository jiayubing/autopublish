const { MediaClient } = require("../../src/platforms/media/media-client");
const { MediaResourceStore } = require("../../src/platforms/media/media-resource-store");
const { MediaPoolStore } = require("../../src/platforms/media/media-pool-store");

const {
  boundedPageSize,
  canonicalPrice,
  extractBalanceValue,
  extractPaginationMetadata,
  extractResourceItems,
  firstText,
  hasResourceId,
  normalizePositiveInteger,
  paginate,
  pickValue,
  serviceError,
} = require("./media-resource-helpers");

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 100;
const MAX_REMOTE_PAGES = 200;
const MAX_RESOURCE_IDS = 20000;
const MEDIA_RESOURCE_TYPES = new Set(["image", "video", "audio", "document"]);

function canonicalResourceFingerprint(resource) {
  const value = resource || {};
  return require("node:crypto")
    .createHash("sha256")
    .update(JSON.stringify({
      resourceId: String(value.resourceId || ""),
      name: String(value.name || ""),
      price: value.price === undefined ? null : value.price,
      available: value.available !== false,
      remarks: String(value.remarks || ""),
      publishRate: value.publishRate === undefined ? null : value.publishRate,
      publishTime: value.publishTime === undefined ? null : value.publishTime,
      caseLink: value.caseLink === undefined ? null : value.caseLink,
    }))
    .digest("hex");
}

function createMediaResourceService(opts) {
  opts = opts || {};
  var resourceStore = opts.resourceStore || new MediaResourceStore({ filePath: opts.resourceStorePath });
  var poolStore = opts.poolStore || new MediaPoolStore({ filePath: opts.poolStorePath });
  var supplierProvider = typeof opts.supplierProvider === "function"
    ? opts.supplierProvider
    : null;
  var clientProvider = typeof opts.clientProvider === "function"
    ? opts.clientProvider
    : function() { return opts.client || (opts.apiKey ? createClient(opts) : null); };

  function getClient() {
    var client = clientProvider();
    if (!client) {
      var error = new Error("付费媒体配置未设置");
      error.code = "MEDIA_CONFIG_NOT_SET";
      throw error;
    }
    return client;
  }

  function normalizeResource(resource) {
    var input = resource || {};
    var resourceId = firstText(input.resourceId, input.resource_id, input.id, input.nid, input.resource_id_str);
    var normalized = {
      resourceId: resourceId,
      name: firstText(input.name, input.title, input.resource_name, input.resourceName),
      price: canonicalPrice(pickValue(input.price, input.cost, input.amount, input.fee)),
      remarks: pickValue(input.remarks, input.remark, input.note),
      publishRate: pickValue(input.publishRate, input.publish_rate),
      publishTime: pickValue(input.publishTime, input.publish_time),
      caseLink: pickValue(input.caseLink, input.case_link)
    };
    var type = firstText(input.type, input.mediaType, input.channelType);
    if (MEDIA_RESOURCE_TYPES.has(type)) normalized.type = type;
    return preserveAvailability(normalized, input);
  }

  function getCachedResourcePage(opts) {
    var page = normalizePositiveInteger(opts && opts.page, 1);
    var pageSize = boundedPageSize(opts && opts.pageSize, DEFAULT_PAGE_SIZE);
    return paginate(readCachedResources(resourceStore), page, pageSize);
  }

  function searchResourcePage(opts) {
    opts = opts || {};
    var keyword = String(opts.keyword == null ? "" : opts.keyword).trim().toLowerCase();
    var page = normalizePositiveInteger(opts.page, 1);
    var pageSize = boundedPageSize(opts.pageSize, DEFAULT_PAGE_SIZE);
    var resources = readCachedResources(resourceStore);
    if (keyword) {
      resources = resources.filter(function(resource) {
        return [resource.resourceId, resource.name, resource.remarks, resource.publishRate, resource.publishTime, resource.caseLink]
          .some(function(value) {
            return String(value == null ? "" : value).toLowerCase().indexOf(keyword) !== -1;
          });
      });
    }
    return paginate(resources, page, pageSize);
  }

  async function refreshResources(opts) {
    var client = supplierProvider ? null : getClient();

    opts = opts || {};
    if (Object.prototype.hasOwnProperty.call(opts, "maxPages") || Object.prototype.hasOwnProperty.call(opts, "maxResources")) {
      throw serviceError("MEDIA_RESOURCE_REFRESH_OPTIONS_INVALID", "Media resource refresh limits are controlled by main");
    }
    var fetchAll = !!opts.fetchAll;
    var pageSizeHint = boundedPageSize(opts.pageSizeHint, DEFAULT_PAGE_SIZE);
    var page = 1;
    var allResources = [];
    var seenResourceIds = new Set();
    var seenPageFingerprints = new Set();
    var diagnostics = [];
    var truncated = false;
    var truncationReason = null;
    var pageCount = 0;
    var reportedTotal = null;
    var observedProviderPageSize = null;

    while (page <= MAX_REMOTE_PAGES) {
      var response = await fetchResourcePage(client, page, pageSizeHint);
      var normalizedItems = extractResourceItems(response).map(normalizeResource);
      var invalidPriceCount = normalizedItems.filter(function(resource) {
        return resource.resourceId && resource.price === undefined;
      }).length;
      if (invalidPriceCount) diagnostics.push({ code: "MEDIA_RESOURCE_PRICE_INVALID", page: page, count: invalidPriceCount });
      var pageItems = normalizedItems.filter(hasResourceId);
      var paginationMetadata = extractPaginationMetadata(response);
      pageCount += 1;
      var fingerprint = pageItems.map(function(resource) { return resource.resourceId; }).join("\u001f");
      if (pageItems.length > 0 && seenPageFingerprints.has(fingerprint)) {
        diagnostics.push({ code: "MEDIA_RESOURCE_REPEATED_PAGE", page: page });
        truncated = true;
        truncationReason = "repeated-page";
        break;
      }
      if (pageItems.length > 0) seenPageFingerprints.add(fingerprint);

      var duplicateCount = 0;
      if (pageItems.length > pageSizeHint) {
        diagnostics.push({ code: "MEDIA_RESOURCE_REMOTE_PAGE_OVERSIZED", page: page, count: pageItems.length });
      }
      for (var itemIndex = 0; itemIndex < pageItems.length; itemIndex++) {
        var resource = pageItems[itemIndex];
        if (seenResourceIds.has(resource.resourceId)) {
          duplicateCount += 1;
          continue;
        }
        if (allResources.length >= MAX_RESOURCE_IDS) {
          truncated = true;
          truncationReason = "max-resources";
          diagnostics.push({ code: "MEDIA_RESOURCE_MAX_RESOURCES_REACHED", page: page, loadedCount: allResources.length });
          break;
        }
        seenResourceIds.add(resource.resourceId);
        allResources.push(resource);
      }
      if (duplicateCount > 0) diagnostics.push({ code: "MEDIA_RESOURCE_DUPLICATE_IDS", page: page, count: duplicateCount });
      if (truncated) break;

      if (paginationMetadata.total !== null) {
        if (reportedTotal === null) reportedTotal = paginationMetadata.total;
        else if (reportedTotal !== paginationMetadata.total) {
          diagnostics.push({ code: "MEDIA_RESOURCE_TOTAL_CONTRADICTION", page: page });
        }
      }

      if (!fetchAll) {
        break;
      }

      if (observedProviderPageSize === null && pageItems.length > 0 &&
          pageItems.length < pageSizeHint && paginationMetadata.total === null && paginationMetadata.hasNext === null) {
        observedProviderPageSize = pageItems.length;
        diagnostics.push({ code: "MEDIA_RESOURCE_PROVIDER_PAGE_SIZE_MISMATCH", page: page, count: pageItems.length });
      }
      var effectivePageSize = observedProviderPageSize || pageSizeHint;
      var shortPage = pageItems.length < effectivePageSize;
      var totalClaimsMore = reportedTotal !== null && allResources.length < reportedTotal;
      if (shortPage && (totalClaimsMore || paginationMetadata.hasNext === true)) {
        diagnostics.push({ code: "MEDIA_RESOURCE_SHORT_PAGE_CONTRADICTION", page: page });
      }
      if (paginationMetadata.hasNext === false && totalClaimsMore) {
        diagnostics.push({ code: "MEDIA_RESOURCE_HAS_NEXT_CONTRADICTION", page: page });
        diagnostics.push({ code: "MEDIA_RESOURCE_TOTAL_CONTRADICTION", page: page });
        truncated = true;
        truncationReason = "provider-metadata-conflict";
        break;
      }
      if (paginationMetadata.hasNext === true && reportedTotal !== null && allResources.length >= reportedTotal) {
        diagnostics.push({ code: "MEDIA_RESOURCE_HAS_NEXT_CONTRADICTION", page: page });
        diagnostics.push({ code: "MEDIA_RESOURCE_TOTAL_CONTRADICTION", page: page });
        truncated = true;
        truncationReason = "provider-metadata-conflict";
        break;
      }
      if (paginationMetadata.hasNext === false || (reportedTotal !== null && allResources.length >= reportedTotal)) break;
      if (pageItems.length === 0 && totalClaimsMore) {
        truncated = true;
        truncationReason = "provider-metadata-conflict";
        break;
      }
      if (shortPage && !totalClaimsMore && paginationMetadata.hasNext !== true) break;
      if (page === MAX_REMOTE_PAGES) {
        truncated = true;
        truncationReason = "max-pages";
        diagnostics.push({ code: "MEDIA_RESOURCE_MAX_PAGES_REACHED", page: page, loadedCount: allResources.length });
        break;
      }
      page++;
    }

    var refreshedAt = new Date().toISOString();
    var status = truncated ? "truncated" : "complete";
    resourceStore.setAll(allResources, {
      total: allResources.length,
      pageSizeHint: pageSizeHint,
      pageCount: pageCount,
      refreshedAt: refreshedAt,
      status: status,
      complete: !truncated,
      truncated: truncated,
      truncationReason: truncationReason,
      diagnostics: diagnostics
    });

    return {
      ok: true,
      status: status,
      complete: !truncated,
      truncated: truncated,
      truncationReason: truncationReason,
      pageCount: pageCount,
      resourceCount: allResources.length,
      diagnostics: diagnostics,
      refreshedAt: refreshedAt
    };
  }

  async function queryCurrentResource(resourceId) {
    var requestedId = firstText(resourceId);
    if (!requestedId || requestedId.length > 128) {
      throw serviceError("MEDIA_RESOURCE_ID_INVALID", "Media resource identity is invalid");
    }
    var client = supplierProvider ? null : getClient();
    for (var page = 1; page <= MAX_REMOTE_PAGES; page += 1) {
      var response = await fetchResourcePage(client, page, DEFAULT_PAGE_SIZE);
      var resources = extractResourceItems(response)
        .map(normalizeResource)
        .filter(hasResourceId);
      var found = resources.find(function(resource) { return resource.resourceId === requestedId; });
      if (found) return Object.freeze(Object.assign({}, found, {
        fingerprint: canonicalResourceFingerprint(found),
      }));
      var metadata = extractPaginationMetadata(response);
      var hasNext = metadata.hasNext === true ||
        (metadata.hasNext === null && metadata.total !== null && page * DEFAULT_PAGE_SIZE < metadata.total) ||
        (metadata.hasNext === null && metadata.total === null && resources.length >= DEFAULT_PAGE_SIZE);
      if (!hasNext) break;
    }
    throw serviceError("MEDIA_RESOURCE_NOT_FOUND", "Media resource is unavailable");
  }

  async function fetchResourcePage(client, page, pageSize) {
    if (!supplierProvider) return client.mediaList({ page: page, pageSize: pageSize });
    var result = await supplierProvider().refreshMediaResources({ page: page, pageSize: pageSize });
    if (!result || result.kind !== "resources_refreshed") {
      throw serviceError("MEDIA_RESOURCE_REFRESH_FAILED", "Media resource refresh failed");
    }
    return {
      data: result.resources,
      total: result.total,
      page: result.page,
      page_size: result.pageSize,
      ...(typeof result.hasNext === "boolean" ? { hasNext: result.hasNext } : {}),
    };
  }

  function getPoolPage(opts) {
    opts = opts || {};
    var page = normalizePositiveInteger(opts.page, 1);
    var pageSize = boundedPageSize(opts.pageSize, DEFAULT_PAGE_SIZE);
    var entries = readPoolEntries(poolStore);
    if (entries.length > MAX_RESOURCE_IDS) {
      throw serviceError("MEDIA_POOL_CAPACITY_EXCEEDED", "Media pool exceeds the supported capacity");
    }
    var total = entries.length;
    var totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
    var resolvedPage = totalPages === 0 ? 1 : Math.min(page, totalPages);
    var start = (resolvedPage - 1) * pageSize;
    var result = {
      items: entries.slice(start, start + pageSize).map(normalizePoolEntry),
      page: resolvedPage,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages,
      hasPrev: resolvedPage > 1 && totalPages > 0,
      hasNext: resolvedPage < totalPages
    };
    var requestedIds = Array.isArray(opts.resourceIds) ? opts.resourceIds.slice(0, MAX_PAGE_SIZE) : [];
    var requested = new Set(requestedIds);
    var memberIds = new Set();
    entries.forEach(function(entry) {
      var resourceId = poolEntryId(entry);
      if (requested.has(resourceId)) memberIds.add(resourceId);
    });
    result.memberResourceIds = requestedIds.filter(function(resourceId) { return memberIds.has(resourceId); });
    return result;
  }

  function addToPool(resource) {
    var normalized = normalizeResource(resource);
    if (normalized.price === undefined)
      throw serviceError("MEDIA_RESOURCE_PRICE_INVALID", "Media resource price is invalid");
    poolStore.add(toPoolStoreShape(normalized), { note: normalized.remarks });
    return normalized;
  }

  function removeFromPool(resourceId) {
    poolStore.remove(resourceId);
  }

  function getBalance() {
    var client = getClient();
    return client.getBalance().then(function(response) {
      return {
        balance: extractBalanceValue(response)
      };
    });
  }

  return {
    normalizeResource: normalizeResource,
    getCachedResourcePage: getCachedResourcePage,
    searchResourcePage: searchResourcePage,
    refreshResources: refreshResources,
    queryCurrentResource: queryCurrentResource,
    getPoolPage: getPoolPage,
    addToPool: addToPool,
    removeFromPool: removeFromPool,
    getBalance: getBalance
  };
}

function createClient(opts) {
  var options = opts || {};
  return new MediaClient({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs,
    allowInsecure: options.allowInsecure
  });
}

function readCachedResources(store) {
  var data = store ? store.getAll() : null;
  var resources = Array.isArray(data && data.resources) ? data.resources : [];
  return resources.map(normalizeResourceShape).filter(hasResourceId);
}

function readPoolEntries(store) {
  var entries = store ? store.getAll() : null;
  return Array.isArray(entries) ? entries : [];
}

function poolEntryId(entry) {
  return firstText(entry && (entry.resourceId || entry.resource_id || entry.id || entry.nid));
}

function normalizeResourceShape(resource) {
  var normalized = {
    resourceId: firstText(resource && (resource.resourceId || resource.resource_id || resource.id || resource.nid)),
    name: firstText(resource && (resource.name || resource.title || resource.resource_name || resource.resourceName)),
    price: canonicalPrice(resource && resource.price),
    remarks: resource && (resource.remarks !== undefined ? resource.remarks : resource.remark),
    publishRate: resource && (resource.publishRate !== undefined ? resource.publishRate : resource.publish_rate),
    publishTime: resource && (resource.publishTime !== undefined ? resource.publishTime : resource.publish_time),
    caseLink: resource && (resource.caseLink !== undefined ? resource.caseLink : resource.case_link)
  };
  var type = firstText(resource && (resource.type || resource.mediaType || resource.channelType));
  if (MEDIA_RESOURCE_TYPES.has(type)) normalized.type = type;
  return preserveAvailability(normalized, resource);
}

function normalizePoolEntry(entry) {
  var name = entry && (entry.name || entry.title || entry.resource_name || entry.resourceName);
  var normalized = {
    resourceId: poolEntryId(entry),
    name: firstText(name),
    price: canonicalPrice(entry && entry.price),
    remarks: entry && (entry.remarks !== undefined ? entry.remarks : entry.remark !== undefined ? entry.remark : entry.note),
    publishRate: entry && (entry.publishRate !== undefined ? entry.publishRate : entry.publish_rate),
    publishTime: entry && (entry.publishTime !== undefined ? entry.publishTime : entry.publish_time),
    caseLink: entry && (entry.caseLink !== undefined ? entry.caseLink : entry.case_link)
  };
  var type = firstText(entry && (entry.type || entry.mediaType || entry.channelType));
  if (MEDIA_RESOURCE_TYPES.has(type)) normalized.type = type;
  return preserveAvailability(normalized, entry);
}

function toPoolStoreShape(resource) {
  var normalized = {
    resourceId: resource.resourceId,
    id: resource.resourceId,
    resource_id: resource.resourceId,
    name: resource.name,
    title: resource.name,
    price: resource.price,
    remarks: resource.remarks,
    publishRate: resource.publishRate,
    publishTime: resource.publishTime,
    caseLink: resource.caseLink
  };
  if (MEDIA_RESOURCE_TYPES.has(resource.type)) normalized.type = resource.type;
  if (typeof resource.available === "boolean") normalized.available = resource.available;
  return normalized;
}

function preserveAvailability(normalized, resource) {
  if (resource && typeof resource.available === "boolean") normalized.available = resource.available;
  return normalized;
}

module.exports = { createMediaResourceService, resourceFingerprint: canonicalResourceFingerprint };
