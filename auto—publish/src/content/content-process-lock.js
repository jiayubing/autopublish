"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function acquireProcessLock(directory) {
  const owner = `owner-${process.pid}-${randomUUID()}`;
  for (;;) {
    try {
      fs.mkdirSync(directory);
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const stat = fs.lstatSync(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw error;
      const entries = fs.readdirSync(directory);
      const match = entries.length === 1 && /^owner-(\d+)-[a-f0-9-]+$/.exec(entries[0]);
      // Empty/legacy locks and inaccessible owners cannot be proven abandoned.
      if (!match) throw error;
      try {
        process.kill(Number(match[1]), 0);
        throw error;
      } catch (probeError) {
        if (probeError.code !== "ESRCH") throw probeError;
      }
      try {
        // Only the contender that removes this exact dead owner may remove its directory.
        fs.unlinkSync(path.join(directory, entries[0]));
      } catch (removeError) {
        if (removeError.code === "ENOENT") continue;
        throw removeError;
      }
      fs.rmdirSync(directory);
    }
  }
  try {
    fs.writeFileSync(path.join(directory, owner), "", { flag: "wx" });
  } catch (error) {
    try { fs.rmdirSync(directory); } catch { /* Preserve acquisition failure. */ }
    throw error;
  }
  return () => {
    fs.unlinkSync(path.join(directory, owner));
    fs.rmdirSync(directory);
  };
}

module.exports = { acquireProcessLock };
