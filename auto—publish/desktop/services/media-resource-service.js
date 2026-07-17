const { MediaClient } = require("../../src/platforms/media/media-client");
const { MediaResourceStore } = require("../../src/platforms/media/media-resource-store");
const { MediaPoolStore } = require("../../src/platforms/media/media-pool-store");

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 600;

function createMediaResourceService(opts) {
  opts = opts || {};
  var resourceStore = opts.resourceStore || new MediaResourceStore({ filePath: opts.resourceStorePath });
  var poolStore = opts.poolStore || new MediaPoolStore({ filePath: opts.poolStorePath });
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
    return {
      resourceId: resourceId,
      name: firstText(input.name, input.title, input.resource_name, input.resourceName),
      price: pickValue(input.price, input.cost, input.amount, input.fee),
      remarks: pickValue(input.remarks, input.remark, input.note),
      publishRate: pickValue(input.publishRate, input.publish_rate),
      publishTime: pickValue(input.publishTime, input.publish_time),
      caseLink: pickValue(input.caseLink, input.case_link),
      raw: cloneRaw(input)
    };
  }

  function getCachedResourcePage(opts) {
    var page = normalizePositiveInteger(opts && opts.page, 1);
    var pageSize = normalizePositiveInteger(opts && opts.pageSize, DEFAULT_PAGE_SIZE);
    return paginate(readCachedResources(resourceStore), page, pageSize);
  }

  function searchResourcePage(opts) {
    opts = opts || {};
    var keyword = String(opts.keyword == null ? "" : opts.keyword).trim().toLowerCase();
    var page = normalizePositiveInteger(opts.page, 1);
    var pageSize = normalizePositiveInteger(opts.pageSize, DEFAULT_PAGE_SIZE);
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
    var client = getClient();

    opts = opts || {};
    var fetchAll = !!opts.fetchAll;
    var pageSizeHint = normalizePositiveInteger(opts.pageSizeHint, DEFAULT_PAGE_SIZE);
    var maxPages = normalizePositiveInteger(opts.maxPages, DEFAULT_MAX_PAGES);
    var page = 1;
    var allResources = [];

    while (page <= maxPages) {
      var response = await client.mediaList({ page: page, pageSize: pageSizeHint });
      var pageItems = extractResourceItems(response).map(normalizeResource).filter(hasResourceId);
      allResources = allResources.concat(pageItems);
      if (!fetchAll || pageItems.length === 0) {
        break;
      }
      page++;
    }

    resourceStore.setAll(allResources, {
      total: allResources.length,
      pageSizeHint: pageSizeHint,
      pageCount: allResources.length === 0 ? 0 : Math.min(page, maxPages),
      refreshedAt: new Date().toISOString()
    });

    return {
      ok: true,
      pageCount: allResources.length === 0 ? 0 : Math.min(page, maxPages),
      resourceCount: allResources.length,
      resources: allResources
    };
  }

  function getPool() {
    return poolStore.getAll().map(normalizePoolEntry);
  }

  function addToPool(resource) {
    var normalized = normalizeResource(resource);
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
        balance: extractBalanceValue(response),
        raw: response
      };
    });
  }

  return {
    normalizeResource: normalizeResource,
    getCachedResourcePage: getCachedResourcePage,
    searchResourcePage: searchResourcePage,
    refreshResources: refreshResources,
    getPool: getPool,
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
    timeoutMs: options.timeoutMs
  });
}

function readCachedResources(store) {
  var data = store ? store.getAll() : null;
  var resources = Array.isArray(data && data.resources) ? data.resources : [];
  return resources.map(normalizeResourceShape);
}

function normalizeResourceShape(resource) {
  return {
    resourceId: firstText(resource && (resource.resourceId || resource.resource_id || resource.id || resource.nid)),
    name: firstText(resource && (resource.name || resource.title || resource.resource_name || resource.resourceName)),
    price: resource && resource.price,
    remarks: resource && (resource.remarks !== undefined ? resource.remarks : resource.remark),
    publishRate: resource && (resource.publishRate !== undefined ? resource.publishRate : resource.publish_rate),
    publishTime: resource && (resource.publishTime !== undefined ? resource.publishTime : resource.publish_time),
    caseLink: resource && (resource.caseLink !== undefined ? resource.caseLink : resource.case_link),
    raw: resource && resource.raw !== undefined ? cloneRaw(resource.raw) : cloneRaw(resource)
  };
}

function normalizePoolEntry(entry) {
  var resource = normalizeResourceShape(entry);
  return {
    resourceId: resource.resourceId,
    name: resource.name,
    price: resource.price,
    remarks: resource.remarks !== undefined ? resource.remarks : entry && entry.note,
    publishRate: resource.publishRate,
    publishTime: resource.publishTime,
    caseLink: resource.caseLink,
    raw: cloneRaw(entry)
  };
}

function toPoolStoreShape(resource) {
  return {
    resourceId: resource.resourceId,
    id: resource.resourceId,
    resource_id: resource.resourceId,
    name: resource.name,
    title: resource.name,
    price: resource.price,
    remarks: resource.remarks,
    publishRate: resource.publishRate,
    publishTime: resource.publishTime,
    caseLink: resource.caseLink,
    raw: resource.raw
  };
}

function extractResourceItems(response) {
  if (Array.isArray(response)) return response;
  if (response && Array.isArray(response.data)) return response.data;
  if (response && response.data && Array.isArray(response.data.list)) return response.data.list;
  if (response && response.data && Array.isArray(response.data.items)) return response.data.items;
  if (response && Array.isArray(response.list)) return response.list;
  if (response && Array.isArray(response.items)) return response.items;
  return [];
}

function paginate(resources, page, pageSize) {
  var total = resources.length;
  var totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  var start = (page - 1) * pageSize;
  return {
    items: resources.slice(start, start + pageSize),
    page: totalPages === 0 ? 1 : Math.min(page, totalPages),
    pageSize: pageSize,
    total: total,
    totalPages: totalPages,
    hasPrev: page > 1 && totalPages > 0,
    hasNext: page < totalPages
  };
}

function normalizePositiveInteger(value, fallback) {
  var normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function firstText() {
  for (var i = 0; i < arguments.length; i++) {
    var value = arguments[i];
    if (value == null) continue;
    var text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function pickValue() {
  for (var i = 0; i < arguments.length; i++) {
    if (arguments[i] !== undefined) return arguments[i];
  }
  return undefined;
}

function cloneRaw(value) {
  return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
}

function hasResourceId(resource) {
  return !!(resource && resource.resourceId);
}

function extractBalanceValue(response) {
  var data = response && response.data ? response.data : {};
  var nested = data && data.data ? data.data : {};
  return firstText(
    data.balance,
    data.money,
    data.amount,
    nested.balance,
    nested.money,
    nested.amount,
    response && response.balance,
    response && response.money,
    response && response.amount
  );
}

module.exports = { createMediaResourceService };
