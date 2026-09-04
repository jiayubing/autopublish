"use strict";

const domain = require("../../src/domain");
const {
  isRecoverableImageLibraryFailure,
  unavailablePlan,
} = require("./regular-image-plan-service");

function fail(code, causeCode) {
  const error = new Error(code);
  error.code = code;
  if (typeof causeCode === "string" && /^[A-Z][A-Z0-9_]{1,127}$/.test(causeCode))
    error.causeCode = causeCode;
  return error;
}

function accountInspectionFailure(inspection) {
  const reason = inspection && inspection.reasonCode;
  const mapping = {
    ACCOUNT_PROFILE_NOT_BOUND: "REGULAR_ACCOUNT_PROFILE_NOT_BOUND",
    ACCOUNT_PROFILE_REMOTE_MISMATCH: "REGULAR_ACCOUNT_PROFILE_MISMATCH",
    ACCOUNT_PROFILE_IDENTITY_UNAVAILABLE: "REGULAR_ACCOUNT_IDENTITY_UNAVAILABLE",
    ACCOUNT_PROFILE_BINDING_UNAVAILABLE: "REGULAR_ACCOUNT_BINDING_UNAVAILABLE",
    ACCOUNT_PROFILE_BINDING_INVALID: "REGULAR_ACCOUNT_BINDING_UNAVAILABLE",
  };
  return fail(
    mapping[reason] || "REGULAR_ACCOUNT_PROFILE_UNVERIFIED",
    (inspection && (inspection.transportCauseCode || inspection.causeCode)) || null,
  );
}

function requestedImageCount(claim) {
  const imageCount = claim && claim.imageCount;
  return imageCount === undefined ? 0 : imageCount;
}

async function readPublicationProfile(profileContribution, input) {
  if (!profileContribution) return undefined;
  try {
    return await profileContribution.reader.read({
      clientId: input.articleIdentityV1 && input.articleIdentityV1.clientId,
    });
  } catch (error) {
    if (error && error.code === "CLIENT_PROFILE_NOT_FOUND")
      throw fail("REGULAR_CLIENT_PROFILE_INCOMPLETE", error.code);
    throw error;
  }
}

function createRegularPlatformPreparationPort(options) {
  const value = options || {};
  const inspector = value.accountInspector;
  const imagePlanService = value.regularImagePlanService;
  if (!inspector || typeof inspector.inspect !== "function")
    throw fail("REGULAR_ACCOUNT_INSPECTOR_REQUIRED");
  if (!imagePlanService || typeof imagePlanService.createPlan !== "function")
    throw fail("REGULAR_IMAGE_PLAN_SERVICE_REQUIRED");
  const adapters = new Map();
  for (const platform of value.regularSubmissionPorts || [])
    if (
      platform &&
      typeof platform.id === "string" &&
      typeof platform.preparePlatformSubmission === "function"
    )
      adapters.set(platform.id, platform);
  const profileReaders = new Map();
  for (const platform of value.clientProfileReaders || []) {
    if (
      !platform ||
      typeof platform.id !== "string" ||
      !platform.reader ||
      typeof platform.reader.read !== "function" ||
      !platform.requirement ||
      !Array.isArray(platform.requirement.requiredFields)
    )
      throw fail("REGULAR_CLIENT_PROFILE_READER_INVALID");
    profileReaders.set(platform.id, platform);
  }
  let queueRunToken = null;
  const inspectionCache = new Map();

  const port = {
    beginQueueRun(runId) {
      queueRunToken = typeof runId === "string" && runId ? runId : "queue-run";
      inspectionCache.clear();
    },
    endQueueRun() {
      queueRunToken = null;
      inspectionCache.clear();
    },
    async preparePlatformSubmission(claim) {
      const input = claim || {};
      const adapter = adapters.get(input.platformId);
      if (!adapter || typeof adapter.preparePlatformSubmission !== "function")
        throw fail("REGULAR_PLATFORM_PREPARATION_UNAVAILABLE");
      const inspectionTask = Object.freeze({
        targetPlatformId: input.platformId,
        accountProfileId: input.accountProfileId,
        preserveCurrentPage: false,
      });
      const inspectionKey = queueRunToken && [input.platformId, input.accountProfileId].join("\u0000");
      const inspection = inspectionKey && inspectionCache.has(inspectionKey)
        ? inspectionCache.get(inspectionKey)
        : await inspector.inspect(inspectionTask);
      if (inspectionKey && !inspectionCache.has(inspectionKey)) inspectionCache.set(inspectionKey, inspection);
      if (
        !inspection ||
        inspection.verified !== true ||
        inspection.accountProfileId !== input.accountProfileId ||
        typeof inspection.remoteFingerprint !== "string" ||
        !inspection.remoteFingerprint
      )
        throw accountInspectionFailure(inspection);
      const imageCount = requestedImageCount(input);
      let imagePlan;
      try {
        imagePlan = await imagePlanService.createPlan({
          clientId: input.articleIdentityV1 && input.articleIdentityV1.clientId,
          imageCount,
        });
      } catch (error) {
        if (!isRecoverableImageLibraryFailure(error)) throw error;
        imagePlan = unavailablePlan(imageCount);
      }
      const profileContribution = profileReaders.get(input.platformId);
      const publicationProfile = await readPublicationProfile(
        profileContribution,
        input,
      );
      if (
        profileContribution &&
        (!publicationProfile ||
          typeof publicationProfile !== "object" ||
          Array.isArray(publicationProfile) ||
          profileContribution.requirement.requiredFields.some(function (field) {
            return (
              typeof publicationProfile[field] !== "string" ||
              !publicationProfile[field].trim()
            );
          }))
      )
        throw fail("REGULAR_CLIENT_PROFILE_INCOMPLETE");
      const adapterInput = publicationProfile === undefined
        ? Object.assign({}, input)
        : Object.assign({}, input, { publicationProfile: publicationProfile });
      if (queueRunToken) adapterInput.preparationContextId = queueRunToken;
      const prepared = domain.createPreparedSubmission(
        await adapter.preparePlatformSubmission(adapterInput, imagePlan),
      );
      let finalInspection;
      try {
        finalInspection = await inspector.inspect(
          Object.assign({}, inspectionTask, {
            preserveCurrentPage: true,
          }),
        );
      } catch (_) {
        finalInspection = null;
      }
      if (
        !finalInspection ||
        finalInspection.verified !== true ||
        finalInspection.accountProfileId !== input.accountProfileId ||
        finalInspection.remoteFingerprint !== inspection.remoteFingerprint
      )
        throw accountInspectionFailure(finalInspection);
      return domain.createPreparedSubmission({
        preparedSubmissionEvidenceV1: prepared.preparedSubmissionEvidenceV1,
        submitPreparedPublication: prepared.submitPreparedPublication,
      });
    },
  };
  return Object.freeze(port);
}

module.exports = { createRegularPlatformPreparationPort };
