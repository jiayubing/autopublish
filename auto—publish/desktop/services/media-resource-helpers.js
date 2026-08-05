const MAX_PAGE_SIZE = 100;
const MAX_CANONICAL_PRICE = 100000000;

function firstText() {
  for (let index = 0; index < arguments.length; index += 1) {
    const value = arguments[index];
    if (value == null) continue;
    const normalized = String(value).trim();
    if (normalized) return normalized;
  }
  return "";
}

function pickValue() {
  for (let index = 0; index < arguments.length; index += 1)
    if (arguments[index] !== undefined) return arguments[index];
  return undefined;
}

function canonicalPrice(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number")
    return Number.isFinite(value) && value >= 0 && value <= MAX_CANONICAL_PRICE ? value : undefined;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(normalized)) return undefined;
  const price = Number(normalized);
  return Number.isFinite(price) && price >= 0 && price <= MAX_CANONICAL_PRICE ? price : undefined;
}

function normalizePositiveInteger(value, fallback) {
  const normalized = Number(value);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
}

function boundedPageSize(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > MAX_PAGE_SIZE)
    throw serviceError("MEDIA_RESOURCE_PAGE_SIZE_INVALID", "Media resource pageSize must be between 1 and 100");
  return normalized;
}

function serviceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
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

function extractPaginationMetadata(response) {
  const roots = [response];
  if (response && response.data && !Array.isArray(response.data)) roots.push(response.data);
  if (response && response.meta && !Array.isArray(response.meta)) roots.push(response.meta);
  if (response && response.pagination && !Array.isArray(response.pagination)) roots.push(response.pagination);
  let total = null;
  let hasNext = null;
  roots.forEach((root) => {
    if (!root || typeof root !== "object") return;
    if (total === null) total = firstNonNegativeInteger(root.total, root.totalCount, root.total_count);
    if (hasNext === null) hasNext = firstBoolean(root.hasNext, root.has_next, root.hasMore, root.has_more);
  });
  return { total, hasNext };
}

function firstNonNegativeInteger() {
  for (let index = 0; index < arguments.length; index += 1) {
    if (arguments[index] === undefined || arguments[index] === null) continue;
    const value = Number(arguments[index]);
    if (Number.isSafeInteger(value) && value >= 0) return value;
  }
  return null;
}

function firstBoolean() {
  for (let index = 0; index < arguments.length; index += 1)
    if (typeof arguments[index] === "boolean") return arguments[index];
  return null;
}

function paginate(resources, page, pageSize) {
  const total = resources.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  return {
    items: resources.slice(start, start + pageSize),
    page: totalPages === 0 ? 1 : Math.min(page, totalPages),
    pageSize,
    total,
    totalPages,
    hasPrev: page > 1 && totalPages > 0,
    hasNext: page < totalPages,
  };
}

function extractBalanceValue(response) {
  const data = response && response.data ? response.data : {};
  const nested = data && data.data ? data.data : {};
  return firstText(
    data.balance,
    data.money,
    data.amount,
    nested.balance,
    nested.money,
    nested.amount,
    response && response.balance,
    response && response.money,
    response && response.amount,
  );
}

function hasResourceId(resource) {
  return !!(resource && resource.resourceId);
}

module.exports = {
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
};
