"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createRegularPlatformOutcomeService,
} = require("../desktop/services/regular-platform-outcome-service");

const methods = [
  "confirmRegularAccepted",
  "confirmRegularNotAccepted",
  "getRegularOutcomeSnapshot",
  "markOrphanedRegularAttemptUncertain",
  "prepareRegularUncertainResolution",
  "recordRegularAccepted",
  "recordRegularArticleRejected",
  "recordRegularGroupBlocked",
  "recordRegularRemotePending",
  "recordRegularUncertain",
];

function fixture() {
  const calls = [];
  const transitions = Object.fromEntries(
    methods.map((method) => [
      method,
      (input) => {
        calls.push({ method, input });
        return { method };
      },
    ]),
  );
  return {
    calls,
    service: createRegularPlatformOutcomeService({
      regularOutcomeTransitions: Object.freeze(transitions),
      clock: () => new Date("2026-08-07T02:00:00.000Z"),
    }),
  };
}

test("regular adapters share one five-outcome application mapping", () => {
  const f = fixture();
  const cases = [
    [
      "hepan",
      {
        status: "accepted",
        remoteId: "hepan-article-1",
        remoteUrl: "https://example.test/a",
      },
      "recordRegularAccepted",
    ],
    [
      "lieju",
      { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" },
      "recordRegularUncertain",
    ],
    [
      "toutiao",
      { status: "uncertain", errorCode: "REMOTE_RESULT_UNKNOWN" },
      "recordRegularUncertain",
    ],
    [
      "hepan",
      {
        status: "remote_pending",
        errorCode: "HEPAN_REMOTE_PENDING",
        remoteId: "98765",
      },
      "recordRegularRemotePending",
    ],
    [
      "hepan",
      {
        status: "group_blocked",
        errorCode: "LOGIN_REQUIRED",
        articleRecoverable: true,
      },
      "recordRegularGroupBlocked",
    ],
  ];
  for (const [platformId, outcome, expectedMethod] of cases) {
    f.service.applyRegularOutcome({
      regularPublicationAttemptId: `attempt-${platformId}-${expectedMethod}`,
      outcome,
    });
    assert.equal(f.calls.at(-1).method, expectedMethod);
    assert.equal(f.calls.at(-1).input.observation.status, outcome.status);
  }
  assert.equal(
    f.calls.every(
      (call) =>
        !Object.prototype.hasOwnProperty.call(call.input, "platformId") &&
        !Object.prototype.hasOwnProperty.call(call.input, "createIntent"),
    ),
    true,
  );
  assert.equal(
    f.calls.find((call) => call.method === "recordRegularAccepted").input
      .observation.remoteId,
    "hepan-article-1",
  );
});

test("accepted observations fail closed without one safe remote identity", () => {
  const f = fixture();
  assert.throws(
    () =>
      f.service.applyRegularOutcome({
        regularPublicationAttemptId: "attempt-missing-identity",
        outcome: { status: "accepted" },
      }),
    { code: "REGULAR_ACCEPTED_REMOTE_IDENTITY_REQUIRED" },
  );
  assert.throws(
    () =>
      f.service.applyRegularOutcome({
        regularPublicationAttemptId: "attempt-unsafe-identity",
        outcome: { status: "accepted", remoteId: "unsafe identity" },
      }),
    { code: "REGULAR_ADAPTER_OUTCOME_INVALID" },
  );
  assert.throws(
    () =>
      f.service.applyRegularOutcome({
        regularPublicationAttemptId: "attempt-sensitive-url",
        outcome: {
          status: "accepted",
          remoteUrl: "https://example.test/article?token=secret",
        },
      }),
    { code: "REGULAR_ADAPTER_OUTCOME_INVALID" },
  );
  assert.throws(
    () =>
      f.service.applyRegularOutcome({
        regularPublicationAttemptId: "attempt-empty-url",
        outcome: {
          status: "accepted",
          remoteId: "remote-1",
          remoteUrl: "",
        },
      }),
    { code: "REGULAR_ADAPTER_OUTCOME_INVALID" },
  );
  assert.equal(f.calls.length, 0);
});

test("group-blocked mapping preserves both recoverability branches", () => {
  const f = fixture();
  for (const articleRecoverable of [true, false]) {
    f.service.applyRegularOutcome({
      regularPublicationAttemptId: `attempt-group-${articleRecoverable}`,
      outcome: {
        status: "group_blocked",
        errorCode: "LOGIN_REQUIRED",
        articleRecoverable,
      },
    });
    assert.equal(f.calls.at(-1).method, "recordRegularGroupBlocked");
    assert.equal(
      f.calls.at(-1).input.observation.articleRecoverable,
      articleRecoverable,
    );
  }
});

test("legacy submitted/published/failed results cannot create a second workflow", () => {
  const f = fixture();
  for (const status of ["submitted", "published", "failed", "reviewing"]) {
    assert.throws(
      () =>
        f.service.applyRegularOutcome({
          regularPublicationAttemptId: "attempt-1",
          outcome: { status },
        }),
      { code: "REGULAR_ADAPTER_OUTCOME_INVALID" },
    );
  }
  assert.equal(f.calls.length, 0);
});

test("outcome service rejects extra persistence capabilities", () => {
  const f = fixture();
  const invalid = Object.assign(
    {},
    Object.fromEntries(methods.map((method) => [method, () => ({})])),
    { admitRegularQueueItem() {} },
  );
  assert.throws(
    () =>
      createRegularPlatformOutcomeService({
        regularOutcomeTransitions: invalid,
      }),
    { code: "REGULAR_OUTCOME_TRANSITIONS_INVALID" },
  );
  assert.equal(typeof f.service.prepareRegularUncertainResolution, "function");
});
