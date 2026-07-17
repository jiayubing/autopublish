const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { getContentWorkspace } = require("../core/files");

function catalogError(code, message) { const error = new Error(message); error.code = code; return error; }
function isObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function assertSegment(value, code, label) { if (typeof value !== "string" || !value.trim() || value === "." || value === ".." || value.includes("/") || value.includes("\\") || path.isAbsolute(value) || path.win32.isAbsolute(value)) throw catalogError(code, `Invalid template ${label}`); return value; }
function assertInside(root, target, code) { const relative = path.relative(path.resolve(root), path.resolve(target)); if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) throw catalogError(code, "Template path is outside its root"); }
function hashText(value) { return crypto.createHash("sha256").update(value, "utf8").digest("hex"); }

function parseScalar(value, key) {
  const raw = String(value || "").trim();
  if ((raw.startsWith("\"") && raw.endsWith("\"")) || (raw.startsWith("'") && raw.endsWith("'"))) return raw.slice(1, -1);
  if (key === "enabled") { if (raw === "true") return true; if (raw === "false") return false; throw catalogError("TEMPLATE_FRONT_MATTER_INVALID", "Template front matter is invalid"); }
  if (key === "order") { if (!/^-?\d+$/.test(raw)) throw catalogError("TEMPLATE_FRONT_MATTER_INVALID", "Template front matter is invalid"); return Number(raw); }
  return raw;
}

function parseDocument(source) {
  const text = String(source || "").replace(/^\uFEFF/, "");
  if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) return { fields: {}, body: text.trim(), legacy: false };
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw catalogError("TEMPLATE_FRONT_MATTER_INVALID", "Template front matter is invalid");
  const fields = {};
  const allowed = new Set(["platform", "scenario", "name", "id", "displayName", "description", "order", "enabled"]);
  match[1].split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    const separator = line.indexOf(":");
    if (separator < 1) throw catalogError("TEMPLATE_FRONT_MATTER_INVALID", "Template front matter is invalid");
    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(key) || !allowed.has(key) || Object.prototype.hasOwnProperty.call(fields, key)) throw catalogError("TEMPLATE_FRONT_MATTER_INVALID", "Template front matter is invalid");
    const parsed = parseScalar(line.slice(separator + 1), key);
    if ((typeof parsed === "string" && !parsed.trim()) || parsed === undefined) throw catalogError("TEMPLATE_FRONT_MATTER_INVALID", "Template front matter is invalid");
    fields[key] = parsed;
  });
  return { fields, body: match[2].trim(), legacy: Boolean(fields.platform || fields.scenario || fields.name) };
}

function safeDirectory(root, platform, code) {
  assertSegment(platform, code, "platform");
  const directory = path.resolve(root, platform);
  assertInside(root, directory, code);
  if (!fs.existsSync(directory)) return directory;
  const realRoot = fs.realpathSync(root);
  const realDirectory = fs.realpathSync(directory);
  assertInside(realRoot, realDirectory, code);
  return realDirectory;
}

function readPlatformMetadata(directory, platformId, source) {
  const filename = path.join(directory, "platform.json");
  if (!fs.existsSync(filename)) return { displayName: platformId, description: "", order: 0, source };
  let parsed;
  try { const stat = fs.lstatSync(filename); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(); parsed = JSON.parse(fs.readFileSync(filename, "utf8")); } catch (_) { throw catalogError("TEMPLATE_PLATFORM_METADATA_INVALID", "Platform metadata is invalid"); }
  if (!isObject(parsed) || Object.keys(parsed).some((key) => !["displayName", "description", "order"].includes(key)) || (parsed.displayName !== undefined && (typeof parsed.displayName !== "string" || !parsed.displayName.trim())) || (parsed.description !== undefined && typeof parsed.description !== "string") || (parsed.order !== undefined && (!Number.isInteger(parsed.order) || parsed.order < 0))) throw catalogError("TEMPLATE_PLATFORM_METADATA_INVALID", "Platform metadata is invalid");
  return { displayName: parsed.displayName || platformId, description: parsed.description || "", order: parsed.order === undefined ? 0 : parsed.order, source };
}

function normalizeTemplate(filename, platformId, source) {
  let parsed;
  try { parsed = parseDocument(fs.readFileSync(filename, "utf8")); } catch (error) { throw error; }
  if (!parsed.body) throw catalogError("TEMPLATE_BODY_EMPTY", "Template body is empty");
  const fields = parsed.fields;
  if (fields.platform !== undefined && fields.platform !== platformId) throw catalogError("TEMPLATE_PLATFORM_MISMATCH", "Template platform does not match directory");
  if (fields.id !== undefined && fields.name !== undefined && fields.id !== fields.name) throw catalogError("TEMPLATE_ID_INVALID", "Template id is ambiguous");
  const fallbackId = path.basename(filename, path.extname(filename));
  const templateId = String(fields.id || fields.name || fallbackId);
  assertSegment(templateId, "TEMPLATE_INVALID_ID", "id");
  if (parsed.legacy && (!fields.platform || typeof fields.scenario !== "string" || !fields.scenario.trim() || typeof fields.name !== "string" || !fields.name.trim())) throw catalogError("TEMPLATE_FIELD_MISSING", "Legacy template metadata is incomplete");
  const displayName = String(fields.displayName || fields.scenario || fallbackId).trim();
  const scenario = String(fields.scenario || displayName).trim();
  const body = parsed.body;
  return {
    id: templateId,
    templateId,
    platform: platformId,
    platformId,
    displayName,
    name: displayName,
    description: typeof fields.description === "string" ? fields.description : "",
    scenario,
    order: Number.isInteger(fields.order) ? fields.order : 0,
    enabled: fields.enabled === undefined ? true : fields.enabled,
    body,
    bodyHash: hashText(body),
    revision: hashText(JSON.stringify({ platformId, templateId, displayName, scenario, description: typeof fields.description === "string" ? fields.description : "", order: Number.isInteger(fields.order) ? fields.order : 0, enabled: fields.enabled === undefined ? true : fields.enabled, bodyHash: hashText(body) })),
    source,
    readOnly: source === "builtin",
    sourceFileName: path.basename(filename)
  };
}

function templateFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.name.toLowerCase().endsWith(".md")).sort((a, b) => a.name.localeCompare(b.name));
}

function sourcePlatforms(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => entry.name).sort((a, b) => a.localeCompare(b));
}

function createTemplateCatalog(workspaceRoot, options) {
  const opts = options || {};
  const workspace = getContentWorkspace(workspaceRoot, opts.paths);
  const customRoot = path.resolve(workspace.templates);
  const builtinRoot = opts.builtinRoot === false ? null : path.resolve(typeof opts.builtinRoot === "string" ? opts.builtinRoot : path.resolve(__dirname, "../../resources/content-templates"));

  function listCatalog() {
    const platformIds = new Set(sourcePlatforms(customRoot));
    if (builtinRoot) sourcePlatforms(builtinRoot).forEach((id) => platformIds.add(id));
    const diagnostics = [];
    const byIdentity = new Map();
    const platformMetadata = new Map();
    Array.from(platformIds).sort((a, b) => a.localeCompare(b)).forEach((platformId) => {
      assertSegment(platformId, "TEMPLATE_INVALID_PLATFORM", "platform");
      const sources = [];
      if (sourcePlatforms(customRoot).includes(platformId)) sources.push({ root: customRoot, source: "custom" });
      if (builtinRoot && sourcePlatforms(builtinRoot).includes(platformId)) sources.push({ root: builtinRoot, source: "builtin" });
      sources.forEach(({ root, source }) => {
        let directory;
        try { directory = safeDirectory(root, platformId, "TEMPLATE_INVALID_PLATFORM"); } catch (error) { diagnostics.push({ code: error.code, message: error.message, platformId, source }); return; }
        try {
          const metadata = readPlatformMetadata(directory, platformId, source);
          const previous = platformMetadata.get(platformId);
          if (!previous || (source === "custom" && previous.source === "builtin")) platformMetadata.set(platformId, metadata);
          else if (previous.displayName !== metadata.displayName || previous.description !== metadata.description || previous.order !== metadata.order) diagnostics.push({ code: "TEMPLATE_PLATFORM_METADATA_CONFLICT", message: "Platform metadata conflicts", platformId, source });
        } catch (error) { diagnostics.push({ code: error.code, message: error.message, platformId, source }); }
        templateFiles(directory).forEach((entry) => {
          const filename = path.join(directory, entry.name);
          if (entry.isSymbolicLink() || !entry.isFile()) { diagnostics.push({ code: "TEMPLATE_SOURCE_INVALID", message: "Template source file is invalid", platformId, templateId: path.basename(entry.name, ".md"), source }); return; }
          try {
            const template = normalizeTemplate(filename, platformId, source);
            const identity = `${platformId}\u0000${template.templateId}`;
            const existing = byIdentity.get(identity);
            if (existing) {
              diagnostics.push({ code: existing.source === template.source ? "TEMPLATE_DUPLICATE_ID" : "TEMPLATE_ID_CONFLICT", message: "Template id is duplicated or conflicts", platformId, templateId: template.templateId, source });
              byIdentity.delete(identity);
            } else byIdentity.set(identity, template);
          } catch (error) { diagnostics.push({ code: error.code || "TEMPLATE_INVALID", message: error.message || "Template is invalid", platformId, templateId: path.basename(entry.name, ".md"), source }); }
        });
      });
    });
    const templates = Array.from(byIdentity.values()).filter((template) => template.enabled !== false).sort((a, b) => a.platform.localeCompare(b.platform) || a.order - b.order || a.displayName.localeCompare(b.displayName) || a.templateId.localeCompare(b.templateId));
    const platforms = Array.from(new Set(templates.map((template) => template.platform))).map((id) => platformMetadata.get(id) || { displayName: id, description: "", order: 0, source: "custom" }).sort((a, b) => a.order - b.order || a.displayName.localeCompare(b.displayName) || a.source.localeCompare(b.source)).map((metadata) => ({ id: metadata.id || Array.from(platformMetadata.entries()).find(([, item]) => item === metadata)?.[0] || metadata.displayName, displayName: metadata.displayName, description: metadata.description, order: metadata.order, source: metadata.source }));
    const revision = hashText(JSON.stringify({ platforms, templates: templates.map((template) => ({ platformId: template.platformId, templateId: template.templateId, bodyHash: template.bodyHash, displayName: template.displayName, description: template.description, order: template.order, enabled: template.enabled, source: template.source })) }));
    return { revision, platforms, templates, diagnostics };
  }

  function getTemplate(input) {
    if (!isObject(input)) throw catalogError("TEMPLATE_INPUT_INVALID", "Template selection is invalid");
    assertSegment(input.platformId, "TEMPLATE_INVALID_PLATFORM", "platform");
    assertSegment(input.templateId, "TEMPLATE_INVALID_ID", "id");
    const template = listCatalog().templates.find((item) => item.platformId === input.platformId && item.templateId === input.templateId);
    if (!template) throw catalogError("TEMPLATE_NOT_FOUND", "Template was not found");
    return template;
  }
  return { listCatalog, getTemplate };
}

module.exports = { createTemplateCatalog, parseDocument, normalizeTemplate };
