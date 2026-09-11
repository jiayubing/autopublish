"use strict";

function admitFixtureItem(port, input) {
  const outcome = port.admitRegularQueueItems([input])[0];
  if (outcome.error) throw outcome.error;
  return outcome.result;
}

module.exports = { admitFixtureItem };
