"use strict";

const crypto = require("node:crypto");
const FormData = require("form-data");

const domain = require("../../domain");
const {
  relativePathForImageId,
} = require("../../content/client-image-reference");
const { readImageMetadata } = require("../../content/client-image-metadata");

const MAX_LIEJU_IMAGE_COUNT = 4;
const MAX_LIEJU_IMAGE_BYTES = 1024 * 1024;
const FILE_SLOT_NAME = /^local_file([1-9][0-9]*)$/;
const INSPECT = Symbol.for("nodejs.util.inspect.custom");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function exactKeys(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw fail(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.join("\0") !== expected.join("\0")) throw fail(code);
  return value;
}

function validImageName(value) {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 255 &&
    !/[\\/\0]/.test(value) &&
    value !== "." &&
    value !== ".."
  );
}

function validImagePlanImage(value) {
  exactKeys(
    value,
    ["imageId", "name", "extension", "mimeType", "width", "height", "size"],
    "LIEJU_IMAGE_PLAN_INVALID",
  );
  if (
    typeof value.imageId !== "string" ||
    !relativePathForImageId(value.imageId) ||
    !validImageName(value.name) ||
    typeof value.extension !== "string" ||
    !/^\.(?:png|jpe?g|webp)$/i.test(value.extension) ||
    !value.name.toLowerCase().endsWith(value.extension.toLowerCase()) ||
    !["image/png", "image/jpeg", "image/webp"].includes(value.mimeType) ||
    !Number.isInteger(value.width) ||
    value.width < 1 ||
    !Number.isInteger(value.height) ||
    value.height < 1 ||
    !Number.isInteger(value.size) ||
    value.size < 0
  )
    throw fail("LIEJU_IMAGE_PLAN_INVALID");
  return Object.freeze({
    imageId: value.imageId,
    name: value.name,
    extension: value.extension.toLowerCase(),
    mimeType: value.mimeType,
    width: value.width,
    height: value.height,
    size: value.size,
  });
}

function parseImagePlan(value) {
  exactKeys(
    value,
    ["requestedCount", "selectedCount", "textOnly", "images", "warnings"],
    "LIEJU_IMAGE_PLAN_INVALID",
  );
  if (
    !Number.isInteger(value.requestedCount) ||
    value.requestedCount < 0 ||
    value.requestedCount > 5 ||
    !Number.isInteger(value.selectedCount) ||
    value.selectedCount < 0 ||
    value.selectedCount > value.requestedCount ||
    typeof value.textOnly !== "boolean" ||
    !Array.isArray(value.images) ||
    value.images.length !== value.selectedCount ||
    !Array.isArray(value.warnings) ||
    value.textOnly !== (value.images.length === 0)
  )
    throw fail("LIEJU_IMAGE_PLAN_INVALID");
  const images = value.images.map(validImagePlanImage);
  if (new Set(images.map((image) => image.imageId)).size !== images.length)
    throw fail("LIEJU_IMAGE_PLAN_INVALID");
  return Object.freeze(images);
}

function parseFormControls(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.controls))
    throw fail("LIEJU_MULTIPART_FORM_INVALID");
  const controls = value.controls.map(function (control) {
    exactKeys(
      control,
      ["name", "type", "value"],
      "LIEJU_MULTIPART_FORM_INVALID",
    );
    if (
      typeof control.name !== "string" ||
      control.name.length < 1 ||
      control.name.length > 512 ||
      /[\0\r\n]/.test(control.name) ||
      typeof control.type !== "string" ||
      control.type.length < 1 ||
      control.type.length > 64 ||
      typeof control.value !== "string"
    )
      throw fail("LIEJU_MULTIPART_FORM_INVALID");
    return Object.freeze({
      name: control.name,
      type: control.type,
      value: control.value,
    });
  });
  return Object.freeze(controls);
}

function contiguousImageSlots(controls) {
  const slots = new Map();
  for (const control of controls) {
    if (control.type !== "file") continue;
    const match = control.name.match(FILE_SLOT_NAME);
    if (!match) continue;
    const slot = Number(match[1]);
    if (!Number.isSafeInteger(slot) || slots.has(slot))
      throw fail("LIEJU_MULTIPART_FORM_INVALID");
    slots.set(slot, control.name);
  }
  const names = [];
  for (
    let slot = 1;
    slot <= MAX_LIEJU_IMAGE_COUNT && slots.has(slot);
    slot += 1
  )
    names.push(slots.get(slot));
  return Object.freeze(names);
}

