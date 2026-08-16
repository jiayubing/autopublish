"use strict";

const IMAGE_PLAN_V1_WARNING_STAGES = Object.freeze({
  REGULAR_IMAGE_PLAN_EMPTY: "selection",
  REGULAR_IMAGE_PLAN_SCAN_DEGRADED: "scan",
  REGULAR_IMAGE_PLAN_UNAVAILABLE: "selection",
});
const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 100000;

function fail() {
  const error = new Error("IMAGE_PLAN_V1_INVALID");
  error.code = "IMAGE_PLAN_V1_INVALID";
  return error;
}

function exactObject(value, expectedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw fail();
  const actual = Object.keys(value).sort();
  const expected = expectedKeys.slice().sort();
  if (
    actual.length !== expected.length ||
    actual.some(function (key, index) {
      return key !== expected[index];
    })
  )
    throw fail();
  return value;
}

function parseImage(value) {
  exactObject(value, [
    "imageId",
    "name",
    "extension",
    "mimeType",
    "width",
    "height",
    "size",
  ]);
  const extension =
    typeof value.extension === "string" ? value.extension.toLowerCase() : "";
  const mimeTypeByExtension = {
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };
  if (
    typeof value.imageId !== "string" ||
    value.imageId.length > 4096 ||
    !/^client-image:[A-Za-z0-9_-]+$/.test(value.imageId) ||
    typeof value.name !== "string" ||
    value.name.length < 1 ||
    value.name.length > 255 ||
    value.name === "." ||
    value.name === ".." ||
    /[\\/\0]/.test(value.name) ||
    !Object.hasOwn(mimeTypeByExtension, extension) ||
    !value.name.toLowerCase().endsWith(extension) ||
    value.mimeType !== mimeTypeByExtension[extension] ||
    !Number.isInteger(value.width) ||
    value.width < 1 ||
    value.width > MAX_IMAGE_DIMENSION ||
    !Number.isInteger(value.height) ||
    value.height < 1 ||
    value.height > MAX_IMAGE_DIMENSION ||
    !Number.isInteger(value.size) ||
    value.size < 1 ||
    value.size > MAX_IMAGE_BYTES
  )
    throw fail();
  return Object.freeze({
    imageId: value.imageId,
    name: value.name,
    extension,
    mimeType: value.mimeType,
    width: value.width,
    height: value.height,
    size: value.size,
  });
}

function parseWarning(value) {
  exactObject(value, ["code", "stage"]);
  if (
    typeof value.code !== "string" ||
    IMAGE_PLAN_V1_WARNING_STAGES[value.code] !== value.stage
  )
    throw fail();
  return Object.freeze({ code: value.code, stage: value.stage });
}

function parseImagePlanV1(value) {
  exactObject(value, [
    "version",
    "requestedCount",
    "selectedCount",
    "textOnly",
    "images",
    "warnings",
  ]);
  if (
    value.version !== 1 ||
    !Number.isInteger(value.requestedCount) ||
    value.requestedCount < 0 ||
    value.requestedCount > 5 ||
    !Number.isInteger(value.selectedCount) ||
    value.selectedCount < 0 ||
    value.selectedCount > value.requestedCount ||
    typeof value.textOnly !== "boolean" ||
    !Array.isArray(value.images) ||
    value.images.length !== value.selectedCount ||
    value.textOnly !== (value.selectedCount === 0) ||
    !Array.isArray(value.warnings)
  )
    throw fail();
  const images = value.images.map(parseImage);
  if (
    new Set(
      images.map(function (image) {
        return image.imageId;
      }),
    ).size !== images.length
  )
    throw fail();
  return Object.freeze({
    version: 1,
    requestedCount: value.requestedCount,
    selectedCount: value.selectedCount,
    textOnly: value.textOnly,
    images: Object.freeze(images),
    warnings: Object.freeze(value.warnings.map(parseWarning)),
  });
}

module.exports = Object.freeze({
  IMAGE_PLAN_V1_WARNING_STAGES,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_DIMENSION,
  parseImagePlanV1,
});
