const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createClientImageLibrary,
} = require("../src/content/client-image-library");
const { createClientImageScanCache } = require("../src/content/client-image-cache");

function png(width, height) {
  const value = Buffer.alloc(57);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(value, 0);
  value.writeUInt32BE(13, 8);
  value.write("IHDR", 12, 4, "ascii");
  value.writeUInt32BE(width, 16);
  value.writeUInt32BE(height, 20);
  value[24] = 8;
  value[25] = 6;
  value.writeUInt32BE(0, 33);
  value.write("IDAT", 37, 4, "ascii");
  value.writeUInt32BE(0, 45);
  value.write("IEND", 49, 4, "ascii");
  return value;
}

function jpeg(width, height) {
  return Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01,
    0x11,
    0x00,
    0x02,
    0x11,
    0x00,
    0x03,
    0x11,
    0x00,
    0xff,
    0xd9,
  ]);
}

function webp(width, height) {
  const value = Buffer.alloc(30);
  value.write("RIFF", 0, 4, "ascii");
  value.writeUInt32LE(22, 4);
  value.write("WEBP", 8, 4, "ascii");
  value.write("VP8X", 12, 4, "ascii");
  value.writeUInt32LE(10, 16);
  value.writeUIntLE(width - 1, 24, 3);
  value.writeUIntLE(height - 1, 27, 3);
  return value;
}

const LINK_UNAVAILABLE_CODES = new Set([
  "EPERM",
  "EACCES",
  "ENOTSUP",
  "EOPNOTSUPP",
  "EINVAL",
  "ENOSYS",
]);

function createLinkOrSkip(t, target, link, type) {
  try {
    fs.symlinkSync(target, link, type);
    return true;
  } catch (error) {
    if (LINK_UNAVAILABLE_CODES.has(error.code)) {
      t.skip("links are unavailable: " + error.code);
      return false;
    }
    throw error;
  }
}

