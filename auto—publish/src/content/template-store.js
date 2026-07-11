const fs = require("fs");
const path = require("path");

const { getContentWorkspace } = require("../core/files");

function templateError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function assertSegment(value, code, label) {
  if (typeof value !== "string" || !value.trim() || value === "." || value === ".." ||
      value.includes("/") || value.includes("\\") || path.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw templateError(code, "Invalid template " + label);
  }
}

function parseFrontMatter(source) {
  const text = source.replace(/^\uFEFF/, "");
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw templateError("TEMPLATE_FRONT_MATTER_REQUIRED", "Template front matter is required");

  const fields = {};
  match[1].split(/\r?\n/).forEach(function(line) {
    if (!line.trim()) return;
    const separator = line.indexOf(":");
    if (separator < 1) throw templateError("TEMPLATE_FRONT_MATTER_INVALID", "Template front matter is invalid");
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key) || !value) {
      throw templateError("TEMPLATE_FRONT_MATTER_INVALID", "Template front matter is invalid");
    }
    fields[key] = value.replace(/^(['"])(.*)\1$/, "$2");
  });
  return { fields: fields, body: match[2].trim() };
}

function readTemplate(filename, platform) {
  const parsed = parseFrontMatter(fs.readFileSync(filename, "utf8"));
  ["platform", "scenario", "name"].forEach(function(field) {
    if (typeof parsed.fields[field] !== "string" || !parsed.fields[field].trim()) {
      throw templateError("TEMPLATE_FIELD_MISSING", "Template field is missing: " + field);
    }
  });
  if (parsed.fields.platform !== platform) {
    throw templateError("TEMPLATE_PLATFORM_MISMATCH", "Template platform does not match directory");
  }
  if (!parsed.body) throw templateError("TEMPLATE_BODY_EMPTY", "Template body is empty");
  return {
    id: parsed.fields.name,
    platform: parsed.fields.platform,
    scenario: parsed.fields.scenario,
    name: parsed.fields.name,
    body: parsed.body,
    sourcePath: filename
  };
}

function getTemplateDirectory(workspaceRoot, platform) {
  assertSegment(platform, "TEMPLATE_INVALID_PLATFORM", "platform");
  const workspace = getContentWorkspace(workspaceRoot);
  const templatesDirectory = path.resolve(workspace.templates);
  const directory = path.resolve(templatesDirectory, platform);
  const relative = path.relative(templatesDirectory, directory);
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw templateError("TEMPLATE_INVALID_PLATFORM", "Template platform is outside workspace");
  }
  if (!fs.existsSync(directory)) return directory;

  const realTemplatesDirectory = fs.realpathSync(templatesDirectory);
  const realDirectory = fs.realpathSync(directory);
  const realRelative = path.relative(realTemplatesDirectory, realDirectory);
  if (realRelative === ".." || realRelative.startsWith(".." + path.sep) || path.isAbsolute(realRelative)) {
    throw templateError("TEMPLATE_INVALID_PLATFORM", "Template platform is outside workspace");
  }
  return realDirectory;
}

function templateEntries(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(function(entry) { return entry.isFile() && path.extname(entry.name).toLowerCase() === ".md"; })
    .sort(function(a, b) { return a.name.localeCompare(b.name); });
}

function listTemplates(workspaceRoot, platform) {
  const directory = getTemplateDirectory(workspaceRoot, platform);
  const templates = templateEntries(directory).map(function(entry) {
    return readTemplate(path.join(directory, entry.name), platform);
  });
  const ids = new Set();
  templates.forEach(function(template) {
    if (ids.has(template.id)) {
      throw templateError("TEMPLATE_DUPLICATE_ID", "Template id is duplicated for platform");
    }
    ids.add(template.id);
  });
  return templates.sort(function(a, b) { return a.scenario.localeCompare(b.scenario) || a.id.localeCompare(b.id); });
}

function getTemplate(workspaceRoot, platform, templateId) {
  assertSegment(templateId, "TEMPLATE_INVALID_ID", "id");
  const template = listTemplates(workspaceRoot, platform).find(function(item) { return item.id === templateId; });
  if (!template) throw templateError("TEMPLATE_NOT_FOUND", "Template was not found");
  return template;
}

function createTemplateStore(workspaceRoot) {
  return {
    listTemplates: function(platform) { return listTemplates(workspaceRoot, platform); },
    getTemplate: function(platform, templateId) { return getTemplate(workspaceRoot, platform, templateId); },
    loadTemplate: function(platform, templateId) { return getTemplate(workspaceRoot, platform, templateId); }
  };
}

module.exports = { listTemplates, getTemplate, createTemplateStore, parseFrontMatter };
