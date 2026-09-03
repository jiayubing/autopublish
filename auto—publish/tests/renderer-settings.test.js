const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relative) =>
  fs.readFileSync(path.join(root, relative), "utf8");
const {
  mapRuntimeCapabilityState,
} = require("../media-workbench/src/runtime-capability-state.cjs");

describe("renderer settings contract", function () {
  it("maps all runtime capability states without treating not_checked as unavailable", function () {
    assert.deepEqual(mapRuntimeCapabilityState({ state: "ready" }), {
      label: "\u53ef\u7528",
      tone: "ready",
    });
    assert.deepEqual(mapRuntimeCapabilityState({ state: "not_checked" }), {
      label: "\u672a\u68c0\u6d4b",
      tone: "not_checked",
    });
    assert.deepEqual(
      mapRuntimeCapabilityState({ state: "optional_unconfigured" }),
      {
        label:
          "\u672a\u914d\u7f6e\uff08\u4ec5\u5f71\u54cd\u6cb3\u7554\u6295\u7a3f\uff09",
        tone: "optional",
      },
    );
    assert.deepEqual(mapRuntimeCapabilityState({ state: "unavailable" }), {
      label: "\u4e0d\u53ef\u7528",
      tone: "unavailable",
    });
  });
});


describe("platform account workflow placement", function () {
  it("keeps account maintenance in settings instead of the submission selector", function () {
    const navigation = read(
      "media-workbench/src/components/settings/SettingsNavigation.tsx",
    );
    const settings = read(
      "media-workbench/src/components/settings/PlatformAccountSettings.tsx",
    );
    const selector = read(
      "media-workbench/src/components/content/AccountProfileSelector.tsx",
    );

    assert.match(navigation, /platformAccounts/);
    assert.match(navigation, /平台账号/);
    for (const action of ["打开登录页", "检查登录", "创建并绑定", "绑定当前账号", "删除档案"])
      assert.match(settings, new RegExp(action));
    for (const action of ["打开登录页", "检查登录", "创建并绑定", "绑定当前账号", "删除档案"])
      assert.doesNotMatch(selector, new RegExp(action));
    assert.match(selector, /设置 → 平台账号/);
  });

  it("remembers the regular target and requests automatic execution after admission", function () {
    const session = read(
      "media-workbench/src/components/content/use-submission-intake-session.ts",
    );
    assert.match(session, /auto-publish:regular-submission-target/);
    assert.match(session, /autoStart:\s*true/);
    assert.doesNotMatch(session, /startRegularQueueGroup:/);
  });
});
