const DEFAULT_IMAGE_COUNT = 1;
const MIN_IMAGE_COUNT = 0;
const MAX_IMAGE_COUNT = 5;

function selectionError(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function normalizeImageCount(value) {
  const count = value === undefined ? DEFAULT_IMAGE_COUNT : value;
  if (
    !Number.isInteger(count) ||
    count < MIN_IMAGE_COUNT ||
    count > MAX_IMAGE_COUNT
  ) {
    throw selectionError(
      "CLIENT_IMAGE_COUNT_INVALID",
      "Image count must be an integer from 0 to 5",
    );
  }
  return count;
}

function randomIndex(random, length) {
  const value = random();
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  )
    throw selectionError(
      "CLIENT_IMAGE_RANDOM_INVALID",
      "Image random source must return a number from 0 to 1",
    );
  return Math.min(length - 1, Math.floor(value * length));
}

function selectImages(images, options) {
  const opts = options || {};
  const count = normalizeImageCount(opts.count);
  const random = typeof opts.random === "function" ? opts.random : Math.random;
  const excluded = new Set(
    Array.isArray(opts.excludeImageIds) ? opts.excludeImageIds : [],
  );
  const seen = new Set();
  const candidates = (Array.isArray(images) ? images : []).filter(
    function (image) {
      if (
        !image ||
        typeof image.id !== "string" ||
        seen.has(image.id) ||
        excluded.has(image.id)
      )
        return false;
      seen.add(image.id);
      return true;
    },
  );
  const remaining = candidates.slice();
  const selected = [];
  while (selected.length < count && remaining.length) {
    selected.push(
      remaining.splice(randomIndex(random, remaining.length), 1)[0],
    );
  }
  return {
    requestedCount: count,
    selectedCount: selected.length,
    availableCount: candidates.length,
    shortfall: Math.max(0, count - selected.length),
    textOnly: selected.length === 0,
    images: selected,
  };
}

module.exports = {
  DEFAULT_IMAGE_COUNT,
  MIN_IMAGE_COUNT,
  MAX_IMAGE_COUNT,
  normalizeImageCount,
  selectImages,
  selectionError,
};
