const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  productionIpcRegistry,
} = require("../desktop/ipc/contracts/production-registry");
const {
  productionIpcContractFixtures,
} = require("./fixtures/phase-06-production-ipc-contract-fixtures");

const FEATURE_OWNERS = new Set([
  "workspace",
  "content",
  "generation",
  "platform",
  "media",
  "attention",
  "settings",
]);
const AUTH_INVOKE_EXEMPTIONS = [
  "auth:get-state",
  "auth:login",
  "auth:change-password",
  "auth:refresh",
  "auth:logout",
];
const AUTH_EVENT_EXEMPTIONS = ["auth-state-changed"];

function requiredKeys(schema) {
  return Object.entries(schema.fields)
    .filter(([, field]) => !field || field.type !== "optional")
    .map(([key]) => key);
}

function withoutKey(value, key) {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function assertContractError(action, expectedCodes, message) {
  let caught = null;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, message);
  assert.ok(expectedCodes.includes(caught.code), `${message}: ${caught.code}`);
}

test("all 129 production capabilities have independent legal fixtures, owners, and caller records", () => {
  const contracts = productionIpcRegistry.list();
  const preload = fs.readFileSync(
    path.resolve(__dirname, "../desktop/preload.js"),
    "utf8",
  );
  assert.equal(contracts.length, 129);
  assert.equal(productionIpcContractFixtures.length, 129);
  assert.equal(
    new Set(productionIpcContractFixtures.map((entry) => entry.capability))
      .size,
    129,
  );
  assert.equal(
    new Set(productionIpcContractFixtures.map((entry) => entry.channel)).size,
    129,
  );

  for (const fixture of productionIpcContractFixtures) {
    const contract = productionIpcRegistry.byCapability(fixture.capability);
    assert.ok(contract, fixture.capability);
    assert.equal(contract.channel, fixture.channel, fixture.capability);
    assert.ok(
      FEATURE_OWNERS.has(fixture.owner),
      `${fixture.capability}: ${fixture.owner}`,
    );
    assert.equal(
      contract.feature,
      fixture.owner,
      `${fixture.capability}: contract owner`,
    );
    assert.equal(
      fixture.productionCaller,
      `desktop/preload.js:${fixture.channel}`,
      fixture.capability,
    );
    assert.ok(
      preload.includes(JSON.stringify(fixture.channel)),
      `${fixture.capability}:caller`,
    );

    if (contract.kind === "event") {
      const encoded = productionIpcRegistry.event(contract, fixture.event);
      assert.deepEqual(
        productionIpcRegistry.parseEvent(contract, encoded),
        fixture.event,
        fixture.capability,
      );
    } else {
      const encodedRequest = productionIpcRegistry.encodeRequest(
        contract,
        fixture.request,
      );
      assert.deepEqual(
        productionIpcRegistry.parseRequest(contract, encodedRequest),
        fixture.request,
        `${fixture.capability}:request`,
      );
      const encodedSuccess = productionIpcRegistry.success(
        contract,
        fixture.result,
      );
      assert.deepEqual(
        productionIpcRegistry.parseSuccess(contract, encodedSuccess),
        fixture.result,
        `${fixture.capability}:result`,
      );
    }
  }
});

test("shared registry matrix rejects unknown version and unknown fields for every capability", () => {
  for (const fixture of productionIpcContractFixtures) {
    const contract = productionIpcRegistry.byCapability(fixture.capability);
    if (contract.kind === "event") {
      const encoded = productionIpcRegistry.event(contract, fixture.event);
      assertContractError(
        () =>
          productionIpcRegistry.parseEvent(contract, {
            ...encoded,
            schemaVersion: 2,
          }),
        ["IPC_SCHEMA_UNSUPPORTED", "IPC_EVENT_INVALID"],
        `${fixture.capability}:version`,
      );
      assertContractError(
        () =>
          productionIpcRegistry.parseEvent(contract, {
            ...encoded,
            unknownField: true,
          }),
        ["IPC_UNKNOWN_FIELD", "IPC_EVENT_INVALID"],
        `${fixture.capability}:unknown-field`,
      );
      continue;
    }

    const request = productionIpcRegistry.encodeRequest(
      contract,
      fixture.request,
    );
    assert.throws(
      () =>
        productionIpcRegistry.parseRequest(contract, {
          ...request,
          schemaVersion: 2,
        }),
      { code: "IPC_SCHEMA_UNSUPPORTED" },
      `${fixture.capability}:request-version`,
    );
    assert.throws(
      () =>
        productionIpcRegistry.parseRequest(contract, {
          ...request,
          payload: { ...request.payload, unknownField: true },
        }),
      { code: "IPC_UNKNOWN_FIELD" },
      `${fixture.capability}:request-unknown-field`,
    );

    const success = productionIpcRegistry.success(contract, fixture.result);
    assert.throws(
      () =>
        productionIpcRegistry.parseSuccess(contract, {
          ...success,
          schemaVersion: 2,
        }),
      { code: "IPC_SCHEMA_UNSUPPORTED" },
      `${fixture.capability}:result-version`,
    );
    assert.throws(
      () =>
        productionIpcRegistry.parseSuccess(contract, {
          ...success,
          data: { ...success.data, unknownField: true },
        }),
      { code: "IPC_UNKNOWN_FIELD" },
      `${fixture.capability}:result-unknown-field`,
    );
  }
});

