"use strict";

const {
  assertClientId,
} = require("../../src/content/client-image-path-policy");
const {
  normalizeImageCount,
} = require("../../src/content/client-image-selector");
const {
  relativePathForImageId,
} = require("../../src/content/client-image-reference");

const RECOVERABLE_IMAGE_LIBRARY_CODES = new Set([
  "EACCES",
  "EIO",
  "ENOENT",
  "ENOTDIR",
  "EPERM",
  "CLIENT_NOT_FOUND",
  "CLIENT_IMAGE_MISSING",
  "CLIENT_IMAGE_NOT_FOUND",
  "CLIENT_IMAGE_PATH_OUT_OF_BOUNDS",
  "IMAGE_DIRECTORY_READ_FAILED",
  "IMAGE_FORMAT_INVALID",
  "IMAGE_FORMAT_MISMATCH",
  "IMAGE_FILE_TOO_LARGE",
  "IMAGE_READ_FAILED",
]);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function validateImageLibrary(value) {
  if (!value || typeof value.selectImages !== "function")
    throw fail("REGULAR_IMAGE_LIBRARY_INVALID");
  return value;
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw fail("REGULAR_IMAGE_PLAN_INPUT_INVALID");
  if (!Object.prototype.hasOwnProperty.call(input, "imageCount"))
    throw fail("REGULAR_IMAGE_PLAN_INPUT_INVALID");
  return {
    clientId: assertClientId(input.clientId),
    imageCount: normalizeImageCount(input.imageCount),
  };
}

function safeImage(image) {
  if (
    !image ||
    typeof image.id !== "string" ||
    !relativePathForImageId(image.id) ||
    typeof image.name !== "string" ||
    !image.name ||
    /[\\/\0]/.test(image.name) ||
    typeof image.extension !== "string" ||
    !/^\.[a-z0-9]+$/i.test(image.extension) ||
    typeof image.mimeType !== "string" ||
    !/^image\/[a-z0-9.+-]+$/i.test(image.mimeType) ||
    !Number.isInteger(image.width) ||
    image.width < 1 ||
    !Number.isInteger(image.height) ||
    image.height < 1 ||
    !Number.isInteger(image.size) ||
    image.size < 0
  )
    throw fail("REGULAR_IMAGE_PLAN_LIBRARY_RESULT_INVALID");
  return Object.freeze({
    imageId: image.id,
    name: image.name,
    extension: image.extension,
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    size: image.size,
  });
}

function safeWarning(code, stage) {
  return Object.freeze({ code, stage });
}

function emptyPlan(requestedCount, warnings) {
  return Object.freeze({
    requestedCount,
    selectedCount: 0,
    textOnly: true,
    images: Object.freeze([]),
    warnings: Object.freeze(warnings),
  });
}

function unavailablePlan(requestedCount) {
  return emptyPlan(requestedCount, [
    safeWarning("REGULAR_IMAGE_PLAN_UNAVAILABLE", "selection"),
  ]);
}

function isRecoverableImageLibraryFailure(error) {
  return Boolean(
    error &&
    typeof error.code === "string" &&
    RECOVERABLE_IMAGE_LIBRARY_CODES.has(error.code),
  );
}

function createRegularImagePlanService(options) {
  const value = options || {};
  const imageLibrary = validateImageLibrary(value.imageLibrary);
  if (value.random !== undefined && typeof value.random !== "function")
    throw fail("REGULAR_IMAGE_PLAN_RANDOM_INVALID");

  function createPlan(input) {
    const request = validateInput(input);
    if (request.imageCount === 0) return emptyPlan(0, []);
    let selection;
    try {
      selection = imageLibrary.selectImages(request.clientId, {
        count: request.imageCount,
        random: value.random,
      });
    } catch (error) {
      if (!isRecoverableImageLibraryFailure(error)) throw error;
      return unavailablePlan(request.imageCount);
    }
    if (!selection || !Array.isArray(selection.images))
      throw fail("REGULAR_IMAGE_PLAN_LIBRARY_RESULT_INVALID");
    const images = selection.images.map(safeImage);
    if (
      images.length > request.imageCount ||
      new Set(images.map((image) => image.imageId)).size !== images.length
    )
      throw fail("REGULAR_IMAGE_PLAN_LIBRARY_RESULT_INVALID");
    const warnings = [];
    if (Array.isArray(selection.diagnostics) && selection.diagnostics.length)
      warnings.push(safeWarning("REGULAR_IMAGE_PLAN_SCAN_DEGRADED", "scan"));
    if (images.length === 0)
      warnings.push(safeWarning("REGULAR_IMAGE_PLAN_EMPTY", "selection"));
    return Object.freeze({
      requestedCount: request.imageCount,
      selectedCount: images.length,
      textOnly: images.length === 0,
      images: Object.freeze(images),
      warnings: Object.freeze(warnings),
    });
  }

  return Object.freeze({ createPlan });
}

module.exports = {
  createRegularImagePlanService,
  isRecoverableImageLibraryFailure,
  unavailablePlan,
};
