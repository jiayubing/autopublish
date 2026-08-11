const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  entries.forEach(function (entry) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.from(entry.data, "utf8");
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    localParts.push(header, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc32(data), 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += header.length + name.length + data.length;
  });
  const central = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat(localParts.concat([central, end]));
}

function createMinimalDocx() {
  return createZip([
    {
      name: "[Content_Types].xml",
      data: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    },
    {
      name: "_rels/.rels",
      data: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    },
    {
      name: "word/document.xml",
      data: '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>\u5ba2\u6237\u8d44\u6599\u6807\u9898</w:t></w:r></w:p><w:p><w:r><w:t>Packaged DOCX smoke text.</w:t></w:r></w:p><w:sectPr/></w:body></w:document>',
    },
  ]);
}

function packagedDocxError(message, cause) {
  const error = new Error(message);
  error.code = "PACKAGED_DOCX_RUNTIME_FAILED";
  if (cause && typeof cause.code === "string") error.causeCode = cause.code;
  return error;
}

async function verifyPackagedRuntime(appDir, options) {
  const root = path.resolve(appDir || "");
  if (!root) throw packagedDocxError("Packaged app directory is required");
  const previous = {
    PATH: process.env.PATH,
    MARKITDOWN_CMD: process.env.MARKITDOWN_CMD,
    HEPAN_PYTHON: process.env.HEPAN_PYTHON,
    AUTO_PUBLISH_WORKSPACE: process.env.AUTO_PUBLISH_WORKSPACE,
  };
  const workspace = fs.mkdtempSync(
    path.join(os.tmpdir(), "autopublish-packaged-docx-"),
  );
  let result = null;
  let primaryError = null;
  try {
    delete process.env.MARKITDOWN_CMD;
    delete process.env.HEPAN_PYTHON;
    process.env.PATH = "";
    process.env.AUTO_PUBLISH_WORKSPACE = workspace;
    const { createClientMaterialStore } = require(
      path.join(root, "src", "content", "client-material-store.js"),
    );
    const clientDirectory = path.join(workspace, "clients", "customer-1");
    const cacheRoot = path.join(
      workspace,
      "local-state",
      "cache",
      "client-material",
    );
    fs.mkdirSync(clientDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(clientDirectory, "customer-material.docx"),
      (options && options.docxBuffer) || createMinimalDocx(),
    );
    const store = createClientMaterialStore({
      workspaceRoot: workspace,
      paths: {
        clients: path.join(workspace, "clients"),
        localState: path.join(workspace, "local-state"),
        clientMaterialCache: cacheRoot,
      },
    });
    const first = (await store.listMaterials("customer-1")).find(
      function (item) {
        return item.name === "customer-material.docx";
      },
    );
    const second = (await store.listMaterials("customer-1")).find(
      function (item) {
        return item.name === "customer-material.docx";
      },
    );
    if (
      !first ||
      first.status !== "ready" ||
      !first.content.includes("\u5ba2\u6237\u8d44\u6599\u6807\u9898") ||
      first.characterCount <= 0
    )
      throw packagedDocxError("Packaged DOCX did not become ready");
    if (
      !second ||
      second.status !== "ready" ||
      second.cacheHit !== true ||
      second.content !== first.content
    )
      throw packagedDocxError("Packaged DOCX cache was not reused");
    result = {
      status: "ready",
      cacheHit: second.cacheHit,
      characterCount: second.characterCount,
    };
  } catch (error) {
    primaryError =
      error && error.code === "PACKAGED_DOCX_RUNTIME_FAILED"
        ? error
        : packagedDocxError("Packaged DOCX runtime verification failed", error);
  }
  let cleanupError = null;
  try {
    if (previous.PATH === undefined) delete process.env.PATH;
    else process.env.PATH = previous.PATH;
    if (previous.MARKITDOWN_CMD === undefined)
      delete process.env.MARKITDOWN_CMD;
    else process.env.MARKITDOWN_CMD = previous.MARKITDOWN_CMD;
    if (previous.HEPAN_PYTHON === undefined) delete process.env.HEPAN_PYTHON;
    else process.env.HEPAN_PYTHON = previous.HEPAN_PYTHON;
    if (previous.AUTO_PUBLISH_WORKSPACE === undefined)
      delete process.env.AUTO_PUBLISH_WORKSPACE;
    else process.env.AUTO_PUBLISH_WORKSPACE = previous.AUTO_PUBLISH_WORKSPACE;
  } catch (_) {
    cleanupError = packagedDocxError(
      "Packaged DOCX environment cleanup failed",
    );
    cleanupError.code = "PACKAGED_DOCX_ENV_CLEANUP_FAILED";
  }
  try {
    fs.rmSync(workspace, { recursive: true, force: true });
  } catch (_) {
    cleanupError =
      cleanupError ||
      packagedDocxError("Packaged DOCX temporary cleanup failed");
    cleanupError.code = "PACKAGED_DOCX_TEMP_CLEANUP_FAILED";
  }
  if (primaryError) {
    if (cleanupError) primaryError.cleanupCode = cleanupError.code;
    throw primaryError;
  }
  if (cleanupError) throw cleanupError;
  return result;
}

if (require.main === module) {
  verifyPackagedRuntime(process.argv[2])
    .then(function (result) {
      console.log("Packaged DOCX runtime OK: " + JSON.stringify(result));
    })
    .catch(function (error) {
      const code =
        error &&
        typeof error.code === "string" &&
        /^PACKAGED_DOCX_[A-Z0-9_]{1,72}$/.test(error.code)
          ? error.code
          : "PACKAGED_DOCX_RUNTIME_FAILED";
      console.error(code);
      process.exitCode = 1;
    });
}

module.exports = { verifyPackagedRuntime, createMinimalDocx };
