"use strict";

const { parseImagePlanV1 } = require("../../src/content/image-plan-v1");

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

function exactObject(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw fail(code);
  const actual = Object.keys(value).sort();
  const expected = keys.slice().sort();
  if (
    actual.length !== expected.length ||
    actual.some(function (key, index) {
      return key !== expected[index];
    })
  )
    throw fail(code);
  return value;
}

function validateSelectionPort(value) {
  exactObject(value, ["select"], "REGULAR_IMAGE_SELECTION_PORT_INVALID");
  if (typeof value.select !== "function")
    throw fail("REGULAR_IMAGE_SELECTION_PORT_INVALID");
  return value;
}

function validateInput(input) {
  exactObject(
    input,
    ["clientId", "imageCount"],
    "REGULAR_IMAGE_PLAN_INPUT_INVALID",
  );
  return input;
}

function safeWarning(code, stage) {
  return Object.freeze({ code, stage });
}

function emptyPlan(requestedCount, warnings) {
  return parseImagePlanV1({
    version: 1,
    requestedCount,
    selectedCount: 0,
    textOnly: true,
    images: [],
    warnings,
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

function selectionImages(selection, request) {
  exactObject(
    selection,
    ["version", "clientId", "requestedCount", "images", "warnings"],
    "REGULAR_IMAGE_PLAN_LIBRARY_RESULT_INVALID",
  );
  if (
    selection.version !== 1 ||
    selection.clientId !== request.clientId ||
    selection.requestedCount !== request.imageCount ||
    !Array.isArray(selection.images) ||
    selection.images.length > request.imageCount ||
    !Array.isArray(selection.warnings)
  )
    throw fail("REGULAR_IMAGE_PLAN_LIBRARY_RESULT_INVALID");
  const warnings = selection.warnings.map(function (warning) {
    exactObject(
      warning,
      ["code", "stage"],
      "REGULAR_IMAGE_PLAN_LIBRARY_RESULT_INVALID",
    );
    if (
      warning.code !== "CLIENT_IMAGE_SELECTION_SCAN_DEGRADED" ||
      warning.stage !== "scan"
    )
      throw fail("REGULAR_IMAGE_PLAN_LIBRARY_RESULT_INVALID");
    return safeWarning("REGULAR_IMAGE_PLAN_SCAN_DEGRADED", "scan");
  });
  if (selection.images.length === 0 && request.imageCount > 0)
    warnings.push(safeWarning("REGULAR_IMAGE_PLAN_EMPTY", "selection"));
  try {
    return parseImagePlanV1({
      version: 1,
      requestedCount: request.imageCount,
      selectedCount: selection.images.length,
      textOnly: selection.images.length === 0,
      images: selection.images,
      warnings,
    });
  } catch (error) {
    if (error && error.code === "IMAGE_PLAN_V1_INVALID")
      throw fail("REGULAR_IMAGE_PLAN_LIBRARY_RESULT_INVALID");
    throw error;
  }
}

function createRegularImagePlanService(options) {
  const value = options || {};
  const imageSelectionPort = validateSelectionPort(value.imageSelectionPort);
  if (value.random !== undefined && typeof value.random !== "function")
    throw fail("REGULAR_IMAGE_PLAN_RANDOM_INVALID");

  function createPlan(input) {
    const request = validateInput(input);
    let selection;
    try {
      selection = imageSelectionPort.select({
        clientId: request.clientId,
        count: request.imageCount,
        ...(value.random ? { random: value.random } : {}),
      });
    } catch (error) {
      if (!isRecoverableImageLibraryFailure(error)) throw error;
      return unavailablePlan(request.imageCount);
    }
    return selectionImages(selection, request);
  }

  return Object.freeze({ createPlan });
}

module.exports = Object.freeze({
  createRegularImagePlanService,
  isRecoverableImageLibraryFailure,
  unavailablePlan,
});
