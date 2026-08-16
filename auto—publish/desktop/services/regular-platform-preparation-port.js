"use strict";

const domain = require("../../src/domain");
const {
  isRecoverableImageLibraryFailure,
  unavailablePlan,
} = require("./regular-image-plan-service");

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function requestedImageCount(claim) {
  const imageCount = claim && claim.imageCount;
  return imageCount === undefined ? 0 : imageCount;
}

function createRegularPlatformPreparationPort(options) {
  const value = options || {};
  const inspector = value.accountInspector;
  const resolveClientPublicationProfile = value.resolveClientPublicationProfile;
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

  return Object.freeze({
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
      const inspection = await inspector.inspect(inspectionTask);
      if (
        !inspection ||
        inspection.verified !== true ||
        inspection.accountProfileId !== input.accountProfileId ||
        typeof inspection.remoteFingerprint !== "string" ||
        !inspection.remoteFingerprint
      )
        throw fail("REGULAR_ACCOUNT_PROFILE_UNVERIFIED");
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
      const publicationProfile = typeof resolveClientPublicationProfile === "function"
        ? await resolveClientPublicationProfile({
          clientId: input.articleIdentityV1 && input.articleIdentityV1.clientId,
          platformId: input.platformId,
        })
        : undefined;
      const adapterInput = publicationProfile === undefined
        ? input
        : Object.assign({}, input, { publicationProfile: publicationProfile });
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
        throw fail("REGULAR_ACCOUNT_PROFILE_UNVERIFIED");
      return domain.createPreparedSubmission({
        preparedSubmissionEvidenceV1: prepared.preparedSubmissionEvidenceV1,
        submitPreparedPublication: prepared.submitPreparedPublication,
      });
    },
  });
}

module.exports = { createRegularPlatformPreparationPort };
