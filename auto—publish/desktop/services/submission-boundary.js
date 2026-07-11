function inputError(code, message) {
  var error = new Error(message || "Invalid submission input");
  error.code = code || "SUBMISSION_INPUT_INVALID";
  return error;
}

function hasOnlyKeys(value, keys) {
  return Object.keys(value).every(function(key) { return keys.indexOf(key) !== -1; });
}

function validateFilename(filename) {
  if (typeof filename !== "string" || !filename || filename.trim() !== filename) throw inputError();
  return filename;
}

function validateIdList(ids) {
  if (!Array.isArray(ids) || !ids.length || !ids.every(function(id) { return typeof id === "string" && id && id.trim() === id; })) throw inputError();
  return ids.slice();
}

function validateMediaSubmission(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !hasOnlyKeys(value, ["filename", "resourceIds", "draftRevision"])) throw inputError();
  var output = { filename: validateFilename(value.filename), resourceIds: validateIdList(value.resourceIds) };
  if (value.draftRevision !== undefined) {
    if (typeof value.draftRevision !== "string" || !value.draftRevision) throw inputError();
    output.draftRevision = value.draftRevision;
  }
  return output;
}

function validatePlatformSubmission(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !hasOnlyKeys(value, ["sourcePlatformId", "filename", "targetPlatformIds"])) throw inputError();
  if (typeof value.sourcePlatformId !== "string" || !value.sourcePlatformId || value.sourcePlatformId.trim() !== value.sourcePlatformId) throw inputError();
  return {
    sourcePlatformId: value.sourcePlatformId,
    filename: validateFilename(value.filename),
    targetPlatformIds: validateIdList(value.targetPlatformIds)
  };
}

function validateDraft(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !hasOnlyKeys(value, ["title", "remark", "ignoreImages", "selectedResources"])) throw inputError("DRAFT_INVALID", "Invalid draft");
  var draft = {};
  if (value.title !== undefined) {
    if (typeof value.title !== "string") throw inputError("DRAFT_INVALID", "Invalid draft");
    draft.title = value.title;
  }
  if (value.remark !== undefined) {
    if (typeof value.remark !== "string") throw inputError("DRAFT_INVALID", "Invalid draft");
    draft.remark = value.remark;
  }
  if (value.ignoreImages !== undefined) {
    if (typeof value.ignoreImages !== "boolean") throw inputError("DRAFT_INVALID", "Invalid draft");
    draft.ignoreImages = value.ignoreImages;
  }
  if (value.selectedResources !== undefined) {
    if (!Array.isArray(value.selectedResources)) throw inputError("DRAFT_INVALID", "Invalid draft");
    draft.selectedResources = value.selectedResources.map(function(resource) {
      if (!resource || typeof resource !== "object" || Array.isArray(resource) || !hasOnlyKeys(resource, ["resourceId", "name", "price"]) ||
          typeof resource.resourceId !== "string" || !resource.resourceId ||
          (resource.name !== undefined && typeof resource.name !== "string") ||
          (resource.price !== undefined && typeof resource.price !== "number")) throw inputError("DRAFT_INVALID", "Invalid draft");
      var result = { resourceId: resource.resourceId };
      if (resource.name !== undefined) result.name = resource.name;
      if (resource.price !== undefined) result.price = resource.price;
      return result;
    });
  }
  return draft;
}

module.exports = { inputError, validateMediaSubmission, validatePlatformSubmission, validateDraft };
