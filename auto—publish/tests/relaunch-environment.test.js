const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  captureEnvironmentValue,
  environmentFromCapturedValue,
  restoreEnvironmentValue,
} = require("../desktop/relaunch-environment");

test("runtime workspace injection does not become an environment override after relaunch", function () {
  const environment = {};
  const startup = captureEnvironmentValue(
    environment,
    "AUTO_PUBLISH_WORKSPACE",
  );
  environment.AUTO_PUBLISH_WORKSPACE = "runtime-selected-workspace";

  restoreEnvironmentValue(environment, "AUTO_PUBLISH_WORKSPACE", startup);

  assert.equal(
    Object.prototype.hasOwnProperty.call(environment, "AUTO_PUBLISH_WORKSPACE"),
    false,
  );
});
test("an explicit startup workspace override survives runtime setup and relaunch", function () {
  const environment = { AUTO_PUBLISH_WORKSPACE: "external-workspace" };
  const startup = captureEnvironmentValue(
    environment,
    "AUTO_PUBLISH_WORKSPACE",
  );
  environment.AUTO_PUBLISH_WORKSPACE = "runtime-selected-workspace";

  restoreEnvironmentValue(environment, "AUTO_PUBLISH_WORKSPACE", startup);

  assert.equal(environment.AUTO_PUBLISH_WORKSPACE, "external-workspace");
});
test("workspace bootstrap sees only the immutable startup override", function () {
  const environment = {};
  const startup = captureEnvironmentValue(
    environment,
    "AUTO_PUBLISH_WORKSPACE",
  );
  environment.AUTO_PUBLISH_WORKSPACE = "runtime-selected-workspace";

  assert.deepEqual(
    environmentFromCapturedValue("AUTO_PUBLISH_WORKSPACE", startup),
    {},
  );

  const external = captureEnvironmentValue(
    { AUTO_PUBLISH_WORKSPACE: "external-workspace" },
    "AUTO_PUBLISH_WORKSPACE",
  );
  assert.deepEqual(
    environmentFromCapturedValue("AUTO_PUBLISH_WORKSPACE", external),
    { AUTO_PUBLISH_WORKSPACE: "external-workspace" },
  );
});
