const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createContractRegistry,
  defineContract,
  exactObject,
  stringField,
  multilineStringField,
  integerField,
  optionalField,
  nullableField,
  literalField,
  enumField,
  numberField,
  arrayField,
  oneOf,
} = require("../desktop/ipc/contracts/registry");

test("multiline text permits CR LF and TAB but rejects other control characters", () => {
  const contract = defineContract({
    capability: "content.multilineFixture",
    channel: "content:multiline-fixture",
    feature: "content",
    kind: "command",
    request: exactObject({ body: multilineStringField({ min: 1, max: 100 }) }),
    success: exactObject({ body: multilineStringField({ min: 1, max: 100 }) }),
    errorCodes: [],
  });
  const registry = createContractRegistry([contract]);
  assert.equal(registry.encodeRequest(contract, { body: "第一行\n\t第二行\r\n" }).payload.body, "第一行\n\t第二行\r\n");
  for (const body of ["bad\u0000text", "bad\btext", "bad\u001btext", "bad\u007ftext"]) {
    assert.throws(() => registry.encodeRequest(contract, { body }), { code: "IPC_REQUEST_INVALID" });
  }
});

const query = defineContract({
  capability: "workspace.getCurrent",
  channel: "workspace:get-current",
  feature: "workspace",
  kind: "query",
  request: exactObject({}),
  success: exactObject({ state: stringField({ values: ["ready", "missing"] }) }),
  errorCodes: ["AUTH_REQUIRED", "WORKSPACE_UNAVAILABLE", "IPC_REQUEST_INVALID", "IPC_RESULT_INVALID"],
});

const command = defineContract({
  capability: "media.refreshResources",
  channel: "media:refresh-resources",
  feature: "media",
  kind: "command",
  request: exactObject({ refreshId: stringField({ max: 64 }) }),
  success: exactObject({ accepted: integerField({ min: 0, max: 20000 }), truncated: "boolean" }),
  errorCodes: ["AUTH_REQUIRED", "MEDIA_REFRESH_FAILED", "IPC_REQUEST_INVALID", "IPC_RESULT_INVALID"],
});

const event = defineContract({
  capability: "workspace.invalidated",
  channel: "workspace:data-invalidated",
  feature: "workspace",
  kind: "event",
  event: exactObject({
    workspaceRuntimeId: stringField({ max: 128 }),
    revision: integerField({ min: 1 }),
    scopes: { arrayOf: stringField({ max: 64 }), max: 32 },
    reasonCode: stringField({ max: 128 }),
  }),
  errorCodes: [],
});

test("typed IPC registry versions exact requests, results, and events", () => {
  const registry = createContractRegistry([query, command, event]);
  assert.equal(registry.byCapability("workspace.getCurrent"), query);
  assert.equal(registry.byChannel("workspace:data-invalidated"), event);

  assert.deepEqual(registry.encodeRequest(query, {}), { schemaVersion: 1, payload: {} });
  assert.deepEqual(registry.parseRequest(command, { schemaVersion: 1, payload: { refreshId: "refresh-1" } }), {
    refreshId: "refresh-1",
  });
  assert.deepEqual(registry.parseSuccess(query, { schemaVersion: 1, ok: true, data: { state: "ready" } }), {
    state: "ready",
  });
  assert.deepEqual(registry.parseEvent(event, {
    schemaVersion: 1,
    workspaceRuntimeId: "runtime-opaque-1",
    revision: 2,
    scopes: ["contentSources"],
    reasonCode: "content-source-updated",
  }).revision, 2);
});

test("typed IPC registry rejects unknown versions, fields, status, and malformed events", () => {
  const registry = createContractRegistry([query, command, event]);
  assert.throws(() => registry.parseRequest(query, { schemaVersion: 2, payload: {} }), { code: "IPC_SCHEMA_UNSUPPORTED" });
  assert.throws(() => registry.parseRequest(query, { schemaVersion: 1, payload: {}, extra: true }), { code: "IPC_UNKNOWN_FIELD" });
  assert.throws(() => registry.parseRequest(query, { schemaVersion: 1, payload: { path: "C:\\secret" } }), { code: "IPC_UNKNOWN_FIELD" });
  assert.throws(() => registry.parseSuccess(query, { schemaVersion: 1, ok: true, data: { state: "unknown" } }), { code: "IPC_RESULT_INVALID" });
  assert.throws(() => registry.parseEvent(event, { schemaVersion: 1, workspaceRuntimeId: "bad/id", revision: 1, scopes: [], reasonCode: "x" }), { code: "IPC_EVENT_INVALID" });
});

