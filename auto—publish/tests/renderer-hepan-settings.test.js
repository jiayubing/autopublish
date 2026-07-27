const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("Hepan settings diagnostics", () => {
  it("renders independent safe capability guidance and never renders the Cookie", () => {
    const source = fs.readFileSync(
      path.resolve(
        __dirname,
        "..",
        "media-workbench/src/components/settings/HepanProviderSettings.tsx",
      ),
      "utf8",
    );
    const feature = fs.readFileSync(
      path.resolve(
        __dirname,
        "..",
        "media-workbench/src/features/settings/settings-feature.js",
      ),
      "utf8",
    );
    assert.match(
      feature,
      /Cookie 登录有效，但栏目 121 无发文权限或栏目 ID 不正确/,
    );
    assert.match(feature, /Cookie 已通过身份检查，但河畔发帖页面结构已变化/);
    assert.match(feature, /河畔网络请求超时，请稍后重试，无需更换 Cookie/);
    assert.match(source, /身份：\{status\.lastTest\.authenticated/);
    assert.match(source, /登录账号：\{status\.lastTest\.account\.displayName/);
    assert.match(source, /账号名称未识别/);
    assert.match(source, /formatBeijingTime/);
    assert.match(source, /HEPAN_UPLOAD_CONTEXT_CHANGED/);
    assert.doesNotMatch(source, /Promise\.race/);
    assert.doesNotMatch(source, /window\.confirm/);
    assert.doesNotMatch(source, /lastTest\.errorCode/);
    assert.doesNotMatch(source, /cookie\.length|cookie\.slice/);
    assert.match(source, /useSettingsFeature/);
    assert.doesNotMatch(source, /bridge\/settings/);
  });
});
