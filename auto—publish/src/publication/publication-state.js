const PUBLICATION_STATUSES = Object.freeze([
  "queued",
  "remote_started",
  "published",
  "uncertain",
  "failed",
  "cancelled"
]);

const TRANSITIONS = Object.freeze({
  queued: Object.freeze(["remote_started", "cancelled"]),
  remote_started: Object.freeze(["published", "uncertain", "failed"]),
  published: Object.freeze([]),
  uncertain: Object.freeze(["published", "failed"]),
  failed: Object.freeze(["queued"]),
  cancelled: Object.freeze(["queued"])
});

function stateError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertStatus(status) {
  if (PUBLICATION_STATUSES.indexOf(status) === -1) {
    throw stateError("PUBLICATION_STATE_INVALID", "Publication state is invalid");
  }
  return status;
}

function canTransition(from, to) {
  return PUBLICATION_STATUSES.indexOf(from) !== -1 &&
    PUBLICATION_STATUSES.indexOf(to) !== -1 &&
    TRANSITIONS[from].indexOf(to) !== -1;
}

function assertTransition(from, to) {
  assertStatus(from);
  assertStatus(to);
  if (!canTransition(from, to)) {
    throw stateError("PUBLICATION_STATE_TRANSITION_INVALID", "Publication state transition is not allowed");
  }
  return to;
}

function assertOutcomeStatus(status) {
  if (["accepted", "article_rejected", "group_blocked", "failed", "uncertain"].indexOf(status) === -1) {
    throw stateError("PUBLICATION_OUTCOME_INVALID", "Publication outcome is invalid");
  }
  return status;
}

function blocksReservation(status) {
  return ["queued", "remote_started", "published", "uncertain"].indexOf(status) !== -1;
}

function canReserveAgain(status) {
  return status === "failed" || status === "cancelled";
}

module.exports = {
  PUBLICATION_STATUSES,
  TRANSITIONS,
  assertOutcomeStatus,
  assertStatus,
  assertTransition,
  blocksReservation,
  canReserveAgain,
  canTransition
};
