const { wrap } = require("../services/ipc-response");

function inputError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function regularAttemptId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_.:-]+$/.test(value.trim()))
    throw inputError(
      "REGULAR_OUTCOME_INPUT_INVALID",
      "Regular publication attempt is invalid",
    );
  return value.trim();
}

function validateRegularPrepareInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw inputError(
      "REGULAR_OUTCOME_INPUT_INVALID",
      "Regular outcome input is invalid",
    );
  const keys = Object.keys(input);
  if (keys.some((key) => key !== "regularPublicationAttemptId"))
    throw inputError(
      "REGULAR_OUTCOME_INPUT_INVALID",
      "Regular outcome input is invalid",
    );
  return {
    regularPublicationAttemptId: regularAttemptId(
      input.regularPublicationAttemptId,
    ),
  };
}

function validateRegularAcceptedInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw inputError(
      "REGULAR_OUTCOME_INPUT_INVALID",
      "Regular outcome input is invalid",
    );
  const keys = Object.keys(input);
  if (
    keys.some(
      (key) =>
        ![
          "regularPublicationAttemptId",
          "confirmationToken",
          "manualPositiveEvidence",
          "confirmed",
        ].includes(key),
    )
  )
    throw inputError(
      "REGULAR_OUTCOME_INPUT_INVALID",
      "Regular outcome input is invalid",
    );
  if (input.confirmed !== true)
    throw inputError(
      "REGULAR_OUTCOME_CONFIRMATION_REQUIRED",
      "Regular outcome confirmation is required",
    );
  const evidence = input.manualPositiveEvidence;
  if (
    !evidence ||
    typeof evidence !== "object" ||
    Array.isArray(evidence) ||
    Object.keys(evidence).some(
      (key) => !["observedAt", "remoteUrl"].includes(key),
    ) ||
    typeof evidence.observedAt !== "string" ||
    !evidence.observedAt.trim() ||
    (evidence.remoteUrl !== undefined &&
      (typeof evidence.remoteUrl !== "string" ||
        !/^https?:\/\/[^\s\\]+$/.test(evidence.remoteUrl)))
  )
    throw inputError(
      "REGULAR_MANUAL_POSITIVE_EVIDENCE_REQUIRED",
      "Positive evidence is required",
    );
  if (
    typeof input.confirmationToken !== "string" ||
    !/^[A-Za-z0-9_.:-]+$/.test(input.confirmationToken.trim())
  )
    throw inputError(
      "REGULAR_UNCERTAIN_RESOLUTION_TOKEN_STALE",
      "Regular outcome token is invalid",
    );
  return {
    regularPublicationAttemptId: regularAttemptId(
      input.regularPublicationAttemptId,
    ),
    confirmationToken: input.confirmationToken.trim(),
    manualPositiveEvidence: {
      observedAt: evidence.observedAt.trim(),
      ...(evidence.remoteUrl ? { remoteUrl: evidence.remoteUrl } : {}),
    },
    confirmed: true,
  };
}

function validateRegularNotAcceptedInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw inputError(
      "REGULAR_OUTCOME_INPUT_INVALID",
      "Regular outcome input is invalid",
    );
  const keys = Object.keys(input);
  if (
    keys.some(
      (key) =>
        ![
          "regularPublicationAttemptId",
          "confirmationToken",
          "manualNegativeEvidence",
          "confirmed",
        ].includes(key),
    )
  )
    throw inputError(
      "REGULAR_OUTCOME_INPUT_INVALID",
      "Regular outcome input is invalid",
    );
  if (input.confirmed !== true)
    throw inputError(
      "REGULAR_OUTCOME_CONFIRMATION_REQUIRED",
      "Regular outcome confirmation is required",
    );
  const evidence = input.manualNegativeEvidence;
  if (
    !evidence ||
    typeof evidence !== "object" ||
    Array.isArray(evidence) ||
    Object.keys(evidence).some(
      (key) => !["reasonCode", "observedAt"].includes(key),
    ) ||
    typeof evidence.reasonCode !== "string" ||
    !/^[A-Z][A-Z0-9_]{0,127}$/.test(evidence.reasonCode) ||
    typeof evidence.observedAt !== "string" ||
    !evidence.observedAt.trim()
  )
    throw inputError(
      "REGULAR_MANUAL_NEGATIVE_EVIDENCE_REQUIRED",
      "Negative evidence is required",
    );
  if (
    typeof input.confirmationToken !== "string" ||
    !/^[A-Za-z0-9_.:-]+$/.test(input.confirmationToken.trim())
  )
    throw inputError(
      "REGULAR_UNCERTAIN_RESOLUTION_TOKEN_STALE",
      "Regular outcome token is invalid",
    );
  return {
    regularPublicationAttemptId: regularAttemptId(
      input.regularPublicationAttemptId,
    ),
    confirmationToken: input.confirmationToken.trim(),
    manualNegativeEvidence: {
      reasonCode: evidence.reasonCode,
      observedAt: evidence.observedAt.trim(),
    },
    confirmed: true,
  };
}

function projectRegularResolution(result, expectedStatus) {
  const value = result && typeof result === "object" ? result : {};
  if (
    typeof value.attemptId !== "string" ||
    !value.attemptId ||
    value.status !== expectedStatus
  )
    throw inputError(
      "REGULAR_OUTCOME_RESULT_INVALID",
      "Regular outcome result is invalid",
    );
  return {
    attemptId: value.attemptId,
    status: value.status,
    ...(typeof value.idempotent === "boolean"
      ? { idempotent: value.idempotent }
      : {}),
    ...(typeof value.firstWins === "boolean"
      ? { firstWins: value.firstWins }
      : {}),
  };
}

function registerPublicationIpc(deps) {
  const values = deps || {};
  const outcomeService = values.regularPlatformOutcomeService;
  values.ipcMain.handle(
    "publication:prepare-regular-uncertain-resolution",
    function (event, input) {
      return wrap(async function () {
        if (
          !outcomeService ||
          typeof outcomeService.prepareRegularUncertainResolution !== "function"
        )
          throw inputError(
            "REGULAR_OUTCOME_SERVICE_UNAVAILABLE",
            "Regular outcome service is unavailable",
          );
        return outcomeService.prepareRegularUncertainResolution(
          validateRegularPrepareInput(input),
        );
      });
    },
  );
  values.ipcMain.handle(
    "publication:confirm-regular-accepted",
    function (event, input) {
      return wrap(async function () {
        if (
          !outcomeService ||
          typeof outcomeService.confirmRegularAccepted !== "function"
        )
          throw inputError(
            "REGULAR_OUTCOME_SERVICE_UNAVAILABLE",
            "Regular outcome service is unavailable",
          );
        return projectRegularResolution(
          outcomeService.confirmRegularAccepted(
            validateRegularAcceptedInput(input),
          ),
          "published",
        );
      });
    },
  );
  values.ipcMain.handle(
    "publication:confirm-regular-not-accepted",
    function (event, input) {
      return wrap(async function () {
        if (
          !outcomeService ||
          typeof outcomeService.confirmRegularNotAccepted !== "function"
        )
          throw inputError(
            "REGULAR_OUTCOME_SERVICE_UNAVAILABLE",
            "Regular outcome service is unavailable",
          );
        return projectRegularResolution(
          outcomeService.confirmRegularNotAccepted(
            validateRegularNotAcceptedInput(input),
          ),
          "not_accepted",
        );
      });
    },
  );
}

module.exports = {
  registerPublicationIpc,
  validateRegularPrepareInput,
  validateRegularAcceptedInput,
  validateRegularNotAcceptedInput,
};