test("typed IPC failures are closed SafeOperationalError values and never raw errors", () => {
  const registry = createContractRegistry([query, command, event]);
  const response = registry.failure(command, Object.assign(new Error("C:\\secret\\db.sqlite\nstack"), {
    code: "SQLITE_FULL",
    stack: "secret stack",
  }));
  assert.deepEqual(response, {
    schemaVersion: 1,
    ok: false,
    error: {
      code: "IPC_INTERNAL",
      category: "internal",
      retryability: "manual-check",
      userMessage: "操作未能安全完成，请稍后重试或检查诊断信息。",
    },
  });
  assert.doesNotMatch(JSON.stringify(response), /secret|sqlite|stack/i);
});

test("optional and nullable fields preserve exact nested object semantics", () => {
  const nested = defineContract({
    capability: "content.getDraft",
    channel: "content:get-draft",
    feature: "content",
    kind: "query",
    request: exactObject({
      cursor: optionalField(stringField({ max: 32 })),
      selection: nullableField(exactObject({
        articleId: stringField({ max: 64 }),
      })),
    }),
    success: exactObject({ accepted: "boolean" }),
  });
  const registry = createContractRegistry([nested]);

  assert.deepEqual(registry.encodeRequest(nested, { selection: null }), {
    schemaVersion: 1,
    payload: { selection: null },
  });
  assert.deepEqual(registry.encodeRequest(nested, {
    cursor: "next-1",
    selection: { articleId: "article-1" },
  }).payload, {
    cursor: "next-1",
    selection: { articleId: "article-1" },
  });
  assert.throws(() => registry.encodeRequest(nested, {
    cursor: undefined,
    selection: null,
  }), { code: "IPC_REQUEST_INVALID" });
  assert.throws(() => registry.encodeRequest(nested, {}), {
    code: "IPC_REQUEST_INVALID",
  });
  assert.throws(() => registry.encodeRequest(nested, {
    selection: undefined,
  }), { code: "IPC_REQUEST_INVALID" });
  assert.throws(() => registry.encodeRequest(nested, {
    selection: { articleId: "article-1", filePath: "C:\\secret" },
  }), { code: "IPC_UNKNOWN_FIELD" });
});

test("literal, enum, and finite number fields validate scalar protocol values", () => {
  const scalarCommand = defineContract({
    capability: "media.setDisplay",
    channel: "media:set-display",
    feature: "media",
    kind: "command",
    request: exactObject({
      mode: literalField("paged"),
      order: enumField(["newest", "oldest"]),
      threshold: numberField({ min: 0, max: 1 }),
    }),
    success: exactObject({ accepted: literalField(true) }),
  });
  const registry = createContractRegistry([scalarCommand]);

  assert.deepEqual(registry.encodeRequest(scalarCommand, {
    mode: "paged",
    order: "newest",
    threshold: 0.25,
  }).payload, { mode: "paged", order: "newest", threshold: 0.25 });
  assert.deepEqual(registry.success(scalarCommand, { accepted: true }).data, {
    accepted: true,
  });
  assert.throws(() => registry.encodeRequest(scalarCommand, {
    mode: "all",
    order: "newest",
    threshold: 0.25,
  }), { code: "IPC_REQUEST_INVALID" });
  assert.throws(() => registry.encodeRequest(scalarCommand, {
    mode: "paged",
    order: "random",
    threshold: 0.25,
  }), { code: "IPC_REQUEST_INVALID" });
  for (const threshold of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0.1, 1.1]) {
    assert.throws(() => registry.encodeRequest(scalarCommand, {
      mode: "paged",
      order: "oldest",
      threshold,
    }), { code: "IPC_REQUEST_INVALID" });
  }
});

test("bounded arrays validate each item through oneOf nested exact variants", () => {
  const filterCommand = defineContract({
    capability: "media.setFilters",
    channel: "media:set-filters",
    feature: "media",
    kind: "command",
    request: exactObject({
      filters: arrayField(oneOf([
        literalField("all"),
        exactObject({ tag: stringField({ min: 1, max: 24 }) }),
      ]), { min: 1, max: 3 }),
    }),
    success: exactObject({ accepted: "boolean" }),
  });
  const registry = createContractRegistry([filterCommand]);

  assert.deepEqual(registry.encodeRequest(filterCommand, {
    filters: ["all", { tag: "cover" }],
  }).payload, { filters: ["all", { tag: "cover" }] });
  for (const filters of [
    [],
    ["all", "all", "all", "all"],
    [{ tag: "cover", path: "C:\\secret" }],
    ["unknown"],
  ]) {
    assert.throws(() => registry.encodeRequest(filterCommand, { filters }), {
      code: filters[0] && typeof filters[0] === "object" && "path" in filters[0]
        ? "IPC_UNKNOWN_FIELD"
        : "IPC_REQUEST_INVALID",
    });
  }
});

