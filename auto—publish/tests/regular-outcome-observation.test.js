"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  REGULAR_OUTCOME_OBSERVATION_ISSUES,
  isRegularOutcomeObservationError,
  parseRegularOutcomeObservation,
} = require("../src/publication/regular-outcome-observation");

function assertIssue(expected, action) {
  assert.throws(action, (error) => {
    assert.equal(isRegularOutcomeObservationError(error), true);
    assert.equal(error.issue, expected);
    return true;
  });
}

test("canonical regular observation normalizes one shared persisted shape", () => {
  const observed = parseRegularOutcomeObservation(
    {
      status: "accepted",
      code: "REGULAR_ACCEPTED",
      remoteId: "remote-1",
      remoteUrl: "https://example.test/article",
    },
    { defaultObservedAt: "2026-08-07T02:00:00.000Z" },
  );

  assert.deepEqual(observed, {
    status: "accepted",
    code: "REGULAR_ACCEPTED",
    observedAt: "2026-08-07T02:00:00.000Z",
    providerEventAt: null,
    remoteId: "remote-1",
    remoteUrl: "https://example.test/article",
  });
  assert.equal(Object.isFrozen(observed), true);
});

test("canonical regular observation evaluates lazy timestamps only after shape validation", () => {
  let clockCalls = 0;
  assertIssue(REGULAR_OUTCOME_OBSERVATION_ISSUES.INVALID, () =>
    parseRegularOutcomeObservation(
      { status: "published", code: "REGULAR_PUBLISHED" },
      {
        defaultObservedAt() {
          clockCalls += 1;
          return "2026-08-07T02:00:00.000Z";
        },
      },
    ),
  );
  assert.equal(clockCalls, 0);
});

test("canonical regular observation owns status, code, remote identity and key validation", () => {
  const defaults = { defaultObservedAt: "2026-08-07T02:00:00.000Z" };
  for (const input of [
    { status: "published", code: "REGULAR_PUBLISHED" },
    { status: "uncertain", code: "bad-code" },
    { status: "uncertain", code: "REGULAR_UNCERTAIN", remoteId: "" },
    { status: "uncertain", code: "REGULAR_UNCERTAIN", remoteId: null },
    { status: "uncertain", code: "REGULAR_UNCERTAIN", extra: true },
  ])
    assertIssue(REGULAR_OUTCOME_OBSERVATION_ISSUES.INVALID, () =>
      parseRegularOutcomeObservation(input, defaults),
    );
});

test("canonical regular observation owns timestamp and remote url evidence validation", () => {
  assertIssue(REGULAR_OUTCOME_OBSERVATION_ISSUES.TIME_INVALID, () =>
    parseRegularOutcomeObservation({
      status: "uncertain",
      code: "REGULAR_UNCERTAIN",
      observedAt: "not-a-time",
    }),
  );
  assertIssue(REGULAR_OUTCOME_OBSERVATION_ISSUES.EVIDENCE_INVALID, () =>
    parseRegularOutcomeObservation({
      status: "accepted",
      code: "REGULAR_ACCEPTED",
      observedAt: "2026-08-07T02:00:00.000Z",
      remoteUrl: "https://example.test/article?token=secret",
    }),
  );
});

test("canonical regular observation owns accepted and remote-pending identity requirements", () => {
  const defaults = { defaultObservedAt: "2026-08-07T02:00:00.000Z" };
  assertIssue(
    REGULAR_OUTCOME_OBSERVATION_ISSUES.ACCEPTED_REMOTE_IDENTITY_REQUIRED,
    () =>
      parseRegularOutcomeObservation(
        { status: "accepted", code: "REGULAR_ACCEPTED" },
        defaults,
      ),
  );
  assertIssue(
    REGULAR_OUTCOME_OBSERVATION_ISSUES.REMOTE_PENDING_REMOTE_ID_REQUIRED,
    () =>
      parseRegularOutcomeObservation(
        { status: "remote_pending", code: "REGULAR_REMOTE_PENDING" },
        defaults,
      ),
  );
});

test("canonical regular observation requires and preserves group recoverability", () => {
  const defaults = { defaultObservedAt: "2026-08-07T02:00:00.000Z" };
  assertIssue(REGULAR_OUTCOME_OBSERVATION_ISSUES.INVALID, () =>
    parseRegularOutcomeObservation(
      { status: "group_blocked", code: "LOGIN_REQUIRED" },
      defaults,
    ),
  );
  const observed = parseRegularOutcomeObservation(
    {
      status: "group_blocked",
      code: "LOGIN_REQUIRED",
      articleRecoverable: false,
    },
    defaults,
  );
  assert.equal(observed.articleRecoverable, false);
});
