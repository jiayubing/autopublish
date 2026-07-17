const LABELS = Object.freeze({
  ready: { label: "\u53ef\u7528", tone: "ready" },
  not_checked: { label: "\u672a\u68c0\u6d4b", tone: "not_checked" },
  optional_unconfigured: { label: "\u672a\u914d\u7f6e\uff08\u4ec5\u5f71\u54cd\u6cb3\u7554\u6295\u7a3f\uff09", tone: "optional" },
  unavailable: { label: "\u4e0d\u53ef\u7528", tone: "unavailable" }
});

function mapRuntimeCapabilityState(capability) {
  const state = capability && LABELS[capability.state] ? capability.state : "unavailable";
  return Object.assign({}, LABELS[state]);
}

module.exports = { mapRuntimeCapabilityState };