test("schema validation fails closed for oversized and prototype-abnormal payloads", () => {
  const guarded = defineContract({
    capability: "media.guardPayload",
    channel: "media:guard-payload",
    feature: "media",
    kind: "command",
    request: exactObject({
      label: stringField({ min: 1, max: 4 }),
      ids: arrayField(integerField({ min: 1, max: 9 }), { max: 2 }),
    }),
    success: exactObject({ accepted: "boolean" }),
  });
  const registry = createContractRegistry([guarded]);

  assert.throws(() => registry.encodeRequest(guarded, {
    label: "12345",
    ids: [],
  }), { code: "IPC_REQUEST_INVALID" });
  assert.throws(() => registry.encodeRequest(guarded, {
    label: "safe",
    ids: [1, 2, 3],
  }), { code: "IPC_REQUEST_INVALID" });

  const inherited = Object.setPrototypeOf({ label: "safe", ids: [1] }, {
    filePath: "C:\\secret",
  });
  assert.throws(() => registry.encodeRequest(guarded, inherited), {
    code: "IPC_REQUEST_INVALID",
  });

  const sparseIds = [];
  sparseIds.length = 1;
  assert.throws(() => registry.encodeRequest(guarded, {
    label: "safe",
    ids: sparseIds,
  }), { code: "IPC_REQUEST_INVALID" });

  const accessor = { ids: [1] };
  Object.defineProperty(accessor, "label", {
    enumerable: true,
    get() {
      throw new Error("C:\\secret\\getter");
    },
  });
  assert.throws(() => registry.encodeRequest(guarded, accessor), {
    code: "IPC_REQUEST_INVALID",
  });

  const trapped = new Proxy({}, {
    getPrototypeOf() {
      throw new Error("C:\\secret\\prototype");
    },
  });
  assert.throws(() => registry.encodeRequest(guarded, trapped), {
    code: "IPC_REQUEST_INVALID",
  });

  const inheritedEnvelope = Object.setPrototypeOf({
    schemaVersion: 1,
    payload: { label: "safe", ids: [1] },
  }, { filePath: "C:\\secret" });
  assert.throws(() => registry.parseRequest(guarded, inheritedEnvelope), {
    code: "IPC_REQUEST_INVALID",
  });

  const accessorEnvelope = { payload: { label: "safe", ids: [1] } };
  Object.defineProperty(accessorEnvelope, "schemaVersion", {
    enumerable: true,
    get() {
      throw new Error("C:\\secret\\version");
    },
  });
  assert.throws(() => registry.parseRequest(guarded, accessorEnvelope), {
    code: "IPC_REQUEST_INVALID",
  });
});

test("failure envelopes contain only closed SafeOperationalError data for hostile errors", () => {
  const registry = createContractRegistry([query, command, event]);
  const hostile = {};
  Object.defineProperty(hostile, "code", {
    enumerable: true,
    get() {
      throw new Error("C:\\secret\\error-source");
    },
  });

  const response = registry.failure(command, hostile);
  assert.deepEqual(response, {
    schemaVersion: 1,
    ok: false,
    error: {
      code: "IPC_INTERNAL",
      category: "internal",
      retryability: "manual-check",
      userMessage: "操作未能安全完成，请稍后重试或检查诊断信息。",
    },
  });
  assert.doesNotMatch(JSON.stringify(response), /secret|error-source|stack/i);

  assert.throws(() => registry.parseResult(command, {
    schemaVersion: 1,
    ok: false,
    error: {
      code: "MEDIA_REFRESH_FAILED",
      category: "remote",
      retryability: "safe",
      userMessage: "请重试。",
      stack: "C:\\secret\\stack",
    },
  }), { code: "IPC_RESULT_INVALID" });
});

test("schema builders reject unbounded, undefined, empty, and prototype-abnormal definitions", () => {
  const reusableId = stringField({ max: 64 });
  assert.doesNotThrow(() => exactObject({ primaryId: reusableId, secondaryId: reusableId }));

  for (const build of [
    () => literalField(undefined),
    () => literalField(Number.NaN),
    () => enumField([]),
    () => enumField(["ready", undefined]),
    () => numberField({ min: 2, max: 1 }),
    () => numberField({ max: Number.POSITIVE_INFINITY }),
    () => arrayField(stringField(), { max: Number.POSITIVE_INFINITY }),
    () => oneOf([]),
    () => exactObject(Object.setPrototypeOf({ state: stringField() }, {
      path: "C:\\secret",
    })),
  ]) {
    assert.throws(build, { code: "IPC_CONTRACT_INVALID" });
  }
});
