"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_FINAL_KNOWLEDGE_PROMPT = fs
  .readFileSync(
    path.join(__dirname, "default-final-knowledge-prompt.md"),
    "utf8",
  )
  .trim();

const FINAL_KNOWLEDGE_CHARACTER_RANGE = Object.freeze([600, 1000]);

module.exports = {
  DEFAULT_FINAL_KNOWLEDGE_PROMPT,
  FINAL_KNOWLEDGE_CHARACTER_RANGE,
};
