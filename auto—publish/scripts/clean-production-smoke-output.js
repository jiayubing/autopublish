"use strict";

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUTPUT = path.join(ROOT, "release-production-smoke");

function cleanProductionSmokeOutput() {
  // This is a build-only directory created by the smoke command. Keep the
  // target explicit so cleanup cannot cross into user state or content roots.
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  return { output: OUTPUT, removed: true };
}

if (require.main === module)
  process.stdout.write(JSON.stringify(cleanProductionSmokeOutput()) + "\n");

module.exports = { cleanProductionSmokeOutput, OUTPUT };