describe("client image library", function () {
  let workspaceRoot;
  let clientOne;
  let clientTwo;

  beforeEach(function () {
    workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "client-image-library-"),
    );
    clientOne = path.join(workspaceRoot, "clients", "client-one");
    clientTwo = path.join(workspaceRoot, "clients", "client-two");
    fs.mkdirSync(path.join(clientOne, "nested", "deeper"), { recursive: true });
    fs.mkdirSync(clientTwo, { recursive: true });
    fs.writeFileSync(
      path.join(clientOne, "client.json"),
      JSON.stringify({ id: "client-one", name: "One" }),
    );
    fs.writeFileSync(
      path.join(clientTwo, "client.json"),
      JSON.stringify({ id: "client-two", name: "Two" }),
    );
  });

  afterEach(function () {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("recursively discovers supported images and exposes only stable safe references", function () {
    fs.writeFileSync(path.join(clientOne, "cover.JPG"), jpeg(2, 1));
    fs.writeFileSync(path.join(clientOne, "nested", "second.png"), png(3, 4));
    fs.writeFileSync(
      path.join(clientOne, "nested", "deeper", "third.webp"),
      webp(5, 6),
    );
    fs.writeFileSync(path.join(clientOne, "ignored.gif"), Buffer.from("gif"));
    fs.writeFileSync(path.join(clientOne, "notes.md"), "not an image");
    fs.writeFileSync(path.join(clientTwo, "other.png"), png(7, 8));

    const library = createClientImageLibrary({ workspaceRoot: workspaceRoot });
    const snapshot = library.scan("client-one");

    assert.deepEqual(
      snapshot.images.map(function (item) {
        return item.relativePath;
      }),
      ["cover.JPG", "nested/deeper/third.webp", "nested/second.png"],
    );
    assert.deepEqual(
      snapshot.images.map(function (item) {
        return [item.mimeType, item.width, item.height];
      }),
      [
        ["image/jpeg", 2, 1],
        ["image/webp", 5, 6],
        ["image/png", 3, 4],
      ],
    );
    assert.equal(snapshot.summary.availableImages, 3);
    assert.ok(
      snapshot.images.every(function (item) {
        return /^client-image:[A-Za-z0-9_-]+$/.test(item.id);
      }),
    );
    assert.doesNotMatch(
      JSON.stringify(snapshot),
      new RegExp(workspaceRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  });

  it("skips damaged, unsupported, and linked files with safe diagnostics", function (t) {
    const outside = fs.mkdtempSync(
      path.join(os.tmpdir(), "client-image-outside-"),
    );
    try {
      fs.writeFileSync(
        path.join(clientOne, "damaged.png"),
        Buffer.from("not a png"),
      );
      fs.writeFileSync(
        path.join(clientOne, "unsupported.gif"),
        Buffer.from("gif"),
      );
      fs.writeFileSync(path.join(outside, "outside.png"), png(9, 9));
      if (
        !createLinkOrSkip(
          t,
          path.join(outside, "outside.png"),
          path.join(clientOne, "linked.png"),
          "file",
        )
      )
        return;
      if (
        !createLinkOrSkip(
          t,
          outside,
          path.join(clientOne, "linked-directory"),
          process.platform === "win32" ? "junction" : "dir",
        )
      )
        return;

      const library = createClientImageLibrary({
        workspaceRoot: workspaceRoot,
      });
      const snapshot = library.scan("client-one");

      assert.deepEqual(snapshot.images, []);
      assert.deepEqual(
        snapshot.diagnostics
          .map(function (item) {
            return item.code;
          })
          .sort(),
        [
          "IMAGE_FORMAT_INVALID",
          "IMAGE_FORMAT_UNSUPPORTED",
          "IMAGE_SYMLINK_SKIPPED",
          "IMAGE_SYMLINK_SKIPPED",
        ].sort(),
      );
      assert.ok(
        snapshot.diagnostics.every(function (item) {
          return !item.path || !path.isAbsolute(item.path);
        }),
      );
      assert.doesNotMatch(
        JSON.stringify(snapshot),
        new RegExp(outside.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it("skips oversized image candidates before reading their contents", function () {
    const oversized = path.join(clientOne, "oversized.png");
    const descriptor = fs.openSync(oversized, "w");
    try {
      fs.writeSync(descriptor, png(1, 1), 0, 57, 0);
      fs.ftruncateSync(descriptor, 64 * 1024 * 1024 + 1);
    } finally {
      fs.closeSync(descriptor);
    }

    const snapshot = createClientImageLibrary({ workspaceRoot }).scan("client-one");

    assert.deepEqual(snapshot.images, []);
    assert.equal(snapshot.diagnostics[0].code, "IMAGE_FILE_TOO_LARGE");
  });

  it("selects at most five without consuming images and keeps zero-image work text-only", function () {
    fs.writeFileSync(path.join(clientOne, "one.png"), png(1, 1));
    fs.writeFileSync(path.join(clientOne, "two.png"), png(2, 2));
    fs.writeFileSync(path.join(clientOne, "three.png"), png(3, 3));
    const library = createClientImageLibrary({ workspaceRoot: workspaceRoot });

    const firstArticle = library.selectImages("client-one", {
      count: 3,
      random: function () {
        return 0;
      },
    });
    assert.equal(firstArticle.requestedCount, 3);
    assert.equal(firstArticle.selectedCount, 3);
    assert.equal(
      new Set(
        firstArticle.images.map(function (item) {
          return item.id;
        }),
      ).size,
      3,
    );
    assert.equal(firstArticle.shortfall, 0);
    assert.equal(firstArticle.textOnly, false);

    const secondArticle = library.selectImages("client-one", {
      count: 5,
      random: function () {
        return 0;
      },
    });
    assert.equal(secondArticle.selectedCount, 3);
    assert.equal(secondArticle.shortfall, 2);
    assert.equal(secondArticle.images[0].id, firstArticle.images[0].id);

    const defaultCount = library.selectImages("client-one", {
      random: function () {
        return 0;
      },
    });
    assert.equal(defaultCount.requestedCount, 1);
    assert.equal(defaultCount.selectedCount, 1);

    const textOnly = library.selectImages("client-one", {
      count: 0,
      random: function () {
        throw new Error("random must not be called");
      },
    });
    assert.deepEqual(textOnly.images, []);
    assert.equal(textOnly.textOnly, true);
    assert.throws(
      function () {
        library.selectImages("client-one", { count: 6 });
      },
      function (error) {
        return error.code === "CLIENT_IMAGE_COUNT_INVALID";
      },
    );
  });

  it("caches batch scans per client and invalidates them explicitly", function () {
    const calls = [];
    const scanner = {
      scan: function (client) {
        calls.push(client.clientId);
        return {
          clientId: client.clientId,
          revision: "scan-" + String(calls.length),
          scannedAt: "2026-08-05T00:00:00.000Z",
          images: [],
          diagnostics: [],
          summary: {
            directoriesVisited: 1,
            filesExamined: 0,
            supportedCandidates: 0,
            availableImages: 0,
            skippedFiles: 0,
            diagnosticCount: 0,
          },
        };
      },
    };
    const library = createClientImageLibrary({
      workspaceRoot: workspaceRoot,
      scanner: scanner,
    });

    library.scanMany(["client-one", "client-one", "client-two"]);
    assert.deepEqual(calls, ["client-one", "client-two"]);
    assert.equal(library.invalidate("client-one"), 1);
    library.scan("client-one");
    assert.deepEqual(calls, ["client-one", "client-two", "client-one"]);
    assert.equal(library.invalidate(), 2);

    const secondLibrary = createClientImageLibrary({
      workspaceRoot: workspaceRoot,
      scanner: scanner,
    });
    secondLibrary.scan("client-one");
    assert.deepEqual(calls, [
      "client-one",
      "client-two",
      "client-one",
      "client-one",
    ]);
  });

  it("bounds multi-client scans with LRU eviction while keeping cache instances isolated", function () {
    const clientThree = path.join(workspaceRoot, "clients", "client-three");
    fs.mkdirSync(clientThree, { recursive: true });
    fs.writeFileSync(
      path.join(clientThree, "client.json"),
      JSON.stringify({ id: "client-three", name: "Three" }),
    );
    const calls = [];
    const scanner = {
      scan: function (client) {
        calls.push(client.clientId);
        return {
          clientId: client.clientId,
          revision: "scan-" + String(calls.length),
          scannedAt: "2026-08-06T00:00:00.000Z",
          images: [],
          diagnostics: [],
          summary: {
            directoriesVisited: 1,
            filesExamined: 0,
            supportedCandidates: 0,
            availableImages: 0,
            skippedFiles: 0,
            diagnosticCount: 0,
          },
        };
      },
    };
    const firstCache = createClientImageScanCache({ capacity: 2 });
    const firstLibrary = createClientImageLibrary({
      workspaceRoot,
      scanner,
      cache: firstCache,
    });

    firstLibrary.scan("client-one");
    firstLibrary.scan("client-two");
    firstLibrary.scan("client-one");
    firstLibrary.scan("client-three");
    assert.equal(firstCache.size, 2);
    assert.deepEqual(calls, ["client-one", "client-two", "client-three"]);

    firstLibrary.scan("client-two");
    assert.deepEqual(calls, ["client-one", "client-two", "client-three", "client-two"]);

    const secondCache = createClientImageScanCache({ capacity: 1 });
    const secondLibrary = createClientImageLibrary({
      workspaceRoot,
      scanner,
      cache: secondCache,
    });
    secondLibrary.scan("client-one");
    assert.equal(firstCache.size, 2);
    assert.equal(secondCache.size, 1);
    assert.equal(firstLibrary.invalidate("client-three"), 1);
    assert.equal(firstCache.size, 1);
    assert.equal(secondCache.size, 1);
  });

  it("scales a large image directory without rescanning it for every task", function () {
    const imageBytes = png(10, 10);
    for (let index = 0; index < 1200; index += 1) {
      fs.writeFileSync(
        path.join(
          clientOne,
          "image-" + String(index).padStart(4, "0") + ".png",
        ),
        imageBytes,
      );
    }
    let directoryReads = 0;
    const fsApi = Object.assign({}, fs, {
      readdirSync: function () {
        directoryReads += 1;
        return fs.readdirSync.apply(fs, arguments);
      },
    });
    const library = createClientImageLibrary({
      workspaceRoot: workspaceRoot,
      fs: fsApi,
    });

    assert.equal(library.scan("client-one").images.length, 1200);
    const firstScanReads = directoryReads;
    for (let index = 0; index < 20; index += 1) {
      assert.equal(
        library.selectImages("client-one", {
          count: 1,
          random: function () {
            return 0;
          },
        }).selectedCount,
        1,
      );
    }
    assert.equal(directoryReads, firstScanReads);
    library.scan("client-one", { refresh: true });
    assert.equal(directoryReads, firstScanReads * 2);
  });

  it("resolves a stable reference only after rechecking the current client boundary", function () {
    const filename = path.join(clientOne, "nested", "resolve-me.png");
    fs.writeFileSync(filename, png(11, 12));
    const library = createClientImageLibrary({ workspaceRoot: workspaceRoot });
    const image = library.scan("client-one").images.find(function (item) {
      return item.name === "resolve-me.png";
    });

    const resolved = library.resolveImage("client-one", image.id);
    assert.equal(resolved.relativePath, "nested/resolve-me.png");
    assert.equal(resolved.filePath, filename);
    assert.equal(fs.readFileSync(resolved.filePath).equals(png(11, 12)), true);
    assert.throws(
      function () {
        library.resolveImage("client-one", "client-image:Li4vb3V0c2lkZS5wbmc");
      },
      function (error) {
        return error.code === "CLIENT_IMAGE_NOT_FOUND";
      },
    );
    assert.doesNotMatch(
      JSON.stringify(library.scan("client-one")),
      new RegExp(workspaceRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  });
});
