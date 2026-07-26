const {
  ArticleId,
  AttemptId,
  AccountProfileId,
  RemoteId,
} = require("./identities");
const {
  parsePublicationTarget,
  publicationTargetKey,
} = require("./publication-target");
const {
  parseSafeOperationalError,
  dtoError,
  exact,
  safeString,
} = require("./safe-operational-error");

function safeBody(value, max) {
  return (
    typeof value === "string" &&
    value.trim() &&
    value.length <= max &&
    !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)
  );
}

function parsePublishInput(input) {
  exact(input, [
    "version",
    "articleId",
    "attemptId",
    "target",
    "title",
    "body",
  ]);
  if (
    input.version !== 1 ||
    !safeString(input.title, 256) ||
    !safeBody(input.body, 200000)
  )
    throw dtoError("PUBLISH_INPUT_INVALID");
  return Object.freeze({
    version: 1,
    articleId: ArticleId.serialize(ArticleId.parse(input.articleId)),
    attemptId: AttemptId.serialize(AttemptId.parse(input.attemptId)),
    target: parsePublicationTarget(input.target),
    title: input.title.trim(),
    body: input.body,
  });
}
function parseEvidence(input, command, submitted) {
  const fields = submitted
    ? ["articleId", "attemptId", "targetKey", "accountProfileId", "remoteId"]
    : [
        "articleId",
        "attemptId",
        "targetKey",
        "accountProfileId",
        "remoteId",
        "remoteUrl",
      ];
  exact(input, fields);
  const target = command.target;
  const expectedAccount =
    target.kind === "platform" ? target.accountProfileId : undefined;
  try {
    if (
      ArticleId.serialize(ArticleId.parse(input.articleId)) !==
        command.articleId ||
      AttemptId.serialize(AttemptId.parse(input.attemptId)) !==
        command.attemptId ||
      input.targetKey !== publicationTargetKey(target) ||
      (expectedAccount !== undefined &&
        AccountProfileId.serialize(
          AccountProfileId.parse(input.accountProfileId),
        ) !== expectedAccount) ||
      (expectedAccount === undefined && input.accountProfileId !== undefined) ||
      !RemoteId.validate(input.remoteId).ok ||
      (!submitted &&
        (!safeString(input.remoteUrl, 2048) ||
          !/^https:\/\//.test(input.remoteUrl)))
    )
      throw dtoError("PUBLISH_OUTCOME_INVALID");
  } catch (_) {
    throw dtoError("PUBLISH_OUTCOME_INVALID");
  }
  return Object.freeze({ ...input });
}
function parsePublishOutcome(input, command) {
  const parsedCommand = parsePublishInput(command);
  if (!input || typeof input !== "object")
    throw dtoError("PUBLISH_OUTCOME_INVALID");
  if (input.status === "published") {
    exact(input, ["status", "evidence"]);
    return Object.freeze({
      status: "published",
      evidence: parseEvidence(input.evidence, parsedCommand, false),
    });
  }
  if (input.status === "submitted") {
    exact(input, ["status", "evidence"]);
    return Object.freeze({
      status: "submitted",
      evidence: parseEvidence(input.evidence, parsedCommand, true),
    });
  }
  if (input.status === "failed") {
    exact(input, ["status", "error"]);
    return Object.freeze({
      status: "failed",
      error: parseSafeOperationalError(input.error),
    });
  }
  if (input.status === "uncertain") {
    exact(input, ["status", "error", "evidence"]);
    const result = {
      status: "uncertain",
      error: parseSafeOperationalError(input.error),
    };
    if (input.evidence !== undefined)
      result.evidence = parseEvidence(input.evidence, parsedCommand, true);
    return Object.freeze(result);
  }
  throw dtoError("PUBLISH_OUTCOME_INVALID");
}
function validatePublisher(publisher) {
  if (
    !publisher ||
    typeof publisher.inspectAccount !== "function" ||
    typeof publisher.publish !== "function"
  )
    throw dtoError("PUBLISHER_INVALID");
  return publisher;
}
function createFakePublisher(options) {
  const opts = options || {};
  return validatePublisher({
    inspectAccount: async () =>
      Object.freeze({
        accountProfileId: opts.accountProfileId || "fake-account",
        displayName: "Fake publisher",
      }),
    publish: async (input) => parsePublishOutcome(opts.outcome, input),
  });
}
module.exports = {
  parsePublishInput,
  parsePublishOutcome,
  validatePublisher,
  createFakePublisher,
};
