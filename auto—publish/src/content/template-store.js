const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { getContentWorkspace } = require("../core/files");
const { createTemplateCatalog } = require("./template-catalog");

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
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key) || (!value && key !== "name")) {
      throw templateError("TEMPLATE_FRONT_MATTER_INVALID", "Template front matter is invalid");
    }
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      throw templateError("TEMPLATE_FRONT_MATTER_INVALID", "Template front matter is invalid");
    }
    fields[key] = value.replace(/^(['"])(.*)\1$/, "$2");
  });
  return { fields: fields, body: match[2].trim() };
}

function hashText(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function readTemplate(filename, platform, source) {
  const parsed = parseFrontMatter(fs.readFileSync(filename, "utf8"));
  ["platform", "scenario"].forEach(function(field) {
    if (typeof parsed.fields[field] !== "string" || !parsed.fields[field].trim()) {
      throw templateError("TEMPLATE_FIELD_MISSING", "Template field is missing: " + field);
    }
  });
  if (!Object.prototype.hasOwnProperty.call(parsed.fields, "name")) {
    throw templateError("TEMPLATE_FIELD_MISSING", "Template field is missing: name");
  }
  assertSegment(parsed.fields.name, "TEMPLATE_INVALID_ID", "id");
  if (parsed.fields.platform !== platform) {
    throw templateError("TEMPLATE_PLATFORM_MISMATCH", "Template platform does not match directory");
  }
  if (!parsed.body) throw templateError("TEMPLATE_BODY_EMPTY", "Template body is empty");
  return {
    id: parsed.fields.name,
    platform: parsed.fields.platform,
    scenario: parsed.fields.scenario,
    name: parsed.fields.displayName || parsed.fields.name,
    body: parsed.body,
    bodyHash: hashText(parsed.body),
    source: source,
    readOnly: source === "builtin",
    sourcePath: filename
  };
}

function assertInside(root, target, code, message) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw templateError(code, message);
  }
}

function getTemplateDirectory(workspaceRoot, platform, paths) {
  assertSegment(platform, "TEMPLATE_INVALID_PLATFORM", "platform");
  const workspace = getContentWorkspace(workspaceRoot, paths);
  const templatesDirectory = path.resolve(workspace.templates);
  const directory = path.resolve(templatesDirectory, platform);
  assertInside(templatesDirectory, directory, "TEMPLATE_INVALID_PLATFORM", "Template platform is outside workspace");
  if (!fs.existsSync(directory)) return directory;

  const realTemplatesDirectory = fs.realpathSync(templatesDirectory);
  const realDirectory = fs.realpathSync(directory);
  assertInside(realTemplatesDirectory, realDirectory, "TEMPLATE_INVALID_PLATFORM", "Template platform is outside workspace");
  return realDirectory;
}

function getBuiltinTemplateDirectory(builtinRoot, platform) {
  assertSegment(platform, "TEMPLATE_INVALID_PLATFORM", "platform");
  const root = path.resolve(builtinRoot);
  const directory = path.resolve(root, platform);
  assertInside(root, directory, "TEMPLATE_INVALID_PLATFORM", "Builtin template platform is outside resources");
  if (!fs.existsSync(directory)) return directory;
  const realRoot = fs.realpathSync(root);
  const realDirectory = fs.realpathSync(directory);
  assertInside(realRoot, realDirectory, "TEMPLATE_INVALID_PLATFORM", "Builtin template platform is outside resources");
  return realDirectory;
}

function templateEntries(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(function(entry) { return entry.isFile() && path.extname(entry.name).toLowerCase() === ".md"; })
    .sort(function(a, b) { return a.name.localeCompare(b.name); });
}

