const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createContentPathPolicy } = require("./content-path-policy");
const { createAtomicFileWriter } = require("./content-file-transaction");

const MAX_GROUPS = 200;
const MAX_CLIENTS = 10000;
const MAX_BYTES = 5 * 1024 * 1024;
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isId = (value) => typeof value === "string" && value.length > 0 && value.length <= 200 && value.trim() === value && !/[\\/\x00-\x1f\x7f]/u.test(value) && value !== "." && value !== "..";

function groupError(code) {
  return Object.assign(new Error(code), { code });
}

function groupName(value) {
  if (typeof value !== "string") throw groupError("CLIENT_GROUP_INPUT_INVALID");
  const name = value.trim().normalize("NFC");
  if (!name || name.length > 40 || /[\x00-\x1f\x7f]/u.test(name) || ["全部客户", "未分组"].includes(name)) {
    throw groupError("CLIENT_GROUP_INPUT_INVALID");
  }
  return name;
}

function emptyCatalog() {
  return { revision: 0, groups: [], memberships: [] };
}

// This one document owns both names and memberships, so deleting a group or
// moving multiple clients never requires partially updating client documents.
function createClientGroupStore(workspaceRoot, options = {}) {
  const fsApi = options.fs || fs;
  const paths = createContentPathPolicy(workspaceRoot, { paths: options.paths, fs: fsApi });
  const directory = path.join(paths.root, ".autopublish");
  const filename = path.join(directory, "client-groups.json");
  const writer = createAtomicFileWriter({ fs: fsApi });

  function location(create) {
    if (!paths.assertWorkspaceRoot({ code: "CLIENT_GROUP_STORAGE_FAILED" })) throw groupError("CLIENT_GROUP_STORAGE_FAILED");
    const existing = paths.assertDirectory(directory, {
      boundary: paths.root, create, returnMissing: false,
      code: "CLIENT_GROUP_STORAGE_FAILED", label: "Client group directory",
    });
    return existing && paths.assertRegularFile(filename, {
      boundary: directory, allowMissing: true,
      code: "CLIENT_GROUP_STORAGE_FAILED", label: "Client group file",
    });
  }

  function read() {
    try {
      if (!location(false)) return emptyCatalog();
      if (fsApi.statSync(filename).size > MAX_BYTES) throw groupError("CLIENT_GROUP_DATA_INVALID");
      const document = JSON.parse(fsApi.readFileSync(filename, "utf8"));
      if (!isObject(document) || document.version !== 1 || !Number.isSafeInteger(document.revision) || document.revision < 1 ||
          !Array.isArray(document.groups) || document.groups.length > MAX_GROUPS ||
          !Array.isArray(document.memberships) || document.memberships.length > MAX_CLIENTS) throw groupError("CLIENT_GROUP_DATA_INVALID");
      const ids = new Set();
      const names = new Set();
      for (const group of document.groups) {
        if (!isObject(group) || !isId(group.id) || ids.has(group.id) || groupName(group.name) !== group.name || names.has(group.name.toLowerCase())) throw groupError("CLIENT_GROUP_DATA_INVALID");
        ids.add(group.id);
        names.add(group.name.toLowerCase());
      }
      const clients = new Set();
      for (const member of document.memberships) {
        if (!isObject(member) || !isId(member.clientId) || !ids.has(member.groupId) || clients.has(member.clientId)) throw groupError("CLIENT_GROUP_DATA_INVALID");
        clients.add(member.clientId);
      }
      return {
        revision: document.revision,
        groups: document.groups.map(({ id, name }) => ({ id, name })),
        memberships: document.memberships.map(({ clientId, groupId }) => ({ clientId, groupId })),
      };
    } catch (error) {
      if (error.code === "CLIENT_GROUP_STORAGE_FAILED") throw error;
      throw groupError("CLIENT_GROUP_DATA_INVALID");
    }
  }

  function update(input, availableClientIds = []) {
    const fields = {
      create: ["action", "revision", "name"],
      rename: ["action", "revision", "groupId", "name"],
      delete: ["action", "revision", "groupId"],
      assign: ["action", "revision", "groupId", "clientIds"],
    };
    const allowed = isObject(input) && own(fields, input.action) && fields[input.action];
    if (!allowed || Object.keys(input).some((key) => !allowed.includes(key)) || allowed.some((key) => !own(input, key)) ||
        !Number.isSafeInteger(input.revision) || input.revision < 0) throw groupError("CLIENT_GROUP_INPUT_INVALID");
    const catalog = read();
    if (input.revision !== catalog.revision) throw groupError("CLIENT_GROUP_CONFLICT");
    if (catalog.revision === Number.MAX_SAFE_INTEGER) throw groupError("CLIENT_GROUP_STORAGE_FAILED");
    const action = input.action;
    const target = catalog.groups.find((group) => group.id === input.groupId);
    if (action !== "create" && !(action === "assign" && input.groupId === null) && !target) throw groupError("CLIENT_GROUP_NOT_FOUND");
    if (action === "create" || action === "rename") {
      const name = groupName(input.name);
      if (catalog.groups.some((group) => group.id !== target?.id && group.name.toLowerCase() === name.toLowerCase())) throw groupError("CLIENT_GROUP_NAME_EXISTS");
      if (action === "create") {
        if (catalog.groups.length >= MAX_GROUPS) throw groupError("CLIENT_GROUP_LIMIT");
        catalog.groups.push({ id: randomUUID(), name });
      } else target.name = name;
    } else if (action === "delete") {
      catalog.groups = catalog.groups.filter((group) => group.id !== target.id);
      catalog.memberships = catalog.memberships.filter((member) => member.groupId !== target.id);
    } else {
      if (!Array.isArray(input.clientIds) || !input.clientIds.length || input.clientIds.length > MAX_CLIENTS || input.clientIds.some((id) => !isId(id))) throw groupError("CLIENT_GROUP_INPUT_INVALID");
      const selected = new Set(input.clientIds);
      const available = new Set(availableClientIds);
      if (selected.size !== input.clientIds.length) throw groupError("CLIENT_GROUP_INPUT_INVALID");
      if (input.clientIds.some((id) => !available.has(id))) throw groupError("CLIENT_GROUP_CLIENT_NOT_FOUND");
      catalog.memberships = catalog.memberships.filter((member) => !selected.has(member.clientId));
      if (input.groupId !== null) catalog.memberships.push(...input.clientIds.map((clientId) => ({ clientId, groupId: input.groupId })));
      if (catalog.memberships.length > MAX_CLIENTS) throw groupError("CLIENT_GROUP_LIMIT");
    }
    catalog.revision += 1;
    // No await between read / revision check / atomic write: the main-process
    // owner serializes mutations, while revision rejects stale UI requests.
    try {
      location(true);
      writer.write(filename, JSON.stringify({ version: 1, ...catalog }, null, 2) + "\n", { keepExisting: false });
    } catch (_) {
      throw groupError("CLIENT_GROUP_STORAGE_FAILED");
    }
    return catalog;
  }

  return { read, update };
}

module.exports = { createClientGroupStore };