function parseOverrides(value, controls) {
  if (value === undefined) return new Map();
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw fail("LIEJU_MULTIPART_OVERRIDES_INVALID");
  const editable = new Set(
    controls
      .filter((control) => control.type !== "file" && control.type !== "hidden")
      .map((control) => control.name),
  );
  const overrides = new Map();
  for (const [name, fieldValue] of Object.entries(value)) {
    if (!editable.has(name) || typeof fieldValue !== "string")
      throw fail("LIEJU_MULTIPART_OVERRIDES_INVALID");
    overrides.set(name, fieldValue);
  }
  return overrides;
}

function imageWarning(code) {
  return Object.freeze({ code, stage: "delivery" });
}

function fingerprint(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function prepareImage(candidate, clientId, imageResolver, fsApi) {
  if (!imageResolver || typeof imageResolver.resolveImage !== "function")
    throw fail("LIEJU_IMAGE_RESOLVER_UNAVAILABLE");
  const resolved = imageResolver.resolveImage(clientId, candidate.imageId);
  if (!resolved || typeof resolved.filePath !== "string" || !resolved.filePath)
    throw fail("LIEJU_IMAGE_RESOLVE_INVALID");
  const metadata = readImageMetadata(resolved.filePath, fsApi);
  const bytes = fsApi.readFileSync(resolved.filePath);
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < 1 ||
    bytes.length > MAX_LIEJU_IMAGE_BYTES ||
    metadata.size !== bytes.length ||
    metadata.extension !== candidate.extension ||
    metadata.mimeType !== candidate.mimeType
  )
    throw fail("LIEJU_IMAGE_DELIVERY_INVALID");
  return Object.freeze({
    filename: candidate.name,
    mimeType: metadata.mimeType,
    bytes,
    assetFingerprint: fingerprint(bytes),
  });
}

function createMultipartCapability(controls, overrides, images) {
  let consumed = false;
  const capability = {
    consume: function () {
      if (consumed) throw fail("LIEJU_MULTIPART_PLAN_CONSUMED");
      consumed = true;
      const body = new FormData();
      for (const control of controls) {
        if (control.type === "file") continue;
        body.append(
          control.name,
          control.type === "hidden"
            ? control.value
            : (overrides.get(control.name) ?? control.value),
        );
      }
      for (const image of images) {
        body.append(image.fieldName, image.bytes, {
          filename: image.filename,
          contentType: image.mimeType,
          knownLength: image.bytes.length,
        });
      }
      return Object.freeze({
        body,
        headers: Object.freeze({ ...body.getHeaders() }),
      });
    },
  };
  Object.defineProperties(capability, {
    toJSON: {
      enumerable: false,
      value: function () {
        throw fail("LIEJU_MULTIPART_SERIALIZATION_FORBIDDEN");
      },
    },
    [INSPECT]: {
      enumerable: false,
      value: function () {
        return "[LiejuMultipartPlan]";
      },
    },
  });
  return Object.freeze(capability);
}

function prepareLiejuImageMultipart(input) {
  const value = input || {};
  if (typeof value.clientId !== "string" || !value.clientId)
    throw fail("LIEJU_IMAGE_PREPARATION_INPUT_INVALID");
  const baseEvidence = domain.parsePreparedSubmissionEvidenceV1(
    value.preparedSubmissionEvidenceV1,
  );
  const imagePlan = parseImagePlan(value.imagePlan);
  const controls = parseFormControls(value.form);
  const overrides = parseOverrides(value.formValueOverrides, controls);
  const slots = contiguousImageSlots(controls);
  const warnings = [];
  const images = [];

  for (const candidate of imagePlan) {
    if (images.length >= slots.length) {
      warnings.push(imageWarning("LIEJU_IMAGE_SLOT_CAPACITY_REACHED"));
      continue;
    }
    try {
      const image = prepareImage(
        candidate,
        value.clientId,
        value.imageResolver,
        value.fs || require("node:fs"),
      );
      images.push(
        Object.freeze({
          ...image,
          fieldName: slots[images.length],
          layoutSlot: images.length,
        }),
      );
    } catch (_) {
      warnings.push(imageWarning("LIEJU_IMAGE_DELIVERY_FAILED"));
    }
  }

  const preparedSubmissionEvidenceV1 = domain.parsePreparedSubmissionEvidenceV1(
    {
      ...baseEvidence,
      deliveryMode: images.length ? "with_images" : "text_only",
      images: images.map((image) => ({
        assetFingerprint: image.assetFingerprint,
        layoutSlot: image.layoutSlot,
      })),
      decisionKind: "initial",
    },
  );
  return Object.freeze({
    preparedSubmissionEvidenceV1,
    warnings: Object.freeze(warnings),
    multipart: createMultipartCapability(controls, overrides, images),
  });
}

module.exports = Object.freeze({
  MAX_LIEJU_IMAGE_BYTES,
  MAX_LIEJU_IMAGE_COUNT,
  prepareLiejuImageMultipart,
});