function listDirectories(directory) {
  if (!directory || !fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter(function(entry) { return entry.isDirectory() && !entry.name.startsWith("."); })
    .map(function(entry) { return entry.name; })
    .sort(function(a, b) { return a.localeCompare(b); });
}

function listTemplatePlatforms(workspaceRoot, options) {
  return listDirectories(path.resolve(getContentWorkspace(workspaceRoot, options && options.paths).templates));
}

function listBuiltinTemplatePlatforms(builtinRoot) {
  return listDirectories(path.resolve(builtinRoot));
}

function listTemplatesFromDirectory(directory, platform, source) {
  const templates = templateEntries(directory).map(function(entry) {
    return readTemplate(path.join(directory, entry.name), platform, source);
  });
  const ids = new Set();
  templates.forEach(function(template) {
    if (ids.has(template.id)) throw templateError("TEMPLATE_DUPLICATE_ID", "Template id is duplicated for platform");
    ids.add(template.id);
  });
  return templates;
}

function listTemplates(workspaceRoot, platform, options) {
  const opts = options || {};
  const builtinRoot = typeof opts.builtinRoot === "string" ? opts.builtinRoot : null;
  if (platform === undefined) {
    const platforms = new Set(listTemplatePlatforms(workspaceRoot, opts));
    if (builtinRoot) listBuiltinTemplatePlatforms(builtinRoot).forEach(function(item) { platforms.add(item); });
    return Array.from(platforms).sort(function(a, b) { return a.localeCompare(b); }).flatMap(function(platformId) {
      return listTemplates(workspaceRoot, platformId, opts);
    });
  }

  const custom = listTemplatesFromDirectory(getTemplateDirectory(workspaceRoot, platform, opts.paths), platform, "custom");
  const builtin = builtinRoot ? listTemplatesFromDirectory(getBuiltinTemplateDirectory(builtinRoot, platform), platform, "builtin") : [];
  const ids = new Map();
  custom.concat(builtin).forEach(function(template) {
    const previous = ids.get(template.id);
    if (previous) {
      if (previous.source !== template.source) throw templateError("TEMPLATE_ID_CONFLICT", "Builtin and custom templates cannot share an id");
      throw templateError("TEMPLATE_DUPLICATE_ID", "Template id is duplicated for platform");
    }
    ids.set(template.id, template);
  });
  return Array.from(ids.values()).sort(function(a, b) { return a.scenario.localeCompare(b.scenario) || a.id.localeCompare(b.id); });
}

function resolveBuiltinRoot(options) {
  const opts = options || {};
  if (opts.builtinRoot === false) return null;
  if (typeof opts.builtinRoot === "string") return path.resolve(opts.builtinRoot);
  const candidates = [];
  if (typeof opts.appRoot === "string") candidates.push(path.join(opts.appRoot, "resources", "content-templates"));
  if (typeof process.resourcesPath === "string") candidates.push(path.join(process.resourcesPath, "content-templates"));
  candidates.push(path.resolve(__dirname, "../../resources/content-templates"));
  return candidates.find(function(candidate) { return fs.existsSync(candidate); }) || candidates[candidates.length - 1];
}

function getTemplate(workspaceRoot, platform, templateId, options) {
  assertSegment(templateId, "TEMPLATE_INVALID_ID", "id");
  const template = listTemplates(workspaceRoot, platform, options).find(function(item) { return item.id === templateId; });
  if (!template) throw templateError("TEMPLATE_NOT_FOUND", "Template was not found");
  return template;
}

function writeCustomTemplate(workspaceRoot, template, options) {
  assertSegment(template.platform, "TEMPLATE_INVALID_PLATFORM", "platform");
  assertSegment(template.id, "TEMPLATE_INVALID_ID", "id");
  if (typeof template.scenario !== "string" || !template.scenario.trim() || typeof template.body !== "string" || !template.body.trim()) {
    throw templateError("TEMPLATE_INPUT_INVALID", "Custom template scenario and body are required");
  }
  const directory = getTemplateDirectory(workspaceRoot, template.platform, options && options.paths);
  const filename = path.join(directory, template.id + ".md");
  assertInside(directory, filename, "TEMPLATE_INVALID_ID", "Template id is outside workspace");
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(filename, "---\nplatform: " + template.platform + "\nscenario: " + template.scenario + "\nname: " + template.id + "\n---\n" + template.body.trim() + "\n", "utf8");
  return readTemplate(filename, template.platform, "custom");
}

function createTemplateStore(workspaceRoot, options) {
  const opts = options || {};
  const builtinRoot = resolveBuiltinRoot(opts);
  const storeOptions = Object.assign({}, opts, { builtinRoot: builtinRoot });
  const createId = typeof opts.createId === "function" ? opts.createId : function() { return crypto.randomUUID(); };
  const catalogStore = createTemplateCatalog(workspaceRoot, storeOptions);

  function catalog(platform) { return listTemplates(workspaceRoot, platform, storeOptions); }
  function get(platform, templateId) { return getTemplate(workspaceRoot, platform, templateId, storeOptions); }

  function saveTemplate(template) {
    const value = Object.assign({}, template, { source: "custom", readOnly: false });
    const builtin = builtinRoot && listTemplatesFromDirectory(getBuiltinTemplateDirectory(builtinRoot, value.platform), value.platform, "builtin").find(function(item) { return item.id === value.id; });
    if (builtin) throw templateError("TEMPLATE_ID_CONFLICT", "Builtin and custom templates cannot share an id");
    return writeCustomTemplate(workspaceRoot, value, storeOptions);
  }

  function copyBuiltinTemplate(platform, templateId, copyOptions) {
    const builtin = builtinRoot && listTemplatesFromDirectory(getBuiltinTemplateDirectory(builtinRoot, platform), platform, "builtin").find(function(item) { return item.id === templateId; });
    if (!builtin) throw templateError("TEMPLATE_NOT_FOUND", "Builtin template was not found");
    const optionsForCopy = copyOptions || {};
    let id = optionsForCopy.id || (builtin.id + "-custom-" + createId());
    assertSegment(id, "TEMPLATE_INVALID_ID", "id");
    if (id === builtin.id) throw templateError("TEMPLATE_ID_CONFLICT", "Copied template must have a custom id");
    if (catalog(platform).some(function(item) { return item.id === id; })) throw templateError("TEMPLATE_ID_CONFLICT", "Template id is already in use");
    const copied = saveTemplate({ id: id, platform: platform, scenario: optionsForCopy.scenario || builtin.scenario, body: optionsForCopy.body || builtin.body });
    copied.sourceSnapshot = {
      source: builtin.source,
      platform: builtin.platform,
      id: builtin.id,
      name: builtin.name,
      scenario: builtin.scenario,
      body: builtin.body,
      bodyHash: builtin.bodyHash
    };
    return copied;
  }

  return {
    listTemplates: catalog,
    getTemplate: get,
    listCatalog: catalogStore.listCatalog,
    getCatalogTemplate: catalogStore.getTemplate,
    loadTemplate: get,
    saveTemplate: saveTemplate,
    copyBuiltinTemplate: copyBuiltinTemplate
  };
}

module.exports = {
  listTemplates,
  listTemplatePlatforms,
  listBuiltinTemplatePlatforms,
  getTemplate,
  createTemplateStore,
  parseFrontMatter,
  resolveBuiltinRoot
  ,createTemplateCatalog
};
