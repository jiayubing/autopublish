"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const domain = require("../src/domain");

const fp = "a".repeat(64);
const identity = Object.freeze({ version: 1, orderId: "order-15" });

function observation(overrides) {
  return {
    version: 1,
    orderIdentityV1: identity,
    statusCode: "0",
    observedAt: "2026-08-08T00:00:00.000Z",
    eventAt: null,
    eventAtSource: "not_available",
    remoteUrl: null,
    actualAmount: null,
    evidenceFingerprint: fp,
    orderSnapshotFingerprint: fp,
    ...(overrides || {}),
  };
}

function terminal(overrides) {
  return {
    version: 1,
    orderIdentityV1: identity,
    terminalKind: "REJECTED",
    observedAt: "2026-08-08T00:00:00.000Z",
    eventAt: null,
    eventAtSource: "not_available",
    actualAmount: null,
    evidenceFingerprint: fp,
    orderSnapshotFingerprint: fp,
    ...(overrides || {}),
  };
}

test("orderObservationV1 is exact, bounded, and preserves actual amount outside the creation snapshot", () => {
  const parsed = domain.parseOrderObservationV1(
    observation({
      statusCode: "2",
      eventAt: "2026-08-07T23:59:00.000Z",
      eventAtSource: "provider_event_time",
      remoteUrl: "https://publisher.example/article",
      actualAmount: 12.5,
    }),
  );
  assert.equal(parsed.actualAmount, 12.5);
  assert.equal(parsed.statusCode, "2");
  for (const invalid of [
    observation({ statusCode: "3" }),
    observation({ actualAmount: -1 }),
    observation({ actualAmount: Number.POSITIVE_INFINITY }),
    observation({ eventAtSource: "provider_event_time" }),
    observation({ remoteUrl: "http://publisher.example/article" }),
    { ...observation(), extra: true },
    { ...observation(), orderIdentityV1: { ...identity, extra: true } },
  ])
    assert.throws(() => domain.parseOrderObservationV1(invalid));
});

test("terminalObservationV1 and orderHistoryV1 are recursively closed ordered facts", () => {
  const history = domain.parseOrderHistoryV1({
    version: 1,
    orderIdentityV1: identity,
    entries: [
      { sequence: 1, kind: "observation", orderObservationV1: observation() },
      { sequence: 2, kind: "terminal", terminalObservationV1: terminal() },
    ],
  });
  assert.deepEqual(
    history.entries.map((entry) => entry.kind),
    ["observation", "terminal"],
  );
  assert.throws(() =>
    domain.parseOrderHistoryV1({
      version: 1,
      orderIdentityV1: identity,
      entries: [
        { sequence: 2, kind: "observation", orderObservationV1: observation() },
      ],
    }),
  );
  assert.throws(() =>
    domain.parseTerminalObservationV1({ ...terminal(), extra: true }),
  );
  assert.throws(() =>
    domain.parseOrderHistoryV1({
      version: 1,
      orderIdentityV1: identity,
      entries: [
        {
          sequence: 1,
          kind: "terminal",
          terminalObservationV1: {
            ...terminal(),
            orderIdentityV1: { version: 1, orderId: "other" },
          },
        },
      ],
    }),
  );
  const sparseEntries = [];
  sparseEntries.length = 1;
  assert.throws(
    () =>
      domain.parseOrderHistoryV1({
        version: 1,
        orderIdentityV1: identity,
        entries: sparseEntries,
      }),
    { code: "ORDER_HISTORY_V1_INVALID" },
  );
});

test("published article URLs preserve ordinary query parameters but reject credential-like query data", () => {
  const ordinary = domain.parseOrderObservationV1(
    observation({
      remoteUrl:
        "https://news.publisher.example/article/42?id=42&utm_source=autopublish",
    }),
  );
  assert.equal(
    ordinary.remoteUrl,
    "https://news.publisher.example/article/42?id=42&utm_source=autopublish",
  );
  for (const remoteUrl of [
    "https://news.publisher.example/article?token=secret",
    "https://news.publisher.example/article?api_key=secret",
    "https://user:secret@news.publisher.example/article",
  ]) {
    assert.throws(
      () => domain.parseOrderObservationV1(observation({ remoteUrl })),
      { code: "ORDER_OBSERVATION_V1_INVALID" },
    );
  }
});
