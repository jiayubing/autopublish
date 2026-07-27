function captureEnvironmentValue(environment, key) {
  const source = environment || {};
  return Object.freeze({
    present: Object.prototype.hasOwnProperty.call(source, key),
    value: source[key],
  });
}

function restoreEnvironmentValue(environment, key, captured) {
  if (!environment || !captured) return;
  if (captured.present) environment[key] = captured.value;
  else delete environment[key];
}

function environmentFromCapturedValue(key, captured) {
  if (!captured || captured.present !== true) return Object.freeze({});
  return Object.freeze({ [key]: captured.value });
}

module.exports = {
  captureEnvironmentValue,
  environmentFromCapturedValue,
  restoreEnvironmentValue,
};
