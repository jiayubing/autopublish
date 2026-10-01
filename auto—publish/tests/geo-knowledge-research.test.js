"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseJsonObject, createRequestBudget } = require("../src/content/geo-knowledge-research");
const { normalizeCandidate, mergeKnowledge } = require("../src/content/geo-knowledge-merge");
test("JSON parser accepts one object in common model wrappers without weakening validation", () => {
  assert.deepEqual(parseJsonObject('```JSON\n{"tasks":[]}\n```'), {
    tasks: [],
  });
  assert.deepEqual(parseJsonObject('以下是结果：\n{"tasks":[]}'), {
    tasks: [],
  });
  assert.throws(() => parseJsonObject("[1,2,3]"), {
    code: "GEO_SCHEMA_INVALID",
  });
  assert.throws(() => parseJsonObject("{not-json}"), {
    code: "GEO_SCHEMA_INVALID",
  });
});

test("profile enrichment adds non-conflicting fields and reports only contradictory fields", () => {
  const source = [{ id: "s", type: "client_input", title: "合成资料" }];
  const make = (fields) =>
    normalizeCandidate(
      { profile: { fields, basis: "fact", sourceIds: ["s"] } },
      source,
      "client-1",
    );
  const original = make({ name: "合成客户", location: "郑州" });
  const added = mergeKnowledge(
    original,
    make({ location: "郑州", name: "合成客户", serviceArea: "本地" }),
  );
  assert.deepEqual(added.profile.fields, {
    location: "郑州",
    name: "合成客户",
    serviceArea: "本地",
  });
  assert.equal(added.restrictions.length, 0);
  const conflict = mergeKnowledge(
    original,
    make({ name: "合成客户", location: "洛阳", serviceArea: "本地" }),
  );
  assert.equal(conflict.profile.fields.location, "郑州");
  assert.equal(conflict.profile.fields.serviceArea, "本地");
  assert.equal(conflict.restrictions.length, 1);
  assert.match(conflict.restrictions[0].description, /郑州/);
  assert.match(conflict.restrictions[0].description, /洛阳/);
  assert.doesNotMatch(conflict.restrictions[0].description, /serviceArea/);
});


test("continuous budget reserves the final request and counts uncertain dispatches without retry", async () => {
  let calls = 0;
  const budget = createRequestBudget(async () => { calls++; }, { hardLimit: 12, synthesisReserve: 1 });
  for (let i = 0; i < 11; i++) await budget.request({});
  await assert.rejects(budget.request({}), { code: "GEO_REQUEST_BUDGET_EXHAUSTED" });
  await budget.request({}, { useReserve: true });
  await assert.rejects(budget.request({}, { useReserve: true }), { code: "GEO_REQUEST_BUDGET_EXHAUSTED" });
  assert.equal(calls, 12);
  const uncertain = createRequestBudget(async () => { throw Object.assign(new Error(), { code: "GEO_REQUEST_UNCERTAIN" }); }, { hardLimit: 12, synthesisReserve: 1 });
  await assert.rejects(uncertain.request({}), { code: "GEO_REQUEST_UNCERTAIN" });
  assert.equal(uncertain.snapshot().count, 1);
});