test("shared registry matrix rejects missing required fields where applicable", () => {
  for (const fixture of productionIpcContractFixtures) {
    const contract = productionIpcRegistry.byCapability(fixture.capability);
    if (contract.kind === "event") {
      const [key] = requiredKeys(contract.event);
      if (!key) continue;
      const encoded = productionIpcRegistry.event(contract, fixture.event);
      assert.throws(
        () =>
          productionIpcRegistry.parseEvent(contract, withoutKey(encoded, key)),
        { code: "IPC_EVENT_INVALID" },
        `${fixture.capability}:event-missing-${key}`,
      );
      continue;
    }

    const [requestKey] = requiredKeys(contract.request);
    if (requestKey) {
      const encoded = productionIpcRegistry.encodeRequest(
        contract,
        fixture.request,
      );
      assert.throws(
        () =>
          productionIpcRegistry.parseRequest(contract, {
            ...encoded,
            payload: withoutKey(encoded.payload, requestKey),
          }),
        { code: "IPC_REQUEST_INVALID" },
        `${fixture.capability}:request-missing-${requestKey}`,
      );
    }

    const [resultKey] = requiredKeys(contract.success);
    if (resultKey) {
      const encoded = productionIpcRegistry.success(contract, fixture.result);
      assert.throws(
        () =>
          productionIpcRegistry.parseSuccess(contract, {
            ...encoded,
            data: withoutKey(encoded.data, resultKey),
          }),
        { code: "IPC_RESULT_INVALID" },
        `${fixture.capability}:result-missing-${resultKey}`,
      );
    }
  }
});

test("shared registry matrix closes unsafe and raw errors for every invoke capability", () => {
  for (const fixture of productionIpcContractFixtures) {
    const contract = productionIpcRegistry.byCapability(fixture.capability);
    if (contract.kind === "event") continue;
    const raw = Object.assign(new Error("C:\\private\\workspace\\secret.db"), {
      code: "UNKNOWN_PROVIDER_ERROR",
      filePath: "C:\\private\\article.md",
      stack: "provider stack and cookie",
    });
    const response = productionIpcRegistry.failure(contract, raw);
    assert.equal(response.ok, false, fixture.capability);
    assert.equal(response.error.code, "IPC_INTERNAL", fixture.capability);
    assert.equal(
      productionIpcRegistry.parseResult(contract, response).code,
      "IPC_INTERNAL",
      fixture.capability,
    );
    assert.doesNotMatch(
      JSON.stringify(response),
      /private|secret\.db|article\.md|provider stack|cookie|filePath/i,
      fixture.capability,
    );
  }
});

test("the six Phase 07 Auth exemptions are explicit and absent from the production registry", () => {
  const preload = fs.readFileSync(
    path.resolve(__dirname, "../desktop/preload.js"),
    "utf8",
  );
  for (const channel of [...AUTH_INVOKE_EXEMPTIONS, ...AUTH_EVENT_EXEMPTIONS]) {
    assert.equal(productionIpcRegistry.byChannel(channel), null, channel);
    assert.match(
      preload,
      new RegExp(`[` + "\\\"'" + `]${channel}[` + "\\\"'" + `]`),
      channel,
    );
  }
  const authChannels = [
    ...preload.matchAll(/["'](auth:[a-z-]+|auth-state-changed)["']/g),
  ].map((match) => match[1]);
  assert.deepEqual(
    [...new Set(authChannels)].sort(),
    [...AUTH_INVOKE_EXEMPTIONS, ...AUTH_EVENT_EXEMPTIONS].sort(),
  );
});
