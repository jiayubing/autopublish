"use strict";

// Stable facade for the frozen diagnostic record contract. Validation
// primitives and record construction live in separate modules so sinks and
// projections cannot accidentally become owners of schema policy.
module.exports = Object.assign(
  {},
  require("./diagnostic-contract"),
  require("./diagnostic-record-factory"),
);
