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
const {
  createProductionProgram,
  verifyCapabilityEvidence,
} = require("./helpers/typescript-symbol-evidence");

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

function requiredKeys(schema, value) {
  if (schema.type === "oneOf") {
    const matching = schema.fields.find((candidate) => {
      if (!candidate || candidate.type !== "object" || !value) return false;
      return Object.entries(candidate.fields).every(([, field]) =>
        field && field.type === "literal"
          ? Object.is(value.outcome, field.value) ||
            Object.values(value).some((entry) => Object.is(entry, field.value))
          : true,
      );
    });
    return matching ? requiredKeys(matching, value) : [];
  }
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

let cachedProductionContext = null;
function productionContext() {
  if (cachedProductionContext) return cachedProductionContext;
  const applicationRoot = path.resolve(__dirname, "..");
  cachedProductionContext = {
    ...createProductionProgram(applicationRoot),
    applicationRoot,
  };
  return cachedProductionContext;
}

test("all 118 production capabilities close by TypeChecker symbol identity", () => {
  const context = productionContext();
  const contracts = productionIpcRegistry.list();

  assert.equal(contracts.length, 118);
  assert.equal(productionIpcContractFixtures.length, 118);
  assert.equal(
    new Set(productionIpcContractFixtures.map((entry) => entry.capability))
      .size,
    118,
  );
  assert.equal(
    new Set(productionIpcContractFixtures.map((entry) => entry.channel)).size,
    118,
  );

  for (const fixture of productionIpcContractFixtures) {
    const contract = productionIpcRegistry.byCapability(fixture.capability);
    assert.ok(contract, fixture.capability);
    assert.equal(contract.channel, fixture.channel, fixture.capability);
    assert.ok(FEATURE_OWNERS.has(fixture.owner), fixture.capability);
    assert.equal(contract.feature, fixture.owner, fixture.capability);
    const result = verifyCapabilityEvidence(context, {
      ...fixture,
      kind: contract.kind,
    });
    assert.equal(
      result.ok,
      true,
      `${fixture.capability}: ${result.reasons.join("; ")}\n${JSON.stringify(result.trace)}`,
    );

    if (contract.kind === "event") {
      const encoded = productionIpcRegistry.event(contract, fixture.event);
      assert.deepEqual(
        productionIpcRegistry.parseEvent(contract, encoded),
        fixture.event,
        fixture.capability,
      );
    } else {
      const request = productionIpcRegistry.encodeRequest(
        contract,
        fixture.request,
      );
      assert.deepEqual(
        productionIpcRegistry.parseRequest(contract, request),
        fixture.request,
        `${fixture.capability}:request`,
      );
      const success = productionIpcRegistry.success(contract, fixture.result);
      assert.deepEqual(
        productionIpcRegistry.parseSuccess(contract, success),
        fixture.result,
        `${fixture.capability}:result`,
      );
    }
  }
});

const lifecycleFixtures = productionIpcContractFixtures.filter(
  (entry) => entry.productionCaller.consumer.kind === "lifecycle",
);
const eventFixtures = productionIpcContractFixtures.filter(
  (entry) => entry.event,
);

assert.equal(lifecycleFixtures.length, 25);
assert.equal(eventFixtures.length, 4);

for (const fixture of lifecycleFixtures) {
  test(`lifecycle query closes query-to-state-to-snapshot consumer: ${fixture.capability}`, () => {
    const result = verifyCapabilityEvidence(productionContext(), {
      ...fixture,
      kind: "invoke",
    });
    assert.equal(result.ok, true, result.reasons.join("\n"));
  });
}

for (const fixture of eventFixtures) {
  test(`event closes producer-to-unique-consumer-to-dispose: ${fixture.capability}`, () => {
    const result = verifyCapabilityEvidence(productionContext(), {
      ...fixture,
      kind: "event",
    });
    assert.equal(result.ok, true, result.reasons.join("\n"));
  });
}

test("shared registry rejects unknown versions and fields for every capability", () => {
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

test("shared registry rejects missing required fields where applicable", () => {
  for (const fixture of productionIpcContractFixtures) {
    const contract = productionIpcRegistry.byCapability(fixture.capability);
    if (contract.kind === "event") {
      const [key] = requiredKeys(contract.event, fixture.event);
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
    const [requestKey] = requiredKeys(contract.request, fixture.request);
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
    const [resultKey] = requiredKeys(contract.success, fixture.result);
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

test("shared registry closes unsafe and raw errors for every invoke capability", () => {
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
    );
    assert.doesNotMatch(
      JSON.stringify(response),
      /private|secret\.db|article\.md|provider stack|cookie|filePath/i,
      fixture.capability,
    );
  }
});

test("the six Phase 07 Auth exemptions stay explicit and outside the registry", () => {
  const preload = fs.readFileSync(
    path.resolve(__dirname, "../desktop/preload.js"),
    "utf8",
  );
  for (const channel of [...AUTH_INVOKE_EXEMPTIONS, ...AUTH_EVENT_EXEMPTIONS]) {
    assert.equal(productionIpcRegistry.byChannel(channel), null, channel);
    assert.match(preload, new RegExp(`[\\"']${channel}[\\"']`), channel);
  }
  const authChannels = [
    ...preload.matchAll(/["'](auth:[a-z-]+|auth-state-changed)["']/g),
  ].map((match) => match[1]);
  assert.deepEqual(
    [...new Set(authChannels)].sort(),
    [...AUTH_INVOKE_EXEMPTIONS, ...AUTH_EVENT_EXEMPTIONS].sort(),
  );
});
